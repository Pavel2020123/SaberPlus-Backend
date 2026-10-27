// HTTP + PostgreSQL. Only an explicitly marked disposable local session is allowed.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile, realpath } = require('node:fs/promises');
const { dirname, basename, join } = require('node:path');
const { tmpdir } = require('node:os');
const base = 'http://127.0.0.1:43187';
const route = '/instituciones/ingresos-estudiantes';
let db, config, hash, institution, otherInstitution, owner, reader, foreignOwner;

async function http(path, token, body, method = 'GET') {
  const r = await fetch(base + path, { method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000) });
  return { status: r.status, cache: r.headers.get('cache-control'), data: await r.json() };
}
async function person(rol = 'ESTUDIANTE', extra = {}) {
  const user = await db.usuario.create({ data: { nombre: 'C3 disposable fixture', correo: `${randomUUID()}@example.invalid`,
    contrasenaHash: hash, rol, correoVerificado: true, ...extra } });
  const login = await http('/auth/login', null, { correo: user.correo, contrasena: config.AUTH_E2E_PASSWORD }, 'POST');
  assert.equal(login.status, 201);
  return { ...user, token: login.data.accessToken };
}
async function pending(student, target = institution.id, id = randomUUID()) {
  const r = await http(route, student.token, { id, institucionId: target, mensaje: 'Quiero unirme' }, 'POST');
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.equal(r.data.estado, 'PENDIENTE');
  return r.data;
}
const review = (row, decision = 'APROBAR', token = owner.token) =>
  http(`${route}/${row.id}/revision`, token, { revision: row.revision, decision }, 'PATCH');
const cancel = (row, student) => http(`${route}/${row.id}`, student.token, { revision: row.revision }, 'DELETE');
const audits = id => db.auditoriaInstitucion.count({ where: { detalle: { path: ['solicitudId'], equals: id } } });

before(async () => {
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, base);
  const { PrismaClient } = require('@prisma/client');
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  hash = (await db.usuario.findUniqueOrThrow({ where: { correo: 'student@example.invalid' } })).contrasenaHash;
  institution = await db.institucion.create({ data: { nombre: 'C3 owned fixture', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  otherInstitution = await db.institucion.create({ data: { nombre: 'C3 foreign fixture', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  owner = await person('PROFESOR', { institucionId: institution.id });
  reader = await person('PROFESOR', { institucionId: institution.id });
  foreignOwner = await person('PROFESOR', { institucionId: otherInstitution.id });
  for (const [user, target, rol] of [[owner, institution, 'PROPIETARIO'], [reader, institution, 'ADMINISTRADOR'], [foreignOwner, otherInstitution, 'PROPIETARIO']])
    await db.miembroInstitucion.create({ data: { usuarioId: user.id, institucionId: target.id, rol } });
});
after(async () => db?.$disconnect());

test('C3 RLS and partial unique index protect private requests', async () => {
  const rows = await db.$queryRawUnsafe(`SELECT relrowsecurity AS rls,
    has_table_privilege('anon', '"SolicitudIngresoEstudiante"', 'SELECT') AS anon,
    has_table_privilege('authenticated', '"SolicitudIngresoEstudiante"', 'SELECT') AS authenticated
    FROM pg_class WHERE oid = '"SolicitudIngresoEstudiante"'::regclass`);
  assert.deepEqual(rows, [{ rls: true, anon: false, authenticated: false }]);
  const indexes = await db.$queryRawUnsafe(`SELECT indexdef FROM pg_indexes WHERE indexname = 'SolicitudIngresoEstudiante_pendiente_unique'`);
  assert.match(indexes[0].indexdef, /UNIQUE.*estudianteId.*WHERE.*PENDIENTE/);
});

test('C3 anonymous, teacher, non-owner and injected identity are blocked', async () => {
  assert.equal((await http(`${route}/me`, null)).status, 401);
  assert.equal((await http(route, owner.token, { id: randomUUID(), institucionId: institution.id }, 'POST')).status, 403);
  assert.equal((await http(`${route}/pendientes`, reader.token)).status, 403);
  const s = await person();
  assert.equal((await http(route, s.token, { id: randomUUID(), institucionId: institution.id, estudianteId: owner.id }, 'POST')).status, 400);
});

test('C3 create, private history and owner inbox do not join or expose email', async () => {
  const s = await person();
  const p = await pending(s);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: s.id } })).institucionId, null);
  assert.equal(await db.miembroInstitucion.count({ where: { usuarioId: s.id } }), 0);
  const own = await http(`${route}/me`, s.token);
  assert.equal(own.cache, 'private, no-store');
  assert.equal(own.data.solicitudes[0].id, p.id);
  assert.ok(!JSON.stringify(own.data).includes(s.correo));
  assert.ok(!Object.hasOwn(own.data.solicitudes[0], 'estudianteId'));
  const inbox = await http(`${route}/pendientes`, owner.token);
  assert.equal(inbox.data.solicitudes.find(r => r.id === p.id).estudianteNombre, s.nombre);
  assert.ok(!JSON.stringify(inbox.data).includes(s.correo));
});

