import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as request from 'supertest';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionTerritoryController } from './institution-territory.controller';
import {
  InstitutionTerritoryService,
  validateTerritoryCatalog,
} from './institution-territory.service';

const snapshot = () =>
  JSON.parse(
    readFileSync(join(__dirname, 'catalogs', 'divipola-2025.json'), 'utf8'),
  );

describe('PR-I5-T1 catálogo oficial empaquetado', () => {
  const service = new InstitutionTerritoryService();

  it('conserva edición, integridad y cobertura completa de la fuente consultada', () => {
    const catalog = validateTerritoryCatalog(snapshot());
    expect(catalog.departamentos).toHaveLength(33);
    expect(catalog.municipios).toHaveLength(1122);
    expect(catalog.sha256).toBe(
      'cf2c9ebc616427c0ab91a9199243368db6df473ce29d5c072b4346c5e4055c95',
    );
    expect(
      catalog.municipios.filter((row) => row.tipo === 'ÁREA NO MUNICIPALIZADA'),
    ).toHaveLength(18);
    expect(
      catalog.municipios.filter((row) => row.tipo === 'ISLA'),
    ).toHaveLength(1);
  });

  it.each([
    ['05', '05001', 'MEDELLÍN'],
    ['11', '11001', 'BOGOTÁ, D.C.'],
    ['91', '91001', 'LETICIA'],
    ['20', '20001', 'VALLEDUPAR'],
    ['91', '91798', 'TARAPACÁ'],
    ['99', '99001', 'PUERTO CARREÑO'],
  ])(
    'resuelve códigos exactos %s/%s sin inferir ubicación del nombre',
    (department, municipality, name) => {
      expect(service.resolveLocation(department, municipality)).toMatchObject({
        version: 'DANE-DIVIPOLA-MGN-2025',
        departamento: { codigo: department },
        municipio: {
          codigo: municipality,
          departamentoCodigo: department,
          nombre: name,
        },
      });
    },
  );

  it('rechaza municipio de otro departamento y códigos inventados', () => {
    expect(() => service.resolveLocation('20', '91001')).toThrow(
      'no pertenece',
    );
    expect(() => service.resolveLocation('20', '20999')).toThrow(
      'no pertenece',
    );
    expect(() => service.resolveLocation('00', '00001')).toThrow(
      'no disponible',
    );
    expect(() => service.resolveLocation('5', '05001')).toThrow(
      'no disponible',
    );
  });

  it('cada listado dependiente solo incluye unidades de ese departamento', () => {
    const ids: string[] = [];
    for (const department of service.departments().departamentos) {
      const result = service.municipalities(department.codigo);
      expect(result.municipios.length).toBeGreaterThan(0);
      for (const row of result.municipios) {
        expect(row.departamentoCodigo).toBe(department.codigo);
        expect(row.codigo.startsWith(department.codigo)).toBe(true);
        ids.push(row.codigo);
      }
    }
    expect(new Set(ids).size).toBe(1122);
  });

  it('las respuestas no permiten modificar el catálogo compartido', () => {
    service.departments().departamentos[0].nombre = 'alterado';
    service.municipalities('91').municipios[0].nombre = 'alterado';
    service.resolveLocation('91', '91001').municipio.nombre = 'alterado';
    expect(service.resolveLocation('91', '91001').municipio.nombre).toBe(
      'LETICIA',
    );
    expect(service.departments().departamentos[0].nombre).not.toBe('alterado');
  });

  it.each([
    'truncated',
    'duplicate',
    'wrong-parent',
    'name-changed',
    'bad-version',
    'numeric-code',
    'invalid-year',
    'null-row',
  ])('rechaza copia corrupta: %s', (mutation) => {
    const catalog = snapshot();
    switch (mutation) {
      case 'truncated':
        catalog.municipios.pop();
        break;
      case 'duplicate':
        catalog.municipios[1] = catalog.municipios[0];
        break;
      case 'wrong-parent':
        catalog.municipios[0].departamentoCodigo = '91';
        break;
      case 'name-changed':
        catalog.municipios[0].nombre = 'alterado';
        break;
      case 'bad-version':
        catalog.version = 'inventada';
        break;
      case 'numeric-code':
        catalog.departamentos[0].codigo = 5;
        break;
      case 'invalid-year':
        catalog.municipios[0].anioFuente = 9999;
        break;
      case 'null-row':
        catalog.municipios[0] = null;
        break;
    }
    expect(() => validateTerritoryCatalog(catalog)).toThrow(
      'catálogo DIVIPOLA',
    );
  });
});

describe('PR-I5-T1 contrato HTTP territorial autenticado', () => {
  let app: INestApplication;
  const prisma = { usuario: { findUnique: jest.fn() } };
  const jwt = { verifyAsync: jest.fn() };
  const auth = { Authorization: 'Bearer local-test' };
  const base = '/instituciones/territorio/departamentos';

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [InstitutionTerritoryController],
      providers: [
        InstitutionTerritoryService,
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
    jwt.verifyAsync.mockResolvedValue({ sub: 'student' });
    prisma.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
  });

  it.each([base, `${base}/91/municipios`])(
    'requiere sesión: %s',
    async (url) => {
      await request(app.getHttpServer()).get(url).expect(401);
      expect(prisma.usuario.findUnique).not.toHaveBeenCalled();
    },
  );
  it('rechaza token inválido y cuenta eliminada', async () => {
    jwt.verifyAsync.mockRejectedValueOnce(new Error('invalid'));
    await request(app.getHttpServer()).get(base).set(auth).expect(401);
    prisma.usuario.findUnique.mockResolvedValueOnce(null);
    await request(app.getHttpServer()).get(base).set(auth).expect(401);
  });
  it('permite cuenta sin institución y devuelve catálogo versionado', async () => {
    const response = await request(app.getHttpServer())
      .get(base)
      .set(auth)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.departamentos).toHaveLength(33);
    expect(response.body).toMatchObject({ version: 'DANE-DIVIPOLA-MGN-2025' });
    expect(Object.keys(response.body).sort()).toEqual([
      'consultadoEn',
      'departamentos',
      'fuente',
      'sha256',
      'version',
    ]);
    expect(response.body.departamentos).toContainEqual(
      expect.objectContaining({ codigo: '05', nombre: 'ANTIOQUIA' }),
    );
  });
  it('Amazonas devuelve Leticia y sus áreas no municipalizadas', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/91/municipios`)
      .set(auth)
      .expect(200);
    expect(response.body.departamentoCodigo).toBe('91');
    expect(response.body.municipios).toHaveLength(11);
    expect(response.body.municipios).toContainEqual(
      expect.objectContaining({ codigo: '91001', nombre: 'LETICIA' }),
    );
    expect(
      response.body.municipios.every(
        (row: { departamentoCodigo: string }) =>
          row.departamentoCodigo === '91',
      ),
    ).toBe(true);
  });
  it.each(['5', '005', 'ab', '91 OR 1=1'])(
    'rechaza formato de código %s',
    async (code) => {
      await request(app.getHttpServer())
        .get(`${base}/${encodeURIComponent(code)}/municipios`)
        .set(auth)
        .expect(400);
    },
  );
  it('devuelve 404 si el código no pertenece a la edición', async () => {
    await request(app.getHttpServer())
      .get(`${base}/00/municipios`)
      .set(auth)
      .expect(404);
  });
  it.each([base, `${base}/91/municipios`])(
    'rechaza parámetros fuera del contrato: %s',
    async (url) => {
      await request(app.getHttpServer())
        .get(url)
        .query({ source: 'https://example.invalid' })
        .set(auth)
        .expect(400);
    },
  );
});
