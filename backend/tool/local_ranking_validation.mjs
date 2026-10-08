// Disposable local fixtures for I2-5. Never accepts an existing database or .env.
import { execFile, fork } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, realpath, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

if (process.argv.length !== 2) throw new Error('No external arguments accepted.');
const backend = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(join(backend, 'package.json'));
const execute = promisify(execFile);
const nonce = randomBytes(8).toString('hex');
const purpose = 'saberplus-competitive-disposable-v1';
const name = `saberplus-i2-local-${nonce}`;
const root = await realpath(tmpdir());
const directory = await realpath(await mkdtemp(join(root, 'saberplus-i2-local-')));
const password = randomBytes(24).toString('hex');
const loginPassword = randomBytes(18).toString('hex');
const user = `sp_test_${nonce}`;
// Deliberate allowlist: no SMTP, remote DB, production flags or dotenv inherited.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT|NODE_OPTIONS)$/i.test(key)));
Object.assign(env, { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: 'postgres',
  NODE_ENV: 'test', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1',
  EDITORIAL_PUBLICATION_ENABLED: 'true', // Only this freshly owned local API.
  JWT_SECRET: randomBytes(32).toString('hex'), RANKING_ALIAS_SECRET: randomBytes(32).toString('hex') });
let db, child, context, url = '', created = false;
const run = (command, args, cwd = backend) => execute(command, args, {
  cwd, env, windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const docker = (...args) => run('docker', ['--context', context, ...args]);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  context = (await run('docker', ['context', 'show'])).stdout.trim();
  const endpoint = (await docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}')).stdout.trim();
  if (!endpoint.startsWith('npipe:////./pipe/') && !endpoint.startsWith('unix:///')) throw new Error('Local Docker required.');
  if ((await docker('info', '--format', '{{.OSType}}')).stdout.trim() !== 'linux') throw new Error('Linux Docker required.');
  await docker('run', '-d', '--name', name, '--label', `${purpose}=${nonce}`,
    '-p', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql/data:rw',
    '-e', 'POSTGRES_USER', '-e', 'POSTGRES_PASSWORD', '-e', 'POSTGRES_DB', 'postgres:16');
  created = true;
  const binding = (await docker('port', name, '5432/tcp')).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Non-loopback PostgreSQL refused.');
  url = `postgresql://${user}:${password}@${binding}/postgres?connection_limit=12&pool_timeout=30`;
  const marker = { purpose, nonce, url };
  validateCompetitiveDatabase(url, marker);
  const owner = join(directory, 'owner.json');
  await writeFile(owner, JSON.stringify(marker), { mode: 0o600 });
  Object.assign(env, { DATABASE_URL: url, DIRECT_URL: url, COMPETITIVE_TEST_OWNER: owner });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await docker('exec', name, 'pg_isready', '-U', user); ready = true; break; }
    catch { await sleep(200); }
  }
  if (!ready) throw new Error('Temporary PostgreSQL unavailable.');
  await docker('exec', name, 'psql', '-X', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-c',
    'CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO anon, authenticated;');
  const paths = (await run('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'prisma/migrations'])).stdout
    .split(/\r?\n/).filter(p => /^prisma\/migrations\/[a-zA-Z0-9_]+\/migration\.sql$/.test(p)).sort();
  if (!paths.length) throw new Error('Committed migrations required.');
  for (const path of paths) {
    const dest = join(directory, path.replace(/^prisma\//, ''));
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, (await run('git', ['show', `HEAD:backend/${path}`])).stdout);
  }
  await writeFile(join(directory, 'migrations/migration_lock.toml'), 'provider = "postgresql"\n');
  await writeFile(join(directory, 'schema.prisma'), await readFile(join(backend, 'prisma/schema.prisma')));
  await run(process.execPath, [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy',
    '--schema', join(directory, 'schema.prisma')], directory);
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url } } });
  const bcrypt = require('bcrypt');
  const hash = await bcrypt.hash(loginPassword, 10);
  const accounts = {};
  for (const [key, rol] of [['student', 'ESTUDIANTE'], ['zero', 'ESTUDIANTE'], ['absent', 'ESTUDIANTE'],
    ['teacher', 'PROFESOR'], ['admin', 'ADMIN']]) {
    accounts[key] = await db.usuario.create({ data: { nombre: `Ensayo ${key}`, correo: `${key}@example.invalid`,
      contrasenaHash: hash, rol, correoVerificado: true, tutorialEstudianteVersion: 1, tutorialProfesorVersion: 1 } });
  }
  const { CompetitiveService, competitiveHash } = require('./dist/competitive/competitive.service');
  const { CompetitiveVerifierRegistry } = require('./dist/competitive/competitive.contracts');
  // Synthetic trusted fixture, explicitly NOT a verified game played by Flutter.
  const [clock] = await db.$queryRaw`SELECT clock_timestamp()::timestamptz(3) AS now`;
  const source = { sourceId: randomUUID(), sourceType: 'TRIVIA_ATTEMPT', participantId: accounts.student.id };
  const evidence = { source, gameId: 'TRIVIA_RUSH', startedAt: clock.now, terminalAt: clock.now,
    competitiveOnline: true, validParticipant: true, evidenceHash: competitiveHash(['I2-5 synthetic fixture', source.sourceId]),
    resolution: { kind: 'RESULTADO', facts: { gameId: 'TRIVIA_RUSH', correct: 10, questions: 10, maxCombo: 10 } } };
  const service = new CompetitiveService(db, new CompetitiveVerifierRegistry([
    { sourceType: 'TRIVIA_ATTEMPT', async loadTerminal() { return evidence; } }]));
  const event = await service.settle(source);
  for (let i = 0; i < 60; i++) {
    const account = await db.usuario.create({ data: { nombre: 'Ficticio', correo: `fixture-${i}@example.invalid`,
      contrasenaHash: hash, rol: 'ESTUDIANTE', correoVerificado: true } });
    await db.balanceCompetitivo.create({ data: { usuarioId: account.id, gameId: 'TRIVIA_RUSH',
      temporada: event.temporada, xp: i < 50 ? 1000 - i : 90 - i, alcanzadoEn: clock.now, updatedAt: clock.now } });
  }
  await db.balanceCompetitivo.create({ data: { usuarioId: accounts.zero.id, gameId: 'TRIVIA_RUSH', temporada: event.temporada, xp: 0 } });
  // Academic fixtures only. Cima XP must come from a genuine attempt and verifier.
  const summitTheme = await db.tema.create({ data: { nombre: 'Cima - ensayo local IC-1A2',
    area: 'MATEMATICAS', estadoContenido: 'PUBLICADO', fechaPublicacion: new Date() } });
  const summitSubtheme = await db.subtema.create({ data: { nombre: 'Sumas para el ascenso',
    temaId: summitTheme.id, contenido: 'Banco sintetico local para probar Cima. No es contenido del curso.',
    estadoContenido: 'PUBLICADO', fechaPublicacion: new Date() } });
  for (let n = 1; n <= 12; n++) {
    await db.pregunta.create({ data: { subtemaId: summitSubtheme.id,
      enunciado: `Ensayo Cima: cuanto es ${n} + 1?`, explicacion: `Al sumar uno a ${n} obtenemos ${n + 1}.`,
      dificultad: 'BASICO', estadoContenido: 'PUBLICADO', fechaPublicacion: new Date(),
      respuestas: { create: [{ texto: String(n + 1), esCorrecta: true },
        { texto: String(n + 3), esCorrecta: false }] } } });
  }
  await mkdir(join(directory, 'uploads'));
  child = fork(join(backend, 'tool/local_ranking_api.cjs'), [], { cwd: directory, env,
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  // Do not stream application logs: they can contain fixture identities/tokens.
  child.stdout.resume(); child.stderr.resume();
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Local API startup timeout.')), 60000);
    child.once('message', message => { clearTimeout(timer); message.ready ? resolve() : reject(new Error('Unexpected API response.')); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Local API exited before ready.')); });
  });
  const config = { APP_ENV: 'dev', DEMO_MODE: 'false', API_BASE_URL: 'http://127.0.0.1:43187',
    CONTENT_BASE_URL: 'http://127.0.0.1:43187', AUTH_E2E_API_BASE_URL: 'http://127.0.0.1:43187',
    AUTH_E2E_EMAIL: accounts.student.correo, AUTH_E2E_PASSWORD: loginPassword,
    LOCAL_RANKING_SEASON: String(event.temporada), LOCAL_RANKING_ENABLED: 'true' };
  await writeFile(join(directory, 'flutter-private.json'), JSON.stringify(config), { mode: 0o600 });
  console.log(JSON.stringify({ phase: 'local-ranking-ready', directory, migrations: paths.length,
    api: config.API_BASE_URL, syntheticFixtures: true, ownPosition: 51, totalParticipants: 61 }));
  console.log('Local control.json actions: correct, solo-on, solo-off, stop. No HTTP mutation route.');
  let corrected = false;
  let soloEnabled = false;
  const deadline = Date.now() + 2 * 60 * 60 * 1000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Local API exited unexpectedly.');
    let action;
    try { action = JSON.parse(await readFile(join(directory, 'control.json'), 'utf8')).action; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (action === 'stop') break;
    if ((action === 'solo-on' || action === 'solo-off') && soloEnabled !== (action === 'solo-on')) {
      const enabled = action === 'solo-on';
      const requestId = randomUUID();
      await new Promise((resolve, reject) => {
        const onMessage = message => {
          if (message?.type !== 'local-solo-admission-ack' || message.requestId !== requestId) return;
          cleanup();
          message.enabled === enabled ? resolve() : reject(new Error('Local admission mismatch.'));
        };
        const cleanup = () => { clearTimeout(timer); child.off('message', onMessage); };
        const timer = setTimeout(() => { cleanup(); reject(new Error('Local admission timeout.')); }, 10000);
        child.on('message', onMessage);
        child.send({ type: 'local-solo-admission', enabled, requestId });
      });
      soloEnabled = enabled;
      console.log(JSON.stringify({ phase: 'local-solo-admission', enabled }));
    }
    if (action === 'correct' && !corrected) {
      await service.correct({ operationId: randomUUID(), originalEventId: event.id, actorId: accounts.admin.id,
        reason: 'I2-5 correction in owned synthetic fixture', nominalDelta: 2000, kind: 'CORRECCION' });
      corrected = true;
      console.log(JSON.stringify({ phase: 'local-ranking-corrected', expectedPosition: 1, expectedXp: 2100 }));
    }
    await sleep(500);
  }
} catch (error) {
  console.error(String(error.message).replaceAll(url || 'unused-url', '[temporary DB]')
    .replaceAll(password, '[redacted]').replaceAll(loginPassword, '[redacted]'));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) {
    child.send('stop');
    await Promise.race([new Promise(resolve => child.once('exit', resolve)), sleep(15000)]);
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
  }
  await db?.$disconnect();
  if (created) {
    const labels = JSON.parse((await docker('inspect', '--format', '{{json .Config.Labels}}', name)).stdout);
    if (labels[purpose] !== nonce) throw new Error('Ownership mismatch; resources retained.');
    await docker('rm', '-f', '-v', name);
  }
  if (dirname(directory) !== root || !basename(directory).startsWith('saberplus-i2-local-') ||
      await realpath(directory) !== directory) throw new Error('Directory mismatch; resources retained.');
  await rm(directory, { recursive: true });
  console.log('Owned local ranking API and PostgreSQL removed.');
}
