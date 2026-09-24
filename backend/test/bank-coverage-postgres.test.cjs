const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let db, service;

async function rowFor(f) {
  const result = await service.page('MATEMATICAS', 1, 100);
  return result.items.find((r) => r.id === f.subtopic.id);
}
test('counts only visible hierarchy and whitespace-only explanations', async () => {
  const f = await fixture({ count: 4 });
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: { explicacion: null },
  });
  await db.pregunta.update({
    where: { id: f.questions[1].id },
    data: { explicacion: ' \n\t ', dificultad: 'MEDIO' },
  });
  await db.pregunta.update({
    where: { id: f.questions[2].id },
    data: { dificultad: 'AVANZADO' },
  });
  await db.pregunta.update({
    where: { id: f.questions[3].id },
    data: { estadoContenido: 'BORRADOR' },
  });
  const row = await rowFor(f);
  assert.equal(row.total, 4);
  assert.equal(row.publicadas, 3);
  assert.equal(row.sinExplicacion, 2);
  assert.deepEqual(row.dificultades, { BASICO: 1, MEDIO: 1, AVANZADO: 1 });
  assert.deepEqual(row.dificultadesFaltantes, []);
  assert.equal(row.reportes, null);
  assert.doesNotMatch(
    JSON.stringify(row),
    /PRIVATE_EXPLANATION|contrasenaHash|correctAnswerId|Option one/,
  );
});
test('archived parent, draft subtopic or case removes published questions from availability', async () => {
  for (const target of ['topic', 'subtopic', 'case']) {
    const f = await fixture({ count: 1 });
    const [model, id] =
      target === 'topic'
        ? [db.tema, f.topic.id]
        : target === 'subtopic'
          ? [db.subtema, f.subtopic.id]
          : [db.casoPregunta, f.shared.id];
    await model.update({
      where: { id },
      data: { estadoContenido: target === 'topic' ? 'ARCHIVADO' : 'BORRADOR' },
    });
    const row = await rowFor(f);
    assert.equal(row.total, 1);
    assert.equal(row.publicadas, 0);
    assert.equal(row.noDisponibles, 1);
    assert.deepEqual(row.dificultadesFaltantes, [
      'BASICO',
      'MEDIO',
      'AVANZADO',
    ]);
  }
});
test('empty subtopics are present, and counts reflect new publication without caching', async () => {
  const f = await fixture({ count: 1 });
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: { estadoContenido: 'BORRADOR' },
  });
  assert.equal((await rowFor(f)).publicadas, 0);
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: { estadoContenido: 'PUBLICADO' },
  });
  assert.equal((await rowFor(f)).publicadas, 1);
  const empty = await fixture({ count: 0 });
  assert.equal((await rowFor(empty)).total, 0);
});
test('pagination is stable, includes all subtopics, and never crosses areas', async () => {
  const topic = await db.tema.create({
    data: { nombre: 'English only', area: 'INGLES' },
  });
  await db.subtema.createMany({
    data: Array.from({ length: 23 }, (_, i) => ({
      nombre: 'Same name',
      temaId: topic.id,
    })),
  });
  const a = await service.page('INGLES', 1, 20);
  const b = await service.page('INGLES', 2, 20);
  assert.equal(a.totalSubtemas, 23);
  assert.equal(a.hayMas, true);
  assert.equal(b.hayMas, false);
  assert.equal(new Set([...a.items, ...b.items].map((r) => r.id)).size, 23);
  assert.deepEqual((await service.page('INGLES', 1, 20)).items, a.items);
  assert.ok([...a.items, ...b.items].every((r) => r.tema.id === topic.id));
  assert.deepEqual((await service.page('INGLES', 3, 20)).items, []);
});
const status = (code) => (error) => error.getStatus?.() === code;

before(async () => {
  const { validateOwnedConnection } =
    await import('../tool/test_editorial_postgres.mjs');
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error('Use the disposable --coverage runner.');
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
    BankCoverageService,
  } = require('../src/admin/bank-coverage.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  service = new BankCoverageService(db);
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
async function fixture({ count = 12, invalidPrefix = 0 } = {}) {
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
