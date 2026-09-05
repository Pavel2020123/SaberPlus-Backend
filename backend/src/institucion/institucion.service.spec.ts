import { JwtService } from '@nestjs/jwt';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { InstitucionService } from './institucion.service';

describe('InstitucionService', () => {
  const tx = {
    institucion: { create: jest.fn() },
    miembroInstitucion: { create: jest.fn() },
    solicitudIngresoInstitucion: { updateMany: jest.fn() },
    invitacionInstitucion: { updateMany: jest.fn() },
    auditoriaInstitucion: { create: jest.fn() },
  };
  const prisma = {
    usuario: { findUnique: jest.fn() },
    institucion: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new InstitucionService(
    prisma,
    {} as JwtService,
    {} as InstitucionAccesoService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operation: (client: typeof tx) => unknown) => operation(tx),
    );
  });

  it('convierte al primer profesor en propietario dentro de una transacción', async () => {
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
      institucionId: null,
      rol: 'PROFESOR',
      correo: 'profesor@saberplus.com',
    });
    (prisma.institucion.findUnique as jest.Mock).mockResolvedValue(null);
    tx.institucion.create.mockResolvedValue({
      id: 'institucion-1',
      nombre: 'Colegio Central',
    });
    tx.miembroInstitucion.create.mockResolvedValue({ id: 'miembro-1' });
    tx.solicitudIngresoInstitucion.updateMany.mockResolvedValue({ count: 0 });
    tx.invitacionInstitucion.updateMany.mockResolvedValue({ count: 0 });
    tx.auditoriaInstitucion.create.mockResolvedValue({ id: 'auditoria-1' });

    await service.crearInstitucion(
      'profesor-1',
      ' Colegio Central ',
      ' Bienvenidos ',
    );

    expect(tx.institucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nombre: 'Colegio Central',
        planActual: 'GRATIS',
        limiteGrupos: 1,
        limiteEstudiantes: 40,
        mensajeBienvenida: 'Bienvenidos',
        Usuario: { connect: { id: 'profesor-1' } },
      }),
    });
    expect(tx.miembroInstitucion.create).toHaveBeenCalledWith({
      data: {
        institucionId: 'institucion-1',
        usuarioId: 'profesor-1',
        rol: 'PROPIETARIO',
      },
    });
  });
});
