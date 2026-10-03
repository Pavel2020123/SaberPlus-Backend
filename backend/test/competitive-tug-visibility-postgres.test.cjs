require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
const {
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, writer, reader, engine, sub, competitive;
const options = { maxWait: 10000, timeout: 20000 };
function client() {
  const url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit', '1');
  return new PrismaClient({ datasources: { db: { url: url.toString() } } });
}
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  db = client();
  writer = client();
  reader = client();
  const pids = await Promise.all(
    [db, writer, reader].map(
      (c) => c.$queryRaw`SELECT pg_backend_pid() AS pid`,
    ),
  );
  assert.equal(new Set(pids.map((p) => p[0].pid)).size, 3);
  console.log(
    JSON.stringify({
      diagnostic: 'independent-visibility-backends',
      pids: pids.map((p) => p[0].pid),
    }),
  );
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
  );
  const tema = await db.tema.create({
    data: {
      nombre: 'Owned visibility',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Owned visibility',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
});
after(async () => {
  await engine?.onModuleDestroy();
  await Promise.all(
    [db, writer, reader].filter(Boolean).map((c) => c.$disconnect()),
  );
});
async function fixture(version = 1) {
  const users = [];
  for (let i = 0; i < 2; i++)
    users.push(
      await db.usuario.create({
        data: {
          nombre: 'Owned visibility',
          correo: `${randomUUID()}@example.invalid`,
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 777,
        },
      }),
    );
  const questions = [];
  for (let i = 0; i < 4; i++)
    questions.push(
      await db.pregunta.create({
        data: {
          subtemaId: sub.id,
          enunciado: `Visibility ${i}`,
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
      certificacionRVersion: version,
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
  return { m, users, questions };
}
async function start(c, f) {
  await c.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ((SELECT "rondaIniciaEn" FROM "PartidaTiraAfloja" WHERE id=${f.m.id}::uuid)-timezone('UTC',clock_timestamp())))))::text`;
}
async function deadline(c, f) {
  await c.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ((SELECT "rondaVenceEn" FROM "PartidaTiraAfloja" WHERE id=${f.m.id}::uuid)-timezone('UTC',clock_timestamp())))))::text`;
  const [t] =
    await c.$queryRaw`SELECT timezone('UTC',clock_timestamp())>="rondaVenceEn" AS late FROM "PartidaTiraAfloja" WHERE id=${f.m.id}::uuid`;
  assert.equal(t.late, true);
}
async function record(c, f) {
  return c.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
    const [r] =
      await tx.$queryRaw`SELECT tug_record_presented_round(${f.m.id}::uuid) AS added`;
    return r.added;
  }, options);
}
async function certify(c, f) {
  const [r] =
    await c.$queryRaw`SELECT tug_certify_presented_round(${f.m.id}::uuid,1) AS certified`;
  return r.certified;
}
async function noXP(f) {
  for (const u of f.users)
    await assert.rejects(
      competitive.settle({
        sourceType: 'TUG_MATCH',
        sourceId: f.m.id,
        participantId: u.id,
      }),
      /SOURCE_NOT_INTEGRATED/,
    );
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
async function proof(f) {
  const [r] =
    await reader.$queryRaw`SELECT c.*, c."observadaEn"<c."limiteEn" AS timely,
    c."origenPid"<>c."testigoPid" AS independent, pg_xact_status(c."origenXid"::xid8) AS status,
    (SELECT count(*)::int FROM "TiraAflojaRondaPresentada" r WHERE r."partidaId"=c."partidaId" AND r.ronda=c.ronda) AS pair
    FROM "TugRoundVisibility" c WHERE c."partidaId"=${f.m.id}::uuid`;
  assert.ok(r);
  assert.equal(r.timely, true);
  assert.equal(r.independent, true);
  assert.equal(r.status, 'committed');
  assert.equal(r.pair, 2);
  return r;
}

test('TUG visibility: committed pair observed timely by independent backends; two instances/retries share one immutable certificate', async () => {
  const f = await fixture();
  await start(writer, f);
  assert.equal(await record(writer, f), true);
  assert.equal(await record(writer, f), false);
  assert.equal(await certify(writer, f), false); // Same backend is not the witness.
  const outcomes = await Promise.all([certify(reader, f), certify(db, f)]);
  assert.deepEqual(outcomes, [true, true]);
  const original = await proof(f);
  assert.equal(await certify(reader, f), true);
  assert.deepEqual(await proof(f), original);
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    1,
  );
  await assert.rejects(
    db.$executeRaw`UPDATE "TugRoundVisibility" SET "observadaEn"="observadaEn" WHERE "partidaId"=${f.m.id}::uuid`,
    /append only/,
  );
  await assert.rejects(
    db.$executeRaw`DELETE FROM "TugRoundVisibility" WHERE "partidaId"=${f.m.id}::uuid`,
    /append only/,
  );
  const publicView = await engine.obtener(f.users[0].id, f.m.id);
  assert.doesNotMatch(
    JSON.stringify(publicView),
    /origenXid|origenPid|testigoXid|testigoPid|certificacionesR|snapshotInicial/,
  );
  await noXP(f);
});

