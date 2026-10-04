require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaPresenceService,
} = require('../src/tira-afloja/tira-afloja-presence.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
const {
  TugSportsReplay,
} = require('../src/competitive/competitive.tug-replay');
let db, other, engine, restarted, presence;
const flag = process.env.COMPETITIVE_TUG_ENABLED;
const replay = new TugSportsReplay();
const {
  CompetitiveTugPairProtocol,
} = require('../src/competitive/competitive.tug-pair-protocol');
const {
  TugCompetitiveReconciler,
} = require('../src/competitive/competitive.tug-reconciler');
let pair, secondPair;

before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const options = {
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  };
  db = new PrismaClient(options);
  other = new PrismaClient(options);
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  restarted = new TiraAflojaService(other, new TiraAflojaRealtimePublisher());
  presence = new TiraAflojaPresenceService(db);
  pair = new CompetitiveTugPairProtocol(db);
  secondPair = new CompetitiveTugPairProtocol(other);
});
after(async () => {
  await realClock();
  if (flag === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
  else process.env.COMPETITIVE_TUG_ENABLED = flag;
  await engine.onModuleDestroy();
  await restarted.onModuleDestroy();
  await Promise.all([db.$disconnect(), other.$disconnect()]);
});
async function realClock() {
  await db.$executeRawUnsafe(
    "CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT timezone('UTC',clock_timestamp()) $$",
  );
}
async function clock(sql) {
  const [r] = await db.$queryRawUnsafe(`SELECT (${sql})::text AS at`);
  assert.match(r.at, /^[0-9 .:-]+$/);
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${r.at}'::timestamp $$`,
  );
  return r.at;
}
const row = (id) => db.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
async function fixture(ready = false, enabled = true) {
  process.env.COMPETITIVE_TUG_ENABLED = String(enabled);
  const users = await Promise.all(
    [0, 1].map(() =>
      db.usuario.create({
        data: {
          nombre: 'Temporal owned',
          correo: randomUUID() + '@example.invalid',
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 123,
        },
      }),
    ),
  );
  const id = (await engine.emparejar(users[0].id, 'INGLES')).partida.id;
  assert.equal(
    (await restarted.emparejar(users[1].id, 'INGLES')).partida.id,
    id,
  );
  const f = { id, users, sockets: [randomUUID(), randomUUID()] };
  await presence.connect(users[0].id, id, f.sockets[0]);
  await presence.connect(users[1].id, id, f.sockets[1]);
  if (ready) await activate(f);
  return f;
}
async function activate(f) {
  await Promise.all([
    engine.marcarListo(f.users[0].id, f.id),
    restarted.marcarListo(f.users[1].id, f.id),
  ]);
  assert.equal((await row(f.id)).estado, 'ACTIVA');
}
async function load(f, client = db) {
  return client.$transaction(async (tx) => {
    const users = await replay.originalParticipants(tx, f.id);
    for (const u of [...users].sort())
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u}::uuid FOR UPDATE`;
    return replay.loadPreciseLockedPair(tx, f.id);
  });
}
async function noXp(f) {
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.id },
    }),
    0,
  );
  for (const u of f.users) {
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      123,
    );
    assert.equal(
      await db.balanceCompetitivo.count({ where: { usuarioId: u.id } }),
      0,
    );
  }
}
async function answer(f, i, correct = true) {
  const m = await row(f.id),
    q = m.snapshotInicial.questions[m.rondaActual - 1];
  const payload = {
    ronda: m.rondaActual,
    preguntaId: q.preguntaId,
    respuestaId: q.pregunta.respuestas.find((o) => o.esCorrecta === correct).id,
    idempotencyKey: randomUUID(),
  };
  await (i ? restarted : engine).responder(f.users[i].id, f.id, payload);
  return payload;
}
async function boundary(f) {
  await db.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaIniciaEn"-timezone('UTC',clock_timestamp())))))::text FROM "PartidaTiraAfloja" WHERE id=${f.id}::uuid`;
  await engine.obtener(f.users[0].id, f.id); // actual post-COMMIT R witness
}

async function events(f) {
  return db.eventoXpCompetitivo.findMany({
    where: {
      sourceType: 'TUG_MATCH',
      sourceId: f.id,
      liquidacion: 'SETTLEMENT',
    },
  });
}
async function finalValues(f, expected, receipt) {
  assert.deepEqual(
    receipt.decisions.map((d) => d.nominal),
    expected,
  );
  for (const [i, u] of f.users.entries()) {
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      123,
    );
    const ev = (await events(f)).find((e) => e.usuarioId === u.id);
    if (receipt.decisions[i].kind === 'NEUTRAL') {
      assert.equal(ev, undefined);
      continue;
    }
    assert.equal(ev.deltaNominal, expected[i]);
    assert.equal(ev.deltaAplicado, Math.max(0, expected[i])); // fixtures start at zero
    const balance = await db.balanceCompetitivo.findUniqueOrThrow({
      where: {
        usuarioId_gameId_temporada: {
          usuarioId: u.id,
          gameId: 'TUG_OF_WAR',
          temporada: ev.temporada,
        },
      },
    });
    assert.equal(balance.xp, ev.deltaAplicado);
    assert.equal(balance.version, 1);
    assert.equal(balance.alcanzadoEn === null, ev.deltaAplicado === 0);
    const [exact] =
      await db.$queryRaw`SELECT (extract(epoch FROM "fechaEfectiva")*1000000)::bigint::text AS us FROM "EventoXpCompetitivo" WHERE id=${ev.id}::uuid`;
    assert.equal(exact.us, receipt.terminalUs);
    assert.equal(ev.evidenciaHash, receipt.hash);
  }
  assert.deepEqual(await secondPair.settlePrecisePair(f.id), receipt);
}
async function finishNormal(f, winner = 0) {
  while ((await row(f.id)).estado === 'ACTIVA') {
    await realClock();
    await boundary(f);
    await clock(
      "SELECT date_trunc('milliseconds',timezone('UTC',clock_timestamp()))-interval '1 millisecond'+interval '1 microsecond'",
    );
    await answer(f, 0, winner === null ? false : winner === 0);
    await answer(f, 1, winner === null ? false : winner === 1);
  }
}
for (const winner of [0, 1, null])
  test(`TUG settlement: normal ${winner === null ? 'draw' : `winner ${winner}`} exact paired ledger and fractional terminal`, async () => {
    const f = await fixture(true);
    try {
      await finishNormal(f, winner);
      const r = await pair.settlePrecisePair(f.id);
      assert.equal(BigInt(r.terminalUs) % 1000n, 1n);
      await finalValues(
        f,
        winner === null ? [20, 20] : winner === 0 ? [100, 0] : [0, 100],
        r,
      );
    } finally {
      await realClock();
    }
  });
