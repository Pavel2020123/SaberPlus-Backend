const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
let db, service, service2, db2, app, jwt, origin, ids;

before(async () => {
  const { validateOwnedConnection } = await import('../tool/test_editorial_postgres.mjs');
  if (!process.env.EDITORIAL_TEST_URL || !process.env.EDITORIAL_TEST_OWNER)
    throw Error('Use node tool/test_editorial_postgres.mjs --orientacion-vocacional');
  validateOwnedConnection(process.env.EDITORIAL_TEST_URL,
    JSON.parse(await readFile(process.env.EDITORIAL_TEST_OWNER, 'utf8')));
  require('ts-node').register({ transpileOnly: true, project: 'tsconfig.json' });
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  const { OrientacionVocacionalService } = require('../src/orientacion-vocacional/orientacion-vocacional.service.ts');
  const { OrientacionVocacionalController } = require('../src/orientacion-vocacional/orientacion-vocacional.controller.ts');
  const { JwtGuard } = require('../src/auth/jwt.guard.ts');
  const { EmailVerificadoGuard } = require('../src/auth/email-verificado.guard.ts');
  const { JwtModule, JwtService } = require('@nestjs/jwt');
  const { Test } = require('@nestjs/testing');
  const { ValidationPipe } = require('@nestjs/common');
  ids = require('../src/orientacion-vocacional/ov1.rules.ts').PREGUNTA_IDS;
  db = new PrismaService({ datasources: { db: { url: process.env.EDITORIAL_TEST_URL } } });
  db2 = new PrismaService({ datasources: { db: { url: process.env.EDITORIAL_TEST_URL } } });
  await db.$connect(); await db2.$connect();
  service = new OrientacionVocacionalService(db); service2 = new OrientacionVocacionalService(db2);
  const module = await Test.createTestingModule({ imports: [JwtModule.register({ secret: randomUUID() })],
    controllers: [OrientacionVocacionalController], providers: [OrientacionVocacionalService,
      JwtGuard, EmailVerificadoGuard, { provide: PrismaService, useValue: db }] }).compile();
  app = module.createNestApplication({ logger: false });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true } }));
  await app.listen(0, '127.0.0.1'); origin = await app.getUrl(); jwt = module.get(JwtService);
});
after(async () => { await app?.close(); await db2?.$disconnect(); await db?.$disconnect(); });
const user = (rol = 'ESTUDIANTE') => db.usuario.create({ data: { nombre: 'OV test',
  correo: randomUUID() + '@example.invalid', contrasenaHash: 'not-real', rol, correoVerificado: true } });
