// HTTP/SQL closure checks against the already prepared owned C4 human session.
// Does not rotate the real fixture code or create an admission. One temporary
// alternative-institution code is inserted for transfer checks and removed finally.
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { randomUUID, randomBytes, createHash } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
let stage = 'validate-owned-session';

(async () => {
  assert.equal(process.argv.length, 2);
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  const original = JSON.parse(await readFile(join(directory, 'c4-return-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  const route = '/instituciones/codigo-estudiantes';
  const checks = [];
  let temporary;
  async function http(path, token, body, method = 'POST') {
    const response = await fetch(config.API_BASE_URL + path, { method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
    return { status: response.status, data: await response.json() };
  }
  async function expectStatus(name, path, token, body, status, method) {
    stage = name;
    const response = await http(path, token, body, method);
    assert.equal(response.status, status);
    checks.push({ check: name, status });
    return response.data;
  }
  async function snapshot(institutionId) {
    const profiles = await db.usuario.findMany({
      where: { correo: { in: ['zero@example.invalid', 'absent@example.invalid', 'student@example.invalid'] } },
      select: { id: true, correo: true, rol: true, institucionId: true }, orderBy: { correo: 'asc' },
    });
    return {
      profiles,
      receipts: await db.ingresoInstitucionCodigo.findMany({
        where: { estudianteId: { in: profiles.map(p => p.id) } },
        select: { id: true, institucionId: true, estudianteId: true, revisionCodigo: true }, orderBy: { id: 'asc' },
      }),
      audits: await db.auditoriaInstitucion.count({ where: { institucionId: institutionId } }),
      groups: await db.claseEstudiante.count({ where: { usuarioId: { in: profiles.map(p => p.id) } } }),
      members: await db.miembroInstitucion.count({ where: { usuarioId: { in: profiles.map(p => p.id) } } }),
      code: await db.codigoIngresoEstudiantil.findUniqueOrThrow({
        where: { institucionId: institutionId }, select: { revision: true, operacionId: true },
      }),
    };
  }
  try {
    const owner = await db.usuario.findUniqueOrThrow({ where: { correo: 'teacher@example.invalid' } });
    assert.equal(owner.rol, 'PROFESOR'); assert.ok(owner.institucionId);
    const institution = await db.institucion.findUniqueOrThrow({ where: { id: owner.institucionId } });
    assert.equal(institution.nombre, 'Institucion de ensayo C3');
    assert.equal(institution.estadoVerificacion, 'APROBADA'); assert.equal(institution.limiteEstudiantes, null);
    const alternative = await db.institucion.findFirstOrThrow({ where: { nombre: 'Institucion alternativa C3' } });
    assert.equal(alternative.estadoVerificacion, 'APROBADA');
    const before = await snapshot(institution.id);
    const student = before.profiles.find(p => p.correo === 'student@example.invalid');
    const absent = before.profiles.find(p => p.correo === 'absent@example.invalid');
    assert.equal(student.institucionId, null); assert.equal(absent.institucionId, institution.id);
    assert.equal(before.receipts.length, 2); assert.equal(before.groups, 0); assert.equal(before.members, 0);
    const tokens = {};
    for (const email of ['teacher@example.invalid', 'teacher-reader@example.invalid', 'admin@example.invalid',
      'student@example.invalid', 'absent@example.invalid', 'zero@example.invalid']) {
      stage = 'login-fixture';
      const response = await http('/auth/login', null, { correo: email, contrasena: config.AUTH_E2E_PASSWORD });
      assert.equal(response.status, 201); assert.equal(typeof response.data.accessToken, 'string');
      tokens[email] = response.data.accessToken;
    }
    const ownerToken = tokens['teacher@example.invalid'];
    const studentToken = tokens[student.correo];
    const absentToken = tokens[absent.correo];
    const owned = await http(`${route}/propio`, ownerToken, undefined, 'GET');
    assert.equal(owned.status, 200); assert.equal(owned.data.revision, 2);
    const current = owned.data;
    await expectStatus('anonymous-own-denied', `${route}/propio`, null, undefined, 401, 'GET');
    for (const [label, email] of [['reader', 'teacher-reader@example.invalid'],
      ['admin', 'admin@example.invalid'], ['student', student.correo]]) {
      const denied = await expectStatus(`${label}-own-denied`, `${route}/propio`, tokens[email], undefined, 403, 'GET');
      assert.equal(denied.codigo, undefined);
      assert.ok(!JSON.stringify(denied).includes(current.codigo));
      await expectStatus(`${label}-rotate-denied`, `${route}/renovar`, tokens[email],
        { id: randomUUID(), revision: current.revision }, 403);
    }
    for (const [label, value, status] of [
      ['group-format-rejected', 'GRP-ABCDEFGH', 400],
      ['actual-legacy-teacher-code-rejected', institution.codigoUnico, 400],
      ['previous-student-code-rejected', original.STUDENT_INSTITUTION_CODE, 404],
    ]) {
      await expectStatus(label, `${route}/consultar`, studentToken, { codigo: value }, status);
    }
    const visible = await expectStatus('current-student-code-valid', `${route}/consultar`, studentToken,
      { codigo: current.codigo }, 201);
    assert.equal(visible.institucion.id, institution.id); assert.equal(visible.yaVinculado, false);
    const receipt = await db.ingresoInstitucionCodigo.findFirstOrThrow({ where: { estudianteId: absent.id } });
    const oldCode = original.STUDENT_INSTITUTION_CODE;
    assert.equal(receipt.codigoHash, createHash('sha256').update(oldCode).digest('hex'));
    const replay = { id: receipt.id, codigo: oldCode, institucionId: institution.id, revision: receipt.revisionCodigo };
    const repeated = await expectStatus('saved-admission-replay-after-rotation', `${route}/ingresar`, absentToken, replay, 201);
    assert.equal(repeated.yaVinculado, true);
    const freshBody = { id: randomUUID(), codigo: current.codigo, institucionId: institution.id, revision: current.revision };
    const already = await expectStatus('already-linked-new-operation-no-duplicate', `${route}/ingresar`, absentToken, freshBody, 201);
    assert.equal(already.yaVinculado, true);
    await expectStatus('receipt-reuse-by-unlinked-account-denied', `${route}/ingresar`, studentToken, replay, 409);
    await expectStatus('receipt-reuse-by-other-linked-account-denied', `${route}/ingresar`, tokens['zero@example.invalid'], replay, 409);
    await expectStatus('receipt-reuse-with-changed-code-denied', `${route}/ingresar`, absentToken,
      { ...freshBody, id: receipt.id }, 409);
    await expectStatus('institution-snapshot-tampering-denied', `${route}/ingresar`, absentToken,
      { ...freshBody, id: randomUUID(), institucionId: alternative.id }, 409);
    assert.equal(await db.codigoIngresoEstudiantil.count({ where: { institucionId: alternative.id } }), 0);
    stage = 'prepare-only-alternative-code';
    const alternativeCode = `SPI-${randomBytes(16).toString('hex').toUpperCase()}`;
    temporary = { institucionId: alternative.id, operacionId: randomUUID() };
    await db.codigoIngresoEstudiantil.create({ data: { ...temporary, codigo: alternativeCode, revision: 1 } });
    await expectStatus('other-institution-valid-code-preview-denied', `${route}/consultar`, absentToken,
      { codigo: alternativeCode }, 409);
    await expectStatus('other-institution-valid-code-transfer-denied', `${route}/ingresar`, absentToken,
      { id: randomUUID(), codigo: alternativeCode, institucionId: alternative.id, revision: 1 }, 409);
    stage = 'unchanged-final-snapshot';
    assert.deepEqual(await snapshot(institution.id), before);
  } finally {
    try {
      if (temporary) {
        // Exact newly owned row only; never remove an unrelated/rotated code.
        assert.equal((await db.codigoIngresoEstudiantil.deleteMany({ where: temporary })).count, 1);
      }
    } finally { await db.$disconnect(); }
  }
  console.log(JSON.stringify({ verification: 'local HTTP and SQL, not human actions',
    passed: checks.length, checks, stateUnchanged: true, temporaryAlternativeCodeRemoved: !!temporary }));
})().catch(error => {
  console.error(`Owned C4 guards verification failed at ${stage}: ${error.name}. Inspect owned session.`);
  process.exitCode = 1;
});
