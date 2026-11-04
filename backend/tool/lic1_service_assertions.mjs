import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyLicenseService(db, service, access) {
  const institution = await db.institucion.create({ data: { nombre: 'LIC1 test A', codigoUnico: `LIC1-${randomUUID()}`.toUpperCase() } });
  const other = await db.institucion.create({ data: { nombre: 'LIC1 test B', codigoUnico: `LIC1-${randomUUID()}` } });
  const account = rol => db.usuario.create({ data: { nombre: 'Synthetic LIC1', correo: `${randomUUID()}@example.invalid`, contrasenaHash: 'not-a-login-hash', rol, correoVerificado: true } });
  const [admin, owner, outsider, a, b, c] = await Promise.all(['ADMIN', 'PROFESOR', 'PROFESOR', 'ESTUDIANTE', 'ESTUDIANTE', 'ESTUDIANTE'].map(account));
  await db.usuario.update({ where: { id: owner.id }, data: { institucionId: institution.id } });
  await db.usuario.update({ where: { id: outsider.id }, data: { institucionId: other.id } });
  await db.miembroInstitucion.create({ data: { institucionId: institution.id, usuarioId: owner.id, rol: 'PROPIETARIO' } });
  await db.miembroInstitucion.create({ data: { institucionId: other.id, usuarioId: outsider.id, rol: 'PROPIETARIO' } });
  const command = { operacionId: randomUUID(), meses: 6, cuposEstudiantes: 1, cuposDocentes: 1, referenciaAcuerdo: 'Synthetic agreement; no payment' };
  await assert.rejects(service.acordar(owner.id, institution.id, command, false), e => e.getStatus() === 403);
  const [first, replay] = await Promise.all([0, 1].map(() => service.acordar(admin.id, institution.id, command, false)));
  assert.deepEqual(first, replay);
  assert.equal(await db.periodoContratoInstitucional.count({ where: { institucionId: institution.id } }), 1);
  await assert.rejects(service.acordar(admin.id, institution.id, { ...command, cuposEstudiantes: 2 }, false), e => e.getStatus() === 409);
  await assert.rejects(service.acordar(admin.id, other.id, command, false), e => e.getStatus() === 409);
  await assert.rejects(service.asignar(outsider.id, institution.id, randomUUID(), a.id, 'ESTUDIANTE'), e => e.getStatus() === 403);
  await assert.rejects(service.asignar(owner.id, institution.id, randomUUID(), owner.id, 'DOCENTE'), e => e.getStatus() === 400);
  await Promise.all([a, b].map(u => service.asignar(owner.id, institution.id, randomUUID(), u.id, 'ESTUDIANTE')));
  assert.equal(await db.asignacionLicenciaInstitucional.count({ where: { institucionId: institution.id, estado: 'ACTIVA' } }), 0);
  const simultaneous = await Promise.allSettled([a, b].map(u => service.aceptar(u.id, institution.id, randomUUID())));
  assert.equal(simultaneous.filter(r => r.status === 'fulfilled').length, 1);
  const denied = simultaneous.find(r => r.status === 'rejected');
  assert.equal(denied.reason.getStatus(), 409);
  const active = await db.asignacionLicenciaInstitucional.findFirstOrThrow({ where: { institucionId: institution.id, estado: 'ACTIVA' } });
  const retirement = randomUUID();
  await service.retirar(owner.id, institution.id, retirement, active.usuarioId);
  await service.asignar(owner.id, institution.id, randomUUID(), c.id, 'ESTUDIANTE');
  const acceptance = randomUUID();
  await db.usuario.update({ where: { id: c.id }, data: { fechaVencimientoPlan: new Date(Date.now() + 864000000) } });
  const accepted = await service.aceptar(c.id, institution.id, acceptance);
  assert.deepEqual(await service.aceptar(c.id, institution.id, acceptance), accepted);
  const savedBalance = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { usuarioId: c.id } });
  assert(savedBalance.milisegundos > 863900000n && savedBalance.milisegundos <= 864000000n);
  assert.equal(await db.saldoPersonalInstitucional.count({ where: { usuarioId: c.id } }), 1);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: c.id } })).fechaVencimientoPlan, null);
  assert.equal(await db.usuario.count({ where: { id: { in: [a.id, b.id, c.id] } } }), 3);
  assert.equal(await db.asignacionLicenciaInstitucional.count({ where: { institucionId: institution.id, estado: 'ACTIVA' } }), 1);
  const renewal = { ...command, operacionId: randomUUID() };
  const renewed = await service.acordar(admin.id, institution.id, renewal, true);
  assert.equal((await db.saldoPersonalInstitucional.findUniqueOrThrow({ where: { id: savedBalance.id } })).milisegundos, savedBalance.milisegundos);
  assert.equal(renewed.inicio, first.fin);
  assert.equal(await db.asignacionLicenciaInstitucional.count({ where: { institucionId: institution.id, estado: 'ACTIVA' } }), 1);
  await assert.rejects(service.acordar(admin.id, institution.id, { ...renewal, operacionId: randomUUID(), cuposEstudiantes: 0 }, true), e => e.getStatus() === 409);
  const suspend = randomUUID();
  await service.suspender(admin.id, institution.id, suspend, true);
  await assert.rejects(service.asignar(owner.id, institution.id, randomUUID(), active.usuarioId, 'ESTUDIANTE'), e => e.getStatus() === 403);
  // Replaying an old acceptance receipt must not undo retirement or suspension.
  await service.retirar(owner.id, institution.id, randomUUID(), c.id);
  await service.aceptar(c.id, institution.id, acceptance);
  assert.equal((await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { id: accepted.asignacionId } })).estado, 'RETIRADA');
  await assert.rejects(service.consultar(outsider.id, institution.id), e => e.getStatus() === 403);
  await service.suspender(admin.id, institution.id, randomUUID(), false);
  const teachers = await Promise.all([account('PROFESOR'), account('PROFESOR')]);
  for (const teacher of teachers) {
    await db.miembroInstitucion.create({ data: { institucionId: institution.id, usuarioId: teacher.id, rol: 'PROFESOR' } });
    await service.asignar(owner.id, institution.id, randomUUID(), teacher.id, 'DOCENTE');
  }
  const staffRace = await Promise.allSettled(teachers.map(u => service.aceptar(u.id, institution.id, randomUUID())));
  assert.equal(staffRace.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(staffRace.find(r => r.status === 'rejected').reason.getStatus(), 409);
  const teacherSeat = await db.asignacionLicenciaInstitucional.findFirstOrThrow({ where: { institucionId: institution.id, tipo: 'DOCENTE', estado: 'ACTIVA' } });
  const incomingOwner = await db.miembroInstitucion.findUniqueOrThrow({ where: { usuarioId: teacherSeat.usuarioId } });
  await service.transferirPropiedad(owner.id, institution.id, incomingOwner.id, institution.codigoUnico);
  assert.equal((await db.miembroInstitucion.findUniqueOrThrow({ where: { usuarioId: teacherSeat.usuarioId } })).rol, 'PROPIETARIO');
  await service.asignar(teacherSeat.usuarioId, institution.id, randomUUID(), owner.id, 'DOCENTE');
  await service.aceptar(owner.id, institution.id, randomUUID());
  await assert.rejects(service.asignar(owner.id, institution.id, randomUUID(), a.id, 'ESTUDIANTE'), e => e.getStatus() === 403);
  const controlled = await db.institucion.create({ data: { nombre: 'LIC1 access fixture', codigoUnico: `LIC1-${randomUUID()}` } });
  const user = await account('ESTUDIANTE');
  const legacy = await account('ESTUDIANTE');
  assert.equal(await access.exigirPractica(legacy.id), null);
  await service.acordar(admin.id, controlled.id, { ...command, operacionId: randomUUID() }, false);
  await db.origenGestionadoInstitucional.create({ data: { usuarioId: user.id, institucionId: controlled.id } });
  await assert.rejects(access.exigirPractica(user.id), e => e.getStatus() === 403);
  await service.asignar(admin.id, controlled.id, randomUUID(), user.id, 'ESTUDIANTE');
  assert.equal((await access.exigirPractica(user.id)).vinculado, true);
  const pendingDiagnostic = await db.diagnosticoInicial.create({ data: { usuarioId: user.id, preguntaIds: [], totalPreguntas: 0 } });
  let entered = 0;
  let signalEntered;
  let release;
  const bothEntered = new Promise(resolve => { signalEntered = resolve; });
  const released = new Promise(resolve => { release = resolve; });
  const deliveries = [0, 1].map(() => access.confirmarIntento(user.id, 'DIAGNOSTICO', pendingDiagnostic.id, async tx => {
    entered++;
    if (entered === 2) signalEntered();
    await released;
    await tx.usuario.update({ where: { id: user.id }, data: { xpTotal: { increment: 1 } } });
  }));
  let suspension;
  try {
    let timer;
    try { await Promise.race([bothEntered, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Shared delivery readers did not enter concurrently')), 5000); })]); }
    finally { clearTimeout(timer); }
    suspension = service.suspender(admin.id, controlled.id, randomUUID(), true);
    let blocked = false;
    for (let i = 0; i < 50; i++) {
      const [row] = await db.$queryRaw`SELECT count(*)::int AS waiting FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'`;
      if (row.waiting > 0) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.equal(blocked, true, 'Revocation must wait for already-authorized shared readers');
  } finally { release(); }
  await Promise.all([...deliveries, suspension]);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: user.id } })).xpTotal, 2);
  await assert.rejects(access.exigirEntrega(user.id, pendingDiagnostic.iniciadoEn, null), e => e.getStatus() === 403);
  await service.suspender(admin.id, controlled.id, randomUUID(), false);
  const expiringAttempt = await db.intentoSimulacro.create({ data: { usuarioId: user.id, origen: 'SIMULACRO', preguntaIds: [], expira: new Date(Date.now() + 500) } });
  await assert.rejects(access.confirmarIntento(user.id, 'SIMULACRO', expiringAttempt.id, async tx => {
    await tx.usuario.update({ where: { id: user.id }, data: { xpTotal: { increment: 1000 } } });
    await new Promise(resolve => setTimeout(resolve, 600));
  }), e => e.getStatus() === 403);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: user.id } })).xpTotal, 2, 'A deadline crossed during work must roll back academic writes');
  const now = Date.now();
  const shortEnd = new Date(now + 1800000);
  await db.periodoContratoInstitucional.updateMany({ where: { institucionId: controlled.id }, data: { inicio: new Date(now - 86400000), fin: shortEnd } });
  const clipped = await access.limitarOffline(user.id, new Date(now), new Date(now + 72 * 3600000));
  assert.equal(clipped.toISOString(), shortEnd.toISOString());
  await db.periodoContratoInstitucional.updateMany({ where: { institucionId: controlled.id }, data: { fin: new Date(now - 3600000) } });
  await db.asignacionLicenciaInstitucional.updateMany({ where: { usuarioId: user.id }, data: { aceptadaEn: new Date(now - 86400000) } });
  await assert.rejects(access.exigirPractica(user.id), e => e.getStatus() === 403);
  await assert.rejects(access.limitarOffline(user.id, new Date(now), new Date(now + 3600000)), e => e.getStatus() === 403);
  await access.exigirEntrega(user.id, new Date(now - 7200000), null);
  await assert.rejects(access.exigirEntrega(user.id, new Date(now - 7200000), new Date(now - 1800000)), e => e.getStatus() === 403);
  await assert.rejects(access.exigirEntrega(user.id, new Date(now), null), e => e.getStatus() === 403);
  await service.suspender(admin.id, controlled.id, randomUUID(), true);
  await assert.rejects(access.exigirEntrega(user.id, new Date(now - 7200000), null), e => e.getStatus() === 403);
  await service.suspender(admin.id, controlled.id, randomUUID(), false);
  await service.retirar(admin.id, controlled.id, randomUUID(), user.id);
  await assert.rejects(access.exigirEntrega(user.id, new Date(now - 7200000), null), e => e.getStatus() === 403);
  // Managed provenance prevents detaching the legacy field to regain free access.
  await db.usuario.update({ where: { id: user.id }, data: { institucionId: null } });
  await assert.rejects(access.exigirPractica(user.id), e => e.getStatus() === 403);
  await assert.rejects(service.acordar(admin.id, controlled.id, { ...command, operacionId: randomUUID(), inicio: new Date(now - 1000).toISOString() }, true), e => e.getStatus() === 400);
  const agreed = new Date(Date.now() + 60000).toISOString();
  const lateRenewal = await service.acordar(admin.id, controlled.id, { ...command, operacionId: randomUUID(), inicio: agreed }, true);
  assert.equal(lateRenewal.inicio, agreed);
  assert.equal(await db.periodoContratoInstitucional.count({ where: { institucionId: controlled.id } }), 2);
  console.log(JSON.stringify({ phase: 'lic1-service-passed', localOnly: true,
    concurrentActivationReplay: true, changedReplayRejected: true, oneSeatTwoAcceptances: true,
    retirementReusesSeatWithoutDeletingUsers: true, fullRenewalNoSeatDuplication: true,
    suspensionAndInstitutionIsolation: true, staleReplayDoesNotReactivate: true,
    legacyUnchanged: true, offlineClipped: true, expiryAndOriginalDeadline: true,
    revokedAssignmentNoGrace: true, managedDetachNoFreeFallback: true,
    teacherQuotaConcurrent: true, transferredOwnerExcludedFromTeacherQuota: true,
    crossInstitutionOperationCollisionDenied: true, expiredRenewalAgreedDateNoBackfill: true,
    parallelDeliveriesShareInstitutionLock: true, revocationWaitsForAuthorizedCommit: true,
    crossedDeadlineRollsBackWrites: true }));
}
