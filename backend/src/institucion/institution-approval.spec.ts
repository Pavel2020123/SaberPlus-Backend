import { ExecutionContext, ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard, JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  InstitutionApprovalController,
  InstitutionRegistrationController,
} from './institution-approval.controller';
import { InstitutionOperationalGuard } from './institution-operational.guard';
import { institutionOperational } from './institution-approval.policy';
import {
  SubmitInstitutionDto,
  ReviewInstitutionDto,
} from './institution-approval.dto';

describe('P4-C permisos y contrato', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const submission = {
    revision: 0,
    nombre: 'Colegio de ensayo',
    ciudad: 'Bogotá',
    correoInstitucional: 'colegio@example.com',
    contacto: 'Representante institucional',
    evidencia: 'Trabajo en la institución y estoy autorizado a representarla.',
    declaracion: true,
  };
  const decision = {
    revision: 1,
    estado: 'APROBADA',
    mensaje: 'Respuesta para el solicitante.',
    notaInterna: 'Comprobación de la autorización.',
    confirmado: true,
  };
  it('solo ADMIN modera y profesor requiere sesión y correo', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InstitutionApprovalController),
    ).toEqual([AdminGuard]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, InstitutionRegistrationController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
  });
  it('valida los dos contratos sin campos privilegiados', async () => {
    await expect(
      pipe.transform(submission, {
        type: 'body',
        metatype: SubmitInstitutionDto,
      }),
    ).resolves.toMatchObject(submission);
    await expect(
      pipe.transform(decision, {
        type: 'body',
        metatype: ReviewInstitutionDto,
      }),
    ).resolves.toMatchObject(decision);
    for (const extra of [
      { estado: 'APROBADA' },
      { solicitanteId: 'another' },
      { institucionId: 'another' },
    ]) {
      await expect(
        pipe.transform(
          { ...submission, ...extra },
          { type: 'body', metatype: SubmitInstitutionDto },
        ),
      ).rejects.toThrow();
    }
  });
  it.each([false, 'true', 'false', 1, null, undefined])(
    'no convierte una confirmación inválida %s en consentimiento',
    async (value) => {
      await expect(
        pipe.transform(
          { ...submission, declaracion: value },
          { type: 'body', metatype: SubmitInstitutionDto },
        ),
      ).rejects.toThrow();
      await expect(
        pipe.transform(
          { ...decision, confirmado: value },
          { type: 'body', metatype: ReviewInstitutionDto },
        ),
      ).rejects.toThrow();
    },
  );
  it.each(['http://example.com', 'javascript:alert(1)', 'file:///private'])(
    'rechaza referencias no HTTPS %s',
    async (referenciaUrl) => {
      await expect(
        pipe.transform(
          { ...submission, referenciaUrl },
          { type: 'body', metatype: SubmitInstitutionDto },
        ),
      ).rejects.toThrow();
    },
  );
  it('solo aprobación o transición futura habilitan funciones institucionales', () => {
    const now = new Date('2026-09-17T12:00:00Z');
    expect(
      institutionOperational({ estadoVerificacion: 'APROBADA' }, now),
    ).toBe(true);
    for (const state of [
      'PENDIENTE',
      'REQUIERE_INFORMACION',
      'RECHAZADA',
      'SUSPENDIDA',
      undefined,
    ])
      expect(institutionOperational({ estadoVerificacion: state }, now)).toBe(
        false,
      );
    expect(institutionOperational(null, now)).toBe(false);
    expect(
      institutionOperational(
        { estadoVerificacion: 'LEGADO_EN_REVISION', transicionHasta: now },
        now,
      ),
    ).toBe(false);
    expect(
      institutionOperational(
        {
          estadoVerificacion: 'LEGADO_EN_REVISION',
          transicionHasta: new Date(now.getTime() + 1),
        },
        now,
      ),
    ).toBe(true);
  });
  it('la guarda consulta PostgreSQL en cada petición y rechaza suspensión', async () => {
    const findUnique = jest
      .fn()
      .mockResolvedValue({ estadoVerificacion: 'SUSPENDIDA' });
    const guard = new InstitutionOperationalGuard(
      { institucion: { findUnique } } as unknown as PrismaService,
      new Reflector(),
    );
    const context = {
      getHandler: () => function handler() {},
      switchToHttp: () => ({
        getRequest: () => ({
          usuario: { sub: 'teacher', institucionId: 'institution' },
        }),
      }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(context)).rejects.toThrow();
    findUnique.mockResolvedValue({ estadoVerificacion: 'APROBADA' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(findUnique).toHaveBeenCalledTimes(2);
  });
});