test('TUG visibility: early IMMEDIATE plus late source COMMIT cannot certify; pending/savepoint writes cannot self-certify', async () => {
  const f = await fixture();
  await start(writer, f);
  await writer.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
    await tx.$executeRaw`SAVEPOINT origin_probe`;
    assert.equal(
      (
        await tx.$queryRaw`SELECT tug_record_presented_round(${f.m.id}::uuid) AS added`
      )[0].added,
      true,
    );
    await tx.$executeRaw`RELEASE SAVEPOINT origin_probe`;
    assert.equal(await certify(tx, f), false);
    const [origin] =
      await tx.$queryRaw`SELECT "origenXid"=pg_current_xact_id()::text AS top, pg_xact_status("origenXid"::xid8) AS status FROM "TiraAflojaRondaPresentada" WHERE "partidaId"=${f.m.id}::uuid LIMIT 1`;
    assert.equal(origin.top, true);
    assert.equal(origin.status, 'in progress');
    assert.equal(
      await reader.tiraAflojaRondaPresentada.count({
        where: { partidaId: f.m.id },
      }),
      0,
    );
    await tx.$executeRaw`SET CONSTRAINTS tug_presented_pair IMMEDIATE`;
    await deadline(tx, f);
    assert.equal(
      await reader.tiraAflojaRondaPresentada.count({
        where: { partidaId: f.m.id },
      }),
      0,
    );
  }, options);
  assert.equal(
    await reader.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.m.id },
    }),
    2,
  );
  assert.equal(await certify(reader, f), false);
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    0,
  );
  // Forging a past observation by direct INSERT is also rejected by the guard.
  await assert.rejects(
    reader.$executeRaw`INSERT INTO "TugRoundVisibility" VALUES(${f.m.id}::uuid,1,'1',1,'2',2,'2000-01-01','2001-01-01')`,
    (error) => {
      assert.equal(error.code, 'P2010');
      assert.equal(error.meta.code, 'PT001');
      assert.match(error.message, /exceeds deadline/);
      return true;
    },
  );
  assert.equal(await record(writer, f), false);
  await noXP(f);
});

test('TUG visibility: restart before source COMMIT recovers only actual committed evidence; aborted witness leaves no certificate', async () => {
  const f = await fixture();
  await start(writer, f);
  const dying = client();
  let writerTerminated = false;
  try {
    await assert.rejects(
      dying.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
        await tx.$queryRaw`SELECT tug_record_presented_round(${f.m.id}::uuid)`;
        const [session] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
        // Only this test's writer connection, on the validated owned database.
        const [termination] =
          await reader.$queryRaw`SELECT pg_terminate_backend(${session.pid}::integer) AS terminated`;
        assert.equal(termination.terminated, true);
        writerTerminated = true;
        await tx.$queryRaw`SELECT 1 AS cannot_continue`;
      }, options),
    );
  } finally {
    await dying.$disconnect();
  }
  assert.equal(
    writerTerminated,
    true,
    'An earlier SQL error cannot substitute for terminating the owned writer',
  );
  assert.equal(
    await reader.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.m.id },
    }),
    0,
  );
  assert.equal(await record(writer, f), true);
  await assert.rejects(
    reader.$transaction(async (tx) => {
      assert.equal(await certify(tx, f), true);
      throw new Error('owned witness crash');
    }, options),
    /owned witness crash/,
  );
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    0,
  );
  const restarted = new TiraAflojaService(
    db,
    new TiraAflojaRealtimePublisher(),
  );
  try {
    await restarted.procesarPartidasVencidas();
    await proof(f);
  } finally {
    await restarted.onModuleDestroy();
  }
  await noXP(f);
});

test('TUG visibility: timely source COMMIT without a committed witness is unknown after deadline, never backfilled on restart', async () => {
  const f = await fixture();
  await start(writer, f);
  assert.equal(await record(writer, f), true);
  await deadline(reader, f);
  const restarted = client();
  try {
    assert.equal(await certify(restarted, f), false);
  } finally {
    await restarted.$disconnect();
  }
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    0,
  );
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.m.id } }),
    2,
  );
  await noXP(f);
});

