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
  TiraAflojaPresenceService,
} = require('../src/tira-afloja/tira-afloja-presence.service');
const {
  TiraAflojaController,
} = require('../src/tira-afloja/tira-afloja.controller');
const { TiraAflojaGateway } = require('../src/tira-afloja/tira-afloja.gateway');
const {
  TiraAflojaWsAuthService,
} = require('../src/tira-afloja/tira-afloja-ws-auth.service');
const {
  TiraAflojaWsExceptionFilter,
} = require('../src/tira-afloja/tira-afloja-ws-exception.filter');
const { PrismaService } = require('../src/prisma/prisma.service');
const { Test } = require('@nestjs/testing');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const request = require('supertest');
const { io } = require('socket.io-client');
let db, engine, sub, app, jwt, initialLedger;
const ownedMatches = [];
const ownedUsers = [];
const instance = randomUUID();
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
  initialLedger = await db.eventoXpCompetitivo.count({
    where: { sourceType: 'TUG_MATCH' },
  });
  const publisher = new TiraAflojaRealtimePublisher();
  engine = new TiraAflojaService(db, publisher);
  const tema = await db.tema.create({
    data: {
      nombre: 'Presence Tug',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Presence sub',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  const facade = Object.fromEntries(
    [
      'emparejar',
      'obtenerActiva',
      'obtener',
      'marcarListo',
      'responder',
      'abandonar',
    ].map((k) => [k, engine[k].bind(engine)]),
  );
  const mod = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'owned-tug-presence' })],
    controllers: [TiraAflojaController],
    providers: [
      TiraAflojaGateway,
      TiraAflojaPresenceService,
      TiraAflojaWsAuthService,
      TiraAflojaWsExceptionFilter,
      { provide: TiraAflojaService, useValue: facade },
      { provide: PrismaService, useValue: db },
      { provide: TiraAflojaRealtimePublisher, useValue: publisher },
    ],
  }).compile();
  app = mod.createNestApplication();
  await app.listen(0, '127.0.0.1');
  jwt = mod.get(JwtService);
});
after(async () => {
  await resetClock();
  await app?.close();
  await db?.$disconnect();
});
async function resetClock() {
  if (db)
    await db.$executeRawUnsafe(
      "CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT timezone('UTC',clock_timestamp()) $$",
    );
}
// Only the disposable database clock is changed, never production code, windows,
// game deadlines or assertions. All instants derive from the actual PG fixture.
async function clock(at) {
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${at.toISOString()}'::timestamptz AT TIME ZONE 'UTC' $$`,
  );
}
async function fixture(presence = true, deadlineMs = 120000) {
  await resetClock();
  const users = await Promise.all(
    [0, 1].map((i) =>
      db.usuario.create({
        data: {
          nombre: `Presence ${i}`,
          correo: `${randomUUID()}@example.invalid`,
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 321,
        },
      }),
    ),
  );
  const qs = [];
  for (let i = 0; i < 4; i++)
    qs.push(
      await db.pregunta.create({
        data: {
          id: randomUUID(),
          subtemaId: sub.id,
          enunciado: `Presence q${i}`,
          explicacion: 'PRIVATE',
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: [false, true].map((esCorrecta) => ({
              id: randomUUID(),
              texto: String(esCorrecta),
              esCorrecta,
            })),
          },
        },
        include: { respuestas: true },
      }),
    );
  const [now] =
    await db.$queryRaw`SELECT timezone('UTC',clock_timestamp())::timestamp(3) AS at`;
  let m = await db.partidaTiraAfloja.create({
    data: {
      prepararEvidencia: true,
      presenciaVersion: presence ? 1 : null,
      jugadorAId: users[0].id,
      expiraEn: new Date(now.at.getTime() + deadlineMs),
      preguntas: {
        create: qs.map((q, i) => ({
          orden: i + 1,
          preguntaId: q.id,
          opcionesOrden: q.respuestas.map((r) => r.id),
        })),
      },
    },
  });
  await db.partidaTiraAfloja.update({
    where: { id: m.id },
    data: { estado: 'PREPARANDO', jugadorBId: users[1].id },
  });
  await engine.marcarListo(users[0].id, m.id);
  await engine.marcarListo(users[1].id, m.id);
  m = await db.partidaTiraAfloja.findUniqueOrThrow({ where: { id: m.id } });
  ownedMatches.push(m.id);
  ownedUsers.push(...users.map((u) => u.id));
  return { m, users, qs, t: m.rondaIniciaEn };
}
function at(f, seconds) {
  return new Date(f.t.getTime() + seconds * 1000);
}
function answer(f, i = 0) {
  return {
    ronda: 1,
    preguntaId: f.qs[0].id,
    respuestaId: f.qs[0].respuestas.find((r) => r.esCorrecta).id,
    idempotencyKey: randomUUID(),
  };
}
async function connect(f, i = 0, id = randomUUID(), inst = instance) {
  const [r] =
    await db.$queryRaw`SELECT tug_presence_connect(${f.m.id}::uuid,${f.users[i].id}::uuid,${id}::uuid,${inst}::uuid,NULL::timestamp,NULL::timestamp) AS state`;
  return { id, inst, state: r.state };
}
async function observe(f, c, op) {
  const [r] =
    await db.$queryRaw`SELECT tug_presence_observe(${f.m.id}::uuid,${c.id}::uuid,${c.inst}::uuid,${op},NULL::timestamp) AS state`;
  return r.state;
}
async function available(f) {
  await db.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM (${f.t}::timestamp-timezone('UTC',clock_timestamp())))))::text`;
}
async function row(f) {
  return db.partidaTiraAfloja.findUniqueOrThrow({ where: { id: f.m.id } });
}

test('TUG presence: authenticated HTTP needs OPEN; disconnect blocks new answers, exact retry survives, reconnect retains clocks', async () => {
  const f = await fixture();
  await available(f);
  const token = jwt.sign({
    sub: f.users[0].id,
    correo: f.users[0].correo,
    rol: 'ESTUDIANTE',
    nombre: 'A',
  });
  // The existing verifier accepts a signed token with no exp; no expiry is invented.
  assert.equal(jwt.verify(token).exp, undefined);
  const send = (a) =>
    request(app.getHttpServer())
      .post(`/tira-afloja/${f.m.id}/respuestas`)
      .set('Authorization', `Bearer ${token}`)
      .send(a);
  const a = answer(f);
  const denied = await send(a);
  assert.equal(denied.status, 409);
  const c = await connect(f);
  assert.equal(c.state, 'OPEN');
  const b = await connect(f, 1);
  assert.equal((await send(a)).status, 201);
  await observe(f, c, 'DISCONNECT');
  const duplicate = await send(answer(f));
  assert.equal(duplicate.status, 400);
  assert.match(duplicate.body.message, /Ya respondiste esta ronda/);
  await observe(f, b, 'DISCONNECT');
  const bToken = jwt.sign({
    sub: f.users[1].id,
    correo: f.users[1].correo,
    rol: 'ESTUDIANTE',
    nombre: 'B',
  });
  const blockedB = await request(app.getHttpServer())
    .post(`/tira-afloja/${f.m.id}/respuestas`)
    .set('Authorization', `Bearer ${bToken}`)
    .send(answer(f, 1));
  assert.equal(blockedB.status, 409);
  assert.match(blockedB.body.message, /TUG_PRESENCE_REQUIRED/);
  assert.equal((await send(a)).status, 201);
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.m.id } }),
    1,
  );
  const reopened = await connect(f);
  assert.equal(reopened.state, 'OPEN');
  assert.equal((await row(f)).expiraEn.getTime(), f.m.expiraEn.getTime());
  assert.equal(
    (await row(f)).rondaVenceEn.getTime(),
    f.m.rondaVenceEn.getTime(),
  );
  assert.equal((await connect(f, 1)).state, 'OPEN');
  await engine.responder(f.users[1].id, f.m.id, answer(f, 1));
  await assert.rejects(
    engine.responder(f.users[1].id, f.m.id, { ...a }),
    /clave/,
  );
});

test('TUG presence: two sockets, wrong instance, out-of-order CLOSED events and concurrent actions serialize', async () => {
  const f = await fixture();
  await available(f);
  const c = await connect(f),
    d = await connect(f);
  await observe(f, c, 'DISCONNECT');
  assert.equal(
    (
      await db.tugPresence.findUnique({
        where: { matchId_userId: { matchId: f.m.id, userId: f.users[0].id } },
      })
    ).graceUntil,
    null,
  );
  await assert.rejects(
    observe(f, { ...d, inst: randomUUID() }, 'DISCONNECT'),
    /identity mismatch/,
  );
  assert.equal(await observe(f, c, 'RENEW'), 'CLOSED');
  const a = answer(f);
  await Promise.all([
    engine.responder(f.users[0].id, f.m.id, a),
    observe(f, d, 'RENEW'),
  ]);
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.m.id } }),
    1,
  );
  const b = await connect(f, 1);
  const results = await Promise.allSettled([
    engine.responder(f.users[1].id, f.m.id, answer(f, 1)),
    observe(f, b, 'DISCONNECT'),
  ]);
  if (results[0].status === 'fulfilled') {
    const [order] =
      await db.$queryRaw`SELECT r."recibidaEn"<=c."closedAt" AS valid FROM "TiraAflojaRespuesta" r JOIN "TugConnection" c ON c.id=${b.id}::uuid WHERE r."partidaId"=${f.m.id}::uuid AND r."usuarioId"=${f.users[1].id}::uuid`;
    assert.equal(order.valid, true);
  } else assert.match(results[0].reason.message, /TUG_PRESENCE_REQUIRED/);
  assert.equal(results[1].status, 'fulfilled');
  await observe(f, d, 'DISCONNECT');
  assert.ok(
    (
      await db.tugPresence.findUnique({
        where: { matchId_userId: { matchId: f.m.id, userId: f.users[0].id } },
      })
    ).graceUntil,
  );
  const reconnectId = randomUUID(),
    otherInstance = randomUUID();
  const [reconnected, oldClose] = await Promise.all([
    connect(f, 0, reconnectId, otherInstance),
    observe(f, d, 'DISCONNECT'),
  ]);
  assert.equal(reconnected.state, 'OPEN');
  assert.equal(oldClose, 'CLOSED');
  assert.equal(
    (
      await db.tugPresence.findUniqueOrThrow({
        where: { matchId_userId: { matchId: f.m.id, userId: f.users[0].id } },
      })
    ).graceUntil,
    null,
  );
  assert.equal(
    (await db.tugConnection.findUniqueOrThrow({ where: { id: reconnectId } }))
      .instanceId,
    otherInstance,
  );
});

test('TUG presence: UNKNOWN and expired leases block new actions and never invent abandonment; reconnect retires old observer', async () => {
  const f = await fixture();
  await available(f);
  const c = await connect(f);
  await observe(f, c, 'UNCERTAIN');
  await assert.rejects(
    engine.responder(f.users[0].id, f.m.id, answer(f)),
    /TUG_PRESENCE_REQUIRED/,
  );
  await engine.procesarEstado(f.m.id);
  assert.equal((await row(f)).estado, 'ACTIVA');
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  const d = await connect(f);
  assert.equal(d.state, 'OPEN');
  assert.equal(await observe(f, c, 'DISCONNECT'), 'RETIRED');
  const [lease] =
    await db.$queryRaw`SELECT "leaseUntil"::text AS at FROM "TugConnection" WHERE id=${d.id}::uuid`;
  // Preserve the exact PostgreSQL microsecond, rather than truncating via Date.
  assert.match(lease.at, /^[0-9 .:-]+$/);
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${lease.at}'::timestamp $$`,
  );
  await assert.rejects(
    db.$queryRaw`SELECT tug_presence_require_open(${f.m.id}::uuid,${f.users[0].id}::uuid)`,
    /TUG_PRESENCE_REQUIRED/,
  );
  // A new engine/instance recovers from durable state without the original observer.
  const restarted = new TiraAflojaService(
    db,
    new TiraAflojaRealtimePublisher(),
  );
  await restarted.procesarEstado(f.m.id);
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  assert.equal(
    (await db.tugConnection.findUniqueOrThrow({ where: { id: d.id } })).state,
    'UNKNOWN',
  );
  await resetClock();
});

