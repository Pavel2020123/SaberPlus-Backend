const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let db, service;
const status = (code) => (error) => error.getStatus?.() === code;

before(async () => {
  const { validateOwnedConnection } =
    await import('../tool/test_editorial_postgres.mjs');
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error('Use the disposable --star-rescue runner.');
  validateOwnedConnection(
    process.env.EDITORIAL_TEST_URL,
    JSON.parse(await readFile(process.env.EDITORIAL_TEST_OWNER, 'utf8')),
  );
  require('ts-node').register({
    transpileOnly: true,
    project: 'tsconfig.json',
  });
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  const {
    StarRescueService,
  } = require('../src/star-rescue/star-rescue.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  service = new StarRescueService(db);
});
after(async () => {
  await db?.$disconnect();
});

async function user(rol = 'ESTUDIANTE') {
  return db.usuario.create({
    data: {
      nombre: 'Test',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'test-no-login',
      rol,
      correoVerificado: true,
    },
  });
}
async function fixture({ count = 10, invalidPrefix = 0 } = {}) {
  const student = await user();
  const topic = await db.tema.create({
    data: {
      nombre: 'Ratios',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const subtopic = await db.subtema.create({
    data: {
      nombre: 'Proportions',
      temaId: topic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  const shared = await db.casoPregunta.create({
    data: {
      titulo: 'Context',
      contexto: 'Public passage',
      imagenUrl: '/case.png',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const questions = Array.from({ length: count + invalidPrefix }, (_, i) => ({
    id: `${subtopic.id}-${String(i).padStart(4, '0')}`,
    subtemaId: subtopic.id,
    enunciado: `Question ${i}`,
    explicacion: 'PRIVATE_EXPLANATION',
    imagenUrl: '/question.png',
    dificultad: 'BASICO',
    estadoContenido: 'PUBLICADO',
    casoId: shared.id,
    ordenEnCaso: i,
  }));
  await db.pregunta.createMany({ data: questions });
  await db.respuesta.createMany({
    data: questions.flatMap((q, i) => [
      {
        id: `${q.id}-yes`,
        preguntaId: q.id,
        texto: 'Option one',
        esCorrecta: i >= invalidPrefix,
      },
      {
        id: `${q.id}-no`,
        preguntaId: q.id,
        texto: 'Option two',
        esCorrecta: false,
      },
    ]),
  });
  return {
    student,
    topic,
    subtopic,
    shared,
    questions,
    config: { area: 'MATEMATICAS', temaId: topic.id, subtemaId: subtopic.id },
  };
}
const input = (state, correct, key = randomUUID()) => ({
  preguntaId: state.pregunta.id,
  respuestaId: `${state.pregunta.id}-${correct ? 'yes' : 'no'}`,
  idempotencyKey: key,
});

test('private snapshots, published hierarchy, optional filters, no future solutions', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  assert.deepEqual(state.reglas, {
    version: 1,
    target: 6,
    questions: 10,
    starsPerConstellation: 3,
  });
  assert.equal(state.dificultad, null);
  assert.equal(state.estrellas, 0);
  assert.equal(state.pregunta.caso.contexto, 'Public passage');
  assert.equal(state.pregunta.imagenUrl, '/question.png');
  assert.equal(state.pregunta.subtema.id, f.subtopic.id);
  assert.doesNotMatch(
    JSON.stringify(state),
    /correctAnswerId|PRIVATE_EXPLANATION|esCorrecta|idempotencyKey|usuarioId/,
  );
  assert.equal(state.preguntas, undefined);
  const row = await db.intentoRescateEstrellas.findUniqueOrThrow({
    where: { id: state.id },
  });
  assert.equal(row.preguntas.length, 10);
  assert.equal(new Set(row.preguntas.map((q) => q.question.id)).size, 10);
});

test('does not repeat content to fill an insufficient bank or invalid filter', async () => {
  const f = await fixture({ count: 9 });
  await assert.rejects(service.start(f.student.id, f.config), status(400));
  assert.equal(
    await db.intentoRescateEstrellas.count({
      where: { usuarioId: f.student.id },
    }),
    0,
  );
  const g = await fixture();
  for (const config of [
    { ...g.config, area: 'INGLES' },
    { ...g.config, dificultad: 'AVANZADO' },
    { ...g.config, temaId: f.topic.id },
  ]) {
    await assert.rejects(service.start(g.student.id, config), status(400));
  }
});

test('draft question, parent topic, subtopic or shared case cannot enter a game', async () => {
  for (const target of ['question', 'topic', 'subtopic', 'case']) {
    const f = await fixture();
    const [model, id] =
      target === 'question'
        ? [db.pregunta, f.questions[0].id]
        : target === 'topic'
          ? [db.tema, f.topic.id]
          : target === 'subtopic'
            ? [db.subtema, f.subtopic.id]
            : [db.casoPregunta, f.shared.id];
    await model.update({
      where: { id },
      data: { estadoContenido: 'BORRADOR' },
    });
    await assert.rejects(service.start(f.student.id, f.config), status(400));
  }
});

test('selection reaches valid questions beyond first page', async () => {
  const f = await fixture({ invalidPrefix: 200 });
  const state = await service.start(f.student.id, f.config);
  assert.ok(Number(state.pregunta.id.split('-').pop()) >= 200);
  const row = await db.intentoRescateEstrellas.findUniqueOrThrow({
    where: { id: state.id },
  });
  assert.equal(row.preguntas.length, 10);
  assert.ok(
    row.preguntas.every((q) => Number(q.question.id.split('-').pop()) >= 200),
  );
});

test('only students and the owner can read or mutate attempts', async () => {
  const f = await fixture();
  const started = await service.start(f.student.id, f.config);
  for (const role of ['PROFESOR', 'ADMIN']) {
    const other = await user(role);
    for (const action of [
      () => service.start(other.id, f.config),
      () => service.active(other.id),
      () => service.get(other.id, started.id),
      () => service.answer(other.id, started.id, input(started, true)),
      () => service.abandon(other.id, started.id),
    ])
      await assert.rejects(action(), status(403));
  }
  const outsider = await user();
  for (const action of [
    () => service.get(outsider.id, started.id),
    () => service.answer(outsider.id, started.id, input(started, true)),
    () => service.abandon(outsider.id, started.id),
  ])
    await assert.rejects(action(), status(404));
});

test('concurrent starts reuse one attempt; different configuration conflicts', async () => {
  const f = await fixture();
  const [a, b] = await Promise.all([
    service.start(f.student.id, f.config),
    service.start(f.student.id, f.config),
  ]);
  assert.equal(a.id, b.id);
  assert.equal(
    await db.intentoRescateEstrellas.count({
      where: { usuarioId: f.student.id },
    }),
    1,
  );
  await assert.rejects(
    service.start(f.student.id, { ...f.config, dificultad: 'BASICO' }),
    status(409),
  );
  assert.equal((await service.active(f.student.id)).id, a.id);
});

test('concurrent retries accept once; changed option/key cannot grade again', async () => {
  const f = await fixture();
  const start = await service.start(f.student.id, f.config);
  const request = input(start, false);
  const [a, b] = await Promise.all([
    service.answer(f.student.id, start.id, request),
    service.answer(f.student.id, start.id, request),
  ]);
  assert.equal(a.respondidas, 1);
  assert.equal(b.respondidas, 1);
  assert.equal(a.estrellas, 0);
  await assert.rejects(
    service.answer(f.student.id, start.id, {
      ...request,
      respuestaId: `${request.preguntaId}-yes`,
    }),
    status(409),
  );
  await assert.rejects(
    service.answer(f.student.id, start.id, {
      ...request,
      idempotencyKey: randomUUID(),
    }),
    status(409),
  );
  assert.equal((await service.get(f.student.id, start.id)).respondidas, 1);
});

test('conflicting parallel answers accept only one and never produce lost updates', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  const results = await Promise.allSettled([
    service.answer(f.student.id, state.id, input(state, true)),
    service.answer(f.student.id, state.id, input(state, false)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal((await service.get(f.student.id, state.id)).respondidas, 1);
});

test('rejects future questions and foreign options without mutation', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  const row = await db.intentoRescateEstrellas.findUniqueOrThrow({
    where: { id: state.id },
  });
  const future = row.preguntas[1].question.id;
  await assert.rejects(
    service.answer(f.student.id, state.id, {
      ...input(state, true),
      preguntaId: future,
    }),
    status(409),
  );
  await assert.rejects(
    service.answer(f.student.id, state.id, {
      ...input(state, true),
      respuestaId: `${future}-yes`,
    }),
    status(400),
  );
  assert.equal((await service.get(f.student.id, state.id)).respondidas, 0);
});

test('grading uses the original snapshot, not a subsequently edited question', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  await db.respuesta.update({
    where: { id: `${state.pregunta.id}-yes` },
    data: { esCorrecta: false },
  });
  await db.respuesta.update({
    where: { id: `${state.pregunta.id}-no` },
    data: { esCorrecta: true },
  });
  const next = await service.answer(f.student.id, state.id, input(state, true));
  assert.equal(next.estrellas, 1);
  assert.equal(next.ultimaRespuesta.esCorrecta, true);
  assert.doesNotMatch(
    JSON.stringify(next),
    /correctAnswerId|PRIVATE_EXPLANATION|idempotencyKey/,
  );
});

test('rescues without losing stars, finishes at six; terminal retry is safe and XP unchanged', async () => {
  const f = await fixture();
  let state = await service.start(f.student.id, f.config);
  let last;
  for (const correct of [true, true, false, true, true, true, true]) {
    last = input(state, correct);
    state = await service.answer(f.student.id, state.id, last);
  }
  assert.equal(state.estado, 'VICTORIA');
  assert.equal(state.estrellas, 6);
  assert.equal(state.constelaciones, 2);
  assert.equal(state.pregunta, null);
  assert.deepEqual(await service.answer(f.student.id, state.id, last), state);
  await assert.rejects(
    service.answer(f.student.id, state.id, {
      ...last,
      idempotencyKey: randomUUID(),
    }),
    status(409),
  );
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.student.id } }))
      .xpTotal,
    0,
  );
  assert.equal(
    await db.historialRespuesta.count({ where: { usuarioId: f.student.id } }),
    0,
  );
});

test('ten wrong answers exhaust the game at zero without solutions', async () => {
  const f = await fixture();
  let state = await service.start(f.student.id, f.config);
  for (let i = 0; i < 10; i++)
    state = await service.answer(f.student.id, state.id, input(state, false));
  assert.equal(state.estado, 'AGOTADO');
  assert.equal(state.estrellas, 0);
  assert.equal(state.errores, 10);
  assert.equal(state.pregunta, null);
  assert.equal(await service.active(f.student.id), null);
});

test('expiry is committed without grading; a new attempt can start', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  await db.intentoRescateEstrellas.update({
    where: { id: state.id },
    data: {
      creadoEn: new Date(Date.now() - 172800000),
      venceEn: new Date(Date.now() - 86400000),
    },
  });
  const expired = await service.answer(
    f.student.id,
    state.id,
    input(state, true),
  );
  assert.equal(expired.estado, 'EXPIRADO');
  assert.equal(expired.respondidas, 0);
  assert.equal(
    (
      await db.intentoRescateEstrellas.findUniqueOrThrow({
        where: { id: state.id },
      })
    ).estado,
    'EXPIRADO',
  );
  assert.notEqual((await service.start(f.student.id, f.config)).id, state.id);
});

test('abandonment is idempotent and cannot later accept an answer', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  const ended = await service.abandon(f.student.id, state.id);
  assert.equal(ended.estado, 'ABANDONADO');
  assert.deepEqual(await service.abandon(f.student.id, state.id), ended);
  await assert.rejects(
    service.answer(f.student.id, state.id, input(state, true)),
    status(409),
  );
});

test('database rejects a second active attempt even outside the service lock', async () => {
  const f = await fixture();
  const state = await service.start(f.student.id, f.config);
  const row = await db.intentoRescateEstrellas.findUniqueOrThrow({
    where: { id: state.id },
  });
  await assert.rejects(
    db.intentoRescateEstrellas.create({ data: { ...row, id: randomUUID() } }),
    (e) => e.code === 'P2002',
  );
});

test('RLS and privilege revocation protect snapshots from direct Supabase roles', async () => {
  const [table] = await db.$queryRawUnsafe(
    `SELECT relrowsecurity FROM pg_class WHERE oid = 'public."IntentoRescateEstrellas"'::regclass`,
  );
  assert.equal(table.relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of [
      'SELECT',
      'INSERT',
      'UPDATE',
      'DELETE',
      'TRUNCATE',
      'REFERENCES',
      'TRIGGER',
    ]) {
      const [result] = await db.$queryRawUnsafe(
        `SELECT has_table_privilege($1, 'public."IntentoRescateEstrellas"', $2) AS allowed`,
        role,
        privilege,
      );
      assert.equal(result.allowed, false);
    }
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRawUnsafe('SELECT * FROM "IntentoRescateEstrellas"');
      }),
      (e) => e.code === 'P2010' && e.meta?.code === '42501',
    );
    const rollback = new Error('ROLLBACK_TEST_GRANT');
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `GRANT SELECT ON "IntentoRescateEstrellas" TO ${role}`,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        assert.deepEqual(
          await tx.$queryRawUnsafe('SELECT * FROM "IntentoRescateEstrellas"'),
          [],
        );
        throw rollback;
      }),
      (e) => e === rollback,
    );
  }
});

