require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { TriviaRushService } = require('../src/trivia-rush/trivia-rush.service');
const {
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
const {
  TriviaCompetitiveReconciler,
} = require('../src/competitive/competitive.trivia-reconciler');
const { Test } = require('@nestjs/testing');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const {
  TriviaRushController,
} = require('../src/trivia-rush/trivia-rush.controller');
const { PrismaService } = require('../src/prisma/prisma.service');
const request = require('supertest');
let db, engine, competitive, worker, app, jwt;
const config = { areas: ['LECTURA_CRITICA'], duracionSegundos: 120 };
const flags = ['COMPETITIVE_TRIVIA_ENABLED', 'COMPETITIVE_GHOST_ENABLED'];
const old = flags.map((k) => process.env[k]);
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
  engine = new TriviaRushService(db);
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
  );
  worker = new TriviaCompetitiveReconciler(db, competitive);
  const topic = await db.tema.create({
    data: {
      nombre: 'XP fixture',
      area: 'LECTURA_CRITICA',
      estadoContenido: 'PUBLICADO',
    },
  });
  const sub = await db.subtema.create({
    data: {
      nombre: 'XP fixture',
      temaId: topic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  for (let i = 0; i < 10; i++)
    await db.pregunta.create({
      data: {
        id: randomUUID(),
        enunciado: `XP ${i}`,
        dificultad: 'BASICO',
        subtemaId: sub.id,
        estadoContenido: 'PUBLICADO',
        respuestas: {
          create: Array.from({ length: 4 }, (_, n) => ({
            id: randomUUID(),
            texto: `Option ${n}`,
            esCorrecta: n === 0,
          })),
        },
      },
    });
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'disposable-trivia-xp-only' })],
    controllers: [TriviaRushController],
    providers: [TriviaRushService, { provide: PrismaService, useValue: db }],
  }).compile();
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  await app.listen(0, '127.0.0.1');
  jwt = module.get(JwtService);
  flags.forEach((k) => delete process.env[k]);
});
after(async () => {
  await app?.close();
  await worker?.onModuleDestroy();
  await db?.$disconnect();
  flags.forEach((k, i) =>
    old[i] === undefined ? delete process.env[k] : (process.env[k] = old[i]),
  );
});
async function user(rol = 'ESTUDIANTE', institucionId) {
  return db.usuario.create({
    data: {
      nombre: 'XP',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-login',
      correoVerificado: true,
      rol,
      xpTotal: 123,
      ...(institucionId ? { institucionId } : {}),
    },
  });
}
const row = (id) => db.intentoTriviaRush.findUniqueOrThrow({ where: { id } });
const source = (f) => ({
  sourceType: 'TRIVIA_ATTEMPT',
  sourceId: f.id,
  participantId: f.u.id,
});
async function start(mode = 'TRIVIA_RUSH', u) {
  u ??= await user();
  process.env[mode === 'TRIVIA_RUSH' ? flags[0] : flags[1]] = 'true';
  const r = await engine.crear(u.id, {
    ...config,
    modalidad: mode,
    competitive: true,
  });
  const f = { u, id: r.intento.id, response: r };
  assert.equal((await row(f.id)).snapshotInicial.q, 10);
  await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,NULL::timestamp)`;
  return f;
}
async function answer(f, correct = true, key = randomUUID()) {
  const r = await row(f.id),
    q = r.snapshotInicial.questions[r.indiceActual];
  return engine.responder(f.u.id, f.id, {
    preguntaId: q.preguntaId,
    respuestaId: q.pregunta.respuestas.find((a) => a.esCorrecta === correct).id,
    idempotencyKey: key,
  });
}
async function finish(f, correct = true) {
  let i = 0;
  while ((await row(f.id)).estado === 'ACTIVO')
    await answer(f, typeof correct === 'function' ? correct(i++) : correct);
}
async function helper(f, tipo) {
  const r = await row(f.id);
  const grant = await db.concesionRecompensaJuego.create({
    data: {
      usuarioId: f.u.id,
      proveedor: 'TEST',
      referenciaProveedor: randomUUID(),
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  return engine.activarPotenciador(f.u.id, f.id, {
    preguntaId: r.preguntaActualId,
    potenciador: tipo,
    concesionId: grant.id,
    idempotencyKey: randomUUID(),
  });
}
async function checkXp(f, xp) {
  const e = await competitive.settle(source(f));
  assert.equal(e.deltaNominal, xp);
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.u.id } })).xpTotal,
    123,
  );
  return e;
}
const token = (u) =>
  jwt.sign({
    sub: u.id,
    correo: u.correo,
    rol: u.rol,
    tokenVersion: u.tokenVersion,
  });
function noPrivate(value) {
  if (Array.isArray(value)) return value.forEach(noPrivate);
  if (value && typeof value === 'object')
    for (const [k, v] of Object.entries(value)) {
      assert.ok(
        ![
          'snapshotInicial',
          'esCorrecta',
          'competitiveGrant',
          'competitiveActionSeq',
        ].includes(k),
        k,
      );
      noPrivate(v);
    }
}

test('HTTP independent OFF gates, strict boolean, legacy preserved and server eligibility', async () => {
  flags.forEach((k) => delete process.env[k]);
  const u = await user();
  const http = request(app.getHttpServer());
  for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL'])
    await http
      .post('/trivia-rush/intentos')
      .set('Authorization', `Bearer ${token(u)}`)
      .send({ ...config, modalidad: mode, competitive: true })
      .expect(403);
  await http
    .post('/trivia-rush/intentos')
    .set('Authorization', `Bearer ${token(u)}`)
    .send({ ...config, modalidad: 'TRIVIA_RUSH', competitive: 'true' })
    .expect(400);
  const legacy = await engine.crear(u.id, config);
  assert.equal((await row(legacy.intento.id)).competitiveRulesVersion, null);
  await assert.rejects(
    engine.crear(u.id, {
      ...config,
      modalidad: 'TRIVIA_RUSH',
      competitive: true,
    }),
    /convertir/,
  );
  process.env.COMPETITIVE_TRIVIA_ENABLED = 'true';
  const teacher = await user('PROFESOR');
  await assert.rejects(
    engine.crear(teacher.id, {
      ...config,
      modalidad: 'TRIVIA_RUSH',
      competitive: true,
    }),
  );
  const other = await user();
  await assert.rejects(
    engine.crear(other.id, {
      ...config,
      modalidad: 'GHOST_DUEL',
      competitive: true,
    }),
    /habilitada/,
  );
});
test('prepared V1 remains ineligible, SQL rejects retroactive admission and non-owner', async () => {
  const u = await user();
  const r = await engine.crear(u.id, { ...config, modalidad: 'TRIVIA_RUSH' });
  const f = { u, id: r.intento.id };
  await assert.rejects(competitive.settle(source(f)), /INELIGIBLE_SOURCE/);
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: f.id },
      data: {
        competitiveRulesVersion: 1,
        competitiveAdmittedAt: (await row(f.id)).iniciadoEn,
      },
    }),
    /no retroactive/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { usuarioId: u.id } }),
    0,
  );
});
test('official second chance preserves M; definitive wrong and shield break competitive M', async () => {
  const f = await start();
  await answer(f);
  await answer(f);
  await helper(f, 'SEGUNDA_OPORTUNIDAD');
  await answer(f, false);
  await answer(f);
  await answer(f);
  await helper(f, 'ESCUDO_COMBO');
  await answer(f, false);
  await answer(f);
  await finish(f, false);
  // C=5, M=4; scoreboard shield does not create a competitive streak.
  await checkXp(f, 47);
  const r = await row(f.id);
  assert.equal(r.asistido, true);
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
    11,
  );
});
test('skip breaks M; helpers and answers share a DB-assigned total order', async () => {
  const f = await start();
  await answer(f);
  await answer(f);
  await helper(f, 'SALTAR');
  await answer(f);
  await answer(f);
  await finish(f, false);
  await checkXp(f, 34);
  const r = await db.intentoTriviaRush.findUniqueOrThrow({
    where: { id: f.id },
    include: { respuestas: true, potenciadores: true },
  });
  const seq = [...r.respuestas, ...r.potenciadores].map((a) =>
    String(a.competitiveActionSeq),
  );
  assert.equal(new Set(seq).size, seq.length);
});
test('first duel has no bonus, repeated ledger settlement is one event and UUID aliases identical', async () => {
  const f = await start('GHOST_DUEL');
  assert.equal((await row(f.id)).snapshotInicial.ghost, null);
  await finish(f);
  const e = await checkXp(f, 80);
  const verified = await db.$transaction((tx) =>
    new (require('../src/competitive/competitive.trivia').TriviaCompetitiveVerifier)().loadTerminal(
      tx,
      source(f),
    ),
  );
  assert.equal(verified.resolution.facts.outcome, null);
  const events = await Promise.all(
    Array.from({ length: 5 }, () =>
      competitive.settle({ ...source(f), sourceId: f.id.toUpperCase() }),
    ),
  );
  assert.ok(events.every((a) => a.id === e.id));
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
    1,
  );
  await assert.rejects(
    competitive.settle({ ...source(f), participantId: (await user()).id }),
    /SOURCE_MISMATCH/,
  );
});
test('fixed ghost win/tie/loss use only verified scores and never a later best record', async () => {
  const u = await user();
  const first = await start('GHOST_DUEL', u);
  await finish(first, (i) => i < 4);
  await checkXp(first, 32);
  const win = await start('GHOST_DUEL', u);
  const fixed = (await row(win.id)).snapshotInicial.ghost;
  assert.equal(fixed.intentoId, first.id);
  await finish(win, (i) => i < 6);
  await checkXp(win, 68);
  const tie = await start('GHOST_DUEL', u);
  assert.equal((await row(tie.id)).snapshotInicial.ghost.intentoId, win.id);
  await finish(tie, (i) => i < 6);
  await checkXp(tie, 58);
  const loss = await start('GHOST_DUEL', u);
  await finish(loss, false);
  await checkXp(loss, 0);
  assert.deepEqual((await row(win.id)).snapshotInicial.ghost, fixed);
});
test('legacy clean evidence may be fixed ghost but never receives retroactive XP', async () => {
  const u = await user();
  const prepared = await engine.crear(u.id, {
    ...config,
    modalidad: 'GHOST_DUEL',
  });
  const f = { u, id: prepared.intento.id };
  await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,NULL::timestamp)`;
  await finish(f, (i) => i < 3);
  await assert.rejects(competitive.settle(source(f)), /INELIGIBLE_SOURCE/);
  const duel = await start('GHOST_DUEL', u);
  assert.equal((await row(duel.id)).snapshotInicial.ghost.intentoId, f.id);
  await finish(duel, (i) => i < 3);
  await checkXp(duel, 34);
});
test('equal verified score with different correct counts and streaks is a tie', async () => {
  const u = await user();
  const reference = await start('GHOST_DUEL', u);
  await finish(reference, (i) => i < 4);
  await checkXp(reference, 32);
  const duel = await start('GHOST_DUEL', u);
  await finish(duel, (i) => [0, 1, 3, 4, 6, 7].includes(i));
  const original = await row(reference.id),
    current = await row(duel.id);
  assert.equal(current.puntaje, original.puntaje);
  assert.notEqual(current.respuestasCorrectas, original.respuestasCorrectas);
  assert.notEqual(current.mejorCombo, original.mejorCombo);
  await checkXp(duel, 58);
});
test('concurrent recovery after ledger crash and OFF gates settles once then acknowledges terminal', async () => {
  const f = await start();
  flags.forEach((k) => delete process.env[k]);
  const resumed = await engine.crear(f.u.id, {
    ...config,
    modalidad: 'TRIVIA_RUSH',
    competitive: true,
  });
  assert.equal(resumed.intento.id, f.id);
  await finish(f);
  const e = await checkXp(f, 100);
  assert.equal((await row(f.id)).competitiveSettledAt, null);
  flags.forEach((k) => delete process.env[k]);
  const w2 = new TriviaCompetitiveReconciler(db, competitive);
  await Promise.all([
    worker.reconcile(),
    w2.reconcile(),
    competitive.settle(source(f)),
  ]);
  assert.ok((await row(f.id)).competitiveSettledAt);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
    1,
  );
  assert.equal((await competitive.settle(source(f))).id, e.id);
  await w2.onModuleDestroy();
});
test('last answer, abandonment, settlement and recovery serialize to one terminal payment', async () => {
  for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL']) {
    const f = await start(mode);
    for (let i = 0; i < 9; i++) await answer(f);
    const outcome = await Promise.allSettled([
      answer(f),
      engine.abandonar(f.u.id, f.id),
      competitive.settle(source(f)),
      worker.reconcile(),
    ]);
    assert.equal(outcome[1].status, 'fulfilled');
    assert.equal(outcome[3].status, 'fulfilled');
    if (outcome[0].status === 'rejected')
      assert.equal(outcome[0].reason.status, 400);
    if (outcome[2].status === 'rejected')
      assert.equal(outcome[2].reason.code, 'SOURCE_NOT_TERMINAL');
    const closed = await row(f.id);
    assert.ok(['FINALIZADO', 'ABANDONADO'].includes(closed.estado));
    const event = await checkXp(
      f,
      closed.estado === 'ABANDONADO' ? -10 : mode === 'TRIVIA_RUSH' ? 100 : 80,
    );
    await Promise.all([competitive.settle(source(f)), worker.reconcile()]);
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
      1,
    );
    assert.equal(event.gameId, mode);
    assert.ok((await row(f.id)).competitiveSettledAt);
  }
});

