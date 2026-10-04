require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const {
  TugSportsReplay,
} = require('../src/competitive/competitive.tug-replay');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaPresenceService,
} = require('../src/tira-afloja/tira-afloja-presence.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, other, engine, restarted, presence;
const originalFlag = process.env.COMPETITIVE_TUG_ENABLED;
const replay = new TugSportsReplay();
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const args = {
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  };
  db = new PrismaClient(args);
  other = new PrismaClient(args);
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  restarted = new TiraAflojaService(other, new TiraAflojaRealtimePublisher());
  presence = new TiraAflojaPresenceService(db);
  // This runner-owned DB contains previous files' banks. Restrict this file's
  // real matchmaking to its four owned questions, not synthetic terminal DTOs.
  await db.pregunta.updateMany({
    where: { subtema: { tema: { area: 'INGLES' } } },
    data: { estadoContenido: 'BORRADOR' },
  });
  const tema = await db.tema.create({
    data: {
      nombre: 'Replay owned',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  const sub = await db.subtema.create({
    data: {
      nombre: 'Replay owned',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  for (let i = 0; i < 4; i++)
    await db.pregunta.create({
      data: {
        subtemaId: sub.id,
        enunciado: 'Replay ' + i,
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
});
after(async () => {
  if (originalFlag === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
  else process.env.COMPETITIVE_TUG_ENABLED = originalFlag;
  await engine?.onModuleDestroy();
  await restarted?.onModuleDestroy();
  await Promise.all([db, other].filter(Boolean).map((c) => c.$disconnect()));
});
async function fixture(admitted = true, ready = true, deadlineSeconds = null) {
  process.env.COMPETITIVE_TUG_ENABLED = String(admitted);
  const users = [];
  for (let i = 0; i < 2; i++)
    users.push(
      await db.usuario.create({
        data: {
          nombre: 'Replay owned',
          correo: randomUUID() + '@example.invalid',
          contrasenaHash: 'none',
          correoVerificado: true,
          rol: 'ESTUDIANTE',
          xpTotal: 777,
        },
      }),
    );
  const id = (await engine.emparejar(users[0].id, 'INGLES')).partida.id;
  assert.equal(
    (await restarted.emparejar(users[1].id, 'INGLES')).partida.id,
    id,
  );
  if (deadlineSeconds !== null)
    await db.$executeRaw`UPDATE "PartidaTiraAfloja" SET "expiraEn"=date_trunc('milliseconds',timezone('UTC',clock_timestamp()))+${deadlineSeconds}*interval '1 second' WHERE id=${id}::uuid`;
  if (ready) {
    await engine.marcarListo(users[0].id, id);
    await restarted.marcarListo(users[1].id, id);
  }
  return { id, users };
}
const stored = (id) =>
  db.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
async function waitBoundary(id, column) {
  // PostgreSQL measures and waits for its own persisted deadline; no JS sleeps.
  if (column === 'start')
    await other.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaIniciaEn"-timezone('UTC',clock_timestamp()))))::double precision)::text FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
  else
    await other.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaVenceEn"-timezone('UTC',clock_timestamp()))))::double precision)::text FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
}
async function load(f, database = db) {
  return database.$transaction(
    async (tx) => {
      const original = await replay.originalParticipants(tx, f.id);
      for (const u of [...original].sort())
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u}::uuid FOR UPDATE`;
      return replay.replayLockedPair(tx, f.id);
    },
    { timeout: 20000 },
  );
}
async function noXp(f) {
  assert.throws(
    () =>
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()).get(
        'TUG_MATCH',
      ),
    /SOURCE_NOT_INTEGRATED/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.id },
    }),
    0,
  );
  for (const u of f.users) {
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      777,
    );
    assert.equal(
      await db.balanceCompetitivo.count({ where: { usuarioId: u.id } }),
      0,
    );
  }
}

async function resetClock() {
  await db.$executeRawUnsafe(
    "CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT timezone('UTC',clock_timestamp()) $$",
  );
}
async function pgClock(sql) {
  // SQL comes only from this owned fixture, never a client time or external DB.
  // Evaluate the stored milestone once. Reconnection clears graceUntil inside
  // its transaction; a live SELECT min(graceUntil) would turn the clock NULL.
  const [r] = await db.$queryRawUnsafe(`SELECT (${sql})::text AS at`);
  assert.match(r.at, /^[0-9 .:-]+$/);
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${r.at}'::timestamp $$`,
  );
}
async function freezeActual() {
  const [r] = await db.$queryRaw`SELECT tug_presence_now()::text AS at`;
  assert.match(r.at, /^[0-9 .:-]+$/);
  await pgClock(`SELECT '${r.at}'::timestamp`);
}
async function graceDeadline(f, offset = '0 microseconds') {
  assert.ok(
    ['0 microseconds', '-1 microsecond', '1 microsecond', '-1 second'].includes(
      offset,
    ),
  );
  await pgClock(
    `SELECT min("graceUntil")+interval '${offset}' FROM "TugPresence" WHERE "matchId"='${f.id}'::uuid`,
  );
}
async function sockets(f) {
  const ids = [randomUUID(), randomUUID()];
  for (let i = 0; i < 2; i++)
    assert.equal(await presence.connect(f.users[i].id, f.id, ids[i]), 'OPEN');
  return ids;
}
async function answerOne(f, i, correct = true) {
  const m = await stored(f.id),
    q = m.snapshotInicial.questions[m.rondaActual - 1];
  const payload = {
    ronda: m.rondaActual,
    preguntaId: q.preguntaId,
    respuestaId: q.pregunta.respuestas.find((o) => o.esCorrecta === correct).id,
    idempotencyKey: randomUUID(),
  };
  await (i === 0 ? engine : restarted).responder(f.users[i].id, f.id, payload);
  return payload;
}
async function assertPrivate(f, kind) {
  const a = await load(f),
    b = await load(f, other);
  assert.deepEqual(a, b);
  assert.equal(a.classification, kind);
  assert.equal(a.terminals, undefined);
  await assert.rejects(
    db.$transaction((tx) => replay.loadLockedPair(tx, f.id)),
    /ABANDONMENT_CONTRACT_UNSUPPORTED/,
  );
  await noXp(f);
  return a;
}
let confirmed;
for (const rivalState of ['OPEN', 'UNKNOWN'])
  test(
    'TUG terminal replay: confirmed A, B ' +
      rivalState +
      ' and zero actions, restart/retry, late reconnect',
    async () => {
      const f = await fixture();
      try {
        await waitBoundary(f.id, 'start');
        await freezeActual();
        const cs = await sockets(f);
        if (rivalState === 'UNKNOWN')
          await presence.observe(f.id, cs[1], 'UNCERTAIN');
        await presence.observe(f.id, cs[0], 'DISCONNECT');
        await graceDeadline(f);
        await Promise.all([
          engine.obtener(f.users[0].id, f.id),
          restarted.obtener(f.users[1].id, f.id),
        ]);
        const a = await assertPrivate(f, 'GRACE_ABANDONMENT');
        assert.equal(a.winner, f.users[1].id);
        assert.deepEqual(a.actions, [0, 0]);
        assert.equal(a.abandonment.length, 1);
        assert.equal(
          await presence.connect(f.users[0].id, f.id, randomUUID()),
          'TERMINAL_DUE',
        );
        await restarted.obtener(f.users[1].id, f.id);
        assert.deepEqual(await load(f), a);
        confirmed = f;
      } finally {
        await resetClock();
      }
    },
  );
test('TUG terminal replay: beneficiary accepted incorrect answer is participation, not C; terminal retries do not write', async () => {
  const f = await fixture();
  try {
    await sockets(f);
    await waitBoundary(f.id, 'start');
    const payload = await answerOne(f, 1, false);
    await freezeActual();
    const cs = await db.tugConnection.findMany({ where: { matchId: f.id } });
    await presence.observe(
      f.id,
      cs.find((c) => c.userId === f.users[1].id).id,
      'UNCERTAIN',
    );
    await presence.observe(
      f.id,
      cs.find((c) => c.userId === f.users[0].id).id,
      'DISCONNECT',
    );
    await graceDeadline(f);
    await restarted.obtener(f.users[1].id, f.id);
    const a = await assertPrivate(f, 'GRACE_ABANDONMENT');
    assert.deepEqual(a.actions, [0, 1]);
    assert.deepEqual(a.correct, [0, 0]);
    assert.equal(a.presentedRounds, 1);
    await restarted.responder(f.users[1].id, f.id, payload);
    assert.deepEqual(await load(f), a);
  } finally {
    await resetClock();
  }
});
for (const difference of ['0 microseconds', '1 microsecond'])
  test(
    'TUG terminal replay: two confirmed graces difference ' + difference,
    async () => {
      const f = await fixture();
      try {
        await waitBoundary(f.id, 'start');
        await freezeActual();
        const cs = await sockets(f);
        await presence.observe(f.id, cs[0], 'DISCONNECT');
        await pgClock(
          `SELECT "disconnectedAt"+interval '${difference}' FROM "TugPresence" WHERE "matchId"='${f.id}'::uuid AND "userId"='${f.users[0].id}'::uuid`,
        );
        await presence.observe(f.id, cs[1], 'DISCONNECT');
        const [delta] =
          await db.$queryRaw`SELECT (extract(epoch FROM (max("graceUntil")-min("graceUntil")))*1000000)::bigint::text AS us FROM "TugPresence" WHERE "matchId"=${f.id}::uuid`;
        assert.equal(delta.us, difference === '1 microsecond' ? '1' : '0');
        await graceDeadline(f);
        await engine.obtener(f.users[0].id, f.id);
        const a = await assertPrivate(
          f,
          difference === '1 microsecond'
            ? 'GRACE_ABANDONMENT'
            : 'SIMULTANEOUS_CANCELLED',
        );
        assert.equal(
          a.winner,
          difference === '1 microsecond' ? f.users[1].id : null,
        );
        assert.equal(
          a.abandonment.length,
          difference === '1 microsecond' ? 1 : 2,
        );
        if (difference === '0 microseconds')
          assert.equal((await stored(f.id)).resultado, 'CANCELADA');
      } finally {
        await resetClock();
      }
    },
  );
for (const difference of ['0 microseconds', '1 microsecond'])
  test(
    'TUG terminal replay: global deadline before/equal grace ' + difference,
    async () => {
      const f = await fixture(true, true, 40);
      try {
        await freezeActual();
        const cs = await sockets(f);
        await pgClock(
          `SELECT "expiraEn"-interval '30 seconds'+interval '${difference}' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
        );
        await presence.observe(f.id, cs[0], 'DISCONNECT');
        await pgClock(
          `SELECT "expiraEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
        );
        await restarted.obtener(f.users[1].id, f.id);
        const a = await assertPrivate(f, 'GLOBAL_EXPIRED');
        assert.equal(a.winner, null);
        assert.equal(a.abandonment.length, 0);
        assert.equal((await stored(f.id)).estado, 'EXPIRADA');
      } finally {
        await resetClock();
      }
    },
  );
test('TUG terminal replay: normal verified goal precedes grace, without losing confirmed R', async () => {
  const f = await fixture();
  try {
    const cs = await sockets(f);
    await waitBoundary(f.id, 'start');
    await answerOne(f, 0);
    await answerOne(f, 1, false);
    await presence.observe(f.id, cs[1], 'DISCONNECT');
    await waitBoundary(f.id, 'start');
    await answerOne(f, 0);
    await pgClock(
      `SELECT "rondaVenceEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await engine.obtener(f.users[0].id, f.id);
    const a = await load(f);
    assert.equal(a.classification, 'NORMAL');
    assert.equal(a.presentedRounds, 2);
    assert.equal(a.winner, f.users[0].id);
    assert.ok(a.terminals);
    assert.equal(a.abandonment.length, 0);
    await noXp(f);
  } finally {
    await resetClock();
  }
});
test('TUG terminal replay: normal exhaustion before late grace keeps normal R=0, no abandonment inferred', async () => {
  const f = await fixture();
  try {
    await pgClock(
      `SELECT "expiraEn"-interval '40 seconds' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    const cs = await sockets(f);
    await pgClock(
      `SELECT "expiraEn"-interval '30 seconds' FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await presence.observe(f.id, cs[0], 'DISCONNECT');
    await pgClock(
      `SELECT "expiraEn" FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid`,
    );
    await engine.obtener(f.users[0].id, f.id);
    const a = await load(f);
    assert.equal(a.classification, 'NORMAL');
    assert.equal(a.winner, null);
    assert.equal(a.presentedRounds, 0);
    assert.ok(a.terminals);
    await noXp(f);
  } finally {
    await resetClock();
  }
});
test('TUG terminal replay: timely authenticated reconnect cancels grace; original clocks survive explicit ACTIVE closure', async () => {
  const f = await fixture();
  const before = await stored(f.id);
  try {
    await waitBoundary(f.id, 'start');
    await freezeActual();
    const cs = await sockets(f);
    await presence.observe(f.id, cs[0], 'DISCONNECT');
    await graceDeadline(f, '-1 second');
    assert.equal(
      await presence.connect(f.users[0].id, f.id, randomUUID()),
      'OPEN',
    );
    await engine.abandonar(f.users[0].id, f.id);
    const a = await assertPrivate(f, 'EXPLICIT_ACTIVE');
    assert.equal(a.phase, 'ACTIVE');
    assert.equal(a.winner, f.users[1].id);
    assert.equal(
      (await stored(f.id)).expiraEn.getTime(),
      before.expiraEn.getTime(),
    );
    assert.equal(
      await db.tugPresenceEvent.count({
        where: { matchId: f.id, kind: 'GRACE' },
      }),
      1,
    );
  } finally {
    await resetClock();
  }
});
test('TUG terminal replay: UNKNOWN alone remains active and unclassifiable, no manufactured abandonment', async () => {
  const f = await fixture();
  try {
    await freezeActual();
    const cs = await sockets(f);
    for (const c of cs) await presence.observe(f.id, c, 'UNCERTAIN');
    await engine.obtener(f.users[0].id, f.id);
    assert.equal((await stored(f.id)).estado, 'ACTIVA');
    assert.equal(
      await db.tugAbandonment.count({ where: { matchId: f.id } }),
      0,
    );
    await assert.rejects(load(f), /NEUTRAL_OR_OPEN_UNSUPPORTED/);
    await noXp(f);
  } finally {
    await resetClock();
  }
});
for (const ready of [false, true])
  test(
    'TUG terminal replay: EXPLICIT ' +
      (ready ? 'ACTIVE' : 'PRE_ACTIVE') +
      ' neutral is not a tie or definitive-phase inference',
    async () => {
      const f = await fixture(true, ready);
      await engine.abandonar(f.users[0].id, f.id);
      const a = await assertPrivate(
        f,
        ready ? 'EXPLICIT_ACTIVE' : 'EXPLICIT_PRE_ACTIVE',
      );
      assert.equal(a.phase, ready ? 'ACTIVE' : 'PRE_ACTIVE');
      assert.equal(a.winner, null);
      assert.deepEqual(a.actions, [0, 0]);
      assert.equal((await stored(f.id)).resultado, 'CANCELADA');
    },
  );
test('TUG terminal replay: missing R certificate blocks the complete abandonment classification', async () => {
  const f = await fixture();
  try {
    engine.visibilityWitness.certify = restarted.visibilityWitness.certify =
      async () => {
        throw Error('OWNED_CP15_OUTAGE');
      };
    const cs = await sockets(f);
    await waitBoundary(f.id, 'start');
    await answerOne(f, 1, false);
    await freezeActual();
    await presence.observe(f.id, cs[0], 'DISCONNECT');
    await graceDeadline(f);
    await engine.obtener(f.users[0].id, f.id);
    await assert.rejects(load(f), /CERTIFICATE_MISSING_OR_ORPHAN/);
    await noXp(f);
  } finally {
    delete engine.visibilityWitness.certify;
    delete restarted.visibilityWitness.certify;
    await resetClock();
  }
});
test('TUG terminal replay: contradictory durable grace and duplicate transition fail closed; rollback preserves hash', async () => {
  const original = await load(confirmed),
    sentinel = Error('OWNED_CP15_ROLLBACK');
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "TugPresenceEvent" DISABLE TRIGGER USER',
      );
      await tx.$executeRaw`DELETE FROM "TugPresenceEvent" WHERE "matchId"=${confirmed.id}::uuid AND kind='GRACE'`;
      await assert.rejects(
        replay.replayLockedPair(tx, confirmed.id),
        /MISSING_GRACE/,
      );
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "TugPresenceEvent"("matchId","userId","connectionId",kind,"observedAt") SELECT "matchId","userId","connectionId",kind,"observedAt" FROM "TugPresenceEvent" WHERE "matchId"=${confirmed.id}::uuid AND kind='DISCONNECTED'`;
      await assert.rejects(
        replay.replayLockedPair(tx, confirmed.id),
        /DUPLICATE_TRANSITION/,
      );
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.deepEqual(await load(confirmed), original);
  await noXp(confirmed);
});

test('TUG terminal replay: countdown grace lacks independent exact activation time and remains blocked', async () => {
  const f = await fixture();
  try {
    await freezeActual();
    const cs = await sockets(f);
    await presence.observe(f.id, cs[0], 'DISCONNECT');
    await graceDeadline(f);
    await engine.obtener(f.users[0].id, f.id);
    await assert.rejects(load(f), /GRACE_PHASE_UNPROVEN/);
    await noXp(f);
  } finally {
    await resetClock();
  }
});

test('TUG terminal replay: multiple authenticated sockets, UNKNOWN retirement and a new instance keep ordered history', async () => {
  const f = await fixture();
  try {
    await waitBoundary(f.id, 'start');
    await freezeActual();
    const cs = await sockets(f);
    const second = randomUUID();
    await presence.connect(f.users[0].id, f.id, second);
    await presence.observe(f.id, cs[0], 'DISCONNECT');
    assert.equal(
      await db.tugPresenceEvent.count({
        where: { matchId: f.id, kind: 'GRACE' },
      }),
      0,
    );
    await presence.observe(f.id, second, 'UNCERTAIN');
    const nextInstance = new TiraAflojaPresenceService(other);
    assert.equal(
      await nextInstance.connect(f.users[0].id, f.id, randomUUID()),
      'OPEN',
    );
    assert.equal(
      (await db.tugConnection.findUniqueOrThrow({ where: { id: second } }))
        .state,
      'RETIRED',
    );
    await restarted.abandonar(f.users[0].id, f.id);
    const result = await assertPrivate(f, 'EXPLICIT_ACTIVE');
    assert.equal(result.winner, f.users[1].id);
    assert.deepEqual(result.actions, [0, 0]);
  } finally {
    await resetClock();
  }
});

test('TUG terminal replay: an unpaired post-terminal abandonment cannot hide outside the canonical time cut', async () => {
  const original = await load(confirmed),
    sentinel = Error('OWNED_LATE_ABANDONMENT_ROLLBACK');
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "TugPresenceEvent"("matchId","userId",kind,"observedAt")
      SELECT id, "jugadorBId", 'ABANDONED', "fechaFinalizacion"+interval '1 microsecond'
      FROM "PartidaTiraAfloja" WHERE id=${confirmed.id}::uuid`;
      await assert.rejects(
        replay.replayLockedPair(tx, confirmed.id),
        /ABANDONMENT_EVENT/,
      );
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.deepEqual(await load(confirmed), original);
  await noXp(confirmed);
});

test('TUG terminal replay: EXPLICIT pre-ACTIVA with sporting winner still has zero actions and no payout classification', async () => {
  const f = await fixture(true, false);
  assert.equal(
    await presence.connect(f.users[1].id, f.id, randomUUID()),
    'OPEN',
  );
  await engine.abandonar(f.users[0].id, f.id);
  const result = await assertPrivate(f, 'EXPLICIT_PRE_ACTIVE');
  assert.equal(result.winner, f.users[1].id);
  assert.equal(result.phase, 'PRE_ACTIVE');
  assert.deepEqual(result.actions, [0, 0]);
  assert.deepEqual(result.correct, [0, 0]);
  assert.equal(result.qPartida, null);
  assert.equal((await stored(f.id)).resultado, 'JUGADOR_B');
});

for (const accepted of [0, 1])
  test(`TUG terminal replay: resolved round with ${accepted} answers cannot be eligible after exceptional terminal`, async () => {
    const f = await fixture();
    try {
      await sockets(f);
      if (accepted) {
        await waitBoundary(f.id, 'start');
        await answerOne(f, 1, false);
      }
      const [boundary] =
        await db.$queryRaw`SELECT "rondaVenceEn"::text AS at FROM "PartidaTiraAfloja" WHERE id=${f.id}::uuid`;
      assert.match(boundary.at, /^[0-9 .:-]+$/);
      await pgClock(`SELECT '${boundary.at}'::timestamp`);
      await engine.obtener(f.users[0].id, f.id);
      assert.equal((await stored(f.id)).rondaActual, 2);
      await pgClock(
        `SELECT '${boundary.at}'::timestamp+interval '1 microsecond'`,
      );
      await engine.abandonar(f.users[0].id, f.id);
      const before = await assertPrivate(f, 'EXPLICIT_ACTIVE');
      assert.deepEqual(before.actions, [0, accepted]);
      const sentinel = Error('OWNED_RESOLVED_AFTER_TERMINAL_ROLLBACK');
      await assert.rejects(
        db.$transaction(async (tx) => {
          // Only this runner-owned DB, all changes AND trigger changes rolled back.
          for (const table of [
            'PartidaTiraAfloja',
            'TugAbandonment',
            'TugPresenceEvent',
          ])
            await tx.$executeRawUnsafe(
              `ALTER TABLE "${table}" DISABLE TRIGGER USER`,
            );
          await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET "fechaFinalizacion"=${boundary.at}::timestamp-interval '1 microsecond' WHERE id=${f.id}::uuid`;
          await tx.$executeRaw`UPDATE "TugAbandonment" SET "effectiveAt"=${boundary.at}::timestamp-interval '1 microsecond' WHERE "matchId"=${f.id}::uuid`;
          await tx.$executeRaw`UPDATE "TugPresenceEvent" SET "observedAt"=${boundary.at}::timestamp-interval '1 microsecond' WHERE "matchId"=${f.id}::uuid AND kind='ABANDONED'`;
          await assert.rejects(
            replay.replayLockedPair(tx, f.id),
            /TUG_REPLAY_RESOLVED_AFTER_EXCEPTIONAL_TERMINAL/,
          );
          throw sentinel;
        }),
        (e) => e === sentinel,
      );
      assert.deepEqual(await load(f), before);
      await noXp(f);
    } finally {
      await resetClock();
    }
  });
