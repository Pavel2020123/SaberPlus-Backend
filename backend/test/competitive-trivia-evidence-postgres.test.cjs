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
const { createSoloVerifiers } = require('../src/competitive/competitive.solo');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { PrismaService } = require('../src/prisma/prisma.service');
const {
  TriviaRushController,
} = require('../src/trivia-rush/trivia-rush.controller');
let db, service, competitive, app, jwt;
const config = { areas: ['CIENCIAS_NATURALES'], duracionSegundos: 120 };
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
  service = new TriviaRushService(db);
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createSoloVerifiers()),
  );
  await bank('CIENCIAS_NATURALES', 12);
  await bank('SOCIALES_CIUDADANAS', 4);
  const module = await Test.createTestingModule({
    imports: [
      JwtModule.register({ secret: 'local-disposable-http-test-only' }),
    ],
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
});
after(async () => {
  await app?.close();
  await db?.$disconnect();
});
async function bank(area, n) {
  const t = await db.tema.create({
    data: { nombre: 'Evidence fixture', area, estadoContenido: 'PUBLICADO' },
  });
  const s = await db.subtema.create({
    data: { nombre: 'Fixture', temaId: t.id, estadoContenido: 'PUBLICADO' },
  });
  for (let i = 0; i < n; i++)
    await db.pregunta.create({
      data: {
        id: randomUUID(),
        subtemaId: s.id,
        enunciado: `Original ${i}`,
        explicacion: 'Original explanation',
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        respuestas: {
          create: Array.from({ length: 4 }, (_, j) => ({
            id: randomUUID(),
            texto: `Original option ${j}`,
            esCorrecta: j === 0,
          })),
        },
      },
    });
}
async function user(rol = 'ESTUDIANTE') {
  return db.usuario.create({
    data: {
      nombre: 'Fixture',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-login',
      rol,
      correoVerificado: true,
      xpTotal: 123,
    },
  });
}
const row = (id) => db.intentoTriviaRush.findUniqueOrThrow({ where: { id } });
async function start(modalidad = 'TRIVIA_RUSH', u) {
  u ??= await user();
  const response = await service.crear(u.id, { ...config, modalidad });
  return { u, id: response.intento.id, response };
}
async function answer(f, correct = true, key = randomUUID()) {
  const r = await row(f.id),
    question = r.snapshotInicial.questions[r.indiceActual];
  return service.responder(f.u.id, f.id, {
    preguntaId: question.preguntaId,
    respuestaId: question.pregunta.respuestas.find(
      (o) => o.esCorrecta === correct,
    ).id,
    idempotencyKey: key,
  });
}
async function finish(f, correct = true) {
  for (let i = 0; i < 30; i++) {
    if ((await row(f.id)).estado !== 'ACTIVO') return;
    await answer(f, typeof correct === 'function' ? correct(i) : correct);
  }
  assert.notEqual((await row(f.id)).estado, 'ACTIVO');
}
async function noXp(f) {
  await assert.rejects(
    competitive.settle({
      sourceType: 'TRIVIA_ATTEMPT',
      sourceId: f.id,
      participantId: f.u.id,
    }),
    /SOURCE_NOT_INTEGRATED/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({ where: { usuarioId: f.u.id } }),
    0,
  );
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.u.id } })).xpTotal,
    123,
  );
}

