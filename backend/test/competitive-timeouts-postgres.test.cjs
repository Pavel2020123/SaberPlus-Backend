require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const net = require('node:net');
const { PrismaClient } = require('@prisma/client');
let db, source;
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  source = validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const url = new URL(source);
  url.searchParams.set('connection_limit', '1');
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
});
after(async () => {
  await db?.$disconnect();
});
const sqlstate = (state) => (error) =>
  error.code === 'P2010' && error.meta?.code === state;
test('timeouts: SET LOCAL statement_timeout cancels real SQL with 57014 and next transaction recovers', async () => {
  const started = performance.now();
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '150ms'");
      await tx.$queryRaw`SELECT pg_sleep(5)::text`;
    }),
    sqlstate('57014'),
  );
  const elapsedMs = Math.round(performance.now() - started);
  assert.ok(elapsedMs >= 100 && elapsedMs < 3000);
  assert.equal(
    (
      await db.$queryRaw`SELECT current_setting('statement_timeout') AS value`
    )[0].value,
    '0',
  );
  await db.$queryRaw`SELECT 1`;
  console.log(
    JSON.stringify({
      probe: 'statement-timeout',
      configuredMs: 150,
      elapsedMs,
      sqlstate: '57014',
      scope: 'one owned transaction',
      recovered: true,
    }),
  );
});
test('timeouts: SET LOCAL lock_timeout cancels an observed lock wait with 55P03, leaving no waiter', async () => {
  const u = await db.usuario.create({
    data: {
      nombre: 'Owned timeout',
      correo: randomUUID() + '@example.invalid',
      contrasenaHash: 'none',
    },
  });
  const locker = new PrismaClient({
    datasources: { db: { url: source.href } },
  });
  let release, entered;
  const ready = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const hold = locker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u.id}::uuid FOR UPDATE`;
      entered();
      await gate;
    },
    { timeout: 5000 },
  );
  let waiterPid;
  try {
    await ready;
    const started = performance.now();
    await assert.rejects(
      db.$transaction(async (tx) => {
        waiterPid = (await tx.$queryRaw`SELECT pg_backend_pid() AS pid`)[0].pid;
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '150ms'");
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u.id}::uuid FOR UPDATE`;
      }),
      sqlstate('55P03'),
    );
    const elapsedMs = Math.round(performance.now() - started);
    assert.ok(elapsedMs >= 100 && elapsedMs < 3000);
    assert.equal(
      (
        await locker.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=${waiterPid}::int AND wait_event_type='Lock'`
      )[0].n,
      0,
    );
    release();
    await hold;
    assert.equal(
      (await db.$queryRaw`SELECT current_setting('lock_timeout') AS value`)[0]
        .value,
      '0',
    );
    await db.$transaction(
      (tx) =>
        tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u.id}::uuid FOR UPDATE`,
    );
    console.log(
      JSON.stringify({
        probe: 'lock-timeout',
        configuredMs: 150,
        elapsedMs,
        sqlstate: '55P03',
        noWaitingSession: true,
        recovered: true,
      }),
    );
  } finally {
    release();
    await hold;
    await locker.$disconnect();
  }
});
test('timeouts: real accepted TCP handshake blackhole hits connect_timeout, then same client reconnects without XP', async () => {
  const sockets = new Set();
  let blackhole = true,
    client,
    accepted = 0;
  const proxy = net.createServer((socket) => {
    accepted++;
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('close', () => sockets.delete(socket));
    if (blackhole) return; // Actual accepted socket; neither reject nor mock a timeout.
    const upstream = net.connect({
      host: '127.0.0.1',
      port: Number(source.port),
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
  try {
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(0, '127.0.0.1', resolve);
    });
    const url = new URL(source);
    url.port = String(proxy.address().port);
    url.searchParams.set('connect_timeout', '1');
    url.searchParams.set('connection_limit', '1');
    client = new PrismaClient({ datasources: { db: { url: url.href } } });
    const before = await db.eventoXpCompetitivo.count(),
      started = performance.now();
    await assert.rejects(
      client.$connect(),
      (e) => e.errorCode === 'P1001' || e.errorCode === 'P1002',
    );
    const elapsedMs = Math.round(performance.now() - started);
    assert.ok(accepted > 0, 'Real handshake connection required');
    assert.ok(elapsedMs >= 900 && elapsedMs < 5000);
    blackhole = false;
    for (const socket of sockets) socket.destroy();
    await client.$connect();
    await client.$queryRaw`SELECT 1`;
    assert.equal(await db.eventoXpCompetitivo.count(), before);
    console.log(
      JSON.stringify({
        probe: 'accepted-tcp-blackhole',
        configuredConnectSeconds: 1,
        elapsedMs,
        accepted,
        recovered: true,
        providerCertified: false,
      }),
    );
  } finally {
    const pending = [...sockets].map(
      (socket) => new Promise((r) => socket.once('close', r)),
    );
    for (const socket of sockets) socket.destroy();
    await Promise.all(pending);
    await client?.$disconnect();
    await new Promise((r) => proxy.close(r));
  }
  assert.equal(sockets.size, 0);
});