test('C3 concurrent retry of identical UUID creates and audits once', async () => {
  const s = await person(); const id = randomUUID();
  const results = await Promise.all([pending(s, institution.id, id), pending(s, institution.id, id)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal(await db.solicitudIngresoEstudiante.count({ where: { id } }), 1);
  assert.equal(await audits(id), 1);
});

test('C3 concurrent requests to different institutions leave only one pending', async () => {
  const s = await person();
  const responses = await Promise.all([institution.id, otherInstitution.id].map(institucionId =>
    http(route, s.token, { id: randomUUID(), institucionId }, 'POST')));
  assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
  assert.equal(await db.solicitudIngresoEstudiante.count({ where: { estudianteId: s.id, estado: 'PENDIENTE' } }), 1);
});

test('C3 owner approval is atomic, idempotent and never promotes a student', async () => {
  const s = await person(); const p = await pending(s);
  assert.equal((await review(p)).data.estado, 'APROBADA');
  assert.equal((await review(p)).status, 200);
  const user = await db.usuario.findUniqueOrThrow({ where: { id: s.id } });
  assert.equal(user.institucionId, institution.id); assert.equal(user.rol, 'ESTUDIANTE');
  assert.equal(await db.miembroInstitucion.count({ where: { usuarioId: s.id } }), 0);
  assert.equal(await audits(p.id), 2);
  assert.equal((await http(`${route}/me`, s.token)).data.solicitudes[0].estado, 'APROBADA');
  assert.equal((await cancel(p, s)).status, 409);
});

test('C3 reject, consult, new request and cancellation preserve history without joining', async () => {
  const s = await person(); const first = await pending(s);
  assert.equal((await review(first, 'RECHAZAR')).data.estado, 'RECHAZADA');
  assert.equal((await review(first, 'RECHAZAR')).status, 200);
  assert.equal(await audits(first.id), 2);
  const second = await pending(s);
  assert.equal((await cancel(second, s)).data.estado, 'CANCELADA');
  assert.equal((await cancel(second, s)).status, 200);
  assert.equal(await audits(second.id), 2);
  const own = await http(`${route}/me`, s.token);
  assert.deepEqual(own.data.solicitudes.map(r => r.estado).sort(), ['CANCELADA', 'RECHAZADA']);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: s.id } })).institucionId, null);
});

test('C3 stale revision, foreign owner and another student cannot decide or cancel', async () => {
  const s = await person(); const other = await person(); const p = await pending(s);
  assert.equal((await review(p, 'APROBAR', foreignOwner.token)).status, 404);
  assert.equal((await cancel(p, other)).status, 404);
  assert.equal((await review({ ...p, revision: 10 })).status, 409);
  assert.equal((await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: p.id } })).estado, 'PENDIENTE');
});

