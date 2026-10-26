// Solo mediante el ejecutor temporal propio: nunca aceptar una base existente.
require('reflect-metadata');
require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const {
  readFile,
  realpath,
  readdir,
  writeFile,
  unlink,
  access,
} = require('node:fs/promises');
const { basename, dirname, join } = require('node:path');
const { tmpdir } = require('node:os');
const sharp = require('sharp');
const bcrypt = require('bcrypt');
const { Test } = require('@nestjs/testing');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const {
  ValidationPipe,
  ServiceUnavailableException,
} = require('@nestjs/common');
const { PrismaService } = require('../src/prisma/prisma.service');
const { PrismaModule } = require('../src/prisma/prisma.module');
const {
  EditorialFileModule,
} = require('../src/editorial-files/editorial-file.module');
const {
  EditorialFileService,
} = require('../src/editorial-files/editorial-file.service');
const {
  EditorialFileRuntime,
} = require('../src/editorial-files/editorial-file-runtime');
const {
  editorialImagesData,
} = require('../src/editorial-files/editorial-file-association');
const {
  EDITORIAL_FILE_ROOT,
  EditorialFileStore,
  LocalEditorialFileStore,
} = require('../src/editorial-files/editorial-file.store');

let db, root, disk, image, base, jwt, main;
const instances = [],
  peers = [];
const prefix = '/admin/archivos';
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

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
      EditorialFileModule,
      ...(options.consumers
        ? [
            require('../src/simulacro/simulacro.module').SimulacroModule,
            require('../src/diagnostico/diagnostico.module').DiagnosticoModule,
            require('../src/summit/summit.module').SummitModule,
            require('../src/star-rescue/star-rescue.module').StarRescueModule,
            require('../src/guardian/guardian.module').GuardianModule,
            require('../src/trivia-rush/trivia-rush.module').TriviaRushModule,
            require('../src/tira-afloja/tira-afloja.module').TiraAflojaModule,
            require('../src/batallas/batallas.module').BatallasModule,
            require('../src/cuaderno-errores/cuaderno-errores.module')
              .CuadernoErroresModule,
          ]
        : []),
      ...(options.panel
        ? [
            require('../src/auth/auth.module').AuthModule,
            require('../src/admin/admin.module').AdminModule,
          ]
        : []),
    ],
  })
    .overrideProvider(EDITORIAL_FILE_ROOT)
    .useValue(root);
  if (options.panel)
    builder = builder
      .overrideProvider(require('../src/mail/mail.service').MailService)
      .useValue({});
  if (options.store)
    builder = builder
      .overrideProvider(EditorialFileStore)
      .useValue(options.store);
  if (options.serviceFactory)
    builder = builder.overrideProvider(EditorialFileService).useFactory({
      factory: options.serviceFactory,
      inject: [PrismaService, EditorialFileStore, EditorialFileRuntime],
    });
  const module = await builder.compile();
  const app = module.createNestApplication({ logger: false });
  if (options.panel)
    app.enableCors({
      origin: /^http:\/\/127\.0\.0\.1:\d+$/,
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  if (options.dropResponse) {
    let dropped = false;
    app.use((req, res, next) => {
      if (!dropped && req.method === 'POST' && req.url === prefix) {
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
  instances.push(app);
  // También registrar una aplicación cuya inicialización falle: el cleanup
  // debe poder cerrar su pool, no perderlo antes de añadirlo al inventario.
  await app.listen(0, '127.0.0.1');
  return { app, base: await app.getUrl(), jwt: module.get(JwtService) };
}

async function user(rol = 'ADMIN', extra = {}) {
  return db.usuario.create({
    data: {
      nombre: 'Ensayo automático C5',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'fixture-sin-inicio-de-sesion',
      rol,
      correoVerificado: true,
      ...extra,
    },
  });
}
const tokenFor = (user, claims = {}) =>
  jwt.sign({ sub: user.id, rol: user.rol, ...claims }, { expiresIn: '5m' });
function fields(extra = {}) {
  return {
    operacionId: randomUUID(),
    titulo: 'Diagrama C5',
    textoAlternativo: 'Cuatro sectores iguales',
    fuente: 'Ilustración del ensayo',
    titular: 'Equipo SaberPlus',
    autorizacion: 'ORIGINAL',
    ...extra,
  };
}
async function call(path, token, options = {}, origin = base) {
  const response = await fetch(origin + path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  const json = response.headers
    .get('content-type')
    ?.includes('application/json');
  return {
    status: response.status,
    headers: response.headers,
    data: json ? JSON.parse(bytes.toString()) : bytes,
  };
}
async function upload(
  token,
  metadata = fields(),
  bytes = image,
  origin = base,
) {
  const body = new FormData();
  for (const [key, value] of Object.entries(metadata)) body.append(key, value);
  body.append(
    'archivo',
    new Blob([bytes], { type: 'image/png' }),
    'imagen.png',
  );
  return call(prefix, token, { method: 'POST', body }, origin);
}
async function resource(extra = {}) {
  const admin = await user();
  const token = tokenFor(admin),
    metadata = fields(extra);
  const response = await upload(token, metadata);
  assert.equal(response.status, 201);
  return { admin, token, metadata, file: response.data };
}
const sqlState = (code) => (error) => error?.meta?.code === code;

before(async () => {
  if (!process.env.EDITORIAL_FILES_TEST_OWNER)
    throw new Error('Usa npm run test:editorial-files:postgres.');
  const owner = await realpath(process.env.EDITORIAL_FILES_TEST_OWNER);
  const directory = dirname(owner),
    temporary = await realpath(tmpdir());
  if (
    dirname(directory) !== temporary ||
    !basename(directory).startsWith('saberplus-c5-pg-') ||
    basename(owner) !== 'owner.json'
  )
    throw new Error('No pertenece al ejecutor temporal propio.');
  const marker = JSON.parse(await readFile(owner, 'utf8'));
  const { validateEditorialFilesDatabase } =
    await import('../tool/test_editorial_files_postgres.mjs');
  validateEditorialFilesDatabase(process.env.DATABASE_URL, marker);
  root = join(directory, 'files');
  disk = new LocalEditorialFileStore(root);
  db = new PrismaService();
  await db.$connect();
  image = await sharp({
    create: { width: 120, height: 60, channels: 3, background: 'blue' },
  })
    .png()
    .toBuffer();
  main = await server();
  base = main.base;
  jwt = main.jwt;
});
after(async () => {
  await Promise.allSettled(instances.map((app) => app.close()));
  await Promise.allSettled(peers.map((peer) => peer.$disconnect()));
  await db?.$disconnect();
});

test('C5 cadena completa aplicada y límites SQL/FK efectivos', async () => {
  const migrations =
    await db.$queryRaw`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  assert.ok(
    migrations.some(
      (row) => row.migration_name === '20261020120000_editorial_files_base',
    ),
  );
  const f = await resource();
  await assert.rejects(
    db.$executeRaw`UPDATE "ArchivoEditorial" SET "bytes" = 0 WHERE id = ${f.file.id}::uuid`,
    sqlState('23514'),
  );
  await assert.rejects(
    db.$executeRaw`UPDATE "ArchivoEditorial" SET "ancho" = 2561 WHERE id = ${f.file.id}::uuid`,
    sqlState('23514'),
  );
  const row = await db.archivoEditorial.findUniqueOrThrow({
    where: { id: f.file.id },
  });
  await assert.rejects(
    db.archivoEditorial.create({
      data: {
        ...row,
        id: randomUUID(),
        operacionId: randomUUID(),
        creadoPorId: randomUUID(),
      },
    }),
    (error) => error.code === 'P2003',
  );
  assert.equal(
    (await db.archivoEditorial.findUniqueOrThrow({ where: { id: row.id } }))
      .bytes,
    row.bytes,
  );
});

test('C5 PostgreSQL y bytes sobreviven al reinicio real de la instancia HTTP', async () => {
  const f = await resource();
  const original = await call(f.file.contenidoUrl, f.token);
  assert.equal(original.status, 200);
  await main.app.close();
  main = await server();
  base = main.base;
  jwt = main.jwt;
  const recovered = await call(
    `${prefix}/operaciones/${f.metadata.operacionId}`,
    f.token,
  );
  assert.equal(recovered.status, 200);
  assert.deepEqual(recovered.data, f.file);
  const content = await call(f.file.contenidoUrl, f.token);
  assert.equal(content.status, 200);
  assert.deepEqual(content.data, original.data);
  assert.equal(content.headers.get('cache-control'), 'private, no-store');
  assert.equal(content.headers.get('x-content-type-options'), 'nosniff');
  const row = await db.archivoEditorial.findUniqueOrThrow({
    where: { id: f.file.id },
  });
  assert.equal(digest(content.data), row.sha256);
  assert.equal(content.data.length, row.bytes);
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: f.metadata.operacionId },
    }),
    1,
  );
});

test('C5 ocho cargas simultáneas convergen en una fila y un archivo íntegro', async () => {
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  const peer = await server();
  const responses = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      upload(token, metadata, image, i % 2 ? peer.base : base),
    ),
  );
  assert.deepEqual(
    responses.map((r) => r.status),
    Array(8).fill(201),
  );
  assert.equal(new Set(responses.map((r) => r.data.id)).size, 1);
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    1,
  );
  const row = await db.archivoEditorial.findUniqueOrThrow({
    where: { operacionId: metadata.operacionId },
  });
  assert.equal(digest(await disk.read(row.id)), row.sha256);
  assert.equal(
    (await readdir(root)).filter((name) => name.startsWith(row.id)).length,
    1,
  );
});

test('C5 dos cuentas compitiendo por la misma operación no comparten recibo', async () => {
  const a = await user(),
    b = await user(),
    metadata = fields();
  const responses = await Promise.all([
    upload(tokenFor(a), metadata),
    upload(tokenFor(b), metadata),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 404]);
  const winner = await db.archivoEditorial.findUniqueOrThrow({
    where: { operacionId: metadata.operacionId },
  });
  const loser = winner.creadoPorId === a.id ? b : a;
  assert.equal(
    (
      await call(
        `${prefix}/operaciones/${metadata.operacionId}`,
        tokenFor(loser),
      )
    ).status,
    404,
  );
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    1,
  );
});

test('C5 reutilizar una operación con otro texto o imagen no sobrescribe', async () => {
  const f = await resource();
  const original = await disk.read(f.file.id);
  assert.equal(
    (await upload(f.token, { ...f.metadata, titulo: 'Cambio indebido' }))
      .status,
    409,
  );
  const other = await sharp(image).negate().png().toBuffer();
  assert.equal((await upload(f.token, f.metadata, other)).status, 409);
  assert.deepEqual(await disk.read(f.file.id), original);
  assert.equal(
    (await db.archivoEditorial.findUniqueOrThrow({ where: { id: f.file.id } }))
      .titulo,
    f.metadata.titulo,
  );
});

test('C5 permisos HTTP consultan rol real y bloquean todas las rutas privadas', async () => {
  const f = await resource();
  for (const role of ['ESTUDIANTE', 'PROFESOR']) {
    const account = await user(role),
      token = tokenFor(account, { rol: 'ADMIN' });
    assert.equal((await upload(token)).status, 403);
    assert.equal((await call(f.file.contenidoUrl, token)).status, 403);
    assert.equal((await call(`${prefix}/${f.file.id}`, token)).status, 403);
    assert.equal(
      (await call(`${prefix}/${f.file.id}`, token, { method: 'DELETE' }))
        .status,
      403,
    );
  }
  assert.equal((await call(f.file.contenidoUrl)).status, 401);
  const other = await user();
  assert.equal((await call(f.file.contenidoUrl, tokenFor(other))).status, 200);
  assert.equal(
    (
      await call(
        `${prefix}/operaciones/${f.metadata.operacionId}`,
        tokenFor(other),
      )
    ).status,
    404,
  );
  await db.usuario.update({
    where: { id: f.admin.id },
    data: { rol: 'ESTUDIANTE' },
  });
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 403);
});

test('C5 fallo del disco deja recibo PREPARADO y el reenvío recupera sin duplicar', async () => {
  let fail = true;
  const fault = await server({
    store: {
      put: async (...args) => {
        if (fail) throw new ServiceUnavailableException();
        return disk.put(...args);
      },
      read: (...args) => disk.read(...args),
      remove: (...args) => disk.remove(...args),
    },
  });
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  assert.equal((await upload(token, metadata, image, fault.base)).status, 503);
  const pending = await call(
    `${prefix}/operaciones/${metadata.operacionId}`,
    token,
  );
  assert.equal(pending.data.estado, 'PREPARADO');
  assert.equal(
    (await call(`${prefix}/${pending.data.id}/contenido`, token)).status,
    404,
  );
  fail = false;
  const recovered = await upload(token, metadata, image, fault.base);
  assert.equal(recovered.status, 201);
  assert.equal(recovered.data.id, pending.data.id);
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    1,
  );
});

test('C5 socket perdido después de confirmar: SQL, recibo y reintento concilian', async () => {
  const dropped = await server({ dropResponse: true });
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  await assert.rejects(upload(token, metadata, image, dropped.base));
  const row = await db.archivoEditorial.findUniqueOrThrow({
    where: { operacionId: metadata.operacionId },
  });
  assert.equal(row.estado, 'DISPONIBLE');
  const receipt = await call(
    `${prefix}/operaciones/${metadata.operacionId}`,
    token,
  );
  assert.equal(receipt.data.id, row.id);
  const retried = await upload(token, metadata);
  assert.equal(retried.status, 201);
  assert.deepEqual(retried.data, receipt.data);
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    1,
  );
});

test('C5 fallo PostgreSQL al confirmar conserva PREPARADO y permite recuperar', async () => {
  const name = `c5_confirm_${randomUUID().replaceAll('-', '')}`;
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  await db.$executeRawUnsafe(
    `CREATE FUNCTION "${name}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'C5 ensayo de confirmacion fallida' USING ERRCODE = '40001'; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER "${name}" BEFORE UPDATE ON "ArchivoEditorial" FOR EACH ROW WHEN (NEW.estado = 'DISPONIBLE') EXECUTE FUNCTION "${name}"()`,
  );
  try {
    assert.equal((await upload(token, metadata)).status, 503);
    const pending = await db.archivoEditorial.findUniqueOrThrow({
      where: { operacionId: metadata.operacionId },
    });
    assert.equal(pending.estado, 'PREPARADO');
    assert.equal(digest(await disk.read(pending.id)), pending.sha256);
    assert.equal(
      (await call(`${prefix}/operaciones/${metadata.operacionId}`, token)).data
        .estado,
      'PREPARADO',
    );
  } finally {
    await db.$executeRawUnsafe(`DROP TRIGGER "${name}" ON "ArchivoEditorial"`);
    await db.$executeRawUnsafe(`DROP FUNCTION "${name}"()`);
  }
  assert.equal((await upload(token, metadata)).status, 201);
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    1,
  );
});

test('C5 una retirada incompleta revoca descarga y su reintento limpia los bytes', async () => {
  const f = await resource();
  let fail = true;
  const fault = await server({
    store: {
      put: (...args) => disk.put(...args),
      read: (...args) => disk.read(...args),
      remove: async (...args) => {
        if (fail) throw new ServiceUnavailableException();
        return disk.remove(...args);
      },
    },
  });
  assert.equal(
    (
      await call(
        `${prefix}/${f.file.id}`,
        f.token,
        { method: 'DELETE' },
        fault.base,
      )
    ).status,
    503,
  );
  assert.equal(
    (await db.archivoEditorial.findUniqueOrThrow({ where: { id: f.file.id } }))
      .estado,
    'RETIRADO',
  );
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 404);
  fail = false;
  assert.equal(
    (
      await call(
        `${prefix}/${f.file.id}`,
        f.token,
        { method: 'DELETE' },
        fault.base,
      )
    ).status,
    200,
  );
  await assert.rejects(disk.read(f.file.id));
  assert.equal((await upload(f.token, f.metadata)).status, 410);
});

test('C5 carga y retirada concurrentes nunca reactivan el archivo', async () => {
  let ready, release;
  const writing = new Promise((ok) => {
    ready = ok;
  });
  const resume = new Promise((ok) => {
    release = ok;
  });
  const slow = await server({
    store: {
      put: async (...args) => {
        ready();
        await resume;
        return disk.put(...args);
      },
      read: (...args) => disk.read(...args),
      remove: (...args) => disk.remove(...args),
    },
  });
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  const pending = upload(token, metadata, image, slow.base);
  try {
    await Promise.race([
      writing,
      new Promise((_, fail) => {
        const timer = setTimeout(
          () => fail(new Error('No comenzó la escritura')),
          10000,
        );
        timer.unref();
      }),
    ]);
    const row = await db.archivoEditorial.findUniqueOrThrow({
      where: { operacionId: metadata.operacionId },
    });
    assert.equal(
      (await call(`${prefix}/${row.id}`, token, { method: 'DELETE' })).status,
      200,
    );
    release();
    assert.equal((await pending).status, 410);
    assert.equal(
      (await call(`${prefix}/${row.id}/contenido`, token)).status,
      404,
    );
    assert.equal(
      (await db.archivoEditorial.findUniqueOrThrow({ where: { id: row.id } }))
        .estado,
      'RETIRADO',
    );
    await assert.rejects(disk.read(row.id));
  } finally {
    release();
    await pending.catch(() => undefined);
  }
});

test('C5 integridad del disco: bytes modificados o ausentes devuelven 503', async () => {
  const f = await resource();
  await writeFile(join(root, `${f.file.id}.webp`), Buffer.alloc(f.file.bytes));
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 503);
  await unlink(join(root, `${f.file.id}.webp`));
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 503);
  assert.equal(
    (await call(`${prefix}/operaciones/${f.metadata.operacionId}`, f.token))
      .data.estado,
    'DISPONIBLE',
  );
});

test('C5 bandera apagada y production bloquean sin crear recursos', async () => {
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  const flag = process.env.EDITORIAL_FILES_LOCAL_ENABLED,
    environment = process.env.NODE_ENV;
  try {
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'false';
    assert.equal((await upload(token, metadata)).status, 503);
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'true';
    process.env.NODE_ENV = 'production';
    assert.equal((await upload(token, metadata)).status, 503);
  } finally {
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = flag;
    process.env.NODE_ENV = environment;
  }
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    0,
  );
});

test('C5 migración ausente responde 503 seguro sin insertar archivos', async () => {
  const schema = `c5_missing_${randomUUID().replaceAll('-', '')}`;
  await db.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set('schema', schema);
  const missing = new PrismaService({ datasources: { db: { url: url.href } } });
  peers.push(missing);
  await missing.$connect();
  const app = await server({
    serviceFactory: (_db, store, runtime) =>
      new EditorialFileService(missing, store, runtime),
  });
  const admin = await user(),
    metadata = fields();
  const result = await upload(tokenFor(admin), metadata, image, app.base);
  assert.equal(result.status, 503);
  assert.doesNotMatch(
    JSON.stringify(result.data),
    /Prisma|c5_missing_|DATABASE_URL|postgresql:/,
  );
  assert.equal(
    await db.archivoEditorial.count({
      where: { operacionId: metadata.operacionId },
    }),
    0,
  );
});

test('C5 ACL y RLS bloquean lectura directa de recibos para anon/authenticated', async () => {
  await resource();
  const [acl] = await db.$queryRaw`SELECT relrowsecurity AS rls,
    has_table_privilege('anon', '"ArchivoEditorial"', 'SELECT,INSERT,UPDATE,DELETE') AS anon,
    has_table_privilege('authenticated', '"ArchivoEditorial"', 'SELECT,INSERT,UPDATE,DELETE') AS authenticated
    FROM pg_class WHERE oid = '"ArchivoEditorial"'::regclass`;
  assert.deepEqual(acl, { rls: true, anon: false, authenticated: false });
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        await tx.$queryRaw`SELECT * FROM "ArchivoEditorial" LIMIT 1`;
      }),
      sqlState('42501'),
    );
    const rollback = new Error('Restaurar privilegios del ensayo');
    await assert.rejects(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `GRANT SELECT ON "ArchivoEditorial" TO ${role}`,
        );
        await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        assert.deepEqual(
          await tx.$queryRaw`SELECT count(*)::int AS n FROM "ArchivoEditorial"`,
          [{ n: 0 }],
        );
        await tx.$executeRawUnsafe('RESET ROLE');
        throw rollback;
      }),
      (error) => error === rollback,
    );
  }
});

