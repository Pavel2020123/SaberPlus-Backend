import { ExecutionContext, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { InstitutionOperationalGuard } from './institution-operational.guard';
import * as request from 'supertest';
import { Server } from 'node:http';
import { StudentEvidenceController } from './student-evidence.controller';
import { StudentEvidenceService } from './student-evidence.service';
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

describe('contrato HTTP de ficha docente', () => {
  let app: INestApplication;
  const obtener = jest.fn().mockResolvedValue({ version: 1 });
  beforeAll(async () => {
    // Solo sustituye autenticación para ensayar ruta/validación/cabeceras;
    // los permisos y el alcance se prueban en StudentEvidenceService.
    const module = await Test.createTestingModule({
      controllers: [StudentEvidenceController],
      providers: [{ provide: StudentEvidenceService, useValue: { obtener } }],
    })
      .overrideGuard(JwtGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          context.switchToHttp().getRequest<AuthenticatedRequest>().usuario = {
            sub: 'teacher',
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
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => obtener.mockClear());

  it('valida UUID y no invoca el servicio para un ID inválido', async () => {
    await request(app.getHttpServer() as Server)
      .get('/instituciones/me/estudiantes/no-es-uuid/evidencia')
      .expect(400);
    expect(obtener).not.toHaveBeenCalled();
  });

  it('responde sin caché y no usa el actor enviado en la query', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const response = await request(app.getHttpServer() as Server)
      .get(`/instituciones/me/estudiantes/${id}/evidencia?actorId=owner`)
      .expect(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(obtener).toHaveBeenCalledWith('teacher', id);
  });
});
