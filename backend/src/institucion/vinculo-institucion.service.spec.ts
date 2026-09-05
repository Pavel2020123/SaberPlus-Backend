import { ForbiddenException, NotFoundException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { VinculoInstitucionService } from './vinculo-institucion.service';

describe('VinculoInstitucionService', () => {
  const usuario = { findUnique: jest.fn(), count: jest.fn() };
  const institucion = { findUnique: jest.fn() };
  const clase = { count: jest.fn() };
  const miembroInstitucion = { count: jest.fn() };
  const solicitudIngresoInstitucion = {
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const invitacionInstitucion = {
    updateMany: jest.fn(),
    findMany: jest.fn(),
  };
  const prisma = {
    usuario,
    institucion,
    clase,
    miembroInstitucion,
    solicitudIngresoInstitucion,
    invitacionInstitucion,
  } as unknown as PrismaService;
  const service = new VinculoInstitucionService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    invitacionInstitucion.updateMany.mockResolvedValue({ count: 0 });
    invitacionInstitucion.findMany.mockResolvedValue([]);
  });

  it('muestra la solicitud pendiente sin vincular al profesor todavía', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      correo: 'profesor@saberplus.com',
      institucionId: null,
      membresiaInstitucion: null,
    });
    solicitudIngresoInstitucion.findFirst.mockResolvedValue({
      id: 'solicitud-1',
      estado: 'PENDIENTE',
      mensaje: null,
      fechaCreacion: new Date('2026-08-31T20:00:00Z'),
      institucion: { nombre: 'Colegio Central', codigoUnico: 'INST-ABC123' },
    });

    await expect(
      service.obtenerContextoProfesor('profesor-1'),
    ).resolves.toEqual(
      expect.objectContaining({
        estado: 'SOLICITUD_PENDIENTE',
        institucion: null,
        membresia: null,
      }),
    );
  });

  it('entrega el vínculo propio y únicamente métricas agregadas', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      correo: 'profesor@saberplus.com',
      institucionId: 'institucion-1',
      membresiaInstitucion: { rol: 'PROPIETARIO' },
    });
    institucion.findUnique.mockResolvedValue({
      id: 'institucion-1',
      nombre: 'Colegio Central',
      codigoUnico: 'INST-ABC123',
      planActual: 'GRATIS',
      logoUrl: null,
      mensajeBienvenida: null,
      calendarioIcfes: 'A',
      limiteGrupos: 1,
      limiteEstudiantes: 40,
    });
    usuario.count.mockResolvedValue(12);
    clase.count.mockResolvedValue(1);
    miembroInstitucion.count.mockResolvedValue(2);

    const resultado = await service.obtenerContextoProfesor('profesor-1');

    expect(resultado).toMatchObject({
      estado: 'VINCULADO',
      membresia: { rol: 'PROPIETARIO' },
      institucion: {
        totalEstudiantes: 12,
        totalGrupos: 1,
        totalProfesores: 2,
        limiteGrupos: 1,
        limiteEstudiantes: 40,
        publicidadHabilitada: true,
        nivelAnalitica: 'BASICA',
      },
    });
    expect(resultado).not.toHaveProperty('usuarios');
  });

  it('normaliza el código y crea una solicitud sin vincular la cuenta', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: null,
    });
    institucion.findUnique.mockResolvedValue({
      id: 'institucion-1',
      nombre: 'Colegio Central',
      codigoUnico: 'INST-ABC123',
    });
    solicitudIngresoInstitucion.findFirst.mockResolvedValue(null);
    solicitudIngresoInstitucion.create.mockResolvedValue({
      id: 'solicitud-1',
      estado: 'PENDIENTE',
      mensaje: 'Soy docente de matemáticas.',
      fechaCreacion: new Date('2026-08-31T20:00:00Z'),
    });

    await service.solicitarIngreso(
      'profesor-1',
      ' inst-abc123 ',
      ' Soy docente de matemáticas. ',
    );

    expect(institucion.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { codigoUnico: 'INST-ABC123' } }),
    );
    expect(solicitudIngresoInstitucion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          solicitanteId: 'profesor-1',
          institucionId: 'institucion-1',
          mensaje: 'Soy docente de matemáticas.',
        }),
      }),
    );
    expect(usuario.findUnique).toHaveBeenCalledTimes(1);
  });

  it('impide que una cuenta de estudiante solicite acceso docente', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: null,
    });

    await expect(
      service.solicitarIngreso('estudiante-1', 'INST-ABC123'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(institucion.findUnique).not.toHaveBeenCalled();
  });

  it('cancela solo una solicitud pendiente de la cuenta activa', async () => {
    solicitudIngresoInstitucion.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.cancelarSolicitud('profesor-1')).resolves.toEqual({
      cancelada: true,
    });
    expect(solicitudIngresoInstitucion.updateMany).toHaveBeenCalledWith({
      where: { solicitanteId: 'profesor-1', estado: 'PENDIENTE' },
      data: { estado: 'CANCELADA' },
    });

    solicitudIngresoInstitucion.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.cancelarSolicitud('profesor-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
