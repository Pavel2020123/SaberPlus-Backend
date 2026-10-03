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
  TiraAflojaController,
} = require('../src/tira-afloja/tira-afloja.controller');
const { TiraAflojaGateway } = require('../src/tira-afloja/tira-afloja.gateway');
const { TiraAflojaPresenceService } = require('../src/tira-afloja/tira-afloja-presence.service');
const {
  TiraAflojaWsAuthService,
} = require('../src/tira-afloja/tira-afloja-ws-auth.service');
const {
  TiraAflojaWsExceptionFilter,
} = require('../src/tira-afloja/tira-afloja-ws-exception.filter');
const {
  buildTugSnapshot,
  TUG_QUESTION_INCLUDE,
} = require('../src/tira-afloja/tira-afloja.evidence');
const {
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
const { PrismaService } = require('../src/prisma/prisma.service');
const { Test } = require('@nestjs/testing');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const request = require('supertest');
const { io } = require('socket.io-client');
let db, engine, publisher, sub, competitive, app, jwt;
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
  publisher = new TiraAflojaRealtimePublisher();
  engine = new TiraAflojaService(db, publisher);
  competitive = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
  );
  const tema = await db.tema.create({
    data: {
      nombre: 'Frozen Tug topic',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Frozen Tug sub',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  // Real services, guards, JWT and sockets. Explicit facade excludes background
  // lifecycle hooks; each test controls reconciliation by calling the real engine.
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
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'disposable-tug-evidence-only' })],
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
  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  jwt = module.get(JwtService);
});
after(async () => {
  await app?.close();
  await engine?.onModuleDestroy();
  await db?.$disconnect();
});
async function fixture(start = true) {
  const users = await Promise.all(
    ['A', 'B'].map((lado) =>
      db.usuario.create({
        data: {
          nombre: `Private frozen ${lado}`,
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
          subtemaId: sub.id,
          enunciado: `Original frozen ${i}`,
          explicacion: `Secret explanation ${i}`,
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: [false, true].map((esCorrecta, j) => ({
              id: randomUUID(),
              texto: `Original ${j}`,
              esCorrecta,
              explicacion: `Private option ${j}`,
            })),
          },
        },
        include: { respuestas: true },
      }),
    );
  let match = await db.partidaTiraAfloja.create({
    data: {
      prepararEvidencia: true,
      jugadorAId: users[0].id,
      expiraEn: new Date(Date.now() + 120000),
      preguntas: {
        create: questions.map((q, i) => ({
          orden: i + 1,
          preguntaId: q.id,
          opcionesOrden: q.respuestas.map((r) => r.id).reverse(),
        })),
      },
    },
  });
  await db.partidaTiraAfloja.update({
    where: { id: match.id },
    data: { estado: 'PREPARANDO', jugadorBId: users[1].id },
  });
  if (start) {
    await engine.marcarListo(users[0].id, match.id);
    await engine.marcarListo(users[1].id, match.id);
  }
  match = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: match.id },
  });
  return { users, questions, match };
}
async function available(f) {
  const [clock] =
    await db.$queryRaw`SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS now`;
  // Wait only until the actual, frozen server deadline; no padded sleep/retry.
  const remaining = f.match.rondaIniciaEn.getTime() - clock.now.getTime();
  if (remaining > 0)
    await new Promise((resolve) => setTimeout(resolve, remaining));
}
function answer(f, user = 0, correct = true) {
  return {
    ronda: 1,
    preguntaId: f.questions[0].id,
    respuestaId: f.questions[0].respuestas.find((r) => r.esCorrecta === correct)
      .id,
    idempotencyKey: randomUUID(),
  };
}
function assertPrivate(state, f) {
  const json = JSON.stringify(state);
  assert.ok(
    !/snapshotInicial|participants|esCorrecta|evidenciaVersion|qPartida|Secret explanation|Private option/.test(
      json,
    ),
  );
  f.users.forEach((u) => assert.ok(!json.includes(u.id)));
  assert.equal(state.partida.yo.id, 'A');
  assert.equal(state.partida.rival.id, 'B');
  assert.deepEqual(
    state.partida.pregunta.opciones.map((o) => o.id),
    f.match.snapshotInicial.questions[0].opcionesOrden,
  );
}
test('TUG V1: freezes full original bank and counts no scheduled countdown as R', async () => {
  const f = await fixture();
  const s = f.match.snapshotInicial;
  assert.equal(f.match.evidenciaVersion, 1);
  assert.equal(f.match.qPartida, 4);
  assert.deepEqual(s.participants, { A: f.users[0].id, B: f.users[1].id });
  assert.deepEqual(
    s.questions.map((q) => q.preguntaId),
    f.questions.map((q) => q.id),
  );
  assert.equal(s.questions[0].pregunta.explicacion, 'Secret explanation 0');
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.match.id },
    }),
    0,
  );
  await engine.abandonar(f.users[0].id, f.match.id);
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.match.id },
    }),
    0,
  );
});
test('TUG V1: real new matchmaking prepares evidence without granting XP admission', async () => {
  await fixture(false); // Supplies a valid bank; this fixture has area=null.
  const users = await Promise.all(
    ['A', 'B'].map((lado) =>
      db.usuario.create({
        data: {
          nombre: `Matchmaking ${lado}`,
          correo: `${randomUUID()}@example.invalid`,
          contrasenaHash: 'no-login',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
        },
      }),
    ),
  );
  const searching = await engine.emparejar(users[0].id, 'INGLES');
  const paired = await engine.emparejar(users[1].id, 'INGLES');
  assert.equal(searching.partida.id, paired.partida.id);
  await engine.marcarListo(users[0].id, paired.partida.id);
  await engine.marcarListo(users[1].id, paired.partida.id);
  const stored = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: paired.partida.id },
  });
  assert.equal(stored.prepararEvidencia, true);
  assert.equal(stored.evidenciaVersion, 1);
  assert.ok(stored.qPartida >= 4 && stored.qPartida <= 20);
  assert.equal(stored.qPartida, stored.snapshotInicial.questions.length);
  await assert.rejects(
    competitive.settle({
      sourceType: 'TUG_MATCH',
      sourceId: stored.id,
      participantId: users[0].id,
    }),
    (e) => e.code === 'SOURCE_NOT_INTEGRATED',
  );
  await engine.abandonar(users[0].id, stored.id);
});
test('TUG V1: bank edits cannot change public content, grading or resolved explanation', async () => {
  const f = await fixture();
  const input = answer(f);
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: { enunciado: 'CHANGED', explicacion: 'CHANGED' },
  });
  await db.respuesta.update({
    where: { id: input.respuestaId },
    data: { texto: 'CHANGED', esCorrecta: false },
  });
  assert.equal(
    (await engine.obtener(f.users[0].id, f.match.id)).partida.pregunta
      .enunciado,
    'Original frozen 0',
  );
  await available(f);
  await engine.responder(f.users[0].id, f.match.id, input);
  const stored = await db.tiraAflojaRespuesta.findUniqueOrThrow({
    where: { claveIdempotencia: input.idempotencyKey },
  });
  assert.equal(stored.esCorrecta, true);
  await engine.responder(f.users[1].id, f.match.id, answer(f, 1, false));
  const state = await engine.obtener(f.users[0].id, f.match.id);
  const resolved = state.eventos.find((e) => e.tipo === 'RONDA_RESUELTA');
  assert.equal(resolved.datos.explicacion, 'Secret explanation 0');
  assert.equal(resolved.datos.respuestaCorrectaId, input.respuestaId);
  assert.equal(state.partida.rondaActual, 2);
  assert.deepEqual(
    await db.tiraAflojaRondaPresentada
      .groupBy({
        by: ['usuarioId'],
        where: { partidaId: f.match.id },
        _count: true,
      })
      .then((rs) => rs.map((r) => r._count)),
    [1, 1],
  );
});
test('TUG V1: independent engines, concurrent retries and restart record R once per participant', async () => {
  const f = await fixture();
  await available(f);
  const second = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  await second.procesarPartidasVencidas();
  await Promise.all(
    [engine, second, engine, second].map((e) =>
      e.obtener(f.users[0].id, f.match.id),
    ),
  );
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.match.id },
    }),
    2,
  );
  const input = answer(f);
  await Promise.all(
    [engine, second, engine].map((e) =>
      e.responder(f.users[0].id, f.match.id, input),
    ),
  );
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }),
    1,
  );
  await second.abandonar(f.users[0].id, f.match.id);
  const restarted = new TiraAflojaService(
    db,
    new TiraAflojaRealtimePublisher(),
  );
  assert.equal(
    (await restarted.responder(f.users[0].id, f.match.id, input)).partida
      .estado,
    'FINALIZADA',
  );
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.match.id },
    }),
    2,
  );
  for (const u of f.users)
    await assert.rejects(
      competitive.settle({
        sourceType: 'TUG_MATCH',
        sourceId: f.match.id,
        participantId: u.id,
      }),
      (e) => e.code === 'SOURCE_NOT_INTEGRATED',
    );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.match.id },
    }),
    0,
  );
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.users[0].id } }))
      .xpTotal,
    123,
  );
});
test('TUG V1: SQL rejects snapshot, participant, bank and terminal mutations', async () => {
  const f = await fixture();
  for (const data of [
    { snapshotInicial: {} },
    { qPartida: 5 },
    { jugadorBId: f.users[0].id },
    { expiraEn: new Date(Date.now() + 999999) },
    {
      rondaIniciaEn: new Date(f.match.rondaIniciaEn.getTime() - 1000),
      rondaVenceEn: new Date(f.match.rondaVenceEn.getTime() - 1000),
    },
  ])
    await assert.rejects(
      db.partidaTiraAfloja.update({ where: { id: f.match.id }, data }),
    );
  await assert.rejects(
    db.tiraAflojaPregunta.update({
      where: {
        partidaId_preguntaId: {
          partidaId: f.match.id,
          preguntaId: f.questions[0].id,
        },
      },
      data: { opcionesOrden: [] },
    }),
  );
  await assert.rejects(
    db.partidaTiraAfloja.delete({ where: { id: f.match.id } }),
  );
  await engine.abandonar(f.users[0].id, f.match.id);
  await assert.rejects(
    db.partidaTiraAfloja.update({
      where: { id: f.match.id },
      data: { estado: 'ACTIVA' },
    }),
  );
});
test('TUG V1: SQL validates original content at freezing, not only service construction', async () => {
  const f = await fixture(false);
  const current = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: f.match.id },
  });
  const assigned = await db.tiraAflojaPregunta.findMany({
    where: { partidaId: f.match.id },
    orderBy: { orden: 'asc' },
    include: { pregunta: { include: TUG_QUESTION_INCLUDE } },
  });
  const original = buildTugSnapshot(current, assigned);
  for (const mutate of [
    (s) => {
      delete s.qPartida;
    },
    (s) => {
      s.questions[0].pregunta.enunciado = 'forged';
    },
    (s) => {
      s.questions[0].pregunta.respuestas[0].esCorrecta =
        !s.questions[0].pregunta.respuestas[0].esCorrecta;
    },
    (s) => {
      s.participants.B = randomUUID();
    },
  ]) {
    const s = structuredClone(original);
    mutate(s);
    await assert.rejects(
      db.partidaTiraAfloja.update({
        where: { id: f.match.id },
        data: {
          estado: 'ACTIVA',
          listoA: true,
          listoB: true,
          rondaActual: 1,
          preguntaActualId: f.questions[0].id,
          rondaIniciaEn: new Date(),
          rondaVenceEn: new Date(Date.now() + 10000),
          evidenciaVersion: 1,
          qPartida: 4,
          snapshotInicial: s,
        },
      }),
    );
  }
  assert.equal(
    (
      await db.partidaTiraAfloja.findUniqueOrThrow({
        where: { id: f.match.id },
      })
    ).evidenciaVersion,
    null,
  );
});
test('TUG V1: forged presentations and corrections rejected; evidence append only', async () => {
  const f = await fixture();
  const presentation = {
    partidaId: f.match.id,
    ronda: 1,
    usuarioId: f.users[0].id,
    preguntaId: f.questions[0].id,
    presentadaEn: f.match.rondaIniciaEn,
    venceEn: f.match.rondaVenceEn,
  };
  await assert.rejects(
    db.tiraAflojaRondaPresentada.create({ data: presentation }),
  ); // Before availability.
  await available(f);
  await assert.rejects(
    db.tiraAflojaRondaPresentada.create({
      data: { ...presentation, usuarioId: randomUUID() },
    }),
  );
  await assert.rejects(db.tiraAflojaRondaPresentada.create({ data: presentation })); // A partial transition cannot commit.
  await engine.procesarPartidasVencidas();
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({
      where: { partidaId: f.match.id },
    }),
    2,
  );
  await engine.obtener(f.users[0].id, f.match.id);
  await assert.rejects(
    db.tiraAflojaRondaPresentada.deleteMany({
      where: { partidaId: f.match.id },
    }),
  );
  await assert.rejects(
    db.tiraAflojaRespuesta.create({
      data: {
        partidaId: f.match.id,
        ronda: 1,
        usuarioId: f.users[0].id,
        preguntaId: f.questions[0].id,
        respuestaSeleccionadaId: answer(f).respuestaId,
        esCorrecta: false,
        claveIdempotencia: randomUUID(),
        recibidaEn: new Date(),
      },
    }),
  );
  const input = answer(f);
  await engine.responder(f.users[0].id, f.match.id, input);
  await assert.rejects(
    db.tiraAflojaRespuesta.update({
      where: { claveIdempotencia: input.idempotencyKey },
      data: { esCorrecta: false },
    }),
  );
  await assert.rejects(
    db.tiraAflojaRespuesta.delete({
      where: { claveIdempotencia: input.idempotencyKey },
    }),
  );
});
test('TUG V1: real authenticated HTTP and Socket.IO keep active evidence private', async () => {
  const f = await fixture();
  const token = jwt.sign({ sub: f.users[0].id, rol: 'ESTUDIANTE' });
  const http = await request(app.getHttpServer())
    .get(`/tira-afloja/${f.match.id}`)
    .set('Authorization', `Bearer ${token}`)
    .expect(200);
  assertPrivate(http.body, f);
  await request(app.getHttpServer())
    .get(`/tira-afloja/${f.match.id}`)
    .expect(401);
  await request(app.getHttpServer())
    .get(`/tira-afloja/${f.match.id}`)
    .set(
      'Authorization',
      `Bearer ${jwt.sign({ sub: randomUUID(), rol: 'ESTUDIANTE' })}`,
    )
    .expect(401);
  const socket = io(`${await app.getUrl()}/tira-afloja`, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
    reconnection: false,
    autoConnect: false,
  });
  try {
    const state = new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('No authenticated Tug state')),
        5000,
      );
      socket.once('tira:estado', (s) => {
        clearTimeout(timeout);
        resolve(s);
      });
    });
    socket.connect();
    assertPrivate(await state, f);
  } finally {
    socket.disconnect();
  }
});
test('TUG V1: anon/authenticated cannot read evidence or invoke private recording; legacy cannot be converted', async () => {
  for (const role of ['anon', 'authenticated']) {
    const permissions =
      await db.$queryRaw`SELECT p.proname, has_function_privilege(${role}, p.oid, 'EXECUTE') AS allowed FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname LIKE 'tug_%'`;
    assert.deepEqual(permissions.map((p) => p.proname).sort(), [
      'tug_snapshot_original_valid', 'tug_match_evidence_guard',
      'tug_presented_guard', 'tug_presented_pair_guard',
      'tug_record_presented_round', 'tug_child_evidence_guard',
      'tug_presence_now', 'tug_presence_origin_guard', 'tug_presence_immutable',
      'tug_connection_guard', 'tug_presence_lock', 'tug_presence_refresh',
      'tug_presence_connect', 'tug_presence_observe',
      'tug_presence_require_open', 'tug_presence_answer_guard',
      'tug_certify_presented_round', 'tug_presented_origin_guard',
      'tug_visibility_guard', 'tug_visibility_origin_guard',
    ].sort());
    assert.ok(permissions.every((p) => p.allowed === false));
  }
  for (const role of ['anon', 'authenticated'])
    for (const sql of [
      'SELECT * FROM "PartidaTiraAfloja"',
      'SELECT * FROM "TiraAflojaRondaPresentada"',
      'SELECT * FROM "TugRoundVisibility"',
      `SELECT tug_record_presented_round('${randomUUID()}'::uuid)`,
      `SELECT tug_certify_presented_round('${randomUUID()}'::uuid,1)`,
    ])
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(sql);
        }),
      );
  const f = await fixture(false);
  const legacy = await db.partidaTiraAfloja.create({
    data: { jugadorAId: f.users[0].id, expiraEn: new Date(Date.now() + 60000) },
  });
  await assert.rejects(
    db.partidaTiraAfloja.update({
      where: { id: legacy.id },
      data: { prepararEvidencia: true },
    }),
  );
});
test('TUG legacy: joining and starting a historical bank does not apply V1 preparation rules', async () => {
  const f = await fixture(false);
  await db.respuesta.update({
    where: { id: f.questions[0].respuestas.find((r) => !r.esCorrecta).id },
    data: { esCorrecta: true },
  });
  const old = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: f.users[0].id,
      area: 'INGLES',
      expiraEn: new Date(Date.now() + 60000),
      preguntas: {
        create: f.questions.map((q, i) => ({
          orden: i + 1,
          preguntaId: q.id,
          opcionesOrden: q.respuestas.map((r) => r.id),
        })),
      },
    },
  });
  const entrant = await db.usuario.create({
    data: {
      nombre: 'Legacy entrant',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-login',
      rol: 'ESTUDIANTE',
      correoVerificado: true,
    },
  });
  assert.equal(
    (await engine.emparejar(entrant.id, 'INGLES')).partida.id,
    old.id,
  );
  await engine.marcarListo(f.users[0].id, old.id);
  await engine.marcarListo(entrant.id, old.id);
  const stored = await db.partidaTiraAfloja.findUniqueOrThrow({
    where: { id: old.id },
  });
  assert.equal(stored.estado, 'ACTIVA');
  assert.equal(stored.prepararEvidencia, false);
  assert.equal(stored.evidenciaVersion, null);
  assert.equal(stored.snapshotInicial, null);
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({ where: { partidaId: old.id } }),
    0,
  );
  await engine.abandonar(entrant.id, old.id);
});

