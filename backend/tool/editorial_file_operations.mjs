// Local operator CLI. It cannot attach to a remote/existing unowned database.
import { readFile, writeFile, mkdir, lstat, realpath } from 'node:fs/promises';
import { dirname, basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../package.json', import.meta.url));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

export function parseOperation(args) {
  const [command, ownerFile, actorId, id, confirmation] = args;
  if (!['audit', 'backup', 'restore', 'cleanup'].includes(command) || !ownerFile || !uuid.test(actorId ?? '') ||
    (command === 'audit' ? !(args.length === 3 || (args.length === 4 && uuid.test(id ?? ''))) : !uuid.test(id ?? '')) ||
    (['backup', 'restore'].includes(command) && args.length !== 4) ||
    (command === 'cleanup' && (args.length !== 5 || confirmation !== '--confirm-cleanup'))) throw new Error('Invalid local operation arguments');
  return { command, ownerFile, actorId, id: id?.toLowerCase() };
}

export async function ownedOperationMarker(ownerFile) {
  const path = await realpath(ownerFile), directory = dirname(path);
  if (basename(path) !== 'owner.json' || dirname(directory) !== await realpath(tmpdir()) ||
    !/^saberplus-(?:c5-pg|i2-local)-[a-zA-Z0-9]+$/.test(basename(directory)) ||
    (await lstat(ownerFile)).isSymbolicLink()) throw new Error('Only an owned temporary marker is accepted');
  const stat = await lstat(path);
  if (stat.size > 8192 || !stat.isFile()) throw new Error('Invalid marker');
  const marker = JSON.parse(await readFile(path, 'utf8'));
  if (marker.purpose === 'saberplus-c5-disposable-v1') {
    const { validateEditorialFilesDatabase } = await import('./test_editorial_files_postgres.mjs');
    validateEditorialFilesDatabase(marker.url, marker);
    return { marker, directory, container: `saberplus-c5-pg-${marker.nonce}`, root: join(directory, 'files') };
  }
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  return { marker, directory, container: `saberplus-i2-local-${marker.nonce}`, root: join(directory, '.tmp', 'editorial-files') };
}

export async function runOperation(args) {
  const input = parseOperation(args);
  const owner = await ownedOperationMarker(input.ownerFile);
  const safe = /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => safe.test(key)));
  const docker = (...parts) => execFileSync('docker', parts, { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const context = docker('context', 'show');
  const endpoint = docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}');
  if (!endpoint.startsWith('npipe:////./pipe/') && !endpoint.startsWith('unix:///')) throw new Error('Local Docker required');
  const labels = JSON.parse(docker('--context', context, 'inspect', '--format', '{{json .Config.Labels}}', owner.container));
  if (labels?.[owner.marker.purpose] !== owner.marker.nonce) throw new Error('Ownership mismatch');
  const provider = process.env.EDITORIAL_FILE_PROVIDER ?? 'local';
  const storage = { url: process.env.EDITORIAL_SUPABASE_STORAGE_URL ?? '', bucket: process.env.EDITORIAL_SUPABASE_BUCKET ?? '', serviceKey: process.env.EDITORIAL_SUPABASE_SERVICE_KEY ?? '' };
  if (provider === 'supabase') {
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(storage.url) || !/^editorial-[a-f0-9]{16}$/.test(storage.bucket)) throw new Error('Only owned loopback Storage is accepted');
    const storageNonce = storage.bucket.slice('editorial-'.length);
    const storageLabels = JSON.parse(docker('--context', context, 'inspect', '--format', '{{json .Config.Labels}}', `saberplus-c5-storage-${storageNonce}`));
    if (storageLabels?.['saberplus-c5-storage-disposable-v1'] !== storageNonce) throw new Error('Storage ownership mismatch');
  } else if (provider !== 'local') throw new Error('Unknown provider');
  for (const key of Object.keys(process.env)) if (!safe.test(key)) delete process.env[key];
  Object.assign(process.env, env, { NODE_ENV: 'test', DATABASE_URL: owner.marker.url, DIRECT_URL: owner.marker.url,
    JWT_SECRET: randomBytes(32).toString('hex'), EDITORIAL_FILES_LOCAL_ENABLED: 'true', EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED: 'true',
    EDITORIAL_FILE_PROVIDER: provider, EDITORIAL_SUPABASE_STORAGE_URL: storage.url, EDITORIAL_SUPABASE_BUCKET: storage.bucket, EDITORIAL_SUPABASE_SERVICE_KEY: storage.serviceKey,
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1' });
  const { Test } = require('@nestjs/testing');
  const { AppModule } = require('./dist/app.module');
  const { EDITORIAL_FILE_ROOT } = require('./dist/editorial-files/editorial-file.store');
  const { EditorialFileRecoveryService } = require('./dist/editorial-files/editorial-file-recovery.service');
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(EDITORIAL_FILE_ROOT).useValue(owner.root).compile();
  try {
    await module.init();
    const service = module.get(EditorialFileRecoveryService);
    if (input.command === 'audit') return await service.audit(input.actorId, input.id);
    if (input.command === 'cleanup') return await service.cleanupRetired(input.actorId, input.id);
    const directory = join(owner.directory, 'editorial-backups');
    await mkdir(directory, { mode: 0o700 }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
    if ((await lstat(directory)).isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Unexpected backup directory');
    const target = join(directory, `${input.id}.json`);
    if (input.command === 'backup') {
      const backup = await service.backup(input.actorId, input.id);
      await writeFile(target, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
      return { id: input.id, bytes: backup.bytes, backupCreated: true };
    }
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 3 * 1024 * 1024) throw new Error('Invalid backup file');
    return await service.restore(input.actorId, input.id, JSON.parse(await readFile(target, 'utf8')));
  } finally { await module.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runOperation(process.argv.slice(2)).then((result) => console.log(JSON.stringify(result))).catch((error) => {
    console.error(JSON.stringify({ phase: 'editorial-operation-denied', type: error?.constructor?.name, status: error?.status ?? null }));
    process.exitCode = 1;
  });
}