async function structure(name = `Contenido C5 ${randomUUID()}`) {
  const theme = await db.tema.create({
    data: { nombre: name, area: 'MATEMATICAS', estadoContenido: 'PUBLICADO' },
  });
  const sub = await db.subtema.create({
    data: {
      nombre: 'Fracciones ilustradas',
      temaId: theme.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  return { theme, sub };
}
function questionBody(sub, imagenUrl, extra = {}) {
  return {
    subtemaId: sub.id,
    enunciado: `Pregunta ilustrada ${randomUUID()}`,
    explicacion: 'Dos unidades forman una pareja.',
    imagenUrl,
    dificultad: 'BASICO',
    respuestas: [
      { texto: '2', esCorrecta: true, explicacion: '' },
      { texto: '3', esCorrecta: false, explicacion: '' },
    ],
    casoId: '',
    ...extra,
  };
}
async function panelFixture() {
  const app = await server({ panel: true });
  const password = randomUUID();
  const admin = await user('ADMIN', {
    contrasenaHash: await bcrypt.hash(password, 4),
  });
  const { CatalogApi } = await import('../../admin/public/api.mjs');
  const api = new CatalogApi(app.base, { simple: true });
  await api.login(admin.correo, password);
  return { app, admin, password, api, token: tokenFor(admin) };
}

async function withOptionImages(action) {
  const previous = process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED;
  process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    if (previous === undefined)
      delete process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED = previous;
  }
}

async function imageQuestionFixture() {
  const f = await panelFixture(),
    s = await structure();
  const first = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const second = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const paths = [first, second].map(
    (file) => `/recursos/editoriales/${file.id}`,
  );
  const body = questionBody(s.sub, '');
  body.respuestas = body.respuestas.map((option, i) => ({
    ...option,
    imagenUrl: paths[i],
  }));
  return { ...f, ...s, first, second, paths, body };
}

let c2Bank;
async function consumerBank() {
  if (c2Bank) return c2Bank;
  const f = await imageQuestionFixture();
  // Trivia exige cuatro opciones; no flexibilizar sus reglas por el ensayo C5.
  f.body.respuestas.push(
    { texto: '4', esCorrecta: false, explicacion: '', imagenUrl: f.paths[0] },
    { texto: '5', esCorrecta: false, explicacion: '', imagenUrl: f.paths[1] },
  );
  await db.tema.update({ where: { id: f.theme.id }, data: { area: 'INGLES' } });
  for (let i = 0; i < 12; i++)
    await f.api.bankRecord('preguntas', f.sub.id, undefined, {
      ...f.body,
      enunciado: `C2-C option figures ${i} ${randomUUID()}`,
    });
  const app = await server({ panel: true, consumers: true });
  return (c2Bank = { ...f, consumerBase: app.base });
}
function assertPublicOptions(q, requireImages = true) {
  const options = q.respuestas ?? q.opciones;
  assert.ok(options?.length >= 2);
  assert.doesNotMatch(
    JSON.stringify(options),
    /esCorrecta|correctAnswerId|explicacion|archivoImagenId|autorizacion|operacionId/,
  );
  if (requireImages)
    for (const option of options)
      assert.match(option.imagenUrl, /^\/recursos\/editoriales\//);
}
const jsonPost = (path, token, data, origin) =>
  call(
    path,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    },
    origin,
  );

test('C5-C2-C práctica, simulacro, corrección, historial y cuaderno conservan imagen de opción', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      student = await user('ESTUDIANTE'),
      token = tokenFor(student);
    const practice = await call(
      `/simulacros/preguntas/${f.sub.id}`,
      token,
      {},
      f.consumerBase,
    );
    assert.equal(practice.status, 200);
    for (const q of practice.data.preguntas) assertPublicOptions(q);
    const custom = await call(
      '/simulacros/generar-personalizado?areas=INGLES&cantidad=5',
      token,
      {},
      f.consumerBase,
    );
    assert.equal(custom.status, 200);
    for (const q of custom.data.preguntas) assertPublicOptions(q);
    const answers = [];
    for (const q of practice.data.preguntas) {
      const incorrect = await db.respuesta.findFirstOrThrow({
        where: { preguntaId: q.id, esCorrecta: false },
      });
      answers.push({ preguntaId: q.id, respuestaId: incorrect.id });
    }
    const graded = await jsonPost(
      '/simulacros/calificar',
      token,
      {
        intentoId: practice.data.intentoId,
        area: 'INGLES',
        origen: 'PRACTICA',
        respuestas: answers,
      },
      f.consumerBase,
    );
    assert.equal(graded.status, 201);
    assert.ok(
      graded.data.detalle.every((q) => q.respuestas.every((a) => a.imagenUrl)),
    );
    const history = await call(
      '/simulacros/historial-respuestas',
      token,
      {},
      f.consumerBase,
    );
    assert.equal(history.status, 200);
    assert.ok(history.data.respuestas.length > 0);
    assert.ok(
      history.data.respuestas.every(
        (r) =>
          r.respuestaSeleccionada.imagenUrl && r.respuestaCorrecta.imagenUrl,
      ),
    );
    const notebook = await call('/cuaderno-errores', token, {}, f.consumerBase);
    assert.equal(notebook.status, 200);
    const rows = notebook.data.errores ?? notebook.data.items;
    assert.ok(rows?.length > 0);
    assert.ok(
      rows.every(
        (r) =>
          r.respuestaSeleccionada.imagenUrl && r.respuestaCorrecta.imagenUrl,
      ),
    );
    // Todo es de un usuario ficticio y se respondió mal: no se fabricó XP competitivo.
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: student.id } }),
      0,
    );
  }));

for (const route of ['/salto-cima', '/rescate-estrellas', '/guardian'])
  test(`C5-C2-C ${route}: imagen actual, recuperación y snapshot estable sin solución`, () =>
    withOptionImages(async () => {
      const f = await consumerBank(),
        token = tokenFor(await user('ESTUDIANTE'));
      const start = await jsonPost(
        `${route}/intentos`,
        token,
        { area: 'INGLES', dificultad: 'BASICO', subtemaId: f.sub.id },
        f.consumerBase,
      );
      assert.equal(start.status, 201);
      assertPublicOptions(start.data.pregunta);
      assert.doesNotMatch(
        JSON.stringify(start.data.pregunta),
        /correctAnswerId|esCorrecta|explicacion/,
      );
      const previous = await db.respuesta.findMany({
        where: { preguntaId: start.data.pregunta.id },
      });
      try {
        // Perturbación propia para verificar que el intento ya admitido no relee el banco.
        await db.respuesta.updateMany({
          where: { preguntaId: start.data.pregunta.id },
          data: { imagenUrl: null, archivoImagenId: null },
        });
        const recovered = await call(
          `${route}/intentos/${start.data.id}`,
          token,
          {},
          f.consumerBase,
        );
        assert.equal(recovered.status, 200);
        assert.deepEqual(recovered.data.pregunta, start.data.pregunta);
      } finally {
        for (const row of previous)
          await db.respuesta.update({
            where: { id: row.id },
            data: {
              imagenUrl: row.imagenUrl,
              archivoImagenId: row.archivoImagenId,
            },
          });
      }
    }));

test('C5-C2-C Trivia y Fantasma comparten proyección pública de imágenes sin claves', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      token = tokenFor(await user('ESTUDIANTE'));
    const started = await jsonPost(
      '/trivia-rush/intentos',
      token,
      { areas: ['INGLES'], duracionSegundos: 60 },
      f.consumerBase,
    );
    assert.equal(started.status, 201);
    assertPublicOptions(started.data.intento.pregunta);
    assert.doesNotMatch(
      JSON.stringify(started.data.intento.pregunta),
      /correctAnswerId|esCorrecta|explicacion/,
    );
  }));

test('C5-C2 Tira online inicia con imágenes y rechaza alterar su snapshot original', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      origin = f.consumerBase;
    const first = tokenFor(await user('ESTUDIANTE'));
    const second = tokenFor(await user('ESTUDIANTE'));
    const waiting = await jsonPost(
      '/tira-afloja/emparejamiento',
      first,
      { area: 'INGLES' },
      origin,
    );
    assert.equal(waiting.status, 201);
    const paired = await jsonPost(
      '/tira-afloja/emparejamiento',
      second,
      { area: 'INGLES' },
      origin,
    );
    assert.equal(paired.status, 201);
    const id = waiting.data.partida.id;
    assert.equal(paired.data.partida.id, id);
    const path = `/tira-afloja/${id}`;
    assert.equal(
      (await jsonPost(`${path}/listo`, first, {}, origin)).status,
      201,
    );
    const ready = await jsonPost(`${path}/listo`, second, {}, origin);
    assert.equal(ready.status, 201);
    assert.equal(ready.data.partida.estado, 'ACTIVA');
    assertPublicOptions(ready.data.partida.pregunta);
    const stored = await db.partidaTiraAfloja.findUniqueOrThrow({
      where: { id },
    });
    const snapshot = structuredClone(stored.snapshotInicial);
    const valid = async (value) =>
      (
        await db.$queryRaw`SELECT tug_snapshot_original_valid(${JSON.stringify(value)}::jsonb,m) AS valid FROM "PartidaTiraAfloja" m WHERE id=${id}::uuid`
      )[0].valid;
    assert.equal(await valid(snapshot), true);
    const altered = structuredClone(snapshot);
    altered.questions[0].pregunta.respuestas[0].imagenUrl =
      '/recursos/editoriales/imagen-ajena';
    assert.equal(await valid(altered), false);
    const extra = structuredClone(snapshot);
    extra.questions[0].pregunta.respuestas[0].datoPrivado = true;
    assert.equal(await valid(extra), false);
    for (const entry of snapshot.questions)
      for (const option of entry.pregunta.respuestas) delete option.imagenUrl;
    assert.equal(await valid(snapshot), true);
    assert.equal(
      (await call(path, tokenFor(await user('ESTUDIANTE')), {}, origin)).status,
      403,
    );
  }));

test('C5-C2 Tira local autoriza su flujo y no abre un salto en Trivia o Fantasma', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      student = await user('ESTUDIANTE');
    const token = tokenFor(student),
      other = tokenFor(await user('ESTUDIANTE'));
    const origin = f.consumerBase;
    assert.equal(
      (
        await jsonPost(
          '/tira-local/intentos',
          null,
          { areas: ['INGLES'] },
          origin,
        )
      ).status,
      401,
    );
    assert.equal(
      (
        await jsonPost(
          '/tira-local/intentos',
          tokenFor(await user('PROFESOR')),
          { areas: ['INGLES'] },
          origin,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await jsonPost(
          '/tira-local/intentos',
          token,
          { areas: ['INGLES'], competitive: true },
          origin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await jsonPost(
          '/trivia-rush/intentos',
          token,
          { areas: ['INGLES'], duracionSegundos: 60, modalidad: 'TUG_LOCAL' },
          origin,
        )
      ).status,
      400,
    );
    const created = await jsonPost(
      '/tira-local/intentos',
      token,
      { areas: ['INGLES'] },
      origin,
    );
    assert.equal(created.status, 201);
    const attempt = created.data.intento,
      id = attempt.id,
      question = attempt.pregunta.id;
    assert.equal(attempt.modalidad, 'TUG_LOCAL');
    assert.equal(attempt.rondaLocal.iniciaEn, null);
    assertPublicOptions(attempt.pregunta);
    const path = `/tira-local/intentos/${id}`;
    assert.equal((await call(path, other, {}, origin)).status, 403);
    assert.equal(
      (await call(`/trivia-rush/intentos/${id}`, token, {}, origin)).status,
      403,
    );
    assert.equal(
      (
        await jsonPost(
          `${path}/sin-respuesta`,
          token,
          { preguntaId: question, idempotencyKey: randomUUID() },
          origin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await jsonPost(
          `/trivia-rush/intentos/${id}/potenciadores`,
          token,
          {
            preguntaId: question,
            potenciador: 'SALTAR',
            concesionId: randomUUID(),
            idempotencyKey: randomUUID(),
          },
          origin,
        )
      ).status,
      403,
    );
    const normalUser = await user('ESTUDIANTE'),
      normal = tokenFor(normalUser);
    const trivia = await jsonPost(
      '/trivia-rush/intentos',
      normal,
      { areas: ['INGLES'], duracionSegundos: 60 },
      origin,
    );
    assert.equal(trivia.status, 201);
    assert.equal(
      (
        await jsonPost(
          `/tira-local/intentos/${trivia.data.intento.id}/sin-respuesta`,
          normal,
          {
            preguntaId: trivia.data.intento.pregunta.id,
            idempotencyKey: randomUUID(),
          },
          origin,
        )
      ).status,
      403,
    );
    const ghost = await jsonPost(
      '/trivia-rush/intentos',
      tokenFor(await user('ESTUDIANTE')),
      { areas: ['INGLES'], duracionSegundos: 60, modalidad: 'GHOST_DUEL' },
      origin,
    );
    assert.equal(ghost.status, 201);
    const ghostOwner = await db.intentoTriviaRush.findUniqueOrThrow({
      where: { id: ghost.data.intento.id },
    });
    const ghostToken = tokenFor(
      await db.usuario.findUniqueOrThrow({
        where: { id: ghostOwner.usuarioId },
      }),
    );
    assert.equal(
      (
        await jsonPost(
          `/tira-local/intentos/${ghostOwner.id}/sin-respuesta`,
          ghostToken,
          {
            preguntaId: ghost.data.intento.pregunta.id,
            idempotencyKey: randomUUID(),
          },
          origin,
        )
      ).status,
      403,
    );
  }));

test('C5-C2 Tira local valida diez segundos reales e idempotencia sin respuestas inventadas', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      student = await user('ESTUDIANTE');
    const token = tokenFor(student),
      origin = f.consumerBase;
    const created = await jsonPost(
      '/tira-local/intentos',
      token,
      { areas: ['INGLES'] },
      origin,
    );
    assert.equal(created.status, 201);
    const id = created.data.intento.id,
      question = created.data.intento.pregunta.id;
    const path = `/tira-local/intentos/${id}`;
    const started = await jsonPost(
      `${path}/ronda`,
      token,
      { preguntaId: question },
      origin,
    );
    assert.equal(started.status, 201);
    const retryStart = await jsonPost(
      `${path}/ronda`,
      token,
      { preguntaId: question },
      origin,
    );
    assert.equal(
      retryStart.data.intento.rondaLocal.iniciaEn,
      started.data.intento.rondaLocal.iniciaEn,
    );
    const operation = { preguntaId: question, idempotencyKey: randomUUID() };
    assert.equal(
      (await jsonPost(`${path}/sin-respuesta`, token, operation, origin))
        .status,
      400,
    );
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      0,
    );
    await new Promise((resolve) => setTimeout(resolve, 10100));
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        jsonPost(`${path}/sin-respuesta`, token, operation, origin),
      ),
    );
    for (const response of responses) {
      assert.equal(response.status, 201);
      assert.equal(
        response.data.sinRespuesta.id,
        responses[0].data.sinRespuesta.id,
      );
      assert.equal(response.data.intento.progreso.indiceActual, 1);
    }
    const state = responses[0].data.intento;
    assert.equal(state.estado, 'ACTIVO');
    assert.notEqual(state.pregunta.id, question);
    assertPublicOptions(state.pregunta);
    assert.equal(state.rondaLocal.iniciaEn, null);
    assert.equal(state.progreso.sinRespuesta, 1);
    const row = await db.triviaRushRespuesta.findFirstOrThrow({
      where: { intentoId: id },
    });
    assert.equal(row.respuestaSeleccionadaId, null);
    assert.equal(row.puntosOtorgados, 0);
    assert.equal(row.esFinal, true);
    assert.ok(row.tiempoRespuestaMs >= 10000);
    // El cierre sin selección conserva únicamente imágenes de la pregunta
    // realmente expuesta; no crea respuestas académicas ni abre preguntas futuras.
    const {
      canReadTriviaSnapshotImage,
    } = require('../src/editorial-files/editorial-trivia-access');
    const stored = await db.intentoTriviaRush.findUniqueOrThrow({
      where: { id },
    });
    const original = stored.snapshotLocal.questions[0];
    const image = original.pregunta.respuestas.find(
      (option) => option.imagenUrl,
    )?.imagenUrl;
    assert.ok(image);
    assert.equal(
      await canReadTriviaSnapshotImage(db, image.split('/').pop(), student.id),
      true,
    );
    assert.equal(
      await canReadTriviaSnapshotImage(
        db,
        image.split('/').pop(),
        randomUUID(),
      ),
      false,
    );
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      1,
    );
    assert.equal(
      await db.historialRespuesta.count({ where: { usuarioId: student.id } }),
      0,
    );
    assert.equal(
      await db.triviaRushPotenciador.count({ where: { intentoId: id } }),
      0,
    );
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: student.id } }),
      0,
    );
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: student.id } }))
        .xpTotal,
      0,
    );
    assert.equal(
      (
        await jsonPost(
          `${path}/sin-respuesta`,
          token,
          { ...operation, idempotencyKey: randomUUID() },
          origin,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await jsonPost(
          `${path}/sin-respuesta`,
          token,
          { ...operation, preguntaId: state.pregunta.id },
          origin,
        )
      ).status,
      403,
    );
  }));

