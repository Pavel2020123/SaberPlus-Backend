import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { TiraAflojaWsAuthService } from '../tira-afloja/tira-afloja-ws-auth.service';
import { AdminGuard, JwtGuard } from './jwt.guard';
import { Socket } from 'socket.io';

describe('Revocación persistida en guards HTTP y socket', () => {
  const row = {
    id: 'user',
    nombre: 'Synthetic',
    correo: null,
    rol: 'ESTUDIANTE',
    institucionId: 'institution',
    versionSesion: 2,
    debeCambiarContrasena: false,
  };
  const prisma = {
    usuario: { findUnique: jest.fn() },
  } as unknown as PrismaService;
  const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
  const request = { headers: { authorization: 'Bearer signed' } };
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ ...request }) }),
    getHandler: () => function read() {},
  } as unknown as ExecutionContext;
  const socket = {
    handshake: { auth: { token: 'signed' }, headers: {} },
  } as unknown as Socket;
  beforeEach(() => {
    jest.resetAllMocks();
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(row);
  });
  it.each([undefined, 0, 1, 3])(
    'JWT firmado pero versión %p ya no autoriza HTTP',
    async (versionSesion) => {
      (jwt.verifyAsync as jest.Mock).mockResolvedValue({
        sub: 'user',
        versionSesion,
      });
      await expect(
        new JwtGuard(jwt, prisma).canActivate(context),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    },
  );
  it('HTTP admite solo la versión que sigue en la base de datos', async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'user',
      versionSesion: 2,
    });
    await expect(new JwtGuard(jwt, prisma).canActivate(context)).resolves.toBe(
      true,
    );
  });
  it('ADMIN también comprueba la revocación', async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
      ...row,
      rol: 'ADMIN',
    });
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'user',
      versionSesion: 1,
    });
    await expect(
      new AdminGuard(jwt, prisma).canActivate(context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('socket rechaza la firma antigua y admite sesión nueva', async () => {
    const auth = new TiraAflojaWsAuthService(jwt, prisma);
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'user',
      versionSesion: 1,
    });
    await expect(auth.autenticar(socket)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'user',
      versionSesion: 2,
    });
    await expect(auth.autenticar(socket)).resolves.toMatchObject({
      id: 'user',
    });
  });
});
