import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionService } from '../institucion/institucion.service';
import { InstitucionAccesoService } from '../institucion/institucion-acceso.service';
import { AdminService } from './admin.service';

describe('LIC-4 rutas heredadas no suprimen datos directamente', () => {
  const remove = jest.fn();
  const transaction = jest.fn();
  const findUnique = jest.fn().mockResolvedValue({ id: 'owner', rol: 'ADMIN' });
  const prisma = {
    usuario: { findUnique, delete: remove },
    institucion: { delete: remove },
    $transaction: transaction,
  } as unknown as PrismaService;
  beforeEach(() => jest.clearAllMocks());
  it('ADMIN debe usar solicitud revisada, no delete directo de Usuario', async () => {
    await expect(
      new AdminService(prisma).eliminarUsuario('student', 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(remove).not.toHaveBeenCalled();
  });
  it('el colegio no elimina institución ni desvincula masivamente por la ruta antigua', async () => {
    const service = new InstitucionService(
      prisma,
      {} as JwtService,
      {} as InstitucionAccesoService,
    );
    await expect(service.eliminarMiInstitucion('owner')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});
