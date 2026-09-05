import { BadRequestException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { ReferidosService } from '../referidos/referidos.service';
import { AuthService } from './auth.service';
import { requiereVerificacionCorreo } from './verificacion.util';

describe('AuthService roles de registro', () => {
  const usuario = { findUnique: jest.fn(), create: jest.fn() };
  const prisma = { usuario } as unknown as PrismaService;
  const mail = {
    enviarVerificacionCorreo: jest.fn(),
  } as unknown as MailService;
  const referidos = {
    prepararRegistro: jest.fn(),
  } as unknown as ReferidosService;
  const service = new AuthService(prisma, {} as JwtService, mail, referidos);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue(null);
    usuario.create.mockResolvedValue({ id: 'usuario-1' });
    (mail.enviarVerificacionCorreo as jest.Mock).mockResolvedValue(undefined);
  });

  it('crea una cuenta personal de profesor sin código monetario de referido', async () => {
    await service.registrarCuenta(
      'Andrea Docente',
      'PROFE@EJEMPLO.COM',
      'ClaveSegura1',
      'PROFESOR',
    );

    expect(usuario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correo: 'profe@ejemplo.com',
        rol: 'PROFESOR',
        codigoReferido: null,
        correoVerificado: false,
      }),
    });
    expect((referidos.prepararRegistro as jest.Mock).mock.calls).toHaveLength(
      0,
    );
  });

  it('rechaza códigos estudiantiles en el registro de profesor', async () => {
    await expect(
      service.registrarCuenta(
        'Andrea Docente',
        'profe@ejemplo.com',
        'ClaveSegura1',
        'PROFESOR',
        'SABER123',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usuario.create).not.toHaveBeenCalled();
  });

  it('exige verificar el correo de un profesor individual', () => {
    expect(
      requiereVerificacionCorreo({
        rol: 'PROFESOR',
        institucionId: null,
        correoVerificado: false,
      }),
    ).toBe(true);
  });
});