test('snapshot survives bank edits for rendering, scoring, review and helper solutions; immutable SQL evidence', async () => {
  const f = await start();
  const original = await row(f.id);
  const s = original.snapshotInicial;
  assert.equal(s.q, 12);
  assert.equal(original.modalidad, 'TRIVIA_RUSH');
  assert.equal(original.evidenciaVersion, 1);
  const q = s.questions[0],
    correct = q.pregunta.respuestas.find((o) => o.esCorrecta),
    wrong = q.pregunta.respuestas.find((o) => !o.esCorrecta);
  await db.$transaction([
    db.pregunta.update({
      where: { id: q.preguntaId },
      data: { enunciado: 'CHANGED', explicacion: 'CHANGED' },
    }),
    db.respuesta.update({
      where: { id: correct.id },
      data: { esCorrecta: false, texto: 'CHANGED' },
    }),
    db.respuesta.update({
      where: { id: wrong.id },
      data: { esCorrecta: true },
    }),
  ]);
  const visible = await service.obtener(f.u.id, f.id);
  assert.equal(visible.intento.pregunta.enunciado, q.pregunta.enunciado);
  assert.equal(
    visible.intento.pregunta.opciones.find((o) => o.id === correct.id).texto,
    correct.texto,
  );
  assert.equal(JSON.stringify(visible).includes('esCorrecta'), false);
  assert.equal(JSON.stringify(visible).includes('snapshotInicial'), false);
  const a = await answer(f);
  assert.equal(a.evaluacion.esCorrecta, true);
  assert.equal(a.evaluacion.respuestaCorrectaId, correct.id);
  assert.equal(a.evaluacion.explicacion, 'Original explanation');
  for (const data of [
    { modalidad: 'GHOST_DUEL' },
    { snapshotInicial: { ...s, q: 10 } },
    { iniciadoEn: new Date(0) },
    { evidenciaVersion: null },
  ])
    await assert.rejects(
      db.intentoTriviaRush.update({ where: { id: f.id }, data }),
    );
  const assigned = await db.triviaRushPregunta.findFirstOrThrow({
    where: { intentoId: f.id },
  });
  await assert.rejects(
    db.triviaRushPregunta.update({
      where: {
        intentoId_preguntaId: {
          intentoId: f.id,
          preguntaId: assigned.preguntaId,
        },
      },
      data: { opcionesOrden: [] },
    }),
  );
  const response = await db.triviaRushRespuesta.findFirstOrThrow({
    where: { intentoId: f.id },
  });
  await assert.rejects(
    db.triviaRushRespuesta.update({
      where: { id: response.id },
      data: { esCorrecta: false },
    }),
  );
  await service.abandonar(f.u.id, f.id);
  const result = await service.obtener(f.u.id, f.id);
  assert.equal(
    result.intento.resultado.revision[0].respuestaCorrectaId,
    correct.id,
  );
  await assert.rejects(db.intentoTriviaRush.delete({ where: { id: f.id } }));
  await noXp(f);
});

test('explicit modes require Q >=10; legacy bank of four remains playable with null evidence', async () => {
  const u = await user(),
    small = { areas: ['SOCIALES_CIUDADANAS'], duracionSegundos: 60 };
  await assert.rejects(
    service.crear(u.id, { ...small, modalidad: 'TRIVIA_RUSH' }),
    (e) => e.getStatus?.() === 400,
  );
  assert.equal(
    await db.intentoTriviaRush.count({ where: { usuarioId: u.id } }),
    0,
  );
  const legacy = await service.crear(u.id, small),
    saved = await row(legacy.intento.id);
  assert.equal(saved.evidenciaVersion, null);
  assert.equal(saved.snapshotInicial, null);
  assert.equal(saved.modalidad, null);
  await assert.rejects(
    service.crear(u.id, { ...small, modalidad: 'GHOST_DUEL' }),
    (e) => e.getStatus?.() === 409,
  );
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: saved.id },
      data: { evidenciaVersion: 1 },
    }),
  );
  const teacher = await user('PROFESOR');
  await assert.rejects(
    service.crear(teacher.id, { ...config, modalidad: 'TRIVIA_RUSH' }),
    (e) => e.getStatus?.() === 403,
  );
});

