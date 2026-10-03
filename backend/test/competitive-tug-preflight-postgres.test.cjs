// Preparatory diagnostics only. No TUG verifier/admission or real settlement.
require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const {
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
let db, competitive, engine, sub;
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  db = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
  );
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  const tema = await db.tema.create({
    data: {
      nombre: 'Owned preflight',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Owned preflight',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  // A disposable marker table, NOT ledger/balances or a simulated payment.
  await db.$executeRaw`CREATE TABLE "CompetitiveTugProtocolProbe" (match_id uuid, user_id uuid, observation text, PRIMARY KEY(match_id,user_id))`;
});
after(async () => {
  if (db) {
    await db.$executeRaw`DROP TABLE "CompetitiveTugProtocolProbe"`;
    await db.$disconnect();
  }
});
async function fixture() {
  const users = await Promise.all(
    [0, 1].map(() =>
      db.usuario.create({
        data: {
          nombre: 'Owned preflight',
          correo: `${randomUUID()}@example.invalid`,
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 777,
        },
      }),
    ),
  );
  const questions = [];
  for (let i = 0; i < 4; i++)
    questions.push(
      await db.pregunta.create({
        data: {
          subtemaId: sub.id,
          enunciado: `Preflight ${i}`,
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: [true, false].map((esCorrecta) => ({
              texto: String(esCorrecta),
              esCorrecta,
            })),
          },
        },
        include: { respuestas: true },
      }),
    );
  const [clock] =
    await db.$queryRaw`SELECT timezone('UTC',clock_timestamp())::timestamp(3) AS at`;
  let m = await db.partidaTiraAfloja.create({
    data: {
      prepararEvidencia: true,
      presenciaVersion: 1,
      jugadorAId: users[0].id,
      expiraEn: new Date(clock.at.getTime() + 120000),
      preguntas: {
        create: questions.map((q, i) => ({
          orden: i + 1,
          preguntaId: q.id,
          opcionesOrden: q.respuestas.map((r) => r.id),
        })),
      },
    },
  });
  await db.partidaTiraAfloja.update({
    where: { id: m.id },
    data: { estado: 'PREPARANDO', jugadorBId: users[1].id },
  });
  await engine.marcarListo(users[0].id, m.id);
  await engine.marcarListo(users[1].id, m.id);
  m = await db.partidaTiraAfloja.findUniqueOrThrow({ where: { id: m.id } });
  return { m, users };
}
async function noPayments(f) {
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.m.id },
    }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: {
        gameId: 'TUG_OF_WAR',
        usuarioId: { in: f.users.map((u) => u.id) },
      },
    }),
    0,
  );
  for (const u of f.users)
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      777,
    );
}
const options = { maxWait: 10000, timeout: 20000 };

test('TUG preflight: actual per-user settlement locks then pair verifier locks reproduce a PostgreSQL deadlock', async () => {
  const f = await fixture();
  let arrivals = 0,
    release;
  const bothLocked = new Promise((resolve) => {
    release = resolve;
  });
  const results = await Promise.allSettled(
    f.users.map((u) =>
      db.$transaction(async (tx) => {
        // Invoke the real current service primitives, never install a test verifier.
        await competitive.lock(tx, `source:owned-probe-${f.m.id}-${u.id}`);
        await competitive.lockStudent(tx, u.id);
        if (++arrivals === 2) release();
        await bothLocked;
        await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      }, options),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const failure = results.find((r) => r.status === 'rejected').reason;
  // Prisma 5.22 exposes PostgreSQL SQLSTATE for this $queryRaw P2010 path.
  // Do not accept a timeout or an unrelated SQL failure as the deadlock proof.
  assert.equal(failure.code, 'P2010');
  assert.equal(failure.meta?.code, '40P01');
  assert.match(
    failure.message,
    /deadlock detected|write conflict or a deadlock/i,
  );
  console.log(
    JSON.stringify({
      diagnostic: 'current-single-user-before-pair-deadlock',
      code: failure.code,
      sqlCode: failure.meta?.code,
    }),
  );
  await noPayments(f);
});

test('TUG preflight: shared idempotency key then ordered pair serializes both callers; probe retries and restart do not duplicate markers', async () => {
  const f = await fixture();
  const probe = async () =>
    db.$transaction(async (tx) => {
      await competitive.lock(tx, `source:owned-pair-${f.m.id}`);
      await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      return tx.$executeRaw`INSERT INTO "CompetitiveTugProtocolProbe" SELECT ${f.m.id}::uuid,id,'pair-lock-only' FROM "Usuario" WHERE id IN (${f.users[0].id}::uuid,${f.users[1].id}::uuid) ON CONFLICT DO NOTHING`;
    }, options);
  assert.deepEqual((await Promise.all([probe(), probe()])).sort(), [0, 2]);
  assert.equal(await probe(), 0);
  const restarted = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  try {
    await restarted.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      assert.equal(
        (
          await tx.$queryRaw`SELECT * FROM "CompetitiveTugProtocolProbe" WHERE match_id=${f.m.id}::uuid`
        ).length,
        2,
      );
    }, options);
  } finally {
    await restarted.$disconnect();
  }
  await noPayments(f);
});

