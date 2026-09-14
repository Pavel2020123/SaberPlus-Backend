const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

let db, service, makeService;
before(async () => {
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error('Usa node tool/test_editorial_postgres.mjs --study-time.');
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
    StudentEvidenceService,
  } = require('../src/institucion/student-evidence.service.ts');
  const {
    LearningEvidenceService,
  } = require('../src/diagnostico/learning-evidence.service.ts');
  const {
    StudyTimeService,
  } = require('../src/institucion/study-time.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  makeService = () =>
    new StudyTimeService(
      db,
      new StudentEvidenceService(
        db,
        new InstitucionAccesoService(db),
        new LearningEvidenceService(db),
      ),
    );
  service = makeService();
});
after(async () => {
  await db?.$disconnect();
});
const status = (expected) => (error) => error.getStatus?.() === expected;
const event = (date = new Date(Date.now() - 3600000)) => ({
  eventoId: `pomodoro:${randomUUID()}`,
  duracionSegundos: 1500,
  finalizadoEn: date.toISOString(),
});
const batch = (...events) => ({ version: 1, eventos: events });
async function fixture() {
  const school = await db.institucion.create({
    data: {
      nombre: 'Colegio P4 ensayo',
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
  const outsider = await user('ESTUDIANTE');
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
    },
  });
  return { school, teacher, student, outsider, member, group };
}
async function question() {
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
  return db.pregunta.create({
    data: {
      enunciado: 'Pregunta propia para ensayo P4',
      subtemaId: subtopic.id,
      estadoContenido: 'PUBLICADO',
    },
  });
}

test('persistencia, reconocimiento tras reconexión y aislamiento por usuario', async () => {
  const f = await fixture();
  const e = event();
  const result = await service.synchronize(f.student.id, batch(e));
  assert.equal(result.confirmados[0].reutilizado, false);
  await db.$disconnect();
  await db.$connect();
  const retry = await makeService().synchronize(f.student.id, batch(e));
  assert.equal(retry.confirmados[0].reutilizado, true);
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    1,
  );
  const other = await service.synchronize(f.outsider.id, batch(e));
  assert.equal(other.confirmados[0].reutilizado, false);
  const own = await service.ownSummary(f.student.id, 7);
  assert.equal(own.totales.bloquesPomodoro, 1);
});

test('mismo ID con otra fecha produce 409 sin cambiar el registro', async () => {
  const f = await fixture();
  const e = event();
  await service.synchronize(f.student.id, batch(e));
  await assert.rejects(
    service.synchronize(
      f.student.id,
      batch({
        ...e,
        finalizadoEn: new Date(Date.now() - 7200000).toISOString(),
      }),
    ),
    status(409),
  );
  const stored = await db.pomodoroRegistrado.findFirst({
    where: { usuarioId: f.student.id },
  });
  assert.equal(stored.finalizadoEn.toISOString(), e.finalizadoEn);
});

test('dos peticiones concurrentes del mismo bloque crean una sola fila', async () => {
  const f = await fixture();
  const e = event();
  const results = await Promise.all([
    service.synchronize(f.student.id, batch(e)),
    service.synchronize(f.student.id, batch(e)),
  ]);
  assert.equal(results.filter((r) => !r.confirmados[0].reutilizado).length, 1);
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    1,
  );
});

test('IDs diferentes y concurrentes tampoco permiten bloques superpuestos', async () => {
  const f = await fixture();
  const date = new Date(Date.now() - 3600000);
  const results = await Promise.allSettled([
    service.synchronize(f.student.id, batch(event(date))),
    service.synchronize(
      f.student.id,
      batch(event(new Date(date.getTime() + 1000))),
    ),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const failed = results.find((r) => r.status === 'rejected');
  assert.equal(failed.reason.getStatus(), 409);
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    1,
  );
});

test('acepta bloques contiguos, rechaza solapes y el lote es atómico', async () => {
  const f = await fixture();
  const first = event();
  const next = event(
    new Date(new Date(first.finalizadoEn).getTime() + 1500000),
  );
  await service.synchronize(f.student.id, batch(first, next));
  const before = event(
    new Date(new Date(first.finalizadoEn).getTime() - 1500000),
  );
  const overlap = event(new Date(new Date(next.finalizadoEn).getTime() + 1000));
  await assert.rejects(
    service.synchronize(f.student.id, batch(before, overlap)),
    status(409),
  );
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    2,
  );
});

test('rechaza bloques futuros, antiguos, duración falsa, fuente falsa y IDs duplicados', async () => {
  const f = await fixture();
  const e = event();
  const invalid = [
    batch(event(new Date(Date.now() + 60000))),
    batch(event(new Date(Date.now() - 91 * 86400000))),
    batch({ ...e, duracionSegundos: 100 }),
    batch({ ...e, eventoId: `practice:${randomUUID()}` }),
    batch({ ...e, finalizadoEn: '2026-09-13T15:00:00' }),
    batch(e, e),
    batch(),
  ];
  for (const dto of invalid)
    await assert.rejects(service.synchronize(f.student.id, dto), status(400));
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    0,
  );
  await assert.rejects(
    service.synchronize(f.teacher.id, batch(e)),
    status(403),
  );
});