test('TUG V1: timely enablement is atomic, server dated and requires eligible participants', async () => {
  const f = await fixture();
  await available(f);
  await Promise.all([engine.procesarEstado(f.match.id), engine.procesarEstado(f.match.id)]);
  const rows = await db.tiraAflojaRondaPresentada.findMany({ where: { partidaId: f.match.id }, orderBy: [{ ronda: 'asc' }, { usuarioId: 'asc' }] });
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.programadaEn.getTime(), f.match.rondaIniciaEn.getTime());
    assert.ok(r.presentadaEn >= r.programadaEn);
    assert.ok(r.presentadaEn < r.venceEn);
    assert.ok(r.registradaEn >= r.presentadaEn);
  }
  await engine.abandonar(f.users[0].id, f.match.id);
  await db.$queryRaw`SELECT tug_record_presented_round(${f.match.id}::uuid)::text`;
  assert.deepEqual(await db.tiraAflojaRondaPresentada.findMany({ where: { partidaId: f.match.id }, orderBy: [{ ronda: 'asc' }, { usuarioId: 'asc' }] }), rows);
  const ineligible = await fixture();
  await available(ineligible);
  await db.usuario.update({ where: { id: ineligible.users[1].id }, data: { rol: 'PROFESOR' } });
  await assert.rejects(engine.procesarEstado(ineligible.match.id));
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: ineligible.match.id } }), 0);
  await engine.abandonar(ineligible.users[0].id, ineligible.match.id);
});

