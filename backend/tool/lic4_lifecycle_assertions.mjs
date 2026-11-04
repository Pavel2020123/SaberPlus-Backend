import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Called only by the nonce-owned disposable LIC runner, never a caller URL.
export async function verifyPersonalReturn(db, license, access) {
  const school = await db.institucion.create({ data: { nombre: 'LIC4 fixture propia', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  const makeUser = (rol, name, institution = school.id) => db.usuario.create({ data: { nombre: name, correo: `${randomUUID()}@example.invalid`, contrasenaHash: 'fixture-not-a-login', rol, institucionId: institution } });
  const admin = await makeUser('ADMIN', 'LIC4 ADMIN', null);
  const owner = await makeUser('PROFESOR', 'LIC4 propietario');
  await db.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: school.id, rol: 'PROPIETARIO' } });
  await license.acordar(admin.id, school.id, { operacionId: randomUUID(), meses: 6, cuposEstudiantes: 5, cuposDocentes: 2, referenciaAcuerdo: 'OWN LOCAL LIC4 FIXTURE' }, false);
  const student = await makeUser('ESTUDIANTE', 'LIC4 personal', null);
  await db.usuario.update({ where: { id: student.id }, data: { fechaVencimientoPlan: new Date(Date.now() + 5 * 86400000) } });
  await license.asignar(owner.id, school.id, randomUUID(), student.id, 'ESTUDIANTE');
  await license.aceptar(student.id, school.id, randomUUID());
  const group = await db.clase.create({ data: { nombre: 'LIC4 own group', codigoIngreso: randomUUID(), grado: 'ONCE', institucionId: school.id } });
  await db.claseEstudiante.create({ data: { usuarioId: student.id, claseId: group.id, aceptacionExplicita: true } });
  const diagnostic = await db.diagnosticoInicial.create({ data: { usuarioId: student.id, preguntaIds: [] } });
  // Ensure the fixture attempt began during the accepted institutional window.
  const seat = await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { institucionId_usuarioId: { institucionId: school.id, usuarioId: student.id } } });
  await db.diagnosticoInicial.update({ where: { id: diagnostic.id }, data: { iniciadoEn: new Date(seat.aceptadaEn.getTime() + 1) } });
  const balance = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { usuarioId: student.id, reanudadoEn: null } });
  const op = randomUUID();
  const command = actor => license.volverPersonal(actor, school.id, op, student.id, seat.id, seat.actualizadoEn.toISOString());
  await assert.rejects(command(student.id), error => error.getStatus?.() === 403);
  await command(owner.id);
  await Promise.all([command(owner.id), command(owner.id)]);
  const returned = await db.usuario.findUniqueOrThrow({ where: { id: student.id } });
  const resumed = await db.saldoPersonalInstitucional.findUniqueOrThrow({ where: { id: balance.id } });
  assert.equal(returned.institucionId, null);
  assert.equal(resumed.venceReanudadoEn.getTime() - resumed.reanudadoEn.getTime(), Number(balance.milisegundos));
  assert.equal(await db.claseEstudiante.count({ where: { usuarioId: student.id } }), 0);
  assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: student.id } }), 1);
  const begun = (await db.diagnosticoInicial.findUniqueOrThrow({ where: { id: diagnostic.id } })).iniciadoEn;
  await assert.rejects(access.exigirEntrega(student.id, begun, null), error => error.getStatus?.() === 403);
  await assert.rejects(access.confirmarIntento(student.id, 'DIAGNOSTICO', diagnostic.id, async () => assert.fail('Retired attempt must not write')), error => error.getStatus?.() === 403);
  // Link again: replay of the old departure cannot detach the new episode.
  await license.asignar(owner.id, school.id, randomUUID(), student.id, 'ESTUDIANTE');
  await license.aceptar(student.id, school.id, randomUUID());
  await command(owner.id);
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, school.id);
  await assert.rejects(license.volverPersonal(owner.id, school.id, randomUUID(), student.id, seat.id, seat.actualizadoEn.toISOString()), error => error.getStatus?.() === 409);
  // Synthetic expiry: personal self-service becomes available, with a fresh version.
  await db.periodoContratoInstitucional.updateMany({ where: { institucionId: school.id }, data: { inicio: new Date(Date.now() - 2 * 86400000), fin: new Date(Date.now() - 86400000) } });
  const nextSeat = await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { id: seat.id } });
  await license.volverPersonal(student.id, school.id, randomUUID(), student.id, nextSeat.id, nextSeat.actualizadoEn.toISOString());
  assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: student.id } })).institucionId, null);
  // Only a new empty synthetic row exercises the storage anti-reactivation gate.
  // This is not the reviewed suppression procedure and does not prove its scope.
  const anonymousFixture = await makeUser('ESTUDIANTE', 'LIC4 empty storage fixture', null);
  await db.usuario.update({ where: { id: anonymousFixture.id }, data: {
    nombre: 'Cuenta eliminada', correo: null, rol: null, institucionId: null,
    contrasenaHash: `destroyed-${randomUUID()}`, suprimidaEn: new Date(),
  } });
  await assert.rejects(db.usuario.update({ where: { id: anonymousFixture.id }, data: { rol: 'ESTUDIANTE' } }));
  await assert.rejects(db.usuario.update({ where: { id: anonymousFixture.id }, data: { correo: `${randomUUID()}@example.invalid` } }));
  console.log(JSON.stringify({ phase: 'lic4-storage-reactivation-denied', emptyOwnedFixtureOnly: true, reviewedSuppressionNotYetProven: true }));
  console.log(JSON.stringify({ phase: 'lic4-personal-return-passed', localOnly: true, exactBalance: true, historyPreserved: true, retiredAttemptNotRevived: true, replayCannotDetachNewEpisode: true, selfServiceAfterExpiry: true, noAccountsDeleted: true }));
}
