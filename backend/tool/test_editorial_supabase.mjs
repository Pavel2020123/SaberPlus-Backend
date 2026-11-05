// Own disposable loopback Storage + PostgreSQL only; never reads .env or accepts URLs.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const purpose = 'saberplus-c5-storage-disposable-v1';
const image = 'supabase/storage-api@sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54'; // v1.81.0

export async function withOwnedSupabase(action) {
  const nonce = randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  const secret = randomBytes(32).toString('hex');
  const name = `saberplus-c5-storage-${nonce}`;
  const dbName = `${name}-db`, network = `${name}-net`, volume = `${name}-bytes`;
  const username = `sp_test_${nonce}`;
  const token = (role) => {
    const data = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ role, iss: 'supabase', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}`;
    return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
  };
  const serviceKey = token('service_role'), anonKey = token('anon');
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i.test(key)));
  Object.assign(env, {
    POSTGRES_USER: username, POSTGRES_PASSWORD: password, POSTGRES_DB: 'postgres',
    DATABASE_URL: `postgresql://${username}:${password}@${dbName}:5432/postgres`,
    AUTH_JWT_SECRET: secret, ANON_KEY: anonKey, SERVICE_KEY: serviceKey,
    AUTH_JWT_ALGORITHM: 'HS256', DB_INSTALL_ROLES: 'true',
    STORAGE_BACKEND: 'file', FILE_STORAGE_BACKEND_PATH: '/var/lib/storage',
    TENANT_ID: 'c5-local', REGION: 'local', GLOBAL_S3_BUCKET: 'c5-local',
    FILE_SIZE_LIMIT: String(5 * 1024 * 1024), UPLOAD_FILE_SIZE_LIMIT: String(5 * 1024 * 1024),
    ENABLE_IMAGE_TRANSFORMATION: 'false', IMAGE_TRANSFORMATION_ENABLED: 'false',
    POSTGREST_URL: 'http://127.0.0.1:1', NODE_ENV: 'test',
  });
  const run = (cmd, args, timeout = 120000) => execute(cmd, args, { env, cwd: backend, windowsHide: true, timeout, maxBuffer: 8 * 1024 * 1024 });
  let context, stage = 'docker', createdNetwork = false, createdVolume = false, createdDb = false, createdStorage = false;
  const docker = (...args) => run('docker', ['--context', context, ...args]);
  const owned = async (kind, target) => {
    const field = kind === 'container' ? '{{json .Config.Labels}}' : '{{json .Labels}}';
    const result = await docker(kind, 'inspect', '--format', field, target);
    if (JSON.parse(result.stdout)?.[purpose] !== nonce) throw new Error('Resource ownership mismatch');
  };
  try {
    context = (await run('docker', ['context', 'show'])).stdout.trim();
    const endpoint = (await docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}')).stdout.trim();
    assert.ok(endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'));
    assert.equal((await docker('info', '--format', '{{.OSType}}')).stdout.trim(), 'linux');
    // Image must already be available: this runner cannot download arbitrary images.
    await docker('image', 'inspect', image);
    await docker('network', 'create', '--label', `${purpose}=${nonce}`, network); createdNetwork = true;
    await docker('volume', 'create', '--label', `${purpose}=${nonce}`, volume); createdVolume = true;
    await docker('run', '-d', '--name', dbName, '--label', `${purpose}=${nonce}`, '--network', network,
      '--memory', '384m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data:rw,size=256m',
      '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB', 'postgres:16'); createdDb = true;
    stage = 'postgres';
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { await docker('exec', dbName, 'pg_isready', '-h', '127.0.0.1', '-U', username, '-d', 'postgres'); ready = true; break; }
      catch { await new Promise((ok) => setTimeout(ok, 300)); }
    }
    assert.ok(ready);
    // Storage's upstream migrations reference this role even with a random
    // bootstrap owner. Only this newly owned empty test DB is touched.
    await owned('container', dbName);
    await docker('exec', dbName, 'psql', '-X', '-U', username, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c', 'CREATE ROLE postgres NOLOGIN SUPERUSER;');
    stage = 'storage';
    const keys = Object.keys(env).filter((key) => !/^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT|POSTGRES_)/i.test(key));
    await docker('run', '-d', '--name', name, '--label', `${purpose}=${nonce}`, '--network', network,
      '--memory', '512m', '--cpus', '1', '--user', '0:0', '--security-opt', 'no-new-privileges',
      '--mount', `type=volume,source=${volume},target=/var/lib/storage`, '-p', '127.0.0.1::5000',
      ...keys.flatMap((key) => ['-e', key]), image); createdStorage = true;
    const binding = (await docker('port', name, '5000/tcp')).stdout.trim();
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    const url = `http://${binding}`;
    ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${url}/status`, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } }
      catch { /* wait only for this newly created container */ }
      await new Promise((ok) => setTimeout(ok, 400));
    }
    if (!ready) {
      const logs = await docker('logs', '--tail', '12', name);
      const safe = (logs.stdout + logs.stderr).replaceAll(password, '[secret]').replaceAll(secret, '[secret]').replaceAll(serviceKey, '[secret]').replaceAll(anonKey, '[secret]');
      console.error(safe);
      throw new Error('Storage did not become ready');
    }
    const bucket = `editorial-${nonce}`;
    const created = await fetch(`${url}/bucket`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: bucket, name: bucket, public: false, file_size_limit: 2 * 1024 * 1024, allowed_mime_types: ['image/webp'] }), signal: AbortSignal.timeout(10000) });
    assert.equal(created.status, 200);
    const privateBucket = `private-${nonce}`;
    const privateCreated = await fetch(`${url}/bucket`, {
      method: 'POST', headers: { Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: privateBucket, name: privateBucket, public: false,
        file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ['application/octet-stream'] }),
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(privateCreated.status, 200);
    console.log(JSON.stringify({ phase: 'c5-owned-storage-ready', image, loopback: true, privateBucket: true }));
    stage = 'test';
    return await action({ config: { url, bucket, serviceKey }, privateConfig: { url, bucket: privateBucket, serviceKey }, anonKey, restart: async () => {
      await owned('container', name); await docker('restart', name);
      const current = (await docker('port', name, '5000/tcp')).stdout.trim();
      assert.match(current, /^127\.0\.0\.1:\d+$/);
      console.log(JSON.stringify({ phase: 'c5-storage-restart-binding', changed: current !== binding }));
      return `http://${current}`;
    }, docker, name, dbName, volume });
  } catch (error) {
    if (createdStorage) {
      const logs = await docker('logs', '--tail', '4', name).catch(() => ({ stdout: '', stderr: '' }));
      const safe = (logs.stdout + logs.stderr).replaceAll(password, '[secret]').replaceAll(secret, '[secret]').replaceAll(serviceKey, '[secret]').replaceAll(anonKey, '[secret]');
      console.error(safe.slice(-4000));
    }
    console.error(JSON.stringify({ phase: 'c5-owned-storage-failed', stage, type: error?.constructor?.name, status: error?.status ?? null }));
    throw new Error(`Owned Storage check failed at ${stage}`);
  } finally {
    // Only exact resource names generated above, and only after label verification.
    if (createdStorage) { await owned('container', name); await docker('rm', '-f', name); }
    if (createdDb) { await owned('container', dbName); await docker('rm', '-f', dbName); }
    if (createdVolume) { await owned('volume', volume); await docker('volume', 'rm', volume); }
    if (createdNetwork) { await owned('network', network); await docker('network', 'rm', network); }
    console.log(JSON.stringify({ phase: 'c5-owned-storage-resources-removed' }));
  }
}

