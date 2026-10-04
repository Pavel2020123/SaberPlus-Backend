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

test('TUG contract: EXPLICIT pre-ACTIVA preserves sporting winner but represents both neutral, retry and no XP', async () => {
  const f = await fixture();
  await engine.abandonar(f.users[0].id, f.id);
  const r = await load(f);
  assert.equal(r.classification, 'EXPLICIT_PRE_ACTIVE');
  assert.equal(r.activation, null);
  assert.equal(r.sportingWinner, f.users[1].id);
  assert.deepEqual(r.resolutions, [
    { kind: 'NEUTRAL', reason: 'PRE_ACTIVE' },
    { kind: 'NEUTRAL', reason: 'PRE_ACTIVE' },
  ]);
  await restarted.abandonar(f.users[0].id, f.id);
  assert.deepEqual(await load(f, other), r);
  await noXp(f);
});

for (const state of ['OPEN', 'UNKNOWN'])
  test(`TUG contract: EXPLICIT ACTIVE rival ${state} does not fake a tie or presence eligibility`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      const acceptedAt = await clock(
        "SELECT timezone('UTC',clock_timestamp())",
      );
      await answer(f, 1, false);
      if (state === 'UNKNOWN') {
        await clock(
          `SELECT '${acceptedAt}'::timestamp+interval '1 microsecond'`,
        );
        await presence.observe(f.id, f.sockets[1], 'UNCERTAIN');
      }
      await engine.abandonar(f.users[0].id, f.id);
      const r = await load(f);
      assert.equal(r.classification, 'EXPLICIT_ACTIVE');
      assert.equal(r.resolutions[0].kind, 'PENALIZABLE_ABANDONMENT');
      if (state === 'OPEN') {
        assert.equal(r.sportingWinner, f.users[1].id);
        assert.equal(r.resolutions[1].eligibility, 'SUFFICIENT');
      } else {
        assert.equal(r.sportingWinner, null);
        assert.deepEqual(r.resolutions[1], {
          kind: 'NEUTRAL',
          reason: 'NO_WINNER',
        });
      }
      assert.deepEqual(await load(f, other), r);
      await noXp(f);
    } finally {
      await realClock();
    }
  });

for (const scenario of [
  'ZERO_OPEN',
  'ZERO_UNKNOWN',
  'INCORRECT_OPEN',
  'INCORRECT_UNKNOWN',
  'PRIOR_UNKNOWN',
  'RENEWED_UNKNOWN',
  'OWN_GRACE',
])
  test(`TUG contract: confirmed GRACE, beneficiary ${scenario}, participation and presence are separate`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      let start = await clock("SELECT timezone('UTC',clock_timestamp())");
      let payload;
      if (scenario === 'PRIOR_UNKNOWN' || scenario === 'RENEWED_UNKNOWN') {
        payload = await answer(f, 1, false);
        start = await clock(
          `SELECT '${start}'::timestamp+interval '1 microsecond'`,
        );
        if (scenario === 'PRIOR_UNKNOWN')
          await presence.observe(f.id, f.sockets[1], 'UNCERTAIN');
      }
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(`SELECT '${start}'::timestamp+interval '1 microsecond'`);
      if (scenario.startsWith('INCORRECT') || scenario === 'OWN_GRACE')
        payload = await answer(f, 1, false);
      if (scenario === 'RENEWED_UNKNOWN')
        await presence.observe(f.id, f.sockets[1], 'RENEW');
      if (scenario.endsWith('UNKNOWN') && scenario !== 'PRIOR_UNKNOWN') {
        await clock(`SELECT '${start}'::timestamp+interval '2 microseconds'`);
        await presence.observe(f.id, f.sockets[1], 'UNCERTAIN');
      }
      if (scenario === 'OWN_GRACE') {
        await clock(`SELECT '${start}'::timestamp+interval '2 microseconds'`);
        await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
      }
      await clock(`SELECT '${start}'::timestamp+interval '30 seconds'`);
      await Promise.all([
        engine.obtener(f.users[0].id, f.id),
        restarted.obtener(f.users[1].id, f.id),
      ]);
      const r = await load(f);
      assert.equal(r.classification, 'GRACE_ABANDONMENT');
      assert.equal(r.sportingWinner, f.users[1].id);
      assert.equal(r.resolutions[0].kind, 'PENALIZABLE_ABANDONMENT');
      const b = r.resolutions[1];
      assert.equal(b.kind, 'ABANDONMENT_BENEFICIARY');
      assert.equal(b.correct, 0);
      assert.equal(b.actions, scenario.startsWith('ZERO') ? 0 : 1);
      assert.equal(
        b.eligibility,
        scenario.startsWith('ZERO')
          ? 'NO_ACTIONS'
          : scenario === 'OWN_GRACE'
            ? 'OWN_GRACE'
            : scenario === 'PRIOR_UNKNOWN'
              ? 'PRESENCE_UNPROVEN'
              : 'SUFFICIENT',
      );
      if (scenario === 'INCORRECT_UNKNOWN') {
        assert.equal(b.presence.openAtTerminal, false);
        assert.equal(b.presence.authenticatedEvidence.kind, 'ACCEPTED_ANSWER');
      }
      assert.deepEqual(await load(f, other), r);
      if (payload) await restarted.responder(f.users[1].id, f.id, payload);
      assert.deepEqual(await load(f), r);
      await noXp(f);
    } finally {
      await realClock();
    }
  });

