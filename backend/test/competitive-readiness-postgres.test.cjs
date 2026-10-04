require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { PrismaService } = require('../src/prisma/prisma.service');
const { HealthController } = require('../src/health/health.controller');
const {
  inspectCompetitiveReadiness,
} = require('../src/health/competitive.readiness');
const { SummitService } = require('../src/summit/summit.service');
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
let db, first, second;
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
  const url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '1');
  first = new PrismaClient({ datasources: { db: { url: url.href } } });
  second = new PrismaClient({ datasources: { db: { url: url.href } } });
});
after(async () => {
  await Promise.all([
    db?.$disconnect(),
    first?.$disconnect(),
    second?.$disconnect(),
  ]);
});
async function http(database, fn) {
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: PrismaService, useValue: database }],
  }).compile();
  const app = module.createNestApplication();
  await app.init();
  try {
    return await fn(request(app.getHttpServer()));
  } finally {
    await app.close();
  }
}
const unavailable = {
  status: 'ERROR',
  service: 'saberplus-api',
  database: 'DOWN',
};
async function rollbackProbe(sql) {
  const sentinel = new Error('owned readiness metadata rollback');
  await assert.rejects(
    db.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(sql);
        await assert.rejects(
          inspectCompetitiveReadiness(tx),
          /COMPETITIVE_READINESS_UNAVAILABLE/,
        );
        throw sentinel;
      },
      { timeout: 10000 },
    ),
    (e) => e === sentinel,
  );
  await http(db, async (api) =>
    assert.equal((await api.get('/health/ready')).status, 200),
  );
}
test('readiness HTTP: compatible database with admission OFF, read-only responses and independent liveness', async () => {
  const before = await db.eventoXpCompetitivo.count();
  await http(db, async (api) => {
    assert.deepEqual((await api.get('/health/live')).body, {
      status: 'OK',
      service: 'saberplus-api',
    });
    const r = await api.get('/health/ready');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, {
      status: 'OK',
      service: 'saberplus-api',
      database: 'UP',
    });
  });
  assert.equal(await db.eventoXpCompetitivo.count(), before);
});
for (const [name, sql] of [
  [
    'missing ledger',
    'ALTER TABLE "EventoXpCompetitivo" RENAME TO "OwnedMissingLedger"',
  ],
  [
    'missing required column',
    'ALTER TABLE "PartidaTiraAfloja" RENAME COLUMN "activaEn" TO "ownedHiddenActive"',
  ],
  [
    'native UUID replaced by text',
    'ALTER TABLE "EventoXpCompetitivo" ALTER COLUMN "actorId" TYPE text USING "actorId"::text',
  ],
  [
    'required enum label missing',
    `ALTER TYPE "FuenteXpCompetitivo" RENAME VALUE 'TUG_MATCH' TO 'OWNED_TUG_REMOVED'`,
  ],
  [
    'loss of terminal microseconds',
    'ALTER TABLE "EventoXpCompetitivo" ALTER COLUMN "fechaEfectiva" TYPE timestamptz(3)',
  ],
  [
    'missing critical migration',
    `DELETE FROM _prisma_migrations WHERE migration_name='20261005120000_tug_pair_settlement'`,
  ],
  [
    'failed unrolled migration',
    `INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at) VALUES ('${randomUUID()}','owned','owned_failed',clock_timestamp())`,
  ],
  [
    'disabled settlement guard',
    'ALTER TABLE "TugCompetitiveSettlement" DISABLE TRIGGER tug_settlement_guard',
  ],
])
  test('readiness: ' + name + ' rejected and metadata restored', async () =>
    rollbackProbe(sql),
  );

test('readiness HTTP: missing schema is not falsely healthy, errors private, recovery after restoration', async () => {
  await db.$executeRawUnsafe(
    'ALTER TABLE "EventoXpCompetitivo" RENAME TO "OwnedHttpMissingLedger"',
  );
  try {
    await http(db, async (api) => {
      const r = await api.get('/health/ready');
      assert.equal(r.status, 503);
      assert.deepEqual(r.body, unavailable);
      assert.equal((await api.get('/health/live')).status, 200);
    });
  } finally {
    await db.$executeRawUnsafe(
      'ALTER TABLE "OwnedHttpMissingLedger" RENAME TO "EventoXpCompetitivo"',
    );
  }
  await http(db, async (api) =>
    assert.equal((await api.get('/health/ready')).status, 200),
  );
});

test('readiness HTTP: SQL lock timeout bounded, liveness unaffected and connection recovered', async () => {
  let signal, release;
  const acquired = new Promise((resolve) => (signal = resolve)),
    gate = new Promise((resolve) => (release = resolve));
  const holding = first.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        'LOCK TABLE _prisma_migrations IN ACCESS EXCLUSIVE MODE',
      );
      signal();
      await gate;
    },
    { timeout: 10000 },
  );
  const start = performance.now();
  try {
    await Promise.race([acquired, holding]);
    await http(second, async (api) => {
      assert.equal((await api.get('/health/ready')).status, 503);
      assert.equal((await api.get('/health/live')).status, 200);
    });
  } finally {
    release();
    await holding;
  }
  const elapsed = performance.now() - start;
  assert.ok(
    elapsed < 7000,
    'bounded statement/transaction timeout, not an unlimited blocked probe',
  );
  await http(second, async (api) =>
    assert.equal((await api.get('/health/ready')).status, 200),
  );
  console.log(
    JSON.stringify({
      probe: 'readiness-lock-timeout',
      elapsedMs: Math.round(elapsed),
      recovered: true,
    }),
  );
});