async function main() {
  if (process.argv.length !== 2) throw new Error('External configuration is not accepted');
  require('ts-node/register/transpile-only');
  const { SupabaseEditorialFileStore } = require('./src/editorial-files/supabase-editorial-file.store');
  const sharp = require('sharp');
  await withOwnedSupabase(async ({ config, privateConfig, anonKey, restart }) => {
    const checkpoint = (step) => console.log(JSON.stringify({ phase: 'c5-storage-check', step }));
    let store = new SupabaseEditorialFileStore(config);
    const id = randomUUID();
    const bytes = await sharp({ create: { width: 80, height: 40, channels: 3, background: 'blue' } }).webp().toBuffer();
    checkpoint('upload'); await store.put(id, bytes);
    assert.deepEqual(await store.read(id), bytes);
    checkpoint('replay'); await Promise.all(Array.from({ length: 4 }, () => store.put(id, bytes)));
    await assert.rejects(store.put(id, Buffer.from('different')));
    checkpoint('anonymous'); const anonymous = await fetch(`${config.url}/object/authenticated/${config.bucket}/editorial/v1/${id}.webp`, { headers: { Authorization: `Bearer ${anonKey}` } });
    console.log(JSON.stringify({ phase: 'c5-storage-access-status', anonymous: anonymous.status }));
    assert.ok(anonymous.status >= 400);
    checkpoint('public'); const publicRead = await fetch(`${config.url}/object/public/${config.bucket}/editorial/v1/${id}.webp`);
    assert.ok(publicRead.status >= 400);
    // Opaque private bytes use their own bucket and cannot be read as editorial assets.
    let privateStore = new SupabaseEditorialFileStore(privateConfig, fetch, 'private');
    const privateBytes = Buffer.from('%PDF-1.7\nsynthetic untrusted envelope\n%%EOF');
    await privateStore.put(id, privateBytes);
    assert.deepEqual(await privateStore.read(id), privateBytes);
    assert.deepEqual(await store.read(id), bytes);
    await Promise.all(Array.from({ length: 4 }, () => privateStore.put(id, privateBytes)));
    await assert.rejects(privateStore.put(id, Buffer.from('different private bytes')));
    const privatePath = `${privateConfig.bucket}/private/v1/${id}.bin`;
    const anonPrivate = await fetch(`${privateConfig.url}/object/authenticated/${privatePath}`, { headers: { Authorization: `Bearer ${anonKey}` } });
    assert.ok(anonPrivate.status >= 400);
    const publicPrivate = await fetch(`${privateConfig.url}/object/public/${privatePath}`);
    assert.ok(publicPrivate.status >= 400);
    checkpoint('restart'); const restartedUrl = await restart();
    store = new SupabaseEditorialFileStore({ ...config, url: restartedUrl });
    privateStore = new SupabaseEditorialFileStore({ ...privateConfig, url: restartedUrl }, fetch, 'private');
    let restored = false;
    for (let i = 0; i < 80; i++) {
      try { assert.deepEqual(await store.read(id), bytes); restored = true; break; }
      catch { await new Promise((ok) => setTimeout(ok, 300)); }
    }
    assert.ok(restored);
    assert.deepEqual(await privateStore.read(id), privateBytes);
    await privateStore.remove(id); await privateStore.remove(id);
    await assert.rejects(privateStore.read(id));
    checkpoint('remove'); await store.remove(id); await store.remove(id);
    await assert.rejects(store.read(id));
    console.log(JSON.stringify({ phase: 'c5-real-storage-contract-passed', persistedAcrossRestart: true, concurrentReplay: true, noOverwrite: true, anonymousDenied: true, publicDenied: true, repeatedDelete: true }));
    console.log(JSON.stringify({ phase: 'c5-private-real-storage-contract-passed', separateBucket: true, opaqueBytes: true, persistedAcrossRestart: true, concurrentReplay: true, anonymousDenied: true, publicDenied: true, repeatedDelete: true }));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => {
  console.error(JSON.stringify({ phase: 'c5-storage-runner-failed', type: error?.constructor?.name, code: error?.code ?? null }));
  process.exitCode = 1;
});
