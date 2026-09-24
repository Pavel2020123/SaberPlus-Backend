import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  writeFile,
  readFile,
  realpath,
  rm,
  access,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';

const execute = promisify(execFile);
const backend = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(backend, '..');

export function validateOwnedConnection(urlValue, marker) {
  const url = new URL(urlValue);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/postgres' ||
    !/^sp_test_[a-f0-9]{16}$/.test(url.username) ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    !url.password ||
    url.hash ||
    [...url.searchParams.keys()].some(
      (key) => !['connection_limit', 'pool_timeout'].includes(key),
    ) ||
    url.href !== marker.url ||
    marker.purpose !== 'saberplus-editorial-disposable-v1'
  )
    throw new Error(
      'Solo se permite la instancia temporal creada por este ejecutor.',
    );
  return url;
}

async function freePort() {
  const server = createServer();
  await new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(0, '127.0.0.1', ok);
  });
  const port = server.address().port;
  await new Promise((ok) => server.close(ok));
  return port;
}

async function main() {
  const teacherPriorities = process.argv.includes('--teacher-priorities');
  const studyTime = process.argv.includes('--study-time');
  const institutionApproval = process.argv.includes('--institution-approval');
  const summit = process.argv.includes('--summit');
  const starRescue = process.argv.includes('--star-rescue');
  const knowledgeShield = process.argv.includes('--knowledge-shield');
  if (
    process.argv
      .slice(2)
      .some(
        (arg) =>
          ![
            '--teacher-priorities',
            '--study-time',
            '--institution-approval',
            '--summit',
            '--star-rescue',
            '--knowledge-shield',
          ].includes(arg),
      ) ||
    [teacherPriorities, studyTime, institutionApproval, summit, starRescue, knowledgeShield].filter(Boolean).length >
      1
  )
    throw new Error('Opción de pruebas no reconocida.');
  // No .env files, external database URLs or existing PostgreSQL services are used.
  const bin =
    process.env.EDITORIAL_PG_BIN ||
    (process.platform === 'win32'
      ? 'C:/Program Files/PostgreSQL/16/bin'
      : '/usr/lib/postgresql/16/bin');
  const binary = (name) =>
    join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  for (const name of ['initdb', 'pg_ctl', 'psql']) await access(binary(name));
  const temporaryRoot = await realpath(tmpdir());
  const directory = await mkdtemp(
    join(temporaryRoot, 'saberplus-editorial-pg-'),
  );
  const resolved = await realpath(directory);
  const nonce = randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  const port = await freePort();
  const user = `sp_test_${nonce}`;
  const data = join(resolved, 'data');
  const url = `postgresql://${user}:${password}@127.0.0.1:${port}/postgres?connection_limit=6&pool_timeout=5`;
  const marker = { purpose: 'saberplus-editorial-disposable-v1', nonce, url };
  const markerPath = join(resolved, 'owner.json');
  await writeFile(markerPath, JSON.stringify(marker), { mode: 0o600 });
  const passwordFile = join(resolved, 'password');
  await writeFile(passwordFile, password, { mode: 0o600 });
  const env = {
    ...process.env,
    PGHOST: '127.0.0.1',
    PGPORT: String(port),
    PGUSER: user,
    PGPASSWORD: password,
    PGDATABASE: 'postgres',
    PGCONNECT_TIMEOUT: '5',
    PGSSLMODE: 'disable',
    DATABASE_URL: url,
    DIRECT_URL: url,
    EDITORIAL_TEST_OWNER: markerPath,
    EDITORIAL_TEST_URL: url,
  };
  for (const key of [
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGHOSTADDR',
    'PGOPTIONS',
    'PGDATA',
    'PGPASSFILE',
  ])
    delete env[key];
  const run = async (command, args, timeout = 60000) => {
    try {
      return await execute(command, args, {
        cwd: backend,
        env,
        timeout,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
    } catch (error) {
      // Only ephemeral test credentials exist here; still do not print them.
      throw new Error(
        `${basename(command)} falló: ${error.stderr || error.stdout || error.message}`
          .replaceAll(url, '[instancia temporal]')
          .replaceAll(password, '[oculto]'),
      );
    }
  };
  let initialized = false;
  try {
    validateOwnedConnection(url, marker);
    console.log('Preparando PostgreSQL temporal en loopback (sin Supabase).');
    await run(binary('initdb'), [
      '-D',
      data,
      '-U',
      user,
      '--pwfile',
      passwordFile,
      '--auth=scram-sha-256',
      '--encoding=UTF8',
      '--locale=C',
    ]);
    initialized = true;
    await run(binary('pg_ctl'), [
      'start',
      '-D',
      data,
      '-l',
      join(resolved, 'postgres.log'),
      '-w',
      '-t',
      '30',
      '-o',
      `-h 127.0.0.1 -p ${port}`,
    ]);
    // Use committed migration SQL only: never apply a pending user migration.
    const listing = await run('git', [
      '-C',
      repository,
      'ls-tree',
      '-r',
      '--name-only',
      'HEAD',
      '--',
      'backend/prisma/migrations',
    ]);
    const migrations = listing.stdout
      .split(/\r?\n/)
      .filter((f) =>
        /^backend\/prisma\/migrations\/[a-zA-Z0-9_]+\/migration\.sql$/.test(f),
      )
      .sort();
    if (!migrations.length)
      throw new Error('No se encontraron migraciones versionadas.');
    const sql = [];
    if (summit || starRescue || knowledgeShield) sql.push('CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS; CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO anon, authenticated;');
    const approvalMigration =
      'backend/prisma/migrations/20260917130000_institution_approval/migration.sql';
    const approvalPrivacyMigration =
      'backend/prisma/migrations/20260918090000_institution_approval_privacy/migration.sql';
    // Solo en este PostgreSQL desechable: simular permisos públicos anteriores.
    const privacyFixture = `CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
      CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated;
      GRANT ALL ON TABLE "SolicitudAltaInstitucion" TO anon, authenticated, PUBLIC;`;
    const legacyFixture = `INSERT INTO "Institucion" ("id", "nombre", "codigoUnico") VALUES ('11111111-1111-4111-8111-111111111111', '  Colegio   Águila legado  ', 'LEGADO-P4C');`;
    for (const file of migrations) {
      if (institutionApproval && file === approvalPrivacyMigration)
        sql.push(privacyFixture);
      if (institutionApproval && file === approvalMigration)
        sql.push(legacyFixture);
      sql.push(
        `\n-- ${file}\n${(await run('git', ['-C', repository, 'show', `HEAD:${file}`])).stdout}\n`,
      );
    }
    // P3-A permite únicamente SU migración pendiente en la base desechable.
    // Nunca descubrir/aplicar otras migraciones locales (p. ej. Guardián).
    const priorityMigration =
      'backend/prisma/migrations/20260913090000_teacher_priorities/migration.sql';
    if (teacherPriorities && !migrations.includes(priorityMigration)) {
      sql.push(await readFile(join(repository, priorityMigration), 'utf8'));
    }
    // Solo la migración específica P4-A; no aplicar otras pendientes del usuario.
    const studyMigration =
      'backend/prisma/migrations/20260914090000_study_time_pomodoros/migration.sql';
    if (studyTime && !migrations.includes(studyMigration)) {
      sql.push(await readFile(join(repository, studyMigration), 'utf8'));
    }
    const migrationFile = join(resolved, 'migrations.sql');
    const shieldMigration = 'backend/prisma/migrations/20260924160000_knowledge_shield/migration.sql';
    if (knowledgeShield && !migrations.includes(shieldMigration)) {
      sql.push(await readFile(join(repository, shieldMigration), 'utf8'));
      console.log('Incluida únicamente la migración local JN-4B de Escudo.');
    }
    const starRescueMigration = 'backend/prisma/migrations/20260923160000_star_rescue/migration.sql';
    if (starRescue && !migrations.includes(starRescueMigration)) {
      sql.push(await readFile(join(repository, starRescueMigration), 'utf8'));
      console.log('Incluida únicamente la migración local JN-2B de Rescate de estrellas.');
    }
    const summitMigration = 'backend/prisma/migrations/20260918140000_summit_challenge/migration.sql';
    if (summit && !migrations.includes(summitMigration)) {
      sql.push(await readFile(join(repository, summitMigration), 'utf8'));
    }
    if (institutionApproval && !migrations.includes(approvalMigration)) {
      sql.push(legacyFixture);
      sql.push(await readFile(join(repository, approvalMigration), 'utf8'));
    }
    if (institutionApproval && !migrations.includes(approvalPrivacyMigration)) {
      sql.push(privacyFixture);
      sql.push(await readFile(join(repository, approvalPrivacyMigration), 'utf8'));
    }
    await writeFile(migrationFile, sql.join('\n'), 'utf8');
    await run(binary('psql'), [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      migrationFile,
    ]);
    console.log(
      `SQL de ${migrations.length} migraciones versionadas${teacherPriorities && !migrations.includes(priorityMigration) ? ' y la migración local P3-A' : ''}${studyTime && !migrations.includes(studyMigration) ? ' y la migración local P4-A' : ''}${institutionApproval && !migrations.includes(approvalMigration) ? ' y la migración local P4-C' : ''} aplicado solo a la instancia desechable.`,
    );
    const result = await run(
      process.execPath,
      [
        '--test',
        '--test-concurrency=1',
        knowledgeShield ? 'test/knowledge-shield-postgres.test.cjs' : starRescue ? 'test/star-rescue-postgres.test.cjs' : summit ? 'test/summit-postgres.test.cjs' : institutionApproval
          ? 'test/institution-approval-postgres.test.cjs'
          : studyTime
            ? 'test/study-time-postgres.test.cjs'
            : teacherPriorities
              ? 'test/teacher-priorities-postgres.test.cjs'
              : 'test/editorial-postgres.test.cjs',
      ],
      180000,
    );
    console.log(
      result.stdout
        .replaceAll(url, '[instancia temporal]')
        .replaceAll(password, '[oculto]'),
    );
    if (result.stderr)
      console.error(
        result.stderr
          .replaceAll(url, '[instancia temporal]')
          .replaceAll(password, '[oculto]'),
      );
  } finally {
    // Only clean the exact mkdtemp directory, after verifying ownership and shutdown.
    const owner = JSON.parse(await readFile(markerPath, 'utf8'));
    if (
      dirname(resolved) !== temporaryRoot ||
      !basename(resolved).startsWith('saberplus-editorial-pg-') ||
      owner.nonce !== nonce ||
      (await realpath(directory)) !== resolved
    )
      throw new Error(
        'No se limpió el directorio: no se pudo verificar su propiedad.',
      );
    if (initialized) {
      try {
        await run(binary('pg_ctl'), [
          'stop',
          '-D',
          data,
          '-m',
          'fast',
          '-w',
          '-t',
          '30',
        ]);
      } catch {
        // Never remove data when shutdown cannot be confirmed.
        console.error(
          `Se conserva la instancia temporal para revisión: ${resolved}`,
        );
        throw new Error(
          'No se pudo confirmar el cierre del PostgreSQL temporal.',
        );
      }
    }
    await rm(resolved, { recursive: true, force: false });
    console.log(
      'Instancia temporal detenida y eliminada; bases existentes intactas.',
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
