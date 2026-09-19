const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let db, service, admin, operational;
const status = (code) => (error) => error.getStatus?.() === code;
test('evidencia privada: revoca permisos directos de anon y authenticated', async () => {
  const [table] = await db.$queryRawUnsafe(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public."SolicitudAltaInstitucion"'::regclass`);
  assert.equal(table.relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
      const [result] = await db.$queryRawUnsafe(`SELECT has_table_privilege($1, 'public."SolicitudAltaInstitucion"', $2) AS allowed`, role, privilege);
      assert.equal(result.allowed, false, `${role}: ${privilege}`);
    }
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      await tx.$queryRawUnsafe('SELECT * FROM "SolicitudAltaInstitucion"');
    }), error => error.code === 'P2010' && error.meta?.code === '42501');
  }
});
test('RLS oculta evidencia aun si se concede SELECT por accidente; el permiso de ensayo revierte', async () => {
  const rollback = new Error('ROLLBACK_TEST_ONLY');
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`GRANT SELECT ON "SolicitudAltaInstitucion" TO ${role}`);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
      assert.deepEqual(await tx.$queryRawUnsafe('SELECT * FROM "SolicitudAltaInstitucion"'), []);
      throw rollback;
    }), error => error === rollback);
  }
});
test('migración conserva el legado sin autoaprobar y fija transición de 30 días', async () => {
  const institution = await db.institucion.findUniqueOrThrow({
    where: { id: '11111111-1111-4111-8111-111111111111' },
  });
  assert.equal(institution.estadoVerificacion, 'LEGADO_EN_REVISION');
  const days = (institution.transicionHasta.getTime() - Date.now()) / 86400000;
  assert.ok(days > 29 && days <= 30);
  const request = await db.solicitudAltaInstitucion.findUniqueOrThrow({
    where: { institucionId: institution.id },
  });
  assert.equal(request.estado, 'LEGADO_EN_REVISION');
  assert.equal(request.nombreNormalizado, 'colegio aguila legado');
  assert.equal(request.solicitanteId, null);
  await assert.rejects(
    pending(application({ nombre: 'COLEGIO AGUILA LEGADO' })),
    status(409),
  );
});
before(async () => {
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error('Usa el ejecutor --institution-approval.');
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
    InstitutionApprovalService,
  } = require('../src/institucion/institution-approval.service.ts');
  operational =
    require('../src/institucion/institution-approval.policy.ts').institutionOperational;
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  service = new InstitutionApprovalService(db);
  admin = await user('ADMIN');
});
after(async () => db?.$disconnect());
const user = (rol = 'PROFESOR', extra = {}) =>
  db.usuario.create({
    data: {
      nombre: 'Ensayo de aprobación',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'test-no-login',
      rol,
      correoVerificado: true,
      ...extra,
    },
  });
const application = (extra = {}) => ({
  revision: 0,
  nombre: `Colegio ${randomUUID()}`,
  ciudad: 'Bogotá',
  correoInstitucional: 'colegio@example.invalid',
  contacto: 'Rectora, contacto de ensayo',
  evidencia: 'Autorización ficticia de representante para ensayo aislado.',
  declaracion: true,
  ...extra,
});
const decision = (revision, estado = 'APROBADA') => ({
  revision,
  estado,
  mensaje: 'Respuesta para el profesor del ensayo.',
  notaInterna: 'Comprobación interna privada del ensayo.',
  confirmado: true,
});
async function pending(data = application()) {
  const teacher = await user();
  const { solicitud } = await service.submit(teacher.id, data);
  return { teacher, solicitud, data };
}

