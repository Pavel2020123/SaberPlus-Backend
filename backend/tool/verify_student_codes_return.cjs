// Read-only evidence after human C4 cancellation or network recovery tests.
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { PrismaClient } = require('@prisma/client');

(async () => {
  assert.ok(process.argv.length === 2 || process.argv.length === 3);
  const email = process.argv[2] || 'zero@example.invalid';
  assert.ok(['zero@example.invalid', 'absent@example.invalid'].includes(email));
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  try {
    const evidence = await db.$transaction(async tx => {
      const user = await tx.usuario.findUniqueOrThrow({
        where: { correo: email },
        select: { id: true, rol: true, institucionId: true },
      });
      const owner = await tx.usuario.findUniqueOrThrow({
        where: { correo: 'teacher@example.invalid' }, select: { institucionId: true },
      });
      assert.equal(user.rol, 'ESTUDIANTE');
      assert.ok(owner.institucionId);
      assert.equal(user.institucionId, owner.institucionId);
      const requests = await tx.solicitudIngresoEstudiante.findMany({
        where: { estudianteId: user.id }, select: { estado: true, revision: true },
      });
      assert.equal(requests.length, email === 'zero@example.invalid' ? 1 : 0);
      if (requests.length) {
        assert.equal(requests[0].estado, 'CANCELADA');
        assert.equal(requests[0].revision, 1);
      }
      const receipts = await tx.ingresoInstitucionCodigo.findMany({
        where: { estudianteId: user.id }, select: { id: true, institucionId: true },
      });
      assert.equal(receipts.length, 1);
      assert.equal(receipts[0].institucionId, user.institucionId);
      const audit = await tx.auditoriaInstitucion.count({ where: {
        actorId: user.id, afectadoId: user.id, institucionId: user.institucionId,
        accion: 'ESTUDIANTE_INGRESO_POR_CODIGO',
        detalle: { path: ['operacionId'], equals: receipts[0].id },
      } });
      assert.equal(audit, 1);
      assert.equal(await tx.auditoriaInstitucion.count({ where: {
        afectadoId: user.id, accion: 'ESTUDIANTE_INGRESO_POR_CODIGO',
      } }), 1);
      const groups = await tx.claseEstudiante.count({ where: { usuarioId: user.id } });
      assert.equal(groups, 0);
      const teacherMemberships = await tx.miembroInstitucion.count({ where: { usuarioId: user.id } });
      assert.equal(teacherMemberships, 0);
      return { account: email, role: user.rol, linkedToExpectedInstitution: true,
        requests: requests.length, requestState: requests[0]?.estado ?? null,
        requestRevision: requests[0]?.revision ?? null, receipts: receipts.length,
        matchingAuditEvents: audit, groups, teacherMemberships };
    }, { isolationLevel: 'RepeatableRead' });
    console.log(JSON.stringify({ verification: 'read-only SQL after human test', ...evidence }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  console.error(`Owned C4 return verification failed: ${error.name}. No data changed.`);
  process.exitCode = 1;
});