test('C5-C2 Tira local pausa con reloj servidor, versión e idempotencia sin ampliar Trivia', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      student = await user('ESTUDIANTE');
    const token = tokenFor(student),
      origin = f.consumerBase;
    const created = await jsonPost(
      '/tira-local/intentos',
      token,
      { areas: ['INGLES'] },
      origin,
    );
    const id = created.data.intento.id,
      question = created.data.intento.pregunta.id;
    const path = `/tira-local/intentos/${id}`;
    const started = await jsonPost(
      `${path}/ronda`,
      token,
      { preguntaId: question },
      origin,
    );
    assert.equal(started.status, 201);
    assert.equal(started.data.intento.rondaLocal.version, 1);
    const operation = { preguntaId: question, version: 1, pausada: true };
    assert.equal(
      (
        await jsonPost(
          `${path}/pausa`,
          tokenFor(await user('ESTUDIANTE')),
          operation,
          origin,
        )
      ).status,
      403,
    );
    const paused = await jsonPost(`${path}/pausa`, token, operation, origin);
    assert.equal(paused.status, 201);
    const round = paused.data.intento.rondaLocal;
    assert.equal(round.pausada, true);
    assert.equal(round.version, 2);
    assert.ok(round.tiempoRestanteMs > 0 && round.tiempoRestanteMs <= 10000);
    const retry = await jsonPost(`${path}/pausa`, token, operation, origin);
    assert.equal(retry.data.intento.rondaLocal.version, 2);
    assert.equal(
      retry.data.intento.rondaLocal.tiempoRestanteMs,
      round.tiempoRestanteMs,
    );
    await new Promise((resolve) => setTimeout(resolve, 10100));
    const stillPaused = await call(path, token, {}, origin);
    assert.equal(
      stillPaused.data.intento.rondaLocal.tiempoRestanteMs,
      round.tiempoRestanteMs,
    );
    assert.equal(
      (
        await jsonPost(
          `${path}/sin-respuesta`,
          token,
          { preguntaId: question, idempotencyKey: randomUUID() },
          origin,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await jsonPost(
          `${path}/respuestas`,
          token,
          {
            preguntaId: question,
            respuestaId: created.data.intento.pregunta.opciones[0].id,
            idempotencyKey: randomUUID(),
          },
          origin,
        )
      ).status,
      400,
    );
    const resumed = await jsonPost(
      `${path}/pausa`,
      token,
      { preguntaId: question, version: 2, pausada: false },
      origin,
    );
    assert.equal(resumed.status, 201);
    assert.equal(resumed.data.intento.rondaLocal.pausada, false);
    assert.equal(resumed.data.intento.rondaLocal.version, 3);
    assert.equal(resumed.data.intento.venceEn, created.data.intento.venceEn);
    assert.ok(resumed.data.intento.rondaLocal.tiempoRestanteMs > 0);
    // Late repeats cannot pause again or add the same paused duration twice.
    const late = await jsonPost(`${path}/pausa`, token, operation, origin);
    assert.equal(late.data.intento.rondaLocal.version, 3);
    assert.equal(
      late.data.intento.rondaLocal.iniciaEn,
      resumed.data.intento.rondaLocal.iniciaEn,
    );
    assert.equal(late.data.intento.rondaLocal.pausada, false);
    const answerOperation = {
      preguntaId: question,
      respuestaId: created.data.intento.pregunta.opciones[0].id,
      idempotencyKey: randomUUID(),
    };
    const answer = await jsonPost(
      `${path}/respuestas`,
      token,
      answerOperation,
      origin,
    );
    assert.equal(answer.status, 201);
    assert.equal(answer.data.intento.rondaLocal.iniciaEn, null);
    assert.equal(answer.data.intento.rondaLocal.pausada, false);
    assert.equal(answer.data.intento.progreso.indiceActual, 1);
    const answerRetry = await jsonPost(
      `${path}/respuestas`,
      token,
      answerOperation,
      origin,
    );
    assert.equal(answerRetry.status, 201);
    assert.deepEqual(answerRetry.data.evaluacion, answer.data.evaluacion);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      1,
    );
    assert.equal(
      await db.historialRespuesta.count({ where: { usuarioId: student.id } }),
      1,
    );
    const normal = await jsonPost(
      '/trivia-rush/intentos',
      tokenFor(await user('ESTUDIANTE')),
      { areas: ['INGLES'], duracionSegundos: 60 },
      origin,
    );
    const normalRow = await db.intentoTriviaRush.findUniqueOrThrow({
      where: { id: normal.data.intento.id },
    });
    await assert.rejects(
      db.$executeRaw`UPDATE "IntentoTriviaRush" SET "tiraLocalRondaVersion" = 1 WHERE id = ${normalRow.id}::uuid`,
      sqlState('23514'),
    );
    await assert.rejects(
      db.$executeRaw`UPDATE "IntentoTriviaRush" SET "tiraLocalPausadaEn" = "preguntaIniciaEn" WHERE id = ${normalRow.id}::uuid`,
      sqlState('23514'),
    );
    assert.equal(
      (
        await jsonPost(
          `/tira-local/intentos/${normalRow.id}/pausa`,
          tokenFor(
            await db.usuario.findUniqueOrThrow({
              where: { id: normalRow.usuarioId },
            }),
          ),
          {
            preguntaId: normal.data.intento.pregunta.id,
            version: 0,
            pausada: true,
          },
          origin,
        )
      ).status,
      403,
    );
    assert.equal(
      await db.triviaRushPotenciador.count({ where: { intentoId: id } }),
      0,
    );
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: student.id } }),
      0,
    );
  }));

test('C5-C2 Tira local expira aun pausada y conserva la vigencia global', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      token = tokenFor(await user('ESTUDIANTE')),
      origin = f.consumerBase;
    const created = await jsonPost(
      '/tira-local/intentos',
      token,
      { areas: ['INGLES'] },
      origin,
    );
    const id = created.data.intento.id,
      question = created.data.intento.pregunta.id;
    const path = `/tira-local/intentos/${id}`;
    const started = await jsonPost(
      `${path}/ronda`,
      token,
      { preguntaId: question },
      origin,
    );
    await jsonPost(
      `${path}/pausa`,
      token,
      {
        preguntaId: question,
        version: started.data.intento.rondaLocal.version,
        pausada: true,
      },
      origin,
    );
    // La admisión original es inmutable. Crear un segundo fixture ya vencido
    // con fechas coherentes, en lugar de reescribir la copia de una partida.
    const admitted = await db.intentoTriviaRush.findUniqueOrThrow({
      where: { id },
    });
    assert.equal(
      (await jsonPost(`${path}/abandonar`, token, {}, origin)).status,
      201,
    );
    const inicio = new Date(Date.now() - 601000),
      vence = new Date(inicio.getTime() + 600000);
    const timed = await db.intentoTriviaRush.create({
      data: {
        usuarioId: admitted.usuarioId,
        modalidad: 'TUG_LOCAL',
        areas: admitted.areas,
        duracionBaseSegundos: 600,
        snapshotLocal: admitted.snapshotLocal,
        iniciadoEn: inicio,
        venceEn: vence,
        preguntaActualId: question,
        preguntaIniciaEn: new Date(inicio.getTime() + 1000),
        tiraLocalPausadaEn: new Date(inicio.getTime() + 2000),
        tiraLocalRondaVersion: 2,
        preguntas: {
          create: admitted.snapshotLocal.questions.map(
            ({ preguntaId, orden, opcionesOrden }) => ({
              preguntaId,
              orden,
              opcionesOrden,
            }),
          ),
        },
      },
    });
    const expired = await call(
      `/tira-local/intentos/${timed.id}`,
      token,
      {},
      origin,
    );
    assert.equal(expired.status, 200);
    assert.equal(expired.data.intento.estado, 'EXPIRADO');
    assert.equal(expired.data.intento.finalizadoEn, vence.toISOString());
    assert.equal(expired.data.intento.rondaLocal.pausada, false);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: timed.id } }),
      0,
    );
  }));

test('C5-C2 Tira local conserva la última pregunta y no duplica al reintentar su cierre', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      student = await user('ESTUDIANTE');
    const token = tokenFor(student),
      origin = f.consumerBase;
    const created = await jsonPost(
      '/tira-local/intentos',
      token,
      { areas: ['INGLES'] },
      origin,
    );
    assert.equal(created.status, 201);
    const id = created.data.intento.id,
      path = `/tira-local/intentos/${id}`;
    let state = created.data.intento,
      lastOperation;
    const total = state.progreso.totalPreguntas;
    for (let index = 0; index < total; index++) {
      const question = state.pregunta.id;
      assert.equal(
        (
          await jsonPost(
            `${path}/ronda`,
            token,
            { preguntaId: question },
            origin,
          )
        ).status,
        201,
      );
      // Only this owned test fixture moves the stored window; real-clock test above is separate.
      await db.intentoTriviaRush.update({
        where: { id },
        data: { preguntaIniciaEn: new Date(Date.now() - 10001) },
      });
      lastOperation = { preguntaId: question, idempotencyKey: randomUUID() };
      if (index === 0) {
        const answer = await jsonPost(
          `${path}/respuestas`,
          token,
          {
            preguntaId: question,
            respuestaId: state.pregunta.opciones[0].id,
            idempotencyKey: randomUUID(),
          },
          origin,
        );
        assert.equal(answer.status, 400);
      }
      const timeout = await jsonPost(
        `${path}/sin-respuesta`,
        token,
        lastOperation,
        origin,
      );
      assert.equal(timeout.status, 201);
      state = timeout.data.intento;
      assert.equal(state.progreso.indiceActual, index + 1);
      assert.equal(state.estado, index + 1 === total ? 'FINALIZADO' : 'ACTIVO');
    }
    const retry = await jsonPost(
      `${path}/sin-respuesta`,
      token,
      lastOperation,
      origin,
    );
    assert.equal(retry.status, 201);
    assert.equal(retry.data.intento.estado, 'FINALIZADO');
    assert.equal(retry.data.intento.finalizadoEn, state.finalizadoEn);
    assert.equal(state.progreso.sinRespuesta, total);
    assert.equal(state.marcador.preguntasSaltadas, 0);
    assert.equal(state.marcador.respuestasIncorrectas, 0);
    assert.equal(state.pregunta, null);
    assert.ok(
      state.resultado.revision.every(
        (item) =>
          item.sinRespuesta &&
          !item.saltada &&
          item.respuestaSeleccionadaId === null &&
          item.respuestaCorrectaId === null &&
          item.explicacion === null,
      ),
    );
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
      total,
    );
    assert.equal(
      await db.historialRespuesta.count({ where: { usuarioId: student.id } }),
      0,
    );
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { usuarioId: student.id } }),
      0,
    );
    // Even an artificially high local score cannot become a Trivia/Fantasma record.
    await db.intentoTriviaRush.update({
      where: { id },
      data: { puntaje: 99999 },
    });
    const ghost = await call(
      '/trivia-rush/fantasma?areas=INGLES&duracionSegundos=60',
      token,
      {},
      origin,
    );
    assert.equal(ghost.status, 200);
    assert.equal(ghost.data.fantasma, null);
  }));

test('C5-C2-C Batallas entrega imágenes al iniciar, no soluciones ni datos de autoría', () =>
  withOptionImages(async () => {
    const f = await consumerBank();
    const token = tokenFor(await user('ESTUDIANTE')),
      rival = tokenFor(await user('ESTUDIANTE'));
    const first = await jsonPost(
      '/batallas',
      token,
      { area: 'INGLES', modo: 'DUELO_RELAMPAGO' },
      f.consumerBase,
    );
    assert.equal(first.status, 201);
    const second = await jsonPost(
      '/batallas',
      rival,
      { area: 'INGLES', modo: 'DUELO_RELAMPAGO' },
      f.consumerBase,
    );
    assert.equal(second.status, 201);
    const started = await jsonPost(
      `/batallas/${first.data.id}/iniciar`,
      token,
      {},
      f.consumerBase,
    );
    assert.equal(started.status, 201);
    assert.ok(started.data.preguntas.length > 0);
    for (const q of started.data.preguntas) assertPublicOptions(q);
  }));

test('C5-C2-C diagnóstico y repaso mantienen referencias sin exponer corrección', () =>
  withOptionImages(async () => {
    const f = await consumerBank(),
      token = tokenFor(await user('ESTUDIANTE'));
    for (const area of [
      'MATEMATICAS',
      'LECTURA_CRITICA',
      'SOCIALES_CIUDADANAS',
      'CIENCIAS_NATURALES',
    ]) {
      const s = await structure();
      await db.tema.update({ where: { id: s.theme.id }, data: { area } });
      for (let i = 0; i < 3; i++)
        await f.api.bankRecord('preguntas', s.sub.id, undefined, {
          ...f.body,
          subtemaId: s.sub.id,
          enunciado: `C2-C diagnóstico ${area} ${i} ${randomUUID()}`,
        });
    }
    const diagnostic = await jsonPost(
      '/diagnostico-inicial/iniciar',
      token,
      {},
      f.consumerBase,
    );
    assert.equal(diagnostic.status, 201);
    assert.equal(diagnostic.data.preguntas.length, 15);
    for (const q of diagnostic.data.preguntas) assertPublicOptions(q, false);
    assert.ok(
      diagnostic.data.preguntas.some((q) =>
        q.respuestas.some((a) => a.imagenUrl),
      ),
    );
    const review = await jsonPost(
      '/repaso-adaptativo/generar?cantidad=5',
      token,
      {},
      f.consumerBase,
    );
    assert.equal(review.status, 201);
    for (const q of review.data.preguntas) assertPublicOptions(q, false);
  }));

test('C5-C2-B API y cliente editorial guardan imágenes distintas y las devuelven sin metadatos privados', () =>
  withOptionImages(async () => {
    const f = await imageQuestionFixture();
    const list = await f.api.bankPage('preguntas', f.sub.id);
    assert.equal(list.imagenesEnOpcionesHabilitadas, true);
    const q = await f.api.bankRecord('preguntas', f.sub.id, undefined, f.body);
    assert.equal(q.estadoContenido, 'PUBLICADO');
    assert.equal(q.imagenesEnOpcionesHabilitadas, true);
    const detail = await f.api.bankRecord('preguntas', f.sub.id, q.id);
    assert.deepEqual(
      detail.respuestas.map((option) => option.imagenUrl).sort(),
      [...f.paths].sort(),
    );
    assert.doesNotMatch(
      JSON.stringify(detail.respuestas),
      /archivoImagenId|autorizacion|titular|operacionId/,
    );
    const saved = await db.pregunta.findUniqueOrThrow({
      where: { id: q.id },
      include: { respuestas: true },
    });
    const {
      createQuestionFingerprint,
    } = require('../src/common/question-fingerprint');
    assert.equal(
      saved.huellaContenido,
      createQuestionFingerprint({
        area: 'MATEMATICAS',
        enunciado: saved.enunciado,
        opciones: saved.respuestas,
      }),
    );
    assert.deepEqual(
      saved.respuestas.map((option) => option.archivoImagenId).sort(),
      [f.first.id, f.second.id].sort(),
    );
  }));

test('C5-C2-B una opción no disponible o una URL insegura no deja ninguna pregunta parcial', () =>
  withOptionImages(async () => {
    const f = await imageQuestionFixture();
    for (const invalid of [
      `/recursos/editoriales/${randomUUID()}`,
      'javascript:alert(1)',
      'https://user:pass@example.invalid/a.png',
    ]) {
      const input = structuredClone(f.body);
      input.respuestas[1].imagenUrl = invalid;
      await assert.rejects(
        f.api.bankRecord('preguntas', f.sub.id, undefined, input),
      );
      assert.equal(
        await db.pregunta.count({ where: { subtemaId: f.sub.id } }),
        0,
      );
    }
    assert.equal(
      (await call(`${prefix}/${f.first.id}`, f.token, { method: 'DELETE' }))
        .status,
      200,
    );
    await assert.rejects(
      f.api.bankRecord('preguntas', f.sub.id, undefined, f.body),
      (e) => e.status === 409,
    );
    assert.equal(
      await db.pregunta.count({ where: { subtemaId: f.sub.id } }),
      0,
    );
  }));

test('C5-C2-B editor anterior no puede borrar imágenes por omisión', () =>
  withOptionImages(async () => {
    const f = await imageQuestionFixture();
    const q = await f.api.bankRecord('preguntas', f.sub.id, undefined, f.body);
    const oldInput = questionBody(f.sub, '', {
      enunciado: q.enunciado,
      revision: q.revision,
    });
    await assert.rejects(
      f.api.bankRecord('preguntas', f.sub.id, q.id, oldInput),
      (e) => e.status === 409,
    );
    const current = await f.api.bankRecord('preguntas', f.sub.id, q.id);
    assert.equal(current.revision, q.revision);
    assert.deepEqual(current.respuestas, q.respuestas);
    assert.equal(
      await db.pregunta.count({ where: { subtemaId: f.sub.id } }),
      1,
    );
  }));

test('C5-C2-B quitar imágenes explícitamente crea versión nueva y conserva FKs históricas', () =>
  withOptionImages(async () => {
    const f = await imageQuestionFixture();
    const q = await f.api.bankRecord('preguntas', f.sub.id, undefined, f.body);
    const changed = await f.api.bankRecord('preguntas', f.sub.id, q.id, {
      ...f.body,
      revision: q.revision,
      respuestas: f.body.respuestas.map((option) => ({
        ...option,
        imagenUrl: '',
      })),
    });
    assert.notEqual(changed.id, q.id);
    assert.equal(changed.reemplazaId, q.id);
    assert.ok(changed.respuestas.every((option) => !option.imagenUrl));
    const old = await db.pregunta.findUniqueOrThrow({
      where: { id: q.id },
      include: { respuestas: true },
    });
    assert.equal(old.estadoContenido, 'ARCHIVADO');
    assert.ok(old.respuestas.every((option) => option.archivoImagenId));
    assert.equal(
      (await call(`${prefix}/${f.first.id}`, f.token, { method: 'DELETE' }))
        .status,
      409,
    );
    assert.equal(
      (await call(f.paths[0], tokenFor(await user('ESTUDIANTE')))).status,
      404,
    );
  }));

test('C5-C2-B huella diferencia la imagen y detecta duplicados con opciones reordenadas', () =>
  withOptionImages(async () => {
    const f = await imageQuestionFixture();
    const first = await f.api.bankRecord(
      'preguntas',
      f.sub.id,
      undefined,
      f.body,
    );
    await assert.rejects(
      f.api.bankRecord('preguntas', f.sub.id, undefined, {
        ...f.body,
        respuestas: [...f.body.respuestas].reverse(),
      }),
      (e) => e.status === 409,
    );
    const swapped = await f.api.bankRecord('preguntas', f.sub.id, undefined, {
      ...f.body,
      respuestas: f.body.respuestas.map((option, i) => ({
        ...option,
        imagenUrl: f.paths[1 - i],
      })),
    });
    assert.notEqual(first.id, swapped.id);
    assert.equal(
      await db.pregunta.count({ where: { subtemaId: f.sub.id } }),
      2,
    );
  }));

test('C5-C2-B al apagar la activación se conserva el detalle pero se bloquea editar imágenes', async () => {
  let f, q;
  await withOptionImages(async () => {
    f = await imageQuestionFixture();
    q = await f.api.bankRecord('preguntas', f.sub.id, undefined, f.body);
  });
  const current = await f.api.bankRecord('preguntas', f.sub.id, q.id);
  assert.equal(current.editable, false);
  assert.equal(current.imagenesEnOpcionesHabilitadas, false);
  assert.deepEqual(current.respuestas, q.respuestas);
  await assert.rejects(
    f.api.bankRecord('preguntas', f.sub.id, q.id, {
      ...f.body,
      revision: q.revision,
    }),
    (e) => e.status === 503,
  );
  assert.equal(await db.pregunta.count({ where: { subtemaId: f.sub.id } }), 1);
});

// C2-A comprueba la base por transacciones propias del ensayo. El DTO del editor
// sigue rechazando imágenes en opciones hasta preparar panel y consumidores.
async function optionFixture() {
  const f = await resource();
  const s = await structure();
  const question = await db.pregunta.create({
    data: {
      subtemaId: s.sub.id,
      enunciado: `Opciones C2 ${randomUUID()}`,
      dificultad: 'BASICO',
      estadoContenido: 'PUBLICADO',
      explicacion: 'Compara las proporciones.',
      respuestas: {
        create: [
          { texto: 'Rectángulo de proporción dos a uno', esCorrecta: true },
          { texto: 'Cuadrado de lados iguales', esCorrecta: false },
        ],
      },
    },
    include: { respuestas: { orderBy: { texto: 'asc' } } },
  });
  return { ...f, ...s, question, path: `/recursos/editoriales/${f.file.id}` };
}

async function attachOption(f, index = 0) {
  return db.$transaction(async (tx) => {
    const [image] = await editorialImagesData(tx, [f.path]);
    return tx.respuesta.update({
      where: { id: f.question.respuestas[index].id },
      data: image,
    });
  });
}

async function withHistoryImages(action) {
  const previous = process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED;
  process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    if (previous === undefined)
      delete process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = previous;
  }
}

async function historyImageFixture() {
  const f = await optionFixture();
  for (let i = 0; i < f.question.respuestas.length; i++)
    await attachOption(f, i);
  const student = await user('ESTUDIANTE');
  const selected = f.question.respuestas.find((option) => !option.esCorrecta);
  const correct = f.question.respuestas.find((option) => option.esCorrecta);
  const history = await db.historialRespuesta.create({
    data: {
      usuarioId: student.id,
      sesionId: randomUUID(),
      preguntaId: f.question.id,
      respuestaSeleccionadaId: selected.id,
      respuestaCorrectaId: correct.id,
      area: 'MATEMATICAS',
      origen: 'PRACTICA',
      esCorrecta: false,
    },
    include: { imagenes: true },
  });
  return { ...f, student, selected, correct, history };
}

