// Real HTTP/PostgreSQL tests against the owned disposable supervisor only.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, realpath, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, dirname, basename } = require('node:path');
const { randomUUID } = require('node:crypto');
let db, config, institution, owner, member, outsider, tokens;
const endpoint = 'http://127.0.0.1:43187';
const profilePath = '/instituciones/me/perfil';
async function http(path, token, body, method = body === undefined ? 'GET' : 'PATCH') {
  const response = await fetch(endpoint + path, {
    method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
}
async function login(email) {
  const result = await http('/auth/login', null, { correo: email, contrasena: config.AUTH_E2E_PASSWORD }, 'POST');
  assert.equal(result.status, 201, 'Fixture login must succeed');
  assert.equal(typeof result.data.accessToken, 'string', 'Fixture access token missing');
  return result.data.accessToken;
}
async function account(name, extra = {}) {
  return db.usuario.create({ data: { nombre: name, correo: `${randomUUID()}@example.invalid`,
    contrasenaHash: owner.contrasenaHash, rol: 'PROFESOR', correoVerificado: true,
    tutorialProfesorVersion: 1, ...extra } });
}
before(async () => {
  const path = process.env.SABERPLUS_LOCAL_SESSION;
  if (!path) throw new Error('SABERPLUS_LOCAL_SESSION is required.');
  const directory = await realpath(path);
  if (dirname(directory) !== await realpath(tmpdir()) || !basename(directory).startsWith('saberplus-i2-local-'))
    throw new Error('Owned temporary session required.');
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, endpoint);
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  await db.$connect();
  owner = await db.usuario.findUniqueOrThrow({ where: { correo: 'teacher@example.invalid' } });
  assert.equal(owner.institucionId, null, 'Use a fresh disposable session for this test.');
  institution = await db.institucion.create({ data: {
    nombre: 'Institución de ensayo Perfil C1', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA',
    departamentoCodigo: '91', municipioCodigo: '91001', territorioVersion: 'DANE-DIVIPOLA-MGN-2025',
    mensajeBienvenida: 'Mensaje privado de bienvenida de ensayo',
  } });
  await db.usuario.update({ where: { id: owner.id }, data: { institucionId: institution.id } });
  await db.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: institution.id, rol: 'PROPIETARIO' } });
  member = await account('Docente lector C1', { correo: 'teacher-reader@example.invalid', institucionId: institution.id });
  await db.miembroInstitucion.create({ data: { usuarioId: member.id, institucionId: institution.id, rol: 'ADMINISTRADOR' } });
  outsider = await account('Docente ajeno C1');
  tokens = { owner: await login(owner.correo), member: await login(member.correo),
    student: await login('student@example.invalid'), outsider: await login(outsider.correo) };
  await writeFile(join(directory, 'profile-fixtures.json'), JSON.stringify({ institutionId: institution.id,
    ownerEmail: owner.correo, readerEmail: member.correo, studentEmail: 'student@example.invalid' }));
});
after(async () => db?.$disconnect());

