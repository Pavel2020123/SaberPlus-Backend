// Real matchmaking and private SQL fixtures; admission never authorizes XP.
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
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, other, engine, restarted;
const previous = process.env.COMPETITIVE_TUG_ENABLED;
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
  other = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  restarted = new TiraAflojaService(other, new TiraAflojaRealtimePublisher());
  process.env.COMPETITIVE_TUG_ENABLED = 'false';
});
after(async () => {
  if (previous === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
  else process.env.COMPETITIVE_TUG_ENABLED = previous;
  await engine?.onModuleDestroy();
  await restarted?.onModuleDestroy();
  await Promise.all([db, other].filter(Boolean).map((c) => c.$disconnect()));
});
async function users(n = 2) {
  const result = [];
  for (let i = 0; i < n; i++)
    result.push(
      await db.usuario.create({
        data: {
          nombre: 'Owned admission',
          correo: randomUUID() + '@example.invalid',
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 777,
        },
      }),
    );
  return result;
}
async function bank(area) {
  const t = await db.tema.create({
    data: { nombre: 'Owned admission', area, estadoContenido: 'PUBLICADO' },
  });
  const s = await db.subtema.create({
    data: {
      nombre: 'Owned admission',
      temaId: t.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  for (let i = 0; i < 4; i++)
    await db.pregunta.create({
      data: {
        subtemaId: s.id,
        enunciado: 'Admission ' + i,
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        respuestas: {
          create: [true, false].map((esCorrecta) => ({
            texto: String(esCorrecta),
            esCorrecta,
          })),
        },
      },
    });
}
async function stored(id) {
  return other.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
}
async function noXp(id) {
  assert.throws(
    () =>
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()).get(
        'TUG_MATCH',
      ),
    /SOURCE_NOT_INTEGRATED/,
  );
  assert.equal(
    await other.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: id },
    }),
    0,
  );
  const m = await stored(id);
  for (const u of [m.jugadorAId, m.jugadorBId].filter(Boolean))
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u } })).xpTotal,
      777,
    );
}
async function blocked(update, message) {
  await assert.rejects(
    update,
    (e) =>
      e.code === 'P2010' &&
      e.meta?.code === '23514' &&
      String(e.meta?.message).includes(message),
  );
}
test('TUG admission: legacy stays non-admitted and keeps sporting explicit closure', async () => {
  const [a, b] = await users();
  const m = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: a.id,
      jugadorBId: b.id,
      estado: 'PREPARANDO',
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  assert.equal((await stored(m.id)).competitiveAdmissionVersion, null);
  await engine.abandonar(a.id, m.id);
  const terminal = await stored(m.id);
  assert.equal(terminal.estado, 'FINALIZADA');
  assert.equal(terminal.ganadorId, b.id);
  assert.equal(terminal.competitiveRulesVersion, null);
  await noXp(m.id);
});
test('TUG admission: actual creation with flags off persists non-admission despite V1 evidence enrollment', async () => {
  await bank('LECTURA_CRITICA');
  const [a, b] = await users();
  process.env.COMPETITIVE_TUG_ENABLED = 'false';
  const first = await engine.emparejar(a.id, 'LECTURA_CRITICA');
  const id = first.partida.id;
  const before = await stored(id);
  assert.equal(before.competitiveAdmissionVersion, 1);
  assert.equal(before.competitiveRulesVersion, null);
  assert.deepEqual(before.competitivePolicy, {
    policyVersion: 1,
    flag: 'COMPETITIVE_TUG_ENABLED',
    enabled: false,
  });
  assert.equal(before.competitiveOriginalAId, a.id);
  assert.equal(before.competitiveOriginalBId, null);
  assert.ok(before.competitiveAdmissionAt instanceof Date);
  assert.equal(before.prepararEvidencia, true);
  assert.equal(before.presenciaVersion, 1);
  assert.equal(before.certificacionRVersion, 1);
  assert.equal(
    (await engine.emparejar(b.id, 'LECTURA_CRITICA')).partida.id,
    id,
  );
  const matched = await stored(id);
  assert.equal(matched.competitiveOriginalBId, b.id);
  await engine.marcarListo(a.id, id);
  await engine.marcarListo(b.id, id);
  assert.equal((await stored(id)).evidenciaVersion, 1);
  assert.equal((await stored(id)).competitiveRulesVersion, null);
  const publicState = JSON.stringify(await engine.obtener(a.id, id));
  assert.doesNotMatch(
    publicState,
    /competitive|policyVersion|COMPETITIVE_TUG|snapshotInicial/,
  );
  assert.ok(!publicState.includes(a.id) && !publicState.includes(b.id));
  await noXp(id);
});
test('TUG admission: direct SQL cannot promote historical or prepared matches retrospectively', async () => {
  const [a] = await users(1);
  for (const prepared of [false, true]) {
    const m = await db.partidaTiraAfloja.create({
      data: {
        jugadorAId: a.id,
        prepararEvidencia: prepared,
        expiraEn: new Date(Date.now() + 60000),
      },
    });
    await blocked(
      other.$executeRaw`UPDATE "PartidaTiraAfloja" SET "competitiveAdmissionVersion"=1 WHERE id=${m.id}::uuid`,
      'TUG_ADMISSION_IMMUTABLE',
    );
    assert.equal((await stored(m.id)).competitiveAdmissionVersion, null);
    await noXp(m.id);
  }
});
test('TUG admission: future flag controls only new searches; queues, retries and restart preserve decisions', async () => {
  await bank('MATEMATICAS');
  const [a, b, c, d] = await users(4);
  process.env.COMPETITIVE_TUG_ENABLED = 'false';
  const oldId = (await engine.emparejar(a.id, 'MATEMATICAS')).partida.id;
  process.env.COMPETITIVE_TUG_ENABLED = 'true'; // owned local fixture only, never deployment env
  const newId = (await engine.emparejar(b.id, 'MATEMATICAS')).partida.id;
  assert.notEqual(newId, oldId);
  assert.equal((await stored(newId)).competitiveRulesVersion, 1);
  assert.equal(
    (await restarted.emparejar(c.id, 'MATEMATICAS')).partida.id,
    newId,
  );
  process.env.COMPETITIVE_TUG_ENABLED = 'false';
  assert.equal(
    (await restarted.emparejar(b.id, 'MATEMATICAS')).partida.id,
    newId,
  );
  assert.equal((await engine.emparejar(d.id, 'MATEMATICAS')).partida.id, oldId);
  assert.equal((await stored(oldId)).competitiveRulesVersion, null);
  assert.equal((await stored(newId)).competitiveRulesVersion, 1);
  assert.equal(
    await db.partidaTiraAfloja.count({ where: { jugadorAId: b.id } }),
    1,
  );
  await noXp(oldId);
  await noXp(newId);
});
test('TUG admission: independent concurrent matchmaking and exact retries bind one original B only', async () => {
  await bank('SOCIALES_CIUDADANAS');
  const [a, b, c] = await users(3);
  process.env.COMPETITIVE_TUG_ENABLED = 'true';
  const id = (await engine.emparejar(a.id, 'SOCIALES_CIUDADANAS')).partida.id;
  const results = await Promise.all([
    engine.emparejar(b.id, 'SOCIALES_CIUDADANAS'),
    restarted.emparejar(c.id, 'SOCIALES_CIUDADANAS'),
  ]);
  assert.equal(results.filter((r) => r.partida.id === id).length, 1);
  const m = await stored(id);
  assert.equal(m.competitiveOriginalAId, a.id);
  assert.equal(m.competitiveOriginalBId, m.jugadorBId);
  assert.ok([b.id, c.id].includes(m.jugadorBId));
  const retry = await Promise.all([
    engine.emparejar(a.id, 'SOCIALES_CIUDADANAS'),
    restarted.emparejar(a.id, 'SOCIALES_CIUDADANAS'),
  ]);
  assert.ok(retry.every((r) => r.partida.id === id));
  assert.equal(
    await db.partidaTiraAfloja.count({ where: { jugadorAId: a.id } }),
    1,
  );
  await noXp(id);
});
test('TUG admission: another PostgreSQL client cannot rewrite decision, policy, versions or original participants', async () => {
  await bank('CIENCIAS_NATURALES');
  const [a, b, c] = await users(3);
  process.env.COMPETITIVE_TUG_ENABLED = 'true';
  const id = (await engine.emparejar(a.id, 'CIENCIAS_NATURALES')).partida.id;
  await engine.emparejar(b.id, 'CIENCIAS_NATURALES');
  const before = await stored(id);
  for (const column of [
    'competitiveAdmissionVersion',
    'competitiveRulesVersion',
    'competitivePolicy',
    'competitiveAdmissionAt',
    'competitiveOriginalAId',
    'competitiveOriginalBId',
  ]) {
    const query = `UPDATE "PartidaTiraAfloja" SET "${column}"=NULL WHERE id=$1::uuid`;
    await blocked(other.$executeRawUnsafe(query, id), 'TUG_ADMISSION_');
  }
  for (const column of ['jugadorAId', 'jugadorBId'])
    await blocked(
      other.$executeRawUnsafe(
        `UPDATE "PartidaTiraAfloja" SET "${column}"=$1::uuid WHERE id=$2::uuid`,
        c.id,
        id,
      ),
      'TUG_ADMISSION_',
    );
  await blocked(
    other.$executeRaw`UPDATE "PartidaTiraAfloja" SET "versionReglas"=2 WHERE id=${id}::uuid`,
    'TUG_ADMISSION_CONTEXT_IMMUTABLE',
  );
  assert.deepEqual(await stored(id), before);
  await noXp(id);
});
test('TUG admission: non-admitted decision cannot be flipped, missing prerequisites or client-assigned originals are rejected', async () => {
  const [a] = await users(1);
  const policy = {
    policyVersion: 1,
    flag: 'COMPETITIVE_TUG_ENABLED',
    enabled: false,
  };
  const m = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: a.id,
      competitiveAdmissionVersion: 1,
      competitivePolicy: policy,
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  await blocked(
    other.$executeRaw`UPDATE "PartidaTiraAfloja" SET "competitiveRulesVersion"=1,"competitivePolicy"=${JSON.stringify({ ...policy, enabled: true })}::jsonb WHERE id=${m.id}::uuid`,
    'TUG_ADMISSION_IMMUTABLE',
  );
  await assert.rejects(
    other.partidaTiraAfloja.create({
      data: {
        jugadorAId: a.id,
        competitiveAdmissionVersion: 1,
        competitiveRulesVersion: 1,
        competitivePolicy: { ...policy, enabled: true },
        expiraEn: new Date(Date.now() + 60000),
      },
    }),
    /TUG_ADMISSION_INELIGIBLE/,
  );
  await assert.rejects(
    other.partidaTiraAfloja.create({
      data: {
        jugadorAId: a.id,
        competitiveAdmissionVersion: 1,
        competitiveOriginalAId: a.id,
        competitivePolicy: policy,
        expiraEn: new Date(Date.now() + 60000),
      },
    }),
    /TUG_ADMISSION_INVALID_ORIGIN/,
  );
  await noXp(m.id);
});

