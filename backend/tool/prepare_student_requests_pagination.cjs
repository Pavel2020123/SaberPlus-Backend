// Synthetic pagination setup, never evidence of a human Android test.
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { PrismaClient } = require('@prisma/client');

(async () => {
  assert.equal(process.argv.length, 2);
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  async function call(path, token, body) {
    const response = await fetch(config.API_BASE_URL + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 201, 'Fixture API call failed; inspect owned session.');
    return response.json();
  }
  try {
    const owner = await db.usuario.findUniqueOrThrow({ where: { correo: 'teacher@example.invalid' } });
    assert.equal(owner.rol, 'PROFESOR');
    assert.ok(owner.institucionId);
    const institution = await db.institucion.findUniqueOrThrow({ where: { id: owner.institucionId } });
    assert.equal(institution.nombre, 'Institucion de ensayo C3');
    assert.equal(institution.estadoVerificacion, 'APROBADA');
    assert.ok(await db.miembroInstitucion.findFirst({ where: {
      usuarioId: owner.id, institucionId: institution.id, rol: 'PROPIETARIO',
    } }));
    const sample = await db.usuario.findUniqueOrThrow({ where: { correo: 'student@example.invalid' } });
    for (let index = 1; index <= 21; index++) {
      const label = String(index).padStart(2, '0');
      const correo = `c3-page-${label}@example.invalid`;
      let user = await db.usuario.findUnique({ where: { correo } });
      if (!user) user = await db.usuario.create({ data: {
        nombre: `Alumno de ensayo pagina ${label}`, correo, contrasenaHash: sample.contrasenaHash,
        rol: 'ESTUDIANTE', correoVerificado: true,
      } });
      assert.equal(user.rol, 'ESTUDIANTE');
      assert.equal(user.institucionId, null);
      const existing = await db.solicitudIngresoEstudiante.findUnique({ where: { id: user.id } });
      if (existing) {
        assert.equal(existing.estudianteId, user.id);
        assert.equal(existing.institucionId, institution.id);
        assert.equal(existing.estado, 'PENDIENTE');
        continue;
      }
      const login = await call('/auth/login', null, { correo, contrasena: config.AUTH_E2E_PASSWORD });
      const created = await call('/instituciones/ingresos-estudiantes', login.accessToken,
        { id: user.id, institucionId: institution.id, mensaje: `Paginacion C3 ${label}` });
      assert.equal(created.estado, 'PENDIENTE');
    }
    const pending = await db.solicitudIngresoEstudiante.count({ where: {
      institucionId: institution.id, estado: 'PENDIENTE',
    } });
    console.log(JSON.stringify({ preparation: 'synthetic pagination, not human validation', pending }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  console.error(`Owned pagination preparation failed: ${error.name}. Inspect before retrying.`);
  process.exitCode = 1;
});
