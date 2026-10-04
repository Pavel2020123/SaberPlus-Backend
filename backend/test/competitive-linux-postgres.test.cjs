require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { readFile, writeFile, unlink } = require('node:fs/promises');
const { dirname, join } = require('node:path');
const { randomUUID } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { PrismaClient } = require('@prisma/client');
const { SummitService } = require('../src/summit/summit.service');
const execute = promisify(execFile);
const purpose = 'saberplus-competitive-linux-v1';
let db, marker, context, network, sub;
const containers = new Set();
async function docker(args) {
  return execute('docker', ['--context', context, ...args], {
    timeout: 20000,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  });
}
async function owned(name) {
  const labels = JSON.parse(
    (await docker(['inspect', '--format', '{{json .Config.Labels}}', name]))
      .stdout,
  );
  assert.equal(labels[purpose], marker.nonce);
}
async function until(fn, label, milliseconds = 15000) {
  const deadline = performance.now() + milliseconds;
  while (performance.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.fail(label);
}
async function messages(name) {
  const output = (await docker(['logs', name])).stdout;
  return output.split(/\r?\n/).flatMap((line) => {
    try {
      const row = JSON.parse(line);
      return row.cp22 ? [row] : [];
    } catch {
      return [];
    } // Nest logs are not protocol records; Docker errors propagate.
  });
}
async function phase(name, value) {
  return until(async () => {
    const records = await messages(name);
    const result = records.find((r) => r.phase === value);
    if (result) return result;
    const exit = records.find((r) => r.phase === 'child-exit');
    if (exit)
      assert.fail(
        `Backend exited before ${value}: ${JSON.stringify(records.find((r) => r.phase === 'bootstrap-error') ?? exit)}`,
      );
    return false;
  }, `Missing ${value}`);
}
async function clients() {
  return (
    await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'`
  )[0].n;
}
async function start(mode, source = '') {
  const name = `sp-linux-${marker.nonce}-${randomUUID()}`;
  const url = new URL(marker.url);
  url.hostname = `saberplus-competitive-test-${marker.nonce}`;
  url.port = '5432';
  url.searchParams.set('connection_limit', '4');
  url.searchParams.set('pool_timeout', '1');
  const path = join(dirname(process.env.COMPETITIVE_TEST_OWNER), `${name}.env`);
  await writeFile(
    path,
    [
      `DATABASE_URL=${url.href}`,
      `DIRECT_URL=${url.href}`,
      'JWT_SECRET=owned-test-only-secret-not-for-production',
      'NODE_ENV=development',
      'PORT=3000',
      'SMTP_HOST=127.0.0.1',
      'COMPETITIVE_SOLO_ENABLED=false',
      'COMPETITIVE_TRIVIA_ENABLED=false',
      'COMPETITIVE_GHOST_ENABLED=false',
      'COMPETITIVE_TUG_ENABLED=false',
      `CP22_MODE=${mode}`,
      `CP22_SOURCE=${source}`,
    ].join('\n'),
    { mode: 0o600 },
  );
  try {
    await docker([
      'run',
      '--detach',
      '--name',
      name,
      '--label',
      `${purpose}=${marker.nonce}`,
      '--network',
      network,
      '--read-only',
      '--tmpfs',
      '/tmp:rw',
      '--tmpfs',
      '/app/uploads:rw',
      '--env-file',
      path,
      process.env.COMPETITIVE_LINUX_IMAGE,
    ]);
    containers.add(name);
  } finally {
    await unlink(path);
  }
  return name;
}
async function signal(name, pid, value) {
  await owned(name);
  assert.ok(
    Number.isInteger(pid) && pid > 1,
    'Signal actual child Node, never supervisor PID 1',
  );
  const started = performance.now();
  await docker(['exec', name, 'kill', `-${value}`, String(pid)]);
  console.log(
    JSON.stringify({
      probe: 'posix-signal',
      command: ['docker', 'exec', name, 'kill', `-${value}`, String(pid)],
      platform: 'linux',
      targetPid: pid,
      signal: value,
    }),
  );
  return started;
}
async function exited(name, value, started) {
  const exit = await phase(name, 'child-exit');
  assert.equal(exit.code, null);
  assert.equal(exit.signal, value);
  const [state] = JSON.parse((await docker(['inspect', name])).stdout);
  await until(async () => {
    const [s] = JSON.parse((await docker(['inspect', name])).stdout);
    return !s.State.Running;
  }, 'Supervisor did not finish');
  const code = Number((await docker(['wait', name])).stdout.trim());
  assert.equal(
    code,
    0,
    'Supervisor reports child signal separately from container exit',
  );
  console.log(
    JSON.stringify({
      probe: 'posix-exit',
      targetPid: exit.pid,
      childSignal: exit.signal,
      containerExit: code,
      elapsedMs: Math.round(performance.now() - started),
    }),
  );
  return await messages(name);
}
function hooks(records) {
  for (const name of [
    'PrismaService',
    'CompetitiveReconciler',
    'TriviaCompetitiveReconciler',
    'TugCompetitiveReconciler',
    'TriviaPresenceService',
    'TiraAflojaService',
    'TriviaPresenceGateway',
    'TiraAflojaGateway',
  ])
    assert.ok(
      records.some((r) => r.phase === 'hook-end' && r.provider === name),
      `Real hook missing: ${name}`,
    );
  console.log(
    JSON.stringify({
      probe: 'real-nest-hooks',
      completed: records
        .filter((r) => r.phase === 'hook-end')
        .map((r) => r.provider),
      platform: 'linux',
    }),
  );
}
async function noClientsAbove(count) {
  await until(
    async () => (await clients()) === count,
    'Linux connections persisted',
    3000,
  );
}
async function paid(f) {
  await until(
    async () =>
      (await db.intentoCima.findUniqueOrThrow({ where: { id: f.sourceId } }))
        .competitiveSettledAt,
    'Real startup reconciler did not recover',
  );
  const e = await db.eventoXpCompetitivo.findMany({
    where: { sourceId: f.sourceId },
  });
  assert.equal(e.length, 1);
  assert.equal(e[0].deltaAplicado, 100);
  const b = await db.balanceCompetitivo.findFirstOrThrow({
    where: { usuarioId: f.userId, gameId: 'SUMMIT' },
  });
  assert.equal(b.xp, 100);
  assert.equal(b.version, 1);
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.userId } })).xpTotal,
    101,
  );
}
async function fixture() {
  const old = process.env.COMPETITIVE_SOLO_ENABLED;
  process.env.COMPETITIVE_SOLO_ENABLED = 'true';
  try {
    const u = await db.usuario.create({
      data: {
        nombre: 'Owned Linux',
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
    if (old === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
    else process.env.COMPETITIVE_SOLO_ENABLED = old;
  }
}
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  marker = JSON.parse(
    await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8'),
  );
  validateCompetitiveDatabase(process.env.COMPETITIVE_TEST_URL, marker);
  assert.equal(
    process.env.COMPETITIVE_LINUX_IMAGE,
    `saberplus-competitive-linux:${marker.nonce}`,
  );
  context = (
    await execute('docker', ['context', 'show'], { windowsHide: true })
  ).stdout.trim();
  const endpoint = (
    await docker([
      'context',
      'inspect',
      context,
      '--format',
      '{{.Endpoints.docker.Host}}',
    ])
  ).stdout.trim();
  assert.ok(
    endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'),
  );
  const pg = `saberplus-competitive-test-${marker.nonce}`;
  const labels = JSON.parse(
    (await docker(['inspect', '--format', '{{json .Config.Labels}}', pg]))
      .stdout,
  );
  assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
  network = `sp-linux-network-${marker.nonce}`;
  await docker([
    'network',
    'create',
    '--internal',
    '--label',
    `${purpose}=${marker.nonce}`,
    network,
  ]);
  await docker(['network', 'connect', network, pg]);
  const url = new URL(marker.url);
  url.searchParams.set('connection_limit', '1');
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const topic = await db.tema.create({
    data: {
      nombre: 'Linux owned',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  sub = await db.subtema.create({
    data: {
      nombre: 'Linux owned',
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
        enunciado: 'Linux ' + i,
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
  for (const name of containers) {
    await owned(name);
    await docker(['rm', '--force', name]);
  }
  await db?.$disconnect();
  // Runner owns network/image cleanup too, including a forcibly terminated test process.
});
test('Linux real backend: SIGTERM executes actual Nest hooks and closes principal plus witness pools', async () => {
  const baseline = await clients(),
    name = await start('normal');
  const ready = await phase(name, 'ready');
  assert.equal(ready.platform, 'linux');
  assert.ok(ready.pid > 1);
  assert.notEqual(ready.mainPid, ready.witnessPid);
  const health = JSON.parse(
    (
      await docker([
        'exec',
        name,
        'node',
        '-e',
        "fetch('http://127.0.0.1:3000/health/ready').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()})))",
      ])
    ).stdout,
  );
  assert.equal(health.status, 200);
  const records = await exited(
    name,
    'SIGTERM',
    await signal(name, ready.pid, 'TERM'),
  );
  hooks(records);
  await noClientsAbove(baseline);
});
test('Linux real backend: SIGTERM during observable lock wait drains pending work and restart stays idempotent', async () => {
  const f = await fixture(),
    baseline = await clients();
  const locker = new PrismaClient({ datasources: { db: { url: marker.url } } });
  let release, entered;
  const acquired = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  const hold = locker.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${f.userId}::uuid FOR UPDATE`;
      entered();
      await gate;
    },
    { timeout: 20000 },
  );
  let name;
  try {
    await acquired;
    name = await start('lock', f.sourceId);
    const ready = await phase(name, 'ready');
    await until(
      async () =>
        (
          await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%'`
        )[0].n > 0,
      'No actual PostgreSQL lock wait',
    );
    const started = await signal(name, ready.pid, 'TERM');
    await until(
      async () => (await messages(name)).some((r) => r.phase === 'hook-start'),
      'No actual Nest shutdown hook',
    );
    release();
    await hold;
    await locker.$disconnect();
    hooks(await exited(name, 'SIGTERM', started));
    await noClientsAbove(baseline);
    const next = await start('recover');
    const r = await phase(next, 'ready');
    await paid(f);
    hooks(await exited(next, 'SIGTERM', await signal(next, r.pid, 'TERM')));
    await noClientsAbove(baseline);
  } finally {
    release?.();
    await hold;
    await locker.$disconnect();
  }
});
test('Linux real backend: SIGKILL before COMMIT rolls back, real startup recovers and second restart never duplicates', async () => {
  const f = await fixture(),
    baseline = await clients(),
    name = await start('kill-before', f.sourceId);
  const staged = await phase(name, 'precommit');
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
    0,
  );
  const records = await exited(
    name,
    'SIGKILL',
    await signal(name, staged.pid, 'KILL'),
  );
  assert.equal(
    records.filter((r) => r.phase === 'hook-start' || r.phase === 'hook-end')
      .length,
    0,
    'SIGKILL must not claim hooks',
  );
  await noClientsAbove(baseline);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.sourceId } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({ where: { usuarioId: f.userId } }),
    0,
  );
  for (let i = 0; i < 2; i++) {
    const next = await start('recover'),
      r = await phase(next, 'ready');
    await paid(f);
    hooks(await exited(next, 'SIGTERM', await signal(next, r.pid, 'TERM')));
    await noClientsAbove(baseline);
  }
});