test('C5-H1 captura ambos roles al confirmar y permite archivo solo al propietario', () =>
  withHistoryImages(async () => {
    const f = await historyImageFixture();
    assert.equal(f.history.imagenes.length, 2);
    assert.deepEqual(
      new Set(f.history.imagenes.map((r) => r.rol)),
      new Set(['SELECCIONADA', 'CORRECTA']),
    );
    for (const row of f.history.imagenes) {
      assert.equal(row.usuarioId, f.student.id);
      assert.equal(row.archivoId, f.file.id);
      assert.equal(row.sha256, digest(await disk.read(f.file.id)));
    }
    await db.pregunta.update({
      where: { id: f.question.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    await db.subtema.update({
      where: { id: f.sub.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    const own = await call(f.path, tokenFor(f.student));
    assert.equal(own.status, 200);
    assert.equal(
      (
        await call(
          f.path.replace(f.file.id, f.file.id.toUpperCase()),
          tokenFor(f.student),
        )
      ).status,
      200,
    );
    assert.equal(digest(own.data), f.history.imagenes[0].sha256);
    assert.equal(own.headers.get('cache-control'), 'private, no-store');
    for (const role of ['ESTUDIANTE', 'PROFESOR']) {
      const other = await user(role);
      const denied = await call(f.path, tokenFor(other));
      assert.equal(denied.status, 404);
      const absent = await call(
        `/recursos/editoriales/${randomUUID()}`,
        tokenFor(other),
      );
      assert.deepEqual(denied.data, absent.data);
    }
    assert.equal((await call(f.path)).status, 401);
    assert.equal(
      (await call('/recursos/editoriales/no-uuid', tokenFor(f.student))).status,
      400,
    );
    const unverified = await user('ESTUDIANTE', { correoVerificado: false });
    assert.equal((await call(f.path, tokenFor(unverified))).status, 403);
  }));

test('C5-H1 no autoriza opciones no respondidas ni otra imagen incorporada después', () =>
  withHistoryImages(async () => {
    const f = await historyImageFixture(),
      extra = await resource();
    const nextPath = `/recursos/editoriales/${extra.file.id}`;
    await db.respuesta.create({
      data: {
        preguntaId: f.question.id,
        texto: 'Otra opción no expuesta',
        esCorrecta: false,
        imagenUrl: nextPath,
        archivoImagenId: extra.file.id,
      },
    });
    // Perturbación de fixture: la captura conserva el archivo original aunque se
    // modifique la asociación mutable. No modifica el flujo de publicación real.
    await db.respuesta.update({
      where: { id: f.selected.id },
      data: {
        imagenUrl: nextPath,
        archivoImagenId: extra.file.id,
      },
    });
    await db.pregunta.update({
      where: { id: f.question.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(f.path, tokenFor(f.student))).status, 200);
    assert.equal((await call(nextPath, tokenFor(f.student))).status, 404);
    const consumer = await server({ consumers: true });
    const token = tokenFor(f.student);
    const history = await call(
      '/simulacros/historial-respuestas',
      token,
      {},
      consumer.base,
    );
    const notebook = await call('/cuaderno-errores', token, {}, consumer.base);
    assert.equal(history.status, 200);
    assert.equal(notebook.status, 200);
    const entries = [
      history.data.respuestas.find((row) => row.id === f.history.id),
      notebook.data.errores.find((row) => row.preguntaId === f.question.id),
    ];
    for (const entry of entries) {
      assert.ok(entry);
      assert.equal(entry.respuestaSeleccionada.imagenUrl, f.path);
      assert.equal(entry.respuestaCorrecta.imagenUrl, f.path);
      assert.ok(!('archivoImagenId' in entry.respuestaSeleccionada));
      assert.ok(!('sha256' in entry.respuestaSeleccionada));
    }
    assert.equal((await call(f.path, token)).status, 200);
    const original = await db.imagenHistorialRespuesta.findUniqueOrThrow({
      where: {
        historialId_rol: { historialId: f.history.id, rol: 'SELECCIONADA' },
      },
    });
    assert.equal(original.archivoId, f.file.id);
    await assert.rejects(
      db.imagenHistorialRespuesta.update({
        where: {
          historialId_rol: { historialId: f.history.id, rol: 'SELECCIONADA' },
        },
        data: { archivoId: extra.file.id },
      }),
    );
  }));

test('C5-H1 captura solo opciones de la pregunta, sin backfill al asociar más tarde', () =>
  withHistoryImages(async () => {
    const f = await optionFixture(),
      student = await user('ESTUDIANTE');
    const data = {
      usuarioId: student.id,
      sesionId: randomUUID(),
      preguntaId: f.question.id,
      respuestaSeleccionadaId: f.question.respuestas[0].id,
      respuestaCorrectaId: f.question.respuestas.find((r) => r.esCorrecta).id,
      area: 'MATEMATICAS',
      origen: 'PRACTICA',
      esCorrecta: false,
    };
    const old = await db.historialRespuesta.create({ data });
    await attachOption(f);
    assert.equal(
      await db.imagenHistorialRespuesta.count({
        where: { historialId: old.id },
      }),
      0,
    );
    const invalid = await db.historialRespuesta.create({
      data: {
        ...data,
        sesionId: randomUUID(),
        respuestaSeleccionadaId: randomUUID(),
        respuestaCorrectaId: randomUUID(),
      },
    });
    assert.equal(
      await db.imagenHistorialRespuesta.count({
        where: { historialId: invalid.id },
      }),
      0,
    );
    await db.pregunta.update({
      where: { id: f.question.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(f.path, tokenFor(student))).status, 404);
  }));

test('C5-H1 retirada protege prueba histórica aun sin asociaciones editoriales', () =>
  withHistoryImages(async () => {
    const f = await historyImageFixture();
    await db.respuesta.updateMany({
      where: { preguntaId: f.question.id },
      data: { imagenUrl: null, archivoImagenId: null },
    });
    assert.equal(
      (await call(`${prefix}/${f.file.id}`, f.token, { method: 'DELETE' }))
        .status,
      409,
    );
    assert.equal((await call(f.path, tokenFor(f.student))).status, 200);
    assert.ok((await disk.read(f.file.id)).length);
  }));

test('C5-H1 revocación prevalece, es idempotente y conserva historial/bytes/resultados', () =>
  withHistoryImages(async () => {
    const f = await historyImageFixture();
    const path = `${prefix}/${f.file.id}/revocaciones`;
    const body = {
      operacionId: randomUUID(),
      motivo: 'DERECHOS',
      detalle: 'Ensayo H1: permiso revocado.',
    };
    const post = (payload, token = f.token) =>
      call(path, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    const before = await db.historialRespuesta.findUniqueOrThrow({
      where: { id: f.history.id },
    });
    const xp = (
      await db.usuario.findUniqueOrThrow({ where: { id: f.student.id } })
    ).xpTotal;
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => post(body)),
    );
    assert.deepEqual(
      responses.map((r) => r.status),
      [201, 201, 201, 201],
    );
    const uppercaseReplay = await call(
      `${prefix}/${f.file.id.toUpperCase()}/revocaciones`,
      f.token,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    assert.equal(uppercaseReplay.status, 201);
    assert.deepEqual(uppercaseReplay.data, responses[0].data);
    assert.equal(
      await db.revocacionArchivoEditorial.count({
        where: { archivoId: f.file.id },
      }),
      1,
    );
    assert.equal((await call(f.path, tokenFor(f.student))).status, 404);
    assert.equal((await call(f.file.contenidoUrl, f.token)).status, 404);
    const detail = await call(`${prefix}/${f.file.id}`, f.token);
    assert.equal(detail.data.estado, 'REVOCADO');
    assert.equal(detail.data.contenidoUrl, null);
    assert.equal(detail.data.puedeReintentar, false);
    assert.ok(!('detalle' in detail.data));
    assert.equal((await post({ ...body, motivo: 'SEGURIDAD' })).status, 409);
    assert.equal((await post(body, tokenFor(await user()))).status, 404);
    assert.equal((await upload(f.token, f.metadata)).status, 410);
    assert.equal(
      (await call(`${path}/${body.operacionId}`, f.token)).status,
      200,
    );
    assert.equal(
      (await call(`${path}/${body.operacionId}`, tokenFor(await user())))
        .status,
      404,
    );
    assert.deepEqual(
      await db.historialRespuesta.findUniqueOrThrow({
        where: { id: f.history.id },
      }),
      before,
    );
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: f.student.id } }))
        .xpTotal,
      xp,
    );
    assert.equal(
      await db.imagenHistorialRespuesta.count({
        where: { historialId: f.history.id },
      }),
      2,
    );
    assert.equal(
      digest(await disk.read(f.file.id)),
      f.history.imagenes[0].sha256,
    );
    await assert.rejects(
      db.revocacionArchivoEditorial.delete({ where: { archivoId: f.file.id } }),
    );
    await assert.rejects(
      db.$transaction((tx) => editorialImagesData(tx, [f.path])),
    );
  }));

test('C5-H1 revocar mientras termina una carga no permite reactivarla ni borra bytes', async () => {
  let ready, release;
  const writing = new Promise((ok) => {
    ready = ok;
  });
  const resume = new Promise((ok) => {
    release = ok;
  });
  const slow = await server({
    store: {
      put: async (...args) => {
        ready();
        await resume;
        return disk.put(...args);
      },
      read: (...args) => disk.read(...args),
      remove: (...args) => disk.remove(...args),
    },
  });
  const admin = await user(),
    token = tokenFor(admin),
    metadata = fields();
  const pending = upload(token, metadata, image, slow.base);
  try {
    await Promise.race([
      writing,
      new Promise((_, fail) => {
        const timer = setTimeout(
          () => fail(new Error('No comenzó la carga H1')),
          10000,
        );
        timer.unref();
      }),
    ]);
    const file = await db.archivoEditorial.findUniqueOrThrow({
      where: { operacionId: metadata.operacionId },
    });
    const response = await call(`${prefix}/${file.id}/revocaciones`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operacionId: randomUUID(),
        motivo: 'SEGURIDAD',
        detalle: 'Ensayo H1 concurrente.',
      }),
    });
    assert.equal(response.status, 201);
    release();
    assert.equal((await pending).status, 410);
    assert.equal(
      (await call(`${prefix}/${file.id}/contenido`, token)).status,
      404,
    );
    const receipt = await call(
      `${prefix}/operaciones/${metadata.operacionId}`,
      token,
    );
    assert.equal(receipt.data.estado, 'REVOCADO');
    assert.equal(receipt.data.puedeReintentar, false);
    assert.equal(digest(await disk.read(file.id)), file.sha256);
  } finally {
    release();
    await pending.catch(() => undefined);
  }
});

test('C5-H1 una operación concurrente no revoca dos archivos diferentes', async () => {
  const a = await resource(),
    b = await resource();
  const body = {
    operacionId: randomUUID(),
    motivo: 'SEGURIDAD',
    detalle: 'Ensayo H1: operación compartida accidentalmente.',
  };
  const post = (file) =>
    call(`${prefix}/${file.file.id}/revocaciones`, file.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const responses = await Promise.all([post(a), post(b)]);
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 404).length, 1);
  assert.equal(
    await db.revocacionArchivoEditorial.count({
      where: { operacionId: body.operacionId },
    }),
    1,
  );
});

test('C5-H1 rollback no deja prueba histórica y tablas nuevas deniegan acceso PostgREST', async () => {
  const f = await historyImageFixture(),
    id = randomUUID();
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.historialRespuesta.create({
        data: {
          id,
          usuarioId: f.student.id,
          sesionId: randomUUID(),
          preguntaId: f.question.id,
          respuestaSeleccionadaId: f.selected.id,
          respuestaCorrectaId: f.correct.id,
          area: 'MATEMATICAS',
          origen: 'PRACTICA',
          esCorrecta: false,
        },
      });
      throw new Error('Rollback deliberado H1');
    }),
    /Rollback deliberado/,
  );
  assert.equal(
    await db.imagenHistorialRespuesta.count({ where: { historialId: id } }),
    0,
  );
  const tables = await db.$queryRaw`SELECT relname, relrowsecurity FROM pg_class
    WHERE oid IN ('public."ImagenHistorialRespuesta"'::regclass, 'public."RevocacionArchivoEditorial"'::regclass)`;
  assert.equal(tables.length, 2);
  assert.ok(tables.every((r) => r.relrowsecurity));
  const grants =
    await db.$queryRaw`SELECT has_table_privilege(r.oid, c.oid, 'SELECT,INSERT,UPDATE,DELETE') AS permitido
    FROM pg_roles r CROSS JOIN pg_class c WHERE r.rolname IN ('anon', 'authenticated')
    AND c.oid IN ('public."ImagenHistorialRespuesta"'::regclass, 'public."RevocacionArchivoEditorial"'::regclass)`;
  assert.ok(grants.every((r) => !r.permitido));
});

async function withSoloSnapshotImages(action) {
  const previous = process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED;
  process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    if (previous === undefined)
      delete process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED = previous;
  }
}

async function soloSnapshotFixture(
  model,
  size,
  placement,
  transform = (snapshots) => snapshots,
) {
  const current = await resource(),
    future = await resource();
  const owner = await user('ESTUDIANTE');
  const currentPath = `/recursos/editoriales/${current.file.id}`;
  const futurePath = `/recursos/editoriales/${future.file.id}`;
  const snapshots = Array.from({ length: size }, (_, index) => {
    const picture = index === 0 ? currentPath : index === 1 ? futurePath : null;
    const yes = randomUUID(),
      no = randomUUID();
    return {
      question: {
        id: randomUUID(),
        enunciado: `H2A pregunta ${index}`,
        dificultad: 'BASICO',
        imagenUrl: placement === 'question' ? picture : null,
        respuestas: [
          {
            id: yes,
            texto: 'Opción A',
            ...(placement === 'option' && picture
              ? { imagenUrl: picture }
              : {}),
          },
          { id: no, texto: 'Opción B' },
        ],
        caso:
          placement === 'case'
            ? {
                id: randomUUID(),
                titulo: 'H2A',
                contexto: 'Contexto original',
                imagenUrl: picture,
              }
            : null,
      },
      correctAnswerId: yes,
      explanation: 'Explicación original',
    };
  });
  const attempt = await db[model].create({
    data: {
      usuarioId: owner.id,
      area: 'MATEMATICAS',
      dificultad: 'BASICO',
      preguntas: transform(snapshots),
      creadoEn: new Date(Date.now() - 3600000),
      venceEn: new Date(Date.now() + 3600000),
    },
  });
  const firstAnswer = {
    preguntaId: snapshots[0].question.id,
    respuestaId: snapshots[0].correctAnswerId,
    idempotencyKey: randomUUID(),
    esCorrecta: true,
  };
  return {
    current,
    future,
    owner,
    token: tokenFor(owner),
    currentPath,
    futurePath,
    snapshots,
    attempt,
    firstAnswer,
  };
}

for (const [model, size, placement] of [
  ['intentoCima', 12, 'question'],
  ['intentoGuardian', 8, 'option'],
  ['intentoRescateEstrellas', 10, 'case'],
]) {
  test(`C5-H2A ${model}: actual/respondida propia sí, futura/ajena/actual expirada no`, () =>
    withSoloSnapshotImages(async () => {
      const f = await soloSnapshotFixture(model, size, placement);
      assert.equal((await call(f.currentPath, f.token)).status, 200);
      assert.equal((await call(f.futurePath, f.token)).status, 404);
      await db[model].update({
        where: { id: f.attempt.id },
        data: { venceEn: new Date(Date.now() - 1000) },
      });
      assert.equal((await call(f.currentPath, f.token)).status, 404);
      await db[model].update({
        where: { id: f.attempt.id },
        data: { venceEn: new Date(Date.now() + 3600000) },
      });
      assert.equal(
        (await call(f.currentPath, tokenFor(await user('ESTUDIANTE')))).status,
        404,
      );
      assert.equal(
        (await call(f.currentPath, tokenFor(await user('PROFESOR')))).status,
        404,
      );
      process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'false';
      assert.equal((await call(f.currentPath, f.token)).status, 404);
      process.env.EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
      await db[model].update({
        where: { id: f.attempt.id },
        data: { respuestas: [f.firstAnswer] },
      });
      assert.equal((await call(f.currentPath, f.token)).status, 200);
      assert.equal((await call(f.futurePath, f.token)).status, 200);
      await db[model].update({
        where: { id: f.attempt.id },
        data: { estado: 'EXPIRADO', finalizadoEn: new Date() },
      });
      assert.equal((await call(f.currentPath, f.token)).status, 200);
      assert.equal((await call(f.futurePath, f.token)).status, 404);
      const revoke = await call(
        `${prefix}/${f.current.file.id}/revocaciones`,
        f.current.token,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operacionId: randomUUID(),
            motivo: 'SEGURIDAD',
            detalle: 'Ensayo H2A.',
          }),
        },
      );
      assert.equal(revoke.status, 201);
      assert.equal((await call(f.currentPath, f.token)).status, 404);
    }));

  test(`C5-H2A ${model}: referencia futura protege bytes y snapshot/propietario no se reescriben`, async () => {
    const f = await soloSnapshotFixture(model, size, placement);
    for (const file of [f.current, f.future]) {
      assert.equal(
        (
          await call(`${prefix}/${file.file.id}`, file.token, {
            method: 'DELETE',
          })
        ).status,
        409,
      );
      assert.ok((await disk.read(file.file.id)).length);
    }
    await assert.rejects(
      db[model].update({
        where: { id: f.attempt.id },
        data: { preguntas: f.snapshots.slice().reverse() },
      }),
    );
    await assert.rejects(
      db[model].update({
        where: { id: f.attempt.id },
        data: { usuarioId: (await user('ESTUDIANTE')).id },
      }),
    );
    assert.deepEqual(
      (await db[model].findUniqueOrThrow({ where: { id: f.attempt.id } }))
        .preguntas,
      f.snapshots,
    );
  });

  test(`C5-H2A ${model}: avance corrupto o referencia en metadatos no concede permiso`, () =>
    withSoloSnapshotImages(async () => {
      const f = await soloSnapshotFixture(model, size, placement);
      await db[model].update({
        where: { id: f.attempt.id },
        data: {
          respuestas: [{ ...f.firstAnswer, preguntaId: 'no-corresponde' }],
        },
      });
      assert.equal((await call(f.currentPath, f.token)).status, 404);
      assert.equal((await call(f.futurePath, f.token)).status, 404);
      await db[model].update({
        where: { id: f.attempt.id },
        data: {
          respuestas: [{ ...f.firstAnswer, respuestaId: 'opcion-ajena' }],
        },
      });
      assert.equal((await call(f.futurePath, f.token)).status, 404);
      const unrelated = await resource(),
        hiddenPath = `/recursos/editoriales/${unrelated.file.id}`;
      const hidden = f.snapshots.map((s) => ({
        ...s,
        question: {
          ...s.question,
          imagenUrl: null,
          caso: null,
          respuestas: s.question.respuestas.map(({ id, texto }) => ({
            id,
            texto,
          })),
        },
        internal: { imagenUrl: hiddenPath },
      }));
      const second = await user('ESTUDIANTE');
      await db[model].create({
        data: {
          usuarioId: second.id,
          area: 'MATEMATICAS',
          dificultad: 'BASICO',
          preguntas: hidden,
          creadoEn: new Date(),
          venceEn: new Date(Date.now() + 3600000),
        },
      });
      assert.equal((await call(hiddenPath, tokenFor(second))).status, 404);
      const malformed = await soloSnapshotFixture(
        model,
        size,
        placement,
        (snapshots) =>
          snapshots.map((s) => ({
            ...s,
            correctAnswerId: 'opcion-inexistente',
          })),
      );
      assert.equal(
        (await call(malformed.currentPath, malformed.token)).status,
        404,
      );
    }));
}

