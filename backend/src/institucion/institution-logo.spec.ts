import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import * as sharpModule from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { ArchivoAlmacenamientoService } from './archivo-almacenamiento.service';
import { InstitutionLogoDto, managedLogoUrl } from './institution-logo.dto';
import { InstitucionController } from './institucion.controller';
import { PropietarioInstitucionGuard } from '../auth/jwt.guard';
import { InstitucionService } from './institucion.service';
const sharp = sharpModule as unknown as typeof import('sharp').default;

describe('logo institucional validado y propietario', () => {
  const id = 'a6ec3648-24ee-47d0-91f8-e59b2b68b9ab';
  const db = {
    miembroInstitucion: { findUnique: jest.fn() },
    institucion: { updateMany: jest.fn() },
    institucionLogo: { upsert: jest.fn(), deleteMany: jest.fn() },
    auditoriaInstitucion: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const service = new ArchivoAlmacenamientoService(
    db as unknown as PrismaService,
  );
  const file = (buffer: Buffer) =>
    ({
      buffer,
      mimetype: 'image/png',
      originalname: 'logo.png',
    }) as Express.Multer.File;
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((fn) => fn(db));
    db.miembroInstitucion.findUnique.mockResolvedValue({
      institucionId: id,
      rol: 'PROPIETARIO',
      usuario: { rol: 'PROFESOR' },
      institucion: { estadoVerificacion: 'APROBADA' },
    });
    db.institucion.updateMany.mockResolvedValue({ count: 1 });
  });
  it.each(['png', 'jpeg', 'webp'] as const)(
    'decodifica %s, recorta y elimina metadatos antes de persistir',
    async (format) => {
      const bytes = await sharp({
        create: { width: 100, height: 60, channels: 3, background: 'blue' },
      })
        .withMetadata({ orientation: 6 })
        .toFormat(format)
        .toBuffer();
      expect(
        await service.subirLogoDeMiInstitucion('owner', file(bytes), 3),
      ).toEqual({
        revision: 4,
        logoUrl: `/instituciones/directorio/${id}/logo/4`,
      });
      const stored =
        db.institucionLogo.upsert.mock.calls[0][0].create.contenido;
      const meta = await sharp(stored).metadata();
      expect(meta).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(meta.exif).toBeUndefined();
      expect(stored.length).toBeLessThanOrEqual(204800);
      expect(db.institucion.updateMany.mock.calls[0][0].where).toMatchObject({
        revisionPerfil: 3,
        estadoVerificacion: 'APROBADA',
        miembros: { some: { usuarioId: 'owner', rol: 'PROPIETARIO' } },
      });
      expect(db.auditoriaInstitucion.create).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    Buffer.from('<svg></svg>'),
    Buffer.from('GIF89a'),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(0),
    Buffer.alloc(3 * 1024 * 1024 + 1),
  ])(
    'rechaza contenido falso, incompleto o excesivo aunque declare PNG',
    async (bytes) => {
      await expect(
        service.subirLogoDeMiInstitucion('owner', file(bytes), 0),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['ADMINISTRADOR', 'DOCENTE'])('rechaza miembro %s', async (rol) => {
    db.miembroInstitucion.findUnique.mockResolvedValue({
      rol,
      usuario: { rol: 'PROFESOR' },
      institucion: { estadoVerificacion: 'APROBADA' },
    });
    await expect(
      service.eliminarLogoDeMiInstitucion('reader', 0),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.institucion.updateMany).not.toHaveBeenCalled();
  });
  it.each(['SUSPENDIDA', 'PENDIENTE'])(
    'rechaza institución %s',
    async (estadoVerificacion) => {
      db.miembroInstitucion.findUnique.mockResolvedValue({
        rol: 'PROPIETARIO',
        usuario: { rol: 'PROFESOR' },
        institucion: { estadoVerificacion },
      });
      await expect(
        service.eliminarLogoDeMiInstitucion('owner', 0),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );
  it('un conflicto no toca imagen ni auditoría', async () => {
    db.institucion.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.eliminarLogoDeMiInstitucion('owner', 4),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.institucionLogo.deleteMany).not.toHaveBeenCalled();
    expect(db.auditoriaInstitucion.create).not.toHaveBeenCalled();
  });
  it('elimina dentro de la misma transacción y audita', async () => {
    expect(await service.eliminarLogoDeMiInstitucion('owner', 4)).toEqual({
      revision: 5,
      logoUrl: null,
    });
    expect(db.institucionLogo.deleteMany).toHaveBeenCalledWith({
      where: { institucionId: id },
    });
    expect(db.auditoriaInstitucion.create.mock.calls[0][0].data.accion).toBe(
      'LOGO_ELIMINADO',
    );
  });
  it('rutas heredadas de cambio exigen propietario', () => {
    for (const name of ['subirLogo', 'eliminarLogo', 'actualizarMiInstitucion'])
      expect(
        Reflect.getMetadata(
          GUARDS_METADATA,
          InstitucionController.prototype[name],
        ),
      ).toContain(PropietarioInstitucionGuard);
  });
  it('PATCH antiguo no admite escribir una URL ni borrar mediante null', async () => {
    const legacy = new InstitucionService(
      db as unknown as PrismaService,
      null!,
      null!,
    );
    for (const value of ['https://example.org/x.png', '', null])
      await expect(
        legacy.actualizarMiInstitucion('owner', undefined, undefined, value),
      ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.institucion.updateMany).not.toHaveBeenCalled();
  });
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  it.each([true, false, null, '', '01', '-1', '1e2', '1.5', 2147483647])(
    'rechaza revisión %j',
    async (revision) => {
      await expect(
        pipe.transform(
          { revision },
          { type: 'body', metatype: InstitutionLogoDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('admite revisión multipart y descarta URLs heredadas', async () => {
    expect(
      (
        await pipe.transform(
          { revision: '3' },
          { type: 'body', metatype: InstitutionLogoDto },
        )
      ).revision,
    ).toBe(3);
    expect(managedLogoUrl('/uploads/old.png')).toBeNull();
    expect(managedLogoUrl('https://example.org/logo.png')).toBeNull();
  });
});