test('recovery survives injected failures before and after ledger commit', async () => {
  for (const afterLedger of [false, true]) {
    const f = await start();
    await finish(f);
    const failing = new TriviaCompetitiveReconciler(db, {
      settle: async (source) => {
        if (afterLedger) await competitive.settle(source);
        throw new Error('injected settlement interruption');
      },
    });
    await failing.reconcile();
    assert.equal((await row(f.id)).competitiveSettledAt, null);
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
      afterLedger ? 1 : 0,
    );
    await db.$executeRaw`UPDATE "IntentoTriviaRush" SET "competitiveRetryAt"=timezone('UTC',clock_timestamp()) WHERE id=${f.id}::uuid`;
    await worker.reconcile();
    assert.ok((await row(f.id)).competitiveSettledAt);
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
      1,
    );
    assert.equal((await checkXp(f, 100)).saldoDespues, 100);
    await failing.onModuleDestroy();
  }
});

test('server sequences and terminal evidence cannot be supplied or rewritten; private roles stay denied', async () => {
  const f = await start(),
    r = await row(f.id),
    q = r.snapshotInicial.questions[0];
  await assert.rejects(
    db.triviaRushRespuesta.create({
      data: {
        intentoId: f.id,
        preguntaId: q.preguntaId,
        respuestaSeleccionadaId: q.pregunta.respuestas.find((a) => a.esCorrecta)
          .id,
        numeroIntento: 1,
        esCorrecta: true,
        esFinal: true,
        puntosOtorgados: 100,
        comboResultante: 1,
        tiempoRespuestaMs: 0,
        claveIdempotencia: randomUUID(),
        respondidaEn: new Date(),
        competitiveActionSeq: 99999n,
      },
    }),
    /server assigned/,
  );
  await finish(f);
  await checkXp(f, 100);
  await assert.rejects(
    db.intentoTriviaRush.update({ where: { id: f.id }, data: { puntaje: 0 } }),
    /terminal is immutable/,
  );
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: f.id },
      data: { modalidad: 'GHOST_DUEL' },
    }),
    /immutable/,
  );
  await assert.rejects(
    db.triviaRushRespuesta.updateMany({
      where: { intentoId: f.id },
      data: { competitiveActionSeq: null },
    }),
    /append-only/,
  );
  const privileges =
    await db.$queryRaw`SELECT r AS role,has_table_privilege(r,'"IntentoTriviaRush"','SELECT') AS read,
    has_sequence_privilege(r,'trivia_competitive_action_seq','USAGE') AS seq FROM unnest(ARRAY['anon','authenticated']) r`;
  assert.ok(privileges.every((p) => p.read === false && p.seq === false));
});

