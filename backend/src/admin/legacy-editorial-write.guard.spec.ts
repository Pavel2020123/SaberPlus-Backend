import {
  INestApplication,
  RequestMethod,
  ValidationPipe,
} from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { Server } from 'node:http';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AcademicCatalogService } from './academic-catalog.service';
import { ContentImportService } from './content-import.service';
import { ContentLifecycleService } from './content-lifecycle.service';
import { LegacyEditorialWriteGuard } from './legacy-editorial-write.guard';

const retired = [
  ['patch', 'temas/t1/estado'],
  ['delete', 'temas/t1'],
  ['patch', 'subtemas/s1/estado'],
  ['delete', 'subtemas/s1'],
  ['post', 'preguntas'],
  ['post', 'preguntas-aleatorias'],
  ['post', 'casos-preguntas'],
  ['patch', 'casos-preguntas/c1/estado'],
  ['patch', 'casos-preguntas/c1'],
  ['delete', 'casos-preguntas/c1'],
  ['patch', 'preguntas/q1/caso'],
  ['patch', 'preguntas/q1/estado'],
  ['delete', 'preguntas/q1'],
  ['patch', 'subtemas/s1/contenido'],
  ['patch', 'subtemas/s1/interactivo'],
] as const;

describe('Legacy editorial HTTP boundary', () => {
  let app: INestApplication;
  let role = 'ADMIN';
  const previousGate = process.env.EDITORIAL_PUBLICATION_ENABLED;
  const legacyWrites: Record<string, jest.Mock> = Object.fromEntries(
    [
      'eliminarTema',
      'eliminarSubtema',
      'crearPregunta',
      'crearPreguntaAleatoria',
      'crearCasoPregunta',
      'actualizarCasoPregunta',
      'eliminarCasoPregunta',
      'asignarPreguntaACaso',
      'eliminarPregunta',
      'actualizarContenidoSubtema',
      'actualizarInteractivoSubtema',
      'cambiarEstadoTema',
      'cambiarEstadoSubtema',
      'cambiarEstadoCaso',
      'cambiarEstadoPregunta',
    ].map((name) => [name, jest.fn()]),
  );
  const catalog = { crearTema: jest.fn(), crearSubtema: jest.fn() };
  const read = jest.fn();
  const importPreview = jest.fn();

  beforeAll(async () => {
    // Real Nest routing + real AdminGuard; only JWT verification and persistence
    // are doubles. No credentials, database connections or cloud writes.
    const module = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        LegacyEditorialWriteGuard,
        {
          provide: AdminService,
          useValue: { ...legacyWrites, obtenerTemas: read },
        },
        { provide: ContentLifecycleService, useValue: legacyWrites },
        { provide: ContentImportService, useValue: { preview: importPreview } },
        { provide: AcademicCatalogService, useValue: catalog },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'test-admin' }),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            usuario: {
              findUnique: jest
                .fn()
                .mockImplementation(() => Promise.resolve({ rol: role })),
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
  });
  beforeEach(() => {
    jest.clearAllMocks();
    role = 'ADMIN';
    read.mockResolvedValue([]);
    catalog.crearTema.mockResolvedValue({
      id: 't1',
      estadoContenido: 'BORRADOR',
    });
    catalog.crearSubtema.mockResolvedValue({
      id: 's1',
      estadoContenido: 'BORRADOR',
    });
    importPreview.mockResolvedValue({ preview: true });
  });
  afterEach(() => {
    for (const write of Object.values(legacyWrites))
      expect(write).not.toHaveBeenCalled();
  });
  afterAll(async () => {
    if (previousGate === undefined)
      delete process.env.EDITORIAL_PUBLICATION_ENABLED;
    else process.env.EDITORIAL_PUBLICATION_ENABLED = previousGate;
    await app?.close();
  });

  describe.each(['false', 'true'])('publication gate = %s', (gate) => {
    it.each(retired)(
      '%s %s returns 410 before executing its old service',
      async (method, path) => {
        process.env.EDITORIAL_PUBLICATION_ENABLED = gate;
        const response = await request(app.getHttpServer() as Server)
          [method](`/admin/${path}`)
          .set('Authorization', 'Bearer test-only')
          .send({ estadoContenido: 'PUBLICADO', unexpected: 'must not write' })
          .expect(410);
        expect(response.body).toMatchObject({
          statusCode: 410,
          code: 'LEGACY_EDITORIAL_WRITE_RETIRED',
        });
        expect(response.body).toHaveProperty('replacement');
      },
    );
  });
  it.each(retired)(
    '%s %s still requires authentication',
    async (method, path) => {
      await request(app.getHttpServer() as Server)
        [method](`/admin/${path}`)
        .send({})
        .expect(401);
    },
  );
  describe.each(['ESTUDIANTE', 'PROFESOR'])('role %s', (value) => {
    it.each(retired)('%s %s cannot bypass ADMIN', async (method, path) => {
      role = value;
      await request(app.getHttpServer() as Server)
        [method](`/admin/${path}`)
        .set('Authorization', 'Bearer test-only')
        .send({})
        .expect(403);
    });
  });
  it('keeps read-only catalog access', async () => {
    await request(app.getHttpServer() as Server)
      .get('/admin/temas')
      .set('Authorization', 'Bearer test-only')
      .expect(200, []);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['temas', { nombre: 'Aritmética', area: 'MATEMATICAS' }, 'crearTema'],
    ['subtemas', { nombre: 'Sumas', temaId: 't1' }, 'crearSubtema'],
  ] as const)(
    'keeps %s creation routed to the shared catalog service',
    async (path, body, operation) => {
      await request(app.getHttpServer() as Server)
        .post(`/admin/${path}`)
        .set('Authorization', 'Bearer test-only')
        .send(body)
        .expect(201);
      expect(catalog[operation]).toHaveBeenCalledTimes(1);
    },
  );
  it('keeps the non-mutating import preview', async () => {
    await request(app.getHttpServer() as Server)
      .post('/admin/importaciones-contenido/previsualizar')
      .set('Authorization', 'Bearer test-only')
      .expect(201);
    expect(importPreview).toHaveBeenCalledTimes(1);
  });
  it('requires an explicit decision for every future legacy-controller mutation', () => {
    const kept = new Set([
      'cambiarRol',
      'eliminarUsuario',
      'crearInstitucionDesdeLead',
      'actualizarPlanInstitucional',
      'crearTema',
      'crearSubtema',
      'previsualizarImportacionContenido',
    ]);
    let retiredCount = 0;
    for (const name of Object.getOwnPropertyNames(AdminController.prototype)) {
      if (name === 'constructor') continue;
      const descriptor = Object.getOwnPropertyDescriptor(
        AdminController.prototype,
        name,
      );
      const handler: unknown = descriptor?.value;
      if (
        typeof handler !== 'function' ||
        !Reflect.hasMetadata(PATH_METADATA, handler)
      )
        continue;
      const method: unknown = Reflect.getMetadata(METHOD_METADATA, handler);
      if (method === RequestMethod.GET) continue;
      if (kept.has(name)) {
        kept.delete(name);
        continue;
      }
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(
        LegacyEditorialWriteGuard,
      );
      retiredCount++;
    }
    expect(kept.size).toBe(0);
    expect(retiredCount).toBe(retired.length);
  });
});
