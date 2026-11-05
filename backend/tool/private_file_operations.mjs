// Technical local-only CLI. No dotenv, arbitrary storage path or remote database.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ownedOperationMarker } from './editorial_file_operations.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

export function parsePrivateOperation(args) {
  const [command, ownerFile, actor, id] = args;
  if (args.length !== 4 || !['backup', 'restore'].includes(command) ||
      typeof ownerFile !== 'string' || !ownerFile || !uuid.test(actor ?? '') || !uuid.test(id ?? ''))
    throw new Error('Invalid private local operation');
  return { command, ownerFile, actor, id };
}

export async function runPrivateOperation(args) {
  const input = parsePrivateOperation(args);
  const owner = await ownedOperationMarker(input.ownerFile);
  const safe = /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => safe.test(key)));
  const docker = (...parts) => execFileSync('docker', parts, {
    env, encoding: 'utf8', windowsHide: true, timeout: 15000,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const context = docker('context', 'show');
  const endpoint = docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}');
  if (!endpoint.startsWith('npipe:////./pipe/') && !endpoint.startsWith('unix:///'))
    throw new Error('Local Docker required');
  const labels = JSON.parse(docker('--context', context, 'inspect', '--format', '{{json .Config.Labels}}', owner.container));
  if (labels?.[owner.marker.purpose] !== owner.marker.nonce) throw new Error('Ownership mismatch');
  // Explicit local provider: remote provider variables and all inherited secrets are ignored.
  for (const key of Object.keys(process.env)) if (!safe.test(key)) delete process.env[key];
  Object.assign(process.env, env, {
    NODE_ENV: 'test', DATABASE_URL: owner.marker.url, DIRECT_URL: owner.marker.url,
    PRIVATE_FILES_LOCAL_ENABLED: 'true', PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED: 'true',
  });
  const { PrismaService } = require('./dist/prisma/prisma.service');
  const { PrivateLocalFileStore } = require('./dist/private-files/private-local-file.store');
  const { LocalPrivateBackupVault } = require('./dist/private-files/private-backup-vault');
  const { PrivateFileRuntime } = require('./dist/private-files/private-file-runtime');
  const { PrivateFileRecoveryService } = require('./dist/private-files/private-file-recovery.service');
  const isRankingFixture = owner.marker.purpose === 'saberplus-competitive-disposable-v1';
  const source = isRankingFixture ? join(owner.directory, '.tmp', 'private-files') : join(owner.root, 'private-fixtures');
  const vaultRoot = isRankingFixture ? join(owner.directory, '.tmp', 'private-backup-vault') : join(owner.directory, 'private-backup-vault');
  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    const service = new PrivateFileRecoveryService(prisma, new PrivateLocalFileStore(source),
      new LocalPrivateBackupVault(vaultRoot), new PrivateFileRuntime());
    return await service[input.command](input.actor, input.id);
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runPrivateOperation(process.argv.slice(2)).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(JSON.stringify({ phase: 'private-operation-denied', type: error?.constructor?.name, status: error?.status ?? null }));
    process.exitCode = 1;
  });
}