test('C5-H2A índices GIN aptos para contención y consulta de lectura sin recorrer JSON en Node', async () => {
  const rows =
    await db.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN
    ('IntentoCima_editorial_snapshot_idx','IntentoGuardian_editorial_snapshot_idx','IntentoRescateEstrellas_editorial_snapshot_idx')`;
  assert.equal(rows.length, 3);
  assert.ok(
    rows.every(
      (r) => /USING gin/.test(r.indexdef) && /jsonb_path_ops/.test(r.indexdef),
    ),
  );
  const {
    canReadSoloSnapshotImage,
  } = require('../src/editorial-files/editorial-snapshot-access');
  const f = await soloSnapshotFixture('intentoCima', 12, 'question');
  const plans = [];
  const measuring = {
    $queryRaw: async (query) => {
      const { Prisma } = require('@prisma/client');
      plans.push(
        await db.$queryRaw(
          Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
        ),
      );
      return db.$queryRaw(query);
    },
  };
  assert.equal(
    await canReadSoloSnapshotImage(measuring, f.current.file.id, f.owner.id),
    true,
  );
  assert.equal(plans.length, 1);
  const plan = plans[0][0]['QUERY PLAN'][0];
  assert.ok(Number.isFinite(plan['Execution Time']));
  console.log(
    JSON.stringify({
      phase: 'h2a-snapshot-query-plan',
      executionMs: plan['Execution Time'],
      planningMs: plan['Planning Time'],
    }),
  );
});

async function withTriviaImages(action) {
  const previous = process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED;
  process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    if (previous === undefined)
      delete process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED = previous;
  }
}

async function triviaImageFixture(mode, count = 12) {
  const s = await structure(`Banco H2B1 ${randomUUID()}`);
  // Aislar la selección por área de otros bancos creados por esta suite.
  // Se ejecuta exclusivamente sobre la base temporal propiedad del runner.
  await db.tema.updateMany({
    where: { area: 'LECTURA_CRITICA' },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.tema.update({
    where: { id: s.theme.id },
    data: { area: 'LECTURA_CRITICA' },
  });
  const pictures = [];
  const hidden = await resource();
  const context = await db.casoPregunta.create({
    data: {
      area: 'LECTURA_CRITICA',
      titulo: 'Caso H2B1',
      contexto: 'Texto del caso',
      estadoContenido: 'PUBLICADO',
      imagenUrl: `/recursos/editoriales/${hidden.file.id}`,
      archivoImagenId: hidden.file.id,
    },
  });
  for (let i = 0; i < count; i++) {
    const picture = await resource();
    pictures.push(picture);
    const path = `/recursos/editoriales/${picture.file.id}`;
    await db.pregunta.create({
      data: {
        subtemaId: s.sub.id,
        casoId: context.id,
        ordenEnCaso: i + 1,
        enunciado: `H2B1 pregunta ${i}`,
        explicacion: 'Explicación original',
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        imagenUrl: path,
        archivoImagenId: picture.file.id,
        respuestas: {
          create: Array.from({ length: 4 }, (_, k) => ({
            texto: `Opción ${k}`,
            esCorrecta: k === 0,
            imagenUrl: path,
            archivoImagenId: picture.file.id,
          })),
        },
      },
    });
  }
  const app = await server({ consumers: true });
  const owner = await user('ESTUDIANTE'),
    token = tokenFor(owner);
  const route =
    mode === 'TUG_LOCAL' ? '/tira-local/intentos' : '/trivia-rush/intentos';
  const created = await jsonPost(
    route,
    token,
    mode === 'TUG_LOCAL'
      ? { areas: ['LECTURA_CRITICA'] }
      : {
          areas: ['LECTURA_CRITICA'],
          duracionSegundos: 120,
          ...(mode ? { modalidad: mode } : {}),
        },
    app.base,
  );
  assert.equal(created.status, 201);
  const id = created.data.intento.id;
  const row = await db.intentoTriviaRush.findUniqueOrThrow({ where: { id } });
  const snapshot = row.snapshotLocal ?? row.snapshotInicial;
  const assigned =
    snapshot?.questions ??
    (await db.triviaRushPregunta.findMany({
      where: { intentoId: id },
      orderBy: { orden: 'asc' },
    }));
  const ids = assigned.map((q) => q.preguntaId);
  // Perturbación exclusiva del fixture: sin uso publicado o FK editorial que
  // pueda ocultar un fallo del permiso por snapshot. No es edición productiva.
  await db.tema.update({
    where: { id: s.theme.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.pregunta.updateMany({
    where: { subtemaId: s.sub.id },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  await db.respuesta.updateMany({
    where: { preguntaId: { in: ids } },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  let presence, connection;
  if (row.presenciaVersion === 1) {
    presence = app.app.get(
      require('../src/trivia-rush/trivia-presence.service')
        .TriviaPresenceService,
    );
    connection = randomUUID();
    await presence.connect(owner.id, id, connection);
  }
  const renew = async () => {
    if (presence) await presence.observe(id, connection, 'RENEW');
  };
  return {
    ...s,
    pictures,
    hidden,
    context,
    app,
    owner,
    token,
    row,
    snapshot,
    assigned,
    route: `${route}/${id}`,
    created: created.data,
    renew,
  };
}

for (const mode of ['TRIVIA_RUSH', 'GHOST_DUEL', 'TUG_LOCAL']) {
  test(`C5-H2B1 ${mode}: copia original, pregunta actual/final propia, futura/ajena/caso oculto no`, () =>
    withTriviaImages(async () => {
      const f = await triviaImageFixture(mode);
      const first = f.snapshot.questions[0],
        second = f.snapshot.questions[1];
      const current = first.pregunta.imagenUrl,
        future = second.pregunta.imagenUrl;
      assert.equal((await call(current, f.token)).status, 200);
      assert.equal((await call(future, f.token)).status, 404);
      assert.equal(
        (await call(`/recursos/editoriales/${f.hidden.file.id}`, f.token))
          .status,
        404,
      );
      assert.equal(
        (await call(current, tokenFor(await user('ESTUDIANTE')))).status,
        404,
      );
      assert.equal(
        (await call(current, tokenFor(await user('PROFESOR')))).status,
        404,
      );
      process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'false';
      assert.equal((await call(current, f.token)).status, 404);
      process.env.EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
      const recovered = await call(f.route, f.token, {}, f.app.base);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.data.intento.pregunta.imagenUrl, current);
      assert.equal(
        recovered.data.intento.pregunta.opciones[0].imagenUrl,
        current,
      );
      assert.doesNotMatch(
        JSON.stringify(recovered.data),
        /snapshotLocal|snapshotInicial|esCorrecta|correctAnswerId/,
      );
      const original = f.snapshot;
      await assert.rejects(
        db.intentoTriviaRush.update({
          where: { id: f.row.id },
          data:
            mode === 'TUG_LOCAL'
              ? {
                  snapshotLocal: {
                    ...original,
                    questions: original.questions.slice().reverse(),
                  },
                }
              : {
                  snapshotInicial: {
                    ...original,
                    questions: original.questions.slice().reverse(),
                  },
                },
        }),
      );
      const file = f.pictures.find((p) => current.endsWith(p.file.id));
      assert.equal(
        (
          await call(`${prefix}/${file.file.id}`, file.token, {
            method: 'DELETE',
          })
        ).status,
        409,
      );
      if (mode === 'TUG_LOCAL') {
        assert.equal(f.row.evidenciaVersion, null);
        assert.equal(f.row.presenciaVersion, null);
        assert.equal(f.row.competitiveRulesVersion, null);
        assert.equal(
          (
            await jsonPost(
              `${f.route}/ronda`,
              f.token,
              { preguntaId: first.preguntaId },
              f.app.base,
            )
          ).status,
          201,
        );
      }
      await f.renew();
      const input = {
        preguntaId: first.preguntaId,
        respuestaId: first.pregunta.respuestas.find((r) => r.esCorrecta).id,
        idempotencyKey: randomUUID(),
      };
      const answered = await jsonPost(
        `${f.route}/respuestas`,
        f.token,
        input,
        f.app.base,
      );
      assert.equal(answered.status, 201);
      assert.equal(answered.data.evaluacion.esFinal, true);
      assert.equal((await call(current, f.token)).status, 200);
      assert.equal((await call(future, f.token)).status, 200);
      await f.renew();
      const repeat = await jsonPost(
        `${f.route}/respuestas`,
        f.token,
        input,
        f.app.base,
      );
      assert.equal(repeat.status, 201);
      assert.equal(
        await db.triviaRushRespuesta.count({
          where: { intentoId: f.row.id, esFinal: true },
        }),
        1,
      );
      const abandoned = await jsonPost(
        `${f.route}/abandonar`,
        f.token,
        {},
        f.app.base,
      );
      assert.equal(abandoned.status, 201);
      assert.equal((await call(current, f.token)).status, 200);
      assert.equal((await call(future, f.token)).status, 404);
      const revoked = await jsonPost(
        `${prefix}/${file.file.id}/revocaciones`,
        file.token,
        {
          operacionId: randomUUID(),
          motivo: 'DERECHOS',
          detalle: 'Ensayo H2B1.',
        },
      );
      assert.equal(revoked.status, 201);
      assert.equal((await call(current, f.token)).status, 404);
    }));
}

test('C5-H2B1 segunda oportunidad no abre la siguiente pregunta ni convierte la primera selección en cierre', () =>
  withTriviaImages(async () => {
    const f = await triviaImageFixture('TRIVIA_RUSH');
    const first = f.snapshot.questions[0],
      next = f.snapshot.questions[1].pregunta.imagenUrl;
    const grant = await db.concesionRecompensaJuego.create({
      data: {
        usuarioId: f.owner.id,
        proveedor: 'fixture-local-H2B1',
        referenciaProveedor: randomUUID(),
        expiraEn: new Date(Date.now() + 60000),
      },
    });
    await f.renew();
    const booster = await jsonPost(
      `${f.route}/potenciadores`,
      f.token,
      {
        preguntaId: first.preguntaId,
        potenciador: 'SEGUNDA_OPORTUNIDAD',
        concesionId: grant.id,
        idempotencyKey: randomUUID(),
      },
      f.app.base,
    );
    assert.equal(booster.status, 201);
    await f.renew();
    const incorrect = await jsonPost(
      `${f.route}/respuestas`,
      f.token,
      {
        preguntaId: first.preguntaId,
        respuestaId: first.pregunta.respuestas.find((r) => !r.esCorrecta).id,
        idempotencyKey: randomUUID(),
      },
      f.app.base,
    );
    assert.equal(incorrect.status, 201);
    assert.equal(incorrect.data.evaluacion.esFinal, false);
    assert.equal(incorrect.data.evaluacion.respuestaCorrectaId, null);
    assert.equal((await call(first.pregunta.imagenUrl, f.token)).status, 200);
    assert.equal((await call(next, f.token)).status, 404);
    assert.equal(
      await db.triviaRushRespuesta.count({
        where: { intentoId: f.row.id, esFinal: true },
      }),
      0,
    );
    await jsonPost(`${f.route}/abandonar`, f.token, {}, f.app.base);
    assert.equal((await call(first.pregunta.imagenUrl, f.token)).status, 404);
  }));

test('C5-H2B1 CPU admite cuatro preguntas y no incorpora retrospectivamente copias a partidas antiguas', () =>
  withTriviaImages(async () => {
    const f = await triviaImageFixture('TUG_LOCAL', 4);
    assert.equal(f.snapshot.q, 4);
    const oldOwner = await user('ESTUDIANTE'),
      started = new Date();
    const old = await db.intentoTriviaRush.create({
      data: {
        usuarioId: oldOwner.id,
        modalidad: 'TUG_LOCAL',
        areas: ['LECTURA_CRITICA'],
        duracionBaseSegundos: 600,
        iniciadoEn: started,
        venceEn: new Date(started.getTime() + 600000),
        preguntaActualId: f.assigned[0].preguntaId,
        preguntas: {
          create: f.assigned.map(({ preguntaId, orden, opcionesOrden }) => ({
            preguntaId,
            orden,
            opcionesOrden,
          })),
        },
      },
    });
    assert.equal(old.snapshotLocal, null);
    const question = f.snapshot.questions[0];
    assert.equal(
      (
        await jsonPost(
          `${f.route}/ronda`,
          f.token,
          { preguntaId: question.preguntaId },
          f.app.base,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await jsonPost(
          `${f.route}/respuestas`,
          f.token,
          {
            preguntaId: question.preguntaId,
            respuestaId: question.pregunta.respuestas.find(
              (option) => option.esCorrecta,
            ).id,
            idempotencyKey: randomUUID(),
          },
          f.app.base,
        )
      ).status,
      201,
    );
    const proof = await db.triviaRushRespuesta.findFirstOrThrow({
      where: { intentoId: f.row.id },
    });
    await assert.rejects(
      db.triviaRushRespuesta.update({
        where: { id: proof.id },
        data: { intentoId: old.id },
      }),
    );
    await assert.rejects(
      db.triviaRushRespuesta.update({
        where: { id: proof.id },
        data: { esCorrecta: false },
      }),
    );
    await assert.rejects(
      db.triviaRushRespuesta.delete({ where: { id: proof.id } }),
    );
    assert.equal(
      (
        await call(
          f.snapshot.questions[0].pregunta.imagenUrl,
          tokenFor(oldOwner),
        )
      ).status,
      404,
    );
    await assert.rejects(
      db.intentoTriviaRush.update({
        where: { id: old.id },
        data: { snapshotLocal: f.snapshot },
      }),
    );
  }));

test('C5-H2B1 Trivia legada sin evidencia no reconstruye referencias antiguas', () =>
  withTriviaImages(async () => {
    const f = await triviaImageFixture(undefined);
    assert.equal(f.row.evidenciaVersion, null);
    assert.equal(f.row.snapshotInicial, null);
    assert.equal(f.row.snapshotLocal, null);
    for (const file of f.pictures)
      assert.equal(
        (await call(`/recursos/editoriales/${file.file.id}`, f.token)).status,
        404,
      );
  }));

test('C5-H2B1 índices para las dos copias y plan de consulta por propietario', () =>
  withTriviaImages(async () => {
    const rows =
      await db.$queryRaw`SELECT indexname, indexdef FROM pg_indexes WHERE indexname IN
    ('IntentoTriviaRush_editorial_snapshot_idx','IntentoTriviaRush_editorial_local_snapshot_idx')`;
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => /jsonb_path_ops/.test(r.indexdef)));
    const {
      canReadTriviaSnapshotImage,
    } = require('../src/editorial-files/editorial-trivia-access');
    const f = await triviaImageFixture('TUG_LOCAL', 4),
      plans = [];
    const picture = f.snapshot.questions[0].pregunta.imagenUrl.split('/').pop();
    const measuring = {
      $queryRaw: async (query) => {
        const { Prisma } = require('@prisma/client');
        plans.push(
          await db.$queryRaw(
            Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
          ),
        );
        return db.$queryRaw(query);
      },
    };
    assert.equal(
      await canReadTriviaSnapshotImage(measuring, picture, f.owner.id),
      true,
    );
    const plan = plans[0][0]['QUERY PLAN'][0];
    console.log(
      JSON.stringify({
        phase: 'h2b1-trivia-query-plan',
        executionMs: plan['Execution Time'],
        planningMs: plan['Planning Time'],
      }),
    );
  }));

async function withTugImages(action) {
  const previous = process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED;
  const firstInstance = instances.length;
  process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    // Cada guion crea un consumidor y su testigo Prisma independiente.
    // Cerrarlos aquí evita acumular conexiones hasta el fin de toda la suite.
    for (const instance of instances.splice(firstInstance))
      await instance.close();
    if (previous === undefined)
      delete process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED = previous;
  }
}

async function tugImageFixture() {
  const s = await structure(`Banco H2B2 ${randomUUID()}`);
  await db.tema.updateMany({
    where: { area: 'LECTURA_CRITICA' },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.tema.update({
    where: { id: s.theme.id },
    data: { area: 'LECTURA_CRITICA' },
  });
  const hidden = await resource(),
    optionImage = await resource(),
    pictures = [];
  const context = await db.casoPregunta.create({
    data: {
      area: 'LECTURA_CRITICA',
      titulo: 'Contexto privado de la copia',
      contexto: 'Texto interno',
      estadoContenido: 'PUBLICADO',
      imagenUrl: `/recursos/editoriales/${hidden.file.id}`,
      archivoImagenId: hidden.file.id,
    },
  });
  for (let i = 0; i < 4; i++) {
    const file = await resource();
    pictures.push(file);
    await db.pregunta.create({
      data: {
        subtemaId: s.sub.id,
        casoId: context.id,
        ordenEnCaso: i + 1,
        enunciado: `H2B2 ${i}`,
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        imagenUrl: `/recursos/editoriales/${file.file.id}`,
        archivoImagenId: file.file.id,
        respuestas: {
          create: Array.from({ length: 4 }, (_, k) => ({
            texto: `Respuesta ${k}`,
            esCorrecta: k === 0,
            imagenUrl: `/recursos/editoriales/${optionImage.file.id}`,
            archivoImagenId: optionImage.file.id,
          })),
        },
      },
    });
  }
  const app = await server({ consumers: true });
  const a = await user('ESTUDIANTE'),
    b = await user('ESTUDIANTE');
  const tokenA = tokenFor(a),
    tokenB = tokenFor(b);
  const first = await jsonPost(
    '/tira-afloja/emparejamiento',
    tokenA,
    { area: 'LECTURA_CRITICA' },
    app.base,
  );
  assert.equal(first.status, 201);
  const paired = await jsonPost(
    '/tira-afloja/emparejamiento',
    tokenB,
    { area: 'LECTURA_CRITICA' },
    app.base,
  );
  assert.equal(paired.status, 201);
  assert.equal(paired.data.partida.id, first.data.partida.id);
  const id = first.data.partida.id,
    route = `/tira-afloja/${id}`;
  const presence = app.app.get(
    require('../src/tira-afloja/tira-afloja-presence.service')
      .TiraAflojaPresenceService,
  );
  const connections = [randomUUID(), randomUUID()];
  await presence.connect(a.id, id, connections[0]);
  await presence.connect(b.id, id, connections[1]);
  const renew = async () => {
    for (const connection of connections)
      await presence.observe(id, connection, 'RENEW');
  };
  assert.equal(
    (await jsonPost(`${route}/listo`, tokenA, {}, app.base)).status,
    201,
  );
  assert.equal(
    (await jsonPost(`${route}/listo`, tokenB, {}, app.base)).status,
    201,
  );
  const match = await db.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
  assert.equal(match.evidenciaVersion, 1);
  assert.equal(match.certificacionRVersion, 1);
  const snapshot = match.snapshotInicial;
  // Quitar fuentes publicadas: probar la copia, sin que un permiso vigente o
  // HistorialRespuesta pueda encubrir un fallo del adaptador de Tira online.
  await db.tema.update({
    where: { id: s.theme.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.pregunta.updateMany({
    where: { subtemaId: s.sub.id },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  await db.respuesta.updateMany({
    where: { preguntaId: { in: snapshot.questions.map((q) => q.preguntaId) } },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  await db.casoPregunta.update({
    where: { id: context.id },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  const present = async () => {
    await renew();
    const remaining = match.rondaIniciaEn.getTime() - Date.now() + 60;
    if (remaining > 0)
      await new Promise((resolve) => setTimeout(resolve, remaining));
    await renew();
    assert.equal((await call(route, tokenA, {}, app.base)).status, 200);
    assert.equal(
      await db.tiraAflojaRondaPresentada.count({
        where: { partidaId: id, ronda: 1 },
      }),
      2,
    );
    assert.equal(
      await db.tugRoundVisibility.count({ where: { partidaId: id, ronda: 1 } }),
      1,
    );
  };
  return {
    ...s,
    app,
    a,
    b,
    tokenA,
    tokenB,
    id,
    route,
    match,
    snapshot,
    pictures,
    hidden,
    optionImage,
    renew,
    present,
  };
}

test('C5-H2B2 countdown no autoriza; ronda confirmada permite imágenes propias de ambos jugadores, no futuras ni contexto', () =>
  withTugImages(async () => {
    const f = await tugImageFixture(),
      current = f.snapshot.questions[0].pregunta.imagenUrl,
      future = f.snapshot.questions[1].pregunta.imagenUrl;
    assert.equal((await call(current, f.tokenA)).status, 404);
    await f.present();
    for (const token of [f.tokenA, f.tokenB]) {
      assert.equal((await call(current, token)).status, 200);
      assert.equal(
        (await call(`/recursos/editoriales/${f.optionImage.file.id}`, token))
          .status,
        200,
      );
      assert.equal((await call(future, token)).status, 404);
      assert.equal(
        (await call(`/recursos/editoriales/${f.hidden.file.id}`, token)).status,
        404,
      );
    }
    assert.equal(
      (await call(current, tokenFor(await user('ESTUDIANTE')))).status,
      404,
    );
    assert.equal(
      (await call(current, tokenFor(await user('PROFESOR')))).status,
      404,
    );
    process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'false';
    assert.equal((await call(current, f.tokenA)).status, 404);
    // La retención funciona aunque la lectura esté apagada y la imagen sea futura.
    const file = f.pictures.find((p) => future.endsWith(p.file.id));
    assert.equal(
      (
        await call(`${prefix}/${file.file.id}`, file.token, {
          method: 'DELETE',
        })
      ).status,
      409,
    );
    process.env.EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
    const recovered = await call(f.route, f.tokenB, {}, f.app.base);
    assert.equal(recovered.data.partida.pregunta.imagenUrl, current);
    assert.doesNotMatch(
      JSON.stringify(recovered.data.partida.pregunta),
      /snapshotInicial|esCorrecta|explicacion|contexto|archivoImagenId/,
    );
    await assert.rejects(
      db.tiraAflojaRondaPresentada.updateMany({
        where: { partidaId: f.id },
        data: { preguntaId: f.snapshot.questions[1].preguntaId },
      }),
    );
    await assert.rejects(
      db.partidaTiraAfloja.update({
        where: { id: f.id },
        data: { snapshotInicial: { ...f.snapshot, version: 2 } },
      }),
    );
    assert.equal(
      (await jsonPost(`${f.route}/abandonar`, f.tokenA, {}, f.app.base)).status,
      201,
    );
  }));

test('C5-H2B2 respuestas reales avanzan sin abrir ronda futura; el reintento no duplica evidencia', () =>
  withTugImages(async () => {
    const f = await tugImageFixture();
    await f.present();
    const entry = f.snapshot.questions[0],
      current = entry.pregunta.imagenUrl,
      future = f.snapshot.questions[2].pregunta.imagenUrl;
    const option = entry.pregunta.respuestas.find((r) => r.esCorrecta);
    const input = {
      ronda: 1,
      preguntaId: entry.preguntaId,
      respuestaId: option.id,
      idempotencyKey: randomUUID(),
    };
    await f.renew();
    assert.equal(
      (await jsonPost(`${f.route}/respuestas`, f.tokenA, input, f.app.base))
        .status,
      201,
    );
    assert.equal(
      (await jsonPost(`${f.route}/respuestas`, f.tokenA, input, f.app.base))
        .status,
      201,
    );
    assert.equal(
      (
        await jsonPost(
          `${f.route}/respuestas`,
          f.tokenB,
          { ...input, idempotencyKey: randomUUID() },
          f.app.base,
        )
      ).status,
      201,
    );
    assert.equal(
      await db.tiraAflojaRespuesta.count({
        where: { partidaId: f.id, ronda: 1 },
      }),
      2,
    );
    assert.equal((await call(current, f.tokenA)).status, 200);
    assert.equal((await call(future, f.tokenA)).status, 404);
    await jsonPost(`${f.route}/abandonar`, f.tokenA, {}, f.app.base);
    assert.equal((await call(current, f.tokenA)).status, 200);
    assert.equal((await call(future, f.tokenA)).status, 404);
  }));

test('C5-H2B2 ronda expuesta sin respuesta conserva imagen tras cierre, salvo revocación explícita', () =>
  withTugImages(async () => {
    const f = await tugImageFixture();
    await f.present();
    const path = f.snapshot.questions[0].pregunta.imagenUrl;
    assert.equal(
      (await jsonPost(`${f.route}/abandonar`, f.tokenA, {}, f.app.base)).status,
      201,
    );
    assert.equal(
      await db.tiraAflojaRespuesta.count({ where: { partidaId: f.id } }),
      0,
    );
    assert.equal((await call(path, f.tokenB)).status, 200);
    assert.equal(
      (await call(f.snapshot.questions[1].pregunta.imagenUrl, f.tokenB)).status,
      404,
    );
    const file = f.pictures.find((p) => path.endsWith(p.file.id));
    const revoked = await jsonPost(
      `${prefix}/${file.file.id}/revocaciones`,
      file.token,
      {
        operacionId: randomUUID(),
        motivo: 'SEGURIDAD',
        detalle: 'Ensayo H2B2.',
      },
    );
    assert.equal(revoked.status, 201);
    assert.equal((await call(path, f.tokenA)).status, 404);
    assert.equal((await call(path, f.tokenB)).status, 404);
    assert.equal(
      await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.id } }),
      2,
    );
  }));

test('C5-H2B2 una partida legada sin copia ni presentación no hereda imágenes de otro encuentro', () =>
  withTugImages(async () => {
    const f = await tugImageFixture(),
      a = await user('ESTUDIANTE'),
      b = await user('ESTUDIANTE');
    const legacy = await db.partidaTiraAfloja.create({
      data: {
        jugadorAId: a.id,
        jugadorBId: b.id,
        area: 'LECTURA_CRITICA',
        expiraEn: new Date(Date.now() + 600000),
      },
    });
    assert.equal(legacy.snapshotInicial, null);
    await f.present();
    assert.equal(
      (await call(f.snapshot.questions[0].pregunta.imagenUrl, tokenFor(a)))
        .status,
      404,
    );
    assert.equal(
      (await call(f.snapshot.questions[0].pregunta.imagenUrl, tokenFor(b)))
        .status,
      404,
    );
    await assert.rejects(
      db.partidaTiraAfloja.update({
        where: { id: legacy.id },
        data: { evidenciaVersion: 1, snapshotInicial: f.snapshot },
      }),
    );
    await jsonPost(`${f.route}/abandonar`, f.tokenA, {}, f.app.base);
  }));

test('C5-H2B2 índice GIN y consulta por participante sobre evidencia real', () =>
  withTugImages(async () => {
    const f = await tugImageFixture();
    await f.present();
    const index =
      await db.$queryRaw`SELECT indexdef FROM pg_indexes WHERE indexname='PartidaTiraAfloja_editorial_snapshot_idx'`;
    assert.equal(index.length, 1);
    assert.match(index[0].indexdef, /jsonb_path_ops/);
    const { Prisma } = require('@prisma/client');
    const {
      canReadTugSnapshotImage,
    } = require('../src/editorial-files/editorial-tug-access');
    const plans = [],
      measuring = {
        $queryRaw: async (query) => {
          plans.push(
            await db.$queryRaw(
              Prisma.sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`,
            ),
          );
          return db.$queryRaw(query);
        },
      };
    assert.equal(
      await canReadTugSnapshotImage(
        measuring,
        f.snapshot.questions[0].pregunta.imagenUrl.split('/').pop(),
        f.a.id,
      ),
      true,
    );
    const plan = plans[0][0]['QUERY PLAN'][0];
    console.log(
      JSON.stringify({
        phase: 'h2b2-tug-query-plan',
        executionMs: plan['Execution Time'],
        planningMs: plan['Planning Time'],
      }),
    );
    await jsonPost(`${f.route}/abandonar`, f.tokenA, {}, f.app.base);
  }));

