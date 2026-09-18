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
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  StudyTimeController,
  TeacherStudyTimeController,
} from './study-time.controller';
import { StudyTimeService } from './study-time.service';

describe('P4-A contrato HTTP (guards sustituidos)', () => {
  let app: INestApplication;
  const service = {
    synchronize: jest.fn(),
    ownSummary: jest.fn(),
    teacherSummary: jest.fn(),
  };
  const id = '11111111-1111-4111-8111-111111111111';
  const event = {
    eventoId: `pomodoro:${id}`,
    duracionSegundos: 1500,
    finalizadoEn: '2026-09-13T15:00:00Z',
  };
  const body = { version: 1, eventos: [event] };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [StudyTimeController, TeacherStudyTimeController],
      providers: [{ provide: StudyTimeService, useValue: service }],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest<AuthenticatedRequest>().usuario = {
            sub: id,
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
  it('requiere sesión/correo y añade guarda docente a la ficha', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, StudyTimeController)).toEqual([
      JwtGuard,
      EmailVerificadoGuard,
    ]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, TeacherStudyTimeController),
    ).toEqual([
      JwtGuard,
      EmailVerificadoGuard,
      InstitutionOperationalGuard,
      ProfesorInstitucionGuard,
    ]);
  });
  it('usa solo actor de sesión, devuelve no-store y no acepta identidad por cuerpo', async () => {
    const response = await request(server())
      .post('/tiempo-estudio/me/pomodoros')
      .send(body)
      .expect(201);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(service.synchronize).toHaveBeenCalledWith(id, body);
    await request(server())
      .post('/tiempo-estudio/me/pomodoros')
      .send({ ...body, usuarioId: id })
      .expect(400);
  });
  it.each([
    { ...body, version: 2 },
    { ...body, eventos: [] },
    { ...body, eventos: Array(51).fill(event) },
    { ...body, eventos: [{ ...event, eventoId: `practice:${id}` }] },
    { ...body, eventos: [{ ...event, duracionSegundos: 1499 }] },
    { ...body, eventos: [{ ...event, finalizadoEn: '2026-09-13T15:00:00' }] },
    { ...body, eventos: [{ ...event, finalizadoEn: '2026-02-31T15:00:00Z' }] },
    { ...body, eventos: [{ ...event, xp: 10 }] },
    { ...body, eventos: [{ ...event, usuarioId: id }] },
  ])('rechaza cuerpo fuera del contrato %j', async (invalid) => {
    await request(server())
      .post('/tiempo-estudio/me/pomodoros')
      .send(invalid)
      .expect(400);
    expect(service.synchronize).not.toHaveBeenCalled();
  });
  it.each(['7', '30', '90'])(
    'consulta propia y docente de %s días, ambas sin caché',
    async (days) => {
      const own = await request(server())
        .get(`/tiempo-estudio/me?dias=${days}`)
        .expect(200);
      expect(own.headers['cache-control']).toBe('private, no-store');
      expect(service.ownSummary).toHaveBeenCalledWith(id, Number(days));
      const teacher = await request(server())
        .get(`/instituciones/me/estudiantes/${id}/evolucion?dias=${days}`)
        .expect(200);
      expect(teacher.headers['cache-control']).toBe('private, no-store');
      expect(service.teacherSummary).toHaveBeenCalledWith(id, id, Number(days));
    },
  );
  it.each(['0', '1', '31', '91', '7.1', 'abc'])(
    'rechaza ventana %s antes de leer',
    async (days) => {
      await request(server())
        .get(`/tiempo-estudio/me?dias=${days}`)
        .expect(400);
      expect(service.ownSummary).not.toHaveBeenCalled();
    },
  );
  it('valida UUID, campos extra y ventana predeterminada', async () => {
    await request(server())
      .get('/instituciones/me/estudiantes/bad/evolucion')
      .expect(400);
    await request(server())
      .get(`/tiempo-estudio/me?usuarioId=${id}`)
      .expect(400);
    await request(server()).get('/tiempo-estudio/me').expect(200);
    expect(service.ownSummary).toHaveBeenCalledWith(id, 30);
  });
});