test('C3 suspended institution rejects new requests and owner reviews', async () => {
  const s = await person(); const p = await pending(s);
  await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'SUSPENDIDA' } });
  try {
    assert.equal((await review(p)).status, 403);
    assert.equal((await http(route, s.token, { id: randomUUID(), institucionId: institution.id }, 'POST')).status, 404);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { estadoVerificacion: 'APROBADA' } }); }
});

test('C3 capacity failure and prior membership leave the request unchanged', async () => {
  const s = await person(); const p = await pending(s);
  const occupied = await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } });
  assert.ok(occupied >= 1, 'The approval fixture must already occupy a seat.');
  await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: occupied } });
  try { assert.equal((await review(p)).status, 400); }
  finally { await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: null } }); }
  await db.usuario.update({ where: { id: s.id }, data: { institucionId: otherInstitution.id } });
  assert.equal((await review(p)).status, 409);
  assert.equal((await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: p.id } })).estado, 'PENDIENTE');
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: s.id } })).institucionId, otherInstitution.id);
});

test('C3 concurrent cancellation and approval have one coherent terminal state', async () => {
  const s = await person(); const p = await pending(s);
  const responses = await Promise.all([cancel(p, s), review(p)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  const row = await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: p.id } });
  const user = await db.usuario.findUniqueOrThrow({ where: { id: s.id } });
  assert.ok(['APROBADA', 'CANCELADA'].includes(row.estado));
  assert.equal(user.institucionId, row.estado === 'APROBADA' ? institution.id : null);
  assert.equal(row.revision, 1); assert.equal(await audits(p.id), 2);
});

test('C3 two concurrent approvals cannot consume the same last seat', async () => {
  const first = await person(); const second = await person();
  const requests = [await pending(first), await pending(second)];
  const occupied = await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } });
  await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: occupied + 1 } });
  try {
    const responses = await Promise.all(requests.map(row => review(row)));
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 400]);
    assert.equal(await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } }), occupied + 1);
    const rows = await db.solicitudIngresoEstudiante.findMany({ where: { id: { in: requests.map(r => r.id) } } });
    assert.deepEqual(rows.map(r => r.estado).sort(), ['APROBADA', 'PENDIENTE']);
  } finally { await db.institucion.update({ where: { id: institution.id }, data: { limiteEstudiantes: null } }); }
});

test('C3 failed audit rolls back both membership and decision in PostgreSQL', async () => {
  const s = await person(); const p = await pending(s);
  const { StudentInstitutionRequestService } = require('../dist/institucion/student-institution-request.service');
  const { InstitucionAccesoService } = require('../dist/institucion/institucion-acceso.service');
  const wrapped = new Proxy(db, { get(target, key) {
    if (key === '$transaction') return (fn, options) => target.$transaction(tx => fn(new Proxy(tx, { get(inner, prop) {
      if (prop === 'auditoriaInstitucion') return { create: async () => { throw new Error('forced-C3-audit-failure'); } };
      return inner[prop];
    } })), options);
    return target[key];
  } });
  await assert.rejects(new StudentInstitutionRequestService(wrapped, new InstitucionAccesoService(db))
    .review(owner.id, p.id, { decision: 'APROBAR', revision: 0 }), /forced-C3-audit-failure/);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: s.id } })).institucionId, null);
  const row = await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: p.id } });
  assert.equal(row.estado, 'PENDIENTE'); assert.equal(row.revision, 0); assert.equal(await audits(p.id), 1);
});

test('C3 reconnect retains terminal decisions', async () => {
  const s = await person(); const p = await pending(s);
  await review(p, 'RECHAZAR');
  await db.$disconnect(); await db.$connect();
  assert.equal((await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: p.id } })).estado, 'RECHAZADA');
});
