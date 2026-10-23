// C5-A: PostgreSQL propio y desechable. No lee .env ni acepta conexiones externas.
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  mkdtemp,
  realpath,
  readFile,
  writeFile,
  mkdir,
  rm,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const purpose = 'saberplus-c5-disposable-v1';
const backend = fileURLToPath(new URL('../', import.meta.url));
const execute = promisify(execFile);

export function validateEditorialFilesDatabase(value, marker) {
  const url = new URL(value);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    url.pathname !== '/postgres' ||
    !/^sp_test_[a-f0-9]{16}$/.test(url.username) ||
    !url.password ||
    Number(url.port) < 1024 ||
    Number(url.port) > 65535 ||
    url.hash ||
    marker.purpose !== purpose ||
    marker.url !== url.href ||
    !/^[a-f0-9]{16}$/.test(marker.nonce) ||
    url.username !== `sp_test_${marker.nonce}` ||
    [...url.searchParams.keys()].some(
      (key) => !['connection_limit', 'pool_timeout'].includes(key),
    )
  )
    throw new Error('Solo se permite el PostgreSQL temporal propio de C5.');
}

async function main() {
  if (process.argv.length !== 2)
    throw new Error('No se aceptan argumentos ni URL externa.');
  const root = await realpath(tmpdir());
  const directory = await realpath(
    await mkdtemp(join(root, 'saberplus-c5-pg-')),
  );
  const nonce = randomBytes(8).toString('hex');
  const password = randomBytes(24).toString('hex');
  const name = `saberplus-c5-pg-${nonce}`;
  const user = `sp_test_${nonce}`;
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
    EDITORIAL_FILES_LOCAL_ENABLED: 'true',
    EDITORIAL_PUBLICATION_ENABLED: 'true',
  });
  let context,
    url = '',
    created = false,
    stage = 'docker';
  const redact = (value) =>
    String(value)
      .replaceAll(password, '[oculto]')
      .replaceAll(url || 'unused-url', '[base temporal]');
  const run = (command, args, cwd = backend, timeout = 120000) =>
    execute(command, args, {
      cwd,
      env,
      timeout,
      windowsHide: true,
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
      throw new Error('Docker debe ser local.');
    if (
      (await docker('info', '--format', '{{.OSType}}')).stdout.trim() !==
      'linux'
    )
      throw new Error('Se requiere Docker Linux.');
    await docker(
      'run',
      '-d',
      '--name',
      name,
      '--label',
      `${purpose}=${nonce}`,
      '--memory',
      '512m',
      '--cpus',
      '1',
      '--pids-limit',
      '128',
      '-p',
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql/data:rw,size=256m',
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
      throw new Error('Se requiere loopback.');
    url = `postgresql://${user}:${password}@${binding}/postgres?connection_limit=12&pool_timeout=30`;
    const marker = { purpose, nonce, url };
    validateEditorialFilesDatabase(url, marker);
    const owner = join(directory, 'owner.json');
    await writeFile(owner, JSON.stringify(marker), { mode: 0o600 });
    Object.assign(env, {
      DATABASE_URL: url,
      DIRECT_URL: url,
      EDITORIAL_FILES_TEST_OWNER: owner,
    });
    const qaRoot = join(backend, '.tmp', 'c5b-qa');
    await mkdir(qaRoot, { recursive: true });
    env.EDITORIAL_FILES_QA_DIR = await mkdtemp(join(qaRoot, 'run-'));
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        await docker('exec', name, 'pg_isready', '-U', user);
        ready = true;
        break;
      } catch {
        await new Promise((ok) => setTimeout(ok, 200));
      }
    }
    if (!ready) throw new Error('PostgreSQL temporal no disponible.');
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
    if (!committed.length)
      throw new Error('Cadena versionada de migraciones requerida.');
    const pending = [
      'prisma/migrations/20261020120000_editorial_files_base/migration.sql',
      'prisma/migrations/20261020150000_editorial_image_links/migration.sql',
      'prisma/migrations/20261021180000_editorial_option_image_links/migration.sql',
      'prisma/migrations/20261022203000_tug_local_timeout_scope/migration.sql',
      'prisma/migrations/20261022213000_tug_option_image_snapshot/migration.sql',
    ];
    const paths = [...new Set([...committed, ...pending])].sort();
    for (const path of paths) {
      const destination = join(directory, path.replace(/^prisma\//, ''));
      await mkdir(dirname(destination), { recursive: true });
      const content = pending.includes(path)
        ? await readFile(join(backend, path), 'utf8')
        : (await run('git', ['show', `HEAD:backend/${path}`])).stdout;
      await writeFile(destination, content);
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
        phase: 'c5-owned-postgres-ready',
        migrations: paths.length,
        postgres: 16,
        loopback: true,
        tmpfs: true,
        memoryLimitMiB: 512,
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
          'test/editorial-files-postgres.test.cjs',
        ],
        backend,
        240000,
      );
      process.stdout.write(redact(result.stdout));
      process.stderr.write(redact(result.stderr));
    } catch (error) {
      process.stdout.write(redact(error.stdout || ''));
      process.stderr.write(redact(error.stderr || ''));
      throw new Error('Falló el ensayo integrado de C5.');
    }
  } catch (error) {
    if (stage !== 'tests')
      console.error(
        redact(error.stderr || error.stdout || error.message).slice(0, 8000),
      );
    console.error(
      JSON.stringify({
        phase: 'c5-validation-failed',
        stage,
        privateDetailsOmitted: true,
      }),
    );
    process.exitCode = 1;
  } finally {
    if (created) {
      const labels = JSON.parse(
        (await docker('inspect', '--format', '{{json .Config.Labels}}', name))
          .stdout,
      );
      if (labels[purpose] !== nonce)
        throw new Error('No coincide el propietario; contenedor conservado.');
      await docker('rm', '-f', '-v', name);
    }
    if (
      dirname(directory) !== root ||
      !basename(directory).startsWith('saberplus-c5-pg-') ||
      (await realpath(directory)) !== directory
    )
      throw new Error('Destino temporal inesperado; directorio conservado.');
    await rm(directory, { recursive: true });
    console.log(JSON.stringify({ phase: 'c5-owned-resources-removed' }));
  }
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main().catch(() => {
    console.error('No se pudo completar C5; detalles privados omitidos.');
    process.exitCode = 1;
  });
}
