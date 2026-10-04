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
test('TUG settlement: failure after first event rolls back all writes; concurrent retry after commit is stable', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    class BrokenPair extends CompetitiveTugPairProtocol {
      async post(tx, p) {
        const event = await super.post(tx, p);
        throw new Error('injected after first post');
      }
    }
    await assert.rejects(
      new BrokenPair(db).settlePrecisePair(f.id),
      /injected after first post/,
    );
    await noXp(f);
    const receipts = await Promise.all([
      pair.settlePrecisePair(f.id),
      secondPair.settlePrecisePair(f.id),
    ]);
    assert.deepEqual(receipts[0], receipts[1]);
    await finalValues(f, [100, 0], receipts[0]);
    assert.equal((await events(f)).length, 2);
  } finally {
    await realClock();
  }
});
test('TUG settlement: immutable snapshot contradiction rejected with privileged alteration rolled back', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    const sentinel = new Error('owned rollback');
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "PartidaTiraAfloja" DISABLE TRIGGER USER',
        );
        await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET "snapshotInicial"=jsonb_set("snapshotInicial",'{config,activaVersion}',to_jsonb("activaVersion"+1)) WHERE id=${f.id}::uuid`;
        const nested = new CompetitiveTugPairProtocol({
          $transaction: (fn) => fn(tx),
        });
        await assert.rejects(
          nested.settlePrecisePair(f.id),
          /ACTIVATION_CONFLICT/,
        );
        throw sentinel;
      }),
      (e) => e === sentinel,
    );
    await noXp(f);
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [100, 0], r);
  } finally {
    await realClock();
  }
});
test('TUG settlement: no second participant resolves durably without invented pair', async () => {
  process.env.COMPETITIVE_TUG_ENABLED = 'true';
  const u = await db.usuario.create({
    data: {
      nombre: 'Solo seeker',
      correo: randomUUID() + '@example.invalid',
      contrasenaHash: 'none',
      rol: 'ESTUDIANTE',
      correoVerificado: true,
    },
  });
  const id = (await engine.emparejar(u.id, 'LECTURA_CRITICA')).partida.id;
  await engine.abandonar(u.id, id);
  // BUSCANDO prefetch is neither an ACTIVA transition nor a presentation.
  assert.ok(
    (await db.tiraAflojaPregunta.count({ where: { partidaId: id } })) > 0,
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: id } }),
    0,
  );
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({ where: { partidaId: id } }),
    0,
  );
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: id } }),
    0,
  );
  const r = await pair.settlePrecisePair(id);
  assert.deepEqual(r.participants, [u.id]);
  assert.deepEqual(
    r.decisions.map((d) => d.nominal),
    [0],
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: id },
    }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({ where: { usuarioId: u.id } }),
    0,
  );
  assert.deepEqual(await secondPair.settlePrecisePair(id), r);
});
test('TUG recovery: restart and two instances settle pending admissions with flag OFF, preserve neutral acknowledgement', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    await noXp(f);
    process.env.COMPETITIVE_TUG_ENABLED = 'false';
    await Promise.all([
      new TugCompetitiveReconciler(db, pair).reconcile(),
      new TugCompetitiveReconciler(other, secondPair).reconcile(),
    ]);
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [100, 0], r);
    await new TugCompetitiveReconciler(other, secondPair).reconcile();
    assert.equal((await events(f)).length, 2);
  } finally {
    await realClock();
  }
});
test('TUG recovery: transient failure stays pending and committed-but-unacknowledged pair is not paid again', async () => {
  const f = await fixture();
  await engine.abandonar(f.users[0].id, f.id);
  const temporary = {
    settlePrecisePair: async () => {
      throw Object.assign(new Error('connection unavailable'), {
        code: 'P1001',
      });
    },
  };
  await new TugCompetitiveReconciler(db, temporary).reconcile();
  let [s] =
    await db.$queryRaw`SELECT state,attempts,"lastError" FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
  assert.equal(s.state, 'PENDING');
  assert.equal(s.attempts, 1);
  assert.match(s.lastError, /P1001/);
  await db.$executeRaw`UPDATE "TugCompetitiveSettlement" SET "retryAt"=clock_timestamp() WHERE "sourceId"=${f.id}::uuid`;
  const lostAck = {
    settlePrecisePair: async (id) => {
      await pair.settlePrecisePair(id);
      throw new Error('lost response after commit');
    },
  };
  await new TugCompetitiveReconciler(db, lostAck).reconcile();
  [s] =
    await db.$queryRaw`SELECT state FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
  assert.equal(s.state, 'RESOLVED');
  await noXp(f);
});
test('TUG settlement: administrative correction preserves exact effective microsecond and original season', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    const r = await pair.settlePrecisePair(f.id);
    const admin = await db.usuario.create({
      data: {
        nombre: 'Admin owned',
        correo: randomUUID() + '@example.invalid',
        contrasenaHash: 'none',
        rol: 'ADMIN',
      },
    });
    const corrected = await pair.correct({
      operationId: randomUUID(),
      originalEventId: r.decisions[0].eventId,
      actorId: admin.id,
      reason: 'owned test correction',
      nominalDelta: -1,
      kind: 'CORRECCION',
    });
    const [time] =
      await db.$queryRaw`SELECT (extract(epoch FROM "fechaEfectiva")*1000000)::bigint::text AS us FROM "EventoXpCompetitivo" WHERE id=${corrected.id}::uuid`;
    assert.equal(time.us, r.terminalUs);
    assert.equal(corrected.saldoDespues, 99);
  } finally {
    await realClock();
  }
});
test('TUG settlement: legacy remains ineligible and individual registry remains blocked', async () => {
  const f = await fixture(false, false);
  await engine.abandonar(f.users[0].id, f.id);
  await assert.rejects(pair.settlePrecisePair(f.id), /NOT_ADMITTED/);
  await noXp(f);
  await assert.rejects(
    pair.settle({
      sourceType: 'TUG_MATCH',
      sourceId: f.id,
      participantId: f.users[0].id,
    }),
    /SOURCE_NOT_INTEGRATED/,
  );
});
test('TUG settlement: contradictory hash and partial prior payment are rejected, privileged fixtures rolled back', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    const r = await pair.settlePrecisePair(f.id);
    for (const defect of ['hash', 'partial']) {
      const sentinel = new Error('owned rollback ' + defect);
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER TABLE "TugCompetitiveSettlement" DISABLE TRIGGER USER',
          );
          if (defect === 'hash')
            await tx.$executeRaw`UPDATE "TugCompetitiveSettlement" SET decision=jsonb_set(decision,'{hash}',to_jsonb(repeat('0',64))) WHERE "sourceId"=${f.id}::uuid`;
          else {
            await tx.$executeRawUnsafe(
              'ALTER TABLE "EventoXpCompetitivo" DISABLE TRIGGER USER',
            );
            await tx.$executeRaw`DELETE FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
            await tx.$executeRaw`DELETE FROM "EventoXpCompetitivo" WHERE id=${r.decisions[1].eventId}::uuid`;
          }
          const nested = new CompetitiveTugPairProtocol({
            $transaction: (fn) => fn(tx),
          });
          await assert.rejects(
            nested.settlePrecisePair(f.id),
            defect === 'hash'
              ? /IDEMPOTENCY_CONFLICT/
              : /PAIR_PARTIAL_SETTLEMENT/,
          );
          throw sentinel;
        }),
        (e) => e === sentinel,
      );
      assert.deepEqual(await pair.settlePrecisePair(f.id), r);
      assert.equal((await events(f)).length, 2);
    }
  } finally {
    await realClock();
  }
});
test('TUG settlement: repeated real matches apply -15 to existing balance without changing general XP', async () => {
  const f = await fixture(true);
  try {
    await finishNormal(f);
    await pair.settlePrecisePair(f.id);
    await realClock();
    process.env.COMPETITIVE_TUG_ENABLED = 'true';
    const id = (await engine.emparejar(f.users[0].id, 'INGLES')).partida.id;
    assert.equal(
      (await restarted.emparejar(f.users[1].id, 'INGLES')).partida.id,
      id,
    );
    const next = { id, users: f.users, sockets: [randomUUID(), randomUUID()] };
    for (let i = 0; i < 2; i++)
      await presence.connect(next.users[i].id, id, next.sockets[i]);
    await activate(next);
    await engine.abandonar(next.users[0].id, id);
    const r = await pair.settlePrecisePair(id),
      ev = (await events(next)).find((e) => e.usuarioId === f.users[0].id);
    assert.equal(r.decisions[0].nominal, -15);
    assert.equal(ev.saldoAntes, 100);
    assert.equal(ev.deltaAplicado, -15);
    assert.equal(ev.saldoDespues, 85);
    assert.equal(ev.secuencia, 2);
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: f.users[0].id } }))
        .xpTotal,
      123,
    );
  } finally {
    await realClock();
  }
});
test('TUG persistence: exact microsecond at Bogota season and institutional boundary is not rounded forward', async () => {
  const u = await db.usuario.create({
    data: {
      nombre: 'Boundary owned',
      correo: randomUUID() + '@example.invalid',
      contrasenaHash: 'none',
      rol: 'ESTUDIANTE',
      correoVerificado: true,
    },
  });
  const first = await db.institucion.create({
    data: { nombre: 'First owned ' + randomUUID(), codigoUnico: randomUUID() },
  });
  const second = await db.institucion.create({
    data: { nombre: 'Second owned ' + randomUUID(), codigoUnico: randomUUID() },
  });
  const sentinel = new Error('owned history rollback');
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.historialInstitucionCompetitiva.create({
        data: {
          usuarioId: u.id,
          institucionId: first.id,
          desde: new Date('2026-12-31T05:00:00.000Z'),
        },
      });
      await tx.historialInstitucionCompetitiva.create({
        data: {
          usuarioId: u.id,
          institucionId: second.id,
          desde: new Date('2027-01-01T05:00:00.000Z'),
        },
      });
      for (const [iso, expectedInstitution, expectedSeason] of [
        ['2027-01-01T04:59:59.999999Z', first.id, 2026],
        ['2027-01-01T05:00:00.000000Z', second.id, 2027],
      ]) {
        const [terminal] =
          await tx.$queryRaw`SELECT (extract(epoch FROM ${iso}::timestamptz)*1000000)::bigint::text AS us`;
        const [covered] =
          await tx.$queryRaw`SELECT "institucionId" AS institution,extract(year FROM competitive_timestamp_us(${terminal.us}::bigint) AT TIME ZONE 'America/Bogota')::int AS season FROM "HistorialInstitucionCompetitiva" WHERE "usuarioId"=${u.id}::uuid AND desde<=competitive_timestamp_us(${terminal.us}::bigint) ORDER BY desde DESC,id DESC LIMIT 1`;
        assert.equal(covered.institution, expectedInstitution);
        assert.equal(covered.season, expectedSeason);
      }
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.equal(
    await db.historialInstitucionCompetitiva.count({
      where: { usuarioId: u.id, institucionId: { not: null } },
    }),
    0,
  );
});
test('TUG recovery: invalid evidence is durable, diagnosed and not retried indefinitely', async () => {
  const f = await fixture();
  await engine.abandonar(f.users[0].id, f.id);
  const invalid = {
    settlePrecisePair: async () => {
      const {
        CompetitiveError,
      } = require('../src/competitive/competitive.rules');
      throw new CompetitiveError('TUG_REPLAY_TEST_CONTRADICTION');
    },
  };
  await new TugCompetitiveReconciler(db, invalid).reconcile();
  const [s] =
    await db.$queryRaw`SELECT state,attempts,"lastError" FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
  assert.equal(s.state, 'INVALID');
  assert.equal(s.attempts, 1);
  assert.equal(s.lastError, 'TUG_REPLAY_TEST_CONTRADICTION');
  await new TugCompetitiveReconciler(db, invalid).reconcile();
  const [unchanged] =
    await db.$queryRaw`SELECT attempts FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
  assert.equal(unchanged.attempts, 1);
  await noXp(f);
});
test('TUG settlement: institution is frozen at terminal, not current institution after closure', async () => {
  const f = await fixture(true);
  try {
    const old = await db.institucion.create({
      data: {
        nombre: 'Terminal original ' + randomUUID(),
        codigoUnico: randomUUID(),
      },
    });
    const current = await db.institucion.create({
      data: {
        nombre: 'Terminal changed ' + randomUUID(),
        codigoUnico: randomUUID(),
      },
    });
    await db.usuario.updateMany({
      where: { id: { in: f.users.map((u) => u.id) } },
      data: { institucionId: old.id },
    });
    await finishNormal(f);
    await realClock();
    await db.usuario.updateMany({
      where: { id: { in: f.users.map((u) => u.id) } },
      data: { institucionId: current.id },
    });
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [100, 0], r);
    for (const e of await events(f)) assert.equal(e.institucionId, old.id);
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: f.users[0].id } }))
        .institucionId,
      current.id,
    );
  } finally {
    await realClock();
  }
});
test('TUG settlement: missing historical coverage blocks the whole pair before any event, owned mutation rolled back', async () => {
  const f = await fixture(true);
  try {
    await boundary(f);
    await answer(f, 1, false);
    await engine.abandonar(f.users[0].id, f.id);
    const sentinel = new Error('owned history coverage rollback');
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          'ALTER TABLE "HistorialInstitucionCompetitiva" DISABLE TRIGGER USER',
        );
        await tx.$executeRaw`DELETE FROM "HistorialInstitucionCompetitiva" WHERE "usuarioId"=${f.users[0].id}::uuid`;
        await assert.rejects(
          new CompetitiveTugPairProtocol({
            $transaction: (fn) => fn(tx),
          }).settlePrecisePair(f.id),
          /HISTORICAL_MEMBERSHIP_UNKNOWN/,
        );
        assert.equal(
          await tx.eventoXpCompetitivo.count({
            where: { sourceType: 'TUG_MATCH', sourceId: f.id },
          }),
          0,
        );
        assert.equal(
          await tx.balanceCompetitivo.count({
            where: { usuarioId: { in: f.users.map((u) => u.id) } },
          }),
          0,
        );
        throw sentinel;
      }),
      (e) => e === sentinel,
    );
    const r = await pair.settlePrecisePair(f.id);
    await finalValues(f, [-15, 20], r);
  } finally {
    await realClock();
  }
});


