import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReferidosService } from '../referidos/referidos.service';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({ hash: jest.fn(), compare: jest.fn() }));

describe('AuthService: consumo de credenciales y acceso académico', () => {
  const now = new Date('2026-09-08T18:00:00Z');
  const expires = new Date(now.getTime() + 60_000);
  const usuario = {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
    update: jest.fn(),
  };
  const prisma = { usuario } as unknown as PrismaService;
  const service = new AuthService(
    prisma,
    {} as JwtService,
    {} as MailService,
    {} as ReferidosService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hash-nuevo');
    usuario.findUnique.mockResolvedValue({
      id: 'student-1',
      rol: 'ESTUDIANTE',
      institucionId: null,
      correoVerificado: false,
      tokenVerificacion: 'verificacion',
      tokenVerificacionExpira: expires,
      tokenRecuperacion: 'recuperacion',
      tokenRecuperacionExpira: expires,
      debeCambiarContrasena: true,
      contrasenaHash: 'hash-temporal',
      fechaVencimientoPlan: new Date('2020-01-01T00:00:00Z'),
    });
    usuario.updateMany.mockResolvedValue({ count: 1 });
  });
  afterEach(() => jest.useRealTimers());

  it.each(['verificacion', 'recuperacion'] as const)(
    'rechaza %s sin usuario',
    async (kind) => {
      usuario.findUnique.mockResolvedValue(null);
      const result =
        kind === 'verificacion'
          ? service.verificarCorreo('token')
          : service.restablecerContrasena('token', 'ClaveSegura1');
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      expect(usuario.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([null, new Date('2020-01-01'), now])(
    'rechaza recuperación con vencimiento %s',
    async (expiration) => {
      usuario.findUnique.mockResolvedValue({
        id: 'student-1',
        tokenRecuperacionExpira: expiration,
      });
      await expect(
        service.restablecerContrasena('token', 'ClaveSegura1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(bcrypt.hash).not.toHaveBeenCalled();
      expect(usuario.updateMany).not.toHaveBeenCalled();
    },
  );

  it.each([null, new Date('2020-01-01'), now])(
    'rechaza verificación con vencimiento %s',
    async (expiration) => {
      usuario.findUnique.mockResolvedValue({
        id: 'student-1',
        tokenVerificacionExpira: expiration,
      });
      await expect(service.verificarCorreo('token')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(usuario.updateMany).not.toHaveBeenCalled();
    },
  );

  it('confirma correo sin crear una prueba pagada ni modificar vigencias anteriores', async () => {
    await service.verificarCorreo('verificacion');
    expect(usuario.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'student-1',
        tokenVerificacion: 'verificacion',
        tokenVerificacionExpira: { gt: now },
        correoVerificado: false,
      },
      data: {
        correoVerificado: true,
        tokenVerificacion: null,
        tokenVerificacionExpira: null,
      },
    });
  });

  it('consume recuperación una sola vez y completa el cambio de clave temporal', async () => {
    await service.restablecerContrasena('recuperacion', 'ClaveSegura1');
    expect(usuario.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'student-1',
        tokenRecuperacion: 'recuperacion',
        tokenRecuperacionExpira: { gt: now },
      },
      data: {
        contrasenaHash: 'hash-nuevo',
        tokenRecuperacion: null,
        tokenRecuperacionExpira: null,
        debeCambiarContrasena: false,
      },
    });
    expect(usuario.update).not.toHaveBeenCalled();
  });

  it.each(['verificacion', 'recuperacion'] as const)(
    'un token de %s consumido/reemplazado no vuelve a escribir',
    async (kind) => {
      usuario.updateMany.mockResolvedValue({ count: 0 });
      const result =
        kind === 'verificacion'
          ? service.verificarCorreo('token')
          : service.restablecerContrasena('token', 'ClaveSegura1');
      await expect(result).rejects.toBeInstanceOf(BadRequestException);
      expect(usuario.update).not.toHaveBeenCalled();
    },
  );

  it('vuelve a comprobar expiración después de calcular el hash', async () => {
    (bcrypt.hash as jest.Mock).mockImplementation(() => {
      jest.setSystemTime(expires);
      return Promise.resolve('hash-nuevo');
    });
    usuario.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.restablecerContrasena('token', 'ClaveSegura1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usuario.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'student-1',
        tokenRecuperacion: 'token',
        tokenRecuperacionExpira: { gt: expires },
      },
      data: {
        contrasenaHash: 'hash-nuevo',
        tokenRecuperacion: null,
        tokenRecuperacionExpira: null,
        debeCambiarContrasena: false,
      },
    });
  });

  it('dos recuperaciones paralelas reciben un único resultado exitoso de CAS', async () => {
    let unused = true;
    usuario.updateMany.mockImplementation(() => {
      const count = unused ? 1 : 0;
      unused = false;
      return Promise.resolve({ count });
    });
    const results = await Promise.allSettled([
      service.restablecerContrasena('token', 'Primera1'),
      service.restablecerContrasena('token', 'Segunda1'),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });

  it('el cambio inicial rechaza una sesión sin usuario existente', async () => {
    usuario.findUnique.mockResolvedValue(null);
    await expect(
      service.cambiarContrasenaInicial('student-1', 'ClaveSegura1'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usuario.updateMany).not.toHaveBeenCalled();
  });

  it('una sesión normal no puede usar el cambio inicial como cambio general sin clave actual', async () => {
    usuario.findUnique.mockResolvedValue({ debeCambiarContrasena: false });
    await expect(
      service.cambiarContrasenaInicial('student-1', 'ClaveSegura1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(bcrypt.hash).not.toHaveBeenCalled();
    expect(usuario.updateMany).not.toHaveBeenCalled();
  });

  it('consume el cambio inicial únicamente para el hash temporal revisado', async () => {
    await service.cambiarContrasenaInicial('student-1', 'ClaveSegura1');
    expect(usuario.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'student-1',
        debeCambiarContrasena: true,
        contrasenaHash: 'hash-temporal',
      },
      data: {
        contrasenaHash: 'hash-nuevo',
        debeCambiarContrasena: false,
        tokenRecuperacion: null,
        tokenRecuperacionExpira: null,
      },
    });
  });

  it('rechaza un cambio inicial si la contraseña ya cambió durante bcrypt', async () => {
    usuario.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.cambiarContrasenaInicial('student-1', 'ClaveSegura1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el perfil no bloquea estudio por un plan legado vencido', async () => {
    await expect(service.obtenerPerfil('student-1')).resolves.toMatchObject({
      planVencido: false,
      requiereVerificacionCorreo: true,
    });
  });
});
