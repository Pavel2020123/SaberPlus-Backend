// Own disposable PostgreSQL only; no .env, caller URL, existing DB or remote host.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { verifyLicenseService } from './lic1_service_assertions.mjs';
import { verifyLicenseHttp } from './lic1_http_assertions.mjs';
import { verifyManagedAccounts } from './lic2_service_assertions.mjs';
import { verifyManagedPriorities } from './lic3_priorities_assertions.mjs';
import { verifyPersonalReturn } from './lic4_lifecycle_assertions.mjs';
import { verifySuppressionReview } from './lic4_suppression_assertions.mjs';

if (process.argv.length !== 2) throw new Error('No arguments accepted.');
const cwd = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../package.json', import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i.test(k)));
const run = promisify(execFile);
const execute = (command, args) => run(command, args, { cwd, env, windowsHide: true, timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
const nonce = randomBytes(8).toString('hex');
const password = randomBytes(24).toString('hex');
const name = `saberplus-lic1-${nonce}`;
const user = `sp_test_${nonce}`;
const label = 'saberplus-lic1-disposable-v1';
let created = false;
let context;
let db;
const docker = (...args) => execute('docker', ['--context', context, ...args]);
const sql = input => new Promise((resolve, reject) => {
  const child = spawn('docker', ['--context', context, 'exec', '-i', name,
    'psql', '-X', '-h', '127.0.0.1', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { cwd, env, windowsHide: true });
  let output = '';
  const timer = setTimeout(() => { child.kill(); reject(new Error('SQL timeout')); }, 120000);
  child.stdout.on('data', b => { output += b; });
  child.stderr.on('data', b => { output += b; });
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output)); });
  child.stdin.on('error', reject);
  child.stdin.end(input);
});
try {
  context = (await execute('docker', ['context', 'show'])).stdout.trim();
  const endpoint = (await docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}')).stdout.trim();
  if (!endpoint.startsWith('npipe:////./pipe/') && !endpoint.startsWith('unix:///')) throw new Error('Local Docker required.');
  await docker('run', '-d', '--name', name, '--label', `${label}=${nonce}`,
    '--tmpfs', '/var/lib/postgresql/data:rw', '-p', '127.0.0.1::5432', '-e', `POSTGRES_USER=${user}`,
    '-e', `POSTGRES_PASSWORD=${password}`, 'postgres:16');
  created = true;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await docker('exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', user); ready = true; break; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  if (!ready) throw new Error('PostgreSQL not ready.');
  await sql('CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;');
  const migrations = (await execute('git', ['ls-tree', '-r', '--name-only', 'HEAD', '--', 'prisma/migrations'])).stdout
    .split(/\r?\n/).filter(p => /^prisma\/migrations\/\w+\/migration\.sql$/.test(p)).sort();
  if (!migrations.length) throw new Error('Committed migration history required.');
  const history = [];
  for (const path of migrations) history.push((await execute('git', ['show', `HEAD:backend/${path}`])).stdout);
  await sql(history.join('\n\n'));
  const pending = 'prisma/migrations/20261102180000_institution_license_contracts/migration.sql';
  if (migrations.includes(pending)) throw new Error('Update runner after committing LIC-1 migration.');
  await sql(await readFile(new URL(`../${pending}`, import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261102200000_institution_personal_balance/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261102220000_managed_account_identity/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261102223000_institution_alias_suffix/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261102230000_managed_temporary_single_login/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261103170000_account_lifecycle_review/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('../prisma/migrations/20261103180000_reviewed_privacy_scope/migration.sql', import.meta.url), 'utf8'));
  await sql(await readFile(new URL('./lic1_storage_assertions.sql', import.meta.url), 'utf8'));
  console.log(JSON.stringify({ phase: 'lic1-storage-passed', committedMigrations: migrations.length,
    pendingMigrations: 7, localOnly: true, noAccessEnforcementProven: true }));
  const binding = (await docker('port', name, '5432/tcp')).stdout.trim();
  if (!/^127\.0\.0\.1:\d+$/.test(binding)) throw new Error('Loopback DB required.');
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url: `postgresql://${user}:${password}@${binding}/postgres?connection_limit=12&pool_timeout=30` } } });
  const { LicenciaInstitucionalService } = require('./dist/institucion/licencia-institucional.service.js');
  const { LicenciaAccesoService } = require('./dist/institucion/licencia-acceso.service.js');
  await verifyLicenseService(db, new LicenciaInstitucionalService(db), new LicenciaAccesoService(db));
  const { ManagedAccountService } = require('./dist/institucion/managed-account.service.js');
  await verifyManagedAccounts(db, new ManagedAccountService(db), new LicenciaInstitucionalService(db));
  const { TeacherPrioritiesService } = require('./dist/institucion/teacher-priorities.service.js');
  const { InstitucionAccesoService } = require('./dist/institucion/institucion-acceso.service.js');
  const { SaldoPersonalInstitucionalService } = require('./dist/institucion/saldo-personal-institucional.service.js');
  const balanceService = new SaldoPersonalInstitucionalService(db);
  const balance = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { reanudadoEn: null } });
  await balanceService.reanudarSiPersonal(balance.usuarioId);
  if ((await db.saldoPersonalInstitucional.findUniqueOrThrow({ where: { id: balance.id } })).reanudadoEn !== null) throw new Error('Institutional balance resumed before personal return');
  // Synthetic state preparation, not a new unlink/progress-transfer endpoint.
  await db.asignacionLicenciaInstitucional.updateMany({ where: { usuarioId: balance.usuarioId }, data: { estado: 'RETIRADA', retiradaEn: new Date() } });
  await db.usuario.update({ where: { id: balance.usuarioId }, data: { institucionId: null } });
  await Promise.all([0, 1, 2].map(() => balanceService.reanudarSiPersonal(balance.usuarioId)));
  const resumed = await db.saldoPersonalInstitucional.findUniqueOrThrow({ where: { id: balance.id } });
  if (!resumed.reanudadoEn || resumed.venceReanudadoEn.getTime() - resumed.reanudadoEn.getTime() !== Number(balance.milisegundos)) throw new Error('Personal balance not restored exactly once');
  const beforeReplay = resumed.venceReanudadoEn.getTime();
  await balanceService.reanudarSiPersonal(balance.usuarioId);
  if ((await db.usuario.findUniqueOrThrow({ where: { id: balance.usuarioId } })).fechaVencimientoPlan.getTime() !== beforeReplay) throw new Error('Balance replay extended expiry');
  const originalAssignment = await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { id: balance.asignacionId } });
  const syntheticAdmin = await db.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });
  const licenseService = new LicenciaInstitucionalService(db);
  const { SupresionCuentaService } = require('./dist/institucion/supresion-cuenta.service.js');
  await verifySuppressionReview(db, new SupresionCuentaService(db));
  await verifyPersonalReturn(db, licenseService, new LicenciaAccesoService(db));
  await licenseService.asignar(syntheticAdmin.id, originalAssignment.institucionId, randomUUID(), balance.usuarioId, 'ESTUDIANTE');
  await licenseService.aceptar(balance.usuarioId, originalAssignment.institucionId, randomUUID());
  const nextEpisode = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { usuarioId: balance.usuarioId, reanudadoEn: null } });
  if (nextEpisode.id === balance.id || nextEpisode.milisegundos > balance.milisegundos) throw new Error('Relinking duplicated original paid time');
  if (await db.saldoPersonalInstitucional.count({ where: { usuarioId: balance.usuarioId } }) !== 2) throw new Error('Balance episodes not retained');
  console.log(JSON.stringify({ phase: 'lic1-personal-balance-passed', concurrentReturns: 3, localOnly: true }));
  await verifyLicenseHttp(db, { url: `postgresql://${user}:${password}@${binding}/postgres?connection_limit=4&pool_timeout=30`, nonce, env, cwd });
  await verifyManagedPriorities(db, { license: new LicenciaInstitucionalService(db), managed: new ManagedAccountService(db), priorities: new TeacherPrioritiesService(db, new InstitucionAccesoService(db)), access: new LicenciaAccesoService(db) });
} finally {
  await db?.$disconnect();
  if (created) {
    const owned = (await docker('inspect', name, '--format', `{{ index .Config.Labels "${label}" }}`)).stdout.trim();
    if (owned !== nonce) throw new Error('Refusing cleanup: ownership mismatch.');
    await docker('rm', '-f', name);
    console.log(JSON.stringify({ phase: 'lic1-owned-resources-removed' }));
  }
}