async function presentedDeadline(f) {
  // Parent countdown fields are cleared at terminal; only frozen R is evidence.
  await db.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM
    (least(r."venceEn",m."expiraEn")-timezone('UTC',clock_timestamp())))))::text
    FROM "TiraAflojaRondaPresentada" r JOIN "PartidaTiraAfloja" m ON m.id=r."partidaId"
    WHERE r."partidaId"=${f.id}::uuid AND r.ronda=1 LIMIT 1`;
  const [proof] = await db.$queryRaw`SELECT timezone('UTC',clock_timestamp())>=least(r."venceEn",m."expiraEn") AS elapsed
    FROM "TiraAflojaRondaPresentada" r JOIN "PartidaTiraAfloja" m ON m.id=r."partidaId"
    WHERE r."partidaId"=${f.id}::uuid AND r.ronda=1 LIMIT 1`;
  assert.equal(proof.elapsed, true);
}

test('TUG recovery: on-time independent observation commits after deadline without quarantining the recovery gap', async () => {
  const originalA = engine.visibilityWitness.certify;
  const originalB = restarted.visibilityWitness.certify;
  engine.visibilityWitness.certify = async () => {};
  restarted.visibilityWitness.certify = async () => {};
  let release, witness, resumeClassification, recovery;
  try {
    const f = await fixture(true);
    await boundary(f);
    await answer(f, 1, false);
    await engine.abandonar(f.users[0].id, f.id);
    await noXp(f);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.id } }), 0);
    let absent;
    const absencePromise = new Promise(resolve => { absent = resolve; });
    const classificationGate = new Promise(resolve => { resumeClassification = resolve; });
    // Pause only delivery of a REAL replay rejection, after its tx rolled back.
    // This exposes the gap before the worker's independent classification read.
    class RecoveryGapPair extends CompetitiveTugPairProtocol {
      async settlePrecisePair(id) {
        if (id !== f.id) return super.settlePrecisePair(id);
        try { return await super.settlePrecisePair(id); }
        catch (error) {
          assert.equal(error.code, 'TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN');
          absent();
          await classificationGate;
          throw error;
        }
      }
    }
    recovery = new TugCompetitiveReconciler(db, new RecoveryGapPair(db)).reconcile();
    await Promise.race([absencePromise, recovery.then(() => { throw new Error('recovery exited before missing certificate'); })]);
    let observed;
    const observedPromise = new Promise(resolve => { observed = resolve; });
    const commitGate = new Promise(resolve => { release = resolve; });
    witness = other.$transaction(async tx => {
      const [result] = await tx.$queryRaw`SELECT tug_certify_presented_round(${f.id}::uuid,1) AS certified`;
      assert.equal(result.certified, true);
      const [proof] = await tx.$queryRaw`SELECT "observadaEn"<"limiteEn" AS timely FROM "TugRoundVisibility" WHERE "partidaId"=${f.id}::uuid`;
      assert.equal(proof.timely, true);
      observed();
      await commitGate;
    }, { timeout: 60000 });
    // Propagate a witness failure instead of leaving the test waiting forever.
    await Promise.race([observedPromise, witness.then(() => { throw new Error('witness exited before observation'); })]);
    await presentedDeadline(f);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.id } }), 0);
    // Reproduce the former predicate, without applying its destructive result.
    const [former] = await db.$queryRaw`SELECT EXISTS(SELECT 1 FROM "TiraAflojaRondaPresentada" r
      JOIN "PartidaTiraAfloja" m ON m.id=r."partidaId"
      WHERE r."partidaId"=${f.id}::uuid AND NOT EXISTS(SELECT 1 FROM "TugRoundVisibility" v
        WHERE v."partidaId"=r."partidaId" AND v.ronda=r.ronda)
      AND tug_presence_now()<least(r."venceEn",m."expiraEn")) AS open`;
    assert.equal(former.open, false); // the former worker would select INVALID
    // The certificate is invisible and the deadline passed, but its original
    // observation is valid. The classification query must not quarantine it.
    resumeClassification();
    await recovery;
    recovery = undefined;
    const [pending] = await db.$queryRaw`SELECT state,"lastError",attempts FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
    assert.equal(pending.state, 'PENDING');
    assert.equal(pending.lastError, 'TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN');
    assert.equal(pending.attempts, 1);
    await noXp(f);
    release();
    await witness;
    witness = undefined;
    const [proof] = await db.$queryRaw`SELECT "observadaEn"<"limiteEn" AS timely, timezone('UTC',clock_timestamp())>"limiteEn" AS late FROM "TugRoundVisibility" WHERE "partidaId"=${f.id}::uuid`;
    assert.equal(proof.timely, true);
    assert.equal(proof.late, true);
    await db.$executeRaw`UPDATE "TugCompetitiveSettlement" SET "retryAt"=clock_timestamp() WHERE "sourceId"=${f.id}::uuid`;
    await new TugCompetitiveReconciler(db, pair).reconcile();
    const receipt = await pair.settlePrecisePair(f.id);
    await finalValues(f, [-15, 20], receipt);
    await new TugCompetitiveReconciler(db, pair).reconcile();
    assert.equal((await events(f)).length, 2);
  } finally {
    release?.();
    resumeClassification?.();
    if (witness) await witness;
    if (recovery) await recovery;
    engine.visibilityWitness.certify = originalA;
    restarted.visibilityWitness.certify = originalB;
    await realClock();
  }
});

