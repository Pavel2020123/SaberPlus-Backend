import { BadRequestException, ForbiddenException } from '@nestjs/common';
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PrismaService } from '../prisma/prisma.service';
import { AdministracionInstitucionService } from './administracion-institucion.service';

describe('AdministracionInstitucionService', () => {
  const miembroInstitucion = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const solicitudIngresoInstitucion = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const invitacionInstitucion = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const auditoriaInstitucion = {
    findMany: jest.fn(),
    create: jest.fn(),
  };
  const usuario = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const prisma = {
    institucion: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ estadoVerificacion: 'APROBADA' }),
    },
    miembroInstitucion,
    solicitudIngresoInstitucion,
    invitacionInstitucion,
    auditoriaInstitucion,
    usuario,
    $transaction: jest.fn(),
  } as unknown as PrismaService;
  const service = new AdministracionInstitucionService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      (operations: unknown[] | ((client: typeof prisma) => unknown)) =>
        typeof operations === 'function'
          ? operations(prisma)
          : Promise.all(operations),
    );
    invitacionInstitucion.updateMany.mockResolvedValue({ count: 0 });
    auditoriaInstitucion.create.mockResolvedValue({ id: 'audit-1' });
  });

  function mockActor(role: 'PROPIETARIO' | 'ADMINISTRADOR' | 'PROFESOR') {
    miembroInstitucion.findUnique.mockResolvedValue({
      id: 'membership-owner',
      institucionId: 'institution-1',
      rol: role,
      institucion: {
        id: 'institution-1',
        nombre: 'Colegio Central',
        codigoUnico: 'INST-ABC123',
      },
    });
  }

  it('entrega al propietario permisos y datos administrativos acotados', async () => {
    mockActor('PROPIETARIO');
    miembroInstitucion.findMany.mockResolvedValue([]);
    solicitudIngresoInstitucion.findMany.mockResolvedValue([]);
    invitacionInstitucion.findMany.mockResolvedValue([]);
    auditoriaInstitucion.findMany.mockResolvedValue([]);

    await expect(service.obtenerPanel('owner-1')).resolves.toMatchObject({
      miRol: 'PROPIETARIO',
      permisos: {
        revisarSolicitudes: true,
        gestionarAdministradores: true,
        transferirPropiedad: true,
      },
    });
  });

  it('niega el panel administrativo a un profesor sin privilegios', async () => {
    mockActor('PROFESOR');
    await expect(service.obtenerPanel('teacher-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(miembroInstitucion.findMany).not.toHaveBeenCalled();
  });

  it('aprueba la solicitud como profesor y registra al responsable', async () => {
    mockActor('ADMINISTRADOR');
    solicitudIngresoInstitucion.findFirst.mockResolvedValue({
      id: 'request-1',
      solicitanteId: 'teacher-2',
      solicitante: { rol: 'PROFESOR', institucionId: null },
    });
    usuario.updateMany.mockResolvedValue({ count: 1 });
    miembroInstitucion.create.mockResolvedValue({ id: 'membership-2' });
    solicitudIngresoInstitucion.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });

    await expect(
      service.revisarSolicitud('admin-1', 'request-1', 'APROBAR'),
    ).resolves.toEqual({ estado: 'APROBADA', rol: 'PROFESOR' });
    expect(miembroInstitucion.create).toHaveBeenCalledWith({
      data: {
        institucionId: 'institution-1',
        usuarioId: 'teacher-2',
        rol: 'PROFESOR',
      },
    });
    expect(auditoriaInstitucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 'admin-1',
        afectadoId: 'teacher-2',
        accion: 'SOLICITUD_APROBADA',
      }),
    });
  });

  it('impide que un administrador invite a otro administrador', async () => {
    mockActor('ADMINISTRADOR');
    await expect(
      service.crearInvitacion(
        'admin-1',
        'nuevo@saberplus.com',
        'ADMINISTRADOR',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(invitacionInstitucion.create).not.toHaveBeenCalled();
  });

  it('normaliza la invitación administrativa creada por el propietario', async () => {
    mockActor('PROPIETARIO');
    usuario.findUnique.mockResolvedValue({
      id: 'teacher-2',
      rol: 'PROFESOR',
      institucionId: null,
    });
    invitacionInstitucion.findFirst.mockResolvedValue(null);
    invitacionInstitucion.create.mockResolvedValue({
      id: 'invitation-1',
      correo: 'teacher@saberplus.com',
      rol: 'ADMINISTRADOR',
      estado: 'PENDIENTE',
      fechaExpiracion: new Date('2026-09-08T12:00:00Z'),
    });

    await service.crearInvitacion(
      'owner-1',
      ' Teacher@SaberPlus.com ',
      'ADMINISTRADOR',
    );

    expect(invitacionInstitucion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correo: 'teacher@saberplus.com',
        rol: 'ADMINISTRADOR',
        creadoPorId: 'owner-1',
      }),
      select: expect.any(Object),
    });
  });

  it('acepta una invitación válida y cancela vínculos pendientes anteriores', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'teacher-2',
      correo: 'teacher@saberplus.com',
      rol: 'PROFESOR',
      institucionId: null,
    });
    invitacionInstitucion.findFirst.mockResolvedValue({
      id: 'invitation-1',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
      fechaExpiracion: new Date(Date.now() + 60000),
    });
    usuario.update.mockResolvedValue({ id: 'teacher-2' });
    miembroInstitucion.create.mockResolvedValue({ id: 'membership-2' });
    invitacionInstitucion.update.mockResolvedValue({ id: 'invitation-1' });
    solicitudIngresoInstitucion.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.responderInvitacion('teacher-2', 'invitation-1', true),
    ).resolves.toEqual({ estado: 'ACEPTADA', rol: 'PROFESOR' });
    expect(usuario.update).toHaveBeenCalledWith({
      where: { id: 'teacher-2' },
      data: { institucionId: 'institution-1' },
    });
    expect(solicitudIngresoInstitucion.updateMany).toHaveBeenCalledWith({
      where: { solicitanteId: 'teacher-2', estado: 'PENDIENTE' },
      data: { estado: 'CANCELADA' },
    });
  });

  it('un administrador no puede retirar a otro administrador', async () => {
    mockActor('ADMINISTRADOR');
    miembroInstitucion.findFirst.mockResolvedValue({
      id: 'membership-2',
      usuarioId: 'admin-2',
      rol: 'ADMINISTRADOR',
    });
    await expect(
      service.retirarMiembro('admin-1', 'membership-2'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(miembroInstitucion.delete).not.toHaveBeenCalled();
  });

  it('transfiere la propiedad solo con el código institucional', async () => {
    mockActor('PROPIETARIO');
    miembroInstitucion.findFirst.mockResolvedValue({
      id: 'membership-2',
      usuarioId: 'teacher-2',
      rol: 'PROFESOR',
    });
    miembroInstitucion.update.mockResolvedValue({});

    await expect(
      service.transferirPropiedad(
        'owner-1',
        'membership-2',
        'codigo-incorrecto',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.transferirPropiedad('owner-1', 'membership-2', 'inst-abc123'),
    ).resolves.toEqual({
      transferida: true,
      nuevoPropietarioId: 'teacher-2',
    });
    expect(miembroInstitucion.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'membership-owner' },
      data: { rol: 'ADMINISTRADOR' },
    });
    expect(miembroInstitucion.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'membership-2' },
      data: { rol: 'PROPIETARIO' },
    });
  });
});