async function withBattleImages(action) {
  const previous = process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED,
    firstInstance = instances.length;
  process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
  try {
    return await action();
  } finally {
    for (const instance of instances.splice(firstInstance))
      await instance.close();
    if (previous === undefined)
      delete process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED;
    else process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED = previous;
  }
}
async function battleImageFixture(mode = 'DUELO_RELAMPAGO', fallback = false) {
  const s = await structure(`Banco H2B3 ${randomUUID()}`);
  await db.tema.updateMany({
    where: { area: 'LECTURA_CRITICA' },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.tema.update({
    where: { id: s.theme.id },
    data: { area: 'LECTURA_CRITICA' },
  });
  const hidden = await resource(),
    pictures = [];
  const context = await db.casoPregunta.create({
    data: {
      area: 'LECTURA_CRITICA',
      titulo: 'Caso original',
      contexto: 'Contexto original H2B3',
      estadoContenido: 'PUBLICADO',
      imagenUrl: `/recursos/editoriales/${hidden.file.id}`,
      archivoImagenId: hidden.file.id,
    },
  });
  for (let i = 0; i < 4; i++) {
    const mainImage = await resource(),
      optionImage = await resource();
    pictures.push(mainImage, optionImage);
    await db.pregunta.create({
      data: {
        subtemaId: s.sub.id,
        casoId: context.id,
        ordenEnCaso: i + 1,
        enunciado: `Pregunta original H2B3 ${i}`,
        explicacion: 'Explicación original H2B3',
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        imagenUrl: fallback
          ? null
          : `/recursos/editoriales/${mainImage.file.id}`,
        archivoImagenId: fallback ? null : mainImage.file.id,
        respuestas: {
          create: Array.from({ length: 4 }, (_, k) => ({
            texto: `Original ${k}`,
            esCorrecta: k === 0,
            explicacion: `Motivo original ${k}`,
            imagenUrl: `/recursos/editoriales/${optionImage.file.id}`,
            archivoImagenId: optionImage.file.id,
          })),
        },
      },
    });
  }
  const app = await server({ consumers: true }),
    a = await user('ESTUDIANTE'),
    b = await user('ESTUDIANTE');
  const tokenA = tokenFor(a),
    tokenB = tokenFor(b);
  const first = await jsonPost(
    '/batallas',
    tokenA,
    { area: 'LECTURA_CRITICA', modo: mode },
    app.base,
  );
  assert.equal(first.status, 201);
  assert.deepEqual(first.data.preguntas, []);
  const paired = await jsonPost(
    '/batallas',
    tokenB,
    { area: 'LECTURA_CRITICA', modo: mode },
    app.base,
  );
  assert.equal(paired.status, 201);
  assert.equal(paired.data.id, first.data.id);
  const id = first.data.id,
    route = `/batallas/${id}`;
  const assigned = await db.batallaPregunta.findMany({
    where: { batallaId: id },
    orderBy: { orden: 'asc' },
  });
  const snapshots = assigned.map((p) => p.snapshotInicial);
  assert.ok(snapshots.every((p) => p.version === 1));
  await db.tema.update({
    where: { id: s.theme.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  await db.pregunta.updateMany({
    where: { subtemaId: s.sub.id },
    data: {
      enunciado: 'Texto cambiado del banco',
      imagenUrl: null,
      archivoImagenId: null,
    },
  });
  await db.respuesta.updateMany({
    where: { preguntaId: { in: assigned.map((p) => p.preguntaId) } },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  await db.casoPregunta.update({
    where: { id: context.id },
    data: {
      contexto: 'Contexto nuevo del banco',
      imagenUrl: null,
      archivoImagenId: null,
    },
  });
  const start = async (token) => {
    const response = await jsonPost(`${route}/iniciar`, token, {}, app.base);
    assert.equal(response.status, 201);
    return response;
  };
  const answer = async (token, position) => {
    const q = snapshots[position];
    return jsonPost(
      `${route}/respuestas`,
      token,
      {
        preguntaId: q.preguntaId,
        respuestaId: q.pregunta.respuestas.find((r) => r.esCorrecta).id,
      },
      app.base,
    );
  };
  return {
    ...s,
    app,
    a,
    b,
    tokenA,
    tokenB,
    id,
    route,
    snapshots,
    assigned,
    hidden,
    pictures,
    start,
    answer,
  };
}

for (const mode of ['DUELO_RELAMPAGO', 'CARRERA_FANTASMA', 'SUPERVIVENCIA']) {
  test(`C5-H2B3 ${mode}: original por jugador y avance propio, sin imágenes futuras ni soluciones`, () =>
    withBattleImages(async () => {
      const f = await battleImageFixture(mode),
        first = f.snapshots[0],
        next = f.snapshots[1];
      const path = first.pregunta.imagenUrl,
        optionPath = first.pregunta.respuestas[0].imagenUrl;
      assert.equal((await call(path, f.tokenA)).status, 404);
      const started = await f.start(f.tokenA);
      assert.equal(
        started.data.preguntas[0].enunciado,
        first.pregunta.enunciado,
      );
      assert.equal(
        started.data.preguntas[0].contexto,
        'Contexto original H2B3',
      );
      assert.doesNotMatch(
        JSON.stringify(started.data.preguntas),
        /snapshotInicial|esCorrecta|respuestaCorrectaId|explicacion|archivoImagenId/,
      );
      assert.equal((await call(path, f.tokenA)).status, 200);
      assert.equal((await call(optionPath, f.tokenA)).status, 200);
      assert.equal((await call(next.pregunta.imagenUrl, f.tokenA)).status, 404);
      assert.equal(
        (await call(next.pregunta.respuestas[0].imagenUrl, f.tokenA)).status,
        404,
      );
      assert.equal((await call(path, f.tokenB)).status, 404);
      assert.equal(
        (await call(path, tokenFor(await user('ESTUDIANTE')))).status,
        404,
      );
      assert.equal(
        (await call(path, tokenFor(await user('PROFESOR')))).status,
        404,
      );
      assert.equal(
        (await call(`/recursos/editoriales/${f.hidden.file.id}`, f.tokenA))
          .status,
        404,
      );
      process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'false';
      assert.equal((await call(path, f.tokenA)).status, 404);
      process.env.EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED = 'true';
      const future = f.pictures.find((p) =>
        next.pregunta.imagenUrl.endsWith(p.file.id),
      );
      assert.equal(
        (
          await call(`${prefix}/${future.file.id}`, future.token, {
            method: 'DELETE',
          })
        ).status,
        409,
      );
      assert.equal((await f.answer(f.tokenA, 0)).status, 201);
      assert.equal((await call(next.pregunta.imagenUrl, f.tokenA)).status, 200);
      assert.equal((await call(next.pregunta.imagenUrl, f.tokenB)).status, 404);
      assert.equal((await f.answer(f.tokenA, 0)).status, 400);
      assert.equal(
        await db.batallaRespuesta.count({
          where: { batallaId: f.id, usuarioId: f.a.id },
        }),
        1,
      );
      await assert.rejects(
        db.batallaPregunta.update({
          where: {
            batallaId_preguntaId: {
              batallaId: f.id,
              preguntaId: first.preguntaId,
            },
          },
          data: { snapshotInicial: { ...first, version: 2 } },
        }),
      );
    }));
}

test('C5-H2B3 corrección e historial H1 usan opciones originales aunque cambien texto, imagen y correcta del banco', () =>
  withBattleImages(async () => {
    const f = await battleImageFixture(),
      q = f.snapshots[0],
      correct = q.pregunta.respuestas.find((r) => r.esCorrecta),
      other = q.pregunta.respuestas.find((r) => !r.esCorrecta);
    const replacement = await resource();
    await db.respuesta.update({
      where: { id: correct.id },
      data: {
        texto: 'Cambiada',
        esCorrecta: false,
        imagenUrl: `/recursos/editoriales/${replacement.file.id}`,
        archivoImagenId: replacement.file.id,
      },
    });
    await db.respuesta.update({
      where: { id: other.id },
      data: { esCorrecta: true },
    });
    await f.start(f.tokenA);
    assert.equal((await f.answer(f.tokenA, 0)).status, 201);
    const proof = await db.batallaRespuesta.findFirstOrThrow({
      where: { batallaId: f.id, usuarioId: f.a.id },
    });
    assert.equal(proof.esCorrecta, true);
    const history = await db.historialRespuesta.findFirstOrThrow({
      where: { sesionId: f.id, usuarioId: f.a.id },
      include: { imagenes: true },
    });
    assert.equal(history.respuestaCorrectaId, correct.id);
    assert.equal(history.imagenes.length, 2);
    assert.ok(
      history.imagenes.every((i) => correct.imagenUrl.endsWith(i.archivoId)),
    );
    const read = await withHistoryImages(() =>
      call('/simulacros/historial-respuestas', f.tokenA, {}, f.app.base),
    );
    assert.equal(read.status, 200);
    const own = read.data.respuestas.find(
      (r) => r.preguntaId === q.preguntaId || r.pregunta?.id === q.preguntaId,
    );
    assert.ok(own);
    assert.equal(own.enunciado, q.pregunta.enunciado);
    assert.equal(own.respuestaSeleccionada.texto, correct.texto);
    assert.equal(own.respuestaSeleccionada.imagenUrl, correct.imagenUrl);
    assert.equal(own.respuestaCorrecta.imagenUrl, correct.imagenUrl);
    await assert.rejects(
      db.batallaRespuesta.update({
        where: { id: proof.id },
        data: { esCorrecta: false },
      }),
    );
    await assert.rejects(
      db.batallaRespuesta.delete({ where: { id: proof.id } }),
    );
    const next = f.snapshots[1],
      wrong = next.pregunta.respuestas.find((r) => !r.esCorrecta);
    await db.respuesta.update({
      where: { id: wrong.id },
      data: {
        texto: 'Otra versión del banco',
        imagenUrl: `/recursos/editoriales/${replacement.file.id}`,
        archivoImagenId: replacement.file.id,
      },
    });
    assert.equal(
      (
        await jsonPost(
          `${f.route}/respuestas`,
          f.tokenA,
          { preguntaId: next.preguntaId, respuestaId: wrong.id },
          f.app.base,
        )
      ).status,
      201,
    );
    const notebook = await withHistoryImages(() =>
      call('/cuaderno-errores', f.tokenA, {}, f.app.base),
    );
    assert.equal(notebook.status, 200);
    const error = notebook.data.errores.find(
      (r) => r.preguntaId === next.preguntaId,
    );
    assert.ok(error);
    assert.equal(error.enunciado, next.pregunta.enunciado);
    assert.equal(error.respuestaSeleccionada.texto, wrong.texto);
    assert.equal(error.respuestaSeleccionada.imagenUrl, wrong.imagenUrl);
  }));

test('C5-H2B3 cierre completo conserva imágenes originales y revocación prevalece sin cambiar resultados', () =>
  withBattleImages(async () => {
    const f = await battleImageFixture();
    await f.start(f.tokenA);
    await f.start(f.tokenB);
    for (const token of [f.tokenA, f.tokenB])
      for (let i = 0; i < f.snapshots.length; i++)
        assert.equal((await f.answer(token, i)).status, 201);
    const state = await db.batalla.findUniqueOrThrow({ where: { id: f.id } });
    assert.equal(state.estado, 'FINALIZADA');
    const read = await call(f.route, f.tokenA, {}, f.app.base);
    assert.equal(read.status, 200);
    assert.equal(
      read.data.preguntas[0].respuestaCorrectaId,
      f.snapshots[0].pregunta.respuestas.find((r) => r.esCorrecta).id,
    );
    const path = f.snapshots[0].pregunta.imagenUrl,
      file = f.pictures.find((p) => path.endsWith(p.file.id));
    assert.equal((await call(path, f.tokenA)).status, 200);
    assert.equal(
      (
        await jsonPost(`${prefix}/${file.file.id}/revocaciones`, file.token, {
          operacionId: randomUUID(),
          motivo: 'DERECHOS',
          detalle: 'Ensayo H2B3.',
        })
      ).status,
      201,
    );
    assert.equal((await call(path, f.tokenA)).status, 404);
    assert.equal((await call(path, f.tokenB)).status, 404);
    assert.equal(
      await db.batallaRespuesta.count({ where: { batallaId: f.id } }),
      8,
    );
  }));

test('C5-H2B3 fallback del caso se conserva y legado sin copia no se rellena después', () =>
  withBattleImages(async () => {
    const f = await battleImageFixture('DUELO_RELAMPAGO', true),
      path = `/recursos/editoriales/${f.hidden.file.id}`;
    const started = await f.start(f.tokenA);
    assert.equal(started.data.preguntas[0].imagenUrl, path);
    assert.equal((await call(path, f.tokenA)).status, 200);
    assert.equal((await call(path, f.tokenB)).status, 404);
    const owner = await user('ESTUDIANTE');
    const legacy = await db.batalla.create({
      data: {
        modo: 'DUELO_RELAMPAGO',
        retadorId: owner.id,
        expiraEn: new Date(Date.now() + 600000),
        participantes: { create: { usuarioId: owner.id } },
        preguntas: {
          create: {
            preguntaId: f.assigned[0].preguntaId,
            orden: 0,
            opcionesOrden: f.assigned[0].opcionesOrden,
          },
        },
      },
    });
    assert.equal((await call(path, tokenFor(owner))).status, 404);
    await assert.rejects(
      db.batallaPregunta.update({
        where: {
          batallaId_preguntaId: {
            batallaId: legacy.id,
            preguntaId: f.assigned[0].preguntaId,
          },
        },
        data: { snapshotInicial: f.snapshots[0] },
      }),
    );
    const index =
      await db.$queryRaw`SELECT indexdef FROM pg_indexes WHERE indexname='BatallaPregunta_editorial_snapshot_idx'`;
    assert.equal(index.length, 1);
    assert.match(index[0].indexdef, /jsonb_path_ops/);
  }));

test('C5-H2B3 copia/participantes/respuestas privados: ACL y RLS impiden lectura o fabricación por PostgREST', async () => {
  const tables = [
    'Batalla',
    'BatallaPregunta',
    'BatallaParticipante',
    'BatallaRespuesta',
  ];
  for (const table of tables) {
    const qualified = `"${table}"`;
    const [acl] = await db.$queryRaw`SELECT relrowsecurity AS rls,
      has_table_privilege('anon',${qualified},'SELECT,INSERT,UPDATE,DELETE') AS anon,
      has_table_privilege('authenticated',${qualified},'SELECT,INSERT,UPDATE,DELETE') AS authenticated
      FROM pg_class WHERE oid=${qualified}::regclass`;
    assert.deepEqual(acl, { rls: true, anon: false, authenticated: false });
    for (const role of ['anon', 'authenticated'])
      await assert.rejects(
        db.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
          await tx.$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`);
        }),
        sqlState('42501'),
      );
  }
});

async function withAllHistoricalImages(action) {
  const keys = [
    'EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED',
    'EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED',
    'EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED',
    'EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED',
    'EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED',
  ];
  const previous = keys.map((key) => process.env[key]);
  for (const key of keys) process.env[key] = 'true';
  try {
    return await action();
  } finally {
    keys.forEach((key, index) => {
      if (previous[index] === undefined) delete process.env[key];
      else process.env[key] = previous[index];
    });
  }
}

test('C5-H2B4 progreso 100% no acredita una imagen de lección archivada, reemplazada o revocada', () =>
  withAllHistoricalImages(async () => {
    const s = await structure(),
      first = await resource(),
      second = await resource(),
      owner = await user('ESTUDIANTE'),
      token = tokenFor(owner);
    const firstPath = `/recursos/editoriales/${first.file.id}`,
      secondPath = `/recursos/editoriales/${second.file.id}`;
    await db.subtema.update({
      where: { id: s.sub.id },
      data: {
        imagenUrl: firstPath,
        archivoImagenId: first.file.id,
        contenido: 'Lección actual',
      },
    });
    await db.progresoTema.create({
      data: {
        usuarioId: owner.id,
        subtemaId: s.sub.id,
        completado: true,
        porcentaje: 100,
      },
    });
    assert.equal((await call(firstPath, token)).status, 200);
    await db.tema.update({
      where: { id: s.theme.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(firstPath, token)).status, 404);
    await db.tema.update({
      where: { id: s.theme.id },
      data: { estadoContenido: 'PUBLICADO' },
    });
    await db.subtema.update({
      where: { id: s.sub.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(firstPath, token)).status, 404);
    assert.equal(
      (
        await call(`${prefix}/${first.file.id}`, first.token, {
          method: 'DELETE',
        })
      ).status,
      409,
    );
    // Perturbación del fixture, no autorización para editar lecciones con progreso.
    await db.subtema.update({
      where: { id: s.sub.id },
      data: { imagenUrl: secondPath, archivoImagenId: second.file.id },
    });
    assert.equal((await call(firstPath, token)).status, 404);
    assert.equal((await call(secondPath, token)).status, 404);
    await db.subtema.update({
      where: { id: s.sub.id },
      data: { estadoContenido: 'PUBLICADO' },
    });
    assert.equal((await call(secondPath, token)).status, 200);
    assert.equal((await call(firstPath, token)).status, 404);
    assert.equal(
      (
        await jsonPost(
          `${prefix}/${second.file.id}/revocaciones`,
          second.token,
          {
            operacionId: randomUUID(),
            motivo: 'DERECHOS',
            detalle: 'Ensayo H2B4.',
          },
        )
      ).status,
      201,
    );
    assert.equal((await call(secondPath, token)).status, 404);
    const progress = await db.progresoTema.findUniqueOrThrow({
      where: {
        usuarioId_subtemaId: { usuarioId: owner.id, subtemaId: s.sub.id },
      },
    });
    assert.equal(progress.porcentaje, 100);
    assert.equal(progress.completado, true);
  }));

test('C5-H2B4 historial propio e IDs de intento no prueban la versión de un caso mutable', () =>
  withAllHistoricalImages(async () => {
    const f = await optionFixture(),
      first = await resource(),
      second = await resource(),
      owner = await user('ESTUDIANTE'),
      token = tokenFor(owner);
    const path = `/recursos/editoriales/${first.file.id}`,
      replacement = `/recursos/editoriales/${second.file.id}`;
    const context = await db.casoPregunta.create({
      data: {
        area: 'MATEMATICAS',
        titulo: 'Caso mutable H2B4',
        contexto: 'Versión inicial',
        estadoContenido: 'PUBLICADO',
        imagenUrl: path,
        archivoImagenId: first.file.id,
      },
    });
    await db.pregunta.update({
      where: { id: f.question.id },
      data: { casoId: context.id, ordenEnCaso: 1 },
    });
    const correct = f.question.respuestas.find((r) => r.esCorrecta),
      selected = f.question.respuestas.find((r) => !r.esCorrecta);
    const history = await db.historialRespuesta.create({
      data: {
        usuarioId: owner.id,
        sesionId: randomUUID(),
        preguntaId: f.question.id,
        respuestaSeleccionadaId: selected.id,
        respuestaCorrectaId: correct.id,
        esCorrecta: false,
        origen: 'PRACTICA',
        area: 'MATEMATICAS',
      },
    });
    assert.equal(
      await db.imagenHistorialRespuesta.count({
        where: { historialId: history.id },
      }),
      0,
    );
    await db.intentoSimulacro.create({
      data: {
        usuarioId: owner.id,
        origen: 'PRACTICA',
        area: 'MATEMATICAS',
        preguntaIds: [f.question.id],
        expira: new Date(Date.now() + 60000),
      },
    });
    assert.equal((await call(path, token)).status, 200);
    await db.casoPregunta.update({
      where: { id: context.id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(path, token)).status, 404);
    assert.equal(
      (
        await call(`${prefix}/${first.file.id}`, first.token, {
          method: 'DELETE',
        })
      ).status,
      409,
    );
    // Simular el cambio en la misma fila que un ID estable no puede versionar.
    await db.casoPregunta.update({
      where: { id: context.id },
      data: {
        imagenUrl: replacement,
        archivoImagenId: second.file.id,
        contexto: 'Versión posterior',
      },
    });
    assert.equal((await call(path, token)).status, 404);
    assert.equal((await call(replacement, token)).status, 404);
    await db.casoPregunta.update({
      where: { id: context.id },
      data: { estadoContenido: 'PUBLICADO' },
    });
    for (const [table, id] of [
      ['tema', f.theme.id],
      ['subtema', f.sub.id],
      ['pregunta', f.question.id],
    ]) {
      await db[table].update({
        where: { id },
        data: { estadoContenido: 'ARCHIVADO' },
      });
      assert.equal((await call(replacement, token)).status, 404);
      await db[table].update({
        where: { id },
        data: { estadoContenido: 'PUBLICADO' },
      });
    }
    assert.equal((await call(replacement, token)).status, 200);
    assert.equal((await call(path, token)).status, 404);
    assert.equal(
      await db.historialRespuesta.count({
        where: { id: history.id, usuarioId: owner.id },
      }),
      1,
    );
  }));

test('C5-H2B4 notas, Markdown, contexto e IDs JSON declarados no conceden acceso ni revelan metadatos privados', () =>
  withAllHistoricalImages(async () => {
    const f = await optionFixture(),
      file = await resource(),
      owner = await user('ESTUDIANTE'),
      token = tokenFor(owner),
      path = `/recursos/editoriales/${file.file.id}`;
    await db.progresoTema.create({
      data: {
        usuarioId: owner.id,
        subtemaId: f.sub.id,
        completado: true,
        porcentaje: 100,
      },
    });
    await db.subtema.update({
      where: { id: f.sub.id },
      data: { contenido: `Texto ![referencia](${path})` },
    });
    const context = await db.casoPregunta.create({
      data: {
        area: 'MATEMATICAS',
        contexto: `Imagen declarada ${path}`,
        estadoContenido: 'PUBLICADO',
      },
    });
    await db.pregunta.update({
      where: { id: f.question.id },
      data: { casoId: context.id, ordenEnCaso: 1 },
    });
    await db.cuadernoError.create({
      data: { usuarioId: owner.id, preguntaId: f.question.id, nota: path },
    });
    await db.intentoSimulacro.create({
      data: {
        usuarioId: owner.id,
        origen: 'PRACTICA',
        preguntaIds: [f.question.id, { imagenUrl: path }],
        expira: new Date(Date.now() + 60000),
      },
    });
    const denied = await call(path, token),
      unknown = await call(`/recursos/editoriales/${randomUUID()}`, token);
    assert.equal(denied.status, 404);
    assert.equal(unknown.status, 404);
    assert.equal(denied.data.message, unknown.data.message);
    assert.doesNotMatch(
      JSON.stringify(denied.data),
      /sha256|titular|archivoImagenId|rutaRelativa/,
    );
  }));

test('C5-H2B4 una prueba H1 exacta prevalece sobre la ausencia de publicación de la lección compartida', () =>
  withAllHistoricalImages(async () => {
    const f = await historyImageFixture();
    const token = tokenFor(f.student);
    await db.subtema.update({
      where: { id: f.sub.id },
      data: {
        imagenUrl: f.path,
        archivoImagenId: f.file.id,
        estadoContenido: 'ARCHIVADO',
      },
    });
    await db.progresoTema.create({
      data: {
        usuarioId: f.student.id,
        subtemaId: f.sub.id,
        completado: true,
        porcentaje: 100,
      },
    });
    assert.equal((await call(f.path, token)).status, 200);
    assert.equal(
      (await call(f.path, tokenFor(await user('ESTUDIANTE')))).status,
      404,
    );
    process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = 'false';
    assert.equal((await call(f.path, token)).status, 404);
    process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = 'true';
    assert.equal((await call(f.path, token)).status, 200);
  }));

test('C5-H2B4 filas legadas de juegos retirados no activan un adaptador histórico por contener una ruta', () =>
  withAllHistoricalImages(async () => {
    const file = await resource(),
      owner = await user('ESTUDIANTE'),
      path = `/recursos/editoriales/${file.file.id}`;
    // Solo fila hostil de ensayo en una tabla legada; no se crea API ni módulo.
    await db.intentoEscudoConocimiento.create({
      data: {
        usuarioId: owner.id,
        area: 'MATEMATICAS',
        preguntas: Array.from({ length: 12 }, () => ({
          question: { id: randomUUID(), imagenUrl: path },
        })),
        venceEn: new Date(Date.now() + 60000),
      },
    });
    assert.equal((await call(path, tokenFor(owner))).status, 404);
  }));

test('C5-C2-A migración aditiva: texto, nulabilidad, FK y par ruta/identificador', async () => {
  const f = await optionFixture();
  const option = f.question.respuestas[0];
  assert.equal(option.imagenUrl, null);
  assert.equal(option.archivoImagenId, null);
  assert.ok(option.texto);
  const missing = randomUUID();
  await assert.rejects(
    db.respuesta.update({
      where: { id: option.id },
      data: {
        imagenUrl: `/recursos/editoriales/${missing}`,
        archivoImagenId: missing,
      },
    }),
    (error) => error.code === 'P2003',
  );
  await assert.rejects(
    db.respuesta.update({
      where: { id: option.id },
      data: {
        imagenUrl: `/recursos/editoriales/${randomUUID()}`,
        archivoImagenId: randomUUID(),
      },
    }),
  );
  for (const data of [
    { imagenUrl: f.path },
    { archivoImagenId: f.file.id },
    { imagenUrl: 'javascript:alert(1)' },
    { imagenUrl: 'https://example.invalid/a.png', archivoImagenId: f.file.id },
  ]) {
    await assert.rejects(
      db.respuesta.update({ where: { id: option.id }, data }),
    );
  }
  await attachOption(f);
  await assert.rejects(
    db.archivoEditorial.delete({ where: { id: f.file.id } }),
  );
  await assert.rejects(
    db.$executeRaw`UPDATE "Respuesta" SET texto = NULL WHERE id = ${option.id}`,
    sqlState('23502'),
  );
  assert.equal(
    (await db.respuesta.findUniqueOrThrow({ where: { id: option.id } })).texto,
    option.texto,
  );
});

test('C5-C2-A imagen de opción: bytes privados y mismo acceso para correcta e incorrecta', async () => {
  for (const index of [0, 1]) {
    const f = await optionFixture();
    const student = tokenFor(await user('ESTUDIANTE'));
    assert.equal((await call(f.path, student)).status, 404);
    await attachOption(f, index);
    const response = await call(f.path, student);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.ok(Buffer.isBuffer(response.data));
    assert.equal(response.data.length, f.file.bytes);
    assert.equal((await call(f.path)).status, 401);
    assert.equal(
      (await call(`/admin/archivos/${f.file.id}`, student)).status,
      403,
    );
  }
});

test('C5-C2-A archivar pregunta o cualquiera de sus padres revoca la lectura de la opción', async () => {
  const f = await optionFixture();
  await attachOption(f);
  const student = tokenFor(await user('ESTUDIANTE'));
  for (const [table, id] of [
    [db.pregunta, f.question.id],
    [db.subtema, f.sub.id],
    [db.tema, f.theme.id],
  ]) {
    await table.update({
      where: { id },
      data: { estadoContenido: 'ARCHIVADO' },
    });
    assert.equal((await call(f.path, student)).status, 404);
    await table.update({
      where: { id },
      data: { estadoContenido: 'PUBLICADO' },
    });
    assert.equal((await call(f.path, student)).status, 200);
  }
});

test('C5-C2-A retirada protege también respuestas de versiones archivadas; desvincular no borra bytes', async () => {
  const f = await optionFixture();
  const option = await attachOption(f);
  await db.pregunta.update({
    where: { id: f.question.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  assert.equal(
    (await call(`${prefix}/${f.file.id}`, f.token, { method: 'DELETE' }))
      .status,
    409,
  );
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 200);
  await db.respuesta.update({
    where: { id: option.id },
    data: { imagenUrl: null, archivoImagenId: null },
  });
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 200);
  assert.equal(
    (await call(`${prefix}/${f.file.id}`, f.token, { method: 'DELETE' }))
      .status,
    200,
  );
  assert.equal((await call(f.file.contenidoUrl, f.token)).status, 404);
});

test('C5-C2-A un lote inválido revierte todas las opciones dentro de la transacción', async () => {
  const f = await optionFixture();
  await assert.rejects(
    db.$transaction(async (tx) => {
      const [image] = await editorialImagesData(tx, [f.path]);
      await tx.respuesta.update({
        where: { id: f.question.respuestas[0].id },
        data: image,
      });
      await editorialImagesData(tx, [`/recursos/editoriales/${randomUUID()}`]);
    }),
  );
  assert.equal(
    await db.respuesta.count({
      where: { preguntaId: f.question.id, archivoImagenId: { not: null } },
    }),
    0,
  );
});

test('C5-C2-A asociación y retirada concurrentes no confirman una referencia a un archivo retirado', async () => {
  const f = await optionFixture();
  const outcomes = await Promise.allSettled([
    attachOption(f),
    call(`${prefix}/${f.file.id}`, f.token, { method: 'DELETE' }),
  ]);
  const file = await db.archivoEditorial.findUniqueOrThrow({
    where: { id: f.file.id },
  });
  const option = await db.respuesta.findUniqueOrThrow({
    where: { id: f.question.respuestas[0].id },
  });
  const removal = outcomes[1];
  assert.equal(removal.status, 'fulfilled');
  if (file.estado === 'RETIRADO') {
    assert.equal(outcomes[0].status, 'rejected');
    assert.equal(option.archivoImagenId, null);
    assert.equal(removal.value.status, 200);
  } else {
    assert.equal(outcomes[0].status, 'fulfilled');
    assert.equal(option.archivoImagenId, f.file.id);
    assert.equal(removal.value.status, 409);
  }
});

test('C5-C2-A lotes simultáneos con archivos en orden inverso terminan sin interbloqueo', async () => {
  const first = await optionFixture(),
    second = await optionFixture();
  const paths = [first.path, second.path];
  const save = (f, values) =>
    db.$transaction(
      async (tx) => {
        const images = await editorialImagesData(tx, values);
        for (let i = 0; i < images.length; i++) {
          await tx.respuesta.update({
            where: { id: f.question.respuestas[i].id },
            data: images[i],
          });
        }
      },
      { timeout: 10000 },
    );
  await Promise.all([save(first, paths), save(second, [...paths].reverse())]);
  for (const [f, expected] of [
    [first, paths],
    [second, [...paths].reverse()],
  ]) {
    const options = await db.respuesta.findMany({
      where: { preguntaId: f.question.id },
      orderBy: { texto: 'asc' },
    });
    assert.deepEqual(
      options.map((option) => option.imagenUrl),
      expected,
    );
  }
});

test('C5-C2 editor con activación apagada rechaza imágenes por opción sin guardar parcialmente', async () => {
  const f = await panelFixture(),
    s = await structure();
  const body = questionBody(s.sub, '');
  body.respuestas[0].imagenUrl = 'https://example.invalid/opcion.png';
  const result = await call(
    '/admin/simple/editor/preguntas',
    f.token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    f.app.base,
  );
  assert.equal(result.status, 503);
  assert.equal(await db.pregunta.count({ where: { subtemaId: s.sub.id } }), 0);
});

test('C5-B cliente real del panel inicia sesión, carga y asocia a lección, caso y pregunta', async () => {
  const f = await panelFixture(),
    s = await structure();
  const operation = randomUUID();
  const file = await f.api.uploadEditorialFile(
    new Blob([image], { type: 'image/png' }),
    fields(),
    operation,
  );
  const path = `/recursos/editoriales/${file.id}`;
  assert.equal((await f.api.editorialFileContent(file.id)).type, 'image/webp');
  const student = await user('ESTUDIANTE');
  assert.equal((await call(path, tokenFor(student))).status, 404);
  const lesson = await f.api.editor('subtemas', s.sub.id, s.theme.id);
  const saved = await f.api.editor('subtemas', s.sub.id, s.theme.id, {
    revision: lesson.revision,
    contenido: 'Lección con gráfico',
    videoUrl: '',
    imagenUrl: path,
  });
  assert.equal(saved.estadoContenido, 'PUBLICADO');
  assert.equal(
    (await db.subtema.findUniqueOrThrow({ where: { id: s.sub.id } }))
      .archivoImagenId,
    file.id,
  );
  const c = await f.api.bankRecord('casos', 'MATEMATICAS', undefined, {
    area: 'MATEMATICAS',
    titulo: 'Caso ilustrado',
    contexto: 'Compara los sectores.',
    imagenUrl: path,
  });
  const q = await f.api.bankRecord(
    'preguntas',
    s.sub.id,
    undefined,
    questionBody(s.sub, path, { casoId: c.id, ordenEnCaso: 1 }),
  );
  assert.equal(q.estadoContenido, 'PUBLICADO');
  assert.equal(
    (await db.pregunta.findUniqueOrThrow({ where: { id: q.id } }))
      .archivoImagenId,
    file.id,
  );
  assert.equal(
    (await db.casoPregunta.findUniqueOrThrow({ where: { id: c.id } }))
      .archivoImagenId,
    file.id,
  );
  assert.equal((await call(path, tokenFor(student))).status, 200);
  assert.equal(
    (await call(`/admin/archivos/${file.id}`, f.token, { method: 'DELETE' }))
      .status,
    409,
  );
});

test('C5-B recurso inexistente o retirado no se asocia ni publica una pregunta', async () => {
  const f = await panelFixture(),
    s = await structure();
  const before = await db.pregunta.count({ where: { subtemaId: s.sub.id } });
  await assert.rejects(
    f.api.bankRecord(
      'preguntas',
      s.sub.id,
      undefined,
      questionBody(s.sub, `/recursos/editoriales/${randomUUID()}`),
    ),
    (e) => e.status === 409,
  );
  const file = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  assert.equal(
    (await call(`/admin/archivos/${file.id}`, f.token, { method: 'DELETE' }))
      .status,
    200,
  );
  await assert.rejects(
    f.api.bankRecord(
      'preguntas',
      s.sub.id,
      undefined,
      questionBody(s.sub, `/recursos/editoriales/${file.id}`),
    ),
    (e) => e.status === 409,
  );
  assert.equal(
    await db.pregunta.count({ where: { subtemaId: s.sub.id } }),
    before,
  );
});

test('C5-B edición directa crea versión nueva y conserva imagen de la pregunta archivada', async () => {
  const f = await panelFixture(),
    s = await structure();
  const a = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const b = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const body = questionBody(s.sub, `/recursos/editoriales/${a.id}`);
  const original = await f.api.bankRecord(
    'preguntas',
    s.sub.id,
    undefined,
    body,
  );
  const revised = await f.api.bankRecord('preguntas', s.sub.id, original.id, {
    ...body,
    enunciado: 'Versión revisada ' + randomUUID(),
    imagenUrl: `/recursos/editoriales/${b.id}`,
    revision: original.revision,
  });
  assert.notEqual(revised.id, original.id);
  const old = await db.pregunta.findUniqueOrThrow({
    where: { id: original.id },
    include: { respuestas: true },
  });
  assert.equal(old.estadoContenido, 'ARCHIVADO');
  assert.equal(old.archivoImagenId, a.id);
  assert.equal(old.respuestas.length, 2);
  assert.equal(
    (await call(`/admin/archivos/${a.id}`, f.token, { method: 'DELETE' }))
      .status,
    409,
  );
  assert.equal(
    (await db.pregunta.findUniqueOrThrow({ where: { id: revised.id } }))
      .archivoImagenId,
    b.id,
  );
});

test('C5-B quitar la imagen de una lección limpia FK y permite retirar el recurso sin usos', async () => {
  const f = await panelFixture(),
    s = await structure();
  const file = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const first = await f.api.editor('subtemas', s.sub.id, s.theme.id);
  const saved = await f.api.editor('subtemas', s.sub.id, s.theme.id, {
    revision: first.revision,
    contenido: 'Texto que se conserva',
    videoUrl: '',
    imagenUrl: `/recursos/editoriales/${file.id}`,
  });
  await f.api.editor('subtemas', s.sub.id, s.theme.id, {
    revision: saved.revision,
    contenido: saved.contenido,
    videoUrl: '',
    imagenUrl: '',
  });
  const row = await db.subtema.findUniqueOrThrow({ where: { id: s.sub.id } });
  assert.equal(row.archivoImagenId, null);
  assert.equal(row.imagenUrl, null);
  assert.equal(row.contenido, 'Texto que se conserva');
  assert.equal(
    (await call(`/admin/archivos/${file.id}`, f.token, { method: 'DELETE' }))
      .status,
    200,
  );
});

test('C5-B una revisión obsoleta no reemplaza la asociación actual', async () => {
  const f = await panelFixture(),
    s = await structure();
  const a = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const b = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const first = await f.api.editor('subtemas', s.sub.id, s.theme.id);
  await f.api.editor('subtemas', s.sub.id, s.theme.id, {
    revision: first.revision,
    contenido: 'Primera edición',
    videoUrl: '',
    imagenUrl: `/recursos/editoriales/${a.id}`,
  });
  await assert.rejects(
    f.api.editor('subtemas', s.sub.id, s.theme.id, {
      revision: first.revision,
      contenido: 'Intento obsoleto',
      videoUrl: '',
      imagenUrl: `/recursos/editoriales/${b.id}`,
    }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await db.subtema.findUniqueOrThrow({ where: { id: s.sub.id } }))
      .archivoImagenId,
    a.id,
  );
});

test('C5-B publicación y retirada simultáneas no dejan enlaces a una imagen retirada', async () => {
  const f = await panelFixture(),
    s = await structure();
  for (let i = 0; i < 3; i++) {
    const file = await f.api.uploadEditorialFile(
      new Blob([image]),
      fields(),
      randomUUID(),
    );
    const body = questionBody(s.sub, `/recursos/editoriales/${file.id}`);
    const [save, retire] = await Promise.allSettled([
      f.api.bankRecord('preguntas', s.sub.id, undefined, body),
      call(`/admin/archivos/${file.id}`, f.token, { method: 'DELETE' }),
    ]);
    const row = await db.archivoEditorial.findUniqueOrThrow({
      where: { id: file.id },
    });
    const count = await db.pregunta.count({
      where: { archivoImagenId: file.id },
    });
    assert.ok(
      (row.estado === 'DISPONIBLE' && count === 1) ||
        (row.estado === 'RETIRADO' && count === 0),
    );
    if (save.status === 'fulfilled') {
      assert.equal(retire.status, 'fulfilled');
      assert.equal(retire.value.status, 409);
    } else {
      assert.equal(save.reason.status, 409);
      assert.equal(retire.value.status, 200);
    }
  }
});

test('C5-B lectura estudiantil exige publicación de todos los padres y no expone metadatos', async () => {
  const f = await panelFixture(),
    s = await structure();
  const file = await f.api.uploadEditorialFile(
    new Blob([image]),
    fields(),
    randomUUID(),
  );
  const path = `/recursos/editoriales/${file.id}`,
    student = await user('ESTUDIANTE'),
    token = tokenFor(student);
  assert.equal((await call(path, token)).status, 404);
  await f.api.bankRecord(
    'preguntas',
    s.sub.id,
    undefined,
    questionBody(s.sub, path),
  );
  assert.equal((await call(path, token)).status, 200);
  assert.equal((await call(path)).status, 401);
  await db.tema.update({
    where: { id: s.theme.id },
    data: { estadoContenido: 'ARCHIVADO' },
  });
  assert.equal((await call(path, token)).status, 404);
  await db.tema.update({
    where: { id: s.theme.id },
    data: { estadoContenido: 'PUBLICADO' },
  });
  await db.subtema.update({
    where: { id: s.sub.id },
    data: { estadoContenido: 'BORRADOR' },
  });
  assert.equal((await call(path, token)).status, 404);
});

test('C5-B/C2-B/H3 panel Chromium: carga, publicación, recarga y revocación con respuesta perdida', async (t) =>
  withOptionImages(async () => {
    let executable;
    for (const candidate of [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      '/usr/bin/chromium',
      '/usr/bin/google-chrome',
    ]) {
      try {
        await access(candidate);
        executable = candidate;
        break;
      } catch {
        /* No descargar navegadores. */
      }
    }
    if (!executable) {
      t.skip('No hay Chromium instalado; recorrido visual pendiente.');
      return;
    }
    const f = await panelFixture(),
      s = await structure('AAA C5 navegador ' + randomUUID());
    const { createAdminServer } = await import('../../admin/server.mjs');
    const panel = createAdminServer({ apiBase: f.app.base });
    await new Promise((ok) => panel.listen(0, '127.0.0.1', ok));
    const origin = `http://127.0.0.1:${panel.address().port}`;
    const fixture = join(dirname(root), 'imagen.png');
    await writeFile(fixture, image);
    const puppeteer = require('puppeteer');
    let browser;
    const runtimeErrors = [];
    try {
      browser = await puppeteer.launch({
        executablePath: executable,
        headless: true,
        userDataDir: join(dirname(root), 'browser-profile'),
        args: [
          '--no-first-run',
          '--disable-background-networking',
          '--disable-sync',
        ],
      });
      const page = await browser.newPage();
      page.on('pageerror', (error) => runtimeErrors.push(error.message));
      await page.setViewport({
        width: 1280,
        height: 1000,
        deviceScaleFactor: 1,
      });
      await page.goto(origin, { waitUntil: 'networkidle0' });
      await page.type('#email', f.admin.correo);
      await page.type('#password', f.password);
      await page.click('#login-submit');
      await page.waitForSelector('#select-area option[value="MATEMATICAS"]');
      await page.click('#section-questions');
      await page.select('#select-area', 'MATEMATICAS');
      await page.waitForSelector(`#select-theme option[value="${s.theme.id}"]`);
      await page.select('#select-theme', s.theme.id);
      await page.waitForSelector(`#select-sub option[value="${s.sub.id}"]`);
      await page.select('#select-sub', s.sub.id);
      await page.waitForFunction(
        () =>
          !document.querySelector('#bank-text').disabled &&
          !document.querySelector('#bank-form').hidden,
      );
      await page.type('#bank-text', 'Pregunta del navegador ' + randomUUID());
      await page.type(
        '#bank-explanation',
        'La respuesta se obtiene sumando dos unidades.',
      );
      const choices = await page.$$('#bank-options .answer-text textarea');
      for (let i = 0; i < choices.length; i++)
        await choices[i].type(String(i + 2));
      await page.click('#bank-options input[type="radio"]');
      await (await page.$('#bank-image-upload-file')).uploadFile(fixture);
      await page.waitForFunction(
        () => !document.querySelector('#bank-image-upload fieldset').hidden,
      );
      for (const [key, value] of Object.entries({
        titulo: 'Fracciones para el ensayo',
        textoAlternativo: 'Rectángulo azul de proporción dos a uno',
        fuente: 'Creación propia del ensayo',
        titular: 'Equipo de ensayo C5',
      }))
        await page.type(`#bank-image-upload-${key}`, value);
      await page.waitForFunction(
        () => document.querySelector('#bank-image-upload img').naturalWidth > 0,
      );
      const screenshot = async (name) => {
        await (
          await page.$('#bank-image-upload')
        ).screenshot({ path: join(process.env.EDITORIAL_FILES_QA_DIR, name) });
      };
      await screenshot('c5b-desktop-antes.png');
      await page.click(
        '#bank-image-upload .editorial-image-actions button:first-child',
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector('#bank-image')
            .value.startsWith('/recursos/editoriales/') &&
          !document.querySelector('#bank-save').disabled,
      );
      await screenshot('c5b-desktop-lista.png');
      const reference = await page.$eval('#bank-image', (node) => node.value);
      await page.click('#bank-options .answer-image summary');
      await (await page.$('#bank-option-1-upload-file')).uploadFile(fixture);
      await page.waitForFunction(
        () => !document.querySelector('#bank-option-1-upload fieldset').hidden,
      );
      for (const key of ['titulo', 'textoAlternativo', 'fuente', 'titular'])
        await page.type(
          `#bank-option-1-upload-${key}`,
          'Rectángulo de ensayo autorizado',
        );
      await page.waitForFunction(
        () =>
          document.querySelector('#bank-option-1-upload img').naturalWidth > 0,
      );
      await page.click(
        '#bank-option-1-upload .editorial-image-actions button:first-child',
      );
      await page.waitForFunction(
        () =>
          document
            .querySelector('#bank-option-1-image')
            .value.startsWith('/recursos/editoriales/') &&
          !document.querySelector('#bank-save').disabled,
      );
      const optionReference = await page.$eval(
        '#bank-option-1-image',
        (node) => node.value,
      );
      // Agregar otra opción no debe descartar la imagen ya preparada en la primera.
      await page.click('#option-add');
      assert.equal(
        await page.$eval('#bank-option-1-image', (node) => node.value),
        optionReference,
      );
      await page.click('#option-remove');
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
      await screenshot('c5b-responsive-lista.png');
      await (
        await page.$('#bank-options .answer-image')
      ).screenshot({
        path: join(process.env.EDITORIAL_FILES_QA_DIR, 'c5c2b-opcion-390.png'),
      });
      const optionFits = await page.$eval(
        '#bank-options .answer-image',
        (node) => ({
          width: node.getBoundingClientRect().width,
          scroll: node.scrollWidth,
          client: node.clientWidth,
        }),
      );
      assert.ok(
        optionFits.width <= 390 && optionFits.scroll <= optionFits.client + 1,
      );
      const fits = await page.$eval('#bank-image-upload', (node) => ({
        width: node.getBoundingClientRect().width,
        scroll: node.scrollWidth,
        client: node.clientWidth,
      }));
      assert.ok(fits.width <= 390 && fits.scroll <= fits.client + 1);
      await page.click('#bank-save');
      await page.waitForFunction(() =>
        document
          .querySelector('#bank-message')
          .textContent.includes('Guardado y publicado'),
      );
      await page.waitForFunction(() =>
        document
          .querySelector('#bank-save-message')
          .textContent.includes('Guardado y publicado'),
      );
      const saveFeedback = await page.$eval('#bank-save-message', (node) => {
        const bounds = node.getBoundingClientRect();
        return {
          top: bounds.top,
          bottom: bounds.bottom,
          viewport: innerHeight,
          duplicateAnnouncement: node.getAttribute('aria-hidden'),
        };
      });
      assert.ok(
        saveFeedback.top >= 0 && saveFeedback.bottom <= saveFeedback.viewport,
        'La confirmación debe verse junto a Guardar sin buscarla sobre la lista.',
      );
      assert.equal(saveFeedback.duplicateAnnouncement, 'true');
      const question = await db.pregunta.findFirstOrThrow({
        where: { subtemaId: s.sub.id, imagenUrl: reference },
      });
      assert.equal(question.estadoContenido, 'PUBLICADO');
      assert.ok(question.archivoImagenId);
      const savedOptions = await db.respuesta.findMany({
        where: { preguntaId: question.id },
      });
      assert.equal(
        savedOptions.filter((option) => option.imagenUrl === optionReference)
          .length,
        1,
      );
      // Guardar confirma antes de terminar loadPage/loadCases. Esperar también
      // la lista y el desbloqueo evita consultar/clicar un nodo aún inexistente.
      await page.waitForFunction(() => {
        const button = document.querySelector('#bank-list button');
        return button && !button.disabled;
      });
      const questionButton = await page.$('#bank-list button');
      await questionButton.click();
      await page.waitForFunction(() =>
        [
          ...document.querySelectorAll('#bank-options .answer-image input'),
        ].some((input) => input.value.startsWith('/recursos/editoriales/')),
      );
      await withHistoryImages(async () => {
        const student = await user('ESTUDIANTE'),
          token = tokenFor(student);
        const option = savedOptions.find(
          (item) => item.imagenUrl === optionReference,
        );
        assert.equal(option.esCorrecta, true);
        const history = await db.historialRespuesta.create({
          data: {
            usuarioId: student.id,
            sesionId: randomUUID(),
            preguntaId: question.id,
            respuestaSeleccionadaId: option.id,
            respuestaCorrectaId: option.id,
            esCorrecta: true,
            origen: 'PRACTICA',
            area: 'MATEMATICAS',
          },
        });
        await db.pregunta.update({
          where: { id: question.id },
          data: { estadoContenido: 'ARCHIVADO' },
        });
        assert.equal((await call(optionReference, token)).status, 200);
        await page.click('#section-images');
        await page.waitForSelector('#editorial-file-access-panel input');
        await page.type('#editorial-file-access-panel input', optionReference);
        await page.click('#editorial-file-access-panel > button');
        await page.waitForSelector('#editorial-file-access-panel textarea');
        await page.select('#editorial-file-access-panel select', 'DERECHOS');
        await page.type(
          '#editorial-file-access-panel textarea',
          'Ensayo H3: permiso de uso revocado.',
        );
        // Enviar realmente una vez y perder solo la respuesta hacia el navegador.
        let lost = false;
        const intercept = async (request) => {
          if (
            !lost &&
            request.method() === 'POST' &&
            request.url().endsWith('/revocaciones')
          ) {
            lost = true;
            try {
              const response = await fetch(request.url(), {
                method: 'POST',
                headers: {
                  Authorization: request.headers().authorization,
                  'Content-Type': 'application/json',
                },
                body: request.postData(),
              });
              assert.equal(response.status, 201);
              await request.abort('failed');
            } catch (error) {
              runtimeErrors.push(error.message);
              await request.abort('failed');
            }
          } else await request.continue();
        };
        await page.setRequestInterception(true);
        page.on('request', intercept);
        page.once('dialog', (dialog) => dialog.accept());
        await page.click('#editorial-file-access-panel .danger');
        await page.waitForFunction(() =>
          document
            .querySelector('#editorial-file-access-panel [role="status"]')
            .textContent.includes('No se pudo confirmar la revocación'),
        );
        assert.equal(lost, true);
        assert.equal(
          await page.$eval(
            '#editorial-file-access-panel textarea',
            (node) => node.disabled,
          ),
          true,
        );
        const receiptButton = await page.$$(
          '#editorial-file-access-panel .file-access-detail button',
        );
        const recovery = [];
        for (const button of receiptButton)
          if (
            await button.evaluate(
              (node) => node.textContent === 'Consultar recibo de revocación',
            )
          )
            recovery.push(button);
        assert.equal(recovery.length, 1);
        await recovery[0].click();
        await page.waitForFunction(() =>
          document
            .querySelector('#editorial-file-access-panel')
            .textContent.includes('Revocación confirmada'),
        );
        page.off('request', intercept);
        await page.setRequestInterception(false);
        assert.equal((await call(optionReference, token)).status, 404);
        assert.equal(
          await db.revocacionArchivoEditorial.count({
            where: { archivoId: optionReference.split('/').pop() },
          }),
          1,
        );
        assert.equal(
          await db.historialRespuesta.count({
            where: { id: history.id, usuarioId: student.id, esCorrecta: true },
          }),
          1,
        );
        for (const width of [1280, 390]) {
          await page.setViewport({ width, height: 1000, deviceScaleFactor: 1 });
          const fits = await page.$eval(
            '#editorial-file-access-panel',
            (node) => ({ scroll: node.scrollWidth, client: node.clientWidth }),
          );
          assert.ok(fits.scroll <= fits.client + 1);
          await (
            await page.$('#editorial-file-access-panel')
          ).screenshot({
            path: join(
              process.env.EDITORIAL_FILES_QA_DIR,
              `h3-revocacion-${width}.png`,
            ),
          });
        }
        console.log(
          JSON.stringify({
            phase: 'h3-browser-revocation-verified',
            desktop: true,
            responsive390: true,
            lostResponse: true,
            receiptRecovered: true,
            android: false,
          }),
        );
      });
      assert.deepEqual(runtimeErrors, []);
      console.log(
        JSON.stringify({
          phase: 'c5b-browser-verified',
          desktop: true,
          responsive390: true,
          android: false,
          screenshots: process.env.EDITORIAL_FILES_QA_DIR,
        }),
      );
    } finally {
      await browser?.close();
      await new Promise((ok) => {
        panel.close(ok);
        panel.closeAllConnections();
      });
    }
  }));