test('historial confirmado se reutiliza sin importar contadores locales ni duplicar respuestas', async () => {
  const f = await fixture();
  const q = await question();
  const date = new Date(Date.now() - 300000);
  const session = randomUUID();
  const answer = {
    usuarioId: f.student.id,
    sesionId: session,
    preguntaId: q.id,
    respuestaSeleccionadaId: 'opcion-ensayo',
    respuestaCorrectaId: 'clave-ensayo',
    area: 'MATEMATICAS',
    origen: 'PRACTICA',
    esCorrecta: true,
    tiempoRespuestaSegundos: 60,
    fechaRespuesta: date,
  };
  await db.historialRespuesta.create({ data: answer });
  await db.historialRespuesta.create({
    data: { ...answer, fechaRespuesta: new Date(date.getTime() + 1) },
  });
  await db.historialRespuesta.create({
    data: {
      ...answer,
      sesionId: randomUUID(),
      origen: 'DIAGNOSTICO',
      tiempoRespuestaSegundos: null,
      esCorrecta: false,
    },
  });
  await db.historialRespuesta.create({
    data: { ...answer, usuarioId: f.outsider.id, sesionId: randomUUID() },
  });
  await service.synchronize(f.student.id, batch(event()));
  const summary = await service.ownSummary(f.student.id, 7);
  assert.equal(summary.totales.segundosEvaluaciones, 60);
  assert.equal(summary.totales.segundosPomodoroDeclarados, 1500);
  assert.equal(summary.totales.respuestas, 2);
  assert.equal(summary.totales.respuestasSinTiempo, 1);
  assert.equal(summary.evolucion.length, 7);
  for (const key of [
    'sesionId',
    'preguntaId',
    'respuestaCorrectaId',
    'eventoId',
  ])
    assert.ok(!JSON.stringify(summary).includes(`"${key}"`));
  // Archivar contenido no borra el tiempo histórico registrado.
  await db.pregunta.update({
    where: { id: q.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  assert.equal(
    (await service.ownSummary(f.student.id, 7)).totales.segundosEvaluaciones,
    60,
  );
});

test('docente ve alumno de su grupo; fuera de alcance, otro colegio y membresía retirada no', async () => {
  const f = await fixture();
  const other = await fixture();
  await service.synchronize(f.student.id, batch(event()));
  const result = await service.teacherSummary(f.teacher.id, f.student.id, 7);
  assert.equal(result.estudiante.id, f.student.id);
  assert.equal(result.evolucion.totales.bloquesPomodoro, 1);
  await assert.rejects(
    service.teacherSummary(f.teacher.id, f.outsider.id, 7),
    status(404),
  );
  await assert.rejects(
    service.teacherSummary(f.teacher.id, other.student.id, 7),
    status(404),
  );
  await assert.rejects(
    service.teacherSummary(f.student.id, f.student.id, 7),
    status(403),
  );
  await db.miembroInstitucion.delete({ where: { id: f.member.id } });
  await assert.rejects(
    service.teacherSummary(f.teacher.id, f.student.id, 7),
    status(403),
  );
});

test('propietario tiene alcance institucional; plan básico no accede al detalle', async () => {
  const f = await fixture();
  await db.miembroInstitucion.update({
    where: { id: f.member.id },
    data: { rol: 'PROPIETARIO' },
  });
  await service.teacherSummary(f.teacher.id, f.outsider.id, 30);
  await db.institucion.update({
    where: { id: f.school.id },
    data: { planActual: 'GRATIS' },
  });
  await assert.rejects(
    service.teacherSummary(f.teacher.id, f.student.id, 30),
    status(403),
  );
  // Los derechos del estudiante no dependen del plan del colegio.
  await service.ownSummary(f.student.id, 30);
  await service.synchronize(f.student.id, batch(event()));
});

test('RLS sin políticas bloquea lectura directa y SQL impone duración/FK', async () => {
  const f = await fixture();
  await service.synchronize(f.student.id, batch(event()));
  const rows =
    await db.$queryRaw`SELECT relrowsecurity AS enabled FROM pg_class WHERE relname = 'PomodoroRegistrado'`;
  assert.equal(rows[0].enabled, true);
  await db.$executeRawUnsafe('CREATE ROLE sp_study_reader NOLOGIN');
  await db.$executeRawUnsafe(
    'GRANT SELECT ON "PomodoroRegistrado" TO sp_study_reader',
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE sp_study_reader');
    assert.equal(await tx.pomodoroRegistrado.count(), 0);
  });
  await assert.rejects(
    db.pomodoroRegistrado.create({
      data: {
        usuarioId: f.student.id,
        eventoId: event().eventoId,
        finalizadoEn: new Date(),
        duracionSegundos: 1,
      },
    }),
  );
  await assert.rejects(
    db.pomodoroRegistrado.create({
      data: {
        usuarioId: randomUUID(),
        eventoId: event().eventoId,
        finalizadoEn: new Date(),
      },
    }),
  );
});

test('borrar la cuenta elimina sus bloques, sin afectar otros estudiantes', async () => {
  const f = await fixture();
  await service.synchronize(f.student.id, batch(event()));
  await service.synchronize(f.outsider.id, batch(event()));
  await db.usuario.delete({ where: { id: f.student.id } });
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.student.id } }),
    0,
  );
  assert.equal(
    await db.pomodoroRegistrado.count({ where: { usuarioId: f.outsider.id } }),
    1,
  );
});
