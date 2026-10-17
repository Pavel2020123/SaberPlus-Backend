import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { StudentInstitutionCodeController } from './student-institution-code.controller';
import {
  JoinStudentInstitutionCodeDto,
  PreviewStudentInstitutionCodeDto,
  RotateStudentInstitutionCodeDto,
} from './student-institution-code.dto';
import { StudentInstitutionCodeService } from './student-institution-code.service';

const actorId = '11111111-1111-4111-8111-111111111111';
const institutionId = '22222222-2222-4222-8222-222222222222';
const operationId = '33333333-3333-4333-8333-333333333333';
const codigo = 'SPI-' + 'A'.repeat(32);
const institution = {
  id: institutionId,
  nombre: 'Colegio',
  estadoVerificacion: 'APROBADA',
};
const code = {
  institucionId: institutionId,
  codigo,
  revision: 1,
  operacionId: operationId,
  institucion: institution,
};
const input = {
  id: operationId,
  codigo,
  institucionId: institutionId,
  revision: 1,
};
const receipt = {
  id: operationId,
  estudianteId: actorId,
  institucionId: institutionId,
  codigoHash: createHash('sha256').update(codigo).digest('hex'),
  revisionCodigo: 1,
  institucion: institution,
};

describe('C4 códigos estudiantiles privados', () => {
  const db = {
    usuario: { findUnique: jest.fn(), updateMany: jest.fn() },
    miembroInstitucion: { findUnique: jest.fn(), create: jest.fn() },
    codigoIngresoEstudiantil: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    ingresoInstitucionCodigo: { findUnique: jest.fn(), create: jest.fn() },
    solicitudIngresoEstudiante: { findFirst: jest.fn(), updateMany: jest.fn() },
    auditoriaInstitucion: { create: jest.fn(), findFirst: jest.fn() },
    $transaction: jest.fn(),
  };
  const access = { verificarCupoDisponible: jest.fn() };
  const service = new StudentInstitutionCodeService(
    db as unknown as PrismaService,
    access as unknown as InstitucionAccesoService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: null,
    });
    db.usuario.updateMany.mockResolvedValue({ count: 1 });
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol: 'PROPIETARIO',
      institucionId: institutionId,
      usuario: { rol: 'PROFESOR', institucionId: institutionId },
      institucion: institution,
    });
    db.codigoIngresoEstudiantil.findUnique.mockResolvedValue(code);
    db.codigoIngresoEstudiantil.updateMany.mockResolvedValue({ count: 1 });
    db.ingresoInstitucionCodigo.findUnique.mockResolvedValue(null);
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue(null);
    db.auditoriaInstitucion.findFirst.mockResolvedValue(null);
  });

  it('consultar propio solo devuelve el código al propietario y no lo genera', async () => {
    expect(await service.own(actorId)).toEqual({
      institucion: { id: institutionId, nombre: 'Colegio' },
      codigo,
      revision: 1,
      operacionId: operationId,
    });
    expect(db.codigoIngresoEstudiantil.create).not.toHaveBeenCalled();
  });
  it('sin código devuelve revisión0 sin escribir en GET', async () => {
    db.codigoIngresoEstudiantil.findUnique.mockResolvedValue(null);
    expect((await service.own(actorId)).codigo).toBeNull();
    expect((await service.own(actorId)).revision).toBe(0);
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it.each(['ADMINISTRADOR', 'PROFESOR'])(
    'rol institucional %s no puede consultar ni renovar',
    async (rol) => {
      db.miembroInstitucion.findUnique.mockResolvedValue({
        rol,
        usuario: { rol: 'PROFESOR' },
        institucion: institution,
      });
      await expect(service.own(actorId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      await expect(
        service.rotate(actorId, { id: operationId, revision: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it.each([
    null,
    {
      rol: 'PROPIETARIO',
      usuario: { rol: 'ESTUDIANTE' },
      institucion: institution,
    },
    {
      rol: 'PROPIETARIO',
      institucionId: institutionId,
      usuario: { rol: 'PROFESOR', institucionId: 'otra' },
      institucion: institution,
    },
    {
      rol: 'PROPIETARIO',
      institucionId: institutionId,
      usuario: { rol: 'PROFESOR', institucionId: institutionId },
      institucion: { ...institution, estadoVerificacion: 'SUSPENDIDA' },
    },
  ])('membresía incoherente o suspendida denegada %#', async (member) => {
    db.miembroInstitucion.findUnique.mockResolvedValue(member);
    await expect(service.own(actorId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('primera emisión produce128 bits aleatorios y auditoría sin secreto', async () => {
    db.codigoIngresoEstudiantil.findUnique.mockResolvedValue(null);
    const result = await service.rotate(actorId, {
      id: operationId,
      revision: 0,
    });
    expect(result.codigo).toMatch(/^SPI-[A-F0-9]{32}$/);
    expect(result.revision).toBe(1);
    expect(
      JSON.stringify(db.auditoriaInstitucion.create.mock.calls),
    ).not.toContain(result.codigo);
    expect(db.codigoIngresoEstudiantil.create).toHaveBeenCalledTimes(1);
  });
  it('renovación usa revisión e incrementa versión sin tocar codigoUnico antiguo', async () => {
    const result = await service.rotate(actorId, { id: actorId, revision: 1 });
    expect(result.revision).toBe(2);
    expect(result.codigo).not.toBe(codigo);
    expect(db.codigoIngresoEstudiantil.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { institucionId: institutionId, revision: 1 },
      }),
    );
  });
  it('reintento de la misma renovación devuelve mismo código sin nueva escritura', async () => {
    expect(
      await service.rotate(actorId, { id: operationId, revision: 0 }),
    ).toEqual({ codigo, revision: 1, operacionId: operationId });
    expect(db.codigoIngresoEstudiantil.updateMany).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it('UUID de renovación con cuerpo cambiado no se reutiliza', async () => {
    await expect(
      service.rotate(actorId, { id: operationId, revision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('UUID de una renovación histórica no vuelve a renovar', async () => {
    db.auditoriaInstitucion.findFirst.mockResolvedValue({ id: actorId });
    await expect(
      service.rotate(actorId, { id: actorId, revision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.codigoIngresoEstudiantil.updateMany).not.toHaveBeenCalled();
  });
  it('revisión antigua no cambia el código', async () => {
    await expect(
      service.rotate(actorId, { id: actorId, revision: 0 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('carrera de renovación se rechaza sin auditoría', async () => {
    db.codigoIngresoEstudiantil.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.rotate(actorId, { id: actorId, revision: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it('consultar código no vincula ni expone código/correo/datos internos', async () => {
    expect(await service.preview(actorId, { codigo })).toEqual({
      institucion: { id: institutionId, nombre: 'Colegio' },
      revision: 1,
      yaVinculado: false,
    });
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(db.ingresoInstitucionCodigo.create).not.toHaveBeenCalled();
  });
  it('cuenta inexistente no puede consultar', async () => {
    db.usuario.findUnique.mockResolvedValue(null);
    await expect(service.preview(actorId, { codigo })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
  it.each(['PROFESOR', 'ADMIN'])(
    'cuenta %s no ingresa como alumno',
    async (rol) => {
      db.usuario.findUnique.mockResolvedValue({ rol, institucionId: null });
      await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    },
  );
  it.each([
    null,
    {
      ...code,
      institucion: { ...institution, estadoVerificacion: 'SUSPENDIDA' },
    },
  ])('código inexistente/suspendido no revela institución %#', async (row) => {
    db.codigoIngresoEstudiantil.findUnique.mockResolvedValue(row);
    await expect(service.preview(actorId, { codigo })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
  it('ingreso vincula solo institución, conserva rol y no asigna grupo', async () => {
    expect((await service.join(actorId, input)).estado).toBe('VINCULADO');
    expect(db.usuario.updateMany).toHaveBeenCalledWith({
      where: { id: actorId, rol: 'ESTUDIANTE', institucionId: null },
      data: { institucionId: institutionId },
    });
    expect(db.miembroInstitucion.create).not.toHaveBeenCalled();
    expect(access.verificarCupoDisponible).toHaveBeenCalledWith(
      institutionId,
      'ONCE',
      actorId,
      1,
      db,
    );
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(
      db.ingresoInstitucionCodigo.create.mock.calls[0][0].data.codigoHash,
    ).toBe(receipt.codigoHash);
    expect(
      JSON.stringify(db.auditoriaInstitucion.create.mock.calls),
    ).not.toContain(codigo);
  });
  it('misma institución no consume cupo ni genera otra auditoría', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: institutionId,
    });
    expect((await service.join(actorId, input)).yaVinculado).toBe(true);
    expect(access.verificarCupoDisponible).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it('otra institución no permite traslado automático', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: 'otra',
    });
    await expect(service.preview(actorId, { codigo })).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('cupo agotado no escribe vínculo ni recibo', async () => {
    access.verificarCupoDisponible.mockRejectedValue(
      new BadRequestException('Cupo agotado'),
    );
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
    expect(db.ingresoInstitucionCodigo.create).not.toHaveBeenCalled();
  });
  it('pendiente requiere cancelación explícita, no se decide silenciosamente', async () => {
    db.solicitudIngresoEstudiante.findFirst.mockResolvedValue({ id: actorId });
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.solicitudIngresoEstudiante.updateMany).not.toHaveBeenCalled();
    expect(db.usuario.updateMany).not.toHaveBeenCalled();
  });
  it.each([{ institucionId: actorId }, { revision: 2 }])(
    'snapshot modificado o código renovado exige nueva consulta %#',
    async (change) => {
      await expect(
        service.join(actorId, { ...input, ...change }),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('vínculo cambiado durante ingreso no crea recibo', async () => {
    db.usuario.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.ingresoInstitucionCodigo.create).not.toHaveBeenCalled();
  });
  it('reintento confirmado se reconcilia incluso tras renovación, sin consumir cupo', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: institutionId,
    });
    db.ingresoInstitucionCodigo.findUnique.mockResolvedValue(receipt);
    expect((await service.join(actorId, input)).yaVinculado).toBe(true);
    expect(db.codigoIngresoEstudiantil.findUnique).not.toHaveBeenCalled();
    expect(access.verificarCupoDisponible).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it.each([
    { estudianteId: institutionId },
    { institucionId: actorId },
    { codigoHash: '0'.repeat(64) },
    { revisionCodigo: 2 },
  ])('UUID ajeno o cuerpo alterado no se reconcilia %#', async (change) => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: institutionId,
    });
    db.ingresoInstitucionCodigo.findUnique.mockResolvedValue({
      ...receipt,
      ...change,
    });
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('recibo antiguo con vínculo retirado no vuelve a vincular automáticamente', async () => {
    db.ingresoInstitucionCodigo.findUnique.mockResolvedValue(receipt);
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('auditoría fallida no se transforma en éxito', async () => {
    db.auditoriaInstitucion.create.mockRejectedValue(new Error('audit'));
    await expect(service.join(actorId, input)).rejects.toThrow('audit');
  });
  it('reintenta conflicto serializable de forma acotada', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('retry', {
      code: 'P2034',
      clientVersion: '5.22.0',
    });
    db.$transaction.mockRejectedValue(error);
    await expect(service.join(actorId, input)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(db.$transaction).toHaveBeenCalledTimes(3);
  });
});

describe('C4 contrato HTTP estricto', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const parse = (metatype: any, value: object) =>
    pipe.transform(value, { type: 'body', metatype });
  it('controller exige JWT y correo verificado', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentInstitutionCodeController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
  });
  it('normaliza solo texto de código', async () => {
    expect(
      (
        await parse(PreviewStudentInstitutionCodeDto, {
          codigo: ` ${codigo.toLowerCase()} `,
        })
      ).codigo,
    ).toBe(codigo);
  });
  it.each([null, 123, true, {}, '', 'INST-123', 'GRP-123', codigo + 'A'])(
    'código no compatible denegado %#',
    async (value) => {
      await expect(
        parse(PreviewStudentInstitutionCodeDto, { codigo: value }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(['1', true, null, -1, 1.5, 2147483647])(
    'revisión de renovación JSON inválida %#',
    async (revision) => {
      await expect(
        parse(RotateStudentInstitutionCodeDto, { id: operationId, revision }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it.each(['1', true, null, 0])(
    'revisión de ingreso inválida %#',
    async (revision) => {
      await expect(
        parse(JoinStudentInstitutionCodeDto, { ...input, revision }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('campos de rol o estudiante inyectados se rechazan', async () => {
    await expect(
      parse(JoinStudentInstitutionCodeDto, { ...input, rol: 'PROFESOR' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      parse(JoinStudentInstitutionCodeDto, { ...input, estudianteId: actorId }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('UUID de operación requerido y v4', async () => {
    await expect(
      parse(JoinStudentInstitutionCodeDto, { ...input, id: 'otro' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