test('first Ghost absence is fixed; later reference copies best compatible protected record and never reselects', async () => {
  const first = await start('GHOST_DUEL');
  assert.equal((await row(first.id)).snapshotInicial.ghost, null);
  await finish(first, (i) => i === 0);
  const duel = await start('GHOST_DUEL', first.u),
    frozen = (await row(duel.id)).snapshotInicial.ghost;
  assert.equal(frozen.intentoId, first.id);
  assert.equal(frozen.respuestasCorrectas, 1);
  assert.equal(frozen.q, 12);
  assert.equal((await service.crear(first.u.id, config)).intento.id, duel.id);
  await assert.rejects(
    service.crear(first.u.id, { ...config, modalidad: 'TRIVIA_RUSH' }),
    (e) => e.getStatus?.() === 409,
  );
  await service.abandonar(duel.u.id, duel.id);
  const better = await start('TRIVIA_RUSH', first.u);
  await finish(better);
  assert.equal(
    (await service.obtenerFantasma(first.u.id, config)).fantasma.intentoId,
    better.id,
  );
  assert.deepEqual(
    (await service.obtener(duel.u.id, duel.id)).intento.fantasmaInicial,
    frozen,
  );
  assert.equal((await row(first.id)).snapshotInicial.ghost, null);
  const next = await start('GHOST_DUEL', first.u);
  assert.equal((await row(next.id)).snapshotInicial.ghost.intentoId, better.id);
  await noXp(first);
  await noXp(duel);
  await noXp(better);
});

test('legacy records and incompatible durations are not promoted into a fixed authoritative ghost', async () => {
  const u = await user();
  let legacy = await service.crear(u.id, config);
  const legacyId = legacy.intento.id;
  for (let i = 0; i < 30 && legacy.intento.estado === 'ACTIVO'; i++) {
    const preguntaId = legacy.intento.pregunta.id;
    const correct = await db.respuesta.findFirstOrThrow({
      where: { preguntaId, esCorrecta: true },
    });
    legacy = await service.responder(u.id, legacyId, {
      preguntaId,
      respuestaId: correct.id,
      idempotencyKey: randomUUID(),
    });
  }
  assert.equal(legacy.intento.estado, 'FINALIZADO');
  assert.equal(
    (await service.obtenerFantasma(u.id, config)).fantasma.intentoId,
    legacyId,
  );
  const duel = await start('GHOST_DUEL', u);
  assert.equal((await row(duel.id)).snapshotInicial.ghost, null);
  await finish(duel);
  const changed = await service.crear(u.id, {
    ...config,
    duracionSegundos: 60,
    modalidad: 'GHOST_DUEL',
  });
  assert.equal((await row(changed.intento.id)).snapshotInicial.ghost, null);
  assert.equal((await row(legacyId)).evidenciaVersion, null);
  await noXp(duel);
});

test('concurrent creation and same-key answers are idempotent; conflicting payloads cannot add responses', async () => {
  const u = await user();
  const created = await Promise.all(
    Array.from({ length: 4 }, () =>
      service.crear(u.id, { ...config, modalidad: 'TRIVIA_RUSH' }),
    ),
  );
  assert.equal(new Set(created.map((r) => r.intento.id)).size, 1);
  const f = { u, id: created[0].intento.id },
    key = randomUUID();
  const original = (await row(f.id)).snapshotInicial.questions[0];
  const input = {
    preguntaId: original.preguntaId,
    respuestaId: original.pregunta.respuestas.find((r) => r.esCorrecta).id,
  };
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) =>
      service.responder(u.id, f.id, {
        ...input,
        idempotencyKey: i % 2 ? key.toUpperCase() : key,
      }),
    ),
  );
  assert.ok(results.every((r) => r.evaluacion.esCorrecta));
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
    1,
  );
  const stored = await db.triviaRushRespuesta.findFirstOrThrow({
    where: { intentoId: f.id },
  });
  await assert.rejects(
    service.responder(u.id, f.id, {
      preguntaId: stored.preguntaId,
      respuestaId: randomUUID(),
      idempotencyKey: key,
    }),
    (e) => e.getStatus?.() === 403,
  );
  assert.equal((await row(f.id)).respuestasCorrectas, 1);
  await noXp(f);
});

test('last answer versus abandonment yields one immutable terminal without late response or XP', async () => {
  const f = await start();
  const q = (await row(f.id)).snapshotInicial.q;
  for (let i = 0; i < q - 1; i++) await answer(f);
  const result = await Promise.allSettled([
    answer(f),
    service.abandonar(f.u.id, f.id),
    service.finalizar(f.u.id, f.id),
  ]);
  const saved = await row(f.id);
  assert.ok(['FINALIZADO', 'ABANDONADO'].includes(saved.estado));
  assert.ok(result.some((r) => r.status === 'fulfilled'));
  const count = await db.triviaRushRespuesta.count({
    where: { intentoId: f.id },
  });
  assert.equal(count, saved.estado === 'FINALIZADO' ? q : q - 1);
  await service.abandonar(f.u.id, f.id);
  assert.deepEqual(await row(f.id), saved);
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: f.id },
      data: { puntaje: saved.puntaje + 1 },
    }),
  );
  await noXp(f);
});

