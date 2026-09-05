import { BadRequestException, ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { GrupoService } from './grupo.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

describe('GrupoService', () => {
  const clase = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  };
  const claseProfesor = { create: jest.fn() };
  const auditoriaInstitucion = { create: jest.fn() };
  const verificarCupoGrupos = jest.fn();
  const prisma = {
    clase,
    claseProfesor,
    auditoriaInstitucion,
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const acceso = {
    obtenerMembresiaGestionable: jest.fn(),
    verificarCupoGrupos,
  } as unknown as InstitucionAccesoService;
  const service = new GrupoService(prisma, acceso);

  beforeEach(() => {
    jest.clearAllMocks();
    verificarCupoGrupos.mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operation: (client: typeof prisma) => unknown) => operation(prisma),
    );
  });

  it('un profesor consulta únicamente sus grupos asignados', async () => {
    (acceso.obtenerMembresiaGestionable as jest.Mock).mockResolvedValue({
      id: 'membership-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    clase.findMany.mockResolvedValue([]);

    await service.obtenerGruposDeMiInstitucion('teacher-1');

    expect(clase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          institucionId: 'institution-1',
          profesores: { some: { miembroId: 'membership-1' } },
        },
      }),
    );
    expect(clase.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({
          codigoIngreso: expect.anything(),
        }),
      }),
    );
  });

  it('un profesor sin rol administrativo no crea grupos', async () => {
    (acceso.obtenerMembresiaGestionable as jest.Mock).mockResolvedValue({
      id: 'membership-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    await expect(
      service.crearGrupoEnMiInstitucion('teacher-1', 'Once A', 'ONCE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(clase.create).not.toHaveBeenCalled();
  });

  it('el propietario crea el grupo y queda asignado en una transacción', async () => {
    (acceso.obtenerMembresiaGestionable as jest.Mock).mockResolvedValue({
      id: 'membership-owner',
      institucionId: 'institution-1',
      rol: 'PROPIETARIO',
    });
    clase.findUnique.mockResolvedValue(null);
    clase.create.mockResolvedValue({
      id: 'class-1',
      nombre: 'Once A',
      grado: 'ONCE',
    });
    claseProfesor.create.mockResolvedValue({});
    auditoriaInstitucion.create.mockResolvedValue({});

    await service.crearGrupoEnMiInstitucion('owner-1', ' Once A ', 'ONCE');

    expect(clase.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        nombre: 'Once A',
        grado: 'ONCE',
        institucionId: 'institution-1',
        codigoIngreso: expect.stringMatching(/^LEGACY-/),
      }),
      select: { id: true, nombre: true, grado: true },
    });
    expect(claseProfesor.create).toHaveBeenCalledWith({
      data: { claseId: 'class-1', miembroId: 'membership-owner' },
    });
    expect(verificarCupoGrupos).toHaveBeenCalledWith('institution-1', prisma);
  });

  it('deshabilita la unión inmediata con códigos permanentes', () => {
    expect(() => service.unirseAClase()).toThrow(BadRequestException);
  });
});