test('TUG presence: confirmed A abandonment does not require B OPEN; late reconnection cannot reopen', async () => {
  const f = await fixture();
  await clock(at(f, 0));
  const c = await connect(f);
  await clock(at(f, 10));
  await observe(f, c, 'DISCONNECT');
  const p = await db.tugPresence.findUniqueOrThrow({
    where: { matchId_userId: { matchId: f.m.id, userId: f.users[0].id } },
  });
  assert.equal(p.graceUntil.getTime() - p.disconnectedAt.getTime(), 30000);
  await clock(at(f, 39));
  await engine.procesarEstado(f.m.id);
  assert.equal((await row(f)).estado, 'ACTIVA');
  await clock(at(f, 40));
  await engine.procesarEstado(f.m.id);
  const closed = await row(f);
  assert.equal(closed.estado, 'FINALIZADA');
  assert.equal(closed.resultado, 'JUGADOR_B');
  assert.equal(closed.ganadorId, f.users[1].id);
  assert.equal(closed.fechaFinalizacion.getTime(), p.graceUntil.getTime());
  assert.equal(
    await db.tugAbandonment.count({
      where: { matchId: f.m.id, userId: f.users[0].id },
    }),
    1,
  );
  assert.equal(
    await db.tugAbandonment.count({
      where: { matchId: f.m.id, userId: f.users[1].id },
    }),
    0,
  );
  assert.equal((await connect(f)).state, 'TERMINAL_DUE');
  await Promise.all([
    engine.procesarEstado(f.m.id),
    engine.procesarEstado(f.m.id),
  ]);
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    1,
  );
  await resetClock();
});

