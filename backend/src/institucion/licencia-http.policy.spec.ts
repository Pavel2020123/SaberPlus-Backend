import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LicenciaAccesoService } from './licencia-acceso.service';
import { politicaHttpLicencia } from './licencia-http.policy';

describe('institutional HTTP enforcement', () => {
  it.each([
    ['AuthController', 'obtenerPerfil', 'CONSULTA'],
    ['SimulacroController', 'historialRespuestas', 'CONSULTA'],
    ['SimulacroController', 'calificar', 'INTENTO'],
    ['DiagnosticoController', 'obtenerEstado', 'INTENTO'],
    ['DiagnosticoController', 'iniciar', 'NUEVO'],
    ['SimulacroController', 'obtenerTemas', 'NUEVO'],
    ['EditorialResourceController', 'content', 'INTENTO'],
    ['UnknownController', 'historial', 'NUEVO'],
    ['SimulacroController', 'newHandler', 'NUEVO'],
    ['LicenciaInstitucionalController', 'renovar', 'CONSULTA'],
    ['SupresionCuentaController', 'solicitar', 'CONSULTA'],
    ['SupresionCuentaController', 'revisar', 'CONSULTA'],
  ])('classifies the server handler %s.%s', (controller, method, expected) => {
    expect(politicaHttpLicencia(controller, method)).toBe(expected);
  });
  function fixture(controller: string, method: string) {
    const request = {
      headers: { authorization: 'Bearer verified-token' },
      // Client-controlled values cannot select the history policy.
      body: { controller: 'AuthController', handler: 'obtenerPerfil' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
      getClass: () => ({ name: controller }),
      getHandler: () => ({ name: method }),
    } as unknown as ExecutionContext;
    const exigirPractica = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('Expired'));
    const guard = new JwtGuard(
      {
        verifyAsync: jest.fn().mockResolvedValue({ sub: 'student' }),
      } as unknown as JwtService,
      {
        usuario: {
          findUnique: jest.fn().mockResolvedValue({
            rol: 'ESTUDIANTE',
            nombre: 'Student',
            correo: 's@example.invalid',
          }),
        },
      } as unknown as PrismaService,
      new Reflector(),
      { exigirPractica } as unknown as LicenciaAccesoService,
    );
    return { guard, context, exigirPractica };
  }
  it('denies new practice from the verified identity despite a spoofed request body', async () => {
    const f = fixture('SimulacroController', 'obtenerSimulacro');
    await expect(f.guard.canActivate(f.context)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(f.exigirPractica).toHaveBeenCalledWith('student');
  });
  it('preserves history and delegates owned-attempt deadlines to their services', async () => {
    for (const [c, m] of [
      ['SimulacroController', 'historial'],
      ['DiagnosticoController', 'finalizar'],
    ]) {
      const f = fixture(c, m);
      await expect(f.guard.canActivate(f.context)).resolves.toBe(true);
      expect(f.exigirPractica).not.toHaveBeenCalled();
    }
  });
});
