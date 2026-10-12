import {
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InstitutionProfileService } from './institution-profile.service';
import { UpdateInstitutionProfileDto } from './institution-profile.dto';

describe('PR-I5 perfil público institucional', () => {
  const db = {
    miembroInstitucion: { findUnique: jest.fn() },
    institucion: { findFirst: jest.fn(), updateMany: jest.fn() },
    auditoriaInstitucion: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new InstitutionProfileService(db as unknown as PrismaService);
  const membership = (rol = 'PROPIETARIO', estado = 'APROBADA') => ({
    rol,
    institucionId: 'institution',
    usuario: { rol: 'PROFESOR' },
    institucion: { estadoVerificacion: estado },
  });
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.miembroInstitucion.findUnique.mockResolvedValue(membership());
    db.institucion.updateMany.mockResolvedValue({ count: 1 });
    db.institucion.findFirst.mockResolvedValue({
      id: 'institution',
      nombre: 'Colegio',
      descripcionPublica: null,
      revisionPerfil: 0,
    });
  });

  it('devuelve solo el contrato del editor', async () => {
    expect(await service.own('owner')).toEqual({
      id: 'institution',
      nombre: 'Colegio',
      descripcion: null,
      revision: 0,
      puedeEditar: true,
    });
  });
  it('permite consultar pero no editar a otros docentes', async () => {
    db.miembroInstitucion.findUnique.mockResolvedValue(
      membership('ADMINISTRADOR'),
    );
    expect((await service.own('teacher')).puedeEditar).toBe(false);
    await expect(
      service.update('teacher', { revision: 0, descripcion: 'Texto' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.institucion.updateMany).not.toHaveBeenCalled();
  });
  it.each(['PENDIENTE', 'SUSPENDIDA', 'LEGADO'])(
    'rechaza institución %s',
    async (state) => {
      db.miembroInstitucion.findUnique.mockResolvedValue(
        membership('PROPIETARIO', state),
      );
      await expect(
        service.update('owner', { revision: 0, descripcion: '' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('rechaza cuentas sin membresía', async () => {
    db.miembroInstitucion.findUnique.mockResolvedValue(null);
    await expect(service.own('stranger')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('guarda descripción y auditoría dentro de la transacción', async () => {
    expect(
      await service.update('owner', {
        revision: 3,
        descripcion: '  Educación  ',
      }),
    ).toEqual({ revision: 4, descripcion: 'Educación' });
    expect(db.institucion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revisionPerfil: 3,
          estadoVerificacion: 'APROBADA',
          miembros: {
            some: {
              usuarioId: 'owner',
              rol: 'PROPIETARIO',
              usuario: { rol: 'PROFESOR' },
            },
          },
        }),
        data: {
          descripcionPublica: 'Educación',
          revisionPerfil: { increment: 1 },
        },
      }),
    );
    expect(db.auditoriaInstitucion.create).toHaveBeenCalledTimes(1);
  });
  it('vacío elimina la descripción pública', async () => {
    expect(
      await service.update('owner', { revision: 0, descripcion: ' ' }),
    ).toEqual({ revision: 1, descripcion: null });
  });
  it('conflicto no genera auditoría ni reintenta sobrescribir', async () => {
    db.institucion.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.update('owner', { revision: 0, descripcion: 'Texto' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
    expect(db.institucion.updateMany).toHaveBeenCalledTimes(1);
  });
  it('propaga fallo de auditoría para que Prisma revierta la transacción', async () => {
    db.auditoriaInstitucion.create.mockRejectedValue(
      new Error('audit failure'),
    );
    await expect(
      service.update('owner', { revision: 0, descripcion: '' }),
    ).rejects.toThrow('audit failure');
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  it.each([
    { revision: true, descripcion: '' },
    { revision: '0', descripcion: '' },
    { revision: -1, descripcion: '' },
    { revision: 0.5, descripcion: '' },
    { revision: 2147483647, descripcion: '' },
    { revision: 0, descripcion: null },
    { revision: 0, descripcion: 123 },
    { revision: 0 },
    { revision: 0, descripcion: 'x'.repeat(501) },
    { revision: 0, descripcion: '', nombre: 'Otro' },
  ])('rechaza payload inválido %j', async (value) => {
    await expect(
      pipe.transform(value, {
        type: 'body',
        metatype: UpdateInstitutionProfileDto,
      }),
    ).rejects.toThrow();
  });
  it('acepta y normaliza el contrato válido', async () => {
    expect(
      await pipe.transform(
        { revision: 0, descripcion: ' Hola ' },
        { type: 'body', metatype: UpdateInstitutionProfileDto },
      ),
    ).toEqual({ revision: 0, descripcion: 'Hola' });
  });
});