test('explicit abandonment applies nominal -10 with floor and no positive partial reward', async () => {
  const f = await start();
  await answer(f);
  await engine.abandonar(f.u.id, f.id);
  const e = await checkXp(f, -10);
  assert.equal(e.deltaAplicado, 0);
  assert.equal(e.saldoDespues, 0);
  assert.equal(
    await db.triviaPresenceEvent.count({
      where: { attemptId: f.id, kind: 'ABANDONED' },
    }),
    1,
  );
});
test('snapshot privacy through actual HTTP competitive creation/read; accepted retries unchanged', async () => {
  process.env.COMPETITIVE_TRIVIA_ENABLED = 'true';
  const u = await user();
  const http = request(app.getHttpServer());
  const r = await http
    .post('/trivia-rush/intentos')
    .set('Authorization', `Bearer ${token(u)}`)
    .send({ ...config, modalidad: 'TRIVIA_RUSH', competitive: true })
    .expect(201);
  noPrivate(r.body);
  const f = { u, id: r.body.intento.id };
  await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,NULL::timestamp)`;
  const initial = await row(f.id),
    q = initial.snapshotInicial.questions[0],
    key = randomUUID();
  const payload = {
    preguntaId: q.preguntaId,
    respuestaId: q.pregunta.respuestas.find((a) => a.esCorrecta).id,
    idempotencyKey: key,
  };
  await http
    .post(`/trivia-rush/intentos/${f.id}/respuestas`)
    .set('Authorization', `Bearer ${token(u)}`)
    .send(payload)
    .expect(201);
  await http
    .post(`/trivia-rush/intentos/${f.id}/respuestas`)
    .set('Authorization', `Bearer ${token(u)}`)
    .send(payload)
    .expect(201);
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
    1,
  );
  const read = await http
    .get(`/trivia-rush/intentos/${f.id}`)
    .set('Authorization', `Bearer ${token(u)}`)
    .expect(200);
  noPrivate(read.body);
  const other = await user();
  await http
    .get(`/trivia-rush/intentos/${f.id}`)
    .set('Authorization', `Bearer ${token(other)}`)
    .expect(403);
  await assert.rejects(competitive.settle(source(f)), /SOURCE_NOT_TERMINAL/);
});

async function timedFixture(mode, base) {
  const u = await user();
  process.env[mode === 'TRIVIA_RUSH' ? flags[0] : flags[1]] = 'true';
  const timedEngine = new TriviaRushService(
    new Proxy(db, {
      get(target, key) {
        if (key === '$transaction')
          return (fn, options) =>
            target.$transaction(async (tx) => {
              await tx.$queryRaw`SELECT set_config('saberplus.presence_test_now',${base.toISOString()},true)`;
              return fn(tx);
            }, options);
        const v = target[key];
        return typeof v === 'function' ? v.bind(target) : v;
      },
    }),
  );
  const r = await timedEngine.crear(u.id, {
    ...config,
    modalidad: mode,
    competitive: true,
  });
  const f = { u, id: r.intento.id },
    c = randomUUID(),
    instance = randomUUID();
  await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${u.id}::uuid,${c}::uuid,${instance}::uuid,${base}::timestamp)`;
  return { ...f, c, instance, base };
}
async function disconnect(f, offset) {
  for (let seconds = 10; seconds < offset; seconds += 10) {
    const renewal = new Date(+f.base + seconds * 1000);
    await db.$queryRaw`SELECT trivia_presence_observe(${f.id}::uuid,${f.c}::uuid,${f.instance}::uuid,'RENEW',${renewal}::timestamp)`;
  }
  const at = new Date(+f.base + offset * 1000);
  return db.$queryRaw`SELECT trivia_presence_observe(${f.id}::uuid,${f.c}::uuid,${f.instance}::uuid,'DISCONNECT',${at}::timestamp)`;
}
async function resolveAt(f, offset) {
  const at = new Date(+f.base + offset * 1000);
  return db.$queryRaw`SELECT trivia_presence_resolve(${f.id}::uuid,${at}::timestamp)`;
}
async function settleAtTerminal(f, xp) {
  const terminal = (await row(f.id)).finalizadoEn,
    originalNow = Date.now;
  // Controlled Node clock agrees with the controlled PostgreSQL terminal clock.
  // The production future-terminal guard remains unchanged.
  Date.now = () => +terminal + 100;
  try {
    return await checkXp(f, xp);
  } finally {
    Date.now = originalNow;
  }
}