test('TUG visibility: a witness observing already committed R timely may commit its own certificate later; no invented COMMIT timestamp', async () => {
  const f = await fixture();
  await start(writer, f);
  assert.equal(await record(writer, f), true);
  await reader.$transaction(async (tx) => {
    assert.equal(await certify(tx, f), true);
    assert.equal(
      await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
      0,
    );
    await deadline(tx, f);
  }, options);
  const original = await proof(f);
  const [now] =
    await db.$queryRaw`SELECT timezone('UTC',clock_timestamp())>="rondaVenceEn" AS late FROM "PartidaTiraAfloja" WHERE id=${f.m.id}::uuid`;
  assert.equal(now.late, true);
  assert.equal(await certify(db, f), true); // Exact retry only, no new observation.
  assert.deepEqual(await proof(f), original);
  await noXP(f);
});

test('TUG visibility: observer waiting for locks until deadline cannot reuse its transaction-start clock', async () => {
  const f = await fixture();
  await start(writer, f);
  assert.equal(await record(writer, f), true);
  let locked, waiting;
  const ready = new Promise((resolve) => {
    locked = resolve;
  });
  await Promise.all([
    db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT tug_presence_lock(${f.m.id}::uuid)::text`;
      locked();
      // Observe a genuine PostgreSQL wait, not an arbitrary delay.
      const [pid] = await reader.$queryRaw`SELECT pg_backend_pid() AS pid`;
      waiting = certify(reader, f);
      while (
        !(
          await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE pid=${pid.pid} AND wait_event_type='Lock') AS blocked`
        )[0].blocked
      ) {
        await tx.$queryRaw`SELECT pg_sleep(0.01)::text`;
      }
      await deadline(tx, f);
    }, options),
    ready.then(async () => {
      /* holder drives the observer after its lock */
    }),
  ]);
  assert.equal(await waiting, false);
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    0,
  );
  await noXP(f);
});

test('TUG visibility: historical prepared matches keep NULL origins and cannot enroll retroactively; existing explicit sports close preserved', async () => {
  const f = await fixture(null);
  await start(writer, f);
  assert.equal(await record(writer, f), true);
  assert.equal(await certify(reader, f), false);
  const rows = await db.tiraAflojaRondaPresentada.findMany({
    where: { partidaId: f.m.id },
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.origenXid === null && r.origenPid === null));
  await assert.rejects(
    db.partidaTiraAfloja.update({
      where: { id: f.m.id },
      data: { certificacionRVersion: 1 },
    }),
    /retroactive|Immutable/,
  );
  await engine.abandonar(f.users[0].id, f.m.id);
  const closed = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: f.m.id },
  });
  assert.equal(closed.estado, 'CANCELADA');
  assert.equal(closed.ganadorId, null);
  assert.equal(
    (await db.tugAbandonment.findMany({ where: { matchId: f.m.id } }))[0]
      .reason,
    'EXPLICIT',
  );
  await noXP(f);
});

test('TUG visibility: real service post-COMMIT witness, recovery and sports abandonment preserve certified R with zero XP', async () => {
  const f = await fixture();
  await start(db, f);
  // The service creates R, commits it, then uses its separate witness pool.
  await engine.procesarEstado(f.m.id);
  const original = await proof(f);
  await engine.procesarEstado(f.m.id);
  assert.deepEqual(await proof(f), original);
  await engine.abandonar(f.users[0].id, f.m.id);
  assert.equal(
    (await db.partidaTiraAfloja.findUniqueOrThrow({ where: { id: f.m.id } }))
      .estado,
    'CANCELADA',
  );
  assert.deepEqual(await proof(f), original);
  await noXP(f);
});

test('TUG visibility: normal sports completion with authenticated answers retains atomic certified rounds without payments', async () => {
  const f = await fixture();
  const instance = randomUUID();
  for (const u of f.users) {
    const connection = randomUUID();
    await db.$queryRaw`SELECT tug_presence_connect(${f.m.id}::uuid,${u.id}::uuid,${connection}::uuid,${instance}::uuid,NULL::timestamp,NULL::timestamp)`;
  }
  for (let i = 0; i < f.questions.length; i++) {
    await start(db, f);
    const m = await db.partidaTiraAfloja.findUniqueOrThrow({
      where: { id: f.m.id },
    });
    if (m.estado !== 'ACTIVA') break;
    const q = f.questions[m.rondaActual - 1];
    for (const u of f.users)
      await engine.responder(u.id, f.m.id, {
        ronda: m.rondaActual,
        preguntaId: q.id,
        respuestaId: q.respuestas.find((r) => r.esCorrecta).id,
        idempotencyKey: randomUUID(),
      });
    const after = await db.partidaTiraAfloja.findUniqueOrThrow({
      where: { id: f.m.id },
    });
    if (after.estado !== 'ACTIVA') break;
  }
  const terminal = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: f.m.id },
  });
  assert.equal(terminal.estado, 'FINALIZADA');
  assert.ok(['JUGADOR_A', 'JUGADOR_B', 'EMPATE'].includes(terminal.resultado));
  const counts =
    await db.$queryRaw`SELECT "usuarioId",count(*)::int AS r FROM "TiraAflojaRondaPresentada" WHERE "partidaId"=${f.m.id}::uuid GROUP BY "usuarioId"`;
  assert.equal(counts.length, 2);
  assert.equal(counts[0].r, counts[1].r);
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }),
    counts[0].r,
  );
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  await noXP(f);
});

