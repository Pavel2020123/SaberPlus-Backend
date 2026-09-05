import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RolUsuario } from '@prisma/client';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { TiraAflojaWsAuthService } from './tira-afloja-ws-auth.service';

describe('TiraAflojaWsAuthService', () => {
  const verificar = jest.fn();
  const buscarUsuario = jest.fn();
  const jwt = { verifyAsync: verificar } as unknown as JwtService;
  const prisma = {
    usuario: { findUnique: buscarUsuario },
  } as unknown as PrismaService;
  const servicio = new TiraAflojaWsAuthService(jwt, prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    verificar.mockResolvedValue({ sub: 'usuario-1' });
    buscarUsuario.mockResolvedValue({
      id: 'usuario-1',
      nombre: 'Ana',
      rol: RolUsuario.ESTUDIANTE,
      institucionId: null,
      correoVerificado: true,
    });
  });

  it('autentica el token enviado en handshake.auth', async () => {
    const resultado = await servicio.autenticar(
      socket({ auth: { token: 'Bearer token-valido' }, headers: {} }),
    );

    expect(verificar).toHaveBeenCalledWith('token-valido');
    expect(resultado).toEqual({ id: 'usuario-1', nombre: 'Ana' });
  });

  it('admite Authorization como respaldo', async () => {
    await servicio.autenticar(
      socket({ auth: {}, headers: { authorization: 'Bearer alterno' } }),
    );

    expect(verificar).toHaveBeenCalledWith('alterno');
  });

  it('no acepta tokens en la URL', async () => {
    await expect(
      servicio.autenticar(
        socket({ auth: {}, headers: {}, query: { token: 'visible' } }),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verificar).not.toHaveBeenCalled();
  });

  it('rechaza cuentas que no son de estudiante', async () => {
    buscarUsuario.mockResolvedValue({
      id: 'profesor-1',
      nombre: 'Profe',
      rol: RolUsuario.PROFESOR,
      institucionId: null,
      correoVerificado: true,
    });

    await expect(
      servicio.autenticar(socket({ auth: { token: 'token' }, headers: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rechaza al estudiante individual sin correo verificado', async () => {
    buscarUsuario.mockResolvedValue({
      id: 'usuario-1',
      nombre: 'Ana',
      rol: RolUsuario.ESTUDIANTE,
      institucionId: null,
      correoVerificado: false,
    });

    await expect(
      servicio.autenticar(socket({ auth: { token: 'token' }, headers: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

function socket(handshake: {
  auth: Record<string, unknown>;
  headers: { authorization?: string };
  query?: Record<string, string>;
}): Socket {
  return { handshake } as unknown as Socket;
}
