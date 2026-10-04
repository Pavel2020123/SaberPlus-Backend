require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { fork } = require('node:child_process');
const { join } = require('node:path');
const net = require('node:net');
const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const { PrismaService } = require('../src/prisma/prisma.service');
const { SummitService } = require('../src/summit/summit.service');
const {
  TiraAflojaVisibilityWitness,
} = require('../src/tira-afloja/tira-afloja-visibility.witness');
const { HealthController } = require('../src/health/health.controller');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
let db, sub;
const children = new Set(),
  previousFlag = process.env.COMPETITIVE_SOLO_ENABLED;
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit', '1');
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const topic = await db.tema.create({
    data: {
      nombre: 'Owned resilience',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Owned resilience',
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
});
after(async () => {
  for (const child of children) await terminate(child);
  await db?.$disconnect();
  if (previousFlag === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
  else process.env.COMPETITIVE_SOLO_ENABLED = previousFlag;
});
async function fixture() {
  process.env.COMPETITIVE_SOLO_ENABLED = 'true';
  try {
    const u = await db.usuario.create({
      data: {
        nombre: 'Owned interruption',
        correo: randomUUID() + '@example.invalid',
        contrasenaHash: 'none',
        rol: 'ESTUDIANTE',
        correoVerificado: true,
        xpTotal: 101,
      },
    });
    const sports = new SummitService(db);
    let state = await sports.start(u.id, {
      area: 'MATEMATICAS',
      dificultad: 'BASICO',
      subtemaId: sub.id,
      competitive: true,
    });
    for (let i = 0; i < 5; i++)
      state = await sports.answer(u.id, state.id, {
        preguntaId: state.pregunta.id,
        respuestaId: state.pregunta.id + '-yes',
        idempotencyKey: randomUUID(),
      });
    return { sourceId: state.id, userId: u.id };
  } finally {
    process.env.COMPETITIVE_SOLO_ENABLED = 'false';
  }
}
function spawn(mode, f) {
  const child = fork(
    join(__dirname, 'helpers', 'competitive-owned-worker.cjs'),
    [mode, f.sourceId, f.userId],
    {
      cwd: join(__dirname, '..'),
      env: { ...process.env, COMPETITIVE_SOLO_ENABLED: 'false' },
      silent: true,
      windowsHide: true,
    },
  );
  children.add(child);
  child.messages = [];
  child.on('message', (m) => child.messages.push(m));
  // Record no stdout/stderr bodies: no accidental connection details.
  child.stdout.resume();
  child.stderr.resume();
  child.done = new Promise((resolve) =>
    child.once('exit', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    }),
  );
  return child;
}
async function stage(child, name) {
  let timer;
  try {
    return await Promise.race([
      new Promise((resolve, reject) => {
        const find = () => {
          const failure = child.messages.find((m) => m.stage === 'ERROR');
          if (failure) reject(new Error(failure.code));
          const found = child.messages.find((m) => m.stage === name);
          if (found) {
            child.off('message', find);
            resolve(found);
          }
        };
        child.on('message', find);
        find();
      }),
      child.done.then((result) => {
        throw new Error(
          'Owned child exited before ' + name + ': ' + JSON.stringify(result),
        );
      }),
      new Promise(
        (_, reject) =>
          (timer = setTimeout(
            () => reject(new Error('Owned stage timeout: ' + name)),
            15000,
          )),
      ),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function terminate(child) {
  if (child.exitCode === null && child.signalCode === null)
    child.kill('SIGKILL');
  return await child.done;
}
async function noBackend(pid) {
  const deadline = performance.now() + 3000;
  while (performance.now() < deadline) {
    const [r] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=${pid}::int`;
    if (r.n === 0) return;
    const remaining = deadline - performance.now();
    if (remaining > 0)
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(25, remaining)),
      );
  }
  assert.fail('Owned backend did not disappear');
}
async function paid(f) {
  const events = await db.eventoXpCompetitivo.findMany({
    where: { sourceId: f.sourceId },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0].deltaAplicado, 100);
  const balance = await db.balanceCompetitivo.findFirstOrThrow({
    where: { usuarioId: f.userId, gameId: 'SUMMIT' },
  });
  assert.equal(balance.xp, 100);
  assert.equal(balance.version, 1);
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.userId } })).xpTotal,
    101,
  );
  assert.ok(
    (await db.intentoCima.findUniqueOrThrow({ where: { id: f.sourceId } }))
      .competitiveSettledAt,
  );
}
async function recover(f) {
  const child = spawn('recover', f);
  try {
    const p = await stage(child, 'READY');
    await stage(child, 'CLOSED');
    assert.equal((await child.done).code, 0);
    await noBackend(p.backendPid);
    await paid(f);
  } finally {
    await terminate(child);
  }
}
function interruption(point, child, p, result) {
  console.log(
    JSON.stringify({
      probe: 'owned-process-interruption',
      point,
      processPid: child.pid,
      backendPid: p.backendPid,
      requestedSignal: 'SIGKILL',
      semantics:
        process.platform === 'win32'
          ? 'Windows TerminateProcess, not POSIX SIGKILL'
          : 'POSIX SIGKILL',
      exit: result,
    }),
  );
}

test('process: abrupt termination before COMMIT rolls back ledger and balance, then real worker recovers', async () => {
  const f = await fixture(),
    child = spawn('before', f);
  try {
    const p = await stage(child, 'BEFORE_COMMIT');
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
      0,
    );
    const result = await terminate(child);
    await noBackend(p.backendPid);
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
      0,
    );
    assert.equal(
      await db.balanceCompetitivo.count({ where: { usuarioId: f.userId } }),
      0,
    );
    interruption('before COMMIT', child, p, result);
    await recover(f);
  } finally {
    await terminate(child);
  }
});
test('process: committed payment without worker acknowledgement remains PENDING and restart never duplicates it', async () => {
  const f = await fixture(),
    child = spawn('after', f);
  try {
    const p = await stage(child, 'COMMITTED_UNACKNOWLEDGED');
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
      1,
    );
    assert.equal(
      (await db.intentoCima.findUniqueOrThrow({ where: { id: f.sourceId } }))
        .competitiveSettledAt,
      null,
    );
    const result = await terminate(child);
    await noBackend(p.backendPid);
    interruption('after COMMIT before ack', child, p, result);
    await recover(f);
    await recover(f);
  } finally {
    await terminate(child);
  }
});
test('process: kill during confirmed lock contention releases backend, and two independent recovery processes pay once', async () => {
  const f = await fixture();
  let release, holding, child;
  const acquired = new Promise((resolve) => {
    const url = new URL(process.env.COMPETITIVE_TEST_URL);
    url.searchParams.set('connection_limit', '1');
    const locker = new PrismaClient({ datasources: { db: { url: url.href } } });
    const gate = new Promise((r) => (release = r));
    holding = locker
      .$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${f.userId}::uuid FOR UPDATE`;
          resolve();
          await gate;
        },
        { timeout: 15000 },
      )
      .finally(() => locker.$disconnect());
  });
  try {
    await acquired;
    child = spawn('blocked', f);
    const p = await stage(child, 'READY');
    let locked = false;
    for (let i = 0; i < 100; i++) {
      const [r] =
        await db.$queryRaw`SELECT wait_event_type='Lock' AS locked FROM pg_stat_activity WHERE pid=${p.backendPid}::int`;
      if (r?.locked) {
        locked = true;
        break;
      }
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(locked, true);
    const result = await terminate(child);
    // PostgreSQL can retain a disconnected backend while its statement waits
    // on the still-owned blocker. End that blocker, then require full cleanup.
    const [retained] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=${p.backendPid}::int AND wait_event_type='Lock'`;
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
      0,
    );
    release();
    await holding;
    holding = undefined;
    await noBackend(p.backendPid);
    const [locks] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_locks WHERE pid=${p.backendPid}::int`;
    assert.equal(locks.n, 0);
    interruption('confirmed SQL lock wait', child, p, result);
    console.log(
      JSON.stringify({
        probe: 'owned-blocker-release',
        backendRetainedWhileBlocked: retained.n,
        locksAfterRelease: locks.n,
      }),
    );
    const a = spawn('recover', f),
      b = spawn('recover', f);
    try {
      const pa = await stage(a, 'READY'),
        pb = await stage(b, 'READY');
      await Promise.all([stage(a, 'CLOSED'), stage(b, 'CLOSED')]);
      assert.equal((await a.done).code, 0);
      assert.equal((await b.done).code, 0);
      await noBackend(pa.backendPid);
      await noBackend(pb.backendPid);
      await paid(f);
    } finally {
      await terminate(a);
      await terminate(b);
    }
  } finally {
    release?.();
    if (holding) await holding;
    if (child) await terminate(child);
  }
});
test('process: cooperative worker drain and disconnect exits cleanly; distinct from POSIX SIGTERM', async () => {
  const f = await fixture(),
    child = spawn('graceful', f);
  try {
    const p = await stage(child, 'READY');
    await stage(child, 'CLOSED');
    assert.equal((await child.done).code, 0);
    await noBackend(p.backendPid);
    await paid(f);
    console.log(
      JSON.stringify({
        probe: 'owned-cooperative-close',
        processPid: child.pid,
        backendPid: p.backendPid,
        signalTested: false,
        closed: true,
      }),
    );
  } finally {
    await terminate(child);
  }
});

test('budget: real primary pool plus independent witness reach bounded slots and recover without leaks', async () => {
  const previous = process.env.DATABASE_URL,
    url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '1');
  process.env.DATABASE_URL = url.href;
  const primaryUrl = new URL(url);
  primaryUrl.searchParams.set('connection_limit', '2');
  const primary = new PrismaService({
    datasources: { db: { url: primaryUrl.href } },
  });
  const witness = new TiraAflojaVisibilityWitness(primary);
  const releases = [],
    pending = [],
    pids = [];
  let peak = 0;
  async function hold(client) {
    let signal;
    const ready = new Promise((r) => (signal = r)),
      gate = new Promise((r) => releases.push(r));
    const work = client.$transaction(
      async (tx) => {
        pids.push((await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid);
        signal();
        await gate;
      },
      { timeout: 10000 },
    );
    pending.push(work);
    await Promise.race([ready, work]);
  }
  try {
    await primary.onModuleInit();
    await witness.certify(randomUUID());
    await hold(primary);
    await hold(primary);
    await hold(witness.client); // Instrument the actual witness-owned pool, not a substitute client.
    const [r] =
      await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'`;
    peak = r.n;
    assert.equal(peak, 4, 'runtime 2+1, plus one owned observer');
    const started = performance.now();
    await assert.rejects(
      primary.$queryRaw`SELECT 1`,
      (e) => e.code === 'P2024',
    );
    await assert.rejects(
      witness.certify(randomUUID()),
      (e) => e.code === 'P2024',
    );
    releases.forEach((r) => r());
    await Promise.all(pending);
    await primary.$queryRaw`SELECT 1`;
    await witness.certify(randomUUID());
    const [settings] =
      await db.$queryRaw`SELECT current_setting('max_connections')::int AS maximum,current_setting('superuser_reserved_connections')::int AS superReserved,current_setting('reserved_connections')::int AS reserved`;
    console.log(
      JSON.stringify({
        probe: 'consolidated-budget',
        mainSlots: 2,
        witnessSlots: 1,
        observerSlots: 1,
        observedPeak: peak,
        poolTimeouts: 2,
        recoveredMs: Math.round(performance.now() - started),
        localPostgres: settings,
        productionBudgetCertified: false,
      }),
    );
  } finally {
    releases.forEach((r) => r());
    await Promise.allSettled(pending);
    await witness.close();
    await primary.onModuleDestroy();
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
  }
  for (const pid of pids) await noBackend(pid);
});

test('readiness: real owned TCP interruption, measured positive/negative cache, safe HTTP and automatic recovery', async () => {
  const original = new URL(process.env.COMPETITIVE_TEST_URL),
    sockets = new Set();
  let outage = false,
    accepted = 0,
    app,
    client,
    recoveredPid;
  const proxy = net.createServer((socket) => {
    accepted++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    if (outage) {
      socket.destroy();
      return;
    }
    const upstream = net.connect({
      host: '127.0.0.1',
      port: Number(original.port),
    });
    sockets.add(upstream);
    upstream.on('error', () => socket.destroy());
    upstream.once('close', () => {
      sockets.delete(upstream);
      socket.destroy();
    });
    socket.once('close', () => upstream.destroy());
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  async function until(deadline) {
    const delay = Math.max(0, deadline - Date.now());
    if (delay) await new Promise((r) => setTimeout(r, delay));
  }
  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    const url = new URL(original);
    url.port = String(proxy.address().port);
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('connect_timeout', '1');
    client = new PrismaClient({ datasources: { db: { url: url.href } } });
    const module = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: client }],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    const api = request(app.getHttpServer()),
      controller = module.get(HealthController);
    const before = await db.eventoXpCompetitivo.count();
    assert.equal((await api.get('/health/ready')).status, 200);
    const backend = (await client.$queryRaw`SELECT pg_backend_pid() AS pid`)[0]
      .pid;
    const positiveDeadline = controller.checkedUntil,
      outageAt = Date.now();
    assert.ok(
      positiveDeadline - outageAt > 0 && positiveDeadline - outageAt <= 5000,
    );
    outage = true;
    for (const socket of sockets) socket.destroy();
    assert.equal(
      (await api.get('/health/ready')).status,
      200,
      'positive cache must be measured, not called immediate detection',
    );
    await until(positiveDeadline);
    const failed = await api.get('/health/ready');
    const detectedAt = Date.now();
    assert.equal(failed.status, 503);
    assert.deepEqual(failed.body, {
      status: 'ERROR',
      service: 'saberplus-api',
      database: 'DOWN',
    });
    assert.equal((await api.get('/health/live')).status, 200);
    const failureDeadline = controller.checkedUntil,
      attempts = accepted;
    assert.ok(
      failureDeadline - detectedAt >= 0 && failureDeadline - detectedAt <= 1000,
    );
    outage = false;
    assert.equal((await api.get('/health/ready')).status, 503);
    assert.equal(
      accepted,
      attempts,
      'negative cache must not reconnect before its deadline',
    );
    await until(failureDeadline);
    assert.equal((await api.get('/health/ready')).status, 200);
    assert.equal(await db.eventoXpCompetitivo.count(), before);
    await noBackend(backend);
    recoveredPid = (await client.$queryRaw`SELECT pg_backend_pid() AS pid`)[0]
      .pid;
    console.log(
      JSON.stringify({
        probe: 'owned-readiness-outage',
        positiveCacheRemainingMs: positiveDeadline - outageAt,
        detectionElapsedMs: detectedAt - outageAt,
        recoveryElapsedMs: Date.now() - outageAt,
        negativeCacheMs: 1000,
        recovered: true,
        tcpConnectionsAccepted: accepted,
        providerCertified: false,
      }),
    );
  } finally {
    if (app) await app.close();
    await client?.$disconnect();
    const serverClosed = new Promise((resolve) => proxy.close(resolve));
    const socketsClosed = [...sockets].map(
      (socket) => new Promise((resolve) => socket.once('close', resolve)),
    );
    for (const socket of sockets) socket.destroy();
    await Promise.all([serverClosed, ...socketsClosed]);
  }
  assert.equal(sockets.size, 0);
  if (recoveredPid) await noBackend(recoveredPid);
});
