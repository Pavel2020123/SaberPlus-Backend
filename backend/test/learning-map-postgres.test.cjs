const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
let db, service, app, origin, jwt;

before(async () => {
  const { validateOwnedConnection } =
    await import('../tool/test_editorial_postgres.mjs');
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error('Use the disposable --learning-map runner.');
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
    LearningMapService,
  } = require('../src/learning-map/learning-map.service.ts');
  const {
    AdminLearningMapController,
    LearningMapController,
  } = require('../src/learning-map/learning-map.controller.ts');
  const { JwtGuard, AdminGuard } = require('../src/auth/jwt.guard.ts');
  const {
    EmailVerificadoGuard,
  } = require('../src/auth/email-verificado.guard.ts');
  const { JwtModule, JwtService } = require('@nestjs/jwt');
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await db.$connect();
  service = new LearningMapService(db);
  const module = await Test.createTestingModule({
    imports: [JwtModule.register({ secret: randomUUID() })],
    controllers: [AdminLearningMapController, LearningMapController],
    providers: [
      { provide: PrismaService, useValue: db },
      LearningMapService,
      JwtGuard,
      AdminGuard,
      EmailVerificadoGuard,
    ],
  }).compile();
  app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  jwt = module.get(JwtService);
});
after(async () => {
  await app?.close();
  await db?.$disconnect();
});