test('TUG settlement: EXPLICIT pre-ACTIVA resolves both without fictitious ledger or balances', async () => {
  const f = await fixture();
  await engine.abandonar(f.users[0].id, f.id);
  const r = await pair.settlePrecisePair(f.id);
  await finalValues(f, [0, 0], r);
  await noXp(f);
  const [s] =
    await db.$queryRaw`SELECT state FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
  assert.equal(s.state, 'RESOLVED');
});
for (const scenario of ['CORRECT', 'INCORRECT', 'ZERO_ACTIONS', 'UNKNOWN'])
  test(`TUG settlement: EXPLICIT ACTIVE ${scenario} exact penalty and beneficiary`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      const t = await clock("SELECT timezone('UTC',clock_timestamp())");
      if (scenario !== 'ZERO_ACTIONS')
        await answer(f, 1, scenario === 'CORRECT');
      if (scenario === 'UNKNOWN') {
        await clock(`SELECT '${t}'::timestamp+interval '1 microsecond'`);
        await presence.observe(f.id, f.sockets[1], 'UNCERTAIN');
      }
      await engine.abandonar(f.users[0].id, f.id);
      const r = await pair.settlePrecisePair(f.id);
      const q = (await row(f.id)).qPartida;
      // Complete bank is fixed by the real server (4 seeded questions in this fixture).
      assert.equal(q, 4);
      await finalValues(
        f,
        [-15, scenario === 'CORRECT' ? 35 : scenario === 'INCORRECT' ? 20 : 0],
        r,
      );
    } finally {
      await realClock();
    }
  });
for (const scenario of [
  'ACTION_AFTER',
  'ACTION_BEFORE_UNKNOWN',
  'ZERO',
  'OWN_GRACE',
])
  test(`TUG settlement: GRACE ${scenario} does not infer beneficiary presence`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      let t = await clock("SELECT timezone('UTC',clock_timestamp())");
      if (scenario === 'ACTION_BEFORE_UNKNOWN') {
        await answer(f, 1, false);
        t = await clock(`SELECT '${t}'::timestamp+interval '1 microsecond'`);
        await presence.observe(f.id, f.sockets[1], 'UNCERTAIN');
      }
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(`SELECT '${t}'::timestamp+interval '1 microsecond'`);
      if (['ACTION_AFTER', 'OWN_GRACE'].includes(scenario))
        await answer(f, 1, false);
      if (scenario === 'OWN_GRACE') {
        await clock(`SELECT '${t}'::timestamp+interval '2 microseconds'`);
        await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
      }
      await clock(`SELECT '${t}'::timestamp+interval '30 seconds'`);
      await engine.obtener(f.users[0].id, f.id);
      const r = await pair.settlePrecisePair(f.id);
      await finalValues(f, [-15, scenario === 'ACTION_AFTER' ? 20 : 0], r);
    } finally {
      await realClock();
    }
  });
for (const delta of [0, 1])
  test(`TUG settlement: confirmed graces ${delta}us apart preserve approved policy`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      const t = await clock("SELECT timezone('UTC',clock_timestamp())");
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(`SELECT '${t}'::timestamp+interval '${delta} microseconds'`);
      await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
      await clock(`SELECT '${t}'::timestamp+interval '30 seconds'`);
      await engine.obtener(f.users[0].id, f.id);
      const r = await pair.settlePrecisePair(f.id);
      await finalValues(f, delta === 0 ? [0, 0] : [-15, 0], r);
      if (delta === 0) await noXp(f);
    } finally {
      await realClock();
    }
  });
test('TUG settlement: global expiry has priority and no fictitious draw', async () => {
  const f = await fixture();
  try {
    await clock(
      `SELECT "expiraEn"-interval '30 seconds' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    for (let i = 0; i < 2; i++) {
      f.sockets[i] = randomUUID();
      await presence.connect(f.users[i].id, f.id, f.sockets[i]);
    }
    await activate(f);
    await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
    await clock(
      `SELECT "expiraEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await engine.obtener(f.users[0].id, f.id);
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [0, 0], r);
    await noXp(f);
  } finally {
    await realClock();
  }
});
test('TUG settlement: normal unobserved rounds R=0 produce zero without sporting bonuses', async () => {
  const f = await fixture(true);
  try {
    const q = (await row(f.id)).qPartida;
    await clock(
      `SELECT "rondaVenceEn"+interval '11.5 seconds'*(${q}-1) FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await engine.obtener(f.users[0].id, f.id);
    assert.equal((await row(f.id)).estado, 'FINALIZADA');
    const verified = await load(f);
    assert.equal(verified.classification, 'NORMAL');
    assert.deepEqual(
      verified.resolutions.map((r) => r.presentedRounds),
      [0, 0],
    );
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [0, 0], r);
  } finally {
    await realClock();
  }
});