test('overdue evidence closes at original deadline and rejects a racing late answer', async () => {
  const f = await start();
  const original = await row(f.id);
  await service.abandonar(f.u.id, f.id);
  const end = new Date('2026-01-01T05:00:00Z'),
    begin = new Date(+end - 120000),
    id = randomUUID();
  await db.intentoTriviaRush.create({
    data: {
      ...original,
      id,
      iniciadoEn: begin,
      venceEn: end,
      preguntaIniciaEn: begin,
    },
  });
  const first = original.snapshotInicial.questions[0];
  const results = await Promise.allSettled([
    service.responder(f.u.id, id, {
      preguntaId: first.preguntaId,
      respuestaId: first.pregunta.respuestas.find((o) => o.esCorrecta).id,
      idempotencyKey: randomUUID(),
    }),
    service.abandonar(f.u.id, id),
    service.obtener(f.u.id, id),
  ]);
  assert.equal(results[0].status, 'rejected');
  const saved = await row(id);
  assert.equal(saved.estado, 'EXPIRADO');
  assert.deepEqual(saved.finalizadoEn, end);
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
    0,
  );
  await noXp({ ...f, id });
});

test('prepared Ghost rejects boosters; Trivia boosters use original snapshot and retry exactly once', async () => {
  for (const mode of ['GHOST_DUEL', 'TRIVIA_RUSH']) {
    const f = await start(mode),
      original = await row(f.id),
      first = original.snapshotInicial.questions[0];
    const grant = await db.concesionRecompensaJuego.create({
      data: {
        usuarioId: f.u.id,
        proveedor: 'fixture',
        referenciaProveedor: randomUUID(),
        expiraEn: new Date(Date.now() + 60000),
      },
    });
    const input = {
      preguntaId: first.preguntaId,
      potenciador: 'CINCUENTA_CINCUENTA',
      concesionId: grant.id,
      idempotencyKey: randomUUID(),
    };
    if (mode === 'GHOST_DUEL')
      await assert.rejects(
        service.activarPotenciador(f.u.id, f.id, input),
        (e) => e.getStatus?.() === 400,
      );
    else {
      const correct = first.pregunta.respuestas.find((r) => r.esCorrecta);
      const wrong = first.pregunta.respuestas.find((r) => !r.esCorrecta);
      await db.$transaction([
        db.respuesta.update({
          where: { id: correct.id },
          data: { esCorrecta: false },
        }),
        db.respuesta.update({
          where: { id: wrong.id },
          data: { esCorrecta: true },
        }),
      ]);
      const results = await Promise.all([
        service.activarPotenciador(f.u.id, f.id, input),
        service.activarPotenciador(f.u.id, f.id, input),
      ]);
      assert.deepEqual(results[0].activacion, results[1].activacion);
      assert.ok(
        results[0].activacion.opcionesEliminadas.every((id) =>
          first.pregunta.respuestas.some((o) => o.id === id && !o.esCorrecta),
        ),
      );
      assert.equal(
        await db.triviaRushPotenciador.count({ where: { intentoId: f.id } }),
        1,
      );
    }
    await noXp(f);
  }
});