test('TUG admission: legacy deletion cannot recreate the same UUID as admitted; identity is private and immutable', async () => {
  const [a] = await users(1);
  const legacy = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: a.id,
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  await other.partidaTiraAfloja.delete({ where: { id: legacy.id } });
  const recreate = other.partidaTiraAfloja
    .create({
      data: {
        id: legacy.id,
        jugadorAId: a.id,
        competitiveAdmissionVersion: 1,
        competitiveRulesVersion: 1,
        competitivePolicy: {
          policyVersion: 1,
          flag: 'COMPETITIVE_TUG_ENABLED',
          enabled: true,
        },
        prepararEvidencia: true,
        presenciaVersion: 1,
        certificacionRVersion: 1,
        expiraEn: new Date(Date.now() + 60000),
      },
    })
    .then((row) => {
      console.log(
        JSON.stringify({
          diagnostic: 'legacy-uuid-recreation',
          id: row.id,
          competitiveRulesVersion: row.competitiveRulesVersion,
        }),
      );
      return row;
    });
  await assert.rejects(recreate, /TUG_ADMISSION_ID_REUSED/);
  assert.equal(
    await db.partidaTiraAfloja.count({ where: { id: legacy.id } }),
    0,
  );
  const [identity] =
    await other.$queryRaw`SELECT id FROM "TugMatchIdentity" WHERE id=${legacy.id}::uuid`;
  assert.equal(identity.id, legacy.id);
  await blocked(
    other.$executeRaw`DELETE FROM "TugMatchIdentity" WHERE id=${legacy.id}::uuid`,
    'append-only',
  );
  await blocked(
    other.$executeRaw`UPDATE "TugMatchIdentity" SET id=${randomUUID()}::uuid WHERE id=${legacy.id}::uuid`,
    'append-only',
  );
  await blocked(other.$executeRaw`TRUNCATE "TugMatchIdentity"`, 'append-only');
  for (const role of ['anon', 'authenticated'])
    await assert.rejects(
      other.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRaw`SELECT * FROM "TugMatchIdentity"`;
      }),
    );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: legacy.id } }),
    0,
  );
});

