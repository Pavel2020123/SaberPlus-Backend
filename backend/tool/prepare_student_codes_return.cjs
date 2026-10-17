// Synthetic preparation only: reproduce returning from C3 to C4 in an owned
// disposable session. Never counts as an Android/human validation.
const assert = require('node:assert/strict');
const { readFile, realpath, writeFile } = require('node:fs/promises');
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
    const owner = await db.usuario.findUniqueOrThrow({ where: { correo: 'teacher@example.invalid' } });
    const student = await db.usuario.findUniqueOrThrow({ where: { correo: 'zero@example.invalid' } });
    assert.equal(owner.rol, 'PROFESOR');
    assert.ok(owner.institucionId);
    assert.equal(student.rol, 'ESTUDIANTE');
    assert.equal(student.institucionId, null);
    assert.equal(await db.codigoIngresoEstudiantil.count(), 0, 'Never rotate an existing code silently.');
    assert.equal(await db.solicitudIngresoEstudiante.count({ where: { estudianteId: student.id } }), 0);
    async function call(path, token, body) {
      return fetch(config.API_BASE_URL + path, { method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
    }
    async function login(correo) {
      const response = await call('/auth/login', null, { correo, contrasena: config.AUTH_E2E_PASSWORD });
      assert.equal(response.status, 201);
      const token = (await response.json()).accessToken;
      assert.equal(typeof token, 'string');
      return token;
    }
    const ownerToken = await login(owner.correo);
    const generated = await call('/instituciones/codigo-estudiantes/renovar', ownerToken,
      { id: randomUUID(), revision: 0 });
    assert.equal(generated.status, 201);
    const rotation = await generated.json();
    assert.match(rotation.codigo, /^SPI-[A-F0-9]{32}$/);
    const studentToken = await login(student.correo);
    const requestId = randomUUID();
    const requested = await call('/instituciones/ingresos-estudiantes', studentToken,
      { id: requestId, institucionId: owner.institucionId, mensaje: 'Preparacion sintetica para probar regreso de solicitudes a codigo.' });
    assert.equal(requested.status, 201);
    const request = await db.solicitudIngresoEstudiante.findUniqueOrThrow({ where: { id: requestId } });
    assert.equal(request.estado, 'PENDIENTE');
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
    const privatePath = join(directory, 'c4-return-private.json');
    await writeFile(privatePath, JSON.stringify({
      TEST_EMAIL: student.correo,
      AUTH_E2E_PASSWORD: config.AUTH_E2E_PASSWORD,
      STUDENT_INSTITUTION_CODE: rotation.codigo,
    }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(JSON.stringify({ preparation: 'synthetic only, not a human test',
      requestId, state: request.estado, linked: false, privateFile: privatePath }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  // Never print HTTP bodies, Prisma errors, database URLs, codes or credentials.
  console.error(`Owned C4 return preparation failed: ${error.name}. Inspect before retrying.`);
  process.exitCode = 1;
});