test('official second chance, extra time, skip and shield retain legacy semantics with protected evidence', async () => {
  const f = await start();
  async function booster(potenciador) {
    const r = await row(f.id);
    const grant = await db.concesionRecompensaJuego.create({
      data: {
        usuarioId: f.u.id,
        proveedor: 'fixture',
        referenciaProveedor: randomUUID(),
        expiraEn: new Date(Date.now() + 60000),
      },
    });
    const input = {
      preguntaId: r.preguntaActualId,
      potenciador,
      concesionId: grant.id,
      idempotencyKey: randomUUID(),
    };
    await service.activarPotenciador(f.u.id, f.id, input);
    await service.activarPotenciador(f.u.id, f.id, input);
  }
  await booster('SEGUNDA_OPORTUNIDAD');
  const first = await answer(f, false);
  assert.equal(first.evaluacion.esFinal, false);
  assert.equal(first.evaluacion.respuestaCorrectaId, null);
  assert.equal(first.evaluacion.explicacion, null);
  await answer(f, true);
  assert.equal((await row(f.id)).respuestasCorrectas, 1);
  const deadline = (await row(f.id)).venceEn;
  await booster('TIEMPO_EXTRA');
  assert.equal(+(await row(f.id)).venceEn, +deadline + 10000);
  await booster('SALTAR');
  assert.equal((await row(f.id)).preguntasSaltadas, 1);
  await booster('ESCUDO_COMBO');
  await answer(f, false);
  assert.equal((await row(f.id)).comboActual, 1);
  assert.equal((await row(f.id)).asistido, true);
  await service.abandonar(f.u.id, f.id);
  const duel = await start('GHOST_DUEL', f.u);
  assert.equal((await row(duel.id)).snapshotInicial.ghost, null);
  await noXp(f);
});

