import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import {
  ArchivoEditorial,
  Prisma,
  RevocacionArchivoEditorial,
} from '@prisma/client';
import * as request from 'supertest';
import * as sharpModule from 'sharp';
import type { Server } from 'node:http';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileController } from './editorial-file.controller';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import { EditorialFileStore } from './editorial-file.store';
import { EditorialResourceController } from './editorial-resource.controller';
import { EDITORIAL_INPUT_LIMIT } from './editorial-image';

const sharp = sharpModule as unknown as typeof import('sharp').default;
describe('HTTP ADMIN de archivos: permisos, multipart y recibos', () => {
  let app: INestApplication;
  const server = (): Server => app.getHttpServer() as Server;
  let image: Buffer;
  let row: ArchivoEditorial | null;
  let revocation: RevocacionArchivoEditorial | null;
  const actor = '12a25419-147d-46b7-8774-48ba746fb704';
  const operation = 'f2c743aa-7ba2-454b-9319-b6e234f7d206';
  const auth = { Authorization: 'Bearer admin' };
  const fields = {
    operacionId: operation,
    titulo: 'Gráfico de fracciones',
    textoAlternativo: 'Cuatro sectores de un círculo',
    fuente: 'Creación propia',
    titular: 'SaberPlus',
    autorizacion: 'ORIGINAL',
  };
  const table = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const db = {
    usuario: { findUnique: jest.fn() },
    archivoEditorial: table,
    pregunta: { count: jest.fn() },
    casoPregunta: { count: jest.fn() },
    subtema: { count: jest.fn() },
    respuesta: { count: jest.fn() },
    imagenHistorialRespuesta: { count: jest.fn() },
    revocacionArchivoEditorial: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const contents = new Map<string, Buffer>();
  const store = {
    put: jest.fn((id: string, bytes: Buffer) => {
      contents.set(id, bytes);
      return Promise.resolve();
    }),
    read: jest.fn((id: string) => Promise.resolve(contents.get(id))),
    remove: jest.fn((id: string) => {
      contents.delete(id);
      return Promise.resolve();
    }),
  };
  const originalFlag = process.env.EDITORIAL_FILES_LOCAL_ENABLED;
  const originalNodeEnv = process.env.NODE_ENV;

  const upload = (overrides: Record<string, string> = {}, bytes = image) => {
    let call = request(server()).post('/admin/archivos').set(auth);
    for (const [key, value] of Object.entries({ ...fields, ...overrides }))
      call = call.field(key, value);
    return call.attach('archivo', bytes, {
      filename: '../../no-confiar.png',
      contentType: 'image/png',
    });
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [EditorialFileController, EditorialResourceController],
      providers: [
        EditorialFileRuntime,
        EditorialFileService,
        { provide: PrismaService, useValue: db },
        { provide: EditorialFileStore, useValue: store },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: (token: string) => {
              if (
                !['admin', 'student', 'teacher', 'initial', 'other'].includes(
                  token,
                )
              )
                return Promise.reject(new Error('Token inválido'));
              return Promise.resolve({
                sub: token === 'admin' ? actor : token,
              });
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
    image = await sharp({
      create: { width: 80, height: 40, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    await app?.close();
    if (originalFlag === undefined)
      delete process.env.EDITORIAL_FILES_LOCAL_ENABLED;
    else process.env.EDITORIAL_FILES_LOCAL_ENABLED = originalFlag;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  });
  beforeEach(() => {
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    jest.clearAllMocks();
    db.$transaction.mockImplementation(
      (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn(db as unknown as Prisma.TransactionClient),
    );
    for (const model of [
      db.pregunta,
      db.casoPregunta,
      db.subtema,
      db.respuesta,
      db.imagenHistorialRespuesta,
    ])
      model.count.mockResolvedValue(0);
    row = null;
    revocation = null;
    contents.clear();
    db.usuario.findUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => ({
        id: where.id,
        correoVerificado: true,
        rol:
          where.id === 'student'
            ? 'ESTUDIANTE'
            : where.id === 'teacher'
              ? 'PROFESOR'
              : 'ADMIN',
        debeCambiarContrasena: where.id === 'initial',
      }),
    );
    table.findUnique.mockImplementation(
      () => row && { ...row, revocacion: revocation },
    );
    db.revocacionArchivoEditorial.findUnique.mockImplementation(
      ({ where }: { where: { operacionId: string } }) =>
        revocation?.operacionId === where.operacionId ? revocation : null,
    );
    db.revocacionArchivoEditorial.create.mockImplementation(
      ({ data }: { data: Omit<RevocacionArchivoEditorial, 'creadoEn'> }) => {
        revocation = { ...data, creadoEn: new Date() };
        return revocation;
      },
    );
    db.revocacionArchivoEditorial.findFirst.mockImplementation(
      ({
        where,
      }: {
        where: { actorId: string; archivoId: string; operacionId: string };
      }) =>
        revocation &&
        Object.entries(where).every(([key, value]) => revocation[key] === value)
          ? revocation
          : null,
    );
    table.findFirst.mockImplementation(
      ({ where }: { where: { creadoPorId: string } }) =>
        row?.creadoPorId === where.creadoPorId ? { ...row } : null,
    );
    table.create.mockImplementation(
      ({ data }: { data: Partial<ArchivoEditorial> }) => {
        row = {
          ...data,
          estado: 'PREPARADO',
          creadoEn: new Date(),
          actualizadoEn: new Date(),
        } as ArchivoEditorial;
        return { ...row };
      },
    );
    table.updateMany.mockImplementation(
      ({ data }: { data: { estado: ArchivoEditorial['estado'] } }) => {
        row.estado = data.estado;
        return { count: 1 };
      },
    );
  });

  it.each(['', 'Bearer invalid'])(
    '401 sin una sesión ADMIN válida: %s',
    async (authorization) => {
      await request(server())
        .post('/admin/archivos')
        .set('Authorization', authorization)
        .attach('archivo', image, 'x.png')
        .expect(401);
      expect(table.create).not.toHaveBeenCalled();
    },
  );

  const revokeBody = {
    operacionId: 'c4130d8e-3147-4a0d-9531-aa084f1a474b',
    motivo: 'SEGURIDAD',
    detalle: 'Recurso retirado por seguridad.',
  };

  it('la lectura estudiantil usa el sujeto del JWT para la prueba histórica y conserva headers privados', async () => {
    const previous = process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED;
    process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = 'true';
    try {
      const uploaded = await upload().expect(201);
      const file = uploaded.body as { id: string };
      table.findFirst.mockResolvedValueOnce({ id: file.id });
      const response = await request(server())
        .get(`/recursos/editoriales/${file.id}?usuarioId=admin`)
        .set('Authorization', 'Bearer student')
        .expect(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      const calls = table.findFirst.mock.calls as unknown as [
        Prisma.ArchivoEditorialFindFirstArgs,
      ][];
      const query = calls[0][0];
      expect(query.where?.OR).toEqual(
        expect.arrayContaining([
          {
            imagenesHistoricas: {
              some: {
                usuarioId: 'student',
                sha256: row.sha256,
                historial: { usuarioId: 'student' },
              },
            },
          },
        ]),
      );
      await request(server())
        .get(`/recursos/editoriales/${file.id}`)
        .expect(401);
      await request(server())
        .get('/recursos/editoriales/no-uuid')
        .set('Authorization', 'Bearer student')
        .expect(400);
    } finally {
      if (previous === undefined)
        delete process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED;
      else process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = previous;
    }
  });
  it.each(['student', 'teacher', 'initial'])(
    'solo ADMIN habilitado revoca: %s',
    async (token) => {
      await request(server())
        .post(`/admin/archivos/${operation}/revocaciones`)
        .set('Authorization', `Bearer ${token}`)
        .send(revokeBody)
        .expect(403);
      expect(db.revocacionArchivoEditorial.create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { motivo: 'OTRO' },
    { detalle: '' },
    { detalle: 'x'.repeat(501) },
    { detalle: '\u0000oculto' },
    { operacionId: 'no-uuid' },
    { actorId: 'no-admitido' },
  ])(
    'valida el cuerpo de revocación y rechaza campos adicionales: %j',
    async (changes) => {
      await request(server())
        .post(`/admin/archivos/${operation}/revocaciones`)
        .set(auth)
        .send({ ...revokeBody, ...changes })
        .expect(400);
      expect(db.revocacionArchivoEditorial.create).not.toHaveBeenCalled();
    },
  );
  it('revocación HTTP idempotente y recibo propio bloquean la descarga ADMIN', async () => {
    const uploaded = await upload().expect(201);
    const file = uploaded.body as { id: string; contenidoUrl: string };
    const path = `/admin/archivos/${file.id}/revocaciones`;
    const first = await request(server())
      .post(path)
      .set(auth)
      .send(revokeBody)
      .expect(201);
    const repeat = await request(server())
      .post(path)
      .set(auth)
      .send(revokeBody)
      .expect(201);
    expect(repeat.body).toEqual(first.body);
    expect(first.headers['cache-control']).toBe('private, no-store');
    const receipt = await request(server())
      .get(`${path}/${revokeBody.operacionId}`)
      .set(auth)
      .expect(200);
    expect(receipt.body).toEqual(first.body);
    await request(server())
      .get(`${path}/${revokeBody.operacionId}`)
      .set('Authorization', 'Bearer other')
      .expect(404);
    await request(server()).get(file.contenidoUrl).set(auth).expect(404);
    await request(server())
      .get(`/admin/archivos/${file.id}`)
      .set(auth)
      .expect(200)
      .expect(({ body }: { body: unknown }) =>
        expect(body).toMatchObject({
          estado: 'REVOCADO',
          contenidoUrl: null,
          puedeReintentar: false,
        }),
      );
    expect(db.revocacionArchivoEditorial.create).toHaveBeenCalledTimes(1);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it.each(['student', 'teacher', 'initial'])(
    '403 para rol o cambio inicial pendiente: %s',
    async (token) => {
      await request(server())
        .post('/admin/archivos')
        .set('Authorization', `Bearer ${token}`)
        .attach('archivo', image, 'x.png')
        .expect(403);
      expect(table.create).not.toHaveBeenCalled();
    },
  );

  it.each(['false', ''])(
    'desactivado devuelve 503 antes de procesar el multipart: %s',
    async (flag) => {
      process.env.EDITORIAL_FILES_LOCAL_ENABLED = flag;
      await request(server())
        .post('/admin/archivos')
        .set(auth)
        .attach('inesperado', image, 'x.png')
        .expect(503);
      expect(table.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['production', 'staging', ''])(
    'el adaptador no se habilita fuera de development/test: %s',
    async (environment) => {
      process.env.NODE_ENV = environment;
      await request(server())
        .get(`/admin/archivos/operaciones/${operation}`)
        .set(auth)
        .expect(503);
      expect(table.findFirst).not.toHaveBeenCalled();
    },
  );

  it('carga y descarga WEBP privado, conservando proporción y metadatos de derechos', async () => {
    const response = await upload().expect(201);
    const result = response.body as { id: string; contenidoUrl: string };
    expect(response.body).toMatchObject({
      estado: 'DISPONIBLE',
      ancho: 80,
      alto: 40,
      tipo: 'image/webp',
      titular: 'SaberPlus',
    });
    expect(response.headers['cache-control']).toBe('private, no-store');
    const downloaded = await request(server())
      .get(result.contenidoUrl)
      .set(auth)
      .expect(200);
    expect(downloaded.headers['content-type']).toContain('image/webp');
    expect(downloaded.headers['x-content-type-options']).toBe('nosniff');
    expect(downloaded.headers['cache-control']).toBe('private, no-store');
    expect(await sharp(downloaded.body as Buffer).metadata()).toMatchObject({
      width: 80,
      height: 40,
    });
    expect(row).not.toHaveProperty('originalname');
    await request(server())
      .get(`/admin/archivos/${result.id}`)
      .set(auth)
      .expect(200);
  });

  it('recupera el recibo propio y el reenvío no duplica', async () => {
    const first = await upload().expect(201);
    const repeated = await upload().expect(201);
    expect(repeated.body).toEqual(first.body);
    const receipt = await request(server())
      .get(`/admin/archivos/operaciones/${operation}`)
      .set(auth)
      .expect(200);
    expect(receipt.body).toEqual(first.body);
    expect(table.create).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('otro ADMIN no ve el recibo ajeno aunque pueda gestionar el recurso editorial', async () => {
    await upload().expect(201);
    await request(server())
      .get(`/admin/archivos/operaciones/${operation}`)
      .set('Authorization', 'Bearer other')
      .expect(404);
  });

  it.each(['student', 'teacher'])(
    'el contenido privado no se descarga con rol %s',
    async (token) => {
      const response = await upload().expect(201);
      const result = response.body as { contenidoUrl: string };
      store.read.mockClear();
      await request(server())
        .get(result.contenidoUrl)
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(store.read).not.toHaveBeenCalled();
    },
  );

  it('identificador repetido con otro texto devuelve 409', async () => {
    await upload().expect(201);
    await upload({ titulo: 'Título distinto' }).expect(409);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it.each([
    { operacionId: 'no-es-uuid' },
    { textoAlternativo: '' },
    { fuente: '  ' },
    { titular: 'x'.repeat(256) },
    { autorizacion: 'cualquiera' },
    { autorizacion: 'LICENCIA' },
    { titulo: 'texto\u0000oculto' },
    { ruta: '../../otro-archivo' },
  ])(
    'valida metadatos y no permite claves adicionales: %j',
    async (overrides) => {
      await upload(overrides).expect(400);
      expect(table.create).not.toHaveBeenCalled();
    },
  );

  it('acepta una referencia documental de autorización sin cargarla desde el servidor', async () => {
    await upload({
      autorizacion: 'LICENCIA',
      referenciaAutorizacion: 'Contrato interno REF-2026-14',
    }).expect(201);
    expect(row?.referenciaAutorizacion).toBe('Contrato interno REF-2026-14');
  });

  it('rechaza archivos falsos aunque se declaren PNG', async () => {
    await upload({}, Buffer.from('<html>Esto no es una imagen</html>')).expect(
      400,
    );
    expect(table.create).not.toHaveBeenCalled();
  });

  it('aplica el límite de 5 MiB en multipart antes de normalizar', async () => {
    const response = await upload(
      {},
      Buffer.alloc(EDITORIAL_INPUT_LIMIT + 1),
    ).expect(413);
    expect(response.text).toContain('5 MiB');
    expect(table.create).not.toHaveBeenCalled();
  });

  it('rechaza el archivo ausente', async () => {
    await request(server())
      .post('/admin/archivos')
      .set(auth)
      .field('operacionId', operation)
      .expect(400);
    expect(table.create).not.toHaveBeenCalled();
  });

  it('la retirada es repetible y bloquea descargas y reenvíos de la operación retirada', async () => {
    const response = await upload().expect(201);
    const result = response.body as { id: string; contenidoUrl: string };
    await request(server())
      .delete(`/admin/archivos/${result.id}`)
      .set(auth)
      .expect(200);
    await request(server())
      .delete(`/admin/archivos/${result.id}`)
      .set(auth)
      .expect(200);
    await request(server()).get(result.contenidoUrl).set(auth).expect(404);
    await upload().expect(410);
    expect(contents.size).toBe(0);
  });

  it('UUID inválido no llega al servicio', async () => {
    await request(server())
      .get('/admin/archivos/operaciones/otra-cosa')
      .set(auth)
      .expect(400);
    expect(table.findFirst).not.toHaveBeenCalled();
  });

  it('tabla no migrada responde 503 sin filtrar detalles de Prisma', async () => {
    table.findUnique.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Tabla secreta no disponible', {
        code: 'P2021',
        clientVersion: '5.22.0',
      }),
    );
    const response = await upload().expect(503);
    expect(response.text).not.toContain('Tabla secreta');
    expect(response.text).toContain('Consulta su estado');
  });
});
