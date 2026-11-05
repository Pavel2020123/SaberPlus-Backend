// Loaded only by the existing owned/disposable C5 runner; no environment loader.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { join, dirname } = require('node:path');
const { access, mkdir, readFile } = require('node:fs/promises');
const { InstitutionEvidenceService } = require('../src/private-files/institution-evidence.service');
const { PrivateFileRuntime } = require('../src/private-files/private-file-runtime');
const { LocalEditorialFileStore } = require('../src/editorial-files/editorial-file.store');

exports.registerInstitutionEvidenceTests = context => {
  const pdf = Buffer.from('%PDF-1.7\nSynthetic untrusted attachment\n%%EOF');
  const run = (name, body) => test(`C5 private SQL: evidence ${name}`, async t => {
    const previous = process.env.PRIVATE_FILES_LOCAL_ENABLED;
    process.env.PRIVATE_FILES_LOCAL_ENABLED = 'true';
    try {
      const c = context();
      const owner = await c.user('PROFESOR');
      const admin = await c.user('ADMIN');
      const actor = { sub: owner.id, versionSesion: owner.versionSesion };
      const reviewer = { sub: admin.id, versionSesion: admin.versionSesion };
      const request = await c.db.solicitudAltaInstitucion.create({ data: {
        solicitanteId: owner.id, nombre: 'C5 private attachment fixture',
        nombreNormalizado: randomUUID(), ciudad: 'Local', ciudadNormalizada: 'local',
        correoInstitucional: 'fixture@example.invalid', contacto: 'Fixture', evidencia: 'Synthetic local-only evidence.',
      } });
      const disk = new LocalEditorialFileStore(join(c.root, 'private-fixtures'));
      const service = new InstitutionEvidenceService(c.db, disk, new PrivateFileRuntime());
      const dto = (revision = request.revision) => ({ revision, operacionId: randomUUID() });
      await body({ ...c, owner, admin, actor, reviewer, request, disk, service, dto, pdf, t });
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_FILES_LOCAL_ENABLED;
      else process.env.PRIVATE_FILES_LOCAL_ENABLED = previous;
    }
  });
  const expiredClock = f => f.db.$executeRaw`
    INSERT INTO "ResolucionEvidenciaInstitucional" ("solicitudId",revision,estado,"resueltaEn","venceEn")
    VALUES (${f.request.id}::uuid,100,'RECHAZADA',
      date_trunc('milliseconds',CURRENT_TIMESTAMP)-INTERVAL '2161 hours',
      date_trunc('milliseconds',CURRENT_TIMESTAMP)-INTERVAL '1 hour')`;

  run('operator restores an active PDF but cannot resurrect expired evidence or extend its clock', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'evidence-recovery-fixtures'));
    const recovery = new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime());
    const previous = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    try {
      const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
      await recovery.backup(f.admin.id, uploaded.id);
      await f.disk.remove(uploaded.id);
      await recovery.restore(f.admin.id, uploaded.id);
      assert.deepEqual(await f.disk.read(uploaded.id), f.pdf);
      await expiredClock(f);
      const clock = await f.db.$queryRaw`SELECT * FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${f.request.id}::uuid`;
      await f.disk.remove(uploaded.id);
      await assert.rejects(recovery.restore(f.admin.id, uploaded.id), e => e.getStatus() === 409);
      await assert.rejects(recovery.backup(f.admin.id, uploaded.id), e => e.getStatus() === 409);
      await assert.rejects(f.disk.read(uploaded.id));
      assert.deepEqual(await f.db.$queryRaw`SELECT * FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${f.request.id}::uuid`, clock);
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previous;
    }
  });

  run('expiry during recovery IO retires the source and removes restored bytes and backup keys', async f => {
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateFileRecoveryService } = require('../src/private-files/private-file-recovery.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'expiring-recovery-fixtures'));
    const previous = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    try {
      const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
      const recovery = new PrivateFileRecoveryService(f.db, f.disk, vault, new PrivateFileRuntime());
      await recovery.backup(f.admin.id, uploaded.id);
      await f.disk.remove(uploaded.id);
      await f.db.$executeRaw`INSERT INTO "ResolucionEvidenciaInstitucional"
        ("solicitudId",revision,estado,"resueltaEn","venceEn") VALUES
        (${f.request.id}::uuid,100,'RECHAZADA',
         date_trunc('milliseconds',CURRENT_TIMESTAMP)-INTERVAL '2160 hours'+INTERVAL '2 seconds',
         date_trunc('milliseconds',CURRENT_TIMESTAMP)+INTERVAL '2 seconds')`;
      let wrote = false;
      const delayedStore = {
        put: async (id, bytes) => {
          const [clock] = await f.db.$queryRaw`SELECT GREATEST(0,EXTRACT(EPOCH FROM
            ("venceEn"-clock_timestamp()))*1000)::integer AS remaining
            FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${f.request.id}::uuid`;
          await new Promise(resolve => setTimeout(resolve, clock.remaining + 80));
          await f.disk.put(id, bytes);
          wrote = true;
        },
        read: id => f.disk.read(id), remove: id => f.disk.remove(id),
      };
      const delayed = new PrivateFileRecoveryService(f.db, delayedStore, vault, new PrivateFileRuntime());
      await assert.rejects(delayed.restore(f.admin.id, uploaded.id), e => e.getStatus() === 409);
      assert.equal(wrote, true);
      const row = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: uploaded.id } });
      assert.equal(row.estado, 'RETIRADO');
      assert.ok(row.bytesRetiradosEn);
      await assert.rejects(f.disk.read(uploaded.id));
      await assert.rejects(vault.read({ id: row.id, sha256: row.sha256, bytes: row.bytes, mime: row.mime }));
    } finally {
      if (previous === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previous;
    }
  });

  run('private PDF/image, idempotency and reviewer-only read', async f => {
    const command = f.dto();
    const uploaded = await f.service.upload(f.actor, f.request.id, command, f.pdf);
    assert.equal(uploaded.mime, 'application/pdf');
    assert.equal(uploaded.revision, 2);
    assert.equal(uploaded.disponible, true);
    assert.equal((await f.service.upload(f.actor, f.request.id, command, f.pdf)).id, uploaded.id);
    assert.deepEqual((await f.service.content(f.reviewer, f.request.id, uploaded.id)).content, f.pdf);
    assert.equal((await f.service.list(f.reviewer, f.request.id)).puedeAdjuntar, false);
    const other = await f.user('PROFESOR');
    await assert.rejects(f.service.content({ sub: other.id, versionSesion: other.versionSesion }, f.request.id, uploaded.id), e => e.getStatus() === 404);
    await assert.rejects(f.service.upload(f.reviewer, f.request.id, f.dto(2), f.pdf), e => e.getStatus() === 403);
    await assert.rejects(f.service.remove(f.reviewer, f.request.id, uploaded.id, 2), e => e.getStatus() === 403);
    const image = await f.service.upload(f.actor, f.request.id, f.dto(2), f.image);
    assert.equal(image.mime, 'image/webp');
    assert.equal((await f.service.list(f.actor, f.request.id)).adjuntos.length, 2);
  });

  run('changed operation, stale revision and fourth attachment cannot write', async f => {
    const command = f.dto();
    await f.service.upload(f.actor, f.request.id, command, f.pdf);
    await assert.rejects(f.service.upload(f.actor, f.request.id, command, f.image), e => e.getStatus() === 409);
    await assert.rejects(f.service.upload(f.actor, f.request.id, f.dto(1), f.pdf), e => e.getStatus() === 409);
    await f.service.upload(f.actor, f.request.id, f.dto(2), f.pdf);
    await f.service.upload(f.actor, f.request.id, f.dto(3), f.pdf);
    await assert.rejects(f.service.upload(f.actor, f.request.id, f.dto(4), f.pdf), e => e.getStatus() === 429);
    assert.equal(await f.db.archivoPrivado.count({ where: { solicitudId: f.request.id } }), 3);
  });

  run('pending withdrawal bumps revision, replays safely and never revives bytes', async f => {
    const command = f.dto();
    const uploaded = await f.service.upload(f.actor, f.request.id, command, f.pdf);
    await assert.rejects(f.service.remove(f.actor, f.request.id, uploaded.id, 1), e => e.getStatus() === 409);
    const removed = await f.service.remove(f.actor, f.request.id, uploaded.id, 2);
    assert.equal(removed.estado, 'RETIRADO');
    assert.equal(removed.revision, 3);
    assert.equal(removed.limpiezaPendiente, false);
    assert.equal((await f.service.remove(f.actor, f.request.id, uploaded.id, 2)).revision, 3);
    assert.equal((await f.service.upload(f.actor, f.request.id, command, f.pdf)).estado, 'RETIRADO');
    await assert.rejects(f.disk.read(uploaded.id));
    await assert.rejects(f.service.content(f.reviewer, f.request.id, uploaded.id), e => e.getStatus() === 404);
  });

  run('review freezes active withdrawal and rejects stale reviewer revision', async f => {
    const { InstitutionApprovalService } = require('../src/institucion/institution-approval.service');
    const approval = new InstitutionApprovalService(f.db);
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    await assert.rejects(approval.review(f.admin.id, f.request.id, { revision: 1, estado: 'RECHAZADA', mensaje: 'Fixture review' }), e => e.getStatus() === 409);
    await approval.review(f.admin.id, f.request.id, { revision: 2, estado: 'RECHAZADA', mensaje: 'Fixture review' });
    assert.equal((await f.service.list(f.actor, f.request.id)).adjuntos.length, 1);
    assert.ok((await f.service.operation(f.actor, f.request.id, uploaded.operacionId)).venceEn);
    await assert.rejects(f.service.remove(f.actor, f.request.id, uploaded.id, 3), e => e.getStatus() === 409);
    await assert.rejects(f.service.upload(f.actor, f.request.id, f.dto(3), f.pdf), e => e.getStatus() === 409);
    assert.deepEqual((await f.service.content(f.reviewer, f.request.id, uploaded.id)).content, f.pdf);
  });

  run('expiry denies both actors without waiting for physical cleanup or device clock', async f => {
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    await expiredClock(f); // Synthetic past resolution only in this owned test DB.
    await assert.rejects(f.db.$executeRaw`INSERT INTO "RespaldoArchivoPrivado" ("archivoId","vaultId") VALUES (${uploaded.id}::uuid,'11111111-1111-4111-8111-111111111111'::uuid)`,
      e => e.meta?.code === '23514');
    for (const actor of [f.actor, f.reviewer]) {
      assert.equal((await f.service.list(actor, f.request.id)).adjuntos.length, 0);
      await assert.rejects(f.service.content(actor, f.request.id, uploaded.id), e => e.getStatus() === 404);
    }
    const receipt = await f.service.operation(f.actor, f.request.id, uploaded.operacionId);
    assert.equal(receipt.disponible, false);
    assert.equal(receipt.contenido, null);
    assert.ok((await f.disk.read(uploaded.id)).length); // No false physical-deletion claim.
  });

  run('expiry or account revocation during provider IO denies the returned bytes', async f => {
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const store = { ...f.disk, read: async id => {
      const bytes = await f.disk.read(id);
      await expiredClock(f);
      return bytes;
    } };
    const service = new InstitutionEvidenceService(f.db, store, new PrivateFileRuntime());
    await assert.rejects(service.content(f.actor, f.request.id, uploaded.id), e => e.getStatus() === 404);
  });

  run('uncertain reservation is discoverable and cancellable without activating', async f => {
    const store = { put: async () => { throw new Error('synthetic IO'); }, read: id => f.disk.read(id), remove: id => f.disk.remove(id) };
    const service = new InstitutionEvidenceService(f.db, store, new PrivateFileRuntime());
    const command = f.dto();
    await assert.rejects(service.upload(f.actor, f.request.id, command, f.pdf));
    const reserved = await f.service.operation(f.actor, f.request.id, command.operacionId);
    assert.equal(reserved.estado, 'PREPARADO');
    assert.equal(reserved.contenido, null);
    const removed = await f.service.remove(f.actor, f.request.id, reserved.id, 1);
    assert.equal(removed.estado, 'RETIRADO');
    assert.equal((await f.service.upload(f.actor, f.request.id, command, f.pdf)).estado, 'RETIRADO');
  });

  run('HTTP PDF is attachment/nosniff, private and rejects injected fields', async f => {
    const path = `/cuenta/archivos/evidencias/${f.request.id}`;
    const body = new FormData();
    body.append('revision', '1'); body.append('operacionId', randomUUID());
    body.append('archivo', new Blob([f.pdf], { type: 'image/png' }), 'false-image.png');
    const upload = await f.call(path, f.tokenFor(f.owner), { method: 'POST', body });
    assert.equal(upload.status, 201);
    const result = await f.call(upload.data.contenido, f.tokenFor(f.admin));
    assert.equal(result.status, 200);
    assert.match(result.headers.get('content-type'), /application\/pdf/);
    assert.match(result.headers.get('content-disposition'), /^attachment;/);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    assert.match(result.headers.get('cache-control'), /no-store/);
    assert.match(result.headers.get('content-security-policy'), /sandbox/);
    assert.equal((await f.call(upload.data.contenido, null)).status, 401);
    const bad = new FormData();
    bad.append('revision', '2'); bad.append('operacionId', randomUUID()); bad.append('propietarioId', f.admin.id);
    bad.append('archivo', new Blob([f.pdf]), 'document.pdf');
    assert.equal((await f.call(path, f.tokenFor(f.owner), { method: 'POST', body: bad })).status, 400);
  });

  run('concurrent upload and review serialize without approving an unseen revision', async f => {
    const { InstitutionApprovalService } = require('../src/institucion/institution-approval.service');
    const approval = new InstitutionApprovalService(f.db);
    const results = await Promise.allSettled([
      f.service.upload(f.actor, f.request.id, f.dto(), f.pdf),
      approval.review(f.admin.id, f.request.id, { revision: 1, estado: 'RECHAZADA', mensaje: 'Fixture concurrent review' }),
    ]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.find(row => row.status === 'rejected').reason.getStatus(), 409);
  });

  run('session replacement during IO blocks applicant download', async f => {
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const store = { read: async id => {
      const bytes = await f.disk.read(id);
      await f.db.usuario.update({ where: { id: f.owner.id }, data: { versionSesion: { increment: 1 } } });
      return bytes;
    } };
    const service = new InstitutionEvidenceService(f.db, store, new PrivateFileRuntime());
    await assert.rejects(service.content(f.actor, f.request.id, uploaded.id), e => e.getStatus() === 403);
  });

  run('unverified, temporary and student identities cannot upload or enumerate', async f => {
    for (const extra of [{ correoVerificado: false }, { debeCambiarContrasena: true }, { rol: 'ESTUDIANTE' }]) {
      await f.db.usuario.update({ where: { id: f.owner.id }, data: extra });
      await assert.rejects(f.service.upload(f.actor, f.request.id, f.dto(), f.pdf), e => [403, 404].includes(e.getStatus()));
      await f.db.usuario.update({ where: { id: f.owner.id }, data: { correoVerificado: true, debeCambiarContrasena: false, rol: 'PROFESOR' } });
    }
    assert.equal(await f.db.archivoPrivado.count({ where: { solicitudId: f.request.id } }), 0);
  });

  run('provider integrity and physical withdrawal failure never expose retired content', async f => {
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const corrupt = new InstitutionEvidenceService(f.db, { read: async () => Buffer.from('corrupt') }, new PrivateFileRuntime());
    await assert.rejects(corrupt.content(f.actor, f.request.id, uploaded.id), e => e.getStatus() === 503);
    const unavailable = new InstitutionEvidenceService(f.db, { remove: async () => { throw new Error('synthetic outage'); } }, new PrivateFileRuntime());
    const removed = await unavailable.remove(f.actor, f.request.id, uploaded.id, 2);
    assert.equal(removed.limpiezaPendiente, true);
    await assert.rejects(f.service.content(f.reviewer, f.request.id, uploaded.id), e => e.getStatus() === 404);
    assert.equal((await f.service.remove(f.actor, f.request.id, uploaded.id, 2)).limpiezaPendiente, false);
  });

  run('reviewed LIC-4 applicant purge revokes reviewer bytes and leaves cleanup obligation', async f => {
    const { SupresionCuentaService } = require('../src/institucion/supresion-cuenta.service');
    const privacy = new SupresionCuentaService(f.db);
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const request = await privacy.solicitar(f.owner.id, f.owner.id, randomUUID(), 'Own synthetic C5 evidence privacy request');
    const review = await privacy.revisar(f.admin.id, request.id);
    assert.equal(review.registros.archivosPrivados, 1);
    const previous = process.env.ACCOUNT_SUPPRESSION_ENABLED;
    process.env.ACCOUNT_SUPPRESSION_ENABLED = 'true';
    try {
      await privacy.ejecutar(f.admin.id, request.id, review.version, review.huellaRevision, 'SUPRIMIR CUENTA');
      await assert.rejects(f.service.content(f.reviewer, f.request.id, uploaded.id), e => e.getStatus() === 404);
      const row = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: uploaded.id } });
      assert.equal(row.estado, 'RETIRADO');
      assert.equal(row.bytesRetiradosEn, null);
      // LIC-4 retains a pseudonymous FK for shared institutional review, not a
      // deleted user row. The live-owner check must still deny ADMIN its bytes.
      const pseudonym = await f.db.usuario.findUniqueOrThrow({ where: { id: f.owner.id } });
      assert.equal(pseudonym.correo, null);
      assert.equal(pseudonym.rol, null);
      assert.ok(pseudonym.suprimidaEn);
    } finally {
      if (previous === undefined) delete process.env.ACCOUNT_SUPPRESSION_ENABLED;
      else process.env.ACCOUNT_SUPPRESSION_ENABLED = previous;
    }
  });

  run('cleanup expires documents, retains review and retries physical failure', async f => {
    const { PrivateFileCleanupService } = require('../src/private-files/private-file-cleanup.service');
    const uploaded = await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const live = await f.service.upload(f.actor, f.request.id, f.dto(2), f.pdf);
    const { ProfilePhotoService } = require('../src/private-files/profile-photo.service');
    const photos = new ProfilePhotoService(f.db, f.disk, new PrivateFileRuntime());
    const photo = await photos.upload(f.actor, { revision: 0, operacionId: randomUUID() }, f.image);
    const { LocalPrivateBackupVault } = require('../src/private-files/private-backup-vault');
    const { PrivateBackupCleanupService } = require('../src/private-files/private-backup-cleanup.service');
    const vault = new LocalPrivateBackupVault(join(f.root, 'backup-fixtures'));
    const vaultId = await vault.identity();
    const metas = [];
    for (const id of [uploaded.id, live.id, photo.id]) {
      await f.db.$executeRaw`INSERT INTO "RespaldoArchivoPrivado" ("archivoId","vaultId") VALUES (${id}::uuid,${vaultId}::uuid)`;
      const source = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id } });
      const meta = { id, bytes: source.bytes, sha256: source.sha256, mime: source.mime };
      metas.push(meta);
      await vault.save(meta, await f.disk.read(id));
    }
    // Both documents share a resolution, while an unrelated pending request does not.
    await expiredClock(f);
    const failingStore = { remove: async () => { throw new Error('synthetic provider outage'); } };
    const failedWorker = new PrivateFileCleanupService(f.db, failingStore, new PrivateFileRuntime());
    const pending = await failedWorker.runOnce();
    assert.ok(pending.pending >= 1);
    const row = await f.db.archivoPrivado.findUniqueOrThrow({ where: { id: uploaded.id } });
    assert.equal(row.estado, 'RETIRADO');
    assert.equal(row.bytesRetiradosEn, null);
    const [backupPending] = await f.db.$queryRaw`SELECT * FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${uploaded.id}::uuid`;
    assert.ok(backupPending.retiradoEn instanceof Date);
    assert.equal(backupPending.eliminadoEn, null);
    assert.ok((await f.disk.read(uploaded.id)).length);
    const worker = new PrivateFileCleanupService(f.db, f.disk, new PrivateFileRuntime());
    assert.equal(worker.runOnce(), worker.runOnce()); // One in-flight sweep per instance.
    for (let n = 0; n < 5; n++) await worker.runOnce();
    for (const id of [uploaded.id, live.id]) {
      assert.ok((await f.db.archivoPrivado.findUniqueOrThrow({ where: { id } })).bytesRetiradosEn);
      await assert.rejects(f.disk.read(id));
    }
    const [review] = await f.db.$queryRaw`SELECT count(*)::int AS total FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${f.request.id}::uuid`;
    assert.equal(review.total, 1);
    assert.ok((await photos.content(f.actor, photo.id)).length); // Never retire a live profile photo.
    const [livePhotoBackup] = await f.db.$queryRaw`SELECT * FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${photo.id}::uuid`;
    assert.equal(livePhotoBackup.retiradoEn, null);
    const previousOperations = process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
    process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = 'true';
    try {
      const backupWorker = new PrivateBackupCleanupService(f.db, vault, new PrivateFileRuntime());
      for (let n=0; n<5; n++) await backupWorker.runOnce();
      for (const meta of metas.slice(0, 2)) {
        await assert.rejects(vault.read(meta));
        const [deleted] = await f.db.$queryRaw`SELECT "eliminadoEn" FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${meta.id}::uuid`;
        assert.ok(deleted.eliminadoEn instanceof Date);
      }
      assert.ok((await vault.read(metas[2])).length); // Live photo backup survives expiry of documents.
    } finally {
      if (previousOperations === undefined) delete process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED;
      else process.env.PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED = previousOperations;
    }
    await assert.rejects(f.service.content(f.reviewer, f.request.id, uploaded.id), e => e.getStatus() === 404);
  });

  run('ADMIN Chromium real login, private attachment, explicit download and logout', async f => {
    let executable;
    for (const path of ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium']) {
      try { await access(path); executable = path; break; } catch { /* No install/download. */ }
    }
    if (!executable) { f.t.skip('Installed Chromium required for private attachment UI.'); return; }
    const name = `C5 private browser ${randomUUID()}`;
    await f.db.solicitudAltaInstitucion.update({ where: { id: f.request.id }, data: { nombre: name } });
    await f.service.upload(f.actor, f.request.id, f.dto(), f.pdf);
    const api = await f.panelFixture({ evidenceReview: true });
    const { createAdminServer } = await import('../../admin/server.mjs');
    const panel = createAdminServer({ apiBase: api.app.base, privateFiles: true });
    await new Promise(ok => panel.listen(0, '127.0.0.1', ok));
    const origin = `http://127.0.0.1:${panel.address().port}`;
    const puppeteer = require('puppeteer');
    let browser;
    try {
      browser = await puppeteer.launch({ executablePath: executable, headless: true,
        userDataDir: join(dirname(f.root), 'private-browser-profile'),
        args: ['--no-first-run', '--disable-background-networking', '--disable-sync'] });
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
      await page.goto(origin, { waitUntil: 'networkidle0' });
      await page.type('#email', api.admin.correo);
      await page.type('#password', api.password);
      await page.click('#login-submit');
      await page.waitForSelector('#select-area option[value="MATEMATICAS"]');
      await page.click('#institution-approvals');
      await page.waitForFunction(name => Array.from(document.querySelectorAll('#institution-approval-panel button'))
        .some(button => button.textContent.includes(name)), {}, name);
      await page.evaluate(name => Array.from(document.querySelectorAll('#institution-approval-panel button'))
        .find(button => button.textContent.includes(name)).click(), name);
      try { await page.waitForSelector('.private-evidence-file button', { timeout: 10000 }); }
      catch {
        await page.screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, 'private-evidence-admin-failure.png'), fullPage: true });
        const diagnostic = await page.evaluate(() => ({
          feature: globalThis.SABERPLUS_CONFIG?.privateFiles,
          attachmentStatus: Array.from(document.querySelectorAll('.private-evidence [role="status"]')).map(el => el.textContent),
          detailHeadings: Array.from(document.querySelectorAll('#institution-approval-panel h3')).map(el => el.textContent),
        }));
        throw new Error(`Private UI did not load: ${JSON.stringify(diagnostic)}; errors=${JSON.stringify(errors)}`);
      }
      assert.equal(await page.$('.private-evidence iframe, .private-evidence embed, .private-evidence object'), null);
      assert.equal(await page.$('.private-evidence a[download]'), null);
      await page.screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, 'private-evidence-admin-1280.png'), fullPage: true });
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await page.$eval('.private-evidence', el => el.scrollIntoView());
      await page.screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, 'private-evidence-admin-390.png') });
      await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
      assert.equal(await page.$eval('.private-evidence', el => el.scrollWidth <= el.clientWidth), true);
      await (await page.$('.private-evidence')).screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, 'private-evidence-admin-large-text.png') });
      await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
      assert.equal(await page.$eval('.private-evidence', el => el.scrollWidth <= el.clientWidth), true);
      await (await page.$('.private-evidence')).screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, 'private-evidence-admin-landscape.png') });
      page.once('dialog', dialog => void dialog.accept());
      await page.click('.private-evidence-file button');
      await page.waitForSelector('.private-evidence a[download]');
      const downloadPath = join(dirname(f.root), 'private-browser-downloads');
      await mkdir(downloadPath, { recursive: true });
      const cdp = await page.createCDPSession();
      await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath });
      await page.click('.private-evidence a[download]');
      let downloaded;
      for (let n = 0; n < 50; n++) {
        try { downloaded = await readFile(join(downloadPath, 'documento-1.pdf')); break; }
        catch { await new Promise(ok => setTimeout(ok, 100)); }
      }
      assert.deepEqual(downloaded, f.pdf);
      await page.click('#logout');
      await page.waitForSelector('#login-submit');
      assert.equal(await page.$('.private-evidence a[download]'), null);
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ phase: 'c5-private-evidence-browser-verified', realLogin: true,
        desktop: true, responsive390: true, explicitPdfDownload: true, logoutCleared: true, android: false }));
    } finally {
      await browser?.close();
      await new Promise(ok => { panel.close(ok); panel.closeAllConnections(); });
    }
  });
};
