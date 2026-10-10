import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request = require('supertest');
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionDirectoryController } from './institution-directory.controller';
import { InstitutionDirectoryService } from './institution-directory.service';

describe('PR-I5A directorio institucional', () => {
  let app: INestApplication;
  const id = 'a6ec3648-24ee-47d0-91f8-e59b2b68b9ab';
  const prisma = {
    institucion: { findMany: jest.fn(), findFirst: jest.fn() },
    usuario: { findUnique: jest.fn() },
  };
  const jwt = { verifyAsync: jest.fn() };
  const auth = { Authorization: 'Bearer test-token' };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InstitutionDirectoryController],
      providers: [
        InstitutionDirectoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    jwt.verifyAsync.mockResolvedValue({ sub: 'student-id' });
    prisma.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
    prisma.institucion.findMany.mockResolvedValue([]);
    prisma.institucion.findFirst.mockResolvedValue(null);
  });

  it('rechaza consultas anónimas sin acceder al catálogo', async () => {
    await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/instituciones/directorio/${id}`)
      .expect(401);
    expect(prisma.institucion.findMany).not.toHaveBeenCalled();
    expect(prisma.institucion.findFirst).not.toHaveBeenCalled();
  });
  it('rechaza token inválido y cuenta eliminada', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('invalid'));
    await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .set(auth)
      .expect(401);
    prisma.usuario.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .set(auth)
      .expect(401);
    expect(prisma.institucion.findMany).not.toHaveBeenCalled();
  });
  it('permite estudiante sin institución y devuelve vacío explícito sin caché', async () => {
    const response = await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .set(auth)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).toEqual({
      instituciones: [],
      pagina: 1,
      hayMas: false,
    });
    expect(prisma.institucion.findMany).toHaveBeenCalledWith({
      where: { estadoVerificacion: 'APROBADA' },
      select: { id: true, nombre: true },
      orderBy: [{ nombre: 'asc' }, { id: 'asc' }],
      skip: 0,
      take: 21,
    });
  });
  it('normaliza búsqueda, ordena estable y pagina sin devolver el centinela', async () => {
    prisma.institucion.findMany.mockResolvedValue(
      Array.from({ length: 21 }, (_, i) => ({
        id: String(i),
        nombre: 'Colegio',
      })),
    );
    const response = await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .query({ q: '  Colegio   Norte ', pagina: 2 })
      .set(auth)
      .expect(200);
    expect(response.body.instituciones).toHaveLength(20);
    expect(response.body).toMatchObject({ pagina: 2, hayMas: true });
    expect(prisma.institucion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 21,
        where: {
          estadoVerificacion: 'APROBADA',
          nombre: { contains: 'Colegio Norte', mode: 'insensitive' },
        },
      }),
    );
  });
  it.each(['0', '-1', '1.5', '10001', 'abc', ''])(
    'rechaza página inválida %s',
    async (pagina) => {
      await request(app.getHttpServer())
        .get('/instituciones/directorio')
        .query({ pagina })
        .set(auth)
        .expect(400);
      expect(prisma.institucion.findMany).not.toHaveBeenCalled();
    },
  );
  it.each([
    { q: 'x'.repeat(121) },
    { estadoVerificacion: 'PENDIENTE' },
    { take: 999 },
    { departamento: 'inventado' },
  ])('rechaza consulta fuera del contrato %j', async (query) => {
    await request(app.getHttpServer())
      .get('/instituciones/directorio')
      .query(query)
      .set(auth)
      .expect(400);
    expect(prisma.institucion.findMany).not.toHaveBeenCalled();
  });
  it('filtra también el detalle por aprobación y selecciona solo identidad pública', async () => {
    prisma.institucion.findFirst.mockResolvedValue({
      id,
      nombre: 'Colegio aprobado',
    });
    const response = await request(app.getHttpServer())
      .get(`/instituciones/directorio/${id}`)
      .set(auth)
      .expect(200);
    expect(response.body).toEqual({ id, nombre: 'Colegio aprobado' });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(prisma.institucion.findFirst).toHaveBeenCalledWith({
      where: { id, estadoVerificacion: 'APROBADA' },
      select: { id: true, nombre: true },
    });
  });
  it('no distingue un id oculto de uno inexistente y valida UUID', async () => {
    await request(app.getHttpServer())
      .get(`/instituciones/directorio/${id}`)
      .set(auth)
      .expect(404);
    prisma.institucion.findFirst.mockClear();
    await request(app.getHttpServer())
      .get('/instituciones/directorio/invalido')
      .set(auth)
      .expect(400);
    expect(prisma.institucion.findFirst).not.toHaveBeenCalled();
  });
});
