// Real HTTP/PostgreSQL in the explicitly owned temporary harness only.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, realpath } = require('node:fs/promises');
const { dirname, basename, join } = require('node:path');
const { tmpdir } = require('node:os');
const route = '/instituciones/codigo-estudiantes';
let db, config, owner, reader, institution, hash, current;

async function http(path, token, body, method = 'POST') {
  const response = await fetch(config.API_BASE_URL + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  return { status: response.status, cache: response.headers.get('cache-control'), data: await response.json() };
}
async function person(rol = 'ESTUDIANTE', extra = {}) {
  const row = await db.usuario.create({ data: { nombre: 'Fixture C4', correo: `${randomUUID()}@example.invalid`,
    contrasenaHash: hash, rol, correoVerificado: true, ...extra } });
  const login = await http('/auth/login', null, { correo: row.correo, contrasena: config.AUTH_E2E_PASSWORD });
  assert.equal(login.status, 201);
  return { ...row, token: login.data.accessToken };
}
const preview = (user, code = current) => http(`${route}/consultar`, user.token, { codigo: code.codigo });
const joinBody = (id = randomUUID(), code = current) => ({ id, codigo: code.codigo, revision: code.revision, institucionId: institution.id });
const enter = (user, body = joinBody()) => http(`${route}/ingresar`, user.token, body);
const rotate = (revision = current?.revision ?? 0, id = randomUUID(), token = owner.token) => http(`${route}/renovar`, token, { id, revision });
const auditCount = (operationId) => db.auditoriaInstitucion.count({ where: {
  institucionId: institution.id, detalle: { path: ['operacionId'], equals: operationId },
} });

before(async () => {
  assert.equal(process.argv.length, 2, 'No command-line database accepted.');
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  hash = (await db.usuario.findUniqueOrThrow({ where: { correo: 'student@example.invalid' } })).contrasenaHash;
  institution = await db.institucion.create({ data: { nombre: 'C4 disposable HTTP fixture', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  owner = await person('PROFESOR', { institucionId: institution.id });
  reader = await person('PROFESOR', { institucionId: institution.id });
  for (const [user, rol] of [[owner, 'PROPIETARIO'], [reader, 'ADMINISTRADOR']]) {
    await db.miembroInstitucion.create({ data: { usuarioId: user.id, institucionId: institution.id, rol } });
  }
});
after(async () => { await db?.$disconnect(); });

test('C4 private owner GET starts empty without mutation', async () => {
  const response = await http(`${route}/propio`, owner.token, undefined, 'GET');
  assert.equal(response.status, 200); assert.equal(response.cache, 'private, no-store');
  assert.equal(response.data.codigo, null); assert.equal(response.data.revision, 0);
  assert.equal(await db.codigoIngresoEstudiantil.count({ where: { institucionId: institution.id } }), 0);
});
test('C4 anonymous, unverified and reader cannot access private codes', async () => {
  const student = await person(); const unverified = await person('ESTUDIANTE', { correoVerificado: false });
  assert.equal((await http(`${route}/propio`, null, undefined, 'GET')).status, 401);
  assert.equal((await http(`${route}/propio`, student.token, undefined, 'GET')).status, 403);
  assert.equal((await http(`${route}/propio`, reader.token, undefined, 'GET')).status, 403);
  assert.equal((await rotate(0, randomUUID(), reader.token)).status, 403);
  assert.equal((await http(`${route}/consultar`, unverified.token, { codigo: 'SPI-' + '0'.repeat(32) })).status, 403);
});
test('C4 initial generation is private and leaves legacy code intact', async () => {
  const response = await rotate(0);
  assert.equal(response.status, 201); assert.equal(response.cache, 'private, no-store');
  assert.match(response.data.codigo, /^SPI-[A-F0-9]{32}$/); current = response.data;
  assert.equal(current.revision, 1);
  assert.equal((await db.institucion.findUniqueOrThrow({ where: { id: institution.id } })).codigoUnico, institution.codigoUnico);
  const audit = await db.auditoriaInstitucion.findFirstOrThrow({ where: { institucionId: institution.id, accion: 'CODIGO_ESTUDIANTIL_RENOVADO' } });
  assert.equal(JSON.stringify(audit.detalle).includes(current.codigo), false);
});
test('C4 same rotation UUID replays without extra audit; stale revision fails', async () => {
  const again = await rotate(0, current.operacionId);
  assert.equal(again.status, 201); assert.equal(again.data.codigo === current.codigo, true);
  assert.equal(await auditCount(current.operacionId), 1);
  assert.equal((await rotate(0)).status, 409);
});
test('C4 strict types, UUID and legacy/group codes rejected', async () => {
  const student = await person();
  for (const revision of ['1', true, null]) assert.equal((await http(`${route}/renovar`, owner.token, { id: randomUUID(), revision })).status, 400);
  for (const codigo of [123, true, null, institution.codigoUnico, 'GRP-12345678']) {
    assert.equal((await http(`${route}/consultar`, student.token, { codigo })).status, 400);
  }
  assert.equal((await enter(student, { ...joinBody(), id: 'bad' })).status, 400);
  assert.equal((await enter(student, { ...joinBody(), rol: 'PROFESOR' })).status, 400);
});
test('C4 preview is minimal and does not join', async () => {
  const student = await person(); const response = await preview(student);
  assert.equal(response.status, 201); assert.equal(response.cache, 'private, no-store');
  assert.deepEqual(Object.keys(response.data).sort(), ['institucion', 'revision', 'yaVinculado']);
  assert.deepEqual(Object.keys(response.data.institucion).sort(), ['id', 'nombre']);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
});
test('C4 confirmed join/replay keeps student role without groups or duplicate audit', async () => {
  const student = await person(); const body = joinBody();
  assert.equal((await enter(student, body)).status, 201);
  assert.equal((await enter(student, body)).status, 201);
  assert.equal(await auditCount(body.id), 1);
  assert.equal(await db.ingresoInstitucionCodigo.count({ where: { id: body.id } }), 1);
  const row = await db.usuario.findUniqueOrThrow({ where: { id: student.id } });
  assert.equal(row.rol, 'ESTUDIANTE'); assert.equal(row.institucionId, institution.id);
  assert.equal(await db.miembroInstitucion.count({ where: { usuarioId: student.id } }), 0);
  assert.equal(await db.claseEstudiante.count({ where: { usuarioId: student.id } }), 0);
  const previous = current;
  const rotated = await rotate(); assert.equal(rotated.status, 201); current = rotated.data;
  assert.equal((await enter(student, body)).status, 201); // Lost acknowledgement reconciles after rotation.
  assert.equal(await auditCount(body.id), 1);
  const other = await person();
  assert.equal((await preview(other, previous)).status, 404);
  assert.equal((await enter(other, joinBody(randomUUID(), previous))).status, 404);
  assert.equal((await enter(other, body)).status, 409); // Someone else's receipt cannot be used.
  assert.equal((await rotate(current.revision, previous.operacionId)).status, 409);
});
test('C4 changed snapshot and foreign institution cannot redirect join', async () => {
  const student = await person();
  assert.equal((await enter(student, { ...joinBody(), institucionId: randomUUID() })).status, 409);
  assert.equal((await enter(student, { ...joinBody(), revision: current.revision + 1 })).status, 409);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
});
test('C4 pending request requires explicit cancellation', async () => {
  const student = await person(); const requestId = randomUUID();
  assert.equal((await http('/instituciones/ingresos-estudiantes', student.token, { id: requestId, institucionId: institution.id })).status, 201);
  assert.equal((await enter(student)).status, 409);
  const request = await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: requestId } });
  assert.equal(request.estado, 'PENDIENTE'); assert.equal(request.revision, 0);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
});
test('C4 full institution rejects admission with no receipt', async () => {
  const student = await person(); const body = joinBody();
  const occupied = await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } });
  assert.ok(occupied > 0);
  await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: occupied } });
  try {
    assert.equal((await enter(student, body)).status, 400);
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
    assert.equal(await db.ingresoInstitucionCodigo.count({ where: { id: body.id } }), 0);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: null } }); }
});
test('C4 two concurrent admissions cannot consume the same final seat', async () => {
  const first = await person(); const second = await person();
  const occupied = await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } });
  await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: occupied + 1 } });
  try {
    const responses = await Promise.all([enter(first), enter(second)]);
    assert.deepEqual(responses.map(r => r.status).sort(), [201, 400]);
    assert.equal(await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } }), occupied + 1);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: null } }); }
});
test('C4 concurrent rotations have one winner and preserve optimistic version', async () => {
  const responses = await Promise.all([rotate(), rotate()]);
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  current = responses.find(r => r.status === 201).data;
});
test('C4 suspension rejects preview, new join and owner operations', async () => {
  const student = await person();
  await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'SUSPENDIDA' } });
  try {
    assert.equal((await preview(student)).status, 404);
    assert.equal((await enter(student)).status, 404);
    assert.equal((await rotate()).status, 403);
    assert.equal((await http(`${route}/propio`, owner.token, undefined, 'GET')).status, 403);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'APROBADA' } }); }
});
test('C4 membership elsewhere is never silently moved', async () => {
  const other = await db.institucion.create({ data: { nombre: 'C4 other', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  const student = await person('ESTUDIANTE', { institucionId: other.id });
  assert.equal((await enter(student)).status, 409);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, other.id);
});
test('C4 failed audit rolls back membership and receipt in PostgreSQL', async () => {
  const student = await person(); const body = joinBody();
  const { StudentInstitutionCodeService } = require('../dist/institucion/student-institution-code.service');
  const { InstitucionAccesoService } = require('../dist/institucion/institucion-acceso.service');
  const wrapped = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, prop) {
      if (prop === 'auditoriaInstitucion') return { create: async () => { throw new Error('forced-owned-audit-failure'); } };
      return inner[prop];
    } })), options);
    return target[key];
  } });
  await assert.rejects(new StudentInstitutionCodeService(wrapped, new InstitucionAccesoService(db)).join(student.id, body), /forced-owned/);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
  assert.equal(await db.ingresoInstitucionCodigo.count({ where: { id: body.id } }), 0);
});
test('C4 private tables deny anon and authenticated roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    for (const table of ['CodigoIngresoEstudiantil', 'IngresoInstitucionCodigo']) {
      await assert.rejects(db.$transaction(async tx => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`);
      }), /permission denied/);
    }
  }
});
