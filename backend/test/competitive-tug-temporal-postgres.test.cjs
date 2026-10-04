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
    await tx.$queryRaw`SELECT tug_presence_lock(${f.id}::uuid)::text`;
    return replay.replayLockedPair(tx, f.id);
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
test('TUG temporal: exact immutable activation and pre-ACTIVA disconnect at same timestamp are ordered by persisted watermark', async () => {
  const f = await fixture();
  try {
    await clock("SELECT timezone('UTC',clock_timestamp())");
    await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
    assert.equal(
      await db.tugPresenceEvent.count({
        where: { matchId: f.id, kind: 'GRACE' },
      }),
      0,
    );
    await activate(f);
    const m = await row(f.id);
    const [proof] =
      await db.$queryRaw`SELECT "activaEn"="rondaIniciaEn"-interval '3 seconds' AS exact,
      "snapshotInicial"->'config'->>'activaEn' AS frozen FROM "PartidaTiraAfloja" WHERE id=${f.id}::uuid`;
    assert.equal(proof.exact, true);
    assert.match(proof.frozen, /\.\d{6}Z$/);
    assert.ok(m.activaPresenceId > 0n);
    await assert.rejects(
      db.$executeRaw`UPDATE "PartidaTiraAfloja" SET "activaEn"="activaEn"+interval '1 microsecond' WHERE id=${f.id}::uuid`,
      /TUG_TEMPORAL_IMMUTABLE/,
    );
    await engine.abandonar(f.users[0].id, f.id);
    assert.equal((await load(f)).classification, 'EXPLICIT_ACTIVE');
    await noXp(f);
  } finally {
    await realClock();
  }
});
for (const offset of ['0 microseconds', '1 microsecond'])
  test(`TUG temporal: GRACE at activation + ${offset} during countdown is replayable and never extends clocks`, async () => {
    const f = await fixture(true);
    try {
      const m = await row(f.id);
      await clock(
        `SELECT "activaEn"+interval '${offset}' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
      );
      await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
      await clock(
        `SELECT "graceUntil"+interval '${offset}' FROM "TugPresence" WHERE "matchId"='${f.id}'::uuid AND "userId"='${f.users[0].id}'::uuid`,
      );
      assert.equal(
        await presence.connect(f.users[0].id, f.id, randomUUID()),
        'TERMINAL_DUE',
      );
      await Promise.all([
        engine.obtener(f.users[0].id, f.id),
        restarted.obtener(f.users[1].id, f.id),
      ]);
      assert.equal((await load(f)).classification, 'GRACE_ABANDONMENT');
      const before = await load(f);
      if (offset === '0 microseconds') {
        const sentinel = new Error('rollback pre-ACTIVA grace');
        await assert.rejects(
          db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(
              'ALTER TABLE "TugPresenceEvent" DISABLE TRIGGER USER',
            );
            await tx.$executeRaw`UPDATE "TugPresenceEvent" SET "observedAt"=(SELECT "activaEn"-interval '1 microsecond' FROM "PartidaTiraAfloja" WHERE id=${f.id}::uuid)
            WHERE "matchId"=${f.id}::uuid AND kind IN ('GRACE','DISCONNECTED')`;
            await assert.rejects(
              replay.replayLockedPair(tx, f.id),
              /GRACE_BEFORE_ACTIVE/,
            );
            throw sentinel;
          }),
          (e) => e === sentinel,
        );
        assert.deepEqual(await load(f), before);
      }
      assert.equal((await row(f.id)).expiraEn.getTime(), m.expiraEn.getTime());
      await noXp(f);
    } finally {
      await realClock();
    }
  });
test('TUG temporal: countdown reconnect before expiry cancels; exact terminal cannot reopen; EXPLICIT pre-ACTIVA stays neutral', async () => {
  const f = await fixture(true);
  try {
    await clock(
      `SELECT "activaEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await presence.observe(f.id, f.sockets[0], 'DISCONNECT');
    await clock(
      `SELECT "graceUntil"-interval '1 microsecond' FROM "TugPresence" WHERE "matchId"='${f.id}'::uuid AND "userId"='${f.users[0].id}'::uuid`,
    );
    assert.equal(
      await presence.connect(f.users[0].id, f.id, randomUUID()),
      'OPEN',
    );
    await engine.abandonar(f.users[0].id, f.id);
    assert.equal((await load(f)).classification, 'EXPLICIT_ACTIVE');
    await noXp(f);
  } finally {
    await realClock();
  }
  const pre = await fixture();
  await engine.abandonar(pre.users[0].id, pre.id);
  assert.equal((await load(pre)).classification, 'EXPLICIT_PRE_ACTIVE');
  await noXp(pre);
});
for (const delta of [199999, 200000, 200001])
  test(`TUG temporal: real accepted responses ${delta}us apart match exact sports replay; no Date tie promotion`, async () => {
    const f = await fixture(true);
    try {
      await boundary(f);
      const t = await clock(
        "SELECT date_trunc('milliseconds',timezone('UTC',clock_timestamp()))-interval '1 millisecond'+interval '1 microsecond'",
      );
      const payload = await answer(f, 0);
      await db.$queryRawUnsafe(
        `SELECT pg_sleep(greatest(0,extract(epoch FROM ('${t}'::timestamp+interval '${delta} microseconds'-timezone('UTC',clock_timestamp())))))::text`,
      );
      await clock(`SELECT '${t}'::timestamp+interval '${delta} microseconds'`);
      await answer(f, 1);
      const r = await db.tiraAflojaRespuesta.findMany({
        where: { partidaId: f.id, ronda: 1 },
      });
      assert.equal(r.length, 2);
      const [times] =
        await db.$queryRaw`SELECT extract(epoch FROM (max("recibidaEn")-min("recibidaEn")))*1000000 AS difference
      FROM "TiraAflojaRespuesta" WHERE "partidaId"=${f.id}::uuid AND ronda=1`;
      assert.equal(Number(times.difference), delta);
      const event = await db.tiraAflojaEvento.findFirst({
        where: { partidaId: f.id, tipo: 'RONDA_RESUELTA' },
      });
      assert.equal(
        event.datos.motivo,
        delta <= 200000 ? 'EMPATE_RAPIDEZ' : 'A_MAS_RAPIDO',
      );
      assert.equal(event.datos.movimiento, delta <= 200000 ? 0 : 1);
      await restarted.responder(f.users[0].id, f.id, payload);
      assert.equal(
        await db.tiraAflojaRespuesta.count({
          where: { partidaId: f.id, ronda: 1 },
        }),
        2,
      );
      await engine.abandonar(f.users[0].id, f.id);
      const evidence = await load(f);
      assert.equal(evidence.classification, 'EXPLICIT_ACTIVE');
      assert.deepEqual(evidence.correct, [1, 1]);
      await noXp(f);
    } finally {
      await realClock();
    }
  });
for (const fractional of [true, false])
  test(`TUG temporal: normal ${fractional ? 'fractional' : 'millisecond'} terminal survives restart exactly; shared Date contract remains blocked, including skewed Node clock`, async () => {
    const f = await fixture(true);
    const originalNow = Date.now;
    try {
      for (let round = 0; round < 2; round++) {
        await realClock();
        await boundary(f);
        await clock(
          "SELECT date_trunc('milliseconds',timezone('UTC',clock_timestamp()))-interval '1 millisecond'" +
            (fractional ? "+interval '1 microsecond'" : ''),
        );
        await answer(f, 0);
        await answer(f, 1, false);
      }
      const a = await load(f);
      assert.deepEqual(await load(f, other), a);
      assert.equal(a.classification, 'NORMAL');
      assert.equal(BigInt(a.terminalUs) % 1000n, fractional ? 1n : 0n);
      if (fractional) assert.equal(a.terminals, undefined);
      else assert.equal(a.terminals.length, 2);
      Date.now = () => originalNow() - 60000;
      assert.deepEqual(await load(f), a);
      await assert.rejects(
        db.$transaction((tx) => replay.loadLockedPair(tx, f.id)),
        fractional
          ? /TERMINAL_PRECISION_UNSUPPORTED/
          : /TEMPORAL_CONTRACT_UNSUPPORTED/,
      );
      const sentinel = new Error('rollback temporal contradiction');
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER TABLE "PartidaTiraAfloja" DISABLE TRIGGER USER',
          );
          await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET "activaEn"="activaEn"+interval '1 microsecond' WHERE id=${f.id}::uuid`;
          await assert.rejects(
            replay.replayLockedPair(tx, f.id),
            /ACTIVATION_CONFLICT/,
          );
          throw sentinel;
        }),
        (e) => e === sentinel,
      );
      assert.deepEqual(await load(f), a);
      await noXp(f);
    } finally {
      Date.now = originalNow;
      await realClock();
    }
  });
test('TUG temporal: flag-off new matches retain Date contract, never promoted; old rows cannot enroll', async () => {
  const f = await fixture(false, false);
  assert.equal((await row(f.id)).temporalVersion, null);
  await assert.rejects(
    db.$executeRaw`UPDATE "PartidaTiraAfloja" SET "temporalVersion"=1 WHERE id=${f.id}::uuid`,
    /TUG_TEMPORAL_IMMUTABLE/,
  );
  await activate(f);
  assert.equal((await row(f.id)).activaEn, null);
  await engine.abandonar(f.users[0].id, f.id);
  await noXp(f);
});

test('TUG temporal: last microsecond of a certified round accepts an action; exact deadline rejects another action', async () => {
  const f = await fixture(true);
  try {
    await boundary(f);
    const [limit] = await db.$queryRaw`SELECT ("rondaVenceEn"-interval '1 microsecond')::text AS at FROM "PartidaTiraAfloja" WHERE id=${f.id}::uuid`;
    assert.match(limit.at,/^[0-9 .:-]+$/);
    await db.$queryRawUnsafe(`SELECT pg_sleep(greatest(0,extract(epoch FROM ('${limit.at}'::timestamp-timezone('UTC',clock_timestamp())))))::text`);
    await clock(`SELECT '${limit.at}'::timestamp`);
    const accepted = await answer(f,0);
    assert.equal(await db.tiraAflojaRespuesta.count({where:{partidaId:f.id}}),1);
    await clock(`SELECT '${limit.at}'::timestamp+interval '1 microsecond'`);
    await assert.rejects(restarted.responder(f.users[1].id,f.id,{...accepted,idempotencyKey:randomUUID()}));
    assert.equal(await db.tiraAflojaRespuesta.count({where:{partidaId:f.id}}),1);
    await engine.abandonar(f.users[0].id,f.id);
    assert.equal((await load(f)).classification,'EXPLICIT_ACTIVE');
    await noXp(f);
  } finally { await realClock(); }
});