test('confirmed grace abandonment is -10, UNKNOWN is not; expiry before/equal grace is a normal terminal', async () => {
  for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL']) {
    const base = new Date('2050-06-01T12:00:00Z');
    const gone = await timedFixture(mode, base);
    await disconnect(gone, 10);
    await resolveAt(gone, 30);
    assert.equal((await row(gone.id)).estado, 'ABANDONADO');
    await settleAtTerminal(gone, -10);
    for (const seconds of [100, 110]) {
      const f = await timedFixture(mode, base);
      await disconnect(f, seconds);
      await resolveAt(f, 130);
      const r = await row(f.id);
      assert.equal(r.estado, 'EXPIRADO');
      assert.equal(+r.finalizadoEn, +r.venceEn);
      await settleAtTerminal(f, 0);
      const late = new Date(+base + 131000);
      const result =
        await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${f.u.id}::uuid,${randomUUID()}::uuid,${randomUUID()}::uuid,${late}::timestamp) AS state`;
      assert.equal(result[0].state, 'EXPIRADO');
    }
    const unknown = await timedFixture(mode, base);
    await resolveAt(unknown, 21);
    assert.equal((await row(unknown.id)).estado, 'ACTIVO');
    assert.equal(
      (
        await db.triviaConnection.findUniqueOrThrow({
          where: { id: unknown.c },
        })
      ).state,
      'UNKNOWN',
    );
    await assert.rejects(
      competitive.settle(source(unknown)),
      /SOURCE_NOT_TERMINAL/,
    );
    await resolveAt(unknown, 120);
    await settleAtTerminal(unknown, 0);
  }
});
test('terminal year decides season, fixed expiry and recovery never use detection time', async () => {
  const f = await timedFixture('TRIVIA_RUSH', new Date('2049-12-31T04:59:30Z')); // stays in 2049
  await resolveAt(f, 120);
  const e = await settleAtTerminal(f, 0);
  assert.equal(e.temporada, 2049);
  assert.equal(+e.fechaEfectiva, +(await row(f.id)).venceEn);
  const crossing = await timedFixture(
    'TRIVIA_RUSH',
    new Date('2050-01-01T04:59:30Z'),
  ); // 2049 -> 2050 in Bogota
  await resolveAt(crossing, 140);
  const crossed = await settleAtTerminal(crossing, 0);
  assert.equal(crossed.temporada, 2050);
});
test('institution at terminal is retained after membership change; missing history fails safely', async () => {
  const a = await db.institucion.create({
    data: { id: randomUUID(), nombre: 'XP A', codigoUnico: randomUUID() },
  });
  const b = await db.institucion.create({
    data: { id: randomUUID(), nombre: 'XP B', codigoUnico: randomUUID() },
  });
  const u = await user('ESTUDIANTE', a.id);
  const f = await start('TRIVIA_RUSH', u);
  await finish(f);
  await db.usuario.update({
    where: { id: u.id },
    data: { institucionId: b.id },
  });
  const e = await checkXp(f, 100);
  assert.equal(e.institucionId, a.id);
  const noCoverage = await timedFixture(
    'TRIVIA_RUSH',
    new Date('2001-01-01T00:00:00Z'),
  );
  await resolveAt(noCoverage, 120);
  await assert.rejects(
    competitive.settle(source(noCoverage)),
    /HISTORICAL_MEMBERSHIP_UNKNOWN/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { usuarioId: noCoverage.u.id },
    }),
    0,
  );
});
