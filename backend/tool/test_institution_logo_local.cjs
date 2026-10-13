// Solo la sesión temporal propia. Ejecutar después del guion C1 en sesión nueva.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, basename, join } = require('node:path');
const sharp = require('sharp');
let db, fixture, image, owner, reader, student;
const base = 'http://127.0.0.1:43187';
const auth = token => ({ Authorization: `Bearer ${token}` });
async function request(path, token, body, method = 'GET') {
  return fetch(base + path, { method, headers: { ...auth(token), ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: body instanceof FormData ? body : JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
}
async function current() {
  const r = await request('/instituciones/me/perfil', owner);
  assert.equal(r.status, 200);
  const p = await r.json();
  assert.equal(p.id, fixture.institutionId);
  return p;
}
async function upload(revision, bytes = image, token = owner) {
  const form = new FormData();
  form.set('revision', String(revision));
  form.set('logo', new Blob([bytes], { type: 'image/png' }), 'logo.png');
  return request('/instituciones/me/logo', token, form, 'POST');
}
before(async () => {
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, base);
  fixture = JSON.parse(await readFile(join(directory, 'profile-fixtures.json'), 'utf8'));
  assert.equal(fixture.ownerEmail, 'teacher@example.invalid');
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  async function login(email) {
    const r = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: email, contrasena: config.AUTH_E2E_PASSWORD }), signal: AbortSignal.timeout(15000) });
    assert.equal(r.status, 201);
    const data = await r.json();
    assert.equal(typeof data.accessToken, 'string');
    return data.accessToken;
  }
  owner = await login(fixture.ownerEmail); reader = await login(fixture.readerEmail); student = await login(fixture.studentEmail);
  await current();
  image = await sharp({ create: { width: 128, height: 96, channels: 3, background: '#0066ff' } }).png().toBuffer();
});
after(async () => db?.$disconnect());

test('C2 tablas privadas: RLS activo, anon/authenticated sin lectura directa', async () => {
  const rows = await db.$queryRawUnsafe(`SELECT relrowsecurity AS rls,
    has_table_privilege('anon', '"InstitucionLogo"', 'SELECT') AS anon,
    has_table_privilege('authenticated', '"InstitucionLogo"', 'SELECT') AS authenticated
    FROM pg_class WHERE oid = '"InstitucionLogo"'::regclass`);
  assert.deepEqual(rows, [{ rls: true, anon: false, authenticated: false }]);
});
test('C2 propietario carga, bytes normalizados persisten y estudiante descarga', async () => {
  const p = await current();
  const r = await upload(p.revision); assert.equal(r.status, 201);
  const saved = await r.json();
  assert.equal(saved.revision, p.revision + 1);
  const stored = await db.institucionLogo.findUniqueOrThrow({ where: { institucionId: fixture.institutionId } });
  const meta = await sharp(stored.contenido).metadata();
  assert.equal(meta.width, 512); assert.equal(meta.height, 512); assert.equal(meta.format, 'webp');
  assert.ok(stored.contenido.length <= 204800);
  const download = await request(saved.logoUrl, student); assert.equal(download.status, 200);
  assert.equal(download.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), stored.contenido);
  const detail = await request(`/instituciones/directorio/${fixture.institutionId}`, student);
  assert.equal((await detail.json()).logoUrl, saved.logoUrl);
});
test('C2 lector y estudiante no cambian logo; archivo falso no escribe', async () => {
  const p = await current();
  assert.equal((await upload(p.revision, image, reader)).status, 403);
  assert.equal((await upload(p.revision, image, student)).status, 403);
  assert.equal((await upload(p.revision, Buffer.from('<svg/>'))).status, 400);
  assert.equal((await current()).revision, p.revision);
});
test('C2 dos cargas con igual revisión: solo una se guarda y audita', async () => {
  const p = await current();
  const count = () => db.auditoriaInstitucion.count({ where: { institucionId: fixture.institutionId, accion: 'LOGO_ACTUALIZADO' } });
  const prior = await count();
  const responses = await Promise.all([upload(p.revision), upload(p.revision)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(await count(), prior + 1);
  assert.equal((await current()).revision, p.revision + 1);
  assert.equal((await request(p.logoUrl, student)).status, 404);
});
test('C2 suspender revoca descarga y eliminación retira bytes', async () => {
  const p = await current();
  await db.institucion.update({ where: { id: fixture.institutionId }, data: { estadoVerificacion: 'SUSPENDIDA' } });
  try { assert.equal((await request(p.logoUrl, student)).status, 404); }
  finally { await db.institucion.update({ where: { id: fixture.institutionId }, data: { estadoVerificacion: 'APROBADA' } }); }
  const r = await request('/instituciones/me/logo', owner, { revision: p.revision }, 'DELETE');
  assert.equal(r.status, 200);
  assert.equal(await db.institucionLogo.count({ where: { institucionId: fixture.institutionId } }), 0);
  assert.equal((await current()).logoUrl, null);
  assert.equal((await request(p.logoUrl, student)).status, 404);
});
test('C2 fallo de auditoría revierte también imagen y revisión en PostgreSQL', async () => {
  const p = await current();
  const { ArchivoAlmacenamientoService } = require('../dist/institucion/archivo-almacenamiento.service');
  const wrapped = new Proxy(db, { get(target, prop) {
    if (prop === '$transaction') return callback => target.$transaction(tx => callback(new Proxy(tx, { get(inner, key) {
      if (key === 'auditoriaInstitucion') return { create: async () => { throw new Error('forced-local-audit-failure'); } };
      return inner[key];
    } })));
    return target[prop];
  } });
  const user = await db.usuario.findUniqueOrThrow({ where: { correo: fixture.ownerEmail } });
  await assert.rejects(new ArchivoAlmacenamientoService(wrapped).subirLogoDeMiInstitucion(user.id, { buffer: image }, p.revision), /forced-local-audit-failure/);
  assert.equal((await current()).revision, p.revision);
  assert.equal(await db.institucionLogo.count({ where: { institucionId: fixture.institutionId } }), 0);
});