test('TUG visibility: response transaction creates R and certifies immediately after COMMIT before another sports transaction', async () => {
  const f = await fixture();
  const u = f.users[0];
  await db.$queryRaw`SELECT tug_presence_connect(${f.m.id}::uuid,${u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,NULL::timestamp,NULL::timestamp)`;
  const original = engine.procesarEstado;
  let calls = 0;
  engine.procesarEstado = async function(id) {
    if (calls++ === 0) {
      await original.call(this, id);
      assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: id } }), 0);
      // Delay the response's next transaction to the real PostgreSQL start,
      // without creating R or calling an auxiliary state processor.
      await start(db, f);
    } else {
      await proof(f);
      await original.call(this, id);
    }
  };
  try {
    const q = f.questions[0];
    await engine.responder(u.id, f.m.id, { ronda: 1, preguntaId: q.id,
      respuestaId: q.respuestas.find((r) => r.esCorrecta).id, idempotencyKey: randomUUID() });
    assert.ok(calls >= 2);
    await proof(f);
  } finally { engine.procesarEstado = original; }
  await noXP(f);
});

test('TUG visibility: public response succeeds after sports COMMIT despite real witness SQL failure; recovery certifies within original deadline', async () => {
  const f = await fixture();
  const u = f.users[0];
  await db.$queryRaw`SELECT tug_presence_connect(${f.m.id}::uuid,${u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,NULL::timestamp,NULL::timestamp)`;
  await start(db, f);
  const original = engine.visibilityWitness.certify;
  const originalLog = engine.log.error;
  const logs = [];
  engine.log.error = (message) => logs.push(JSON.parse(message));
  engine.visibilityWitness.certify = async () => reader.$queryRaw`SELECT 1/0`;
  try {
    const q = f.questions[0];
    const payload = { ronda: 1, preguntaId: q.id,
      respuestaId: q.respuestas.find((r) => r.esCorrecta).id, idempotencyKey: randomUUID() };
    await engine.responder(u.id, f.m.id, payload);
    await engine.responder(u.id, f.m.id, payload);
    assert.equal(await db.tiraAflojaRespuesta.count({ where: { partidaId: f.m.id } }), 1);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }), 0);
    assert.ok(logs.some((e) => e.event === 'TUG_VISIBILITY_PENDING' && e.sqlState === '22012'));
  } finally {
    engine.visibilityWitness.certify = original;
    engine.log.error = originalLog;
  }
  await engine.procesarPartidasVencidas();
  await proof(f);
  await noXP(f);
});

test('TUG visibility: recovery witness outage retains committed pair and retries without fictitious certificate', async () => {
  const f = await fixture();
  await start(writer, f);
  await record(writer, f);
  const original = engine.visibilityWitness.certify;
  const originalLog = engine.log.error;
  const logs = [];
  engine.log.error = (message) => logs.push(JSON.parse(message));
  engine.visibilityWitness.certify = async () => { throw Object.assign(new Error('Injected transport outage'), { code: 'P1001' }); };
  try {
    await engine.procesarPartidasVencidas();
    assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.m.id } }), 2);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.m.id } }), 0);
    assert.ok(logs.some((e) => e.partidaId === f.m.id && e.code === 'P1001'));
  } finally {
    engine.visibilityWitness.certify = original;
    engine.log.error = originalLog;
  }
  await engine.procesarPartidasVencidas();
  await proof(f);
  await noXP(f);
});

test('TUG visibility: certificates and private witness functions deny anon/authenticated access with RLS retained', async () => {
  const [rls] =
    await db.$queryRaw`SELECT relrowsecurity AS enabled FROM pg_class WHERE oid='"TugRoundVisibility"'::regclass`;
  assert.equal(rls.enabled, true);
  for (const role of ['anon', 'authenticated']) {
    const [perms] =
      await db.$queryRaw`SELECT has_table_privilege(${role},'"TugRoundVisibility"','SELECT') AS readable,
      has_function_privilege(${role},'tug_certify_presented_round(uuid,integer)','EXECUTE') AS executable`;
    assert.equal(perms.readable, false);
    assert.equal(perms.executable, false);
  }
});
