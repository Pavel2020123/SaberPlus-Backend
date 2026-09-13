const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

let db, service;
before(async () => {
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error(
      'Usa node tool/test_editorial_postgres.mjs --teacher-priorities.',
    );
  const { validateOwnedConnection } =
    await import('../tool/test_editorial_postgres.mjs');
  validateOwnedConnection(
    process.env.EDITORIAL_TEST_URL,
    JSON.parse(await readFile(process.env.EDITORIAL_TEST_OWNER, 'utf8')),
  );
  require('ts-node').register({
    transpileOnly: true,
    project: 'tsconfig.json',
  });
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  const {
    InstitucionAccesoService,
  } = require('../src/institucion/institucion-acceso.service.ts');
  const {
    TeacherPrioritiesService,
  } = require('../src/institucion/teacher-priorities.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  service = new TeacherPrioritiesService(db, new InstitucionAccesoService(db));
});
after(async () => {
  await db?.$disconnect();
});

async function fixture() {
  const school = await db.institucion.create({
    data: {
      nombre: 'Colegio de ensayo',
      codigoUnico: randomUUID(),
      planActual: 'SIN_ANUNCIOS',
    },
  });
  const user = (rol) =>
    db.usuario.create({
      data: {
        nombre: rol,
        correo: `${randomUUID()}@example.invalid`,
        contrasenaHash: 'no-login-test',
        rol,
        institucionId: school.id,
        correoVerificado: true,
      },
    });
  const teacher = await user('PROFESOR');
  const student = await user('ESTUDIANTE');
  const member = await db.miembroInstitucion.create({
    data: { usuarioId: teacher.id, institucionId: school.id, rol: 'PROFESOR' },
  });
  const group = await db.clase.create({
    data: {
      nombre: 'Once ensayo',
      codigoIngreso: randomUUID(),
      grado: 'ONCE',
      institucionId: school.id,
      profesores: { create: { miembroId: member.id } },
    },
  });
  await db.claseEstudiante.create({
    data: {
      claseId: group.id,
      usuarioId: student.id,
      aceptacionExplicita: true,
      fechaIngreso: new Date(Date.now() - 86400000),
    },
  });
  const topic = await db.tema.create({
    data: {
      nombre: 'Proporcionalidad',
      area: 'MATEMATICAS',
      estadoContenido: 'PUBLICADO',
    },
  });
  const subtopic = await db.subtema.create({
    data: {
      nombre: 'Regla de tres',
      temaId: topic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  const questions = [];
  for (let i = 0; i < 6; i++)
    questions.push(
      await db.pregunta.create({
        data: {
          enunciado: `Pregunta propia ${i}`,
          subtemaId: subtopic.id,
          estadoContenido: 'PUBLICADO',
        },
      }),
    );
  const dto = {
    id: randomUUID(),
    temaId: topic.id,
    subtemaId: subtopic.id,
    venceEn: new Date(Date.now() + 86400000).toISOString(),
  };
  return {
    school,
    teacher,
    student,
    member,
    group,
    topic,
    subtopic,
    questions,
    dto,
  };
}
async function assign(f) {
  await service.create(f.teacher.id, f.group.id, f.dto);
  // Plazo de ensayo histórico, sin reloj falso ni pausas. Solo esta base temporal.
  return db.prioridadDocente.update({
    where: { id: f.dto.id },
    data: { creadoEn: new Date(Date.now() - 3600000) },
  });
}
async function answer(f, question, date, extra = {}) {
  return db.historialRespuesta.create({
    data: {
      usuarioId: f.student.id,
      sesionId: randomUUID(),
      preguntaId: question.id,
      respuestaSeleccionadaId: 'opcion-ensayo',
      respuestaCorrectaId: 'clave-ensayo',
      area: 'MATEMATICAS',
      origen: 'PRACTICA',
      esCorrecta: false,
      fechaRespuesta: date,
      ...extra,
    },
  });
}
const status = (expected) => (error) => error.getStatus?.() === expected;

test('SQL: migración, RLS y restricciones del plazo/meta', async () => {
  const rows =
    await db.$queryRaw`SELECT relrowsecurity AS enabled FROM pg_class WHERE relname = 'PrioridadDocente'`;
  assert.equal(rows[0].enabled, true);
  await db.$executeRawUnsafe('CREATE ROLE sp_priority_reader NOLOGIN');
  await db.$executeRawUnsafe(
    'GRANT SELECT ON "PrioridadDocente" TO sp_priority_reader',
  );
  const f = await fixture();
  await assign(f);
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE sp_priority_reader');
    const hidden = await tx.$queryRaw`SELECT id FROM "PrioridadDocente"`;
    assert.equal(
      hidden.length,
      0,
      'RLS sin políticas impide acceso directo incluso con SELECT',
    );
  });
  await assert.rejects(
    db.prioridadDocente.update({
      where: { id: f.dto.id },
      data: { metaPreguntas: 1 },
    }),
  );
  await assert.rejects(
    db.prioridadDocente.update({
      where: { id: f.dto.id },
      data: { venceEn: new Date(Date.now() + 40 * 86400000) },
    }),
  );
});

test('concurrencia: el mismo ID se guarda una vez y devuelve la misma prioridad', async () => {
  const f = await fixture();
  const results = await Promise.all([
    service.create(f.teacher.id, f.group.id, f.dto),
    service.create(f.teacher.id, f.group.id, f.dto),
  ]);
  assert.equal(results.filter((r) => r.reutilizada).length, 1);
  assert.equal(
    await db.prioridadDocente.count({ where: { claseId: f.group.id } }),
    1,
  );
  assert.equal(
    await db.auditoriaInstitucion.count({
      where: { actorId: f.teacher.id, accion: 'PRIORIDAD_DOCENTE_CREADA' },
    }),
    1,
  );
  await assert.rejects(
    service.create(f.teacher.id, f.group.id, {
      ...f.dto,
      subtemaId: undefined,
    }),
    status(409),
  );
});

test('concurrencia: dos IDs distintos para igual selección no duplican una prioridad activa', async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    service.create(f.teacher.id, f.group.id, f.dto),
    service.create(f.teacher.id, f.group.id, { ...f.dto, id: randomUUID() }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
});

test('SQL: cuenta únicos del snapshot, no exige aciertos ni atribuye dominio', async () => {
  const f = await fixture();
  const p = await assign(f);
  const during = new Date(p.creadoEn.getTime() + 1000);
  for (let i = 0; i < 8; i++) await answer(f, f.questions[0], during);
  await answer(f, f.questions[1], new Date(p.creadoEn.getTime() - 1));
  await answer(f, f.questions[2], new Date(p.venceEn.getTime() + 1));
  await answer(f, f.questions[3], during, { area: 'INGLES' });
  await answer(f, f.questions[4], new Date(Date.now() + 3600000));
  const extra = await db.pregunta.create({
    data: {
      enunciado: 'Nueva después de asignar',
      subtemaId: f.subtopic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  await answer(f, extra, during);
  let report = await service.report(f.teacher.id, f.group.id, p.id, 1);
  assert.equal(report.estudiantes[0].preguntasPracticadas, 1);
  for (const q of f.questions.slice(1, 5)) await answer(f, q, during);
  report = await service.report(f.teacher.id, f.group.id, p.id, 1);
  assert.equal(report.estudiantes[0].preguntasPracticadas, 5);
  assert.equal(report.estudiantes[0].cumplida, true);
  assert.equal(report.estudiantes[0].acreditaDominio, false);
  const own = await service.listForStudent(f.student.id, 1);
  assert.equal(own.prioridades[0].cumplida, true);
  for (const secret of [
    'preguntaIds',
    'huellaSolicitud',
    'creadoPorId',
    'correo',
    'respuestaCorrectaId',
  ])
    assert.equal(JSON.stringify(report).includes(`"${secret}"`), false);
});

test('retiro idempotente detiene el conteo, conserva historial y no reactiva al reintentar', async () => {
  const f = await fixture();
  const p = await assign(f);
  await answer(f, f.questions[0], new Date(p.creadoEn.getTime() + 1000));
  const first = await service.withdraw(f.teacher.id, f.group.id, p.id);
  await service.withdraw(f.teacher.id, f.group.id, p.id);
  await answer(
    f,
    f.questions[1],
    new Date(first.prioridad.retiradoEn.getTime() + 1),
  );
  const report = await service.report(f.teacher.id, f.group.id, p.id, 1);
  assert.equal(report.prioridad.estado, 'RETIRADA');
  assert.equal(report.estudiantes[0].preguntasPracticadas, 1);
  assert.equal(
    (await service.create(f.teacher.id, f.group.id, f.dto)).prioridad.estado,
    'RETIRADA',
  );
  assert.equal(
    await db.auditoriaInstitucion.count({
      where: { actorId: f.teacher.id, accion: 'PRIORIDAD_DOCENTE_RETIRADA' },
    }),
    1,
  );
});

test('vencimiento excluye respuestas en el límite y posteriores; ingreso tardío no es incumplimiento', async () => {
  const f = await fixture();
  const p = await assign(f);
  const end = new Date(Date.now() - 60000);
  await db.prioridadDocente.update({
    where: { id: p.id },
    data: { venceEn: end },
  });
  await answer(f, f.questions[0], new Date(end.getTime() - 1));
  await answer(f, f.questions[1], end);
  await answer(f, f.questions[2], new Date(end.getTime() + 1));
  let report = await service.report(f.teacher.id, f.group.id, p.id, 1);
  assert.equal(report.prioridad.estado, 'VENCIDA');
  assert.equal(report.estudiantes[0].preguntasPracticadas, 1);
  await db.claseEstudiante.update({
    where: {
      usuarioId_claseId: { usuarioId: f.student.id, claseId: f.group.id },
    },
    data: { fechaIngreso: new Date() },
  });
  report = await service.report(f.teacher.id, f.group.id, p.id, 1);
  assert.equal(report.estudiantes[0].estadoCumplimiento, 'NO_APLICA');
});

test('alcance: otro grupo/institución, rol estudiante y profesor retirado no acceden al informe', async () => {
  const f = await fixture(),
    other = await fixture();
  await assign(f);
  await assert.rejects(
    service.report(other.teacher.id, f.group.id, f.dto.id, 1),
    status(404),
  );
  await assert.rejects(
    service.report(f.student.id, f.group.id, f.dto.id, 1),
    status(403),
  );
  assert.deepEqual(
    (await service.listForStudent(other.student.id, 1)).prioridades,
    [],
  );
  await db.claseProfesor.delete({
    where: {
      claseId_miembroId: { claseId: f.group.id, miembroId: f.member.id },
    },
  });
  await assert.rejects(
    service.report(f.teacher.id, f.group.id, f.dto.id, 1),
    status(403),
  );
});

test('plan vencido: no crea/consulta informes; estudiante conserva acceso y profesor puede retirar', async () => {
  const f = await fixture();
  await assign(f);
  await db.institucion.update({
    where: { id: f.school.id },
    data: { fechaVencimientoPlan: new Date(Date.now() - 1000) },
  });
  await assert.rejects(
    service.create(f.teacher.id, f.group.id, { ...f.dto, id: randomUUID() }),
    status(403),
  );
  await assert.rejects(
    service.report(f.teacher.id, f.group.id, f.dto.id, 1),
    status(403),
  );
  assert.equal(
    (await service.listForStudent(f.student.id, 1)).prioridades.length,
    1,
  );
  assert.equal(
    (await service.listForTeacher(f.teacher.id, f.group.id, 1)).prioridades
      .length,
    1,
  );
  await service.withdraw(f.teacher.id, f.group.id, f.dto.id);
});

test('archivado conserva práctica histórica y avisa contenido insuficiente; salida del grupo retira acceso', async () => {
  const f = await fixture();
  const p = await assign(f);
  await answer(f, f.questions[0], new Date(p.creadoEn.getTime() + 1000));
  await db.tema.update({
    where: { id: f.topic.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  const report = await service.report(f.teacher.id, f.group.id, f.dto.id, 1);
  assert.equal(report.estudiantes[0].preguntasPracticadas, 1);
  assert.equal(report.contenidoPublicadoSuficiente, false);
  await db.claseEstudiante.delete({
    where: {
      usuarioId_claseId: { usuarioId: f.student.id, claseId: f.group.id },
    },
  });
  assert.deepEqual(
    (await service.listForStudent(f.student.id, 1)).prioridades,
    [],
  );
  assert.deepEqual(
    (await service.report(f.teacher.id, f.group.id, f.dto.id, 1)).estudiantes,
    [],
  );
});

test('catálogo solo publicado, parentesco correcto y mínimo de cinco preguntas', async () => {
  const f = await fixture();
  const catalog = await service.catalog(f.teacher.id, f.group.id, {
    pagina: 1,
    area: 'MATEMATICAS',
  });
  assert.ok(catalog.subtemas.every((s) => s.tema.area === 'MATEMATICAS'));
  const draft = await db.subtema.create({
    data: { nombre: 'Borrador', temaId: f.topic.id },
  });
  await assert.rejects(
    service.create(f.teacher.id, f.group.id, { ...f.dto, subtemaId: draft.id }),
    status(400),
  );
  const other = await fixture();
  await assert.rejects(
    service.create(f.teacher.id, f.group.id, {
      ...f.dto,
      subtemaId: other.subtopic.id,
    }),
    status(400),
  );
  await db.pregunta.updateMany({
    where: {
      subtemaId: f.subtopic.id,
      id: { in: f.questions.slice(0, 2).map((q) => q.id) },
    },
    data: { estadoContenido: 'BORRADOR' },
  });
  await assert.rejects(
    service.create(f.teacher.id, f.group.id, f.dto),
    status(400),
  );
});

test('concurrencia: dos selecciones diferentes no superan diez prioridades activas', async () => {
  const f = await fixture(),
    other = await fixture();
  const p = await assign(f);
  for (let i = 0; i < 8; i++)
    await db.prioridadDocente.create({
      data: {
        ...p,
        id: randomUUID(),
        temaId: `tema-ensayo-${i}`,
        huellaSolicitud: `ensayo-${i}`,
      },
    });
  const results = await Promise.allSettled([
    service.create(f.teacher.id, f.group.id, {
      ...f.dto,
      id: randomUUID(),
      subtemaId: undefined,
    }),
    service.create(f.teacher.id, f.group.id, {
      ...other.dto,
      id: randomUUID(),
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  assert.equal(
    await db.prioridadDocente.count({
      where: { claseId: f.group.id, retiradoEn: null },
    }),
    10,
  );
});