test('TUG V1: delayed worker cannot reconstruct expired enablement; upper boundary rejects inserts', async () => {
  const f = await fixture();
  // Wait with PostgreSQL to the frozen boundary, without a padded delay.
  await db.$queryRaw`SELECT pg_sleep(greatest(0, extract(epoch FROM (${f.match.rondaVenceEn}::timestamp - (clock_timestamp() AT TIME ZONE 'UTC')))))::text`;
  await db.$queryRaw`SELECT tug_record_presented_round(${f.match.id}::uuid)::text`;
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } }), 0);
  await assert.rejects(db.tiraAflojaRondaPresentada.create({ data: {
    partidaId: f.match.id, ronda: 1, usuarioId: f.users[0].id,
    preguntaId: f.questions[0].id, presentadaEn: f.match.rondaIniciaEn, venceEn: f.match.rondaVenceEn,
  } }));
  await engine.procesarPartidasVencidas();
  const restarted = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  await restarted.procesarEstado(f.match.id);
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id, ronda: 1 } }), 0);
  await engine.abandonar(f.users[0].id, f.match.id);
  await restarted.procesarEstado(f.match.id);
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } }), 0);
});

test('TUG V1: native PostgreSQL COMMIT after deadline rejects and rolls back both invisible presentations', async () => {
  const f = await fixture();
  await available(f);
  const { promisify } = require('node:util');
  const { execFile } = require('node:child_process');
  const execute = promisify(execFile);
  const marker = JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8'));
  const name = 'saberplus-competitive-test-' + marker.nonce;
  const inspection = await execute('docker', ['inspect', '--format', '{{json .Config.Labels}}', name]);
  assert.equal(JSON.parse(inspection.stdout)['saberplus-competitive-disposable-v1'], marker.nonce);
  const sql = `BEGIN;
    SELECT tug_record_presented_round('${f.match.id}'::uuid);
    SELECT 'inside:' || count(*) FROM "TiraAflojaRondaPresentada" WHERE "partidaId"='${f.match.id}'::uuid;
    SELECT pg_sleep(greatest(0, extract(epoch FROM (('${f.match.rondaVenceEn.toISOString()}'::timestamptz AT TIME ZONE 'UTC') - (clock_timestamp() AT TIME ZONE 'UTC')))));
    COMMIT;`;
  const pending = execute('docker', ['exec', name, 'psql', '-X', '-U', new URL(marker.url).username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atc', sql], { windowsHide: true });
  let output = '';
  let observed;
  const staged = new Promise((resolve) => { observed = resolve; });
  pending.child.stdout.on('data', (chunk) => { output += chunk; if (output.includes('inside:2')) observed(); });
  const completed = pending.then(() => ({ accepted: true }), (error) => ({ accepted: false, error }));
  const first = await Promise.race([staged.then(() => 'staged'), completed.then(() => 'finished')]);
  assert.equal(first, 'staged', 'Both inserts must precede the controlled wait');
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } }), 0);
  const result = await completed;
  assert.equal(result.accepted, false, 'Native COMMIT must surface the deferred constraint error');
  assert.match(result.error.stderr, /Tug enablement commit exceeds its deadline/);
  assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } }), 0);
});

