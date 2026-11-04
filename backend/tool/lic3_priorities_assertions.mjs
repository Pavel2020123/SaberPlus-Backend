import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyManagedPriorities(db, { license, managed, priorities, access }) {
  const admin = await db.usuario.findFirstOrThrow({ where: { rol: 'ADMIN' } });
  const school = await db.institucion.create({ data: { nombre: 'LIC3 prioridades propias', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
  const owner = await db.usuario.create({ data: { nombre: 'Responsable LIC3', correo: `${randomUUID()}@example.invalid`, rol: 'PROFESOR', institucionId: school.id, contrasenaHash: 'synthetic-no-login', correoVerificado: true } });
  await db.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: school.id, rol: 'PROPIETARIO' } });
  await license.acordar(admin.id, school.id, { operacionId: randomUUID(), meses: 6, cuposEstudiantes: 2, cuposDocentes: 0, referenciaAcuerdo: 'Synthetic LIC3 priorities' }, false);
  const group = await db.clase.create({ data: { nombre: 'Grupo LIC3', codigoIngreso: randomUUID(), institucionId: school.id, grado: 'ONCE' } });
  const suffix = `lic3-${randomUUID()}.example`;
  const request = await managed.solicitarSufijo(owner.id, school.id, randomUUID(), suffix);
  await managed.aprobarSufijo(admin.id, school.id, randomUUID(), suffix, request.version);
  const csv = 'nombre,usuario\nAlumno gestionado,alumno';
  const preview = await managed.previsualizar(owner.id, school.id, { csv, claseId: group.id });
  const created = await managed.importar(owner.id, school.id, randomUUID(), { csv, claseId: group.id, huella: preview.huella });
  const studentId = created.credenciales[0].usuarioId;
  const topic = await db.tema.create({ data: { nombre: 'Proporciones LIC3', area: 'MATEMATICAS', estadoContenido: 'PUBLICADO' } });
  const subtopic = await db.subtema.create({ data: { nombre: 'Razones LIC3', temaId: topic.id, estadoContenido: 'PUBLICADO' } });
  const questions = [];
  for (let i = 0; i < 5; i++) questions.push(await db.pregunta.create({ data: { enunciado: `Pregunta propia LIC3 ${i}`, subtemaId: subtopic.id, estadoContenido: 'PUBLICADO', respuestas: { create: [{ texto: 'Opción correcta', esCorrecta: true }, { texto: 'Otra opción', esCorrecta: false }] } } }));
  const command = { id: randomUUID(), temaId: topic.id, subtemaId: subtopic.id, venceEn: new Date(Date.now() + 86400000).toISOString() };
  await priorities.create(owner.id, group.id, command);
  await db.prioridadDocente.update({ where: { id: command.id }, data: { creadoEn: new Date(Date.now() - 3600000) } });
  await db.claseEstudiante.update({ where: { usuarioId_claseId: { usuarioId: studentId, claseId: group.id } }, data: { fechaIngreso: new Date(Date.now() - 3600000) } });
  for (const question of questions) await db.historialRespuesta.create({ data: { usuarioId: studentId, preguntaId: question.id, sesionId: randomUUID(), respuestaSeleccionadaId: 'synthetic-option', respuestaCorrectaId: 'synthetic-key', esCorrecta: true, area: 'MATEMATICAS', origen: 'PRACTICA', fechaRespuesta: new Date(Date.now() - 1000) } });
  const own = await priorities.listForStudent(studentId, 1);
  assert.equal(own.prioridades[0].preguntasPracticadas, 5);
  assert.equal((await priorities.report(owner.id, group.id, command.id, 1)).estudiantes[0].cumplida, true);
  const join = await db.claseEstudiante.findUniqueOrThrow({ where: { usuarioId_claseId: { usuarioId: studentId, claseId: group.id } } });
  assert.equal(join.aceptacionExplicita, false);
  await db.asignacionLicenciaInstitucional.updateMany({ where: { usuarioId: studentId, institucionId: school.id }, data: { estado: 'RETIRADA', retiradaEn: new Date() } });
  await db.claseEstudiante.update({ where: { usuarioId_claseId: { usuarioId: studentId, claseId: group.id } }, data: { aceptacionExplicita: true } });
  assert.equal((await priorities.listForStudent(studentId, 1)).prioridades.length, 0);
  assert.equal((await priorities.report(owner.id, group.id, command.id, 1)).estudiantes.length, 0);
  const personal = await db.usuario.create({ data: { nombre: 'Personal sin aceptación LIC3', correo: `${randomUUID()}@example.invalid`, contrasenaHash: 'synthetic', institucionId: school.id, rol: 'ESTUDIANTE' } });
  await db.claseEstudiante.create({ data: { claseId: group.id, usuarioId: personal.id } });
  assert.equal((await priorities.listForStudent(personal.id, 1)).prioridades.length, 0);
  const summary = await access.resumenPropio(studentId);
  assert.equal(summary.estadoLicencia, 'ACTIVA');
  assert.equal(summary.asignacionActiva, false);
  assert.equal(summary.permitePractica, false);
  assert.equal(summary.origenCuenta, 'GESTIONADA');
  assert.equal(summary.permiteHistorial, true);
  const period = await db.periodoContratoInstitucional.findFirstOrThrow({ where: { institucionId: school.id } });
  for (const [state, start, end] of [
    ['VENCIDA', -2 * 86400000, -86400000],
    ['PROGRAMADA', 86400000, 2 * 86400000],
  ]) {
    await db.periodoContratoInstitucional.update({ where: { id: period.id }, data: { inicio: new Date(Date.now() + start), fin: new Date(Date.now() + end) } });
    const value = await access.resumenPropio(studentId);
    assert.equal(value.estadoLicencia, state); assert.equal(value.permitePractica, false); assert.equal(value.permiteHistorial, true);
  }
  await db.controlLicenciaInstitucional.update({ where: { institucionId: school.id }, data: { suspendida: true } });
  assert.equal((await access.resumenPropio(studentId)).estadoLicencia, 'SUSPENDIDA');
  console.log(JSON.stringify({ phase: 'lic3-managed-priorities-passed', importedAccountSeesPriority: true, noFakePersonalAcceptance: true, realSqlUniqueCount: true, retiredSeatExcludedDespiteOldAcceptance: true, personalWithoutAcceptanceExcluded: true }));
}