const answers = (valor = 4) => ids.map(preguntaId => ({ preguntaId, valor }));
const http = (u, method, path, body) => fetch(origin + '/orientacion-vocacional' + path, {
  method, headers: { 'Content-Type': 'application/json', ...(u ? { Authorization: 'Bearer ' + jwt.sign({ sub: u.id, rol: 'ESTUDIANTE' }) } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const status = code => e => e.getStatus?.() === code;

test('real HTTP: B cannot read/edit/finalize/delete A or see A in history', async () => {
  const a = await user(), b = await user();
  const response = await http(a, 'POST', '/intentos', {}); assert.equal(response.status, 201);
  const attempt = await response.json();
  for (const [method, suffix, body] of [ ['GET', '', undefined], ['PATCH', '/respuestas', { respuestas: answers() }],
    ['POST', '/finalizar', {}], ['DELETE', '', undefined] ]) {
    assert.equal((await http(b, method, `/intentos/${attempt.id}${suffix}`, body)).status, 404);
  }
  assert.equal((await http(b, 'GET', `/intentos/${randomUUID()}`)).status, 404);
  assert.equal((await (await http(b, 'GET', '/historial')).json()).total, 0);
  assert.equal((await http(a, 'GET', `/intentos/${attempt.id}`)).status, 200);
  assert.equal(await db.respuestaVocacional.count({ where: { intentoId: attempt.id } }), 0);
});

test('real JWT: teacher/admin never acquire access from student token claim', async () => {
  const a = await user(); const attempt = await service.iniciar(a.id);
  assert.equal((await http(null, 'GET', '')).status, 401);
  for (const role of ['PROFESOR', 'ADMIN']) {
    const other = await user(role);
    for (const path of ['', '/historial', '/cuestionario', `/intentos/${attempt.id}`])
      assert.equal((await http(other, 'GET', path)).status, 403);
    assert.equal((await http(other, 'POST', '/intentos', {})).status, 403);
  }
});

test('simultaneous starts across independent clients resume exactly one persisted attempt', async () => {
  const u = await user();
  const attempts = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? service : service2).iniciar(u.id)));
  assert.equal(new Set(attempts.map(a => a.id)).size, 1);
  assert.equal(await db.intentoVocacional.count({ where: { usuarioId: u.id } }), 1);
  await assert.rejects(db.intentoVocacional.create({ data: { usuarioId: u.id } }), e => e.code === 'P2002');
});

test('NO_SE persists; server snapshot survives retry and new service; completed history is immutable', async () => {
  const u = await user(); const attempt = await service.iniciar(u.id); const r = answers();
  const health = [4, 'NO_SE', 3, 'NO_SE', 3];
  health.forEach((valor, i) => { r.find(a => a.preguntaId === `S${i+1}`).valor = valor; });
  await service.guardar(u.id, attempt.id, r);
  assert.equal((await db.respuestaVocacional.findUnique({ where: { intentoId_preguntaId: { intentoId: attempt.id, preguntaId: 'S2' } } })).valor, 'NO_SE');
  const [first, retry] = await Promise.all([service.finalizar(u.id, attempt.id), service2.finalizar(u.id, attempt.id)]);
  assert.deepEqual(first, retry); assert.equal(first.resultado.ov1RulesVersion, 1);
  assert.equal(first.resultado.familias[1].denominador, 12);
  assert.equal(first.resultado.familias[1].puntaje, 1000 / 12);
  assert.deepEqual(await service2.obtener(u.id, attempt.id), first);
  await assert.rejects(service.guardar(u.id, attempt.id, answers(0)), status(409));
  await assert.rejects(db.respuestaVocacional.updateMany({ where: { intentoId: attempt.id }, data: { valor: '0' } }));
  await assert.rejects(db.respuestaVocacional.deleteMany({ where: { intentoId: attempt.id } }));
  await assert.rejects(db.intentoVocacional.update({ where: { id: attempt.id }, data: { rulesVersion: 2 } }));
  const next = await service.iniciar(u.id); assert.notEqual(next.id, attempt.id);
  assert.equal((await service.historial(u.id)).total, 2);
  await service.eliminar(u.id, attempt.id);
  assert.equal(await db.respuestaVocacional.count({ where: { intentoId: attempt.id } }), 0);
  assert.equal((await service.historial(u.id)).total, 1);
});

test('coverage rejects 23 valid or deficient family without a final snapshot; correction permits 24', async () => {
  const u = await user(); const attempt = await service.iniciar(u.id);
  await service.guardar(u.id, attempt.id, answers().slice(0, 23));
  await assert.rejects(service.finalizar(u.id, attempt.id), status(409));
  const deficient = answers(); deficient.slice(0, 3).forEach(r => r.valor = 'NO_SE');
  await service.guardar(u.id, attempt.id, deficient);
  await assert.rejects(service.finalizar(u.id, attempt.id), status(409));
  assert.equal((await service.obtener(u.id, attempt.id)).resultado, null);
  const valid = answers(); valid.filter(r => r.preguntaId.endsWith('5')).forEach(r => r.valor = 'NO_SE');
  await service.guardar(u.id, attempt.id, valid);
  assert.equal((await service.finalizar(u.id, attempt.id)).resultado.cantidadValidas, 24);
});

test('concurrent save/finalize never modifies responses after the final snapshot', async () => {
  const u = await user(); const attempt = await service.iniciar(u.id);
  await service.guardar(u.id, attempt.id, answers());
  const outcome = await Promise.allSettled([service.guardar(u.id, attempt.id, answers(0)), service2.finalizar(u.id, attempt.id)]);
  assert.equal(outcome[1].status, 'fulfilled');
  if (outcome[0].status === 'rejected') assert.equal(outcome[0].reason.getStatus(), 409);
  const final = await service.obtener(u.id, attempt.id);
  assert.deepEqual(final.respuestas, final.resultado.respuestas);
  assert.equal(new Set(final.respuestas.map(r => r.valor)).size, 1);
});

test('database rejects unknown questions, invalid values and changing attempt identity', async () => {
  const u = await user(); const attempt = await service.iniciar(u.id);
  for (const data of [{ preguntaId: 'T6', valor: '4' }, { preguntaId: 'T1', valor: '5' }, { preguntaId: 'T1', valor: '1.5' }])
    await assert.rejects(db.respuestaVocacional.create({ data: { intentoId: attempt.id, ...data } }));
  await assert.rejects(db.intentoVocacional.update({ where: { id: attempt.id }, data: { usuarioId: (await user()).id } }));
  assert.equal(await db.respuestaVocacional.count({ where: { intentoId: attempt.id } }), 0);
});

test('HTTP excludes client scores/version/owner and invalid coercions', async () => {
  const u = await user(); const attempt = await service.iniciar(u.id);
  for (const valor of ['4', null, 1.5, 5]) assert.equal((await http(u, 'PATCH', `/intentos/${attempt.id}/respuestas`,
    { respuestas: [{ preguntaId: 'T1', valor }] })).status, 400);
  assert.equal((await http(u, 'POST', `/intentos/${attempt.id}/finalizar`, { resultado: 100 })).status, 400);
  assert.equal((await http(u, 'POST', '/intentos', { usuarioId: randomUUID(), rulesVersion: 2 })).status, 400);
});

test('RLS enabled; public roles cannot access either private table', async () => {
  const rows = await db.$queryRawUnsafe(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('IntentoVocacional','RespuestaVocacional')`);
  assert.equal(rows.length, 2); assert.ok(rows.every(r => r.relrowsecurity));
  for (const role of ['anon', 'authenticated']) for (const table of ['IntentoVocacional', 'RespuestaVocacional']) {
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE ' + role);
      await tx.$queryRawUnsafe('SELECT * FROM "' + table + '"');
    }));
  }
});