test('capacity: an over-deadline interactive transaction fails and returns its connection', async () => {
  const started = performance.now();
  await assert.rejects(
    first.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_sleep(0.15)::text AS controlled_work`;
        await tx.$queryRaw`SELECT 1`;
      },
      { timeout: 50 },
    ),
    (e) => e.code === 'P2028',
  );
  assert.equal((await first.$queryRaw`SELECT 1::int AS n`)[0].n, 1);
  console.log(
    JSON.stringify({
      probe: 'interactive-transaction-timeout',
      code: 'P2028',
      elapsedMs: Math.round(performance.now() - started),
      recovered: true,
    }),
  );
});

test('capacity: two real recovery workers, pool exhaustion, graceful drain and restart never duplicate XP', async () => {
  const previous = process.env.COMPETITIVE_SOLO_ENABLED;
  process.env.COMPETITIVE_SOLO_ENABLED = 'true';
  let one, two, release, holding, running, stopping;
  try {
    const topic = await db.tema.create({
      data: {
        nombre: 'Owned capacity',
        area: 'MATEMATICAS',
        estadoContenido: 'PUBLICADO',
      },
    });
    const sub = await db.subtema.create({
      data: {
        nombre: 'Owned capacity',
        temaId: topic.id,
        estadoContenido: 'PUBLICADO',
      },
    });
    for (let i = 0; i < 12; i++) {
      const id = randomUUID();
      await db.pregunta.create({
        data: {
          id,
          subtemaId: sub.id,
          enunciado: 'Owned ' + i,
          dificultad: 'BASICO',
          estadoContenido: 'PUBLICADO',
          respuestas: {
            create: [
              { id: id + '-yes', texto: 'Yes', esCorrecta: true },
              { id: id + '-no', texto: 'No', esCorrecta: false },
            ],
          },
        },
      });
    }
    const user = await db.usuario.create({
      data: {
        nombre: 'Owned capacity',
        correo: randomUUID() + '@example.invalid',
        contrasenaHash: 'none',
        rol: 'ESTUDIANTE',
        correoVerificado: true,
        xpTotal: 91,
      },
    });
    const sports = new SummitService(db);
    let state = await sports.start(user.id, {
      area: 'MATEMATICAS',
      dificultad: 'BASICO',
      subtemaId: sub.id,
      competitive: true,
    });
    for (let i = 0; i < 5; i++)
      state = await sports.answer(user.id, state.id, {
        preguntaId: state.pregunta.id,
        respuestaId: state.pregunta.id + '-yes',
        idempotencyKey: randomUUID(),
      });
    process.env.COMPETITIVE_SOLO_ENABLED = 'false';
    one = new CompetitiveReconciler(
      first,
      new CompetitiveService(
        first,
        new CompetitiveVerifierRegistry(createSoloVerifiers()),
      ),
    );
    two = new CompetitiveReconciler(
      second,
      new CompetitiveService(
        second,
        new CompetitiveVerifierRegistry(createSoloVerifiers()),
      ),
    );
    let signal;
    const acquired = new Promise((resolve) => (signal = resolve)),
      gate = new Promise((resolve) => (release = resolve));
    holding = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${user.id}::uuid FOR UPDATE`;
        signal();
        await gate;
      },
      { timeout: 15000 },
    );
    await acquired;
    running = Promise.all([one.reconcile(), two.reconcile()]);
    const started = performance.now();
    let waiting;
    for (let i = 0; i < 100; i++) {
      [waiting] =
        await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%'`;
      if (waiting.n === 2) break;
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(
      waiting.n,
      2,
      'both real workers must reach the same locked source',
    );
    await http(first, async (api) =>
      assert.equal((await api.get('/health/ready')).status, 503),
    );
    await assert.rejects(second.$queryRaw`SELECT 1`, (e) => e.code === 'P2024');
    let drained = false;
    stopping = Promise.all([one.onModuleDestroy(), two.onModuleDestroy()]).then(
      () => {
        drained = true;
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false, 'shutdown waits for in-flight settlement');
    const [connections] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'`;
    assert.ok(
      connections.n <= 4,
      'owned two worker pools plus owner pool budget',
    );
    release();
    await holding;
    holding = undefined;
    await running;
    await stopping;
    const events = await db.eventoXpCompetitivo.findMany({
      where: { sourceId: state.id },
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].deltaAplicado, 100);
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: user.id } })).xpTotal,
      91,
    );
    const restarted = new CompetitiveReconciler(
      second,
      new CompetitiveService(
        second,
        new CompetitiveVerifierRegistry(createSoloVerifiers()),
      ),
    );
    try {
      await restarted.reconcile();
    } finally {
      await restarted.onModuleDestroy();
    }
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: state.id } }),
      1,
    );
    await http(first, async (api) =>
      assert.equal((await api.get('/health/ready')).status, 200),
    );
    const pids = [];
    for (const client of [first, second])
      pids.push(
        (await client.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid,
      );
    await Promise.all([first.$disconnect(), second.$disconnect()]);
    const [left] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=ANY(${pids}::int[])`;
    assert.equal(left.n, 0);
    console.log(
      JSON.stringify({
        probe: 'capacity-drain',
        sportsAnswers: 5,
        recoveryInstances: 2,
        connectionsObserved: connections.n,
        poolTimeouts: 2,
        ledgerEvents: 1,
        recoveredMs: Math.round(performance.now() - started),
        openWorkerBackendsAfterClose: left.n,
      }),
    );
  } finally {
    release?.();
    if (holding) await holding;
    if (running) await running;
    if (stopping) await stopping;
    await one?.onModuleDestroy();
    await two?.onModuleDestroy();
    if (previous === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
    else process.env.COMPETITIVE_SOLO_ENABLED = previous;
  }
});
