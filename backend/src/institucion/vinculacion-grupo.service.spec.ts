import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { VinculacionGrupoService } from './vinculacion-grupo.service';

describe('VinculacionGrupoService', () => {
  const usuario = {
    findUnique: jest.fn(),
    updateMany: jest.fn(),
  };
  const codigoTemporalGrupo = {
    findUnique: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const claseEstudiante = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
  };
  const auditoriaInstitucion = { create: jest.fn() };
  const prisma = {
    usuario,
    codigoTemporalGrupo,
    claseEstudiante,
    auditoriaInstitucion,
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const acceso = {
    obtenerGrupoGestionable: jest.fn(),
    verificarCupoDisponible: jest.fn(),
  } as unknown as InstitucionAccesoService;
  const service = new VinculacionGrupoService(prisma, acceso);

  const codigoVigente = {
    id: 'code-1',
    sufijo: 'EFGH',
    activo: true,
    usos: 1,
    usosMaximos: 20,
    fechaExpiracion: new Date(Date.now() + 60000),
    clase: {
      id: 'class-1',
      nombre: 'Once A',
      grado: 'ONCE',
      institucionId: 'institution-1',
      Institucion: { id: 'institution-1', nombre: 'Colegio Central' },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operation: (client: typeof prisma) => unknown) => operation(prisma),
    );
    usuario.findUnique.mockResolvedValue({
      id: 'student-1',
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
    codigoTemporalGrupo.findUnique.mockResolvedValue(codigoVigente);
    claseEstudiante.findUnique.mockResolvedValue(null);
    (acceso.verificarCupoDisponible as jest.Mock).mockResolvedValue(undefined);
    auditoriaInstitucion.create.mockResolvedValue({ id: 'audit-1' });
  });

  it('muestra el destino sin vincular ni consumir el código', async () => {
    await expect(
      service.vistaPrevia('student-1', 'grp-abcdefgh'),
    ).resolves.toMatchObject({
      estado: 'DISPONIBLE',
      requiereAceptacion: true,
      puedeUnirse: true,
      grupo: { nombre: 'Once A', grado: 'ONCE' },
      institucion: { nombre: 'Colegio Central' },
      codigo: { usosDisponibles: 19 },
    });
    expect(codigoTemporalGrupo.updateMany).not.toHaveBeenCalled();
    expect(claseEstudiante.create).not.toHaveBeenCalled();
  });

  it('no revela si un código mal formado existió', async () => {
    await expect(
      service.vistaPrevia('student-1', 'codigo-antiguo'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(codigoTemporalGrupo.findUnique).not.toHaveBeenCalled();
  });

  it('exige la aceptación explícita antes de consultar o escribir', async () => {
    await expect(
      service.aceptarIngreso('student-1', 'GRP-ABCDEFGH', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(usuario.findUnique).not.toHaveBeenCalled();
    expect(claseEstudiante.create).not.toHaveBeenCalled();
  });

  it('impide usar el código para cambiar de institución', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'student-1',
      rol: 'ESTUDIANTE',
      institucionId: 'institution-2',
    });
    await expect(
      service.aceptarIngreso('student-1', 'GRP-ABCDEFGH', true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(codigoTemporalGrupo.updateMany).not.toHaveBeenCalled();
  });

  it('consume un uso y registra cómo aceptó el estudiante', async () => {
    codigoTemporalGrupo.updateMany.mockResolvedValue({ count: 1 });
    usuario.updateMany.mockResolvedValue({ count: 1 });
    claseEstudiante.create.mockResolvedValue({
      usuarioId: 'student-1',
      claseId: 'class-1',
    });

    await expect(
      service.aceptarIngreso('student-1', 'GRP-ABCDEFGH', true),
    ).resolves.toMatchObject({
      grupo: { id: 'class-1', nombre: 'Once A' },
      institucion: { id: 'institution-1' },
    });
    expect(codigoTemporalGrupo.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: 'code-1',
        activo: true,
        usos: { lt: 20 },
      }),
      data: { usos: { increment: 1 } },
    });
    expect(claseEstudiante.create).toHaveBeenCalledWith({
      data: {
        usuarioId: 'student-1',
        claseId: 'class-1',
        codigoTemporalId: 'code-1',
        aceptacionExplicita: true,
      },
    });
  });

  it('entrega el código una vez y persiste únicamente su hash', async () => {
    (acceso.obtenerGrupoGestionable as jest.Mock).mockResolvedValue({
      membresia: {
        id: 'membership-1',
        institucionId: 'institution-1',
        rol: 'PROPIETARIO',
      },
      grupo: { id: 'class-1', nombre: 'Once A', grado: 'ONCE' },
    });
    codigoTemporalGrupo.findUnique.mockResolvedValue(null);
    codigoTemporalGrupo.create.mockResolvedValue({
      id: 'code-1',
      sufijo: '2345',
      usos: 0,
      usosMaximos: 40,
      fechaExpiracion: new Date('2026-09-02T12:00:00Z'),
      fechaCreacion: new Date('2026-09-01T12:00:00Z'),
    });

    const result = await service.crearCodigo('owner-1', 'class-1', 60, 40);

    expect(result.codigo).toMatch(/^GRP-[A-Z2-9]{8}$/);
    expect(codigoTemporalGrupo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          codigoHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      }),
    );
    expect(codigoTemporalGrupo.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ codigoHash: result.codigo }),
      }),
    );
  });
});