async function fixture(area = 'MATEMATICAS') {
  const theme = await db.tema.create({
    data: {
      nombre: 'Tema privado de prueba',
      area,
      estadoContenido: 'PUBLICADO',
    },
  });
  const nodes = [];
  for (const nombre of ['Fracciones', 'Proporciones', 'Regla de tres'])
    nodes.push(
      await db.subtema.create({
        data: { nombre, temaId: theme.id, estadoContenido: 'PUBLICADO' },
      }),
    );
  return { theme, nodes };
}
async function put(target, previos) {
  const { revision } = await service.read(target, true);
  return service.replace(target, { revision, previos }, 'test-admin');
}
async function token(rol = 'ESTUDIANTE', correoVerificado = true) {
  const user = await db.usuario.create({
    data: {
      nombre: 'No divulgar',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'not-a-password',
      rol,
      correoVerificado,
    },
  });
  return jwt.sign({ sub: user.id, rol: 'ADMIN' }); // Database role, never token role, is authoritative.
}
async function http(path, bearer, method = 'GET', body) {
  return fetch(origin + path, {
    method,
    headers: {
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('chain persists and returns ordered bases without private or academic result data', async () => {
  const {
    nodes: [a, b, c],
  } = await fixture();
  assert.deepEqual((await service.read(c.id, false)).previos, []);
  await put(b.id, [a.id]);
  await put(c.id, [b.id]);
  const result = await service.read(c.id, false);
  assert.equal(result.orientativo, true);
  assert.deepEqual(
    result.previos.map((n) => n.id),
    [b.id],
  );
  assert.deepEqual(
    result.recorrido.map((n) => n.id),
    [a.id, b.id],
  );
  assert.doesNotMatch(
    JSON.stringify(result),
    /actualizadoPor|correo|estadoTema|contrasena|contenido|diagnostico|debilidad/,
  );
  const again = await put(c.id, [b.id]);
  assert.equal(again.revision, result.revision); // identical fresh request is a no-op.
  await put(c.id, []);
  assert.deepEqual((await service.read(c.id, false)).recorrido, []);
});
test('rejects cycles, self links, unknown IDs, unpublished nodes and cross-area relations atomically', async () => {
  const {
    nodes: [a, b, c],
  } = await fixture();
  const {
    nodes: [foreign],
  } = await fixture('INGLES');
  await put(b.id, [a.id]);
  await put(c.id, [b.id]);
  for (const previos of [
    [c.id],
    [a.id],
    ['absent'],
    [foreign.id],
    [b.id, b.id],
  ]) {
    const before = await service.read(a.id, true);
    await assert.rejects(put(a.id, previos), (e) => e.getStatus() === 400);
    assert.deepEqual(await service.read(a.id, true), before);
  }
  await db.subtema.update({
    where: { id: c.id },
    data: { estadoContenido: 'BORRADOR' },
  });
  await assert.rejects(put(a.id, [c.id]), (e) => e.getStatus() === 400);
});
test('archived intermediate nodes are hidden, not bridged; admin can clear relations', async () => {
  const {
    nodes: [a, b, c],
  } = await fixture();
  await put(b.id, [a.id]);
  await put(c.id, [b.id]);
  await db.subtema.update({
    where: { id: b.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  assert.deepEqual((await service.read(c.id, false)).recorrido, []);
  const admin = await service.read(c.id, true);
  assert.equal(admin.previos[0].disponible, false);
  // Hidden relations still participate in cycle validation if later republished.
  await assert.rejects(put(a.id, [c.id]), (e) => e.getStatus() === 400);
  await assert.rejects(service.read(b.id, false), (e) => e.getStatus() === 404);
  await put(b.id, []);
  assert.deepEqual((await service.read(b.id, true)).previos, []);
});
test('simultaneous opposite edges cannot create a cycle and stale revisions never overwrite', async () => {
  const {
    nodes: [a, b],
  } = await fixture('CIENCIAS_NATURALES');
  const { revision } = await service.read(a.id, true);
  const outcomes = await Promise.allSettled([
    service.replace(a.id, { revision, previos: [b.id] }, 'editor-one'),
    service.replace(b.id, { revision, previos: [a.id] }, 'editor-two'),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    outcomes.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  const loser = outcomes[0].status === 'rejected' ? [a, b] : [b, a];
  await assert.rejects(
    put(loser[0].id, [loser[1].id]),
    (e) => e.getStatus() === 400,
  );
});
test('parent archival hides all its paths; deletion cleans dangling relations', async () => {
  const {
    theme,
    nodes: [a, b],
  } = await fixture();
  await put(b.id, [a.id]);
  await db.tema.update({
    where: { id: theme.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await assert.rejects(service.read(b.id, false), (e) => e.getStatus() === 404);
  await db.subtema.delete({ where: { id: a.id } });
  assert.deepEqual((await service.read(b.id, true)).previos, []);
});
test('HTTP authenticates, rejects non-ADMIN writers and validates payload before service', async () => {
  const {
    nodes: [a, b],
  } = await fixture();
  const route = `/admin/mapa-aprendizaje/subtemas/${b.id}`;
  const student = await token();
  const teacher = await token('PROFESOR');
  const admin = await token('ADMIN');
  assert.equal((await http(route)).status, 401);
  for (const bearer of [student, teacher]) {
    assert.equal((await http(route, bearer)).status, 403);
    assert.equal(
      (await http(route, bearer, 'PUT', { revision: 0, previos: [] })).status,
      403,
    );
  }
  const revision = (await service.read(b.id, true)).revision;
  assert.equal(
    (
      await http(route, admin, 'PUT', {
        revision,
        previos: [a.id],
        usuarioId: 'forged',
      })
    ).status,
    400,
  );
  assert.equal(
    (await http(route, admin, 'PUT', { revision, previos: [a.id] })).status,
    200,
  );
  const read = `/mapa-aprendizaje/subtemas/${b.id}`;
  assert.equal((await http(read, student)).status, 200);
  assert.equal(
    (await http(read, await token('ESTUDIANTE', false))).status,
    403,
  );
  assert.equal(
    (await http('/mapa-aprendizaje/subtemas/does-not-exist', student)).status,
    404,
  );
});
test('migration enables RLS and denies direct Supabase client table privileges', async () => {
  const rows =
    await db.$queryRaw`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('MapaAprendizaje','RelacionAprendizaje')`;
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.relrowsecurity));
  for (const role of ['anon', 'authenticated'])
    for (const table of ['MapaAprendizaje', 'RelacionAprendizaje']) {
      const result = await db.$queryRawUnsafe(
        "SELECT has_table_privilege($1, $2, 'SELECT') AS allowed",
        role,
        `"${table}"`,
      );
      assert.equal(result[0].allowed, false);
    }
});