test('winning on the tenth answer takes precedence over exhausted state', async () => {
  const f = await fixture();
  let state = await service.start(f.student.id, f.config);
  for (const correct of [...Array(4).fill(false), ...Array(6).fill(true)])
    state = await service.answer(f.student.id, state.id, input(state, correct));
  assert.equal(state.respondidas, 10);
  assert.equal(state.estrellas, 6);
  assert.equal(state.constelaciones, 2);
  assert.equal(state.estado, 'VICTORIA');
});

test('partial rescue keeps its stars and a retry returns the latest state', async () => {
  const f = await fixture();
  let state = await service.start(f.student.id, f.config);
  const first = input(state, true);
  state = await service.answer(f.student.id, state.id, first);
  for (let index = 1; index < 10; index++)
    state = await service.answer(
      f.student.id,
      state.id,
      input(state, index < 5),
    );
  assert.equal(state.estado, 'AGOTADO');
  assert.equal(state.estrellas, 5);
  assert.equal(state.constelaciones, 1);
  assert.deepEqual(await service.answer(f.student.id, state.id, first), state);
  assert.equal(state.ultimaRespuesta.estrellasGanadas, 0);
});

test('another service instance recovers the persisted attempt, without memory state', async () => {
  const f = await fixture();
  const initial = await service.start(f.student.id, f.config);
  const saved = await service.answer(
    f.student.id,
    initial.id,
    input(initial, true),
  );
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  const {
    StarRescueService,
  } = require('../src/star-rescue/star-rescue.service.ts');
  const second = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  try {
    const recovered = new StarRescueService(second);
    assert.deepEqual(await recovered.active(f.student.id), saved);
    assert.deepEqual(await recovered.get(f.student.id, initial.id), saved);
  } finally {
    await second.$disconnect();
  }
});

test('shared context from another area is rejected even when published', async () => {
  const f = await fixture();
  await db.casoPregunta.update({
    where: { id: f.shared.id },
    data: { area: 'INGLES' },
  });
  await assert.rejects(service.start(f.student.id, f.config), status(400));
  assert.equal(
    await db.intentoRescateEstrellas.count({
      where: { usuarioId: f.student.id },
    }),
    0,
  );
});
