import { NotFoundException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService - plan institucional', () => {
  const institucion = {
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const auditoriaInstitucion = { create: jest.fn() };
  const prisma = {
    institucion,
    auditoriaInstitucion,
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new AdminService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    institucion.findUnique.mockResolvedValue({
      id: 'institution-1',
      planActual: 'GRATIS',
    });
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operation: (client: typeof prisma) => unknown) => operation(prisma),
    );
    auditoriaInstitucion.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('activa cinco grupos, 200 estudiantes y registra auditoría', async () => {
    const expiration = new Date('2027-03-01T00:00:00Z');
    institucion.update.mockResolvedValue({
      id: 'institution-1',
      nombre: 'Colegio Central',
      planActual: 'SIN_ANUNCIOS',
      limiteGrupos: 5,
      limiteEstudiantes: 200,
      fechaVencimientoPlan: expiration,
    });

    await service.actualizarPlanInstitucional(
      'institution-1',
      'admin-1',
      'SIN_ANUNCIOS',
      expiration,
    );

    expect(institucion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planActual: 'SIN_ANUNCIOS',
          limiteGrupos: 5,
          limiteEstudiantes: 200,
          fechaVencimientoPlan: expiration,
        }),
      }),
    );
    expect(auditoriaInstitucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        institucionId: 'institution-1',
        actorId: 'admin-1',
        accion: 'PLAN_INSTITUCIONAL_ACTUALIZADO',
      }),
    });
  });

  it('restaura los límites gratuitos al retirar el plan', async () => {
    institucion.update.mockResolvedValue({
      id: 'institution-1',
      nombre: 'Colegio Central',
      planActual: 'GRATIS',
      limiteGrupos: 1,
      limiteEstudiantes: 40,
      fechaVencimientoPlan: null,
    });

    await service.actualizarPlanInstitucional(
      'institution-1',
      'admin-1',
      'GRATIS',
    );

    expect(institucion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planActual: 'GRATIS',
          limiteGrupos: 1,
          limiteEstudiantes: 40,
          fechaVencimientoPlan: null,
        }),
      }),
    );
  });

  it('rechaza una institución inexistente', async () => {
    institucion.findUnique.mockResolvedValue(null);

    await expect(
      service.actualizarPlanInstitucional('missing', 'admin-1', 'SIN_ANUNCIOS'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(institucion.update).not.toHaveBeenCalled();
  });
});
