const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { OrientacionVocacionalService } = require('../src/orientacion-vocacional/orientacion-vocacional.service');
const { SupresionCuentaService } = require('../src/institucion/supresion-cuenta.service');
const { PREGUNTA_IDS } = require('../src/orientacion-vocacional/ov1.rules');
const all = value => PREGUNTA_IDS.map(preguntaId => ({ preguntaId, valor: value }));
const conflict = error => error.getStatus?.() === 409;

exports.registerOv1LicTests = context => {
  test('C5 private SQL: OV1 expired license allows own history/read/delete but denies new work and foreign results', async () => {
    const f = context();
    const service = new OrientacionVocacionalService(f.db);
    const student = await f.user('ESTUDIANTE');
    const other = await f.user('ESTUDIANTE');
    const attempt = await service.iniciar(student.id);
    await service.guardar(student.id, attempt.id, all(4));
    const completed = await service.finalizar(student.id, attempt.id);
    const active = await service.iniciar(student.id);
    const school = await f.db.institucion.create({ data: { nombre: 'OV1 expired own fixture', codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
    await f.db.controlLicenciaInstitucional.create({ data: { institucionId: school.id } });
    await f.db.periodoContratoInstitucional.create({ data: {
      id: randomUUID(), institucionId: school.id, inicio: new Date('2025-07-01T00:00:00Z'),
      fin: new Date('2026-01-01T00:00:00Z'), meses: 6, cuposEstudiantes: 2, cuposDocentes: 1,
      referenciaAcuerdo: 'Owned expired test period',
    } });
    await f.db.usuario.update({ where: { id: student.id }, data: { institucionId: school.id } });
    await f.db.asignacionLicenciaInstitucional.create({ data: {
      id: randomUUID(), usuarioId: student.id, institucionId: school.id, tipo: 'ESTUDIANTE', estado: 'ACTIVA', aceptadaEn: new Date(),
    } });
    const app = await f.server({ vocational: true });
    const token = f.tokenFor(student);
    const request = (method, suffix, body, actor = token) => f.call('/orientacion-vocacional' + suffix,
      actor, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }, app.base);
    assert.equal((await request('GET', '/historial')).status, 200);
    assert.deepEqual((await request('GET', `/intentos/${completed.id}`)).data.resultado, JSON.parse(JSON.stringify(completed.resultado)));
    assert.equal((await request('GET', '')).data.intento.id, active.id);
    assert.equal((await request('GET', `/intentos/${completed.id}`, undefined, f.tokenFor(other))).status, 404);
    for (const [method, suffix, body] of [
      ['GET', '/cuestionario', undefined], ['POST', '/intentos', {}],
      ['PATCH', `/intentos/${active.id}/respuestas`, { respuestas: all(0) }],
      ['POST', `/intentos/${active.id}/finalizar`, {}],
    ]) assert.equal((await request(method, suffix, body)).status, 403);
    assert.equal((await request('DELETE', `/intentos/${completed.id}`)).status, 204);
    assert.equal(await f.db.respuestaVocacional.count({ where: { intentoId: completed.id } }), 0);
    assert.equal((await request('GET', `/intentos/${completed.id}`)).status, 404);
  });

  test('C5 private SQL: OV1 reviewed suppression detects same-count edits and removes only the owners snapshots and answers', async () => {
    const f = context();
    const service = new OrientacionVocacionalService(f.db);
    const privacy = new SupresionCuentaService(f.db);
    const student = await f.user('ESTUDIANTE'), other = await f.user('ESTUDIANTE'), admin = await f.user('ADMIN');
    const completed = await service.iniciar(student.id);
    await service.guardar(student.id, completed.id, all(4));
    await service.finalizar(student.id, completed.id);
    const active = await service.iniciar(student.id);
    await service.guardar(student.id, active.id, [{ preguntaId: 'T1', valor: 1 }]);
    const untouched = await service.iniciar(other.id);
    await service.guardar(other.id, untouched.id, all(2));
    const otherBefore = await service.finalizar(other.id, untouched.id);
    const request = await privacy.solicitar(student.id, student.id, randomUUID(), 'Own OV1 privacy fixture');
    const reviewed = await privacy.revisar(admin.id, request.id);
    assert.equal(reviewed.registros.intentosVocacionales, 2);
    assert.equal(reviewed.registros.respuestasVocacionales, 31);
    await service.guardar(student.id, active.id, [{ preguntaId: 'T1', valor: 3 }]);
    const previous = process.env.ACCOUNT_SUPPRESSION_ENABLED;
    process.env.ACCOUNT_SUPPRESSION_ENABLED = 'true';
    try {
      await assert.rejects(privacy.ejecutar(admin.id, request.id, reviewed.version, reviewed.huellaRevision, 'SUPRIMIR CUENTA'), conflict);
      assert.equal(await f.db.intentoVocacional.count({ where: { usuarioId: student.id } }), 2);
      const fresh = await privacy.revisar(admin.id, request.id);
      assert.notEqual(fresh.huellaRevision, reviewed.huellaRevision);
      await privacy.ejecutar(admin.id, request.id, fresh.version, fresh.huellaRevision, 'SUPRIMIR CUENTA');
      assert.equal(await f.db.intentoVocacional.count({ where: { usuarioId: student.id } }), 0);
      assert.equal(await f.db.respuestaVocacional.count({ where: { intentoId: { in: [completed.id, active.id] } } }), 0);
      assert.deepEqual(await service.obtener(other.id, untouched.id), otherBefore);
      assert.ok((await f.db.usuario.findUniqueOrThrow({ where: { id: student.id } })).suprimidaEn);
      assert.equal((await privacy.ejecutar(admin.id, request.id, fresh.version, fresh.huellaRevision, 'SUPRIMIR CUENTA')).repetida, true);
      const app = await f.server({ vocational: true });
      assert.equal((await f.call('/orientacion-vocacional/historial', f.tokenFor(student), {}, app.base)).status, 401);
    } finally {
      if (previous === undefined) delete process.env.ACCOUNT_SUPPRESSION_ENABLED;
      else process.env.ACCOUNT_SUPPRESSION_ENABLED = previous;
    }
  });
};
