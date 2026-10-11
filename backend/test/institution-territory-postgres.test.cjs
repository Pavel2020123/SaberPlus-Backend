const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let db, service, admin;
const status = (code) => (error) => error.getStatus?.() === code;
const leticia = { departamentoCodigo: '91', municipioCodigo: '91001' };
const medellin = { departamentoCodigo: '05', municipioCodigo: '05001' };
const valledupar = { departamentoCodigo: '20', municipioCodigo: '20001' };
const version = 'DANE-DIVIPOLA-MGN-2025';
const user = (rol = 'PROFESOR', extra = {}) =>
  db.usuario.create({
    data: {
      nombre: 'Ensayo territorial',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'test-no-login',
      rol,
      correoVerificado: true,
      ...extra,
    },
  });
const application = (extra = {}) => ({
  revision: 0,
  nombre: `Institución ${randomUUID()}`,
  ciudad: 'Texto original de la ciudad',
  correoInstitucional: 'test@example.invalid',
  contacto: 'Representante de ensayo',
  evidencia: 'Autorización ficticia para pruebas locales.',
  declaracion: true,
  ...extra,
});
const decision = (revision, extra = {}) => ({
  revision,
  estado: 'APROBADA',
  mensaje: 'Resultado de revisión institucional.',
  notaInterna: 'Verificación administrativa de ensayo.',
  confirmado: true,
  ...extra,
});
async function pending(extra = {}) {
  const teacher = await user();
  const data = application(extra);
  const { solicitud } = await service.submit(teacher.id, data);
  return { teacher, data, solicitud };
}
const location = (row) => ({
  departamentoCodigo: row.departamentoCodigo,
  municipioCodigo: row.municipioCodigo,
  territorioVersion: row.territorioVersion,
});
const emptyLocation = {
  departamentoCodigo: null,
  municipioCodigo: null,
  territorioVersion: null,
};