test('envío persistente no crea institución, membresía ni privilegios; no duplica al reenviar', async () => {
  const f = await pending();
  await db.$disconnect();
  await db.$connect();
  const own = await service.own(f.teacher.id);
  assert.equal(own.solicitud.estado, 'PENDIENTE');
  assert.equal(own.puedeEditar, false);
  assert.equal(
    await db.miembroInstitucion.count({ where: { usuarioId: f.teacher.id } }),
    0,
  );
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: f.teacher.id } }))
      .institucionId,
    null,
  );
  await assert.rejects(service.submit(f.teacher.id, f.data), status(409));
  assert.equal(
    await db.solicitudAltaInstitucion.count({
      where: { solicitanteId: f.teacher.id },
    }),
    1,
  );
});
test('estudiante y profesor sin correo verificado no pueden solicitar', async () => {
  for (const account of [
    await user('ESTUDIANTE'),
    await user('PROFESOR', { correoVerificado: false }),
  ])
    await assert.rejects(
      service.submit(account.id, application()),
      status(403),
    );
});
test('solo ADMIN aprueba y la creación/vinculación es atómica; no se exponen notas privadas', async () => {
  const f = await pending();
  await assert.rejects(
    service.review(f.teacher.id, f.solicitud.id, decision(1)),
    status(403),
  );
  await service.review(admin.id, f.solicitud.id, decision(1));
  const own = await service.own(f.teacher.id),
    member = await db.miembroInstitucion.findUniqueOrThrow({
      where: { usuarioId: f.teacher.id },
    });
  assert.equal(own.solicitud.estado, 'APROBADA');
  assert.equal(member.rol, 'PROPIETARIO');
  assert.equal(own.solicitud.institucionId, member.institucionId);
  assert.equal(
    operational(
      await db.institucion.findUniqueOrThrow({
        where: { id: member.institucionId },
      }),
    ),
    true,
  );
  assert.equal(JSON.stringify(own).includes('notaInterna'), false);
  assert.equal(
    (await service.detail(f.solicitud.id)).historial[1].notaInterna,
    decision(1).notaInterna,
  );
  await assert.rejects(
    service.review(admin.id, f.solicitud.id, decision(1)),
    status(409),
  );
});
test('pedir información y rechazar permiten corregir con revisión actual y conservan historial', async () => {
  const f = await pending();
  await service.review(
    admin.id,
    f.solicitud.id,
    decision(1, 'REQUIERE_INFORMACION'),
  );
  assert.equal((await service.own(f.teacher.id)).puedeEditar, true);
  await assert.rejects(service.submit(f.teacher.id, f.data), status(409));
  await service.submit(f.teacher.id, { ...f.data, revision: 2 });
  await service.review(admin.id, f.solicitud.id, decision(3, 'RECHAZADA'));
  await service.submit(f.teacher.id, { ...f.data, revision: 4 });
  assert.equal((await service.detail(f.solicitud.id)).historial.length, 5);
});
test('suspender conserva estudiantes y membresías pero quita acceso; reactivar exige revisión', async () => {
  const f = await pending();
  await service.review(admin.id, f.solicitud.id, decision(1));
  const owner = await db.usuario.findUniqueOrThrow({
    where: { id: f.teacher.id },
  });
  const student = await user('ESTUDIANTE', {
    institucionId: owner.institucionId,
  });
  await service.review(admin.id, f.solicitud.id, decision(2, 'SUSPENDIDA'));
  assert.equal(
    operational(
      await db.institucion.findUniqueOrThrow({
        where: { id: owner.institucionId },
      }),
    ),
    false,
  );
  assert.equal(
    (await db.usuario.findUniqueOrThrow({ where: { id: student.id } }))
      .institucionId,
    owner.institucionId,
  );
  await service.review(admin.id, f.solicitud.id, decision(3));
  assert.equal(
    operational(
      await db.institucion.findUniqueOrThrow({
        where: { id: owner.institucionId },
      }),
    ),
    true,
  );
});
test('duplicados normalizados no se activan dos veces bajo aprobaciones concurrentes', async () => {
  const name = `Colegio Águila ${randomUUID()}`,
    a = await pending(application({ nombre: name })),
    b = await pending(
      application({
        nombre: name.toUpperCase().replace('Á', 'A'),
        ciudad: 'BOGOTA',
      }),
    );
  const results = await Promise.allSettled([
    service.review(admin.id, a.solicitud.id, decision(1)),
    service.review(admin.id, b.solicitud.id, decision(1)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    await db.solicitudAltaInstitucion.count({
      where: {
        id: { in: [a.solicitud.id, b.solicitud.id] },
        estado: 'APROBADA',
      },
    }),
    1,
  );
  const failure = results.find((r) => r.status === 'rejected');
  assert.equal(failure.reason.getStatus(), 409);
});
test('doble revisión de la misma solicitud no crea dos instituciones', async () => {
  const f = await pending();
  const results = await Promise.allSettled([
    service.review(admin.id, f.solicitud.id, decision(1)),
    service.review(admin.id, f.solicitud.id, decision(1)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    await db.miembroInstitucion.count({ where: { usuarioId: f.teacher.id } }),
    1,
  );
});
test('conflicto por solicitante ya vinculado revierte estado e historial', async () => {
  const f = await pending();
  const other = await db.institucion.create({
    data: {
      nombre: 'Otra institución',
      codigoUnico: randomUUID(),
      estadoVerificacion: 'APROBADA',
    },
  });
  await db.usuario.update({
    where: { id: f.teacher.id },
    data: { institucionId: other.id },
  });
  await assert.rejects(
    service.review(admin.id, f.solicitud.id, decision(1)),
    status(409),
  );
  const request = await service.detail(f.solicitud.id);
  assert.equal(request.estado, 'PENDIENTE');
  assert.equal(request.revision, 1);
  assert.equal(request.historial.length, 1);
});
test('docente no propietario ve estado sin evidencia y no puede corregir; búsqueda no revela códigos', async () => {
  const f = await pending();
  await service.review(admin.id, f.solicitud.id, decision(1));
  const institutionId = (await service.own(f.teacher.id)).solicitud
    .institucionId;
  const colleague = await user('PROFESOR', { institucionId: institutionId });
  const own = await service.own(colleague.id);
  assert.equal(own.solicitud.evidencia, '');
  assert.equal(own.solicitud.contacto, '');
  assert.equal(own.puedeEditar, false);
  await assert.rejects(
    service.submit(colleague.id, { ...f.data, revision: 2 }),
    status(403),
  );
  const matches = await service.matches(colleague.id, f.data.nombre);
  assert.deepEqual(Object.keys(matches.coincidencias[0]).sort(), [
    'ciudad',
    'nombre',
  ]);
});
test('autorrevisión de antiguo profesor convertido en ADMIN se rechaza', async () => {
  const f = await pending();
  await db.usuario.update({
    where: { id: f.teacher.id },
    data: { rol: 'ADMIN' },
  });
  await assert.rejects(
    service.review(f.teacher.id, f.solicitud.id, decision(1)),
    status(403),
  );
});
