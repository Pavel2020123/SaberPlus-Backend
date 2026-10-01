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
  CompetitiveReconciler,
} = require('../src/competitive/competitive.reconciler');
const {
  createSoloVerifiers,
  SOLO_GAMES,
} = require('../src/competitive/competitive.solo');
const { SummitService } = require('../src/summit/summit.service');
const { GuardianService } = require('../src/guardian/guardian.service');
const { StarRescueService } = require('../src/star-rescue/star-rescue.service');
let db, competitive, bank;
const previousSoloFlag = process.env.COMPETITIVE_SOLO_ENABLED;
const games = [
  {
    ...SOLO_GAMES[0],
    delegate: 'intentoCima',
    service: SummitService,
    win: 5,
    lose: [
      true,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ],
    lossXp: 15,
    lossState: 'AGOTADO',
  },
  {
    ...SOLO_GAMES[1],
    delegate: 'intentoGuardian',
    service: GuardianService,
    win: 6,
    lose: [true, false, false, false],
    lossXp: 10,
    lossState: 'DERROTA',
  },
  {
    ...SOLO_GAMES[2],
    delegate: 'intentoRescateEstrellas',
    service: StarRescueService,
    win: 6,
    lose: [true, true, true, false, false, false, false, false, false, false],
    lossXp: 40,
    lossState: 'AGOTADO',
  },
];
before(async () => {
  process.env.COMPETITIVE_SOLO_ENABLED = 'true';
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  db = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  await db.$connect();
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createSoloVerifiers()),
  );
  const topic = await db.tema.create({
    data: {
      nombre: 'Competitive fixture',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const sub = await db.subtema.create({
    data: { nombre: 'Fixture', temaId: topic.id, estadoContenido: 'PUBLICADO' },
  });
  for (let i = 0; i < 12; i++) {
    const id = randomUUID();
    await db.pregunta.create({
      data: {
        id,
        subtemaId: sub.id,
        enunciado: `Fixture ${i}`,
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        respuestas: {
          create: [
            { id: `${id}-yes`, texto: 'One', esCorrecta: true },
            { id: `${id}-no`, texto: 'Two', esCorrecta: false },
          ],
        },
      },
    });
  }
  bank = { area: 'MATEMATICAS', dificultad: 'BASICO', subtemaId: sub.id };
});
after(async () => {
  if (previousSoloFlag === undefined)
    delete process.env.COMPETITIVE_SOLO_ENABLED;
  else process.env.COMPETITIVE_SOLO_ENABLED = previousSoloFlag;
  await db?.$disconnect();
});
async function user(rol = 'ESTUDIANTE', institution = null) {
  const u = await db.usuario.create({
    data: {
      nombre: 'Fixture',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-login',
      correoVerificado: true,
      rol,
      institucionId: institution,
      xpTotal: 123,
    },
  });
  await new Promise((r) => setTimeout(r, 5));
  return u;
}
async function setup(game, enabled = true) {
  const u = await user(),
    service = new game.service(db);
  const state = await service.start(u.id, {
    ...bank,
    ...(enabled ? { competitive: true } : {}),
  });
  return {
    u,
    service,
    state,
    ref: {
      sourceType: game.sourceType,
      sourceId: state.id,
      participantId: u.id,
    },
  };
}
const input = (state, correct, idempotencyKey = randomUUID()) => ({
  preguntaId: state.pregunta.id,
  respuestaId: `${state.pregunta.id}-${correct ? 'yes' : 'no'}`,
  idempotencyKey,
});
async function play(f, choices) {
  for (const right of choices)
    f.state = await f.service.answer(f.u.id, f.state.id, input(f.state, right));
  return f.state;
}
const eventCount = (ref) =>
  db.eventoXpCompetitivo.count({
    where: {
      sourceType: ref.sourceType,
      sourceId: ref.sourceId,
      usuarioId: ref.participantId,
    },
  });
const reconcile = () => new CompetitiveReconciler(db, competitive).reconcile();
async function synthetic(game, original, changes) {
  const row = await db[game.delegate].findUniqueOrThrow({
    where: { id: original.state.id },
  });
  // Respect the existing one-active-attempt-per-user constraint. This is fixture
  // setup, not a second simultaneous live attempt or a relaxation of the DB.
  if (row.estado === 'ACTIVO')
    await original.service.abandon(original.u.id, row.id);
  const { id, competitiveSettledAt, competitiveRetryAt, ...data } = row;
  return db[game.delegate].create({
    data: {
      ...data,
      ...changes,
      id: randomUUID(),
      estado: 'ACTIVO',
      respuestas: [],
      finalizadoEn: null,
    },
  });
}
async function assertNoSecrets(state) {
  const json = JSON.stringify(state);
  for (const secret of [
    'competitiveRetryAt',
    'competitiveSettledAt',
    'evidenciaHash',
    'sourceType',
    'institucionId',
    'competitiveRulesVersion',
    'idempotencyKey',
  ])
    assert.ok(!json.includes(secret), secret);
}

for (const game of games) {
  test(`${game.gameId}: disabled admission preserves legacy and accepted competitive recovery`, async () => {
    try {
      delete process.env.COMPETITIVE_SOLO_ENABLED;
      const u = await user();
      const service = new game.service(db);
      for (const value of [undefined, 'false']) {
        if (value === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
        else process.env.COMPETITIVE_SOLO_ENABLED = value;
        await assert.rejects(
          service.start(u.id, { ...bank, competitive: true }),
          (e) =>
            e.getStatus?.() === 403 &&
            e.getResponse().code === 'COMPETITIVE_SOLO_DISABLED',
        );
        assert.equal(
          await db[game.delegate].count({ where: { usuarioId: u.id } }),
          0,
        );
      }
      const legacy = await setup(game, false);
      assert.equal(legacy.state.competitive, false);
      await play(legacy, Array(game.win).fill(true));
      await reconcile();
      assert.equal(await eventCount(legacy.ref), 0);

      process.env.COMPETITIVE_SOLO_ENABLED = 'true';
      const accepted = await setup(game);
      assert.equal(accepted.state.competitive, true);
      process.env.COMPETITIVE_SOLO_ENABLED = 'false';
      const resumed = await accepted.service.start(accepted.u.id, {
        ...bank,
        competitive: true,
      });
      assert.equal(resumed.id, accepted.state.id);
      await play(accepted, Array(game.win).fill(true));
      assert.equal(await eventCount(accepted.ref), 0);
      await Promise.all([reconcile(), reconcile()]);
      assert.equal(await eventCount(accepted.ref), 1);
      const event = await competitive.settle(accepted.ref);
      assert.equal(event.deltaAplicado, 100);
      assert.ok(
        (
          await db[game.delegate].findUniqueOrThrow({
            where: { id: accepted.state.id },
          })
        ).competitiveSettledAt,
      );
      await assert.rejects(
        accepted.service.start(accepted.u.id, { ...bank, competitive: true }),
        (e) => e.getResponse?.().code === 'COMPETITIVE_SOLO_DISABLED',
      );
    } finally {
      process.env.COMPETITIVE_SOLO_ENABLED = 'true';
    }
  });
  test(`${game.gameId}: legacy creation and historical terminals never accrue competitive XP`, async () => {
    const f = await setup(game, false);
    assert.equal(f.state.competitive, false);
    assert.equal(
      (await db[game.delegate].findUnique({ where: { id: f.state.id } }))
        .competitiveRulesVersion,
      null,
    );
    await play(f, Array(game.win).fill(true));
    await reconcile();
    assert.equal(await eventCount(f.ref), 0);
    await assert.rejects(competitive.settle(f.ref), /INELIGIBLE_SOURCE/);
    await assert.rejects(
      db[game.delegate].update({
        where: { id: f.state.id },
        data: { competitiveRulesVersion: 1 },
      }),
    );
  });
  test(`${game.gameId}: verified win, replay, simultaneous settlement and crash before ledger`, async () => {
    const f = await setup(game);
    assert.equal(f.state.competitive, true);
    await assertNoSecrets(f.state);
    await play(f, Array(game.win - 1).fill(true));
    const last = input(f.state, true);
    const [a, b] = await Promise.all([
      f.service.answer(f.u.id, f.state.id, last),
      f.service.answer(f.u.id, f.state.id, last),
    ]);
    assert.equal(a.estado, 'VICTORIA');
    assert.deepEqual(a, b);
    await assertNoSecrets(a);
    // The process may die now: no memory callback or ledger exists, only terminal DB evidence.
    assert.equal(await eventCount(f.ref), 0);
    assert.equal(
      (await db[game.delegate].findUnique({ where: { id: f.state.id } }))
        .competitiveSettledAt,
      null,
    );
    await Promise.all([reconcile(), reconcile(), competitive.settle(f.ref)]);
    const event = await competitive.settle(f.ref);
    assert.equal(event.deltaNominal, 100);
    assert.equal(event.tipo, 'RESULTADO');
    assert.equal(await eventCount(f.ref), 1);
    const row = await db[game.delegate].findUnique({
      where: { id: f.state.id },
    });
    assert.ok(row.competitiveSettledAt);
    assert.equal(
      (
        await competitive.settle({
          ...f.ref,
          sourceId: f.ref.sourceId.toUpperCase(),
        })
      ).id,
      event.id,
    );
    assert.equal(
      (await db.usuario.findUnique({ where: { id: f.u.id } })).xpTotal,
      123,
    );
  });
  test(`${game.gameId}: defeat/exhaustion yields the exact verified partial result`, async () => {
    const f = await setup(game);
    await play(f, game.lose);
    assert.equal(f.state.estado, game.lossState);
    await reconcile();
    const event = await competitive.settle(f.ref);
    assert.equal(event.deltaNominal, game.lossXp);
    assert.equal(event.tipo, 'RESULTADO');
  });
  test(`${game.gameId}: explicit abandonment pays no partial positive XP and uses the floor`, async () => {
    const f = await setup(game);
    await play(f, [true]);
    await Promise.all([
      f.service.abandon(f.u.id, f.state.id),
      f.service.abandon(f.u.id, f.state.id),
    ]);
    await reconcile();
    const event = await competitive.settle(f.ref);
    assert.equal(event.tipo, 'ABANDONO');
    assert.equal(event.deltaNominal, -10);
    assert.equal(event.deltaAplicado, 0);
    assert.equal(await eventCount(f.ref), 1);
  });
  test(`${game.gameId}: nonstudents, foreign sources, invalid IDs, active attempts, immutable mode/config`, async () => {
    const f = await setup(game);
    for (const role of ['PROFESOR', 'ADMIN']) {
      const u = await user(role);
      await assert.rejects(
        f.service.start(u.id, { ...bank, competitive: true }),
        (e) => e.getStatus?.() === 403,
      );
    }
    const other = await user();
    await assert.rejects(
      competitive.settle({ ...f.ref, participantId: other.id }),
      /SOURCE_MISMATCH/,
    );
    await assert.rejects(
      f.service.get(other.id, f.state.id),
      (e) => e.getStatus?.() === 404,
    );
    await assert.rejects(
      competitive.settle({ ...f.ref, sourceId: 'bad' }),
      /INVALID_SOURCE_ID/,
    );
    await assert.rejects(competitive.settle(f.ref), /SOURCE_NOT_TERMINAL/);
    await assert.rejects(
      f.service.start(f.u.id, { ...bank, competitive: false }),
      (e) => e.getStatus?.() === 409,
    );
    const row = await db[game.delegate].findUnique({
      where: { id: f.state.id },
    });
    for (const data of [
      { competitiveRulesVersion: null },
      { preguntas: [] },
      { venceEn: new Date(+row.venceEn + 1) },
      { competitiveSettledAt: new Date() },
    ])
      await assert.rejects(
        db[game.delegate].update({ where: { id: row.id }, data }),
      );
    assert.equal(await eventCount(f.ref), 0);
  });
  test(`${game.gameId}: corrupt snapshots/answers fail closed; client final values are ignored`, async () => {
    const f = await setup(game);
    const wrong = {
      ...input(f.state, false),
      xp: 999,
      victory: true,
      H: 5,
      estrellas: 6,
      institucionId: randomUUID(),
      temporada: 1900,
      esCorrecta: true,
    };
    f.state = await f.service.answer(f.u.id, f.state.id, wrong);
    const saved = await db[game.delegate].findUnique({
      where: { id: f.state.id },
    });
    assert.equal(saved.respuestas[0].esCorrecta, false);
    assert.equal(saved.respuestas[0].xp, undefined);
    const badSnapshot = structuredClone(saved.preguntas);
    badSnapshot[0].correctAnswerId = 'not-an-option';
    const malformed = await synthetic(game, f, { preguntas: badSnapshot });
    await db[game.delegate].update({
      where: { id: malformed.id },
      data: { estado: 'ABANDONADO', finalizadoEn: new Date() },
    });
    await assert.rejects(
      competitive.settle({ ...f.ref, sourceId: malformed.id }),
      /INVALID_SOLO_SNAPSHOT/,
    );
    const corrupt = await synthetic(game, f, {}),
      q = corrupt.preguntas[0];
    await db[game.delegate].update({
      where: { id: corrupt.id },
      data: {
        respuestas: [
          {
            preguntaId: q.question.id,
            respuestaId: q.correctAnswerId,
            esCorrecta: false,
            idempotencyKey: randomUUID(),
          },
        ],
        estado: 'ABANDONADO',
        finalizadoEn: new Date(),
      },
    });
    await assert.rejects(
      competitive.settle({ ...f.ref, sourceId: corrupt.id }),
      /INVALID_SOLO_EVIDENCE/,
    );
    assert.equal(await eventCount({ ...f.ref, sourceId: malformed.id }), 0);
  });
  test(`${game.gameId}: 24h expiry wins against a late answer and is recoverable without heartbeat`, async () => {
    const f = await setup(game);
    const terminal = new Date(Date.now() - 1000),
      start = new Date(+terminal - 86_400_000);
    await db.historialInstitucionCompetitiva.create({
      data: { usuarioId: f.u.id, institucionId: null, desde: start },
    }); // synthetic known history only
    const expired = await synthetic(game, f, {
      creadoEn: start,
      venceEn: terminal,
    });
    const ref = { ...f.ref, sourceId: expired.id };
    const answer = {
      preguntaId: expired.preguntas[0].question.id,
      respuestaId: expired.preguntas[0].correctAnswerId,
      idempotencyKey: randomUUID(),
    };
    await Promise.all([
      f.service.answer(f.u.id, expired.id, answer),
      reconcile(),
      reconcile(),
    ]);
    await reconcile();
    const event = await competitive.settle(ref);
    assert.equal(event.tipo, 'ABANDONO');
    assert.equal(event.deltaNominal, -10);
    assert.deepEqual(event.fechaEfectiva, terminal);
    const persisted = await db[game.delegate].findUnique({
      where: { id: expired.id },
    });
    assert.equal(persisted.respuestas.length, 0);
    assert.equal(persisted.estado, 'EXPIRADO');
    assert.equal(await eventCount(ref), 1);
  });
  test(`${game.gameId}: historical institution and Bogota year come from terminal time, not retry`, async () => {
    const f = await setup(game);
    const school = await db.institucion.create({
      data: { nombre: 'Fixture', codigoUnico: randomUUID() },
    });
    await db.usuario.update({
      where: { id: f.u.id },
      data: { institucionId: school.id },
    });
    await new Promise((r) => setTimeout(r, 5));
    await play(f, Array(game.win).fill(true));
    await new Promise((r) => setTimeout(r, 5));
    await db.usuario.update({
      where: { id: f.u.id },
      data: { institucionId: null },
    });
    await reconcile();
    assert.equal((await competitive.settle(f.ref)).institucionId, school.id);
    // Synthetic past server attempt: no change to an existing attempt's immutable time.
    for (const [date, year] of [
      ['2026-01-01T04:59:59.999Z', 2025],
      ['2026-01-01T05:00:00.000Z', 2026],
    ]) {
      const end = new Date(date),
        start = new Date(+end - 86_400_000);
      await db.historialInstitucionCompetitiva.create({
        data: { usuarioId: f.u.id, institucionId: school.id, desde: start },
      });
      const row = await synthetic(game, f, { creadoEn: start, venceEn: end });
      await db[game.delegate].update({
        where: { id: row.id },
        data: { estado: 'EXPIRADO', finalizadoEn: end },
      });
      const event = await competitive.settle({ ...f.ref, sourceId: row.id });
      assert.equal(event.temporada, year);
      assert.equal(event.institucionId, school.id);
    }
  });
  test(`${game.gameId}: the worker alone expires an unattended attempt`, async () => {
    const f = await setup(game),
      end = new Date(Date.now() - 1000),
      start = new Date(+end - 86_400_000);
    await db.historialInstitucionCompetitiva.create({
      data: { usuarioId: f.u.id, institucionId: null, desde: start },
    });
    const row = await synthetic(game, f, { creadoEn: start, venceEn: end });
    assert.equal(row.estado, 'ACTIVO');
    await reconcile();
    const saved = await db[game.delegate].findUniqueOrThrow({
      where: { id: row.id },
    });
    assert.equal(saved.estado, 'EXPIRADO');
    assert.deepEqual(saved.finalizadoEn, end);
    assert.ok(saved.competitiveSettledAt);
    const event = await competitive.settle({ ...f.ref, sourceId: row.id });
    assert.equal(event.tipo, 'ABANDONO');
    assert.equal(event.deltaNominal, -10);
  });
  test(`${game.gameId}: ledger committed but acknowledgment lost reuses event after restart`, async () => {
    const f = await setup(game);
    await play(f, Array(game.win).fill(true));
    const failing = {
      settle: async (ref) => {
        const event = await competitive.settle(ref);
        if (ref.sourceId === f.ref.sourceId)
          throw new Error('simulated crash after commit');
        return event;
      },
    };
    await new CompetitiveReconciler(db, failing).reconcile();
    assert.equal(await eventCount(f.ref), 1);
    const before = await db[game.delegate].findUnique({
      where: { id: f.state.id },
    });
    assert.equal(before.competitiveSettledAt, null);
    await db[game.delegate].update({
      where: { id: before.id },
      data: { competitiveRetryAt: new Date(0) },
    }); // advance retry eligibility instead of waiting 60s
    await reconcile();
    assert.equal(await eventCount(f.ref), 1);
    assert.ok(
      (await db[game.delegate].findUnique({ where: { id: before.id } }))
        .competitiveSettledAt,
    );
  });
  test(`${game.gameId}: missing historical coverage remains pending and never falls back to current institution`, async () => {
    const f = await setup(game),
      end = new Date('2020-01-02T00:00:00Z');
    const row = await synthetic(game, f, {
      creadoEn: new Date(+end - 86_400_000),
      venceEn: end,
    });
    await db[game.delegate].update({
      where: { id: row.id },
      data: { estado: 'EXPIRADO', finalizadoEn: end },
    });
    await assert.rejects(
      competitive.settle({ ...f.ref, sourceId: row.id }),
      /HISTORICAL_MEMBERSHIP_UNKNOWN/,
    );
    await reconcile();
    assert.equal(await eventCount({ ...f.ref, sourceId: row.id }), 0);
    assert.equal(
      (await db[game.delegate].findUnique({ where: { id: row.id } }))
        .competitiveSettledAt,
      null,
    );
  });
}
test('the other five games remain unavailable through the production registry', async () => {
  const u = await user();
  for (const sourceType of ['TRIVIA_ATTEMPT', 'TUG_MATCH', 'BATTLE'])
    await assert.rejects(
      competitive.settle({
        sourceType,
        sourceId: randomUUID(),
        participantId: u.id,
      }),
      /SOURCE_NOT_INTEGRATED/,
    );
  await assert.rejects(
    competitive.settle({
      sourceType: 'MEMORY_ATTEMPT',
      sourceId: randomUUID(),
      participantId: u.id,
    }),
    /MEMORY_COMPETITIVE_DISABLED/,
  );
});
test('all three snapshot tables stay private with RLS and public role access denied', async () => {
  for (const game of games) {
    const [row] =
      await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE relname = ${game.table}`;
    assert.equal(row.relrowsecurity, true);
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${game.table}"`);
        }),
        (error) => error.meta?.code === '42501',
      );
    }
  }
});