test('TUG admission: legal legacy UUID rename also retains negative provenance after deletion', async () => {
  const [a] = await users(1);
  const legacy = await db.partidaTiraAfloja.create({
    data: { jugadorAId: a.id, expiraEn: new Date(Date.now() + 60000) },
  });
  const renamedId = randomUUID();
  await other.partidaTiraAfloja.update({
    where: { id: legacy.id },
    data: { id: renamedId },
  });
  assert.equal((await stored(renamedId)).competitiveAdmissionVersion, null);
  await other.partidaTiraAfloja.delete({ where: { id: renamedId } });
  for (const id of [legacy.id, renamedId]) {
    await assert.rejects(
      other.partidaTiraAfloja.create({
        data: {
          id,
          jugadorAId: a.id,
          competitiveAdmissionVersion: 1,
          competitiveRulesVersion: 1,
          competitivePolicy: {
            policyVersion: 1,
            flag: 'COMPETITIVE_TUG_ENABLED',
            enabled: true,
          },
          prepararEvidencia: true,
          presenciaVersion: 1,
          certificacionRVersion: 1,
          expiraEn: new Date(Date.now() + 60000),
        },
      }),
      /TUG_ADMISSION_ID_REUSED/,
    );
    assert.equal(
      (
        await other.$queryRaw`SELECT count(*)::integer AS n FROM "TugMatchIdentity" WHERE id=${id}::uuid`
      )[0].n,
      1,
    );
  }
});