for (const delta of [0, 1])
  test(`TUG contract: confirmed graces ${delta}us apart, no implicit double penalty`, async () => {
    const f = await fixture(true);
    try {
      if (delta === 0) {
        await boundary(f);
        await answer(f, 0, true);
        await answer(f, 1, false);
      }
      const start = await clock("SELECT timezone('UTC',clock_timestamp())");
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(
        `SELECT '${start}'::timestamp+interval '${delta} microseconds'`,
      );
      await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
      await clock(`SELECT '${start}'::timestamp+interval '30 seconds'`);
      await engine.obtener(f.users[0].id, f.id);
      const r = await load(f);
      if (delta === 0) {
        assert.equal(r.classification, 'SIMULTANEOUS_CANCELLED');
        assert.equal(
          await db.tiraAflojaRespuesta.count({ where: { partidaId: f.id } }),
          2,
        );
        assert.equal(r.sportingWinner, null);
        assert.equal(Object.hasOwn(r, 'policyBlock'), false);
        assert.equal(r.abandonments.length, 2);
        assert.equal(
          r.abandonments[0].graceStartUs,
          r.abandonments[1].graceStartUs,
        );
        assert.deepEqual(r.resolutions, [
          {
            kind: 'NEUTRAL',
            reason: 'SIMULTANEOUS',
            positiveXp: 0,
            nominalPenalty: 0,
          },
          {
            kind: 'NEUTRAL',
            reason: 'SIMULTANEOUS',
            positiveXp: 0,
            nominalPenalty: 0,
          },
        ]);
      } else {
        assert.equal(r.classification, 'GRACE_ABANDONMENT');
        assert.equal(r.sportingWinner, f.users[1].id);
        assert.equal(r.resolutions[1].eligibility, 'NO_ACTIONS');
        assert.equal(r.resolutions[0].kind, 'PENALIZABLE_ABANDONMENT');
        assert.equal(r.abandonments.length, 1);
        assert.equal(Object.hasOwn(r.resolutions[0], 'nominalPenalty'), false);
      }
      assert.deepEqual(await load(f, other), r);
      await noXp(f);
    } finally {
      await realClock();
    }
  });

for (const offset of [5, 30])
  test(`TUG contract: global deadline ${offset === 30 ? 'equal to' : 'before'} grace stays neutral, timestamp(6), no fake EMPATE`, async () => {
    const f = await fixture();
    try {
      await clock(
        `SELECT "expiraEn"-interval '${offset} seconds' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
      );
      for (let i = 0; i < 2; i++) {
        f.sockets[i] = randomUUID();
        assert.equal(
          await presence.connect(f.users[i].id, f.id, f.sockets[i]),
          'OPEN',
        );
      }
      await activate(f);
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(
        `SELECT "expiraEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
      );
      await engine.obtener(f.users[0].id, f.id);
      const r = await load(f);
      assert.equal(r.classification, 'GLOBAL_EXPIRED');
      assert.equal(r.sportingWinner, null);
      assert.deepEqual(r.resolutions, [
        { kind: 'NEUTRAL', reason: 'GLOBAL_EXPIRED' },
        { kind: 'NEUTRAL', reason: 'GLOBAL_EXPIRED' },
      ]);
      assert.equal(
        await db.tugAbandonment.count({ where: { matchId: f.id } }),
        0,
      );
      await noXp(f);
    } finally {
      await realClock();
    }
  });