test('TUG presence: equal grace deadlines cancel and record BOTH individually; non-equal microseconds do not become ties', async () => {
  const f = await fixture();
  await clock(at(f, 0));
  const a = await connect(f),
    b = await connect(f, 1);
  await clock(at(f, 10));
  await observe(f, a, 'DISCONNECT');
  await observe(f, b, 'DISCONNECT');
  await clock(at(f, 40));
  await engine.procesarEstado(f.m.id);
  assert.equal((await row(f)).estado, 'CANCELADA');
  assert.equal((await row(f)).ganadorId, null);
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    2,
  );
  const g = await fixture();
  await clock(at(g, 0));
  const c = await connect(g),
    d = await connect(g, 1);
  await clock(at(g, 10));
  await observe(g, c, 'DISCONNECT');
  await db.$executeRawUnsafe(
    `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${at(g, 10).toISOString()}'::timestamptz AT TIME ZONE 'UTC' + interval '1 microsecond' $$`,
  );
  await observe(g, d, 'DISCONNECT');
  await clock(at(g, 41));
  await engine.procesarEstado(g.m.id);
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: g.m.id } }),
    1,
  );
  assert.equal(
    (await db.tugAbandonment.findFirstOrThrow({ where: { matchId: g.m.id } }))
      .userId,
    g.users[0].id,
  );
  assert.equal((await row(g)).estado, 'FINALIZADA');
  assert.equal((await row(g)).resultado, 'JUGADOR_B');
  assert.equal((await row(g)).ganadorId, g.users[1].id);
  await resetClock();
});