test('TUG V1: responder rechecks PostgreSQL deadline after an idempotency lock wait without losing confirmed R', async () => {
  const f = await fixture();
  await available(f);
  await engine.procesarEstado(f.match.id);
  const previous = await db.tiraAflojaRondaPresentada.findMany({ where: { partidaId: f.match.id }, orderBy: [{ ronda: 'asc' }, { usuarioId: 'asc' }] });
  assert.equal(previous.length, 2);
  // Exercise a real lock wait in the final second, without extending the round.
  await db.$queryRaw`SELECT pg_sleep(greatest(0, extract(epoch FROM (${f.match.rondaVenceEn}::timestamp - interval '1 second' - (clock_timestamp() AT TIME ZONE 'UTC')))))::text`;
  const input = answer(f);
  const second = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  const original = second.bloquear.bind(second);
  let entered;
  const reachedLock = new Promise((resolve) => { entered = resolve; });
  second.bloquear = async (tx, key) => {
    if (key === `respuesta:${input.idempotencyKey}`) entered();
    return original(tx, key);
  };
  let response;
  await db.$transaction(async (tx) => {
    const key = `respuesta:${input.idempotencyKey}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))::text`;
    response = second.responder(f.users[0].id, f.match.id, input).then(
      () => ({ accepted: true }), (error) => ({ accepted: false, error }),
    );
    await reachedLock; // The real responder completed preflight and reached the held key.
    await tx.$queryRaw`SELECT pg_sleep(greatest(0, extract(epoch FROM (${f.match.rondaVenceEn}::timestamp - (clock_timestamp() AT TIME ZONE 'UTC')))))::text`;
  }, { timeout: 20000 });
  const outcome = await response;
  assert.equal(outcome.accepted, false);
  assert.equal(outcome.error.getStatus(), 400);
  assert.match(outcome.error.message, /agoto el tiempo/);
  assert.equal(await db.tiraAflojaRespuesta.count({ where: { partidaId: f.match.id } }), 0);
  await second.procesarEstado(f.match.id);
  assert.deepEqual(await db.tiraAflojaRondaPresentada.findMany({ where: { partidaId: f.match.id, ronda: 1 }, orderBy: [{ ronda: 'asc' }, { usuarioId: 'asc' }] }), previous);
  await engine.abandonar(f.users[0].id, f.match.id);
});


test('TUG V1: service detects Prisma silent deferred-COMMIT rollback instead of reporting enablement', async () => {
  const f = await fixture();
  await available(f);
  const client = new PrismaClient({ datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } } });
  const original = client.$transaction.bind(client);
  let staged = 0;
  let visible = 0;
  client.$transaction = async (operation) => original(async (tx) => {
    const result = await operation(tx); // Real process-state transition inserts the pair.
    staged = await tx.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } });
    visible = await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } });
    await tx.$queryRaw`SELECT pg_sleep(greatest(0, extract(epoch FROM (${f.match.rondaVenceEn}::timestamp - (clock_timestamp() AT TIME ZONE 'UTC')))))::text`;
    return result;
  }, { timeout: 20000 });
  try {
    const second = new TiraAflojaService(client, new TiraAflojaRealtimePublisher());
    await assert.rejects(second.procesarEstado(f.match.id), /habilitacion no pudo confirmarse/);
    assert.equal(staged, 2);
    assert.equal(visible, 0);
    assert.equal(await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.match.id } }), 0);
  } finally {
    await client.$disconnect();
  }
});