test('C1 migration: nullable description/default revision, legacy welcome stays private', async () => {
  assert.equal(institution.descripcionPublica, null);
  assert.equal(institution.revisionPerfil, 0);
  const result = await http(`/instituciones/directorio/${institution.id}`, tokens.student);
  assert.equal(result.status, 200);
  assert.equal(result.data.descripcion, null);
  assert.deepEqual(Object.keys(result.data).sort(), ['descripcion', 'id', 'nombre', 'ubicacion']);
  assert.equal(result.data.ubicacion.municipioCodigo, '91001');
});
test('C1 HTTP: anonymous and invalid token cannot read or write', async () => {
  for (const token of [null, 'invalid']) {
    assert.equal((await http(profilePath, token)).status, 401);
    assert.equal((await http(profilePath, token, { revision: 0, descripcion: 'No' })).status, 401);
  }
});
test('C1 HTTP: owner receives explicit editor contract without private fields', async () => {
  const result = await http(profilePath, tokens.owner);
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'private, no-store');
  assert.equal(result.data.puedeEditar, true);
  assert.deepEqual(Object.keys(result.data).sort(), ['descripcion', 'id', 'nombre', 'puedeEditar', 'revision']);
});
test('C1 HTTP: administrator membership reads but cannot write', async () => {
  const result = await http(profilePath, tokens.member);
  assert.equal(result.status, 200);
  assert.equal(result.data.puedeEditar, false);
  assert.equal((await http(profilePath, tokens.member, { revision: 0, descripcion: 'No' })).status, 403);
});
test('C1 HTTP: student and unrelated teacher cannot use editor', async () => {
  for (const token of [tokens.student, tokens.outsider]) {
    assert.equal((await http(profilePath, token)).status, 403);
    assert.equal((await http(profilePath, token, { revision: 0, descripcion: 'No' })).status, 403);
  }
});
test('C1 HTTP: current account/verification policies remain enforced', async () => {
  const unverified = await account('Sin correo verificado', { correoVerificado: false });
  await db.miembroInstitucion.create({ data: { usuarioId: unverified.id, institucionId: institution.id, rol: 'PROFESOR' } });
  const unverifiedToken = await login(unverified.correo);
  assert.equal((await http(profilePath, unverifiedToken)).status, 403);
  const deleted = await account('Cuenta temporal eliminada');
  const deletedToken = await login(deleted.correo);
  await db.usuario.delete({ where: { id: deleted.id } });
  assert.equal((await http(profilePath, deletedToken)).status, 401);
});
test('C1 HTTP/SQL: save, read publicly and audit exactly once', async () => {
  const result = await http(profilePath, tokens.owner, { revision: 0, descripcion: '  Presentación pública inicial C1  ' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { descripcion: 'Presentación pública inicial C1', revision: 1 });
  assert.equal((await http(`/instituciones/directorio/${institution.id}`, tokens.student)).data.descripcion, result.data.descripcion);
  const audits = await db.auditoriaInstitucion.findMany({ where: { institucionId: institution.id, accion: 'PERFIL_PUBLICO_ACTUALIZADO' } });
  assert.equal(audits.length, 1);
  assert.equal(audits[0].actorId, owner.id);
  assert.deepEqual(audits[0].detalle, { revisionAnterior: 0, revision: 1 });
});
test('C1 SQL: reconnect retains description and revision', async () => {
  await db.$disconnect(); await db.$connect();
  const row = await db.institucion.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(row.descripcionPublica, 'Presentación pública inicial C1');
  assert.equal(row.revisionPerfil, 1);
});
test('C1 HTTP: rejects extra fields, coerced/null revision, invalid text and length', async () => {
  for (const body of [
    { revision: 1, descripcion: '', nombre: 'Otro' }, { revision: 1, descripcion: '', municipioCodigo: '20001' },
    { revision: '1', descripcion: '' }, { revision: true, descripcion: '' },
    { revision: null, descripcion: '' }, { revision: -1, descripcion: '' },
    { revision: 1.2, descripcion: '' }, { revision: 1, descripcion: null },
    { revision: 1, descripcion: 123 }, { revision: 1 }, { revision: 1, descripcion: 'x'.repeat(501) },
  ]) assert.equal((await http(profilePath, tokens.owner, body)).status, 400);
  assert.equal((await db.institucion.findUniqueOrThrow({ where: { id: institution.id } })).revisionPerfil, 1);
});
test('C1 HTTP: exact 500 characters accepted', async () => {
  const result = await http(profilePath, tokens.owner, { revision: 1, descripcion: 'x'.repeat(500) });
  assert.equal(result.status, 200);
  assert.equal(result.data.descripcion.length, 500);
  assert.equal(result.data.revision, 2);
});
test('C1 HTTP/SQL: concurrent same revision has one winner, one 409, one audit', async () => {
  const before = await db.auditoriaInstitucion.count({ where: { institucionId: institution.id } });
  const results = await Promise.all(['Edición A', 'Edición B'].map(descripcion => http(profilePath, tokens.owner, { revision: 2, descripcion })));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const row = await db.institucion.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(row.revisionPerfil, 3);
  assert.equal(row.descripcionPublica, results.find(r => r.status === 200).data.descripcion);
  assert.equal(await db.auditoriaInstitucion.count({ where: { institucionId: institution.id } }), before + 1);
});
test('C1 SQL: real transaction rolls back profile if audit fails', async () => {
  const { InstitutionProfileService } = require('../dist/institucion/institution-profile.service');
  const proxy = { $transaction: (fn) => db.$transaction(tx => fn(new Proxy(tx, {
    get(target, key) { return key === 'auditoriaInstitucion' ? { create: async () => { throw new Error('C1 injected audit failure'); } } : Reflect.get(target, key); },
  }))) };
  const original = await db.institucion.findUniqueOrThrow({ where: { id: institution.id } });
  await assert.rejects(new InstitutionProfileService(proxy).update(owner.id, { revision: 3, descripcion: 'Debe revertirse' }), /C1 injected audit failure/);
  const row = await db.institucion.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(row.revisionPerfil, original.revisionPerfil);
  assert.equal(row.descripcionPublica, original.descripcionPublica);
});
test('C1 HTTP/SQL: changed owner role blocks old session', async () => {
  await db.miembroInstitucion.update({ where: { usuarioId: owner.id }, data: { rol: 'ADMINISTRADOR' } });
  try {
    assert.equal((await http(profilePath, tokens.owner)).data.puedeEditar, false);
    assert.equal((await http(profilePath, tokens.owner, { revision: 3, descripcion: 'No' })).status, 403);
  } finally { await db.miembroInstitucion.update({ where: { usuarioId: owner.id }, data: { rol: 'PROPIETARIO' } }); }
});
test('C1 HTTP: suspended institution disappears and blocks editing', async () => {
  await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'SUSPENDIDA' } });
  try {
    assert.equal((await http(profilePath, tokens.owner)).status, 403);
    assert.equal((await http(profilePath, tokens.owner, { revision: 3, descripcion: 'No' })).status, 403);
    assert.equal((await http(`/instituciones/directorio/${institution.id}`, tokens.student)).status, 404);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'APROBADA' } }); }
});
test('C1 HTTP/SQL: empty clears description, private welcome/identity unchanged', async () => {
  const result = await http(profilePath, tokens.owner, { revision: 3, descripcion: '   ' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { descripcion: null, revision: 4 });
  const row = await db.institucion.findUniqueOrThrow({ where: { id: institution.id } });
  assert.equal(row.mensajeBienvenida, institution.mensajeBienvenida);
  assert.equal(row.nombre, institution.nombre);
  assert.equal(row.municipioCodigo, '91001');
});
