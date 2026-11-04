import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReferidosService } from '../referidos/referidos.service';
import { AuthService } from './auth.service';
jest.mock('bcrypt', () => ({ compare: jest.fn() }));

describe('Credencial gestionada consumida en el primer login', () => {
  const original = {
    id: 'managed',
    nombre: 'Ana',
    correo: null,
    identificadorInstitucional: 'ana@colegio.example',
    contrasenaHash: 'hash',
    versionSesion: 1,
    debeCambiarContrasena: true,
    temporalConsumidaEn: null,
  };
  const usuario = { findUnique: jest.fn(), updateMany: jest.fn() };
  const jwt = { signAsync: jest.fn() };
  const service = new AuthService(
    { usuario } as unknown as PrismaService,
    jwt as unknown as JwtService,
    {} as MailService,
    {} as ReferidosService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    usuario.findUnique.mockImplementation(
      ({ where }: { where: { correo?: string } }) =>
        Promise.resolve(where.correo ? null : { ...original }),
    );
    usuario.updateMany.mockResolvedValue({ count: 1 });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue('synthetic-session');
  });
  it('consume con hash y versión revisados y firma exclusivamente la versión nueva', async () => {
    await service.login(original.identificadorInstitucional, 'temporal');
    const calls = usuario.updateMany.mock.calls as unknown[][];
    const update = calls[0][0] as Prisma.UsuarioUpdateManyArgs;
    expect(update.data.temporalConsumidaEn).toBeInstanceOf(Date);
    expect(usuario.updateMany).toHaveBeenCalledWith({
      where: {
        id: original.id,
        contrasenaHash: 'hash',
        versionSesion: 1,
        debeCambiarContrasena: true,
        temporalConsumidaEn: null,
      },
      data: {
        temporalConsumidaEn: update.data.temporalConsumidaEn,
        versionSesion: { increment: 1 },
      },
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: original.id, versionSesion: 2 }),
    );
  });
  it('dos intentos correctos simultáneos solo reciben una sesión', async () => {
    let consumed = false;
    usuario.updateMany.mockImplementation(() => {
      if (consumed) return Promise.resolve({ count: 0 });
      consumed = true;
      return Promise.resolve({ count: 1 });
    });
    const results = await Promise.allSettled([
      service.login(original.identificadorInstitucional, 'temporal'),
      service.login(original.identificadorInstitucional, 'temporal'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(jwt.signAsync).toHaveBeenCalledTimes(1);
  });
  it('contraseña incorrecta no consume la temporal', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(
      service.login(original.identificadorInstitucional, 'incorrecta'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usuario.updateMany).not.toHaveBeenCalled();
  });
  it('un consumo, reset o cambio concurrente que gana impide firmar la sesión vieja', async () => {
    usuario.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.login(original.identificadorInstitucional, 'temporal'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'no consume claves permanentes o cuentas personales: alias=%s',
    async (alias) => {
      usuario.findUnique.mockResolvedValue({
        ...original,
        identificadorInstitucional: alias
          ? original.identificadorInstitucional
          : null,
        correo: alias ? null : 'ana@example.invalid',
        debeCambiarContrasena: false,
      });
      await service.login('ana@example.invalid', 'permanente');
      expect(usuario.updateMany).not.toHaveBeenCalled();
    },
  );
});