test('TUG recovery: missing observation after deadline stays diagnosed without fabricating R or XP', async () => {
  const originalA = engine.visibilityWitness.certify;
  const originalB = restarted.visibilityWitness.certify;
  engine.visibilityWitness.certify = async () => {};
  restarted.visibilityWitness.certify = async () => {};
  try {
    const f = await fixture(true);
    await boundary(f);
    await answer(f, 1, false);
    await engine.abandonar(f.users[0].id, f.id);
    await presentedDeadline(f);
    await new TugCompetitiveReconciler(db, pair).reconcile();
    const [pending] = await db.$queryRaw`SELECT state,"lastError",attempts,"retryAt">clock_timestamp()+interval '4 minutes' AS slow FROM "TugCompetitiveSettlement" WHERE "sourceId"=${f.id}::uuid`;
    assert.equal(pending.state, 'PENDING');
    assert.equal(pending.lastError, 'TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN');
    assert.equal(pending.slow, true);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.id } }), 0);
    await noXp(f);
    const [late] = await other.$queryRaw`SELECT tug_certify_presented_round(${f.id}::uuid,1) AS certified`;
    assert.equal(late.certified, false);
    await new TugCompetitiveReconciler(db, pair).reconcile();
    await noXp(f);
    assert.equal(await db.tugRoundVisibility.count({ where: { partidaId: f.id } }), 0);
  } finally {
    engine.visibilityWitness.certify = originalA;
    restarted.visibilityWitness.certify = originalB;
    await realClock();
  }
});
