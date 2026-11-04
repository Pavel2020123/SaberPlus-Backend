import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifySuppressionReview(db, service) {
  const school = await db.institucion.create({ data: { nombre: 'LIC4 privacy own fixture', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  const user = (name, rol = 'ESTUDIANTE', institucionId = null) => db.usuario.create({ data: { nombre: name, correo: `${randomUUID()}@example.invalid`, contrasenaHash: 'not-a-login-fixture', rol, institucionId } });
  const admin = await user('Review ADMIN', 'ADMIN');
  const owner = await user('Own proprietor', 'PROFESOR', school.id);
  const teacher = await user('Assigned teacher', 'PROFESOR', school.id);
  await db.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: school.id, rol: 'PROPIETARIO' } });
  await db.miembroInstitucion.create({ data: { usuarioId: teacher.id, institucionId: school.id, rol: 'PROFESOR' } });
  await db.controlLicenciaInstitucional.create({ data: { institucionId: school.id } });
  const managed = await user('Managed privacy fixture', 'ESTUDIANTE', school.id);
  await db.origenGestionadoInstitucional.create({ data: { usuarioId: managed.id, institucionId: school.id } });
  const personal = await user('Personal privacy fixture', 'ESTUDIANTE', school.id);
  await db.diagnosticoInicial.create({ data: { usuarioId: personal.id, preguntaIds: [], totalPreguntas: 0 } });
  const operation = randomUUID(), reason = 'Solicitud propia de fixture; sin datos reales';
  const request = await service.solicitar(personal.id, personal.id, operation, reason);
  assert.equal(request.estado, 'PENDIENTE');
  assert.equal((await service.solicitar(personal.id, personal.id, operation, reason)).id, request.id);
  await assert.rejects(service.solicitar(personal.id, personal.id, operation, 'Cambio de contenido'), error => error.getStatus?.() === 409);
  await assert.rejects(service.solicitar(personal.id, personal.id, randomUUID(), reason), error => error.getStatus?.() === 409);
  await assert.rejects(service.solicitar(owner.id, personal.id, randomUUID(), reason), error => error.getStatus?.() === 403);
  await assert.rejects(service.solicitar(teacher.id, managed.id, randomUUID(), reason), error => error.getStatus?.() === 403);
  const managedRequest = await service.solicitar(owner.id, managed.id, randomUUID(), reason);
  await assert.rejects(service.solicitar(owner.id, admin.id, randomUUID(), reason), error => error.getStatus?.() === 403);
  assert.equal((await service.listar(owner.id, 1)).items.some(row => row.id === request.id), false);
  assert.equal((await service.listar(owner.id, 1)).items.some(row => row.id === managedRequest.id), true);
  await assert.rejects(service.revisar(owner.id, request.id), error => error.getStatus?.() === 403);
  const review = await service.revisar(admin.id, request.id);
  assert.equal(review.registros.diagnosticos, 1);
  assert.equal(review.irreversible, true);
  assert.match(review.huellaRevision, /^[a-f0-9]{64}$/);
  assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: personal.id } }), 1);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: personal.id } })).suprimidaEn, null);
  await assert.rejects(service.rechazar(admin.id, request.id, request.version + 1), error => error.getStatus?.() === 409);
  assert.equal((await service.rechazar(admin.id, request.id, request.version)).estado, 'RECHAZADA');
  assert.equal((await service.rechazar(admin.id, request.id, request.version)).estado, 'RECHAZADA');
  assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: personal.id } }), 1);
  console.log(JSON.stringify({ phase: 'lic4-suppression-review-passed', ownDisposableOnly: true, personalAndManagedScope: true, noDeleteOnRequestOrReview: true, idempotentRequest: true, staleReviewRejected: true, executionNotYetProven: true }));
  const previousFlag = process.env.ACCOUNT_SUPPRESSION_ENABLED;
  try {
    delete process.env.ACCOUNT_SUPPRESSION_ENABLED;
    await assert.rejects(service.ejecutar(admin.id, managedRequest.id, 1, '0'.repeat(64), 'SUPRIMIR CUENTA'), error => error.getStatus?.() === 503);
    process.env.ACCOUNT_SUPPRESSION_ENABLED = 'true';
    const request2 = await service.solicitar(personal.id, personal.id, randomUUID(), reason);
    const counterpart = await user('Counterpart must survive');
    await db.diagnosticoInicial.create({ data: { usuarioId: counterpart.id, preguntaIds: [], totalPreguntas: 0 } });
    const match = await db.partidaTiraAfloja.create({ data: { jugadorAId: personal.id, jugadorBId: counterpart.id,
      estado: 'FINALIZADA', resultado: 'EMPATE', expiraEn: new Date(Date.now() - 1000), fechaFinalizacion: new Date() } });
    await db.tiraAflojaEvento.create({ data: { partidaId: match.id, version: 1, tipo: 'FINALIZADA', datos: { nombre: personal.nombre, correo: personal.correo, puntaje: 10 } } });
    const solo = await db.intentoTriviaRush.create({ data: { usuarioId: personal.id, areas: ['MATEMATICAS'], duracionBaseSegundos: 60, venceEn: new Date(Date.now() + 60000) } });
    await db.triviaPresenceEvent.create({ data: { attemptId: solo.id, kind: 'CONNECTED', observedAt: new Date() } });
    await assert.rejects(db.triviaPresenceEvent.deleteMany({ where: { attemptId: solo.id } }));
    const initialReview = await service.revisar(admin.id, request2.id);
    await db.pomodoroRegistrado.create({ data: { usuarioId: personal.id, eventoId: `pomodoro:${randomUUID()}`, duracionSegundos: 1500, finalizadoEn: new Date() } });
    await assert.rejects(service.ejecutar(owner.id, request2.id, 1, initialReview.huellaRevision, 'SUPRIMIR CUENTA'), error => error.getStatus?.() === 403);
    await assert.rejects(service.ejecutar(admin.id, request2.id, 1, initialReview.huellaRevision, 'NO'), error => error.getStatus?.() === 400);
    await assert.rejects(service.ejecutar(admin.id, request2.id, 1, initialReview.huellaRevision, 'SUPRIMIR CUENTA'), error => error.getStatus?.() === 409);
    const fresh = await service.revisar(admin.id, request2.id);
    const executions = await Promise.allSettled([0, 1].map(() =>
      service.ejecutar(admin.id, request2.id, fresh.version, fresh.huellaRevision, 'SUPRIMIR CUENTA')));
    const completed = executions.filter(value => value.status === 'fulfilled').map(value => value.value);
    const result = completed.find(value => !value.repetida);
    assert(result, 'Exactly one reviewed execution must perform the mutation');
    assert.equal(completed.filter(value => !value.repetida).length, 1);
    for (const execution of executions) {
      if (execution.status === 'rejected') assert.equal(execution.reason.getStatus?.(), 409);
    }
    // A concurrent change may return 409 rather than a replay receipt; after
    // observing committed state, the identical command must be read-only.
    assert.equal((await service.ejecutar(admin.id, request2.id, fresh.version, fresh.huellaRevision, 'SUPRIMIR CUENTA')).repetida, true);
    assert.equal(result.estado, 'EJECUTADA');
    const removed = await db.usuario.findUniqueOrThrow({ where: { id: personal.id } });
    assert.equal(removed.nombre, 'Cuenta eliminada'); assert.equal(removed.correo, null); assert.equal(removed.rol, null);
    assert.equal(removed.identificadorInstitucional, null); assert(removed.suprimidaEn);
    assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: personal.id } }), 0);
    assert.equal(await db.intentoTriviaRush.count({ where: { usuarioId: personal.id } }), 0);
    assert.equal(await db.triviaPresenceEvent.count({ where: { attemptId: solo.id } }), 0);
    assert.equal(await db.pomodoroRegistrado.count({ where: { usuarioId: personal.id } }), 0);
    assert.equal(await db.partidaTiraAfloja.count({ where: { id: match.id } }), 1);
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: counterpart.id } })).nombre, counterpart.nombre);
    assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: counterpart.id } }), 1);
    const event = await db.tiraAflojaEvento.findFirstOrThrow({ where: { partidaId: match.id } });
    assert.equal(event.datos.puntaje, 10); assert(!JSON.stringify(event.datos).includes(personal.correo)); assert(!JSON.stringify(event.datos).includes(personal.nombre));
    await assert.rejects(db.usuario.update({ where: { id: personal.id }, data: { rol: 'ESTUDIANTE' } }));
    await assert.rejects(db.diagnosticoInicial.create({ data: { usuarioId: personal.id, preguntaIds: [] } }));
    assert.equal((await service.ejecutar(admin.id, request2.id, fresh.version, fresh.huellaRevision, 'SUPRIMIR CUENTA')).repetida, true);
    // Inject a failure in this disposable database only, after private deletes
    // but before the final identity update. The complete operation must roll back.
    const rollbackTarget = await user('Rollback-only privacy fixture');
    await db.diagnosticoInicial.create({ data: { usuarioId: rollbackTarget.id, preguntaIds: [], totalPreguntas: 0 } });
    const rollbackRequest = await service.solicitar(rollbackTarget.id, rollbackTarget.id, randomUUID(), reason);
    const rollbackReview = await service.revisar(admin.id, rollbackRequest.id);
    await db.$executeRawUnsafe(`CREATE FUNCTION sp_lic4_fixture_abort() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'owned fixture rollback injection'; END $$`);
    // UUID generated by Prisma in this runner; no user input or external target.
    assert.match(rollbackTarget.id, /^[a-f0-9-]{36}$/);
    await db.$executeRawUnsafe(`CREATE TRIGGER sp_lic4_fixture_abort BEFORE UPDATE ON "Usuario" FOR EACH ROW WHEN (OLD.id='${rollbackTarget.id}'::uuid AND NEW."suprimidaEn" IS NOT NULL) EXECUTE FUNCTION sp_lic4_fixture_abort()`);
    try {
      await assert.rejects(service.ejecutar(admin.id, rollbackRequest.id, rollbackReview.version, rollbackReview.huellaRevision, 'SUPRIMIR CUENTA'));
      assert.equal((await db.solicitudSupresionCuenta.findUniqueOrThrow({ where: { id: rollbackRequest.id } })).estado, 'PENDIENTE');
      assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: rollbackTarget.id } })).nombre, rollbackTarget.nombre);
      assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: rollbackTarget.id } }), 1);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER sp_lic4_fixture_abort ON "Usuario"');
      await db.$executeRawUnsafe('DROP FUNCTION sp_lic4_fixture_abort()');
    }
    console.log(JSON.stringify({ phase: 'lic4-suppression-rollback-and-isolation-passed', ownInjectedFailureOnly: true, requestAndProgressRolledBackTogether: true, otherPrivateProgressUnchanged: true }));
    console.log(JSON.stringify({ phase: 'lic4-reviewed-suppression-passed', ownFixtureOnly: true, privateProgressAndLoginRemoved: true, immutableSoloEvidenceRemovedOnlyInReviewedScope: true, sharedMatchAndCounterpartPreserved: true, sharedIdentityRedacted: true, reactivationAndLateWriteDenied: true, executionReplayNoMutation: true }));
  } finally {
    if (previousFlag === undefined) delete process.env.ACCOUNT_SUPPRESSION_ENABLED; else process.env.ACCOUNT_SUPPRESSION_ENABLED = previousFlag;
  }
}
