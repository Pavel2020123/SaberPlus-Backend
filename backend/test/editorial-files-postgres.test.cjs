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
  await app.listen(0, '127.0.0.1');
  instances.push(app);
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
    const inicio = new Date(Date.now() - 601000),
      vence = new Date(inicio.getTime() + 600000);
    await db.intentoTriviaRush.update({
      where: { id },
      data: {
        iniciadoEn: inicio,
        venceEn: vence,
        preguntaIniciaEn: new Date(inicio.getTime() + 1000),
        tiraLocalPausadaEn: new Date(inicio.getTime() + 2000),
      },
    });
    const expired = await call(path, token, {}, origin);
    assert.equal(expired.status, 200);
    assert.equal(expired.data.intento.estado, 'EXPIRADO');
    assert.equal(expired.data.intento.finalizadoEn, vence.toISOString());
    assert.equal(expired.data.intento.rondaLocal.pausada, false);
    assert.equal(
      await db.triviaRushRespuesta.count({ where: { intentoId: id } }),
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

test('C5-B/C2-B panel real en Chromium: imagen de enunciado y de opción, publicación y recarga', async (t) =>
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
