// No standalone connection/environment loader. Registered by the owned C5 suite.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { join } = require('node:path');
const { LocalEditorialFileStore } = require('../src/editorial-files/editorial-file.store');
const { PrivateFileRuntime } = require('../src/private-files/private-file-runtime');
const { ProfilePhotoService } = require('../src/private-files/profile-photo.service');

exports.registerPrivateFileTests = function registerPrivateFileTests(context) {
  test('C5-D real Storage private photo and evidence HTTP with conservative recovery', {
    skip: !process.env.PRIVATE_FILES_SUPABASE_TEST_CONFIG,
  }, async () => {
    const { SupabaseEditorialFileStore } = require('../src/editorial-files/supabase-editorial-file.store');
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const config = JSON.parse(process.env.PRIVATE_FILES_SUPABASE_TEST_CONFIG);
    assert.match(config.url, /^http:\/\/127\.0\.0\.1:\d+$/);
    assert.match(config.bucket, /^private-[a-f0-9]{16}$/);
    const f = context();
    const previous = process.env.PRIVATE_FILES_LOCAL_ENABLED;
    const previousOps = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    try {
      const store = new SupabaseEditorialFileStore(config, fetch, 'private');
      const app = await f.server({ privateStore: store });
      const student = await f.user('ESTUDIANTE'), teacher = await f.user('PROFESOR'), admin = await f.user('ADMIN');
      const upload = async (url, actor, bytes, revision, mime) => {
        const body = new FormData();
        body.set('operacionId', randomUUID()); body.set('revision', String(revision));
        body.set('archivo', new Blob([bytes], { type: mime }), 'synthetic');
        const response = await f.call(url, f.tokenFor(actor), { method: 'POST', body }, app.base);
        assert.equal(response.status, 201);
        return response.data;
      };
      const photo = await upload('/cuenta/archivos/foto', student, f.image, 0, 'image/png');
      const bytes = await store.read(photo.id);
      const photoUrl = `/cuenta/archivos/foto/${photo.id}`;
      assert.deepEqual((await f.call(photoUrl, f.tokenFor(student), {}, app.base)).data, bytes);
      // Profile-photo policy denies ADMIN's role before looking up a private photo.
      assert.equal((await f.call(photoUrl, f.tokenFor(admin), {}, app.base)).status, 403);
      const vault = new LocalPrivateBackupVault(join(f.root, 'supabase-private-recovery'));
      const recovery = new PrivateFileRecoveryService(f.db, store, vault, new PrivateFileRuntime());
      await recovery.backup(admin.id, photo.id);
      await store.remove(photo.id);
      await recovery.restore(admin.id, photo.id);
      assert.deepEqual((await f.call(photoUrl, f.tokenFor(student), {}, app.base)).data, bytes);
      const request = await f.db.solicitudAltaInstitucion.create({ data: {
        solicitanteId: teacher.id, nombre: 'Owned private Storage fixture', nombreNormalizado: randomUUID(),
        ciudad: 'Local', ciudadNormalizada: 'local', correoInstitucional: 'fixture@example.invalid',
        contacto: 'Fixture', evidencia: 'Synthetic untrusted PDF',
      } });
      const pdf = Buffer.from('%PDF-1.7\nSynthetic private Storage attachment\n%%EOF');
      const evidenceUrl = `/cuenta/archivos/evidencias/${request.id}`;
      const evidence = await upload(evidenceUrl, teacher, pdf, request.revision, 'application/pdf');
      const download = await f.call(`${evidenceUrl}/${evidence.id}`, f.tokenFor(admin), {}, app.base);
      assert.equal(download.status, 200);
      assert.match(download.headers.get('content-disposition'), /attachment/);
      assert.deepEqual(download.data, pdf);
      assert.equal((await f.call(`${evidenceUrl}/${evidence.id}`, f.tokenFor(student), {}, app.base)).status, 404);
      await recovery.backup(admin.id, evidence.id);
      await store.remove(evidence.id);
      await recovery.restore(admin.id, evidence.id);
      assert.deepEqual(await store.read(evidence.id), pdf);
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_FILES_LOCAL_ENABLED;
      else process.env.PRIVATE_FILES_LOCAL_ENABLED = previous;
      if (previousOps === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previousOps;
    }
  });

  const run = (name, body) => test(`C5 private SQL: ${name}`, async () => {
    const previous = process.env.PRIVATE_FILES_LOCAL_ENABLED;
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    try {
      const c = context();
      const owner = await c.user('ESTUDIANTE');
      const actor = { sub: owner.id, versionSesion: owner.versionSesion };
      const disk = new LocalEditorialFileStore(join(c.root, 'private-fixtures'));
      const service = new ProfilePhotoService(c.db, disk, new PrivateFileRuntime());
      const dto = (revision = 0) => ({ operacionId: randomUUID(), revision });
      await body({ ...c, owner, actor, disk, service, dto });
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_FILES_LOCAL_ENABLED;
      else process.env.PRIVATE_FILES_LOCAL_ENABLED = previous;
    }
  });

  const requestFixture = async f => {
    const applicant = await f.user('PROFESOR');
    return f.db.solicitudAltaInstitucion.create({ data: {
      solicitanteId: applicant.id, nombre: 'C5 evidence clock fixture',
      nombreNormalizado: randomUUID(), ciudad: 'Local', ciudadNormalizada: 'local',
      correoInstitucional: 'fixture@example.invalid', contacto: 'Fixture',
      evidencia: 'Synthetic verification evidence; no personal documents.',
    } });
  };
  const registerBackup = (db, id, vaultId = '11111111-1111-4111-8111-111111111111') => db.$executeRaw`
    INSERT INTO "RespaldoArchivoPrivado" ("archivoId","vaultId") VALUES (${id}::uuid,${vaultId}::uuid)`;
  const backupReceipt = async (db, id) => (await db.$queryRaw`
    SELECT * FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${id}::uuid`)[0];
  const withBackupOperations = async body => {
    const previous = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    try { await body(); }
    finally {
      if (previous === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previous;
    }
  };

  run('operator restores missing photo bytes without changing identity or revision and refuses retired sources', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'recovery-fixtures'));
    const recovery = new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime());
    const admin = await f.user('ADMIN');
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    const before = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: saved.id } });
    const photoBefore = await f.db.fotoPrivadaPerfil.findUniqueOrThrow({ where: { usuarioId: f.owner.id } });
    const bytes = await f.disk.read(saved.id);
    await withBackupOperations(async () => {
      assert.deepEqual(await recovery.backup(admin.id, saved.id),
        { id: saved.id, bytesVerificados: bytes.length, respaldoVerificado: true });
      await f.disk.remove(saved.id);
      assert.deepEqual(await recovery.restore(admin.id, saved.id),
        { id: saved.id, bytesVerificados: bytes.length, recuperado: true });
      assert.deepEqual(await f.disk.read(saved.id), bytes);
      assert.deepEqual(await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: saved.id } }), before);
      assert.deepEqual(await f.db.fotoPrivadaPerfil.findUniqueOrThrow({ where: { usuarioId: f.owner.id } }), photoBefore);
      await f.service.remove(f.actor, saved.foto.revision);
      await f.disk.remove(saved.id);
      await assert.rejects(recovery.restore(admin.id, saved.id), e => e.getStatus() === 409);
      await assert.rejects(f.disk.read(saved.id));
    });
  });

  run('recovery rejects nonoperators before vault IO and preserves a different existing object', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    let calls = 0;
    const denied = new PrivateFileRecoveryService(f.db, f.disk,
      { identity: async () => { calls++; throw new Error('Unexpected vault IO'); } }, new PrivateFileRuntime());
    await withBackupOperations(async () => {
      for (const actor of [f.owner, await f.user('PROFESOR'),
        await f.user('ADMIN', { correoVerificado: false }),
        await f.user('ADMIN', { debeCambiarContrasena: true })]) {
        await assert.rejects(denied.backup(actor.id, saved.id), e => e.getStatus() === 403);
        await assert.rejects(denied.restore(actor.id, saved.id), e => e.getStatus() === 403);
      }
      assert.equal(calls, 0);
      assert.equal(await backupReceipt(f.db, saved.id), undefined);
      const verifiedAdmin = await f.user('ADMIN');
      process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'false';
      try {
        await assert.rejects(denied.backup(verifiedAdmin.id, saved.id), e => e.getStatus() === 503);
        await assert.rejects(denied.restore(verifiedAdmin.id, saved.id), e => e.getStatus() === 503);
        assert.equal(calls, 0);
      } finally { process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true'; }
      const vault = new LocalPrivateBackupVault(join(f.root, 'recovery-fixtures'));
      const recovery = new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime());
      const admin = await f.user('ADMIN');
      await recovery.backup(admin.id, saved.id);
      await f.disk.remove(saved.id);
      const otherVault = new LocalPrivateBackupVault(join(f.root, 'different-recovery-fixtures'));
      const otherRecovery = new PrivateFileRecoveryService(f.db, f.disk, otherVault, new PrivateFileRuntime());
      await assert.rejects(otherRecovery.restore(admin.id, saved.id), e => e.getStatus() === 409);
      await assert.rejects(f.disk.read(saved.id));
      const different = Buffer.from('Synthetic different object; must not be overwritten');
      await f.disk.put(saved.id, different);
      await assert.rejects(recovery.restore(admin.id, saved.id));
      assert.deepEqual(await f.disk.read(saved.id), different);
    });
  });

  run('late restore after transaction timeout remains physically reconcilable after an earlier erasure acknowledgement', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const { PrivateFileCleanupService } = require('../src/private-files/private-file-cleanup.service');
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    const admin = await f.user('ADMIN');
    const vault = new LocalPrivateBackupVault(join(f.root, 'late-recovery-fixtures'));
    await withBackupOperations(async () => {
      await new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime()).backup(admin.id, saved.id);
      await f.disk.remove(saved.id);
      let release, entered;
      const gate = new Promise(resolve => { release = resolve; });
      const started = new Promise(resolve => { entered = resolve; });
      const lateStore = {
        put: async (id, bytes) => { entered(); await gate; return f.disk.put(id, bytes); },
        read: id => f.disk.read(id),
        remove: async () => { throw new Error('Synthetic compensating cleanup outage'); },
      };
      const shortTransaction = { $transaction: (callback, options) =>
        f.db.$transaction(callback, { ...options, timeout: 500 }) };
      const recovery = new PrivateFileRecoveryService(shortTransaction, lateStore, vault, new PrivateFileRuntime());
      const result = recovery.restore(admin.id, saved.id).then(() => ({ ok: true }), error => ({ error }));
      let firstAcknowledgement;
      try {
        await Promise.race([started, result.then(() => {
          throw new Error('Recovery failed before entering the controlled IO');
        })]);
        // This waits for the real PostgreSQL lock to be released by timeout.
        await f.service.remove(f.actor, saved.foto.revision);
        firstAcknowledgement = (await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: saved.id } })).bytesRetiradosEn;
        assert.ok(firstAcknowledgement);
      } finally { release(); }
      assert.ok((await result).error);
      assert.ok((await f.disk.read(saved.id)).length > 0); // Late IO really happened.
      const worker = new PrivateFileCleanupService(f.db, f.disk, new PrivateFileRuntime());
      for (let n=0; n<10; n++) await worker.runOnce();
      await assert.rejects(f.disk.read(saved.id));
      assert.deepEqual((await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: saved.id } })).bytesRetiradosEn,
        firstAcknowledgement);
    });
  });

  run('technical CLI backs up and restores through owned-marker and ADMIN checks', async f => {
    const { promisify } = require('node:util');
    const { execFile } = require('node:child_process');
    const execute = promisify(execFile);
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    const bytes = await f.disk.read(saved.id);
    const admin = await f.user('ADMIN');
    const cli = join(__dirname, '..', 'tool', 'private_file_operations.mjs');
    const marker = join(f.root, '..', 'owner.json');
    const command = (operation, actor) => execute(process.execPath,
      [cli, operation, marker, actor, saved.id], { timeout: 45000, windowsHide: true });
    await assert.rejects(command('backup', f.owner.id), error =>
      JSON.parse(error.stderr.trim()).status === 403);
    assert.equal(await backupReceipt(f.db, saved.id), undefined);
    const result = JSON.parse((await command('backup', admin.id)).stdout.trim());
    assert.deepEqual(result, { id: saved.id, bytesVerificados: bytes.length, respaldoVerificado: true });
    await f.disk.remove(saved.id);
    assert.deepEqual(JSON.parse((await command('restore', admin.id)).stdout.trim()),
      { id: saved.id, bytesVerificados: bytes.length, recuperado: true });
    assert.deepEqual(await f.disk.read(saved.id), bytes);
  });

  run('backup worker removes real encrypted copies and keys only after retirement, with durable retry', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateBackupCleanupService } = require('../src/private-files/private-backup-cleanup.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'backup-fixtures'));
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    const row = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: saved.id } });
    const meta = { id: row.id, sha256: row.sha256, bytes: row.bytes, mime: row.mime };
    const bytes = await f.disk.read(row.id);
    await registerBackup(f.db, row.id, await vault.identity());
    await vault.save(meta, bytes);
    const worker = new PrivateBackupCleanupService(f.db, vault, new PrivateFileRuntime());
    await withBackupOperations(async () => {
      await worker.runOnce(); // A live backup must not be touched.
      assert.deepEqual(await vault.read(meta), bytes);
      await f.service.remove(f.actor, saved.foto.revision);
      const wrongVault = new LocalPrivateBackupVault(join(f.root, 'wrong-backup-fixtures'));
      const wrongWorker = new PrivateBackupCleanupService(f.db, wrongVault, new PrivateFileRuntime());
      assert.ok((await wrongWorker.runOnce()).pending >= 1);
      assert.equal((await backupReceipt(f.db, row.id)).eliminadoEn, null);
      assert.deepEqual(await vault.read(meta), bytes);
      const failed = new PrivateBackupCleanupService(f.db,
        { identity: () => vault.identity(), retire: async () => { throw new Error('Synthetic backup disk outage'); } }, new PrivateFileRuntime());
      assert.ok((await failed.runOnce()).pending >= 1);
      assert.equal((await backupReceipt(f.db, row.id)).eliminadoEn, null);
      assert.deepEqual(await vault.read(meta), bytes);
      const first = worker.runOnce();
      assert.equal(first, worker.runOnce());
      await first;
      for (let n=0; n<3 && !(await backupReceipt(f.db, row.id)).eliminadoEn; n++) await worker.runOnce();
      assert.ok((await backupReceipt(f.db, row.id)).eliminadoEn instanceof Date);
      await assert.rejects(vault.read(meta));
      await assert.rejects(vault.save(meta, bytes));
      const { access } = require('node:fs/promises');
      for (const kind of ['keys', 'envelopes']) {
        await assert.rejects(access(join(f.root, 'backup-fixtures', kind, row.id)), e => e.code === 'ENOENT');
      }
      const stable = await backupReceipt(f.db, row.id);
      await new PrivateBackupCleanupService(f.db,
        new LocalPrivateBackupVault(join(f.root, 'backup-fixtures')), new PrivateFileRuntime()).runOnce();
      assert.deepEqual((await backupReceipt(f.db, row.id)).eliminadoEn, stable.eliminadoEn);
    });
  });

  run('backup worker disabled flag cannot touch registered private copies', async f => {
    const { PrivateBackupCleanupService } = require('../src/private-files/private-backup-cleanup.service');
    let calls = 0;
    const worker = new PrivateBackupCleanupService(f.db, { retire: async () => { calls++; } }, new PrivateFileRuntime());
    const previous = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'false';
    try { assert.throws(() => worker.runOnce(), e => e.getStatus() === 503); }
    finally {
      if (previous === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previous;
    }
    assert.equal(calls, 0);
  });

  run('backup registry persists the cleanup obligation when the source is retired', async f => {
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    await registerBackup(f.db, saved.id);
    const initial = await backupReceipt(f.db, saved.id);
    assert.equal(initial.retiradoEn, null);
    assert.equal(initial.eliminadoEn, null);
    await assert.rejects(f.db.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "vaultId"=${randomUUID()}::uuid
      WHERE "archivoId"=${saved.id}::uuid`, e => e.meta?.code === '23514');
    await f.service.remove(f.actor, saved.foto.revision);
    const retired = await backupReceipt(f.db, saved.id);
    assert.ok(retired.retiradoEn instanceof Date);
    assert.equal(retired.eliminadoEn, null); // Not a claim that the copy was erased.
    await f.db.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "eliminadoEn"=clock_timestamp()
      WHERE "archivoId"=${saved.id}::uuid`;
    const cleaned = await backupReceipt(f.db, saved.id);
    assert.ok(cleaned.eliminadoEn instanceof Date);
    await assert.rejects(f.db.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "retiradoEn"=NULL,"eliminadoEn"=NULL
      WHERE "archivoId"=${saved.id}::uuid`, e => e.meta?.code === '23514');
    await assert.rejects(f.db.$executeRaw`DELETE FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${saved.id}::uuid`,
      e => e.meta?.code === '23514');
  });

  run('backup registry rejects prepared/retired files and early erasure acknowledgement', async f => {
    const { prepareProfilePhoto } = require('../src/private-files/private-file-content');
    const content = await prepareProfilePhoto(f.image);
    const prepared = await f.db.archivoPrivado.create({ data: {
      id: randomUUID(), propietarioId: f.owner.id, operacionId: randomUUID(),
      proposito: 'FOTO_PERFIL', revisionEsperada: 0, mime: 'image/webp',
      bytes: content.bytes, sha256: content.sha256,
    } });
    await assert.rejects(registerBackup(f.db, prepared.id), e => e.meta?.code === '23514');
    const saved = await f.service.upload(f.actor, f.dto(), f.image);
    await registerBackup(f.db, saved.id);
    await assert.rejects(f.db.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "eliminadoEn"=clock_timestamp()
      WHERE "archivoId"=${saved.id}::uuid`, e => e.meta?.code === '23514');
    await assert.rejects(f.db.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "retiradoEn"=clock_timestamp()
      WHERE "archivoId"=${saved.id}::uuid`, e => e.meta?.code === '23514');
    await f.service.remove(f.actor, saved.foto.revision);
    const second = await f.service.upload(f.actor, f.dto(2), f.image);
    await f.service.remove(f.actor, second.foto.revision);
    await assert.rejects(registerBackup(f.db, second.id), e => e.meta?.code === '23514');
  });
  const resolutions = (db, id) => db.$queryRaw`
    SELECT * FROM "ResolucionEvidenciaInstitucional"
    WHERE "solicitudId"=${id}::uuid ORDER BY revision`;

  run('evidence resolution starts exactly 2160 hours at final review, not information requests', async f => {
    const request = await requestFixture(f);
    await f.db.solicitudAltaInstitucion.update({ where: { id: request.id },
      data: { estado: 'REQUIERE_INFORMACION', revision: { increment: 1 } } });
    assert.equal((await resolutions(f.db, request.id)).length, 0);
    const before = Date.now();
    await f.db.solicitudAltaInstitucion.update({ where: { id: request.id },
      data: { estado: 'APROBADA', revision: { increment: 1 } } });
    const [clock] = await resolutions(f.db, request.id);
    assert.equal(clock.revision, 3);
    assert.equal(clock.estado, 'APROBADA');
    assert.equal(clock.venceEn - clock.resueltaEn, 90 * 24 * 60 * 60 * 1000);
    assert.ok(clock.resueltaEn.getTime() >= before - 1000);
    assert.ok(clock.resueltaEn.getTime() <= Date.now() + 1000);
  });

  run('evidence correction and reactivation cannot extend the first resolution clock', async f => {
    const request = await requestFixture(f);
    for (const estado of ['APROBADA', 'APROBADA', 'SUSPENDIDA', 'APROBADA']) {
      await f.db.solicitudAltaInstitucion.update({ where: { id: request.id },
        data: { estado, revision: { increment: 1 } } });
    }
    const clocks = await resolutions(f.db, request.id);
    assert.equal(clocks.length, 1);
    assert.equal(clocks[0].revision, 2);
  });

  run('evidence resubmission preserves old clocks and creates a separate next cycle', async f => {
    const request = await requestFixture(f);
    for (const estado of ['RECHAZADA', 'PENDIENTE', 'RECHAZADA']) {
      await f.db.solicitudAltaInstitucion.update({ where: { id: request.id },
        data: { estado, revision: { increment: 1 } } });
    }
    const clocks = await resolutions(f.db, request.id);
    assert.deepEqual(clocks.map(row => row.revision), [2, 4]);
    const deadline = async revision => (await f.db.$queryRaw`
      SELECT "venceEn" FROM "ResolucionEvidenciaInstitucional"
      WHERE "solicitudId"=${request.id}::uuid AND revision>${revision}
      ORDER BY revision LIMIT 1`)[0]?.venceEn;
    assert.deepEqual(await deadline(1), clocks[0].venceEn);
    assert.deepEqual(await deadline(3), clocks[1].venceEn);
    await assert.rejects(f.db.$executeRaw`
      UPDATE "ResolucionEvidenciaInstitucional" SET "venceEn"="venceEn"+INTERVAL '1 day'
      WHERE "solicitudId"=${request.id}::uuid`, e => e.meta?.code === '23514');
    await assert.rejects(f.db.$executeRaw`
      DELETE FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${request.id}::uuid`,
      e => e.meta?.code === '23514');
    assert.deepEqual(await resolutions(f.db, request.id), clocks);
  });

  run('evidence resolution rejects unchanged revision and denies public database roles', async f => {
    const request = await requestFixture(f);
    await assert.rejects(f.db.solicitudAltaInstitucion.update({ where: { id: request.id },
      data: { estado: 'RECHAZADA' } }));
    assert.equal((await resolutions(f.db, request.id)).length, 0);
    for (const role of ['anon', 'authenticated']) {
      const [acl] = await f.db.$queryRaw`
        SELECT has_table_privilege(${role}, '"ResolucionEvidenciaInstitucional"', 'SELECT') AS allowed`;
      assert.equal(acl.allowed, false);
    }
    const [rls] = await f.db.$queryRaw`
      SELECT relrowsecurity FROM pg_class WHERE oid='"ResolucionEvidenciaInstitucional"'::regclass`;
    assert.equal(rls.relrowsecurity, true);
  });

  run('own profile is private and operation replay does not change revision', async f => {
    const command = f.dto();
    const uploaded = await f.service.upload(f.actor, command, f.image);
    assert.equal(uploaded.foto.revision, 1);
    assert.equal(uploaded.estado, 'ACTIVO');
    assert.equal((await f.service.upload(f.actor, command, f.image)).id, uploaded.id);
    assert.equal((await f.service.own(f.actor)).revision, 1);
    assert.equal(await f.db.archivoPrivado.count({ where: { propietarioId: f.owner.id } }), 1);
    assert.ok((await f.service.content(f.actor, uploaded.id)).length);
    assert.equal((await f.db.usuario.findUnique({ where: { id: f.owner.id } })).fotoPerfil, null);
  });

  run('another account cannot read bytes or operation receipts', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    const stranger = await f.user('ESTUDIANTE');
    const actor = { sub: stranger.id, versionSesion: stranger.versionSesion };
    await assert.rejects(f.service.content(actor, uploaded.id), e => e.getStatus() === 404);
    await assert.rejects(f.service.operation(actor, uploaded.operacionId), e => e.getStatus() === 404);
  });

  run('same operation cannot be reused with a different revision', async f => {
    const command = f.dto();
    await f.service.upload(f.actor, command, f.image);
    await assert.rejects(f.service.upload(f.actor, { ...command, revision: 1 }, f.image), e => e.getStatus() === 409);
    assert.equal((await f.service.own(f.actor)).revision, 1);
  });

  run('retired replay cannot recreate physically deleted bytes', async f => {
    const command = f.dto();
    const first = await f.service.upload(f.actor, command, f.image);
    const second = await f.service.upload(f.actor, f.dto(1), f.image);
    assert.notEqual(first.id, second.id);
    await assert.rejects(f.disk.read(first.id));
    const replay = await f.service.upload(f.actor, command, f.image);
    assert.equal(replay.estado, 'RETIRADO');
    assert.equal(replay.foto.archivoId, second.id);
    await assert.rejects(f.disk.read(first.id));
  });

  run('concurrent replacements have one winner with one active photo', async f => {
    const results = await Promise.allSettled([
      f.service.upload(f.actor, f.dto(), f.image),
      f.service.upload(f.actor, f.dto(), f.image),
    ]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const failure = results.find(r => r.status === 'rejected');
    assert.equal(failure.reason.getStatus(), 409);
    assert.equal(await f.db.archivoPrivado.count({ where: {
      propietarioId: f.owner.id, estado: 'ACTIVO',
    } }), 1);
  });

  run('stale deletion cannot remove a newer photo; valid removal is repeatable', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    await assert.rejects(f.service.remove(f.actor, 0), e => e.getStatus() === 409);
    assert.ok((await f.service.content(f.actor, uploaded.id)).length);
    const removed = await f.service.remove(f.actor, 1);
    assert.equal(removed.foto.archivoId, null);
    assert.equal(removed.limpiezaPendiente, false);
    assert.equal((await f.service.remove(f.actor, 1)).foto.revision, 2);
    await assert.rejects(f.service.content(f.actor, uploaded.id), e => e.getStatus() === 404);
    await assert.rejects(f.disk.read(uploaded.id));
  });

  run('upload failure leaves a recoverable private reservation, not a visible photo', async f => {
    const command = f.dto();
    const store = { put: async () => { throw new Error('synthetic IO'); }, read: id => f.disk.read(id), remove: id => f.disk.remove(id) };
    const service = new ProfilePhotoService(f.db, store, new PrivateFileRuntime());
    await assert.rejects(service.upload(f.actor, command, f.image));
    assert.equal((await f.service.operation(f.actor, command.operacionId)).estado, 'PREPARADO');
    assert.equal((await f.service.own(f.actor)).archivoId, null);
    assert.equal((await f.service.upload(f.actor, command, f.image)).estado, 'ACTIVO');
  });

  run('physical deletion failure does not reopen a logically retired photo', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    const store = { put: (id, bytes) => f.disk.put(id, bytes), read: id => f.disk.read(id), remove: async () => { throw new Error('synthetic IO'); } };
    const service = new ProfilePhotoService(f.db, store, new PrivateFileRuntime());
    assert.equal((await service.remove(f.actor, 1)).limpiezaPendiente, true);
    await assert.rejects(service.content(f.actor, uploaded.id), e => e.getStatus() === 404);
    const row = await f.db.archivoPrivado.findUnique({ where: { id: uploaded.id } });
    assert.equal(row.estado, 'RETIRADO');
    assert.equal(row.bytesRetiradosEn, null);
    const retried = await f.service.retryRemoval(f.actor, uploaded.operacionId);
    assert.equal(retried.limpiezaPendiente, false);
    await assert.rejects(f.disk.read(uploaded.id));
  });

  run('retirement during read IO removes permission before returning bytes', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    const store = {
      put: (id, bytes) => f.disk.put(id, bytes), remove: id => f.disk.remove(id),
      read: async id => { const bytes = await f.disk.read(id); await f.service.remove(f.actor, 1); return bytes; },
    };
    const service = new ProfilePhotoService(f.db, store, new PrivateFileRuntime());
    await assert.rejects(service.content(f.actor, uploaded.id), e => e.getStatus() === 404);
  });

  run('session replacement invalidates existing photo access', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    await f.db.usuario.update({ where: { id: f.owner.id }, data: { versionSesion: { increment: 1 } } });
    await assert.rejects(f.service.content(f.actor, uploaded.id), e => e.getStatus() === 403);
  });

  run('database rejects retired resurrection and identity mutation', async f => {
    const uploaded = await f.service.upload(f.actor, f.dto(), f.image);
    await f.service.remove(f.actor, 1);
    await assert.rejects(f.db.$executeRaw`UPDATE "ArchivoPrivado" SET estado='ACTIVO',"retiradoEn"=NULL WHERE id=${uploaded.id}::uuid`, e => e.meta?.code === '23514');
    await assert.rejects(f.db.$executeRaw`UPDATE "ArchivoPrivado" SET sha256=${'b'.repeat(64)} WHERE id=${uploaded.id}::uuid`, e => e.meta?.code === '23514');
  });

  run('disabled runtime prevents reservation and storage IO', async f => {
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'false';
    await assert.rejects(f.service.upload(f.actor, f.dto(), f.image), e => e.getStatus() === 503);
    assert.equal(await f.db.archivoPrivado.count({ where: { propietarioId: f.owner.id } }), 0);
  });

  run('confirmed cancellation tombstones a reservation and cannot cancel an active photo', async f => {
    const command = f.dto();
    const unavailable = { put: async () => { throw new Error('synthetic IO'); }, read: id => f.disk.read(id), remove: id => f.disk.remove(id) };
    await assert.rejects(new ProfilePhotoService(f.db, unavailable, new PrivateFileRuntime()).upload(f.actor, command, f.image));
    const cancelled = await f.service.cancel(f.actor, command.operacionId);
    assert.equal(cancelled.estado, 'RETIRADO');
    assert.equal((await f.service.upload(f.actor, command, f.image)).estado, 'RETIRADO');
    await assert.rejects(f.disk.read(cancelled.id));
    const active = await f.service.upload(f.actor, f.dto(), f.image);
    await assert.rejects(f.service.cancel(f.actor, active.operacionId), e => e.getStatus() === 409);
    await assert.rejects(f.service.cancel(f.actor, randomUUID()), e => e.getStatus() === 404);
  });

  const sendPhoto = (f, fields = {}, token = f.tokenFor(f.owner), bytes = f.image) => {
    const body = new FormData();
    for (const [key, value] of Object.entries({ revision: '0', operacionId: randomUUID(), ...fields })) body.append(key, value);
    body.append('archivo', new Blob([bytes], { type: 'image/png' }), 'untrusted-name.png');
    return f.call('/cuenta/archivos/foto', token, { method: 'POST', body });
  };

  run('HTTP authenticates self, returns private pixels and rejects another account', async f => {
    const uploaded = await sendPhoto(f);
    assert.equal(uploaded.status, 201);
    const url = uploaded.data.foto.contenido;
    const picture = await f.call(url, f.tokenFor(f.owner));
    assert.equal(picture.status, 200);
    assert.match(picture.headers.get('cache-control'), /no-store/);
    assert.equal(picture.headers.get('x-content-type-options'), 'nosniff');
    assert.match(picture.headers.get('content-type'), /image\/webp/);
    const other = await f.user('ESTUDIANTE');
    assert.equal((await f.call(url, f.tokenFor(other))).status, 404);
    assert.equal((await f.call(url, null)).status, 401);
    assert.equal((await f.call('/cuenta/archivos/foto', f.tokenFor(other))).data.archivoId, null);
  });

  run('HTTP refuses owner/URL injection and invalid revisions without reserving', async f => {
    for (const fields of [{ propietarioId: randomUUID() }, { revision: '' }, { revision: '1e0' }, { revision: '-1' }, { url: 'https://example.invalid/photo' }]) {
      assert.equal((await sendPhoto(f, fields)).status, 400);
    }
    assert.equal(await f.db.archivoPrivado.count({ where: { propietarioId: f.owner.id } }), 0);
  });

  run('HTTP rejects non-image content regardless of name or claimed MIME', async f => {
    assert.equal((await sendPhoto(f, {}, f.tokenFor(f.owner), Buffer.from('%PDF-1.7\n%%EOF'))).status, 400);
    assert.equal(await f.db.archivoPrivado.count({ where: { propietarioId: f.owner.id } }), 0);
  });

  run('HTTP temporary-password account and ADMIN cannot upload a personal photo', async f => {
    const temporary = await f.user('ESTUDIANTE', { debeCambiarContrasena: true });
    const admin = await f.user('ADMIN');
    assert.equal((await sendPhoto(f, {}, f.tokenFor(temporary))).status, 403);
    assert.equal((await sendPhoto(f, {}, f.tokenFor(admin))).status, 403);
  });

  run('private tables deny direct anon/authenticated SQL access', async f => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of ['ArchivoPrivado', 'FotoPrivadaPerfil', 'RespaldoArchivoPrivado']) {
        // Role/table names come only from this fixed test list, not a request.
        await assert.rejects(f.db.$transaction(async tx => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`);
        }), e => e.meta?.code === '42501');
      }
    }
  });

  run('reviewed LIC-4 purge retires photos, invalidates review on change and denies late revival', async f => {
    const { SupresionCuentaService } = require('../src/institucion/supresion-cuenta.service');
    const privacy = new SupresionCuentaService(f.db);
    const admin = await f.user('ADMIN');
    await f.service.upload(f.actor, f.dto(), f.image);
    const request = await privacy.solicitar(f.owner.id, f.owner.id, randomUUID(), 'Own C5 photo fixture deletion');
    const initial = await privacy.revisar(admin.id, request.id);
    assert.equal(initial.registros.archivosPrivados, 1);
    const photo = await f.service.upload(f.actor, f.dto(1), f.image);
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateBackupCleanupService } = require('../src/private-files/private-backup-cleanup.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'backup-fixtures'));
    await registerBackup(f.db, photo.id, await vault.identity());
    const source = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: photo.id } });
    const meta = { id: source.id, bytes: source.bytes, sha256: source.sha256, mime: source.mime };
    await vault.save(meta, await f.disk.read(source.id));
    const previous = process.env.ACCOUNT_SUPPRESSION_ENABLED;
    process.env.ACCOUNT_SUPPRESSION_ENABLED = 'true';
    try {
      await assert.rejects(privacy.ejecutar(admin.id, request.id, request.version, initial.huellaRevision, 'SUPRIMIR CUENTA'), e => e.getStatus() === 409);
      const review = await privacy.revisar(admin.id, request.id);
      assert.equal(review.registros.revisionFotoPrivada, 2);
      await privacy.ejecutar(admin.id, request.id, review.version, review.huellaRevision, 'SUPRIMIR CUENTA');
      assert.equal(await f.db.fotoPrivadaPerfil.count({ where: { usuarioId: f.owner.id } }), 0);
      assert.equal(await f.db.archivoPrivado.count({ where: { propietarioId: f.owner.id, estado: { not: 'RETIRADO' } } }), 0);
      await assert.rejects(f.service.content(f.actor, photo.id), e => e.getStatus() === 403);
      await assert.rejects(f.db.$executeRaw`UPDATE "ArchivoPrivado" SET estado='ACTIVO',"retiradoEn"=NULL WHERE id=${photo.id}::uuid`, e => e.meta?.code === '23514');
      const row = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: photo.id } });
      assert.equal(row.bytesRetiradosEn, null); // Durable physical-cleanup obligation, not a claimed deletion.
      const backup = await backupReceipt(f.db, photo.id);
      assert.ok(backup.retiradoEn instanceof Date);
      assert.equal(backup.eliminadoEn, null);
      await withBackupOperations(async () => {
        const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
        const recovery = new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime());
        await assert.rejects(recovery.restore(admin.id, photo.id), e => e.getStatus() === 409);
        await assert.rejects(recovery.backup(admin.id, photo.id), e => e.getStatus() === 409);
        const worker = new PrivateBackupCleanupService(f.db, vault, new PrivateFileRuntime());
        for (let n=0; n<5 && !(await backupReceipt(f.db, photo.id)).eliminadoEn; n++) await worker.runOnce();
        assert.ok((await backupReceipt(f.db, photo.id)).eliminadoEn instanceof Date);
        await assert.rejects(vault.read(meta));
      });
    } finally {
      if (previous === undefined) delete process.env.ACCOUNT_SUPPRESSION_ENABLED;
      else process.env.ACCOUNT_SUPPRESSION_ENABLED = previous;
    }
  });
};
