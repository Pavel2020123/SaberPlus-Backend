import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const purpose = 'saberplus-competitive-disposable-v1';
export function validateCompetitiveDatabase(urlValue, marker) {
  const url = new URL(urlValue);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/postgres' ||
    !/^sp_test_[a-f0-9]{16}$/.test(url.username) ||
    !url.password ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (k) => !['connection_limit', 'pool_timeout'].includes(k),
    ) ||
    marker.purpose !== purpose ||
    marker.url !== url.href
  ) {
    throw new Error(
      'Only the owned disposable loopback database is permitted.',
    );
  }
  return url;
}
async function main() {
  if (process.argv.length !== 2)
    throw new Error('No external database or arguments accepted.');
  const nonce = randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  const user = `sp_test_${nonce}`;
  const name = `saberplus-competitive-test-${nonce}`;
  const tempRoot = await realpath(tmpdir());
  const directory = await realpath(
    await mkdtemp(join(tempRoot, 'saberplus-competitive-')),
  );
  const env = {
    ...process.env,
    POSTGRES_USER: user,
    POSTGRES_PASSWORD: password,
    POSTGRES_DB: 'postgres',
  };
  // Ignore any inherited production credentials. This runner never reads .env.
  for (const key of [
    'DATABASE_URL',
    'DIRECT_URL',
    'PGHOST',
    'PGPORT',
    'PGDATABASE',
    'PGUSER',
    'PGPASSWORD',
    'DOCKER_HOST',
  ])
    delete env[key];
  let url = '';
  const run = async (command, args, timeout = 120_000) => {
    try {
      return await execute(command, args, {
        cwd: backend,
        env,
        timeout,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
      });
    } catch (error) {
      throw new Error(
        `${basename(command)} failed: ${error.stdout || ''}\n${error.stderr || error.message}`
          .replaceAll(password, '[redacted]')
          .replaceAll(url || 'unused-url-token', '[temporary DB]'),
      );
    }
  };
  let created = false;
  try {
    const context = (await run('docker', ['context', 'show'])).stdout.trim();
    const endpoint = (
      await run('docker', [
        'context',
        'inspect',
        context,
        '--format',
        '{{.Endpoints.docker.Host}}',
      ])
    ).stdout.trim();
    if (
      !endpoint.startsWith('npipe:////./pipe/') &&
      !endpoint.startsWith('unix:///')
    )
      throw new Error(
        'Docker must use a local pipe/socket, never a remote daemon.',
      );
    const docker = (...args) => run('docker', ['--context', context, ...args]);
    await docker(
      'run',
      '--detach',
      '--name',
      name,
      '--label',
      `${purpose}=${nonce}`,
      '--publish',
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql/data:rw',
      '--env',
      'POSTGRES_USER',
      '--env',
      'POSTGRES_PASSWORD',
      '--env',
      'POSTGRES_DB',
      'postgres:16',
    );
    created = true;
    const binding = (await docker('port', name, '5432/tcp')).stdout.trim();
    if (!/^127\.0\.0\.1:\d+$/.test(binding))
      throw new Error('Unexpected PostgreSQL binding.');
    url = `postgresql://${user}:${password}@${binding}/postgres?connection_limit=12&pool_timeout=30`;
    const marker = { purpose, nonce, url };
    validateCompetitiveDatabase(url, marker);
    const markerPath = join(directory, 'owner.json');
    await writeFile(markerPath, JSON.stringify(marker), { mode: 0o600 });
    Object.assign(env, {
      DATABASE_URL: url,
      DIRECT_URL: url,
      COMPETITIVE_TEST_URL: url,
      COMPETITIVE_TEST_OWNER: markerPath,
    });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        await docker('exec', name, 'pg_isready', '-U', user, '-d', 'postgres');
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
    if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
    const paths = (
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
      .filter((p) =>
        /^prisma\/migrations\/[a-zA-Z0-9_]+\/migration\.sql$/.test(p),
      )
      .sort();
    if (!paths.length) throw new Error('No committed migration SQL found.');
    const sql = [
      'CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO anon, authenticated;',
    ];
    for (const path of paths)
      sql.push((await run('git', ['show', `HEAD:backend/${path}`])).stdout);
    const migration =
      'prisma/migrations/20261001190000_trivia_authoritative_evidence/migration.sql';
    if (!paths.includes(migration))
      sql.push(await readFile(join(backend, migration), 'utf8'));
    const presenceMigration =
      'prisma/migrations/20261002190000_trivia_presence/migration.sql';
    if (!paths.includes(presenceMigration))
      sql.push(await readFile(join(backend, presenceMigration), 'utf8'));
    const competitiveTriviaMigration =
      'prisma/migrations/20261002230000_trivia_competitive_v1/migration.sql';
    if (!paths.includes(competitiveTriviaMigration))
      sql.push(
        await readFile(join(backend, competitiveTriviaMigration), 'utf8'),
      );
    const migrationPath = join(directory, 'migration.sql');
    await writeFile(migrationPath, sql.join('\n'), 'utf8');
    await docker('cp', migrationPath, `${name}:/tmp/competitive-migration.sql`);
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
      '-f',
      '/tmp/competitive-migration.sql',
    );
    console.log(
      `PostgreSQL 16 local: ${paths.length} committed migrations${paths.includes(migration) ? '' : ' + pending Trivia evidence migration'}${paths.includes(presenceMigration) ? '' : ' + pending Trivia presence migration'}${paths.includes(competitiveTriviaMigration) ? '' : ' + pending Trivia competitive V1 migration'} applied.`,
    );
    const clockDiagnostic = async (phase) => {
      const hostBefore = Date.now();
      const sample = await docker(
        'exec',
        name,
        'psql',
        '-X',
        '-U',
        user,
        '-d',
        'postgres',
        '-Atc',
        'SELECT extract(epoch FROM clock_timestamp()) * 1000',
      );
      const hostAfter = Date.now();
      const database = Number(sample.stdout.trim());
      console.log(
        JSON.stringify({
          phase,
          hostBefore: new Date(hostBefore).toISOString(),
          database: new Date(database).toISOString(),
          hostAfter: new Date(hostAfter).toISOString(),
          databaseMinusHostBoundsMs: [
            database - hostAfter,
            database - hostBefore,
          ],
        }),
      );
    };
    const schemaDiagnostic = async (phase) => {
      const sample = await docker(
        'exec',
        name,
        'psql',
        '-X',
        '-U',
        user,
        '-d',
        'postgres',
        '-Atc',
        `SELECT jsonb_build_object(
          'phase', '${phase}', 'timezone', current_setting('TimeZone'),
          'serverVersion', current_setting('server_version'),
          'institutionHistory', to_regclass('public."HistorialInstitucionCompetitiva"') IS NOT NULL,
          'ledger', to_regclass('public."EventoXpCompetitivo"') IS NOT NULL,
          'balance', to_regclass('public."BalanceCompetitivo"') IS NOT NULL,
          'presence', to_regclass('public."TriviaPresence"') IS NOT NULL,
          'publicTables', (SELECT count(*) FROM pg_tables WHERE schemaname='public'),
          'publicTriggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal))`,
      );
      console.log(sample.stdout.trim());
    };
    await clockDiagnostic('before-tests');
    await schemaDiagnostic('before-tests');
    let result;
    try {
      result = await run(
        process.execPath,
        [
          '--test',
          '--test-concurrency=1',
          'test/competitive-postgres.test.cjs',
          'test/competitive-solo-postgres.test.cjs',
          'test/competitive-trivia-boundary-postgres.test.cjs',
          'test/competitive-trivia-evidence-postgres.test.cjs',
          'test/competitive-trivia-presence-postgres.test.cjs',
          'test/competitive-trivia-xp-postgres.test.cjs',
          'test/competitive-tug-boundary-postgres.test.cjs',
        ],
        180_000,
      );
    } catch (error) {
      // Diagnostic only: preserve failure and inspect this owned instance before cleanup.
      try {
        await clockDiagnostic('after-failure');
        await schemaDiagnostic('after-failure');
        const diagnosis = await docker(
          'exec',
          name,
          'psql',
          '-X',
          '-U',
          user,
          '-d',
          'postgres',
          '-Atc',
          `
          SELECT jsonb_build_object('recentSourcesBeforeFirstCoverage',count(*),
            'minCoverageLeadMs',min(extract(epoch FROM (h.first_at-(s.evidence->>'terminalAt')::timestamptz))*1000),
            'maxCoverageLeadMs',max(extract(epoch FROM (h.first_at-(s.evidence->>'terminalAt')::timestamptz))*1000))
          FROM "CompetitiveTestSource" s JOIN (
            SELECT "usuarioId",min(desde) AS first_at FROM "HistorialInstitucionCompetitiva" GROUP BY "usuarioId"
          ) h ON h."usuarioId"=(s.evidence->'source'->>'participantId')::uuid
          WHERE (s.evidence->>'terminalAt')::timestamptz < h.first_at
            AND (s.evidence->>'terminalAt')::timestamptz BETWEEN clock_timestamp()-interval '10 minutes' AND clock_timestamp()+interval '10 minutes'`,
        );
        console.log(diagnosis.stdout.trim());
      } catch {
        console.error(
          'Failure diagnostics unavailable; original failure retained.',
        );
      }
      throw error;
    }
    await clockDiagnostic('after-tests');
    await schemaDiagnostic('after-tests');
    console.log(
      result.stdout
        .replaceAll(url, '[temporary DB]')
        .replaceAll(password, '[redacted]'),
    );
    if (result.stderr)
      console.error(
        result.stderr
          .replaceAll(url, '[temporary DB]')
          .replaceAll(password, '[redacted]'),
      );
  } finally {
    if (created) {
      const labels = JSON.parse(
        (
          await run('docker', [
            'inspect',
            '--format',
            '{{json .Config.Labels}}',
            name,
          ])
        ).stdout,
      );
      if (labels[purpose] !== nonce)
        throw new Error('Container ownership mismatch; refusing removal.');
      await run('docker', ['rm', '--force', '--volumes', name]);
    }
    if (
      dirname(directory) !== tempRoot ||
      !basename(directory).startsWith('saberplus-competitive-') ||
      (await realpath(directory)) !== directory
    )
      throw new Error('Temporary directory ownership mismatch.');
    await rm(directory, { recursive: true, force: false });
    console.log(
      'Owned temporary PostgreSQL removed. Existing databases untouched.',
    );
  }
}
if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