test('TUG presence: normal exhaustion before grace takes priority and authenticating late never reopens terminals', async () => {
  const f = await fixture();
  await clock(new Date(f.m.expiraEn.getTime() - 40000));
  const c = await connect(f);
  await clock(new Date(f.m.expiraEn.getTime() - 30000));
  await observe(f, c, 'DISCONNECT');
  // Exhaustion precedes this late disconnect, so normal closure takes priority.
  await clock(f.m.expiraEn);
  await engine.procesarEstado(f.m.id);
  assert.equal((await row(f)).estado, 'FINALIZADA');
  assert.equal((await row(f)).resultado, 'EMPATE');
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  assert.equal((await connect(f)).state, 'TERMINAL_DUE');
  await resetClock();
});

test('TUG presence: a verified goal before grace closes normally without waiting 30 seconds', async () => {
  const f = await fixture();
  await available(f);
  await connect(f);
  const b = await connect(f, 1);
  await engine.responder(f.users[0].id, f.m.id, answer(f));
  await engine.responder(f.users[1].id, f.m.id, {
    ...answer(f, 1),
    respuestaId: f.qs[0].respuestas.find((r) => !r.esCorrecta).id,
  });
  await observe(f, b, 'DISCONNECT');
  const next = await row(f);
  assert.equal(next.rondaActual, 2);
  assert.equal(next.posicionCuerda, 2);
  await db.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM (${next.rondaIniciaEn}::timestamp-timezone('UTC',clock_timestamp())))))::text`;
  await engine.responder(f.users[0].id, f.m.id, {
    ronda: 2,
    preguntaId: f.qs[1].id,
    respuestaId: f.qs[1].respuestas.find((r) => r.esCorrecta).id,
    idempotencyKey: randomUUID(),
  });
  const grace = await db.tugPresence.findUniqueOrThrow({
    where: { matchId_userId: { matchId: f.m.id, userId: f.users[1].id } },
  });
  assert.ok(next.rondaVenceEn < grace.graceUntil);
  await clock(next.rondaVenceEn);
  await engine.procesarEstado(f.m.id);
  const closed = await row(f);
  assert.equal(closed.estado, 'FINALIZADA');
  assert.equal(closed.ganadorId, f.users[0].id);
  assert.equal(closed.fechaFinalizacion.getTime(), next.rondaVenceEn.getTime());
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  await resetClock();
});

test('TUG presence: global deadline BEFORE and EXACTLY at grace wins without abandonment', async () => {
  for (const offset of [30000, 29000]) {
    const f = await fixture(true, 40000);
    await clock(at(f, 0));
    const c = await connect(f);
    await clock(new Date(f.m.expiraEn.getTime() - offset));
    await observe(f, c, 'DISCONNECT');
    await clock(f.m.expiraEn);
    await engine.procesarEstado(f.m.id);
    const closed = await row(f);
    assert.equal(closed.estado, 'EXPIRADA');
    assert.equal(closed.fechaFinalizacion.getTime(), f.m.expiraEn.getTime());
    assert.equal(
      await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
      0,
    );
    assert.equal((await connect(f)).state, 'TERMINAL_DUE');
    await resetClock();
  }
});

test('TUG presence: rival UNKNOWN retains accepted participation and does not prevent the other confirmed abandonment', async () => {
  const f = await fixture();
  await available(f);
  const a = await connect(f),
    b = await connect(f, 1);
  await engine.responder(f.users[1].id, f.m.id, answer(f, 1));
  await clock(at(f, 5));
  await observe(f, b, 'UNCERTAIN');
  await clock(at(f, 10));
  await observe(f, a, 'DISCONNECT');
  await clock(at(f, 40));
  await engine.procesarEstado(f.m.id);
  const abandoned = await db.tugAbandonment.findMany({
    where: { matchId: f.m.id },
  });
  assert.equal(abandoned.length, 1);
  assert.equal(abandoned[0].userId, f.users[0].id);
  assert.equal(
    (await db.tugConnection.findUniqueOrThrow({ where: { id: b.id } })).state,
    'UNKNOWN',
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({
      where: { partidaId: f.m.id, usuarioId: f.users[1].id },
    }),
    1,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.m.id },
    }),
    0,
  );
  const closed = await row(f);
  assert.equal(closed.estado, 'FINALIZADA');
  assert.equal(closed.resultado, 'JUGADOR_B');
  assert.equal(closed.ganadorId, f.users[1].id);
  // Exact accepted retries survive UNKNOWN and terminal closure, without writing again.
  const accepted = await db.tiraAflojaRespuesta.findFirstOrThrow({
    where: { partidaId: f.m.id, usuarioId: f.users[1].id },
  });
  await engine.responder(f.users[1].id, f.m.id, {
    ...answer(f, 1),
    idempotencyKey: accepted.claveIdempotencia,
  });
  assert.equal(
    await db.tiraAflojaRespuesta.count({
      where: { partidaId: f.m.id, usuarioId: f.users[1].id },
    }),
    1,
  );
  await resetClock();
});

test('TUG presence: first confirmed grace wins with rival OPEN or UNKNOWN and no accepted actions; no XP or duplicate close', async () => {
  for (const rivalState of ['OPEN', 'UNKNOWN']) {
    const f = await fixture();
    await clock(at(f, 0));
    const a = await connect(f),
      b = await connect(f, 1);
    await clock(at(f, 10));
    await observe(f, a, 'DISCONNECT');
    if (rivalState === 'UNKNOWN') await observe(f, b, 'UNCERTAIN');
    await clock(at(f, 40));
    const restarted = new TiraAflojaService(
      db,
      new TiraAflojaRealtimePublisher(),
    );
    await Promise.all([
      engine.procesarEstado(f.m.id),
      restarted.procesarEstado(f.m.id),
    ]);
    const closed = await row(f);
    assert.equal(closed.estado, 'FINALIZADA');
    assert.equal(closed.resultado, 'JUGADOR_B');
    assert.equal(closed.ganadorId, f.users[1].id);
    const token = jwt.sign({ sub: f.users[1].id });
    const publicResult = await request(app.getHttpServer())
      .get(`/tira-afloja/${f.m.id}`)
      .set('Authorization', `Bearer ${token}`);
    assert.equal(publicResult.status, 200);
    assert.equal(publicResult.body.partida.ganadorId, 'B');
    const publicJson = JSON.stringify(publicResult.body);
    for (const privateId of [
      f.users[0].id,
      f.users[1].id,
      a.id,
      b.id,
      a.inst,
      b.inst,
    ])
      assert.ok(!publicJson.includes(privateId));
    assert.ok(
      !/snapshotInicial|TugConnection|disconnectedAt|graceUntil|presenciaVersion/.test(
        publicJson,
      ),
    );
    assert.equal(
      await db.tiraAflojaRespuesta.count({ where: { partidaId: f.m.id } }),
      0,
    );
    assert.equal(
      await db.tugAbandonment.count({
        where: { matchId: f.m.id, userId: f.users[0].id },
      }),
      1,
    );
    assert.equal(
      await db.tugAbandonment.count({
        where: { matchId: f.m.id, userId: f.users[1].id },
      }),
      0,
    );
    assert.equal(
      await db.tiraAflojaEvento.count({
        where: { partidaId: f.m.id, tipo: 'ABANDONO' },
      }),
      1,
    );
    assert.equal(
      await db.eventoXpCompetitivo.count({
        where: { sourceType: 'TUG_MATCH', sourceId: f.m.id },
      }),
      0,
    );
    assert.equal((await connect(f)).state, 'TERMINAL_DUE');
    await restarted.procesarEstado(f.m.id);
    assert.equal((await row(f)).version, closed.version);
    await resetClock();
  }
});

test('TUG presence: either participant may have the first grace, including one-microsecond precedence; later grace does not cancel the winner', async () => {
  for (const first of [0, 1]) {
    for (const difference of [
      "interval '1 second'",
      "interval '1 microsecond'",
    ]) {
      const f = await fixture();
      await clock(at(f, 0));
      const connections = [await connect(f), await connect(f, 1)];
      await clock(at(f, 10));
      await observe(f, connections[first], 'DISCONNECT');
      await db.$executeRawUnsafe(
        `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${at(f, 10).toISOString()}'::timestamptz AT TIME ZONE 'UTC' + ${difference} $$`,
      );
      await observe(f, connections[1 - first], 'DISCONNECT');
      await clock(at(f, 42));
      await engine.procesarEstado(f.m.id);
      const closed = await row(f);
      assert.equal(closed.estado, 'FINALIZADA');
      assert.equal(closed.ganadorId, f.users[1 - first].id);
      assert.equal(closed.resultado, first === 0 ? 'JUGADOR_B' : 'JUGADOR_A');
      const abandoned = await db.tugAbandonment.findMany({
        where: { matchId: f.m.id },
      });
      assert.equal(abandoned.length, 1);
      assert.equal(abandoned[0].userId, f.users[first].id);
      const [precision] =
        await db.$queryRaw`SELECT a."effectiveAt"=p."graceUntil" AND m."fechaFinalizacion"=p."graceUntil" AS valid FROM "TugAbandonment" a JOIN "TugPresence" p ON p."matchId"=a."matchId" AND p."userId"=a."userId" JOIN "PartidaTiraAfloja" m ON m.id=a."matchId" WHERE a."matchId"=${f.m.id}::uuid`;
      assert.equal(precision.valid, true);
      await resetClock();
    }
  }
});