test('snapshot tables retain RLS and deny anon/authenticated direct reads', async () => {
  for (const role of ['anon', 'authenticated'])
    for (const table of [
      'IntentoTriviaRush',
      'TriviaRushPregunta',
      'TriviaRushRespuesta',
      'TriviaRushPotenciador',
    ]) {
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`);
        }),
        /42501|permission denied/,
      );
    }
});

test('database reconstructs the complete fixed ghost and rejects forged original evidence', async () => {
  const source = await start();
  await finish(source, (i) => i % 3 !== 0);
  const duel = await start('GHOST_DUEL', source.u);
  const template = await row(duel.id);
  const original = template.snapshotInicial.ghost;
  assert.ok(original.checkpoints.length > 1);
  const foreign = await start();
  await finish(foreign);
  const historical = await user();
  const legacy = await service.crear(historical.id, config);
  // A historical reference remains ineligible even with the correct owner.
  const legacyId = legacy.intento.id;
  while ((await row(legacyId)).estado === 'ACTIVO') {
    const pending = await row(legacyId);
    const correct = await db.respuesta.findFirstOrThrow({
      where: { preguntaId: pending.preguntaActualId, esCorrecta: true },
    });
    await service.responder(historical.id, legacyId, {
      preguntaId: pending.preguntaActualId,
      respuestaId: correct.id,
      idempotencyKey: randomUUID(),
    });
  }
  assert.equal((await row(legacyId)).estado, 'FINALIZADO');
  const mutations = [
    [
      'terminal date',
      (s) => {
        s.ghost.finalizadoEn = new Date(
          +new Date(original.finalizadoEn) + 1,
        ).toISOString();
      },
    ],
    [
      'checkpoint time',
      (s) => {
        s.ghost.checkpoints[0].segundosTranscurridos += 1;
      },
    ],
    [
      'checkpoint score',
      (s) => {
        s.ghost.checkpoints[0].puntaje += 1;
      },
    ],
    [
      'checkpoint removal',
      (s) => {
        s.ghost.checkpoints.pop();
      },
    ],
    [
      'checkpoint order',
      (s) => {
        s.ghost.checkpoints.reverse();
      },
    ],
    [
      'score',
      (s) => {
        s.ghost.puntaje += 1;
      },
    ],
    [
      'correct count',
      (s) => {
        s.ghost.respuestasCorrectas += 1;
      },
    ],
    [
      'combo',
      (s) => {
        s.ghost.mejorCombo += 1;
      },
    ],
    [
      'foreign reference',
      (s) => {
        s.ghost.intentoId = foreign.id;
      },
    ],
    [
      'private extras',
      (s) => {
        s.ghost.questions = s.questions;
      },
    ],
    [
      'missing date',
      (s) => {
        delete s.ghost.finalizadoEn;
      },
    ],
  ];
  for (const [label, mutate] of mutations) {
    const snapshotInicial = structuredClone(template.snapshotInicial);
    mutate(snapshotInicial);
    await assert.rejects(
      db.intentoTriviaRush.create({
        data: { ...template, id: randomUUID(), snapshotInicial },
      }),
      /23514|Invalid fixed ghost|differs from original/,
      label,
    );
  }
  await assert.rejects(
    db.intentoTriviaRush.create({
      data: {
        ...template,
        id: randomUUID(),
        usuarioId: historical.id,
        snapshotInicial: {
          ...template.snapshotInicial,
          ghost: { ...original, intentoId: legacyId },
        },
      },
    }),
    /23514|Invalid fixed ghost/,
  );
  // Both a legitimate reference and initial absence continue to be accepted.
  await db.intentoTriviaRush.create({
    data: { ...template, id: randomUUID() },
  });
  await db.intentoTriviaRush.create({
    data: {
      ...template,
      id: randomUUID(),
      snapshotInicial: { ...template.snapshotInicial, ghost: null },
    },
  });
});

function publicOnly(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        'snapshotInicial',
        'questions',
        'esCorrecta',
        'explicacion',
        'respuestaCorrectaId',
        'contrasenaHash',
        'usuarioId',
      ].includes(key),
      `Private key: ${key}`,
    );
    publicOnly(child);
  }
}
function http(u, method, path) {
  return request(app.getHttpServer())
    [method](`/trivia-rush/${path}`)
    .set('Authorization', `Bearer ${jwt.sign({ sub: u.id })}`);
}

function evaluationOnly(value, questionId) {
  assert.deepEqual(
    Object.keys(value).sort(),
    [
      'preguntaId',
      'esCorrecta',
      'esFinal',
      'puedeReintentar',
      'puntosOtorgados',
      'comboResultante',
      'tiempoRespuestaMs',
      'respuestaCorrectaId',
      'explicacion',
    ].sort(),
  );
  assert.equal(value.preguntaId, questionId);
  for (const child of Object.values(value))
    assert.ok(child === null || typeof child !== 'object');
}

for (const modalidad of [undefined, 'TRIVIA_RUSH', 'GHOST_DUEL']) {
  test(`real HTTP privacy, ownership and retries: ${modalidad ?? 'legacy'}`, async () => {
    const u = await user();
    if (modalidad === 'GHOST_DUEL') {
      const first = (
        await http(u, 'post', 'intentos')
          .send({ ...config, modalidad })
          .expect(201)
      ).body;
      assert.equal(first.intento.fantasmaInicial, null);
      publicOnly(first);
      await finish({ u, id: first.intento.id });
    }
    const payload = { ...config, ...(modalidad ? { modalidad } : {}) };
    const created = await http(u, 'post', 'intentos').send(payload).expect(201);
    const id = created.body.intento.id;
    publicOnly(created.body);
    if (modalidad === 'GHOST_DUEL') {
      assert.ok(created.body.intento.fantasmaInicial);
      assert.deepEqual(
        Object.keys(created.body.intento.fantasmaInicial).sort(),
        [
          'intentoId',
          'puntaje',
          'respuestasCorrectas',
          'mejorCombo',
          'finalizadoEn',
          'q',
          'config',
          'checkpoints',
        ].sort(),
      );
    }
    if (!modalidad) assert.equal(created.body.intento.modalidad, undefined);
    for (const path of [
      `intentos/${id}`,
      'intentos/activo',
      'fantasma?areas=CIENCIAS_NATURALES&duracionSegundos=120',
    ]) {
      publicOnly((await http(u, 'get', path).expect(200)).body);
    }
    publicOnly(
      (await http(u, 'post', 'intentos').send(payload).expect(201)).body,
    );
    publicOnly(
      (await http(u, 'post', `intentos/${id}/finalizar`).expect(400)).body,
    );
    await request(app.getHttpServer())
      .get(`/trivia-rush/intentos/${id}`)
      .expect(401);
    const other = await user();
    publicOnly((await http(other, 'get', `intentos/${id}`).expect(403)).body);
    publicOnly(
      (await http(u, 'get', `intentos/${id}/snapshot`).expect(404)).body,
    );
    publicOnly(
      (
        await http(u, 'post', 'intentos')
          .send({ ...payload, snapshotInicial: {} })
          .expect(400)
      ).body,
    );
    const saved = await row(id);
    const question =
      saved.snapshotInicial?.questions[0] ??
      (await db.triviaRushPregunta.findFirstOrThrow({
        where: { intentoId: id },
        orderBy: { orden: 'asc' },
        include: { pregunta: { include: { respuestas: true } } },
      }));
    const correct = question.pregunta.respuestas.find((r) => r.esCorrecta);
    const input = {
      preguntaId: question.preguntaId,
      respuestaId: correct.id,
      idempotencyKey: randomUUID(),
    };
    const accepted = (
      await http(u, 'post', `intentos/${id}/respuestas`).send(input).expect(201)
    ).body;
    evaluationOnly(accepted.evaluacion, question.preguntaId);
    assert.equal(accepted.evaluacion.esFinal, true);
    assert.equal(accepted.evaluacion.respuestaCorrectaId, correct.id);
    const { evaluacion, ...rest } = accepted;
    publicOnly(rest); // The next/pending question is never part of evaluation.
    const retry = (
      await http(u, 'post', `intentos/${id}/respuestas`).send(input).expect(201)
    ).body;
    assert.deepEqual(retry.evaluacion, evaluacion);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      1,
    );
    publicOnly(
      (
        await http(other, 'post', `intentos/${id}/respuestas`)
          .send(input)
          .expect(403)
      ).body,
    );
    const abandoned = (
      await http(u, 'post', `intentos/${id}/abandonar`).expect(201)
    ).body;
    assert.equal(abandoned.intento.resultado.revision.length, 1);
    assert.equal(
      abandoned.intento.resultado.revision[0].preguntaId,
      question.preguntaId,
    );
    assert.deepEqual(
      Object.keys(abandoned.intento.resultado.revision[0]).sort(),
      [
        'preguntaId',
        'respuestaSeleccionadaId',
        'respuestaCorrectaId',
        'esCorrecta',
        'saltada',
        'explicacion',
        'area',
        'tema',
        'subtema',
        'subtemaId',
      ].sort(),
    );
    const { resultado, ...terminal } = abandoned.intento;
    publicOnly(terminal);
    const finalized = (
      await http(u, 'post', `intentos/${id}/finalizar`).expect(201)
    ).body;
    assert.deepEqual(finalized.intento.resultado, resultado);
    await noXp({ u, id });
  });
}

test('HTTP official second chance hides the solution until a final evaluation', async () => {
  const f = await start();
  const saved = await row(f.id);
  const question = saved.snapshotInicial.questions[0];
  const grant = await db.concesionRecompensaJuego.create({
    data: {
      usuarioId: f.u.id,
      proveedor: 'fixture',
      referenciaProveedor: randomUUID(),
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  const boost = (
    await http(f.u, 'post', `intentos/${f.id}/potenciadores`)
      .send({
        preguntaId: question.preguntaId,
        potenciador: 'SEGUNDA_OPORTUNIDAD',
        concesionId: grant.id,
        idempotencyKey: randomUUID(),
      })
      .expect(201)
  ).body;
  publicOnly(boost);
  const first = (
    await http(f.u, 'post', `intentos/${f.id}/respuestas`)
      .send({
        preguntaId: question.preguntaId,
        respuestaId: question.pregunta.respuestas.find((r) => !r.esCorrecta).id,
        idempotencyKey: randomUUID(),
      })
      .expect(201)
  ).body;
  assert.equal(first.evaluacion.esFinal, false);
  evaluationOnly(first.evaluacion, question.preguntaId);
  assert.equal(first.evaluacion.esCorrecta, false);
  assert.equal(first.evaluacion.respuestaCorrectaId, null);
  assert.equal(first.evaluacion.explicacion, null);
  const { evaluacion, ...rest } = first;
  publicOnly(rest);
  publicOnly((await http(f.u, 'get', `intentos/${f.id}`).expect(200)).body);
  await noXp(f);
});