test('TUG contract: real normal fractional terminal survives restart and skewed Node time; altered activation is rejected and rolled back', async () => {
  const f = await fixture(true),
    oldNow = Date.now;
  try {
    for (let i = 0; i < 2; i++) {
      await realClock();
      await boundary(f);
      await clock(
        "SELECT date_trunc('milliseconds',timezone('UTC',clock_timestamp()))-interval '1 millisecond'+interval '1 microsecond'",
      );
      await answer(f, 0);
      await answer(f, 1, false);
    }
    const r = await load(f);
    assert.equal(r.classification, 'NORMAL');
    assert.equal(BigInt(r.terminalUs) % 1000n, 1n);
    assert.deepEqual(
      r.resolutions.map((x) => x.outcome),
      ['VICTORIA', 'DERROTA'],
    );
    Date.now = () => 0;
    assert.deepEqual(await load(f, other), r);
    const sentinel = new Error('owned contradiction rollback');
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "PartidaTiraAfloja" DISABLE TRIGGER USER',
        );
        await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET "snapshotInicial"=jsonb_set("snapshotInicial",'{config,activaVersion}',to_jsonb("activaVersion"+1)) WHERE id=${f.id}::uuid`;
        await assert.rejects(
          replay.loadPreciseLockedPair(tx, f.id),
          /ACTIVATION_CONFLICT/,
        );
        throw sentinel;
      }),
      (e) => e === sentinel,
    );
    assert.deepEqual(await load(f), r);
    await assert.rejects(
      db.$transaction((tx) => replay.loadLockedPair(tx, f.id)),
      /TERMINAL_PRECISION_UNSUPPORTED/,
    );
    await noXp(f);
  } finally {
    Date.now = oldNow;
    await realClock();
  }
});

for (const scenario of [
  'ZERO_ACTIONS',
  'RECONNECTED',
  'OWN_GRACE',
  'EXPIRED_LEASE',
  'EXPIRED_AUTH',
])
  test(`TUG A4/A5: EXPLICIT ACTIVE beneficiary ${scenario} uses exact original historical evidence`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      let t = await clock("SELECT timezone('UTC',clock_timestamp())");
      if (scenario !== 'ZERO_ACTIONS') await answer(f, 1, false);
      if (['RECONNECTED', 'OWN_GRACE', 'EXPIRED_AUTH'].includes(scenario)) {
        await clock(`SELECT '${t}'::timestamp+interval '1 microsecond'`);
        await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
      }
      if (scenario === 'RECONNECTED' || scenario === 'EXPIRED_AUTH') {
        await clock(`SELECT '${t}'::timestamp+interval '2 microseconds'`);
        f.sockets[1] = randomUUID();
        const expiry =
          scenario === 'EXPIRED_AUTH'
            ? new Date(new Date(t + 'Z').getTime() + 1000)
            : undefined;
        assert.equal(
          await presence.connect(f.users[1].id, f.id, f.sockets[1], expiry),
          'OPEN',
        );
        if (expiry)
          t = await clock(
            `SELECT "authUntil" FROM "TugConnection" WHERE id='${f.sockets[1]}'::uuid`,
          );
        else
          t = await clock(`SELECT '${t}'::timestamp+interval '3 microseconds'`);
      }
      if (scenario === 'EXPIRED_LEASE')
        t = await clock(
          `SELECT max("leaseUntil") FROM "TugConnection" WHERE "matchId"='${f.id}'::uuid`,
        );
      await engine.abandonar(f.users[0].id, f.id);
      const r = await load(f);
      assert.equal(r.classification, 'EXPLICIT_ACTIVE');
      assert.equal(r.resolutions[0].kind, 'PENALIZABLE_ABANDONMENT');
      if (scenario === 'ZERO_ACTIONS')
        assert.equal(r.resolutions[1].eligibility, 'NO_ACTIONS');
      else if (scenario === 'RECONNECTED') {
        assert.equal(r.resolutions[1].eligibility, 'SUFFICIENT');
        assert.equal(r.resolutions[1].actions, 1);
        assert.equal(r.resolutions[1].correct, 0);
        assert.equal(r.resolutions[1].presence.ownGraceStartUs, null);
        assert.equal(
          r.resolutions[1].presence.openConnectionAtTerminal.connectionId,
          f.sockets[1],
        );
        // A later observer state cannot erase the authenticated interval at closure.
        await clock(
          `SELECT "leaseUntil" FROM "TugConnection" WHERE id='${f.sockets[1]}'::uuid`,
        );
        assert.equal(
          await presence.observe(f.id, f.sockets[1], 'UNCERTAIN'),
          'UNKNOWN',
        );
        assert.equal(
          (
            await db.tugConnection.findUniqueOrThrow({
              where: { id: f.sockets[1] },
            })
          ).state,
          'UNKNOWN',
        );
      } else {
        assert.equal(r.sportingWinner, null);
        assert.deepEqual(r.resolutions[1], {
          kind: 'NEUTRAL',
          reason: 'NO_WINNER',
        });
        assert.equal(
          await db.tugAbandonment.count({
            where: { matchId: f.id, userId: f.users[1].id },
          }),
          0,
        );
      }
      assert.deepEqual(await load(f, other), r);
      await noXp(f);
    } finally {
      await realClock();
    }
  });

test('TUG A5: own GRACE cancelled by valid reconnection proves beneficiary presence at rival deadline, stable after UNKNOWN', async () => {
  const f = await fixture(true);
  try {
    await boundary(f);
    const t = await clock("SELECT timezone('UTC',clock_timestamp())");
    await answer(f, 1, false);
    await clock(`SELECT '${t}'::timestamp+interval '1 microsecond'`);
    await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
    await clock(`SELECT '${t}'::timestamp+interval '2 microseconds'`);
    await presence.observe(f.id, f.sockets[1], 'DISCONNECT');
    await clock(`SELECT '${t}'::timestamp+interval '3 microseconds'`);
    const reconnected = randomUUID();
    assert.equal(
      await presence.connect(f.users[1].id, f.id, reconnected),
      'OPEN',
    );
    await clock(
      `SELECT '${t}'::timestamp+interval '30 seconds'+interval '1 microsecond'`,
    );
    await engine.obtener(f.users[0].id, f.id);
    const r = await load(f);
    assert.equal(r.classification, 'GRACE_ABANDONMENT');
    assert.equal(r.resolutions[1].eligibility, 'SUFFICIENT');
    assert.equal(r.resolutions[1].presence.ownGraceStartUs, null);
    assert.equal(
      r.resolutions[1].presence.authenticatedEvidence.kind,
      'CONNECTED',
    );
    assert.equal(
      r.resolutions[1].presence.openConnectionAtTerminal.connectionId,
      reconnected,
    );
    await clock(
      `SELECT "leaseUntil" FROM "TugConnection" WHERE id='${reconnected}'::uuid`,
    );
    assert.equal(
      await presence.observe(f.id, reconnected, 'UNCERTAIN'),
      'UNKNOWN',
    );
    assert.equal(
      (await db.tugConnection.findUniqueOrThrow({ where: { id: reconnected } }))
        .state,
      'UNKNOWN',
    );
    assert.deepEqual(await load(f, other), r);
    await noXp(f);
  } finally {
    await realClock();
  }
});

test('TUG contract: legacy and previously admitted unversioned attempts are not promoted', async () => {
  const legacy = await fixture(false, false);
  await engine.abandonar(legacy.users[0].id, legacy.id);
  await assert.rejects(load(legacy), /NOT_ADMITTED/);
  await noXp(legacy);
  // Emulate the confirmed creator before CP16; no privileged data alteration.
  db.$use(async (params, next) => {
    if (params.model === 'PartidaTiraAfloja' && params.action === 'create')
      delete params.args.data.temporalVersion;
    return next(params);
  });
  const historical = await fixture();
  await engine.abandonar(historical.users[0].id, historical.id);
  await assert.rejects(load(historical), /TEMPORAL_VERSION_REQUIRED/);
  await noXp(historical);
});
