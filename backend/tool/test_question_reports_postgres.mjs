// R4: owned disposable PostgreSQL only. Never reads .env or accepts a DB URL.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

if (process.argv.length !== 2)
  throw new Error('No arguments or external database accepted.');
const backend = fileURLToPath(new URL('../', import.meta.url));
const root = await realpath(tmpdir());
const directory = await realpath(
  await mkdtemp(join(root, 'saberplus-reports-r4-')),
);
const nonce = randomBytes(8).toString('hex');
const password = randomBytes(24).toString('hex');
const user = `sp_test_${nonce}`;
const purpose = 'saberplus-competitive-disposable-v1';
const name = `saberplus-reports-r4-${nonce}`;
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) =>
    /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i.test(
      key,
    ),
  ),
);
Object.assign(env, {
  POSTGRES_USER: user,
  POSTGRES_PASSWORD: password,
  POSTGRES_DB: 'postgres',
  NODE_ENV: 'test',
  JWT_SECRET: randomBytes(32).toString('hex'),
});
let context,
  url = '',
  created = false,
  stage = 'docker';
const exec = promisify(execFile);
const redact = (value) =>
  String(value)
    .replaceAll(password, '[redacted]')
    .replaceAll(url || 'unused-url', '[temporary DB]');
const run = (command, args, cwd = backend, timeout = 120000) =>
  exec(command, args, {
    cwd,
    env,
    windowsHide: true,
    timeout,
    maxBuffer: 16 * 1024 * 1024,
  });
const docker = (...args) => run('docker', ['--context', context, ...args]);
try {
  context = (await run('docker', ['context', 'show'])).stdout.trim();
  const endpoint = (
    await docker(
      'context',
      'inspect',
      context,
      '--format',
      '{{.Endpoints.docker.Host}}',
    )
  ).stdout.trim();
  if (
    !endpoint.startsWith('npipe:////./pipe/') &&
    !endpoint.startsWith('unix:///')
  )
    throw new Error('Local Docker required.');
  if (
    (await docker('info', '--format', '{{.OSType}}')).stdout.trim() !== 'linux'
  )
    throw new Error('Linux Docker required.');
  await docker(
    'run',
    '-d',
    '--name',
    name,
    '--label',
    `${purpose}=${nonce}`,
    '-p',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data:rw',
    '-e',
    'POSTGRES_USER',
    '-e',
    'POSTGRES_PASSWORD',
    '-e',
    'POSTGRES_DB',
    'postgres:16',
  );
  created = true;
  const binding = (await docker('port', name, '5432/tcp')).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(binding))
    throw new Error('Loopback binding required.');
  url = `postgresql://${user}:${password}@${binding}/postgres?connection_limit=12&pool_timeout=30`;
  const marker = { purpose, nonce, url };
  validateCompetitiveDatabase(url, marker);
  await writeFile(join(directory, 'owner.json'), JSON.stringify(marker), {
    mode: 0o600,
  });
  Object.assign(env, {
    DATABASE_URL: url,
    DIRECT_URL: url,
    QUESTION_REPORT_TEST_OWNER: join(directory, 'owner.json'),
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      await docker('exec', name, 'pg_isready', '-U', user);
      ready = true;
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  if (!ready) throw new Error('Temporary PostgreSQL not ready.');
  stage = 'migrations';
  await docker(
    'exec',
    name,
    'psql',
    '-X',
    '-U',
    user,
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
    '-c',
    'CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO anon, authenticated;',
  );
  const committed = (
    await run('git', [
      'ls-tree',
      '-r',
      '--name-only',
      'HEAD',
      '--',
      'prisma/migrations',
    ])
  ).stdout
    .split(/\r?\n/)
    .filter((path) =>
      /^prisma\/migrations\/[a-zA-Z0-9_]+\/migration\.sql$/.test(path),
    );
  if (!committed.length) throw new Error('Committed migration chain required.');
  // Same explicit pending institutional/report chain as the human harness.
  // Never enumerate arbitrary working-tree SQL or teammate OV-1 migrations.
  const pending = [
    '20261010193000_institution_territory',
    '20261011200000_institution_public_profile',
    '20261012180000_institution_logo',
    '20261014180000_student_institution_requests',
    '20261016180000_student_institution_codes',
    '20261017220000_academic_question_reports',
  ].map((name) => `prisma/migrations/${name}/migration.sql`);
  const paths = [...new Set([...committed, ...pending])].sort();
  for (const path of paths) {
    const dest = join(directory, path.replace(/^prisma\//, ''));
    await mkdir(dirname(dest), { recursive: true });
    const content = committed.includes(path)
      ? (await run('git', ['show', `HEAD:backend/${path}`])).stdout
      : await readFile(join(backend, path), 'utf8');
    await writeFile(dest, content);
  }
  await writeFile(
    join(directory, 'migrations/migration_lock.toml'),
    'provider = "postgresql"\n',
  );
  await writeFile(
    join(directory, 'schema.prisma'),
    await readFile(join(backend, 'prisma/schema.prisma')),
  );
  await run(
    process.execPath,
    [
      join(backend, 'node_modules/prisma/build/index.js'),
      'migrate',
      'deploy',
      '--schema',
      join(directory, 'schema.prisma'),
    ],
    directory,
  );
  console.log(
    JSON.stringify({
      phase: 'reports-r4-isolated-ready',
      migrations: paths.length,
      postgres: 16,
      loopback: true,
      tmpfs: true,
      humanSessionReused: false,
    }),
  );
  stage = 'tests';
  try {
    const result = await run(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        '--test-reporter=spec',
        'test/question-reports-postgres.test.cjs',
      ],
      backend,
      240000,
    );
    process.stdout.write(redact(result.stdout));
    process.stderr.write(redact(result.stderr));
  } catch (error) {
    process.stdout.write(redact(error.stdout || ''));
    process.stderr.write(redact(error.stderr || ''));
    throw new Error('R4 integrated suite failed.');
  }
} catch {
  console.error(
    JSON.stringify({
      phase: 'reports-r4-failed',
      stage,
      privateDetailsOmitted: true,
    }),
  );
  process.exitCode = 1;
} finally {
  // Only remove our exact labelled container and validated temporary directory.
  if (created) {
    const labels = JSON.parse(
      (await docker('inspect', '--format', '{{json .Config.Labels}}', name))
        .stdout,
    );
    if (labels[purpose] !== nonce)
      throw new Error('Ownership mismatch; resources retained.');
    await docker('rm', '-f', '-v', name);
  }
  if (
    dirname(directory) !== root ||
    !basename(directory).startsWith('saberplus-reports-r4-') ||
    (await realpath(directory)) !== directory
  )
    throw new Error('Temporary directory mismatch; retained.');
  await rm(directory, { recursive: true });
  console.log(JSON.stringify({ phase: 'reports-r4-owned-resources-removed' }));
}
