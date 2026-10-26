import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import * as request from 'supertest';
import * as sharpModule from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionController } from './institucion.controller';
import { ArchivoAlmacenamientoService } from './archivo-almacenamiento.service';

const sharp = sharpModule as unknown as typeof import('sharp').default;
describe('rutas HTTP reales del logo con guardas y multipart', () => {
  let app: INestApplication, image: Buffer;
  const id = 'a6ec3648-24ee-47d0-91f8-e59b2b68b9ab';
  const auth = { Authorization: 'Bearer fixture' };
  const db = {
    usuario: { findUnique: jest.fn() },
    miembroInstitucion: { findUnique: jest.fn() },
    institucion: { findUnique: jest.fn(), updateMany: jest.fn() },
    institucionLogo: { upsert: jest.fn(), deleteMany: jest.fn() },
    auditoriaInstitucion: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  beforeAll(async () => {
    const dependencies = Reflect.getMetadata(
      'design:paramtypes',
      InstitucionController,
    ) as Array<new (...args: any[]) => unknown>;
    const module = await Test.createTestingModule({
      controllers: [InstitucionController],
      providers: [
        ...dependencies
          .filter((p) => p !== ArchivoAlmacenamientoService)
          .map((p) => ({ provide: p, useValue: {} })),
        ArchivoAlmacenamientoService,
        { provide: PrismaService, useValue: db },
        {
          provide: JwtService,
          useValue: { verifyAsync: () => Promise.resolve({ sub: 'owner' }) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    image = await sharp({
      create: { width: 32, height: 32, channels: 3, background: 'blue' },
    })
      .png()
      .toBuffer();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    db.usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      correoVerificado: true,
      institucionId: id,
    });
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROPIETARIO',
      institucionId: id,
      usuario: { rol: 'PROFESOR' },
      institucion: { estadoVerificacion: 'APROBADA' },
    });
    db.institucion.findUnique.mockResolvedValue({
      estadoVerificacion: 'APROBADA',
    });
    db.institucion.updateMany.mockResolvedValue({ count: 1 });
    db.$transaction.mockImplementation((fn) => fn(db));
  });
  it('401 anónimo antes de procesar archivo', async () => {
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .field('revision', '0')
      .attach('logo', image, 'x.png')
      .expect(401);
    expect(db.institucionLogo.upsert).not.toHaveBeenCalled();
  });
  it('403 administrador y estudiante', async () => {
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'ADMINISTRADOR',
      institucionId: id,
    });
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .attach('logo', image, 'x.png')
      .expect(403);
    await request(app.getHttpServer())
      .delete('/instituciones/me/logo')
      .set(auth)
      .send({ revision: 0 })
      .expect(403);
    expect(db.institucionLogo.upsert).not.toHaveBeenCalled();
  });
  it('publica multipart y devuelve solo URL y revisión', async () => {
    const res = await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .attach('logo', image, 'x.png')
      .expect(201);
    expect(res.body).toEqual({
      logoUrl: `/instituciones/directorio/${id}/logo/1`,
      revision: 1,
    });
  });
  it('archivo grande, campos extra y archivo ausente se rechazan', async () => {
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .attach('logo', Buffer.alloc(3 * 1024 * 1024 + 1), 'x.png')
      .expect(413);
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .field('institucionId', id)
      .attach('logo', image, 'x.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .expect(400);
    expect(db.institucionLogo.upsert).not.toHaveBeenCalled();
  });
  it('revisión ausente y MIME falso no llegan a guardar', async () => {
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .attach('logo', image, 'x.png')
      .expect(400);
    await request(app.getHttpServer())
      .post('/instituciones/me/logo')
      .set(auth)
      .field('revision', '0')
      .attach('logo', Buffer.from('<svg/>'), {
        filename: 'x.png',
        contentType: 'image/png',
      })
      .expect(400);
    expect(db.institucionLogo.upsert).not.toHaveBeenCalled();
  });
  it('409 conserva logo cuando otra sesión cambió el perfil', async () => {
    db.institucion.updateMany.mockResolvedValue({ count: 0 });
    await request(app.getHttpServer())
      .delete('/instituciones/me/logo')
      .set(auth)
      .send({ revision: 0 })
      .expect(409);
    expect(db.institucionLogo.deleteMany).not.toHaveBeenCalled();
  });
});
