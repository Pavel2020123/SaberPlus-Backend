require('ts-node/register/transpile-only');
const { test } = require('node:test');
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
const {
  CompetitiveReconciler,
} = require('../src/competitive/competitive.reconciler');

function assertPrivateActiveQuestion(question) {
  assert.deepEqual(
    Object.keys(question).sort(),
    [
      'id',
      'enunciado',
      'imagenUrl',
      'contexto',
      'dificultad',
      'area',
      'tema',
      'subtema',
      'subtemaId',
      'opciones',
    ].sort(),
  );
  for (const option of question.opciones)
    assert.deepEqual(Object.keys(option).sort(), ['id', 'texto']);
}
function assertNoInternalFields(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert.ok(
      ![
        'correo',
        'contrasenaHash',
        'usuarioId',
        'institucionId',
        'evidenciaHash',
        'ledger',
        'competitiveRetryAt',
        'competitiveSettledAt',
      ].includes(key),
      `Private field exposed: ${key}`,
    );
    assertNoInternalFields(child);
  }
}

test('real legacy Trivia and ghost reference cannot accrue competitive XP through retries or recovery', async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const db = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  const previous = process.env.COMPETITIVE_SOLO_ENABLED;
  try {
    process.env.COMPETITIVE_SOLO_ENABLED = 'true';
    const topic = await db.tema.create({
      data: {
        nombre: 'Trivia boundary fixture',
        area: 'INGLES',
        estadoContenido: 'PUBLICADO',
      },
    });
    const sub = await db.subtema.create({
      data: {
        nombre: 'Fixture',
        temaId: topic.id,
        estadoContenido: 'PUBLICADO',
      },
    });
    for (let i = 0; i < 10; i++) {
      await db.pregunta.create({
        data: {
          id: randomUUID(),
          subtemaId: sub.id,
          enunciado: `Question ${i}`,
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: Array.from({ length: 4 }, (_, j) => ({
              id: randomUUID(),
              texto: `Option ${j}`,
              esCorrecta: j === 0,
            })),
          },
        },
      });
    }
    const user = await db.usuario.create({
      data: {
        nombre: 'Boundary fixture',
        correo: `${randomUUID()}@example.invalid`,
        contrasenaHash: 'no-login',
        rol: 'ESTUDIANTE',
        correoVerificado: true,
        xpTotal: 123,
      },
    });
    const service = new TriviaRushService(db);
    const competitive = new CompetitiveService(
      db,
      new CompetitiveVerifierRegistry(createSoloVerifiers()),
    );
    const config = { areas: ['INGLES'], duracionSegundos: 120 };
    assert.equal(
      (await service.obtenerFantasma(user.id, config)).fantasma,
      null,
    );
    let response = await service.crear(user.id, config);
    const id = response.intento.id;
    assertPrivateActiveQuestion(response.intento.pregunta);
    assertNoInternalFields(response);
    const other = await db.usuario.create({
      data: {
        nombre: 'Other fixture',
        correo: `${randomUUID()}@example.invalid`,
        contrasenaHash: 'no-login',
        rol: 'ESTUDIANTE',
        correoVerificado: true,
      },
    });
    await assert.rejects(
      service.obtener(other.id, id),
      (error) => error.getStatus?.() === 403,
    );
    let answered = 0;
    while (response.intento.estado === 'ACTIVO') {
      assert.ok(answered++ < 30);
      const preguntaId = response.intento.pregunta.id;
      const correct = await db.respuesta.findFirstOrThrow({
        where: { preguntaId, esCorrecta: true },
      });
      const input = {
        preguntaId,
        respuestaId: correct.id,
        idempotencyKey: randomUUID(),
      };
      response = await service.responder(user.id, id, input);
      const retry = await service.responder(user.id, id, input);
      assert.equal(
        retry.evaluacion.puntosOtorgados,
        response.evaluacion.puntosOtorgados,
      );
      assert.deepEqual(retry.intento.marcador, response.intento.marcador);
      assert.equal(
        await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
        answered,
      );
      if (response.intento.estado === 'ACTIVO')
        assertPrivateActiveQuestion(response.intento.pregunta);
      assertNoInternalFields(response);
      if (answered === 1) {
        await assert.rejects(
          service.responder(other.id, id, input),
          (error) => error.getStatus?.() === 403,
        );
        await assert.rejects(
          service.responder(user.id, id, {
            ...input,
            respuestaId: randomUUID(),
          }),
          (error) => error.getStatus?.() === 403,
        );
        assert.equal(
          await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
          1,
        );
      }
    }
    assert.equal(response.intento.estado, 'FINALIZADO');
    const ghost = (await service.obtenerFantasma(user.id, config)).fantasma;
    assert.equal(ghost.intentoId, id);
    assertNoInternalFields(ghost);
    assert.equal(
      (await service.obtenerFantasma(other.id, config)).fantasma,
      null,
    );
    assert.equal(
      await db.intentoTriviaRush.count({ where: { usuarioId: user.id } }),
      1,
    );
    const source = {
      sourceType: 'TRIVIA_ATTEMPT',
      sourceId: id,
      participantId: user.id,
    };
    await Promise.all(
      [1, 2].map(() =>
        assert.rejects(competitive.settle(source), /SOURCE_NOT_INTEGRATED/),
      ),
    );
    await new CompetitiveReconciler(db, competitive).reconcile();
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: user.id } }),
      0,
    );
    assert.equal(
      await db.balanceCompetitivo.count({ where: { usuarioId: user.id } }),
      0,
    );
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: user.id } })).xpTotal,
      123,
    );
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      answered,
    );
  } finally {
    if (previous === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
    else process.env.COMPETITIVE_SOLO_ENABLED = previous;
    await db.$disconnect();
  }
});
