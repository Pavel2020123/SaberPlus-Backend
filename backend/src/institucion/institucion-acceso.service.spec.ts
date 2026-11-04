import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

describe('InstitucionAccesoService', () => {
  const institucion = { findUnique: jest.fn() };
  const clase = { count: jest.fn() };
  const usuario = {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  };
  const miembroInstitucion = { findUnique: jest.fn() };
  const controlLicenciaInstitucional = { findUnique: jest.fn() };
  const asignacionLicenciaInstitucional = { findFirst: jest.fn() };
  const periodoContratoInstitucional = { findFirst: jest.fn() };
  const $queryRaw = jest.fn();
  const prisma = {
    institucion,
    clase,
    usuario,
    miembroInstitucion,
    controlLicenciaInstitucional,
    asignacionLicenciaInstitucional,
    periodoContratoInstitucional,
    $queryRaw,
  } as unknown as PrismaService;
  const service = new InstitucionAccesoService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    controlLicenciaInstitucional.findUnique.mockResolvedValue(null);
    miembroInstitucion.findUnique.mockResolvedValue({
      id: 'member',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    usuario.findUnique.mockResolvedValue({
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    $queryRaw.mockResolvedValue([{ ahora: new Date() }]);
    institucion.findUnique.mockResolvedValue({
      planActual: 'GRATIS',
      limiteGrupos: 1,
      limiteEstudiantes: 40,
    });
  });

  it('docente retirado no obtiene alcance por una membresía o grupo residual', async () => {
    controlLicenciaInstitucional.findUnique.mockResolvedValue({
      suspendida: false,
    });
    asignacionLicenciaInstitucional.findFirst.mockResolvedValue(null);
    await expect(
      service.obtenerMembresiaGestionable('teacher'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('cupo docente activo conserva consulta aunque el periodo haya vencido', async () => {
    controlLicenciaInstitucional.findUnique.mockResolvedValue({
      suspendida: true,
    });
    asignacionLicenciaInstitucional.findFirst.mockResolvedValue({ id: 'seat' });
    await expect(
      service.obtenerMembresiaGestionable('teacher'),
    ).resolves.toEqual({
      id: 'member',
      institucionId: 'institution-1',
      rol: 'PROFESOR',
    });
    expect(periodoContratoInstitucional.findFirst).not.toHaveBeenCalled();
  });
  it('propietario no consume ni requiere cupo docente', async () => {
    miembroInstitucion.findUnique.mockResolvedValue({
      id: 'member',
      institucionId: 'institution-1',
      rol: 'PROPIETARIO',
    });
    await expect(
      service.obtenerMembresiaGestionable('owner'),
    ).resolves.toBeDefined();
    expect(asignacionLicenciaInstitucional.findFirst).not.toHaveBeenCalled();
  });
  it('rechaza membresía residual de otra institución', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: 'other',
    });
    await expect(
      service.obtenerMembresiaGestionable('teacher'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('impide crear un segundo grupo en el plan gratuito', async () => {
    clase.count.mockResolvedValue(1);

    await expect(
      service.verificarCupoGrupos('institution-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cuenta estudiantes institucionales aunque todavía no tengan grupo', async () => {
    usuario.count.mockResolvedValue(40);
    usuario.findFirst.mockResolvedValue(null);

    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'new-student'),
    ).rejects.toThrow('Se alcanzó el cupo total de 40 estudiantes');
    expect(usuario.count).toHaveBeenCalledWith({
      where: { institucionId: 'institution-1', rol: 'ESTUDIANTE' },
    });
  });

  it('no cobra otro cupo al mover un estudiante entre grupos propios', async () => {
    usuario.count.mockResolvedValue(40);
    usuario.findFirst.mockResolvedValue({ id: 'student-1' });

    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'student-1'),
    ).resolves.toBeUndefined();
  });
  it('does not let legacy CSV allocate licensed seats', async () => {
    controlLicenciaInstitucional.findUnique.mockResolvedValue({
      suspendida: false,
    });
    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', undefined, 10),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(usuario.count).not.toHaveBeenCalled();
  });
  it('rejects a legacy join without a licensed assignment', async () => {
    controlLicenciaInstitucional.findUnique.mockResolvedValue({
      suspendida: false,
    });
    asignacionLicenciaInstitucional.findFirst.mockResolvedValue(null);
    periodoContratoInstitucional.findFirst.mockResolvedValue({ id: 'period' });
    usuario.findFirst.mockResolvedValue({ id: 'student-1' });
    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'student-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lets an already assigned student move groups without consuming another seat', async () => {
    controlLicenciaInstitucional.findUnique.mockResolvedValue({
      suspendida: false,
    });
    asignacionLicenciaInstitucional.findFirst.mockResolvedValue({
      id: 'assignment',
    });
    periodoContratoInstitucional.findFirst.mockResolvedValue({ id: 'period' });
    usuario.findFirst.mockResolvedValue({ id: 'student-1' });
    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'student-1'),
    ).resolves.toBeUndefined();
    expect(usuario.count).not.toHaveBeenCalled();
  });
});
