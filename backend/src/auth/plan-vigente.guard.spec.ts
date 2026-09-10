import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { DiagnosticoController } from '../diagnostico/diagnostico.controller';
import { JwtGuard } from './jwt.guard';
import { EmailVerificadoGuard } from './email-verificado.guard';
import { PlanVigenteGuard } from './plan-vigente.guard';

describe('acceso gratuito a estudio sin alterar autenticación', () => {
  const usuario = { findUnique: jest.fn() };
  const guard = new PlanVigenteGuard({ usuario } as unknown as PrismaService);
  const context = (sub?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ usuario: sub ? { sub } : undefined }),
      }),
    }) as unknown as ExecutionContext;
  beforeEach(() => jest.resetAllMocks());

  it('permite estudiar con un plan individual antiguo vencido', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'student-1',
      rol: 'ESTUDIANTE',
      institucionId: null,
      fechaVencimientoPlan: new Date('2020-01-01'),
    });
    await expect(guard.canActivate(context('student-1'))).resolves.toBe(true);
    expect(usuario.findUnique).toHaveBeenCalledWith({
      where: { id: 'student-1' },
      select: { id: true },
    });
  });
  it('rechaza una llamada que omite el guard de sesión', async () => {
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(usuario.findUnique).not.toHaveBeenCalled();
  });
  it('rechaza un usuario eliminado', async () => {
    usuario.findUnique.mockResolvedValue(null);
    await expect(
      guard.canActivate(context('eliminado')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('diagnóstico mantiene guard de sesión y verificación', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, DiagnosticoController)).toEqual(
      [JwtGuard, EmailVerificadoGuard, PlanVigenteGuard],
    );
  });
});
