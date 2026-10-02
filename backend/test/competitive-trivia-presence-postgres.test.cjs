require('ts-node/register/transpile-only');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { ValidationPipe } = require('@nestjs/common');
const {
  TriviaRushController,
} = require('../src/trivia-rush/trivia-rush.controller');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { io } = require('socket.io-client');
const { PrismaService } = require('../src/prisma/prisma.service');
const { TriviaRushService } = require('../src/trivia-rush/trivia-rush.service');
const {
  TriviaPresenceService,
} = require('../src/trivia-rush/trivia-presence.service');
const {
  TriviaPresenceGateway,
} = require('../src/trivia-rush/trivia-presence.gateway');
const {
  TiraAflojaWsAuthService,
} = require('../src/tira-afloja/tira-afloja-ws-auth.service');
let db, game, httpApp, httpJwt, controlledAt;
const apps = [],
  clients = [];
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
  game = new TriviaRushService(db);
  // Only this validated disposable DB gains a transaction-local test clock.
  // Production's private clock has no setting/HTTP override.
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION trivia_presence_now()
    RETURNS timestamp LANGUAGE sql VOLATILE AS $$
    SELECT coalesce(nullif(current_setting('saberplus.presence_test_now',true), '')::timestamp,
      timezone('UTC',clock_timestamp())::timestamp(3)) $$`);
  const timedDb = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (fn, options) =>
          target.$transaction(async (tx) => {
            if (controlledAt)
              await tx.$queryRaw`SELECT set_config('saberplus.presence_test_now',${controlledAt.toISOString()},true)`;
            return fn(tx);
          }, options);
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'disposable-presence-http' })],
    controllers: [TriviaRushController],
    providers: [
      TriviaRushService,
      { provide: PrismaService, useValue: timedDb },
    ],
  }).compile();
  httpApp = module.createNestApplication();
  httpApp.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await httpApp.init();
  apps.push(httpApp);
  httpJwt = module.get(JwtService);
});
after(async () => {
  for (const app of apps) await app.close();
  for (const client of clients) client.disconnect();
  await db?.$disconnect();
});
const row = (id) => db.intentoTriviaRush.findUniqueOrThrow({ where: { id } });
async function fixture(
  mode = 'TRIVIA_RUSH',
  base = new Date('2050-01-01T00:00:00Z'),
) {
  const u = await db.usuario.create({
    data: {
      nombre: 'Presence fixture',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-login',
      correoVerificado: true,
      rol: 'ESTUDIANTE',
      xpTotal: 123,
    },
  });
  const response = await game.crear(u.id, {
    areas: ['CIENCIAS_NATURALES'],
    duracionSegundos: 60,
    ...(mode ? { modalidad: mode } : {}),
  });
  const original = await row(response.intento.id);
  if (!base) return { u, id: original.id, base: original.iniciadoEn };
  await game.abandonar(u.id, original.id);
  const copy = await db.intentoTriviaRush.create({
    data: {
      ...original,
      id: randomUUID(),
      iniciadoEn: base,
      venceEn: new Date(+base + 60000),
      preguntaIniciaEn: base,
      preguntas: {
        create: original.snapshotInicial.questions.map((q) => ({
          preguntaId: q.preguntaId,
          orden: q.orden,
          opcionesOrden: q.opcionesOrden,
        })),
      },
    },
  });
  return { u, id: copy.id, base };
}
const at = (f, s) => new Date(+f.base + s * 1000);
async function connect(f, s, c = randomUUID(), instance = randomUUID()) {
  const result =
    await db.$queryRaw`SELECT trivia_presence_connect(${f.id}::uuid,${f.u.id}::uuid,${c}::uuid,${instance}::uuid,${at(f, s)}::timestamp) AS state`;
  return { c, instance, state: result[0].state };
}
async function observe(f, connection, s, op = 'DISCONNECT') {
  const result =
    await db.$queryRaw`SELECT trivia_presence_observe(${f.id}::uuid,${connection.c}::uuid,${connection.instance}::uuid,${op},${at(f, s)}::timestamp) AS state`;
  return result[0].state;
}
async function resolve(f, s, client = db) {
  const result =
    await client.$queryRaw`SELECT trivia_presence_resolve(${f.id}::uuid,${at(f, s)}::timestamp) AS state`;
  return result[0].state;
}
async function assertNoXp(f) {
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { usuarioId: f.u.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({ where: { usuarioId: f.u.id } }),
    0,
  );
  assert.equal(
    (await db.usuario.findUnique({ where: { id: f.u.id } })).xpTotal,
    123,
  );
}

for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL']) {
  test(`${mode}: observed t10 disconnect abandons at t30; late recovery never moves terminal`, async () => {
    const f = await fixture(mode),
      c = await connect(f, 0);
    await observe(f, c, 10);
    assert.equal(await resolve(f, 29.999), 'ACTIVO');
    assert.equal(await resolve(f, 30), 'ABANDONADO');
    assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 30));
    assert.equal((await connect(f, 30)).state, 'ABANDONADO');
    assert.equal(await resolve(f, 100), 'ABANDONADO');
    await assertNoXp(f);
  });
  test(`${mode}: t50 disconnect, t60 expiry prevails over t70 grace; t65 cannot reopen`, async () => {
    const f = await fixture(mode),
      c = await connect(f, 45);
    await observe(f, c, 50);
    assert.equal(await resolve(f, 59.999), 'ACTIVO');
    assert.equal((await connect(f, 65)).state, 'EXPIRADO');
    assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 60));
    assert.equal(await resolve(f, 70), 'EXPIRADO');
    await assertNoXp(f);
  });
  test(`${mode}: t55 reconnect continues original clock; exact grace/expiry tie expires`, async () => {
    const f = await fixture(mode),
      c = await connect(f, 45);
    await observe(f, c, 50);
    assert.equal((await connect(f, 55)).state, 'ACTIVO');
    assert.equal(+(await row(f.id)).venceEn, +at(f, 60));
    assert.equal(await resolve(f, 60), 'EXPIRADO');
    const tie = await fixture(mode),
      tc = await connect(tie, 35);
    await observe(tie, tc, 40);
    assert.equal(await resolve(tie, 60), 'EXPIRADO');
    assert.equal(+(await row(tie.id)).finalizadoEn, +at(tie, 60));
  });
}
test('multiple instances, duplicate operations and delayed old callbacks cannot invalidate reconnection', async () => {
  const f = await fixture(),
    c1 = await connect(f, 0),
    c2 = await connect(f, 1);
  await connect(f, 2, c1.c, c1.instance);
  assert.equal(
    await db.triviaConnection.count({ where: { attemptId: f.id } }),
    2,
  );
  await observe(f, c1, 5);
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  await observe(f, c2, 10);
  const c3 = await connect(f, 15);
  await observe(f, c2, 16); // Duplicate close of old connection is a no-op.
  await observe(f, c1, 17, 'RENEW');
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  await observe(f, c3, 19);
  assert.equal(await resolve(f, 39), 'ABANDONADO');
});

test('SQL refuses an answer or incompatible terminal at the grace boundary; reconnect exactly at grace is late', async () => {
  const f = await fixture(),
    c = await connect(f, 0);
  await observe(f, c, 10);
  const q = (await row(f.id)).snapshotInicial.questions[0];
  await assert.rejects(
    db.triviaRushRespuesta.create({
      data: {
        intentoId: f.id,
        preguntaId: q.preguntaId,
        respuestaSeleccionadaId: q.pregunta.respuestas.find((o) => o.esCorrecta)
          .id,
        numeroIntento: 1,
        esFinal: true,
        esCorrecta: true,
        puntosOtorgados: 100,
        comboResultante: 1,
        tiempoRespuestaMs: 100,
        claveIdempotencia: randomUUID(),
        respondidaEn: at(f, 30),
      },
    }),
    /terminal deadline|23514/,
  );
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: f.id },
      data: { estado: 'EXPIRADO', finalizadoEn: at(f, 60) },
    }),
    /definitive absence|23514/,
  );
  assert.equal((await connect(f, 30)).state, 'ABANDONADO');
  assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 30));
});
test('lost instance becomes UNKNOWN, not abandonment; authenticated return retires obsolete observer', async () => {
  const f = await fixture(),
    old = await connect(f, 0);
  await resolve(f, 21);
  assert.equal(
    (await db.triviaConnection.findUnique({ where: { id: old.c } })).state,
    'UNKNOWN',
  );
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  const current = await connect(f, 25);
  assert.equal(
    (await db.triviaConnection.findUnique({ where: { id: old.c } })).state,
    'RETIRED',
  );
  assert.equal(await observe(f, old, 26), 'STALE');
  await observe(f, current, 27);
  assert.equal(await resolve(f, 47), 'ABANDONADO');
  const lost = await fixture();
  await connect(lost, 0);
  assert.equal(await resolve(lost, 60), 'EXPIRADO');
});
test('observer process exits without cleanup; another process recovers durable uncertainty without invented abandonment', async () => {
  const f = await fixture('TRIVIA_RUSH', null);
  const connectionId = randomUUID(),
    instanceId = randomUUID();
  const child = `
    const {PrismaClient}=require('@prisma/client');
    const db=new PrismaClient({datasources:{db:{url:process.env.COMPETITIVE_TEST_URL}}});
    (async()=>{
      await db.$queryRawUnsafe('SELECT trivia_presence_connect($1::uuid,$2::uuid,$3::uuid,$4::uuid,NULL::timestamp)',
        process.env.TEST_ATTEMPT,process.env.TEST_USER,process.env.TEST_CONNECTION,process.env.TEST_INSTANCE);
      process.stdout.write('committed');
      process.exit(0); // No lifecycle callback, no disconnect observation.
    })().catch(()=>process.exit(1));`;
  const result = await promisify(execFile)(process.execPath, ['-e', child], {
    cwd: process.cwd(),
    timeout: 15000,
    windowsHide: true,
    env: {
      ...process.env,
      TEST_ATTEMPT: f.id,
      TEST_USER: f.u.id,
      TEST_CONNECTION: connectionId,
      TEST_INSTANCE: instanceId,
    },
  });
  assert.equal(result.stdout, 'committed');
  const persisted = await db.triviaConnection.findUniqueOrThrow({
    where: { id: connectionId },
  });
  assert.equal(persisted.state, 'OPEN');
  await db.$queryRaw`SELECT trivia_presence_resolve(${f.id}::uuid,${persisted.leaseUntil}::timestamp)`;
  assert.equal(
    (
      await db.triviaConnection.findUniqueOrThrow({
        where: { id: connectionId },
      })
    ).state,
    'UNKNOWN',
  );
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  assert.equal((await row(f.id)).estado, 'ACTIVO');
  await assertNoXp(f);
});

test('rollback before terminal, new database client after restart, and concurrent closures preserve one event', async () => {
  const f = await fixture(),
    c = await connect(f, 0);
  await observe(f, c, 10);
  await assert.rejects(
    db.$transaction(async (tx) => {
      await resolve(f, 30, tx);
      throw new Error('injected crash');
    }),
    /injected crash/,
  );
  assert.equal((await row(f.id)).estado, 'ACTIVO');
  const restarted = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  try {
    await Promise.all([
      resolve(f, 75, restarted),
      resolve(f, 75),
      resolve(f, 75),
    ]);
    assert.equal((await row(f.id)).estado, 'ABANDONADO');
    assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 30));
    assert.equal(
      await db.triviaPresenceEvent.count({
        where: { attemptId: f.id, kind: 'ABANDONED' },
      }),
      1,
    );
  } finally {
    await restarted.$disconnect();
  }
  await assertNoXp(f);
});
test('durable worker closes past grace even after normal deadline; HTTP answer cannot win after that grace', async () => {
  const f = await fixture('TRIVIA_RUSH', new Date(Date.now() - 80000));
  const c = await connect(f, 0);
  await observe(f, c, 10);
  const q = (await row(f.id)).snapshotInicial.questions[0];
  const worker1 = new TriviaPresenceService(db),
    worker2 = new TriviaPresenceService(db);
  const results = await Promise.allSettled([
    game.responder(f.u.id, f.id, {
      preguntaId: q.preguntaId,
      respuestaId: q.pregunta.respuestas.find((o) => o.esCorrecta).id,
      idempotencyKey: randomUUID(),
    }),
    worker1.reconcile(),
    worker2.reconcile(),
  ]);
  assert.equal(results[0].status, 'rejected');
  assert.equal((await row(f.id)).estado, 'ABANDONADO');
  assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 30));
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
    0,
  );
  assert.equal(
    await db.triviaPresenceEvent.count({
      where: { attemptId: f.id, kind: 'ABANDONED' },
    }),
    1,
  );
  await worker1.reconcile();
  await worker2.reconcile();
  await assertNoXp(f);
});
test('legacy and historical evidence cannot enroll; public roles cannot access presence or execute functions', async () => {
  const f = await fixture();
  const legacy = await fixture(null, null);
  assert.equal((await row(legacy.id)).presenciaVersion, null);
  await assert.rejects(connect(legacy, 0), /authorized|42501/);
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: f.id },
      data: { presenciaVersion: null },
    }),
    /immutable|23514/,
  );
  const template = await row(f.id);
  const historical = await db.intentoTriviaRush.create({
    data: { ...template, id: randomUUID(), presenciaVersion: null },
  });
  await assert.rejects(
    db.intentoTriviaRush.update({
      where: { id: historical.id },
      data: { presenciaVersion: 1 },
    }),
    /immutable|23514/,
  );
  await assert.rejects(
    connect({ ...f, id: historical.id }, 0),
    /authorized|42501/,
  );
  const c = await connect(f, 0);
  await assert.rejects(
    db.triviaConnection.update({
      where: { id: c.c },
      data: { instanceId: randomUUID() },
    }),
    /immutable|23514/,
  );
  await observe(f, c, 10);
  await assert.rejects(
    db.triviaConnection.update({
      where: { id: c.c },
      data: { state: 'OPEN', closedAt: null },
    }),
    /immutable|23514/,
  );
  await assert.rejects(
    db.triviaPresenceEvent.deleteMany({ where: { attemptId: f.id } }),
    /immutable|23514/,
  );
  for (const role of ['anon', 'authenticated']) {
    for (const table of [
      'TriviaPresence',
      'TriviaConnection',
      'TriviaPresenceEvent',
    ]) {
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}"`);
        }),
        /42501|permission denied/,
      );
    }
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await resolve(f, 0, tx);
      }),
      /42501|permission denied/,
    );
  }
});
async function application() {
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: 'disposable-presence-jwt' })],
    providers: [
      TriviaPresenceGateway,
      TriviaPresenceService,
      TiraAflojaWsAuthService,
      { provide: PrismaService, useValue: db },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  apps.push(app);
  return {
    app,
    jwt: module.get(JwtService),
    presence: module.get(TriviaPresenceService),
  };
}
async function open(a, f, token, expect = 'trivia:presencia') {
  const client = io(`${await a.app.getUrl()}/trivia-presence`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    auth: { attemptId: f.id, token: token ?? a.jwt.sign({ sub: f.u.id }) },
  });
  clients.push(client);
  const message = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Missing ${expect}`)),
      5000,
    );
    client.once(expect, (value) => {
      clearTimeout(timeout);
      resolve(value);
    });
  });
  return { client, message };
}
test('real JWT Socket.IO binds owner across two instances, rejects strangers and exposes no snapshot', async () => {
  const a = await application(),
    b = await application(),
    f = await fixture('GHOST_DUEL', null);
  assert.notEqual(a.presence.instanceId, b.presence.instanceId);
  const one = await open(a, f),
    two = await open(b, f);
  assert.deepEqual(one.message, { estado: 'ACTIVO' });
  assert.deepEqual(two.message, { estado: 'ACTIVO' });
  assert.equal(
    await db.triviaConnection.count({
      where: { attemptId: f.id, state: 'OPEN' },
    }),
    2,
  );
  await open(a, f, 'invalid', 'trivia:error');
  await open(b, f, b.jwt.sign({ sub: randomUUID() }), 'trivia:error');
  const other = await fixture('TRIVIA_RUSH', null);
  await open(a, f, a.jwt.sign({ sub: other.u.id }), 'trivia:error');
  assert.equal(
    await db.triviaConnection.count({ where: { attemptId: f.id } }),
    2,
  );
  // Observe completion of the real gateway/SQL callback, without a timing sleep.
  async function closeObserved(app, client) {
    const original = app.presence.observe.bind(app.presence);
    let done;
    const completed = new Promise((resolve) => {
      done = resolve;
    });
    app.presence.observe = async (...args) => {
      const state = await original(...args);
      if (args[2] === 'DISCONNECT') done();
      return state;
    };
    client.disconnect();
    let timeout;
    try {
      await Promise.race([
        completed,
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error('Missing durable disconnect')),
            5000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      app.presence.observe = original;
    }
  }
  await closeObserved(a, one.client);
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  await closeObserved(b, two.client);
  const disconnected = await db.triviaPresence.findUnique({
    where: { attemptId: f.id },
  });
  assert.equal(+disconnected.graceUntil - +disconnected.disconnectedAt, 20000);
  await open(a, f);
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
  await assertNoXp(f);
  // Graceful process loss is uncertainty, not a fabricated player disconnect.
  await a.app.close();
  apps.splice(apps.indexOf(a.app), 1);
  assert.equal(
    (await db.triviaPresence.findUnique({ where: { attemptId: f.id } }))
      .graceUntil,
    null,
  );
});

async function answerInput(f, key = randomUUID()) {
  const r = await row(f.id);
  const q =
    r.snapshotInicial?.questions[r.indiceActual] ??
    (await db.triviaRushPregunta.findFirstOrThrow({
      where: { intentoId: f.id, orden: r.indiceActual },
      include: { pregunta: { include: { respuestas: true } } },
    }));
  return {
    preguntaId: q.preguntaId,
    respuestaId: q.pregunta.respuestas.find((o) => o.esCorrecta).id,
    idempotencyKey: key,
  };
}
function httpRequest(f, input, suffix = 'respuestas') {
  return request(httpApp.getHttpServer())
    .post(`/trivia-rush/intentos/${f.id}/${suffix}`)
    .set('Authorization', `Bearer ${httpJwt.sign({ sub: f.u.id })}`)
    .send(input);
}
function httpAction(f, input, status = 201, suffix = 'respuestas') {
  return httpRequest(f, input, suffix).expect(status);
}
async function noAction(f) {
  assert.equal(
    await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
    0,
  );
  assert.equal(
    await db.triviaRushPotenciador.count({ where: { intentoId: f.id } }),
    0,
  );
  await assertNoXp(f);
}
for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL']) {
  test(`${mode}: HTTP no presence/t15 disconnect rejects actions, t20 reconnect resumes; matching retries stay read-only`, async () => {
    const f = await fixture(mode),
      input = await answerInput(f);
    controlledAt = at(f, 5);
    assert.equal(
      (await httpAction(f, input, 409)).body.message,
      'TRIVIA_PRESENCE_REQUIRED',
    );
    const c = await connect(f, 0);
    await observe(f, c, 10);
    controlledAt = at(f, 15);
    await httpAction(f, input, 409);
    const grant = await db.concesionRecompensaJuego.create({
      data: {
        usuarioId: f.u.id,
        proveedor: 'fixture',
        referenciaProveedor: randomUUID(),
        expiraEn: at(f, 300),
      },
    });
    const help = {
      preguntaId: input.preguntaId,
      potenciador: 'CINCUENTA_CINCUENTA',
      concesionId: grant.id,
      idempotencyKey: randomUUID(),
    };
    assert.equal(
      (await httpAction(f, help, 409, 'potenciadores')).body.message,
      'TRIVIA_PRESENCE_REQUIRED',
    );
    assert.equal(
      (
        await db.concesionRecompensaJuego.findUniqueOrThrow({
          where: { id: grant.id },
        })
      ).estado,
      'DISPONIBLE',
    );
    await noAction(f);
    const fresh = await connect(f, 20);
    controlledAt = at(f, 21);
    const accepted = (await httpAction(f, input)).body;
    assert.equal(+(await row(f.id)).venceEn, +at(f, 60));
    assert.equal(
      +(
        await db.triviaRushRespuesta.findUniqueOrThrow({
          where: { claveIdempotencia: input.idempotencyKey },
        })
      ).respondidaEn,
      +at(f, 21),
    );
    let acceptedHelp;
    if (mode === 'TRIVIA_RUSH') {
      help.preguntaId = (await row(f.id)).preguntaActualId;
      acceptedHelp = (await httpAction(f, help, 201, 'potenciadores')).body
        .activacion;
    } else await httpAction(f, help, 400, 'potenciadores');
    await observe(f, fresh, 22);
    controlledAt = at(f, 23);
    assert.deepEqual(
      (await httpAction(f, input)).body.evaluacion,
      accepted.evaluacion,
    );
    if (acceptedHelp)
      assert.deepEqual(
        (await httpAction(f, help, 201, 'potenciadores')).body.activacion,
        acceptedHelp,
      );
    await httpAction(f, { ...input, respuestaId: randomUUID() }, 403);
    const other = await fixture(mode);
    await httpAction({ ...f, u: other.u }, input, 403);
    await httpAction(other, input, 403);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
      1,
    );
    assert.equal(
      await db.triviaRushPotenciador.count({ where: { intentoId: f.id } }),
      mode === 'TRIVIA_RUSH' ? 1 : 0,
    );
    controlledAt = at(f, 60);
    await resolve(f, 60);
    const terminal = await row(f.id);
    assert.deepEqual(
      (await httpAction(f, input)).body.evaluacion,
      accepted.evaluacion,
    );
    assert.equal(+(await row(f.id)).finalizadoEn, +terminal.finalizadoEn);
    await assertNoXp(f);
    controlledAt = null;
  });
  test(`${mode}: UNKNOWN or expired OPEN never authorize HTTP or fabricate abandonment; reconnection retires old observer`, async () => {
    for (const expired of [false, true]) {
      const f = await fixture(mode),
        c = await connect(f, 0),
        input = await answerInput(f);
      if (!expired) await observe(f, c, 10, 'UNCERTAIN');
      else
        assert.equal(
          (await db.triviaConnection.findUniqueOrThrow({ where: { id: c.c } }))
            .state,
          'OPEN',
        );
      controlledAt = at(f, expired ? 20 : 15);
      await httpAction(f, input, 409);
      assert.equal((await row(f.id)).estado, 'ACTIVO');
      assert.equal(
        (
          await db.triviaPresence.findUniqueOrThrow({
            where: { attemptId: f.id },
          })
        ).graceUntil,
        null,
      );
      assert.equal(
        (await db.triviaConnection.findUniqueOrThrow({ where: { id: c.c } }))
          .state,
        'UNKNOWN',
      );
      await noAction(f);
      const fresh = await connect(f, 25);
      await observe(f, c, 26, 'RENEW');
      assert.equal(
        (await db.triviaConnection.findUniqueOrThrow({ where: { id: c.c } }))
          .state,
        'RETIRED',
      );
      controlledAt = at(f, 26);
      await httpAction(f, input);
      await observe(f, fresh, 27);
      controlledAt = at(f, 28);
      await httpAction(f, await answerInput(f), 409);
      assert.equal(
        await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
        1,
      );
      await assertNoXp(f);
    }
    controlledAt = null;
  });
  test(`${mode}: two connections allow HTTP after only one disconnect; CLOSED cannot authorize`, async () => {
    const f = await fixture(mode),
      c1 = await connect(f, 0),
      c2 = await connect(f, 1);
    await observe(f, c1, 10);
    controlledAt = at(f, 15);
    await httpAction(f, await answerInput(f));
    await observe(f, c2, 16);
    controlledAt = at(f, 17);
    await httpAction(f, await answerInput(f), 409);
    await observe(f, c1, 17, 'RENEW');
    await httpAction(f, await answerInput(f), 409);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
      1,
    );
    await assertNoXp(f);
    controlledAt = null;
  });
  test(`${mode}: HTTP retry/disconnect/reconnect race serializes without duplicate writes or deadlock`, async () => {
    const f = await fixture(mode),
      c = await connect(f, 0),
      input = await answerInput(f);
    controlledAt = at(f, 15);
    const results = await Promise.allSettled([
      httpRequest(f, input).ok(() => true),
      observe(f, c, 15),
      connect(f, 15),
      httpRequest(f, input).ok(() => true),
    ]);
    assert.equal(results[1].status, 'fulfilled');
    assert.equal(results[2].status, 'fulfilled');
    for (const i of [0, 3]) {
      assert.equal(results[i].status, 'fulfilled');
      const response = results[i].value;
      assert.ok(
        [201, 409].includes(response.status),
        `Unexpected HTTP ${response.status}`,
      );
      if (response.status === 409)
        assert.equal(response.body.message, 'TRIVIA_PRESENCE_REQUIRED');
      else assert.equal(response.body.evaluacion.esCorrecta, true);
    }
    assert.equal((await httpAction(f, input)).body.evaluacion.esCorrecta, true);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: f.id } }),
      1,
    );
    assert.equal((await row(f.id)).estado, 'ACTIVO');
    assert.equal(
      (
        await db.triviaPresence.findUniqueOrThrow({
          where: { attemptId: f.id },
        })
      ).graceUntil,
      null,
    );
    await assertNoXp(f);
    controlledAt = null;
  });
  test(`${mode}: HTTP expiry before/equal grace wins and late reconnection never reopens`, async () => {
    for (const closedAt of [40, 50]) {
      const f = await fixture(mode),
        c = await connect(f, 35),
        input = await answerInput(f);
      await observe(f, c, closedAt);
      controlledAt = at(f, 55);
      await httpAction(f, input, 409);
      controlledAt = at(f, 60);
      await httpAction(f, input, 400);
      assert.equal((await row(f.id)).estado, 'EXPIRADO');
      assert.equal(+(await row(f.id)).finalizadoEn, +at(f, 60));
      assert.equal((await connect(f, 65)).state, 'EXPIRADO');
      await noAction(f);
    }
    controlledAt = null;
  });
}
test('legacy HTTP and historical V1 without enrollment retain actions without presence', async () => {
  const legacy = await fixture(null, null);
  controlledAt = null;
  await httpAction(legacy, await answerInput(legacy));
  assert.equal((await row(legacy.id)).presenciaVersion, null);
  await assertNoXp(legacy);
  const f = await fixture('TRIVIA_RUSH', null),
    original = await row(f.id);
  await game.abandonar(f.u.id, f.id);
  const historical = await db.intentoTriviaRush.create({
    data: {
      ...original,
      id: randomUUID(),
      presenciaVersion: null,
      preguntas: {
        create: original.snapshotInicial.questions.map((q) => ({
          preguntaId: q.preguntaId,
          orden: q.orden,
          opcionesOrden: q.opcionesOrden,
        })),
      },
    },
  });
  controlledAt = at(f, 5);
  await httpAction(
    { ...f, id: historical.id },
    await answerInput({ ...f, id: historical.id }),
  );
  assert.equal(
    await db.triviaConnection.count({ where: { attemptId: historical.id } }),
    0,
  );
  await assertNoXp(f);
  controlledAt = null;
});

test('SQL action guard waits for Usuario before attempt: confirmed disconnect wins without reverse-lock deadlock', async () => {
  const f = await fixture(),
    c = await connect(f, 0),
    input = await answerInput(f);
  let release, ownerReady, pidReady;
  const released = new Promise((r) => (release = r)),
    locked = new Promise((r) => (ownerReady = r)),
    pidKnown = new Promise((r) => (pidReady = r));
  const disconnect = db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${f.u.id}::uuid FOR UPDATE`;
      ownerReady();
      await released;
      await tx.$queryRaw`SELECT trivia_presence_observe(${f.id}::uuid,${c.c}::uuid,${c.instance}::uuid,'DISCONNECT',${at(f, 10)}::timestamp)`;
    },
    { timeout: 10000 },
  );
  await locked;
  const insertion = db.$transaction(
    async (tx) => {
      const [p] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;
      pidReady(p.pid);
      await tx.$queryRaw`SELECT set_config('saberplus.presence_test_now',${at(f, 15).toISOString()},true)`;
      await tx.triviaRushRespuesta.create({
        data: {
          intentoId: f.id,
          preguntaId: input.preguntaId,
          respuestaSeleccionadaId: input.respuestaId,
          numeroIntento: 1,
          esCorrecta: true,
          esFinal: true,
          puntosOtorgados: 100,
          comboResultante: 1,
          tiempoRespuestaMs: 15000,
          claveIdempotencia: input.idempotencyKey,
          respondidaEn: at(f, 15),
        },
      });
    },
    { timeout: 10000 },
  );
  const failed = assert.rejects(insertion, /TRIVIA_PRESENCE_REQUIRED/);
  try {
    const pid = await pidKnown,
      limit = performance.now() + 5000;
    for (;;) {
      const [waiting] =
        await db.$queryRaw`SELECT wait_event_type FROM pg_stat_activity WHERE pid=${pid}`;
      if (waiting?.wait_event_type === 'Lock') break;
      assert.ok(
        performance.now() < limit,
        'SQL insertion never reached the competing lock',
      );
    }
  } finally {
    release();
  }
  await disconnect;
  await failed;
  assert.equal((await row(f.id)).estado, 'ACTIVO');
  assert.equal(
    +(await db.triviaPresence.findUniqueOrThrow({ where: { attemptId: f.id } }))
      .graceUntil,
    +at(f, 30),
  );
  await noAction(f);
});
