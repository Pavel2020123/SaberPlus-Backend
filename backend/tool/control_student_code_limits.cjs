// Guarded fixture controls for human C4 capacity/suspension tests. Local only.
const assert = require('node:assert/strict');
const { readFile, realpath, writeFile } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { PrismaClient } = require('@prisma/client');

(async () => {
  assert.equal(process.argv.length, 3);
  const action = process.argv[2];
  assert.ok(['full', 'suspend', 'restore', 'verify-denied'].includes(action));
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  try {
    const owner = await db.usuario.findUniqueOrThrow({
      where: { correo: 'teacher@example.invalid' }, select: { rol: true, institucionId: true },
    });
    const student = await db.usuario.findUniqueOrThrow({
      where: { correo: 'absent@example.invalid' }, select: { id: true, rol: true, institucionId: true },
    });
    assert.equal(owner.rol, 'PROFESOR'); assert.ok(owner.institucionId);
    assert.equal(student.rol, 'ESTUDIANTE'); assert.equal(student.institucionId, null);
    const institution = await db.institucion.findUniqueOrThrow({
      where: { id: owner.institucionId },
      select: { id: true, nombre: true, estadoVerificacion: true, limiteEstudiantes: true },
    });
    assert.equal(institution.nombre, 'Institucion de ensayo C3');
    assert.equal(await db.solicitudIngresoEstudiante.count({ where: { estudianteId: student.id, estado: 'PENDIENTE' } }), 0);
    const receipts = await db.ingresoInstitucionCodigo.count({ where: { estudianteId: student.id } });
    const auditEvents = await db.auditoriaInstitucion.count({ where: { afectadoId: student.id, accion: 'ESTUDIANTE_INGRESO_POR_CODIGO' } });
    assert.equal(receipts, 0); assert.equal(auditEvents, 0);
    const occupied = await db.usuario.count({ where: { institucionId: institution.id, rol: 'ESTUDIANTE' } });
    assert.equal(occupied, 1);
    if (action === 'verify-denied') {
      console.log(JSON.stringify({ verification: 'read-only', linked: false, receipts,
        auditEvents, occupied, limit: institution.limiteEstudiantes, state: institution.estadoVerificacion }));
      return;
    }
    const backupPath = join(directory, 'c4-limits-backup.json');
    let backup;
    try { backup = JSON.parse(await readFile(backupPath, 'utf8')); }
    catch (error) {
      if (error.code !== 'ENOENT' || action !== 'full') throw error;
      assert.equal(institution.estadoVerificacion, 'APROBADA');
      backup = { nonce: marker.nonce, institutionId: institution.id,
        state: institution.estadoVerificacion, limit: institution.limiteEstudiantes };
      await writeFile(backupPath, JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
    }
    assert.equal(backup.nonce, marker.nonce); assert.equal(backup.institutionId, institution.id);
    assert.equal(backup.state, 'APROBADA');
    assert.ok(backup.limit === null || (Number.isInteger(backup.limit) && backup.limit > 0));
    const data = action === 'full'
      ? { estadoVerificacion: backup.state, limiteEstudiantes: occupied }
      : { estadoVerificacion: action === 'suspend' ? 'SUSPENDIDA' : backup.state,
        limiteEstudiantes: backup.limit };
    await db.institucion.update({ where: { id: institution.id }, data });
    console.log(JSON.stringify({ preparation: 'owned synthetic fixtures only', action,
      occupied, limit: data.limiteEstudiantes, state: data.estadoVerificacion }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  console.error(`Owned C4 limits control failed: ${error.name}. Inspect owned session before retrying.`);
  process.exitCode = 1;
});