test('TUG presence: EXPLICIT retains its existing rival-presence contract independently of GRACE', async () => {
  for (const rivalState of ['OPEN', 'UNKNOWN']) {
    const f = await fixture();
    await clock(at(f, 0));
    const b = await connect(f, 1);
    if (rivalState === 'UNKNOWN') await observe(f, b, 'UNCERTAIN');
    await engine.abandonar(f.users[0].id, f.m.id);
    const closed = await row(f);
    assert.equal(
      closed.estado,
      rivalState === 'OPEN' ? 'FINALIZADA' : 'CANCELADA',
    );
    assert.equal(
      closed.ganadorId,
      rivalState === 'OPEN' ? f.users[1].id : null,
    );
    const abandoned = await db.tugAbandonment.findMany({
      where: { matchId: f.m.id },
    });
    assert.equal(abandoned.length, 1);
    assert.equal(abandoned[0].userId, f.users[0].id);
    assert.equal(abandoned[0].reason, 'EXPLICIT');
    await resetClock();
  }
});

test('TUG presence: lease is capped by verified token expiry and UNKNOWN of another socket prevents a fabricated grace', async () => {
  const f = await fixture();
  await clock(at(f, 0));
  const c = await connect(f);
  const id = randomUUID();
  await db.$queryRaw`SELECT tug_presence_connect(${f.m.id}::uuid,${f.users[0].id}::uuid,${id}::uuid,${instance}::uuid,NULL::timestamp,${at(f, 5)}::timestamp)`;
  await clock(at(f, 5));
  await db.$queryRaw`SELECT tug_presence_refresh(${f.m.id}::uuid,NULL::timestamp)`;
  assert.equal(
    (await db.tugConnection.findUniqueOrThrow({ where: { id } })).state,
    'UNKNOWN',
  );
  await observe(f, c, 'DISCONNECT');
  assert.equal(
    (
      await db.tugPresence.findUniqueOrThrow({
        where: { matchId_userId: { matchId: f.m.id, userId: f.users[0].id } },
      })
    ).graceUntil,
    null,
  );
  assert.equal(
    await db.tugAbandonment.count({ where: { matchId: f.m.id } }),
    0,
  );
  await resetClock();
});

