import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenciaInstitucionalService } from './licencia-institucional.service';

describe('LIC-4 retorno personal', () => {
  const now = new Date('2026-11-03T15:00:00Z');
  const version = new Date('2026-11-02T15:00:00Z');
  const target = () => ({
    id: 'student',
    rol: 'ESTUDIANTE',
    institucionId: 'school',
    origenGestionadoLicencia: null,
    membresiaInstitucion: null,
    identificadorInstitucional: null,
  });
  let user: ReturnType<typeof target>;
  let tx: any;
  let service: LicenciaInstitucionalService;
  beforeEach(() => {
    user = target();
    tx = {
      $queryRaw: jest
        .fn()
        .mockImplementation((parts: TemplateStringsArray) =>
          Promise.resolve(
            parts.join('').includes('clock_timestamp')
              ? [{ ahora: now }]
              : [{ id: 'school' }],
          ),
        ),
      usuario: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.id === 'owner'
                ? { id: 'owner', rol: 'PROFESOR', institucionId: 'school' }
                : user,
            ),
          ),
        findUniqueOrThrow: jest
          .fn()
          .mockImplementation(() => Promise.resolve(user)),
        update: jest.fn().mockImplementation(({ data }) => {
          Object.assign(user, data);
          return Promise.resolve(user);
        }),
      },
      miembroInstitucion: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.usuarioId === 'owner'
                ? { institucionId: 'school', rol: 'PROPIETARIO' }
                : null,
            ),
          ),
        delete: jest.fn(),
      },
      origenGestionadoInstitucional: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      operacionLicenciaInstitucional: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(data)),
      },
      asignacionLicenciaInstitucional: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'seat', actualizadoEn: version }),
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      periodoContratoInstitucional: {
        findFirst: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.fin?.gt ? null : { fin: new Date(now.getTime() - 1) },
            ),
          ),
      },
      claseEstudiante: { deleteMany: jest.fn() },
      claseProfesor: { deleteMany: jest.fn() },
      saldoPersonalInstitucional: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'balance', milisegundos: 86400000n }),
        update: jest.fn(),
      },
      auditoriaInstitucion: { create: jest.fn() },
    };
    service = new LicenciaInstitucionalService({
      $transaction: (fn: (tx: any) => unknown) => fn(tx),
    } as unknown as PrismaService);
  });
  const call = (actor = 'student') =>
    service.volverPersonal(
      actor,
      'school',
      'operation',
      'student',
      'seat',
      version.toISOString(),
    );
  it('permite salida propia vencida y reanuda saldo dentro de la misma transacción', async () => {
    expect(await call()).toMatchObject({
      modalidad: 'PERSONAL',
      historialConservado: true,
    });
    expect(user.institucionId).toBeNull();
    expect(tx.usuario.update).toHaveBeenLastCalledWith({
      where: { id: 'student' },
      data: { fechaVencimientoPlan: new Date(now.getTime() + 86400000) },
    });
    expect(tx.saldoPersonalInstitucional.update).toHaveBeenCalledTimes(1);
  });
  it('deniega autosalida durante cobertura activa', async () => {
    tx.periodoContratoInstitucional.findFirst.mockResolvedValue({
      fin: new Date(now.getTime() + 1),
    });
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('antes del primer vencimiento no habilita autosalida', async () => {
    tx.periodoContratoInstitucional.findFirst.mockResolvedValue(null);
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('membresía residual no autoriza a un propietario desvinculado', async () => {
    tx.usuario.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        where.id === 'owner'
          ? { id: 'owner', rol: 'PROFESOR', institucionId: null }
          : user,
      ),
    );
    await expect(call('owner')).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('propietario puede desvincular personal sin esperar vencimiento', async () => {
    await call('owner');
    expect(tx.periodoContratoInstitucional.findFirst).not.toHaveBeenCalled();
  });
  it('rechaza origen gestionado y no convierte alias en correo', async () => {
    Object.assign(user, {
      origenGestionadoLicencia: { institucionId: 'school' },
    });
    await expect(call()).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('versión antigua no desvincula una asignación más reciente', async () => {
    tx.asignacionLicenciaInstitucional.findUnique.mockResolvedValue({
      id: 'seat',
      actualizadoEn: now,
    });
    await expect(call()).rejects.toBeInstanceOf(ConflictException);
    expect(tx.usuario.update).not.toHaveBeenCalled();
  });
  it('recibo previo no repite salida ni saldo aunque exista una nueva vinculación', async () => {
    const { createHash } = await import('node:crypto');
    tx.operacionLicenciaInstitucional.findUnique.mockResolvedValue({
      actorId: 'student',
      institucionId: 'school',
      tipo: 'VOLVER_PERSONAL',
      huella: createHash('sha256')
        .update(
          JSON.stringify({
            tipo: 'VOLVER_PERSONAL',
            comando: {
              usuarioId: 'student',
              asignacionId: 'seat',
              versionAsignacion: version.toISOString(),
            },
          }),
        )
        .digest('hex'),
      resultado: { modalidad: 'PERSONAL' },
    });
    await call();
    expect(tx.usuario.update).not.toHaveBeenCalled();
    expect(tx.saldoPersonalInstitucional.update).not.toHaveBeenCalled();
  });
  it('otro docente no puede desvincular al alumno', async () => {
    tx.miembroInstitucion.findUnique.mockResolvedValue({
      institucionId: 'school',
      rol: 'PROFESOR',
    });
    await expect(call('teacher')).rejects.toBeInstanceOf(ForbiddenException);
  });
});
