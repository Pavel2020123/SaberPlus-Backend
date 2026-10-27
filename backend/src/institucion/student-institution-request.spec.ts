import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { StudentInstitutionRequestController } from './student-institution-request.controller';
import {
  CreateStudentInstitutionRequestDto,
  ReviewStudentInstitutionRequestDto,
  StudentInstitutionRequestRevisionDto,
  StudentInstitutionRequestsQuery,
} from './student-institution-request.dto';
import { StudentInstitutionRequestService } from './student-institution-request.service';

const id = '11111111-1111-4111-8111-111111111111';
const institutionId = '22222222-2222-4222-8222-222222222222';
const studentId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const record = (extra: object = {}) => ({
  id,
  institucionId: institutionId,
  estudianteId: studentId,
  estado: 'PENDIENTE',
  revision: 0,
  mensaje: null,
  fechaCreacion: new Date('2026-10-14T12:00:00Z'),
  fechaActualizacion: new Date('2026-10-14T12:00:00Z'),
  institucion: { id: institutionId, nombre: 'Institución' },
  ...extra,
});

describe('solicitudes estudiantiles separadas del equipo docente', () => {
  const db = {
    usuario: { findUnique: jest.fn(), updateMany: jest.fn() },
    institucion: { findFirst: jest.fn() },
    miembroInstitucion: { findUnique: jest.fn(), create: jest.fn() },
    solicitudIngresoEstudiante: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    auditoriaInstitucion: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = { verificarCupoDisponible: jest.fn() };
  const service = new StudentInstitutionRequestService(
    db as unknown as PrismaService,
    access as unknown as InstitucionAccesoService,
  );
  const create = () =>
    service.create(studentId, {
      id,
      institucionId: institutionId,
      mensaje: ' Hola ',
    });
  const review = (decision: 'APROBAR' | 'RECHAZAR' = 'APROBAR', revision = 0) =>
    service.review(ownerId, id, { decision, revision });
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
    db.usuario.updateMany.mockResolvedValue({ count: 1 });
    db.institucion.findFirst.mockResolvedValue({ id: institutionId });
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROPIETARIO',
      institucionId: institutionId,
      usuario: { rol: 'PROFESOR', institucionId: institutionId },
      institucion: { estadoVerificacion: 'APROBADA' },
    });
    db.solicitudIngresoEstudiante.findUnique.mockResolvedValue(null);
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(null);
    db.solicitudIngresoEstudiante.create.mockResolvedValue(record());
    db.solicitudIngresoEstudiante.findMany.mockResolvedValue([]);
    db.solicitudIngresoEstudiante.updateMany.mockResolvedValue({ count: 1 });
    db.solicitudIngresoEstudiante.findUniqueOrThrow.mockResolvedValue(
      record({ estado: 'APROBADA', revision: 1 }),
    );
  });

  it('crear no vincula, no cambia rol y audita en transacción serializable', async () => {
    await create();
    expect(db.solicitudIngresoEstudiante.create.mock.calls[0][0].data).toEqual({
      id,
      institucionId: institutionId,
      estudianteId: studentId,
      mensaje: 'Hola',
    });
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(db.miembroInstitucion.create).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('no permite crear solicitud estudiantil a un profesor', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: null,
    });
    await expect(create()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rechaza alumno ya vinculado', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: institutionId,
    });
    await expect(create()).rejects.toBeInstanceOf(ConflictException);
  });
  it('solo acepta institución aprobada', async () => {
    db.institucion.findFirst.mockResolvedValue(null);
    await expect(create()).rejects.toBeInstanceOf(NotFoundException);
    expect(db.institucion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: institutionId, estadoVerificacion: 'APROBADA' },
      }),
    );
  });
  it('no abre segunda solicitud mientras existe pendiente', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue({ id: 'other' });
    await expect(create()).rejects.toBeInstanceOf(ConflictException);
  });
  it('reintentar UUID propio devuelve estado previo sin duplicar ni reabrir', async () => {
    db.solicitudIngresoEstudiante.findUnique.mockResolvedValue(
      record({ estado: 'CANCELADA', revision: 1 }),
    );
    expect((await create()).estado).toBe('CANCELADA');
    expect(db.solicitudIngresoEstudiante.create).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it.each([{ estudianteId: ownerId }, { institucionId: ownerId }])(
    'UUID con otro actor/objetivo no revela su solicitud: %j',
    async (extra) => {
      db.solicitudIngresoEstudiante.findUnique.mockResolvedValue(record(extra));
      await expect(create()).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('mis solicitudes filtra por actor, pagina y no expone IDs de alumno/revisor', async () => {
    db.solicitudIngresoEstudiante.findMany.mockResolvedValue(
      Array.from({ length: 21 }, () => record()),
    );
    const result = await service.own(studentId, { pagina: 2 });
    expect(result.solicitudes).toHaveLength(20);
    expect(result.hayMas).toBe(true);
    expect(result.solicitudes[0]).not.toHaveProperty('estudianteId');
    expect(result.solicitudes[0]).not.toHaveProperty('revisadoPorId');
    expect(db.solicitudIngresoEstudiante.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { estudianteId: studentId },
        skip: 20,
        take: 21,
      }),
    );
  });
  it.each(['ADMINISTRADOR', 'PROFESOR'])(
    'bandeja no delega revisión a %s',
    async (rol) => {
      db.miembroInstitucion.findUnique.mockResolvedValue({ rol });
      await expect(
        service.inbox(ownerId, { pagina: 1, estado: 'PENDIENTE' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('propietario suspendido no revisa', async () => {
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROPIETARIO',
      institucionId: institutionId,
      usuario: { rol: 'PROFESOR', institucionId: institutionId },
      institucion: { estadoVerificacion: 'SUSPENDIDA' },
    });
    await expect(review()).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('bandeja muestra nombre al propietario, sin correo ni ID del estudiante', async () => {
    db.solicitudIngresoEstudiante.findMany.mockResolvedValue([
      { ...record(), estudiante: { nombre: 'Alumno' } },
    ]);
    const result = await service.inbox(ownerId, {
      pagina: 1,
      estado: 'RECHAZADA',
    });
    expect(result.solicitudes[0].estudianteNombre).toBe('Alumno');
    expect(result.solicitudes[0]).not.toHaveProperty('estudianteId');
    expect(result.solicitudes[0]).not.toHaveProperty('correo');
    expect(
      db.solicitudIngresoEstudiante.findMany.mock.calls[0][0].where,
    ).toEqual({ institucionId: institutionId, estado: 'RECHAZADA' });
  });
  it('cancelación ajena devuelve404 y no escribe', async () => {
    await expect(service.cancel(studentId, id, 0)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.solicitudIngresoEstudiante.updateMany).not.toHaveBeenCalled();
  });
  it('cancela con revisión y audita una sola vez', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    db.solicitudIngresoEstudiante.findUniqueOrThrow.mockResolvedValue(
      record({ estado: 'CANCELADA', revision: 1 }),
    );
    expect((await service.cancel(studentId, id, 0)).estado).toBe('CANCELADA');
    expect(db.auditoriaInstitucion.create).toHaveBeenCalledTimes(1);
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
  });
  it('repetir cancelación no duplica auditoría', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(
      record({ estado: 'CANCELADA', revision: 1 }),
    );
    await service.cancel(studentId, id, 0);
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it.each([{ estado: 'APROBADA' }, { revision: 2 }])(
    'cancelación detecta conflicto: %j',
    async (extra) => {
      db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record(extra));
      await expect(service.cancel(studentId, id, 0)).rejects.toBeInstanceOf(
        ConflictException,
      );
    },
  );
  it('aprobar solo vincula institución, sin promover rol ni asignar grupo', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    const result = await review();
    expect(result.estado).toBe('APROBADA');
    expect(access.verificarCupoDisponible).toHaveBeenCalledWith(
      institutionId,
      'ONCE',
      studentId,
      1,
      db,
    );
    expect(db.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: studentId, rol: 'ESTUDIANTE', institucionId: null },
      data: { institucionId: institutionId },
    });
    expect(db.miembroInstitucion.create).not.toHaveBeenCalled();
  });
  it('rechazar no vincula ni consume cupo', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    await review('RECHAZAR');
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(access.verificarCupoDisponible).not.toHaveBeenCalled();
  });
  it('repetir aprobación no vuelve a vincular ni auditar', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(
      record({ estado: 'APROBADA', revision: 1 }),
    );
    await review();
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it('solicitud de otra institución no es revisable', async () => {
    await expect(review()).rejects.toBeInstanceOf(NotFoundException);
  });
  it('revisión obsoleta no vincula ni decide', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(
      record({ revision: 2 }),
    );
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
  });
  it('sin cupo no cambia solicitud ni estudiante', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    access.verificarCupoDisponible.mockRejectedValue(
      new ConflictException('Sin cupo'),
    );
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(db.solicitudIngresoEstudiante.updateMany).not.toHaveBeenCalled();
  });
  it('no traslada alumno vinculado por otra vía', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: ownerId,
    });
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
  });
  it('cambio concurrente de vínculo aborta antes de decidir', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    db.usuario.updateMany.mockResolvedValue({ count: 0 });
    await expect(review()).rejects.toBeInstanceOf(ConflictException);
    expect(db.solicitudIngresoEstudiante.updateMany).not.toHaveBeenCalled();
  });
  it('fallo de auditoría se propaga dentro de transacción, no devuelve éxito', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(record());
    db.auditoriaInstitucion.create.mockRejectedValue(
      new Error('audit unavailable'),
    );
    await expect(review()).rejects.toThrow('audit unavailable');
  });
  it('reintenta conflicto serializable y no oculta otros errores', async () => {
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('retry', {
        code: 'P2034',
        clientVersion: '5.22.0',
      }),
    );
    await create();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
  });
});

