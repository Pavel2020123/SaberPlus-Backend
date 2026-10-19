// Automatic R4 evidence, never human submissions. Run only through the owned runner.
require('reflect-metadata');
require('ts-node/register/transpile-only');
const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { readFile, realpath } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, basename } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { createServer } = require('node:http');
const { PrismaClient, Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const {
  QuestionReportModule,
} = require('../src/question-reports/question-report.module');
const {
  QuestionReportService,
} = require('../src/question-reports/question-report.service');
const { PrismaModule } = require('../src/prisma/prisma.module');
const {
  BankCoverageController,
} = require('../src/admin/bank-coverage.controller');
const { BankCoverageService } = require('../src/admin/bank-coverage.service');
let db, base, jwt;
let storageDiagnostics;
const apps = [];
const reports = '/preguntas/reportes';
const inbox = '/admin/reportes-preguntas';

async function server(options = {}) {
  let builder = Test.createTestingModule({
    imports: [
      PrismaModule,
      JwtModule.register({
        global: true,
        secret: process.env.JWT_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
      QuestionReportModule,
    ],
    controllers: [BankCoverageController],
    providers: [BankCoverageService],
  });
  if (options.service)
    builder = builder
      .overrideProvider(QuestionReportService)
      .useValue(options.service);
  if (options.storageDiagnostics) {
    const actual = options.service || new QuestionReportService(db);
    const monitored = new Proxy(actual, {
      get(target, key) {
        const value = target[key];
        if (typeof value !== 'function') return value;
        return async (...args) => {
          try {
            return await value.apply(target, args);
          } catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError) {
              options.storageDiagnostics.push({
                prisma: error.code,
                sqlState: error.meta?.code,
              });
            }
            throw error;
          }
        };
      },
    });
    builder = builder
      .overrideProvider(QuestionReportService)
      .useValue(monitored);
  }
  const module = await builder.compile();
  const instance = module.createNestApplication({ logger: false });
  instance.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  if (options.dropResponse) {
    let dropped = false;
    instance.use((req, res, next) => {
      if (!dropped && req.method === 'POST' && req.url === reports) {
        const end = res.end;
        res.end = function (...args) {
          if (res.statusCode === 201) {
            dropped = true;
            res.socket?.destroy();
            return res;
          }
          return end.apply(this, args);
        };
      }
      next();
    });
  }
  await instance.listen(0, '127.0.0.1');
  apps.push(instance);
  return {
    instance,
    base: await instance.getUrl(),
    jwt: module.get(JwtService),
  };
}
async function request(
  path,
  token,
  body,
  method = body === undefined ? 'GET' : 'POST',
  url = base,
  headers = {},
) {
  const response = await fetch(url + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  return {
    status: response.status,
    headers: response.headers,
    data: await response.json(),
  };
}
const tokenFor = (user, claims = {}) =>
  jwt.sign({ sub: user.id, rol: user.rol, ...claims }, { expiresIn: '5m' });
async function user(data = {}) {
  return db.usuario.create({
    data: {
      nombre: 'R4 automatic test',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'fixture-no-password-login',
      rol: 'ESTUDIANTE',
      correoVerificado: true,
      ...data,
    },
  });
}
async function fixture({
  count = 1,
  origin = 'PRACTICA',
  answered = true,
  studentData = {},
  area = 'MATEMATICAS',
} = {}) {
  const student = await user(studentData);
  const admin = await user({ rol: 'ADMIN' });
  const theme = await db.tema.create({
    data: {
      nombre: `R4 auto ${randomUUID()}`,
      area,
      estadoContenido: 'PUBLICADO',
    },
  });
  const sub = await db.subtema.create({
    data: {
      temaId: theme.id,
      nombre: 'R4 automatic subtheme',
      estadoContenido: 'PUBLICADO',
    },
  });
  const questions = [];
  for (let i = 0; i < count; i++) {
    const q = await db.pregunta.create({
      data: {
        subtemaId: sub.id,
        enunciado: `R4 automatic question ${i}`,
        explicacion: 'PRIVATE_SERVER_EXPLANATION',
        estadoContenido: 'PUBLICADO',
        dificultad: 'BASICO',
        respuestas: {
          create: [
            { texto: 'PRIVATE_CORRECT_OPTION', esCorrecta: true },
            { texto: 'Other', esCorrecta: false },
          ],
        },
      },
      include: { respuestas: { orderBy: { id: 'asc' } } },
    });
    questions.push(q);
    if (answered) await evidence(student, q, origin);
  }
  return {
    student,
    admin,
    theme,
    sub,
    questions,
    studentToken: tokenFor(student),
    adminToken: tokenFor(admin),
  };
}
async function evidence(student, q, origin = 'PRACTICA') {
  const answer = q.respuestas.find((row) => row.esCorrecta);
  return db.historialRespuesta.create({
    data: {
      usuarioId: student.id,
      preguntaId: q.id,
      sesionId: randomUUID(),
      respuestaSeleccionadaId: answer.id,
      respuestaCorrectaId: answer.id,
      area: 'MATEMATICAS',
      origen: origin,
      esCorrecta: true,
    },
  });
}
const bodyFor = (f, extra = {}) => ({
  operacionId: randomUUID(),
  preguntaId: f.questions[0].id,
  motivo: 'ENUNCIADO_CONFUSO',
  detalle: 'Automatic R4 report detail',
  ...extra,
});
async function create(f, body = bodyFor(f)) {
  const response = await request(reports, f.studentToken, body);
  assert.equal(response.status, 201);
  return { body, report: response.data };
}
async function review(f, id, revision, destino, extra = {}) {
  const body = {
    operacionId: randomUUID(),
    revision,
    destino,
    motivoRevision: 'R4 automatic ADMIN reason',
    ...extra,
  };
  return {
    body,
    response: await request(
      `${inbox}/${id}/estado`,
      f.adminToken,
      body,
      'PATCH',
    ),
  };
}
async function state(id) {
  return db.reportePregunta.findUniqueOrThrow({
    where: { id },
    include: {
      operaciones: true,
      auditorias: { orderBy: { revision: 'asc' } },
    },
  });
}

before(async () => {
  const markerPath = await realpath(
    process.env.QUESTION_REPORT_TEST_OWNER || 'missing-owned-runner',
  );
  const directory = dirname(markerPath);
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-reports-r4-'));
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(process.env.DATABASE_URL, marker);
  assert.equal(process.env.DIRECT_URL, marker.url);
  db = new PrismaClient({ datasources: { db: { url: marker.url } } });
  await db.$connect();
});
beforeEach(async () => {
  storageDiagnostics = [];
  const context = await server({ storageDiagnostics });
  base = context.base;
  jwt = context.jwt;
});
afterEach(async () => {
  while (apps.length) await apps.pop().close();
});
after(async () => db?.$disconnect());

test('R4 HTTP authenticates JWT and rechecks DB roles instead of trusting claims', async () => {
  const f = await fixture();
  assert.equal((await request(reports + '/mios')).status, 401);
  assert.equal((await request(inbox, 'not-a-token')).status, 401);
  assert.equal(
    (await request(inbox, tokenFor(f.student, { rol: 'ADMIN' }))).status,
    403,
  );
  const teacher = await user({ rol: 'PROFESOR' });
  assert.equal(
    (
      await request(
        reports,
        tokenFor(teacher, { rol: 'ESTUDIANTE' }),
        bodyFor(f),
      )
    ).status,
    403,
  );
  assert.equal((await request(reports, f.adminToken, bodyFor(f))).status, 403);
  assert.equal((await request(inbox, f.adminToken)).status, 200);
});
test('R4 unverified institutional exception never bypasses report-specific email rule', async () => {
  const institution = await db.institucion.create({
    data: { nombre: 'R4 automatic institution', codigoUnico: randomUUID() },
  });
  const f = await fixture({
    studentData: { correoVerificado: false, institucionId: institution.id },
  });
  for (const [path, body] of [
    [reports, bodyFor(f)],
    [reports + '/mios', undefined],
    [reports + '/operaciones/' + randomUUID(), undefined],
  ]) {
    const result = await request(path, f.studentToken, body);
    assert.equal(result.status, 403);
    assert.equal(result.data.code, 'REPORT_EMAIL_REQUIRED');
  }
  assert.equal(
    await db.reportePregunta.count({ where: { autorId: f.student.id } }),
    0,
  );
});
test('R4 deleted identity, changed role and initial-password gate fail closed with valid old JWT', async () => {
  const f = await fixture();
  await db.usuario.update({
    where: { id: f.student.id },
    data: { debeCambiarContrasena: true },
  });
  assert.equal((await request(reports + '/mios', f.studentToken)).status, 403);
  await db.usuario.update({
    where: { id: f.student.id },
    data: { debeCambiarContrasena: false, rol: 'PROFESOR' },
  });
  assert.equal((await request(reports + '/mios', f.studentToken)).status, 403);
  const other = await user();
  const token = tokenFor(other);
  await db.usuario.delete({ where: { id: other.id } });
  assert.equal((await request(reports + '/mios', token)).status, 401);
});
test('R4 own answered evidence required: absent or another account evidence is 404', async () => {
  const f = await fixture({ answered: false });
  assert.equal(
    (await request(reports, f.studentToken, bodyFor(f))).status,
    404,
  );
  const another = await user();
  await evidence(another, f.questions[0]);
  assert.equal(
    (await request(reports, f.studentToken, bodyFor(f))).status,
    404,
  );
  assert.equal(
    await db.reportePregunta.count({ where: { autorId: f.student.id } }),
    0,
  );
});
for (const origin of [
  'PRACTICA',
  'PERSONALIZADO',
  'SIMULACRO',
  'DIAGNOSTICO',
  'BATALLA',
  'ADAPTATIVO',
  'TRIVIA_RUSH',
]) {
  test(`R4 PostgreSQL answer origin ${origin} is ${['PRACTICA', 'PERSONALIZADO', 'SIMULACRO'].includes(origin) ? 'eligible' : 'rejected'}`, async () => {
    const f = await fixture({ origin });
    assert.equal(
      (await request(reports, f.studentToken, bodyFor(f))).status,
      ['PRACTICA', 'PERSONALIZADO', 'SIMULACRO'].includes(origin) ? 201 : 404,
    );
  });
}
for (const [name, patch] of [
  ['forged author', { autorId: randomUUID() }],
  ['forged snapshot', { snapshot: { solution: true } }],
  ['non-string detail', { detalle: 42 }],
  ['null detail', { detalle: null }],
  ['unknown reason', { motivo: 'FAKE' }],
  ['invalid UUID', { operacionId: 'not-uuid' }],
  ['501 Unicode points', { detalle: '😀'.repeat(501) }],
  ['control', { detalle: 'bad\u0000data' }],
  ['lone surrogate', { detalle: 'bad\ud800data' }],
  ['short OTRO', { motivo: 'OTRO', detalle: 'corto' }],
]) {
  test(`R4 strict real HTTP DTO rejects ${name} without creating report`, async () => {
    const f = await fixture();
    assert.equal(
      (await request(reports, f.studentToken, bodyFor(f, patch))).status,
      400,
    );
    assert.equal(
      await db.reportePregunta.count({ where: { autorId: f.student.id } }),
      0,
    );
  });
}
test('R4 HTTP 500 Unicode points round-trip, own output private and cache disabled', async () => {
  const f = await fixture();
  const detail = '😀'.repeat(500);
  const sent = await request(
    reports,
    f.studentToken,
    bodyFor(f, { motivo: 'OTRO', detalle: detail }),
  );
  assert.equal(sent.status, 201);
  assert.equal(sent.data.detalle, detail);
  assert.equal(sent.headers.get('cache-control'), 'private, no-store');
  const own = await request(reports + '/mios', f.studentToken);
  assert.equal(own.status, 200);
  assert.equal(own.headers.get('cache-control'), 'private, no-store');
  assert.equal(own.data.items.length, 1);
  assert.deepEqual(
    Object.keys(own.data.items[0]).sort(),
    [
      'id',
      'preguntaId',
      'motivo',
      'detalle',
      'estado',
      'revision',
      'fechaCreacion',
      'fechaActualizacion',
    ].sort(),
  );
  assert.doesNotMatch(
    JSON.stringify(own.data),
    /PRIVATE_SERVER|PRIVATE_CORRECT|actorId|snapshot|auditoria|huellaSolicitud|contrasena/,
  );
});
test('R4 snapshot is server reception, includes archived original, and is immutable after editing original', async () => {
  const f = await fixture();
  const q = f.questions[0];
  await db.pregunta.update({
    where: { id: q.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  const { report } = await create(f);
  const admin = await request(`${inbox}/${report.id}`, f.adminToken);
  assert.equal(admin.status, 200);
  assert.equal(admin.data.snapshot.tipo, 'CAPTURA_SERVIDOR_RECEPCION');
  assert.equal(admin.data.snapshot.historicoExacto, false);
  assert.equal(admin.data.snapshot.pregunta.id, q.id);
  assert.equal(admin.data.snapshot.pregunta.estadoContenido, 'ARCHIVADO');
  assert.equal(
    admin.data.snapshot.pregunta.explicacion,
    'PRIVATE_SERVER_EXPLANATION',
  );
  assert.ok(
    admin.data.snapshot.pregunta.respuestas.some((row) => row.esCorrecta),
  );
  await db.pregunta.update({
    where: { id: q.id },
    data: { enunciado: 'Original edited AFTER report' },
  });
  assert.deepEqual(
    (await request(`${inbox}/${report.id}`, f.adminToken)).data.snapshot,
    admin.data.snapshot,
  );
  await assert.rejects(
    db.pregunta.delete({ where: { id: q.id } }),
    (error) => error.code === 'P2003',
  );
});
test('R4 oversized legacy snapshot is explicitly omitted, no media is fetched', async () => {
  const f = await fixture();
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: {
      enunciado: 'x'.repeat(530000),
      imagenUrl: 'https://example.invalid/private-never-fetch',
    },
  });
  const { report } = await create(f);
  const detail = (await request(`${inbox}/${report.id}`, f.adminToken)).data;
  assert.equal(detail.snapshot.contenidoOmitido, true);
  assert.equal(detail.snapshot.motivoOmision, 'LIMITE_LEGADO');
  assert.equal(detail.snapshot.preguntaId, f.questions[0].id);
  assert.equal(detail.snapshot.pregunta, undefined);
});
test('R4 snapshot captures image references without requesting their HTTP endpoint', async () => {
  const f = await fixture();
  let mediaRequests = 0;
  const media = createServer((_req, res) => {
    mediaRequests++;
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end();
  });
  await new Promise((resolve) => media.listen(0, '127.0.0.1', resolve));
  try {
    const image = `http://127.0.0.1:${media.address().port}/never-download.png`;
    await db.pregunta.update({
      where: { id: f.questions[0].id },
      data: { imagenUrl: image },
    });
    const { report } = await create(f);
    const detail = await request(`${inbox}/${report.id}`, f.adminToken);
    assert.equal(detail.data.snapshot.pregunta.imagenUrl, image);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(mediaRequests, 0);
  } finally {
    await new Promise((resolve, reject) =>
      media.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test('R4 draft question and new editorial ID cannot reuse old evidence', async () => {
  const f = await fixture({ count: 2, answered: false });
  await evidence(f.student, f.questions[0]);
  await db.pregunta.update({
    where: { id: f.questions[0].id },
    data: { estadoContenido: 'BORRADOR' },
  });
  assert.equal(
    (await request(reports, f.studentToken, bodyFor(f))).status,
    404,
  );
  assert.equal(
    (
      await request(
        reports,
        f.studentToken,
        bodyFor(f, { preguntaId: f.questions[1].id }),
      )
    ).status,
    404,
  );
});
test('R4 original receipt survives later ADMIN decisions, current list differs, other account cannot read receipt', async () => {
  const f = await fixture();
  const { report, body } = await create(f);
  assert.equal(
    (await review(f, report.id, 0, 'EN_REVISION')).response.status,
    200,
  );
  const receipt = await request(
    `${reports}/operaciones/${body.operacionId}`,
    f.studentToken,
  );
  assert.deepEqual(receipt.data, report);
  assert.equal(receipt.headers.get('cache-control'), 'private, no-store');
  const own = await request(reports + '/mios', f.studentToken);
  assert.equal(own.data.items[0].estado, 'EN_REVISION');
  assert.equal(own.data.items[0].revision, 1);
  const other = await user();
  assert.equal(
    (
      await request(
        `${reports}/operaciones/${body.operacionId}`,
        tokenFor(other),
      )
    ).status,
    404,
  );
  assert.deepEqual(
    (await request(reports + '/mios', tokenFor(other))).data.items,
    [],
  );
  assert.equal(
    (await request(`${inbox}/${report.id}`, f.studentToken)).status,
    403,
  );
});
test('R4 same operation replay is exact; changed payload 409; same operation owned by another actor 404', async () => {
  const f = await fixture();
  const { report, body } = await create(f);
  assert.deepEqual((await request(reports, f.studentToken, body)).data, report);
  assert.equal(
    (await request(reports, f.studentToken, { ...body, detalle: 'Changed' }))
      .status,
    409,
  );
  const other = await user();
  await evidence(other, f.questions[0]);
  assert.equal((await request(reports, tokenFor(other), body)).status, 404);
  const stored = await state(report.id);
  assert.equal(stored.operaciones.length, 1);
  assert.equal(stored.auditorias.length, 1);
});
test('R4 simultaneous same UUID converges to one report, one audit and one receipt', async () => {
  const f = await fixture();
  const body = bodyFor(f);
  const results = await Promise.all([
    request(reports, f.studentToken, body),
    request(reports, f.studentToken, body),
  ]);
  assert.deepEqual(
    results.map((row) => row.status),
    [201, 201],
  );
  assert.deepEqual(results[0].data, results[1].data);
  const stored = await state(results[0].data.id);
  assert.equal(stored.operaciones.length, 1);
  assert.equal(stored.auditorias.length, 1);
});
test('R4 simultaneous semantic duplicate gives two receipts but one report and audit', async () => {
  const f = await fixture();
  const results = await Promise.all([
    request(reports, f.studentToken, bodyFor(f)),
    request(
      reports,
      f.studentToken,
      bodyFor(f, { detalle: 'Another payload' }),
    ),
  ]);
  assert.deepEqual(
    results.map((row) => row.status),
    [201, 201],
  );
  assert.equal(results[0].data.id, results[1].data.id);
  assert.deepEqual(results.map((row) => row.data.duplicado).sort(), [
    false,
    true,
  ]);
  const stored = await state(results[0].data.id);
  assert.equal(stored.operaciones.length, 2);
  assert.equal(stored.auditorias.length, 1);
  assert.equal(
    stored.detalle,
    results.find((row) => !row.data.duplicado).data.detalle,
  );
});
test('R4 same global operation UUID racing across accounts commits for just one actor', async () => {
  const f = await fixture();
  const other = await user();
  await evidence(other, f.questions[0]);
  const body = bodyFor(f);
  const results = await Promise.all([
    request(reports, f.studentToken, body),
    request(reports, tokenFor(other), body),
  ]);
  assert.deepEqual(results.map((row) => row.status).sort(), [201, 404]);
  assert.equal(
    await db.operacionReportePregunta.count({
      where: { id: body.operacionId },
    }),
    1,
  );
  assert.equal(
    await db.reportePregunta.count({ where: { preguntaId: body.preguntaId } }),
    1,
  );
});
// Scheduling barrier only: both real SERIALIZABLE transactions establish a
// snapshot before either locks the report, making the observed race repeatable.
function adminRaceService(rawConflicts) {
  let arrivals = 0,
    release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const wrapped = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (callback, options) =>
          target.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(inner, prop) {
                    if (prop === '$queryRaw')
                      return async (...args) => {
                        const text = Array.isArray(args[0])
                          ? args[0].join('?')
                          : '';
                        if (
                          text.includes('FROM "ReportePregunta"') &&
                          arrivals < 2
                        ) {
                          arrivals++;
                          if (arrivals === 2) release();
                          await new Promise((resolve, reject) => {
                            const timer = setTimeout(
                              () =>
                                reject(
                                  new Error('R4 scheduling barrier timeout'),
                                ),
                              2000,
                            );
                            gate.then(() => {
                              clearTimeout(timer);
                              resolve();
                            });
                          });
                        }
                        try {
                          return await inner.$queryRaw(...args);
                        } catch (error) {
                          if (
                            error.code === 'P2010' &&
                            error.meta?.code === '40001'
                          )
                            rawConflicts.push('40001');
                          throw error;
                        }
                      };
                    const value = inner[prop];
                    return typeof value === 'function'
                      ? value.bind(inner)
                      : value;
                  },
                }),
              ),
            options,
          );
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new QuestionReportService(wrapped);
}
test('R4 two ADMINs on same revision: one decision wins, stale one never overwrites; replay exact', async () => {
  const f = await fixture();
  const { report } = await create(f);
  const rawConflicts = [];
  const racing = await server({
    service: adminRaceService(rawConflicts),
    storageDiagnostics,
  });
  const another = await user({ rol: 'ADMIN' });
  const bodies = [0, 1].map((i) => ({
    operacionId: randomUUID(),
    revision: 0,
    destino: 'EN_REVISION',
    motivoRevision: `ADMIN race ${i}`,
  }));
  const tokens = [f.adminToken, tokenFor(another)];
  const results = await Promise.all(
    bodies.map((body, i) =>
      request(
        `${inbox}/${report.id}/estado`,
        tokens[i],
        body,
        'PATCH',
        racing.base,
      ),
    ),
  );
  assert.deepEqual(
    results.map((row) => row.status).sort(),
    [200, 409],
    JSON.stringify(storageDiagnostics),
  );
  assert.deepEqual(rawConflicts, ['40001']);
  const winner = results.findIndex((row) => row.status === 200);
  const stored = await state(report.id);
  assert.equal(stored.revision, 1);
  assert.equal(stored.auditorias.length, 2);
  assert.equal(
    stored.operaciones.filter((row) => row.tipo === 'DECIDIR').length,
    1,
  );
  assert.deepEqual(
    (
      await request(
        `${inbox}/${report.id}/estado`,
        tokens[winner],
        bodies[winner],
        'PATCH',
      )
    ).data,
    results[winner].data,
  );
  assert.equal(
    (
      await request(
        `${inbox}/${report.id}/estado`,
        tokens[winner],
        { ...bodies[winner], motivoRevision: 'Changed' },
        'PATCH',
      )
    ).status,
    409,
  );
});
test('R4 closed semantic duplicates never reopen; explicit ADMIN reopening requires current revision', async () => {
  const f = await fixture();
  const { report, body } = await create(f);
  assert.equal(
    (await review(f, report.id, 0, 'RESUELTO')).response.status,
    409,
  );
  assert.equal(
    (await review(f, report.id, 0, 'EN_REVISION')).response.status,
    200,
  );
  assert.equal(
    (await review(f, report.id, 1, 'RESUELTO')).response.status,
    200,
  );
  const duplicate = await request(reports, f.studentToken, {
    ...body,
    operacionId: randomUUID(),
    detalle: 'Do not reopen',
  });
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.data.duplicado, true);
  assert.equal(duplicate.data.estado, 'RESUELTO');
  assert.equal((await state(report.id)).revision, 2);
  assert.equal(
    (await review(f, report.id, 1, 'EN_REVISION')).response.status,
    409,
  );
  assert.equal(
    (await review(f, report.id, 2, 'EN_REVISION')).response.status,
    200,
  );
  assert.equal((await state(report.id)).revision, 3);
});

function faultService(model) {
  const wrapped = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (callback, options) =>
          target.$transaction(
            (tx) =>
              callback(
                new Proxy(tx, {
                  get(inner, prop) {
                    if (prop === model)
                      return new Proxy(inner[prop], {
                        get(delegate, method) {
                          if (method === 'create')
                            return async () => {
                              await tx.$executeRawUnsafe('SELECT 1 / 0');
                            };
                          const value = delegate[method];
                          return typeof value === 'function'
                            ? value.bind(delegate)
                            : value;
                        },
                      });
                    const value = inner[prop];
                    return typeof value === 'function'
                      ? value.bind(inner)
                      : value;
                  },
                }),
              ),
            options,
          );
      const value = target[key];
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return new QuestionReportService(wrapped);
}
for (const model of ['auditoriaReportePregunta', 'operacionReportePregunta']) {
  test(`R4 actual PostgreSQL failure in ${model} rolls back create and returns safe 503`, async () => {
    const f = await fixture();
    const body = bodyFor(f);
    const broken = await server({ service: faultService(model) });
    const result = await request(
      reports,
      f.studentToken,
      body,
      'POST',
      broken.base,
    );
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'REPORT_STORAGE_UNAVAILABLE');
    assert.equal(result.headers.get('cache-control'), 'private, no-store');
    assert.doesNotMatch(
      JSON.stringify(result.data),
      /Prisma|SELECT|division|postgresql|Automatic R4 report detail/,
    );
    assert.equal(
      await db.reportePregunta.count({ where: { autorId: f.student.id } }),
      0,
    );
    assert.equal(
      await db.operacionReportePregunta.count({
        where: { id: body.operacionId },
      }),
      0,
    );
    assert.equal(
      (
        await db.tasaReportePregunta.findUniqueOrThrow({
          where: { usuarioId: f.student.id },
        })
      ).solicitudes,
      1,
    );
    const recovered = await request(reports, f.studentToken, body);
    assert.equal(recovered.status, 201);
    assert.equal(recovered.data.duplicado, false);
  });
}
test('R4 failing decision receipt rolls back revision, audit and status in real PostgreSQL', async () => {
  const f = await fixture();
  const { report } = await create(f);
  const broken = await server({
    service: faultService('operacionReportePregunta'),
  });
  const body = {
    operacionId: randomUUID(),
    revision: 0,
    destino: 'EN_REVISION',
    motivoRevision: 'Decision with rollback',
  };
  assert.equal(
    (
      await request(
        `${inbox}/${report.id}/estado`,
        f.adminToken,
        body,
        'PATCH',
        broken.base,
      )
    ).status,
    503,
  );
  const stored = await state(report.id);
  assert.equal(stored.estado, 'PENDIENTE');
  assert.equal(stored.revision, 0);
  assert.equal(stored.auditorias.length, 1);
  assert.equal(stored.operaciones.length, 1);
  assert.equal(
    (await request(`${inbox}/${report.id}/estado`, f.adminToken, body, 'PATCH'))
      .status,
    200,
  );
});
test('R4 response socket lost AFTER commit: receipt reconciles and replay writes nothing twice', async () => {
  const f = await fixture();
  const body = bodyFor(f);
  const dropping = await server({ dropResponse: true });
  await assert.rejects(
    request(reports, f.studentToken, body, 'POST', dropping.base),
  );
  const storedReceipt = await db.operacionReportePregunta.findUniqueOrThrow({
    where: { id: body.operacionId },
  });
  const receipt = await request(
    `${reports}/operaciones/${body.operacionId}`,
    f.studentToken,
    undefined,
    'GET',
    dropping.base,
  );
  assert.equal(receipt.status, 200);
  assert.deepEqual(receipt.data, storedReceipt.resultado);
  const replay = await request(
    reports,
    f.studentToken,
    body,
    'POST',
    dropping.base,
  );
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.data, receipt.data);
  const stored = await state(receipt.data.id);
  assert.equal(stored.operaciones.length, 1);
  assert.equal(stored.auditorias.length, 1);
});
test('R4 durable rate across two HTTP instances allows only 20 and never limits receipt reads', async () => {
  const f = await fixture({ count: 2 });
  await db.tasaReportePregunta.create({
    data: { usuarioId: f.student.id, inicio: new Date(), solicitudes: 19 },
  });
  const second = await server();
  const bodies = f.questions.map((q) => bodyFor(f, { preguntaId: q.id }));
  const results = await Promise.all([
    request(reports, f.studentToken, bodies[0]),
    request(reports, f.studentToken, bodies[1], 'POST', second.base),
  ]);
  assert.deepEqual(results.map((row) => row.status).sort(), [201, 429]);
  assert.equal(
    results.find((row) => row.status === 429).data.code,
    'REPORT_RATE_LIMIT',
  );
  assert.equal(
    (
      await db.tasaReportePregunta.findUniqueOrThrow({
        where: { usuarioId: f.student.id },
      })
    ).solicitudes,
    20,
  );
  const winner = results.findIndex((row) => row.status === 201);
  assert.equal(
    (
      await request(
        `${reports}/operaciones/${bodies[winner].operacionId}`,
        f.studentToken,
      )
    ).status,
    200,
  );
  assert.equal((await request(reports + '/mios', f.studentToken)).status, 200);
  assert.equal(
    (await request(reports, f.studentToken, bodies[winner])).status,
    429,
  );
});
test('R4 business rejection still consumes durable rate and expired minute resets without waiting', async () => {
  const f = await fixture();
  await db.tasaReportePregunta.create({
    data: { usuarioId: f.student.id, inicio: new Date(), solicitudes: 19 },
  });
  assert.equal(
    (
      await request(
        reports,
        f.studentToken,
        bodyFor(f, { preguntaId: 'missing-question' }),
      )
    ).status,
    404,
  );
  assert.equal(
    (await request(reports, f.studentToken, bodyFor(f))).status,
    429,
  );
  await db.tasaReportePregunta.update({
    where: { usuarioId: f.student.id },
    data: { inicio: new Date(Date.now() - 61000) },
  });
  assert.equal(
    (await request(reports, f.studentToken, bodyFor(f))).status,
    201,
  );
  assert.equal(
    (
      await db.tasaReportePregunta.findUniqueOrThrow({
        where: { usuarioId: f.student.id },
      })
    ).solicitudes,
    1,
  );
});
test('R4 daily quota race caps at 20 new reports; replay and semantic duplicate do not consume quota', async () => {
  const f = await fixture({ count: 21 });
  // Nineteen explicitly SYNTHETIC quota fixtures, not played/submitted by a human.
  await db.reportePregunta.createMany({
    data: f.questions.slice(0, 19).map((q) => ({
      id: randomUUID(),
      autorId: f.student.id,
      preguntaId: q.id,
      motivo: 'ENUNCIADO_CONFUSO',
      areaCapturada: 'MATEMATICAS',
      subtemaIdCapturado: f.sub.id,
      snapshot: { syntheticQuotaFixture: true },
    })),
  });
  const bodies = f.questions
    .slice(19)
    .map((q) => bodyFor(f, { preguntaId: q.id }));
  const results = await Promise.all(
    bodies.map((body) => request(reports, f.studentToken, body)),
  );
  assert.deepEqual(results.map((row) => row.status).sort(), [201, 429]);
  assert.equal(
    results.find((row) => row.status === 429).data.code,
    'REPORT_DAILY_LIMIT',
  );
  assert.equal(
    await db.reportePregunta.count({ where: { autorId: f.student.id } }),
    20,
  );
  const winner = results.findIndex((row) => row.status === 201);
  const replay = await request(reports, f.studentToken, bodies[winner]);
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.data, results[winner].data);
  const duplicate = await request(reports, f.studentToken, {
    ...bodies[winner],
    operacionId: randomUUID(),
    detalle: 'Duplicate at daily quota',
  });
  assert.equal(duplicate.status, 201);
  assert.equal(duplicate.data.duplicado, true);
  assert.equal(
    await db.reportePregunta.count({ where: { autorId: f.student.id } }),
    20,
  );
  await db.reportePregunta.updateMany({
    where: { autorId: f.student.id, preguntaId: f.questions[0].id },
    data: { fechaCreacion: new Date(Date.now() - 25 * 60 * 60 * 1000) },
  });
  const loser = 1 - winner;
  assert.equal(
    (await request(reports, f.studentToken, bodies[loser])).status,
    201,
  );
});
test('R4 IP limiter cannot be spoofed by X-Forwarded-For and does not throttle GET reconciliation', async (t) => {
  const f = await fixture();
  // Assert the diagnostic caused by this deliberate forged header. Never
  // change production trust-proxy settings just to silence an adversarial input.
  const diagnostics = [];
  const originalError = console.error;
  t.mock.method(console, 'error', (...args) => {
    if (args[0]?.code === 'ERR_ERL_UNEXPECTED_X_FORWARDED_FOR')
      diagnostics.push(args[0].code);
    else originalError(...args);
  });
  for (let i = 0; i < 100; i++) {
    assert.equal(
      (
        await request(reports, undefined, bodyFor(f), 'POST', base, {
          'X-Forwarded-For': `192.0.2.${i}`,
        })
      ).status,
      401,
    );
  }
  const limited = await request(reports, f.studentToken, bodyFor(f));
  assert.equal(limited.status, 429);
  assert.equal(limited.data.code, 'REPORT_IP_RATE_LIMIT');
  assert.equal((await request(reports + '/mios', f.studentToken)).status, 200);
  assert.deepEqual(diagnostics, ['ERR_ERL_UNEXPECTED_X_FORWARDED_FOR']);
});
test('R4 effective ACL and RLS protect reports, receipts, audit and rate for anon/authenticated', async () => {
  const f = await fixture();
  await create(f);
  for (const table of [
    'ReportePregunta',
    'OperacionReportePregunta',
    'AuditoriaReportePregunta',
    'TasaReportePregunta',
  ]) {
    const [security] = await db.$queryRawUnsafe(`SELECT relrowsecurity AS rls,
      has_table_privilege('anon', '"${table}"', 'SELECT,INSERT,UPDATE,DELETE') AS anon,
      has_table_privilege('authenticated', '"${table}"', 'SELECT,INSERT,UPDATE,DELETE') AS authenticated
      FROM pg_class WHERE oid = '"${table}"'::regclass`);
    assert.deepEqual(security, {
      rls: true,
      anon: false,
      authenticated: false,
    });
    for (const role of ['anon', 'authenticated']) {
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`);
        }),
        (error) =>
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.meta?.code === '42501',
      );
      const rollback = new Error('rollback temporary SELECT grant');
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`GRANT SELECT ON "${table}" TO ${role}`);
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          const [count] = await tx.$queryRawUnsafe(
            `SELECT count(*)::int AS n FROM "${table}"`,
          );
          assert.equal(count.n, 0);
          await tx.$executeRawUnsafe('RESET ROLE');
          throw rollback;
        }),
        (error) => error === rollback,
      );
    }
  }
});
test('R4 ADMIN filter, page and private snapshot boundaries are real HTTP contracts', async () => {
  const f = await fixture();
  const { report } = await create(f);
  const query = `${inbox}?area=MATEMATICAS&subtemaId=${f.sub.id}&estado=PENDIENTE&motivo=ENUNCIADO_CONFUSO&pagina=1&limite=1`;
  const page = await request(query, f.adminToken);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'private, no-store');
  assert.equal(page.data.items.length, 1);
  assert.equal(page.data.items[0].id, report.id);
  assert.equal(page.data.hayMas, false);
  assert.doesNotMatch(
    JSON.stringify(page.data),
    /snapshot|auditoria|PRIVATE_SERVER|contrasenaHash/,
  );
  assert.equal(
    (await request(`${inbox}?area=INGLES&subtemaId=${f.sub.id}`, f.adminToken))
      .status,
    404,
  );
  for (const suffix of [
    '?pagina=0',
    '?limite=51',
    '?pagina=10001',
    '?unexpected=1',
  ]) {
    assert.equal(
      (await request(reports + '/mios' + suffix, f.studentToken)).status,
      400,
    );
  }
  assert.deepEqual(
    (await request(reports + '/mios?pagina=2&limite=1', f.studentToken)).data
      .items,
    [],
  );
});
test('R4 own pagination is stable across equal timestamps and excludes other accounts', async () => {
  const f = await fixture({ count: 3 });
  const ids = [];
  for (const q of f.questions)
    ids.push((await create(f, bodyFor(f, { preguntaId: q.id }))).report.id);
  await db.reportePregunta.updateMany({
    where: { autorId: f.student.id },
    data: { fechaCreacion: new Date('2026-10-01T12:00:00Z') },
  });
  const other = await user();
  await evidence(other, f.questions[0]);
  assert.equal(
    (await request(reports, tokenFor(other), bodyFor(f))).status,
    201,
  );
  const page1 = await request(
    `${reports}/mios?pagina=1&limite=2`,
    f.studentToken,
  );
  const page2 = await request(
    `${reports}/mios?pagina=2&limite=2`,
    f.studentToken,
  );
  assert.equal(page1.status, 200);
  assert.equal(page2.status, 200);
  assert.equal(page1.data.hayMas, true);
  assert.equal(page2.data.hayMas, false);
  assert.deepEqual(
    [...page1.data.items, ...page2.data.items].map((row) => row.id),
    ids.sort(),
  );
  assert.deepEqual(
    (await request(`${reports}/mios?pagina=1&limite=2`, f.studentToken)).data,
    page1.data,
  );
});
test('R4 coverage counts archived report IDs and closed reports separately without bank/XP mutation', async () => {
  const f = await fixture({ count: 2 });
  const first = await create(f);
  await create(f, bodyFor(f, { motivo: 'IMAGEN_NO_CARGA' }));
  const second = await create(f, bodyFor(f, { preguntaId: f.questions[1].id }));
  await db.pregunta.update({
    where: { id: f.questions[1].id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  async function fingerprint() {
    const questions = await db.pregunta.findMany({
      where: { subtemaId: f.sub.id },
      orderBy: { id: 'asc' },
      include: { respuestas: { orderBy: { id: 'asc' } } },
    });
    const xp = await db.usuario.findUniqueOrThrow({
      where: { id: f.student.id },
      select: { xpTotal: true },
    });
    return createHash('sha256')
      .update(JSON.stringify({ questions, xp }))
      .digest('hex');
  }
  const before = await fingerprint();
  async function coverage(withReports = true) {
    const result = await request(
      `/admin/cobertura?area=MATEMATICAS&pagina=1&limite=100${withReports ? '&reportesVersion=1' : ''}`,
      f.adminToken,
    );
    assert.equal(result.status, 200);
    return result.data;
  }
  const legacy = await coverage(false);
  assert.equal(legacy.reportesDisponibles, false);
  assert.ok(legacy.items.every((row) => row.reportes === null));
  let row = (await coverage()).items.find((row) => row.id === f.sub.id);
  assert.ok(row);
  assert.equal(row.reportes, 3);
  assert.equal(row.preguntasConReportes, 2);
  assert.equal(row.publicadas, 1);
  await review(f, second.report.id, 0, 'EN_REVISION');
  await review(f, second.report.id, 1, 'DESCARTADO');
  row = (await coverage()).items.find((row) => row.id === f.sub.id);
  assert.equal(row.reportes, 2);
  assert.equal(row.preguntasConReportes, 1);
  assert.equal(row.publicadas, 1);
  await review(f, first.report.id, 0, 'EN_REVISION');
  await review(f, first.report.id, 1, 'RESUELTO');
  row = (await coverage()).items.find((row) => row.id === f.sub.id);
  assert.equal(row.reportes, 1);
  assert.equal(row.preguntasConReportes, 1);
  assert.equal(await fingerprint(), before);
});