test('TUG preflight: an intermediate failure rolls back every probe marker, not a partial pair', async () => {
  const f = await fixture();
  await assert.rejects(
    db.$transaction(async (tx) => {
      await competitive.lock(tx, `source:owned-pair-${f.m.id}`);
      await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      await tx.$executeRaw`INSERT INTO "CompetitiveTugProtocolProbe" VALUES(${f.m.id}::uuid,${f.users[0].id}::uuid,'first-only')`;
      throw new Error('owned intermediate failure');
    }, options),
    /owned intermediate failure/,
  );
  assert.equal(
    (
      await db.$queryRaw`SELECT * FROM "CompetitiveTugProtocolProbe" WHERE match_id=${f.m.id}::uuid`
    ).length,
    0,
  );
  await noPayments(f);
});

test('TUG preflight: terminal parent alone can be forged by privileged SQL and cannot authorize XP', async () => {
  const f = await fixture();
  await db.partidaTiraAfloja.update({
    where: { id: f.m.id },
    data: {
      estado: 'FINALIZADA',
      resultado: 'JUGADOR_A',
      ganadorId: f.users[0].id,
      fechaFinalizacion: new Date(),
    },
  });
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.m.id } }),
    0,
  );
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  for (const u of f.users)
    await assert.rejects(
      competitive.settle({
        sourceType: 'TUG_MATCH',
        sourceId: f.m.id,
        participantId: u.id,
      }),
      /SOURCE_NOT_INTEGRATED/,
    );
  await noPayments(f);
});

test('TUG preflight: pair-locked observer racing the real explicit close sees no partial terminal evidence', async () => {
  const f = await fixture();
  const observe = () =>
    db.$transaction(async (tx) => {
      await competitive.lock(tx, `source:owned-pair-${f.m.id}`);
      await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      const m = await tx.partidaTiraAfloja.findUniqueOrThrow({
        where: { id: f.m.id },
      });
      const abandoned = await tx.tugAbandonment.findMany({
        where: { matchId: f.m.id },
      });
      if (m.estado === 'ACTIVA') {
        assert.equal(m.ganadorId, null);
        assert.equal(m.fechaFinalizacion, null);
        assert.equal(abandoned.length, 0);
      } else {
        assert.equal(m.estado, 'CANCELADA');
        assert.equal(m.ganadorId, null);
        assert.ok(m.fechaFinalizacion);
        assert.equal(abandoned.length, 1);
        assert.equal(abandoned[0].userId, f.users[0].id);
        assert.equal(abandoned[0].reason, 'EXPLICIT');
      }
      return m.estado;
    }, options);
  await Promise.all([engine.abandonar(f.users[0].id, f.m.id), observe()]);
  assert.equal(await observe(), 'CANCELADA');
  await noPayments(f);
});

test('TUG preflight: early deferred validation is not proof of commit visibility before the round deadline', async () => {
  const f = await fixture();
  await db.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM (${f.m.rondaIniciaEn}::timestamp-timezone('UTC',clock_timestamp())))))::text`;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
    const [recorded] =
      await tx.$queryRaw`SELECT tug_record_presented_round(${f.m.id}::uuid) AS added`;
    assert.equal(recorded.added, true);
    await tx.$executeRaw`SET CONSTRAINTS tug_presented_pair IMMEDIATE`;
    assert.equal(
      await db.tiraAflojaRondaPresentada.count({
        where: { partidaId: f.m.id },
      }),
      0,
    );
    await tx.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM (${f.m.rondaVenceEn}::timestamp-timezone('UTC',clock_timestamp())))))::text`;
    assert.equal(
      await db.tiraAflojaRondaPresentada.count({
        where: { partidaId: f.m.id },
      }),
      0,
    );
  }, options);
  const [visible] =
    await db.$queryRaw`SELECT count(*)::int AS rows,timezone('UTC',clock_timestamp())>=${f.m.rondaVenceEn}::timestamp AS late FROM "TiraAflojaRondaPresentada" WHERE "partidaId"=${f.m.id}::uuid`;
  assert.equal(visible.rows, 2);
  assert.equal(visible.late, true);
  console.log(
    'DIAGNOSTIC: early SET CONSTRAINTS can validate before a later COMMIT; these rows are not certified competitive R.',
  );
  for (const u of f.users)
    await assert.rejects(
      competitive.settle({
        sourceType: 'TUG_MATCH',
        sourceId: f.m.id,
        participantId: u.id,
      }),
      /SOURCE_NOT_INTEGRATED/,
    );
  await noPayments(f);
});

test('TUG preflight: local WAL settings and crash recovery are separate from production certification', async () => {
  const [settings] =
    await db.$queryRaw`SELECT current_setting('fsync') AS fsync,current_setting('synchronous_commit') AS synchronous_commit,current_setting('full_page_writes') AS full_page_writes,current_setting('wal_level') AS wal_level`;
  assert.equal(settings.fsync, 'on');
  assert.equal(settings.synchronous_commit, 'on');
  assert.equal(settings.full_page_writes, 'on');
  console.log(
    JSON.stringify({
      diagnostic: 'owned-local-wal-settings-only',
      ...settings,
    }),
  );
});