describe('contrato HTTP de solicitudes estudiantiles', () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  it('protege todas las rutas con sesión real y política de correo', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentInstitutionRequestController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
  });
  it.each([
    { revision: '0' },
    { revision: null },
    { revision: -1 },
    { revision: 2147483647 },
    { revision: 0, rol: 'PROFESOR' },
  ])('rechaza revisión JSON inválida: %j', async (value) => {
    await expect(
      pipe.transform(value, {
        type: 'body',
        metatype: StudentInstitutionRequestRevisionDto,
      }),
    ).rejects.toThrow();
  });
  it('valida UUID y no acepta identidad del solicitante desde el cliente', async () => {
    await expect(
      pipe.transform(
        { id, institucionId: institutionId, estudianteId: studentId },
        { type: 'body', metatype: CreateStudentInstitutionRequestDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { id: 'bad', institucionId: institutionId },
        { type: 'body', metatype: CreateStudentInstitutionRequestDto },
      ),
    ).rejects.toThrow();
  });
  it('rechaza mensaje excesivo y decisión desconocida', async () => {
    await expect(
      pipe.transform(
        { revision: true },
        {
          type: 'body',
          metatype: StudentInstitutionRequestRevisionDto,
        },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { id, institucionId: institutionId, mensaje: 123 },
        {
          type: 'body',
          metatype: CreateStudentInstitutionRequestDto,
        },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { id, institucionId: institutionId, mensaje: 'x'.repeat(501) },
        { type: 'body', metatype: CreateStudentInstitutionRequestDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { revision: 0, decision: 'PROFESOR' },
        { type: 'body', metatype: ReviewStudentInstitutionRequestDto },
      ),
    ).rejects.toThrow();
  });
  it('paginación transforma query pero limita rango', async () => {
    const parsed = await pipe.transform(
      { pagina: '2' },
      { type: 'query', metatype: StudentInstitutionRequestsQuery },
    );
    expect(parsed.pagina).toBe(2);
    await expect(
      pipe.transform(
        { pagina: '0' },
        { type: 'query', metatype: StudentInstitutionRequestsQuery },
      ),
    ).rejects.toThrow();
  });
});
