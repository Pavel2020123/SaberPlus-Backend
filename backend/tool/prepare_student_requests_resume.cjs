// Rebuild only synthetic C3 fixtures in a freshly owned disposable session.
// This is preparation, never evidence of a new human Android test.
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');

(async () => {
  assert.equal(process.argv.length, 2, 'External arguments are not accepted.');
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  try {
    const fixture = await db.$transaction(async tx => {
      const owner = await tx.usuario.findUniqueOrThrow({ where: { correo: 'teacher@example.invalid' } });
      const student = await tx.usuario.findUniqueOrThrow({ where: { correo: 'student@example.invalid' } });
      assert.equal(owner.rol, 'PROFESOR'); assert.equal(student.rol, 'ESTUDIANTE');
      assert.equal(owner.institucionId, null); assert.equal(student.institucionId, null);
      assert.equal(await tx.institucion.count(), 0, 'Fresh session required; never overwrite existing fixtures.');
      assert.equal(await tx.solicitudIngresoEstudiante.count(), 0);
      const institution = await tx.institucion.create({ data: {
        nombre: 'Institucion de ensayo C3', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA',
        departamentoCodigo: '91', municipioCodigo: '91001', territorioVersion: 'DANE-DIVIPOLA-MGN-2025',
        descripcionPublica: 'Datos ficticios para retomar solicitudes C3.',
      } });
      const other = await tx.institucion.create({ data: {
        nombre: 'Institucion alternativa C3', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA',
        departamentoCodigo: '20', municipioCodigo: '20001', territorioVersion: 'DANE-DIVIPOLA-MGN-2025',
      } });
      await tx.usuario.update({ where: { id: owner.id }, data: { institucionId: institution.id } });
      await tx.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: institution.id, rol: 'PROPIETARIO' } });
      const reader = await tx.usuario.create({ data: {
        nombre: 'Docente lector C3', correo: 'teacher-reader@example.invalid', contrasenaHash: owner.contrasenaHash,
        rol: 'PROFESOR', correoVerificado: true, tutorialProfesorVersion: 1, institucionId: institution.id,
      } });
      await tx.miembroInstitucion.create({ data: { usuarioId: reader.id, institucionId: institution.id, rol: 'ADMINISTRADOR' } });
      return { institutionId: institution.id, otherInstitutionId: other.id, studentId: student.id };
    });
    async function call(path, token, body, method = 'GET') {
      return fetch(config.API_BASE_URL + path, { method,
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    }
    const login = await call('/auth/login', null,
      { correo: 'student@example.invalid', contrasena: config.AUTH_E2E_PASSWORD }, 'POST');
    assert.equal(login.status, 201);
    const token = (await login.json()).accessToken;
    const requestId = randomUUID();
    const created = await call('/instituciones/ingresos-estudiantes', token,
      { id: requestId, institucionId: fixture.institutionId, mensaje: 'Preparacion C3: solicitud cancelada para retomar la prueba.' }, 'POST');
    assert.equal(created.status, 201);
    const cancelled = await call(`/instituciones/ingresos-estudiantes/${requestId}`, token, { revision: 0 }, 'DELETE');
    assert.equal(cancelled.status, 200); assert.equal((await cancelled.json()).estado, 'CANCELADA');
    const saved = await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: requestId } });
    assert.equal(saved.estado, 'CANCELADA'); assert.equal(saved.revision, 1);
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: fixture.studentId } })).institucionId, null);
    assert.equal(await db.solicitudIngresoEstudiante.count({ where: { estudianteId: fixture.studentId } }), 1);
    assert.equal(await db.auditoriaInstitucion.count({ where: { afectadoId: fixture.studentId,
      accion: { startsWith: 'SOLICITUD_ESTUDIANTE_' } } }), 2);
    console.log(JSON.stringify({ preparation: 'synthetic resume fixture, not a new human test',
      institutionId: fixture.institutionId, otherInstitutionId: fixture.otherInstitutionId,
      requestId, status: saved.estado, revision: saved.revision, linked: false }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  // No database URL, password, token or Prisma payload in output.
  console.error(`Owned C3 resume preparation failed: ${error.name}. Inspect the owned session before retrying.`);
  process.exitCode = 1;
});
