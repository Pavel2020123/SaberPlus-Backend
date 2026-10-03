require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
const {
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, engine, competitive, sub;
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
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
  );
  const topic = await db.tema.create({
    data: {
      nombre: 'Tug boundary',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Tug boundary',
      temaId: topic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
});
after(async () => {
  await db?.$disconnect();
});
async function fixture() {
  const users = await Promise.all(
    ['A', 'B'].map((name) =>
      db.usuario.create({
        data: {
          nombre: `Private Tug ${name}`,
          correo: `${randomUUID()}@example.invalid`,
          contrasenaHash: 'no-login',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 123,
        },
      }),
    ),
  );
  const questions = [];
  for (let i = 0; i < 4; i++)
    questions.push(
      await db.pregunta.create({
        data: {
          id: randomUUID(),
          enunciado: `Tug question ${i}`,
          explicacion: `Private explanation ${i}`,
          subtemaId: sub.id,
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: [true, false].map((esCorrecta) => ({
              id: randomUUID(),
              texto: String(esCorrecta),
              esCorrecta,
            })),
          },
        },
        include: { respuestas: true },
      }),
    );
  const match = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: users[0].id,
      jugadorBId: users[1].id,
      estado: 'ACTIVA',
      listoA: true,
      listoB: true,
      rondaActual: 1,
      preguntaActualId: questions[0].id,
      rondaIniciaEn: new Date(Date.now() - 1000),
      rondaVenceEn: new Date(Date.now() + 60000),
      expiraEn: new Date(Date.now() + 120000),
      preguntas: {
        create: questions.map((q, i) => ({
          preguntaId: q.id,
          orden: i + 1,
          opcionesOrden: q.respuestas.map((r) => r.id),
        })),
      },
    },
  });
  const input = {
    ronda: 1,
    preguntaId: questions[0].id,
    respuestaId: questions[0].respuestas.find((r) => !r.esCorrecta).id,
    idempotencyKey: randomUUID(),
  };
  return { users, questions, match, input };
}
test('TUG: simultaneous exact retries accept one response and return successfully', async () => {
  const f = await fixture();
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      engine.responder(f.users[0].id, f.match.id, f.input),
    ),
  );
  assert.ok(results.every((r) => r.partida.yaRespondi));
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
});
test('TUG: one UUID key cannot create actions concurrently in two matches', async () => {
  const a = await fixture();
  const b = await fixture();
  const results = await Promise.allSettled([
    engine.responder(a.users[0].id, a.match.id, a.input),
    engine.responder(b.users[0].id, b.match.id, {
      ...b.input,
      idempotencyKey: a.input.idempotencyKey.toUpperCase(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus?.(),
    403,
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({
      where: { partidaId: { in: [a.match.id, b.match.id] } },
    }),
    1,
  );
});
test('TUG: accepted key rejects altered round, question, option, owner and match', async () => {
  const f = await fixture();
  await engine.responder(f.users[0].id, f.match.id, f.input);
  for (const changed of [
    { ronda: 2 },
    { preguntaId: f.questions[1].id },
    { respuestaId: f.questions[0].respuestas.find((r) => r.esCorrecta).id },
  ])
    await assert.rejects(
      engine.responder(f.users[0].id, f.match.id, { ...f.input, ...changed }),
      (e) => e.getStatus?.() === 403,
    );
  await assert.rejects(
    engine.responder(f.users[1].id, f.match.id, f.input),
    (e) => e.getStatus?.() === 403,
  );
  await assert.rejects(
    engine.responder(f.users[0].id, randomUUID(), f.input),
    (e) => e.getStatus?.() === 403,
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
});
test('TUG: different keys in the same player round cannot write a second response', async () => {
  const f = await fixture();
  const results = await Promise.allSettled(
    [f.input, { ...f.input, idempotencyKey: randomUUID() }].map((input) =>
      engine.responder(f.users[0].id, f.match.id, input),
    ),
  );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus?.(),
    400,
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
});
test('TUG: equivalent UUID key representation is one operation', async () => {
  const f = await fixture();
  await engine.responder(f.users[0].id, f.match.id, f.input);
  await engine.responder(f.users[0].id, f.match.id, {
    ...f.input,
    idempotencyKey: f.input.idempotencyKey.toUpperCase(),
  });
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
});
test('TUG: concurrent players produce one resolution, private active question and seat aliases', async () => {
  const f = await fixture();
  await Promise.all(
    f.users.map((u, i) =>
      engine.responder(u.id, f.match.id, {
        ...f.input,
        idempotencyKey: i ? randomUUID() : f.input.idempotencyKey,
      }),
    ),
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    2,
  );
  assert.equal(
    await db.tiraAflojaEvento.count({
      where: { partidaId: f.match.id, tipo: 'RONDA_RESUELTA' },
    }),
    1,
  );
  const state = await engine.obtener(f.users[0].id, f.match.id);
  assert.equal(state.partida.rondaActual, 2);
  assert.deepEqual(state.partida.yo, {
    id: 'A',
    nombre: 'Jugador A',
    fotoPerfil: null,
  });
  assert.equal(state.partida.rival.id, 'B');
  for (const u of f.users) assert.ok(!JSON.stringify(state).includes(u.id));
  assert.ok(!JSON.stringify(state.partida.pregunta).includes('esCorrecta'));
  assert.ok(
    !JSON.stringify(state.partida.pregunta).includes('Private explanation'),
  );
  assert.ok(
    !JSON.stringify(state.partida.pregunta).includes(f.questions[2].id),
  );
  await assert.rejects(
    engine.obtener(randomUUID(), f.match.id),
    (e) => e.getStatus?.() === 403,
  );
});
test('TUG: restart and terminal close preserve exact retry without a new action or XP', async () => {
  const f = await fixture();
  await engine.responder(f.users[0].id, f.match.id, f.input);
  await engine.abandonar(f.users[0].id, f.match.id);
  const restarted = new TiraAflojaService(
    db,
    new TiraAflojaRealtimePublisher(),
  );
  assert.equal(
    (await restarted.responder(f.users[0].id, f.match.id, f.input)).partida
      .estado,
    'FINALIZADA',
  );
  await assert.rejects(
    restarted.responder(f.users[0].id, f.match.id, {
      ...f.input,
      idempotencyKey: randomUUID(),
    }),
    (e) => e.getStatus?.() === 400,
  );
  for (const u of f.users) {
    await assert.rejects(
      competitive.settle({
        sourceType: 'TUG_MATCH',
        sourceId: f.match.id,
        participantId: u.id,
      }),
      (e) => e.code === 'SOURCE_NOT_INTEGRATED',
    );
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      123,
    );
  }
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.match.id },
    }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) } },
    }),
    0,
  );
});
test('TUG: mutable bank is an explicit competitive blocker, not an immutable snapshot', async () => {
  const f = await fixture();
  await db.respuesta.update({
    where: { id: f.input.respuestaId },
    data: { esCorrecta: true },
  });
  await engine.responder(f.users[0].id, f.match.id, f.input);
  const answer = await db.tiraAflojaRespuesta.findUniqueOrThrow({
    where: { claveIdempotencia: f.input.idempotencyKey },
  });
  assert.equal(answer.esCorrecta, true); // Current legacy contract consults the changed bank.
  await assert.rejects(
    competitive.settle({
      sourceType: 'TUG_MATCH',
      sourceId: f.match.id,
      participantId: f.users[0].id,
    }),
    (e) => e.code === 'SOURCE_NOT_INTEGRATED',
  );
});
