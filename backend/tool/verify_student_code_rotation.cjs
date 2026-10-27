// Read-only database checks; only the baseline metadata is written to owned tmp.
const assert = require('node:assert/strict');
const { readFile, realpath, writeFile } = require('node:fs/promises');
const { join, dirname, basename } = require('node:path');
const { tmpdir } = require('node:os');
const { PrismaClient } = require('@prisma/client');

(async () => {
  assert.equal(process.argv.length, 3);
  const action = process.argv[2];
  assert.ok(['baseline', 'unchanged', 'renewed'].includes(action));
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(marker.url, marker);
  const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  try {
    const current = await db.$transaction(async tx => {
      const owner = await tx.usuario.findUniqueOrThrow({
        where: { correo: 'teacher@example.invalid' }, select: { rol: true, institucionId: true },
      });
      assert.equal(owner.rol, 'PROFESOR'); assert.ok(owner.institucionId);
      const code = await tx.codigoIngresoEstudiantil.findUniqueOrThrow({
        where: { institucionId: owner.institucionId }, select: { revision: true, operacionId: true },
      });
      const audits = await tx.auditoriaInstitucion.count({ where: {
        institucionId: owner.institucionId, accion: 'CODIGO_ESTUDIANTIL_RENOVADO',
      } });
      return { nonce: marker.nonce, institutionId: owner.institucionId,
        revision: code.revision, operationId: code.operacionId, audits };
    }, { isolationLevel: 'RepeatableRead' });
    const path = join(directory, 'c4-rotation-baseline.json');
    if (action === 'baseline') {
      await writeFile(path, JSON.stringify(current), { flag: 'wx', mode: 0o600 });
    } else {
      const previous = JSON.parse(await readFile(path, 'utf8'));
      assert.equal(previous.nonce, marker.nonce);
      assert.equal(previous.institutionId, current.institutionId);
      const increment = action === 'renewed' ? 1 : 0;
      assert.equal(current.revision, previous.revision + increment);
      assert.equal(current.audits, previous.audits + increment);
      if (increment) assert.notEqual(current.operationId, previous.operationId);
      else assert.equal(current.operationId, previous.operationId);
    }
    console.log(JSON.stringify({ verification: 'read-only rotation metadata', action,
      revision: current.revision, auditEvents: current.audits }));
  } finally { await db.$disconnect(); }
})().catch(error => {
  console.error(`Owned C4 rotation verification failed: ${error.name}. Database unchanged.`);
  process.exitCode = 1;
});
