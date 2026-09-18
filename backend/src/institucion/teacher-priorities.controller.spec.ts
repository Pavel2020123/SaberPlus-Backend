import {
  ExecutionContext,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { InstitutionOperationalGuard } from './institution-operational.guard';
import * as request from 'supertest';
import { Server } from 'node:http';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import {
  TeacherPrioritiesController,
  StudentPrioritiesController,
} from './teacher-priorities.controller';
import { TeacherPrioritiesService } from './teacher-priorities.service';

describe('contrato HTTP P3-A', () => {
  let app: INestApplication;
  const service = {
    create: jest.fn(),
    withdraw: jest.fn(),
    report: jest.fn(),
    catalog: jest.fn(),
    listForTeacher: jest.fn(),
    listForStudent: jest.fn(),
    startPractice: jest.fn(),
  };
  const group = '11111111-1111-4111-8111-111111111111';
  const priority = '22222222-2222-4222-8222-222222222222';
  const base = `/instituciones/me/grupos/${group}/prioridades`;
  const body = {
    id: priority,
    temaId: 'topic',
    venceEn: '2026-09-20T15:00:00Z',
  };
  beforeAll(async () => {
    // Se prueba transporte con guards sustituidos; permisos reales del servicio
    // y consultas se ensayan en PostgreSQL desechable, no login completo P5.
    const module = await Test.createTestingModule({
      controllers: [TeacherPrioritiesController, StudentPrioritiesController],
      providers: [{ provide: TeacherPrioritiesService, useValue: service }],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthenticatedRequest>().usuario = {
            sub: 'session-user',
          } as AuthenticatedRequest['usuario'];
          return true;
        },
      })
      .overrideGuard(EmailVerificadoGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(InstitutionOperationalGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(ProfesorInstitucionGuard)
      .useValue({ canActivate: () => true })
      .compile();
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
  beforeEach(() => {
    for (const fn of Object.values(service))
      fn.mockReset().mockResolvedValue({ version: 1 });
  });
  afterAll(async () => {
    await app?.close();
  });
  const server = () => app.getHttpServer() as Server;

  it('declara autenticación y correo en ambos controladores y rol docente en gestión', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TeacherPrioritiesController),
    ).toEqual([
      JwtGuard,
      EmailVerificadoGuard,
      InstitutionOperationalGuard,
      ProfesorInstitucionGuard,
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentPrioritiesController),
    ).toEqual([JwtGuard, EmailVerificadoGuard, InstitutionOperationalGuard]);
  });
  it('crear toma actor de la sesión, valida cuerpo y deshabilita caché', async () => {
    const response = await request(server()).post(base).send(body).expect(201);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.create).toHaveBeenCalledWith('session-user', group, body);
  });
  it.each([
    { ...body, actorId: 'other' },
    { ...body, metaPreguntas: 1 },
    { ...body, preguntaIds: ['private'] },
    { ...body, id: 'bad' },
    { ...body, temaId: '' },
    { ...body, subtemaId: '' },
    { ...body, venceEn: '2026-02-31T12:00:00Z' },
  ])('rechaza cuerpo inválido o campos privilegiados %j', async (dto) => {
    await request(server()).post(base).send(dto).expect(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '1001', '1.5', 'abc'])(
    'rechaza página %s',
    async (page) => {
      await request(server()).get(`${base}?pagina=${page}`).expect(400);
      expect(service.listForTeacher).not.toHaveBeenCalled();
    },
  );
  it('valida UUID de grupo y prioridad antes de consultar datos', async () => {
    await request(server())
      .get('/instituciones/me/grupos/bad/prioridades')
      .expect(400);
    await request(server()).get(`${base}/bad/cumplimiento`).expect(400);
    expect(service.report).not.toHaveBeenCalled();
  });
  it('catálogo, informe y retiro usan sus rutas sin aceptar identidad por body', async () => {
    await request(server())
      .get(`${base}/catalogo?area=MATEMATICAS&pagina=2`)
      .expect(200);
    expect(service.catalog).toHaveBeenCalledWith('session-user', group, {
      area: 'MATEMATICAS',
      pagina: 2,
    });
    await request(server()).get(`${base}/${priority}/cumplimiento`).expect(200);
    expect(service.report).toHaveBeenCalledWith(
      'session-user',
      group,
      priority,
      1,
    );
    await request(server()).post(`${base}/${priority}/retirar`).expect(201);
    expect(service.withdraw).toHaveBeenCalledWith(
      'session-user',
      group,
      priority,
    );
  });
  it('estudiante solo consulta su sesión y no puede enviar estudianteId', async () => {
    const response = await request(server())
      .get('/prioridades-docentes/me')
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.listForStudent).toHaveBeenCalledWith('session-user', 1);
    await request(server())
      .get('/prioridades-docentes/me?estudianteId=other')
      .expect(400);
  });

  it('inicio de práctica usa identidad de sesión, valida UUID y no recibe claves', async () => {
    const response = await request(server())
      .post(`/prioridades-docentes/${priority}/practica`)
      .send({ usuarioId: 'other' })
      .expect(201);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.startPractice).toHaveBeenCalledWith(
      'session-user',
      priority,
    );
    await request(server())
      .post('/prioridades-docentes/no-es-uuid/practica')
      .expect(400);
    expect(service.startPractice).toHaveBeenCalledTimes(1);
  });
});