test('TUG presence: real authenticated sockets persist distinct server connections; HTTP and public views expose no private evidence', async () => {
  const f = await fixture();
  const token = jwt.sign({
    sub: f.users[0].id,
    correo: f.users[0].correo,
    rol: 'ESTUDIANTE',
    nombre: 'A',
  });
  const socket = io(`${await app.getUrl()}/tira-afloja`, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
    reconnection: false,
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error('authenticated socket did not join')),
        5000,
      );
      socket.on('tira:conectado', () => {
        clearTimeout(timer);
        resolve();
      });
      socket.on('connect_error', reject);
    });
    const connections = await db.tugConnection.findMany({
      where: { matchId: f.m.id, userId: f.users[0].id },
    });
    assert.equal(connections.length, 1);
    assert.equal(connections[0].state, 'OPEN');
    assert.equal(connections[0].authUntil, null);
    const [lease] =
      await db.$queryRaw`SELECT "leaseUntil"="lastSeenAt"+interval '45 seconds' AS valid FROM "TugConnection" WHERE id=${connections[0].id}::uuid`;
    assert.equal(lease.valid, true);
    const json = JSON.stringify(await engine.obtener(f.users[0].id, f.m.id));
    assert.ok(
      !/TugConnection|disconnectedAt|snapshotInicial|presenciaVersion|esCorrecta|PRIVATE/.test(
        json,
      ),
    );
    assert.ok(!json.includes(connections[0].id));
  } finally {
    socket.disconnect();
  }
});

test('TUG presence: historical matches keep answers without OPEN; no conversion, private RLS and no competitive XP', async () => {
  const f = await fixture(false);
  await available(f);
  await engine.responder(f.users[0].id, f.m.id, answer(f));
  await assert.rejects(
    db.partidaTiraAfloja.update({
      where: { id: f.m.id },
      data: { presenciaVersion: 1 },
    }),
    /Immutable Tug presence/,
  );
  for (const role of ['anon', 'authenticated'])
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRaw`SELECT * FROM "TugPresence"`;
      }),
      /permission denied/,
    );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceType: 'TUG_MATCH' } }),
    initialLedger,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: { in: ownedMatches } },
    }),
    0,
  );
  for (const id of ownedUsers)
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id } })).xpTotal,
      321,
    );
});