before(async () => {
  if (!process.env.COMPETITIVE_TEST_OWNER || !process.env.COMPETITIVE_TEST_URL)
    throw new Error('Use owned territory runner.');
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  require('ts-node').register({
    transpileOnly: true,
    project: 'tsconfig.json',
  });
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  const {
    InstitutionApprovalService,
  } = require('../src/institucion/institution-approval.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  await db.$connect();
  service = new InstitutionApprovalService(db);
  admin = await user('ADMIN');
});
after(async () => db?.$disconnect());

test('migración aditiva conserva institución, ciudad libre, estado, revisión e historial anteriores', async () => {
  const institution = await db.institucion.findUniqueOrThrow({
    where: { id: '11111111-1111-4111-8111-111111111112' },
  });
  const request = await db.solicitudAltaInstitucion.findUniqueOrThrow({
    where: { id: '11111111-1111-4111-8111-111111111113' },
  });
  assert.deepEqual(location(institution), emptyLocation);
  assert.deepEqual(location(request), emptyLocation);
  assert.equal(institution.estadoVerificacion, 'APROBADA');
  assert.equal(request.ciudad, 'Ciudad ambigua antigua');
  assert.equal(request.revision, 1);
  assert.deepEqual(request.historial, []);
});

test('guarda códigos/version declarados, sin crear institución ni privilegios', async () => {
  const f = await pending(leticia);
  await db.$disconnect();
  await db.$connect();
  const own = await service.own(f.teacher.id);
  assert.deepEqual(location(own.solicitud), {
    ...leticia,
    territorioVersion: version,
  });
  assert.equal(own.solicitud.institucionId, null);
  assert.equal(own.solicitud.estado, 'PENDIENTE');
  assert.equal(own.solicitud.ciudad, f.data.ciudad);
  assert.equal(
    await db.miembroInstitucion.count({ where: { usuarioId: f.teacher.id } }),
    0,
  );
});

test('rechaza pareja incompleta, nula, inventada o de departamentos distintos antes de guardar', async () => {
  const teacher = await user();
  for (const codes of [
    { departamentoCodigo: '91' },
    { municipioCodigo: '91001' },
    { departamentoCodigo: null, municipioCodigo: null },
    { departamentoCodigo: '20', municipioCodigo: '91001' },
    { departamentoCodigo: '91', municipioCodigo: '91999' },
    { departamentoCodigo: '00', municipioCodigo: '00001' },
  ])
    await assert.rejects(
      service.submit(teacher.id, application(codes)),
      status(400),
    );
  assert.equal(
    await db.solicitudAltaInstitucion.count({
      where: { solicitanteId: teacher.id },
    }),
    0,
  );
});

test('cliente anterior conserva su flujo sin inventar ubicación incluso al aprobar', async () => {
  const f = await pending({ ciudad: 'Leticia' });
  await service.review(admin.id, f.solicitud.id, decision(1));
  const own = await service.own(f.teacher.id);
  assert.deepEqual(location(own.solicitud), emptyLocation);
  assert.deepEqual(
    location(
      await db.institucion.findUniqueOrThrow({
        where: { id: own.solicitud.institucionId },
      }),
    ),
    emptyLocation,
  );
});

test('solo ADMIN publica ubicación; corrige aprobación con historial y preserva ciudad original', async () => {
  const f = await pending(leticia);
  await assert.rejects(
    service.review(f.teacher.id, f.solicitud.id, decision(1)),
    status(403),
  );
  await service.review(admin.id, f.solicitud.id, decision(1, medellin));
  let row = await service.detail(f.solicitud.id);
  assert.deepEqual(
    location(
      await db.institucion.findUniqueOrThrow({
        where: { id: row.institucionId },
      }),
    ),
    { ...medellin, territorioVersion: version },
  );
  assert.equal(row.historial[1].ubicacionAnterior.municipioCodigo, '91001');
  await service.review(admin.id, row.id, decision(2, valledupar));
  row = await service.detail(row.id);
  assert.equal(row.revision, 3);
  assert.equal(row.ciudad, f.data.ciudad);
  assert.equal(row.historial[2].accion, 'UBICACION_CORREGIDA');
  assert.equal(row.historial[2].actorId, admin.id);
  assert.equal(row.historial[2].ubicacionAnterior.municipioCodigo, '05001');
  assert.equal(row.historial[2].ubicacionNueva.municipioCodigo, '20001');
  assert.equal(
    (
      await db.institucion.findUniqueOrThrow({
        where: { id: row.institucionId },
      })
    ).municipioCodigo,
    '20001',
  );
  const own = await service.own(f.teacher.id);
  assert.equal('historial' in own.solicitud, false);
  assert.equal(JSON.stringify(own).includes('notaInterna'), false);
  await assert.rejects(
    service.review(admin.id, row.id, decision(3, valledupar)),
    status(400),
  );
  await assert.rejects(
    service.review(admin.id, row.id, decision(3)),
    status(400),
  );
});

test('ADMIN puede clasificar legado aprobado sin suspenderlo; la corrección exige revisión vigente', async () => {
  const id = '11111111-1111-4111-8111-111111111113';
  await service.review(admin.id, id, decision(1, leticia));
  const row = await service.detail(id);
  assert.equal(row.estado, 'APROBADA');
  assert.equal(row.historial[0].accion, 'UBICACION_CORREGIDA');
  assert.deepEqual(row.historial[0].ubicacionAnterior, emptyLocation);
  await assert.rejects(
    service.review(admin.id, id, decision(1, medellin)),
    status(409),
  );
});

test('no permite autocorrección a propietario convertido en ADMIN', async () => {
  const f = await pending(leticia);
  await service.review(admin.id, f.solicitud.id, decision(1));
  await db.usuario.update({
    where: { id: f.teacher.id },
    data: { rol: 'ADMIN' },
  });
  await assert.rejects(
    service.review(f.teacher.id, f.solicitud.id, decision(2, medellin)),
    status(403),
  );
});

test('omitir ubicación en cliente anterior no borra clasificación; cambiar texto exige pareja explícita', async () => {
  const f = await pending(leticia);
  await service.review(
    admin.id,
    f.solicitud.id,
    decision(1, { estado: 'REQUIERE_INFORMACION' }),
  );
  const { departamentoCodigo, municipioCodigo, ...legacy } = f.data;
  await assert.rejects(
    service.submit(f.teacher.id, {
      ...legacy,
      revision: 2,
      ciudad: 'Otra ciudad',
    }),
    status(400),
  );
  await service.submit(f.teacher.id, { ...legacy, revision: 2 });
  assert.deepEqual(location((await service.own(f.teacher.id)).solicitud), {
    ...leticia,
    territorioVersion: version,
  });
});

test('rechazar/pedir información/suspender no permite publicar códigos desde revisión', async () => {
  const f = await pending(leticia);
  await assert.rejects(
    service.review(
      admin.id,
      f.solicitud.id,
      decision(1, { estado: 'RECHAZADA', ...medellin }),
    ),
    status(400),
  );
  assert.equal((await service.detail(f.solicitud.id)).revision, 1);
});

test('misma institución/municipio se bloquea aunque cambie texto libre; código diferente no confunde homónimos', async () => {
  const nombre = `Homónimos ${randomUUID()}`;
  const a = await pending({ nombre, ciudad: 'Etiqueta A', ...leticia });
  await service.review(admin.id, a.solicitud.id, decision(1));
  await assert.rejects(
    pending({ nombre, ciudad: 'Etiqueta B', ...leticia }),
    status(409),
  );
  const b = await pending({ nombre, ciudad: 'Etiqueta A', ...medellin });
  await service.review(admin.id, b.solicitud.id, decision(1));
  await assert.rejects(
    service.review(admin.id, b.solicitud.id, decision(2, leticia)),
    status(409),
  );
  const unchanged = await service.detail(b.solicitud.id);
  assert.equal(unchanged.revision, 2);
  assert.equal(unchanged.municipioCodigo, '05001');
  assert.equal(
    (
      await db.institucion.findUniqueOrThrow({
        where: { id: unchanged.institucionId },
      })
    ).municipioCodigo,
    '05001',
  );
});

test('correcciones concurrentes son atómicas: una gana, una recibe conflicto y no hay actualización parcial', async () => {
  const f = await pending(leticia);
  await service.review(admin.id, f.solicitud.id, decision(1));
  const results = await Promise.allSettled([
    service.review(admin.id, f.solicitud.id, decision(2, medellin)),
    service.review(admin.id, f.solicitud.id, decision(2, valledupar)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  const row = await service.detail(f.solicitud.id);
  assert.equal(row.revision, 3);
  assert.equal(row.historial.length, 3);
  assert.deepEqual(
    location(
      await db.institucion.findUniqueOrThrow({
        where: { id: row.institucionId },
      }),
    ),
    location(row),
  );
});

test('dos altas concurrentes del mismo municipio solo pueden activar una institución', async () => {
  const nombre = `Concurrente ${randomUUID()}`;
  const a = await pending({ nombre, ciudad: 'Etiqueta A', ...leticia });
  const b = await pending({ nombre, ciudad: 'Etiqueta B', ...leticia });
  const results = await Promise.allSettled([
    service.review(admin.id, a.solicitud.id, decision(1)),
    service.review(admin.id, b.solicitud.id, decision(1)),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  assert.equal(await db.institucion.count({ where: { nombre } }), 1);
});

test('suspensión conserva clasificación y reactivación no crea una institución nueva', async () => {
  const f = await pending(leticia);
  await service.review(admin.id, f.solicitud.id, decision(1));
  const original = await service.detail(f.solicitud.id);
  await service.review(
    admin.id,
    f.solicitud.id,
    decision(2, { estado: 'SUSPENDIDA' }),
  );
  const suspended = await db.institucion.findUniqueOrThrow({
    where: { id: original.institucionId },
  });
  assert.equal(suspended.estadoVerificacion, 'SUSPENDIDA');
  assert.deepEqual(location(suspended), {
    ...leticia,
    territorioVersion: version,
  });
  await service.review(admin.id, f.solicitud.id, decision(3));
  assert.equal(
    (await service.detail(f.solicitud.id)).institucionId,
    original.institucionId,
  );
  assert.equal(
    await db.miembroInstitucion.count({ where: { usuarioId: f.teacher.id } }),
    1,
  );
});

test('alta codificada sigue detectando un duplicado anterior sin clasificación', async () => {
  const nombre = `Legado duplicado ${randomUUID()}`;
  const legacy = await pending({ nombre, ciudad: 'Leticia' });
  await service.review(admin.id, legacy.solicitud.id, decision(1));
  await assert.rejects(
    pending({ nombre, ciudad: 'Otra etiqueta', ...leticia }),
    status(409),
  );
});

test('versión antigua declarada exige reconfirmar códigos al aprobar', async () => {
  const f = await pending(leticia);
  await db.solicitudAltaInstitucion.update({
    where: { id: f.solicitud.id },
    data: { territorioVersion: 'edicion-antigua' },
  });
  await assert.rejects(
    service.review(admin.id, f.solicitud.id, decision(1)),
    status(409),
  );
  await service.review(admin.id, f.solicitud.id, decision(1, leticia));
  assert.equal(
    (await service.detail(f.solicitud.id)).territorioVersion,
    version,
  );
});

test('CHECK SQL rechaza tuplas parciales o prefijos incompatibles y conserva RLS privado', async () => {
  const f = await pending();
  await service.review(admin.id, f.solicitud.id, decision(1));
  const row = await service.detail(f.solicitud.id);
  for (const [table, id] of [
    ['SolicitudAltaInstitucion', row.id],
    ['Institucion', row.institucionId],
  ]) {
    await assert.rejects(
      db.$executeRawUnsafe(
        `UPDATE "${table}" SET "departamentoCodigo"='05' WHERE id=$1::uuid`,
        id,
      ),
      (error) => error.meta?.code === '23514',
    );
    await assert.rejects(
      db.$executeRawUnsafe(
        `UPDATE "${table}" SET "departamentoCodigo"='05',"municipioCodigo"='91001',"territorioVersion"='test' WHERE id=$1::uuid`,
        id,
      ),
      (error) => error.meta?.code === '23514',
    );
  }
  assert.deepEqual(location(await service.detail(row.id)), emptyLocation);
  const [rls] = await db.$queryRawUnsafe(
    `SELECT relrowsecurity FROM pg_class WHERE oid='public."SolicitudAltaInstitucion"'::regclass`,
  );
  assert.equal(rls.relrowsecurity, true);
  for (const role of ['anon', 'authenticated']) {
    const [privilege] = await db.$queryRawUnsafe(
      `SELECT has_table_privilege($1,'public."SolicitudAltaInstitucion"','SELECT') AS allowed`,
      role,
    );
    assert.equal(privilege.allowed, false);
  }
});
