import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileService } from './editorial-file.service';
import { PrivateOfflineLessonService } from './private-offline-lesson.service';
import { sha256 } from './editorial-image';
import { LicenciaAccesoService } from '../institucion/licencia-acceso.service';

describe('PrivateOfflineLessonService', () => {
  const id = 'a6ec3648-24ee-47d0-91f8-e59b2b68b9ab';
  const lesson = {
    id: 'lesson',
    nombre: 'Figura',
    contenido: 'Texto exacto.',
    imagenUrl: `/recursos/editoriales/${id}`,
    archivoImagenId: id,
  };
  const bytes = Buffer.from('RIFF0000WEBPverified');
  const nonce = 'a'.repeat(64);
  const subtema = { findFirst: jest.fn() },
    usuario = { findUnique: jest.fn() },
    files = { publishedContent: jest.fn() },
    clock = jest.fn();
  const prisma = {
    subtema,
    usuario,
    origenGestionadoInstitucional: { findUnique: jest.fn() },
    $queryRaw: clock,
  } as unknown as PrismaService;
  const service = new PrivateOfflineLessonService(
    prisma,
    files as unknown as EditorialFileService,
  );
  const previous = {
    node: process.env.NODE_ENV,
    files: process.env.EDITORIAL_FILES_LOCAL_ENABLED,
    offline: process.env.EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED,
  };
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.NODE_ENV = 'test';
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'true';
    process.env.EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED = 'true';
    subtema.findFirst.mockResolvedValue(lesson);
    usuario.findUnique.mockResolvedValue({
      id: 'owner',
      correoVerificado: true,
      debeCambiarContrasena: false,
    });
    files.publishedContent.mockResolvedValue(bytes);
    clock.mockResolvedValue([{ now: new Date('2026-11-01T00:00:00.000Z') }]);
  });
  afterAll(() => {
    for (const [key, value] of Object.entries({
      NODE_ENV: previous.node,
      EDITORIAL_FILES_LOCAL_ENABLED: previous.files,
      EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED: previous.offline,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  it('binds exact snapshot, owner and nonce to 72h backend time', async () => {
    const result = await service.validate('owner', 'lesson', nonce);
    expect(result.ownerId).toBe('owner');
    expect(result.requestNonce).toBe(nonce);
    expect(result.expiresAt).toBe('2026-11-04T00:00:00.000Z');
    expect(result.snapshot.image?.sha256).toBe(sha256(bytes));
    expect(result.contextDigest).toBe(sha256(JSON.stringify(result.snapshot)));
    expect(files.publishedContent.mock.calls).toEqual([[id], [id]]);
  });
  it('uses the license deadline without extending the private TTL', async () => {
    const limitarOffline = jest
      .fn()
      .mockResolvedValue(new Date('2026-11-01T01:00:00Z'));
    const licensed = new PrivateOfflineLessonService(
      prisma,
      files as unknown as EditorialFileService,
      { limitarOffline } as unknown as LicenciaAccesoService,
    );
    const result = await licensed.validate('owner', 'lesson', nonce);
    expect(result.expiresAt).toBe('2026-11-01T01:00:00.000Z');
    expect(limitarOffline).toHaveBeenCalledWith(
      'owner',
      new Date('2026-11-01T00:00:00Z'),
      new Date('2026-11-04T00:00:00Z'),
    );
  });
  it('permite origen gestionado explícito sin fingir correo verificado', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'owner',
      correoVerificado: false,
      debeCambiarContrasena: false,
      institucionId: 'institution',
    });
    (
      prisma.origenGestionadoInstitucional.findUnique as jest.Mock
    ).mockResolvedValue({ institucionId: 'institution' });
    const exigirPractica = jest.fn().mockResolvedValue({});
    const limitarOffline = jest
      .fn()
      .mockResolvedValue(new Date('2026-11-01T01:00:00Z'));
    const licensed = new PrivateOfflineLessonService(
      prisma,
      files as unknown as EditorialFileService,
      { exigirPractica, limitarOffline } as unknown as LicenciaAccesoService,
    );
    await expect(
      licensed.validate('owner', 'lesson', nonce),
    ).resolves.toMatchObject({ expiresAt: '2026-11-01T01:00:00.000Z' });
    expect(exigirPractica).toHaveBeenCalledTimes(2);
  });
  it('una FK institucional sin origen gestionado no sustituye verificación real', async () => {
    usuario.findUnique.mockResolvedValue({
      id: 'owner',
      correoVerificado: false,
      debeCambiarContrasena: false,
      institucionId: 'institution',
    });
    (
      prisma.origenGestionadoInstitucional.findUnique as jest.Mock
    ).mockResolvedValue(null);
    const licensed = new PrivateOfflineLessonService(
      prisma,
      files as unknown as EditorialFileService,
      {} as LicenciaAccesoService,
    );
    await expect(
      licensed.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(files.publishedContent).not.toHaveBeenCalled();
  });
  it('does not issue a grant when license revalidation is denied', async () => {
    const licensed = new PrivateOfflineLessonService(
      prisma,
      files as unknown as EditorialFileService,
      {
        limitarOffline: jest
          .fn()
          .mockRejectedValue(new ForbiddenException('Suspended')),
      } as unknown as LicenciaAccesoService,
    );
    await expect(
      licensed.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('stays disabled in production despite opt-in', async () => {
    process.env.NODE_ENV = 'production';
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(subtema.findFirst).not.toHaveBeenCalled();
  });
  it('does not grant to a missing account', async () => {
    usuario.findUnique.mockResolvedValue(null);
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
  it('does not grant archived or missing lesson', async () => {
    subtema.findFirst.mockResolvedValue(null);
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(files.publishedContent).not.toHaveBeenCalled();
  });
  it('refuses legacy external image URLs without any network request', async () => {
    subtema.findFirst.mockResolvedValue({
      ...lesson,
      imagenUrl: 'https://example.invalid/image.png',
      archivoImagenId: null,
    });
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(files.publishedContent).not.toHaveBeenCalled();
  });
  it('rejects a mutable lesson changed during permission validation', async () => {
    subtema.findFirst
      .mockResolvedValueOnce(lesson)
      .mockResolvedValueOnce({ ...lesson, contenido: 'New version' });
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(ConflictException);
  });
  it('revocation before final read prevents a grant', async () => {
    files.publishedContent
      .mockResolvedValueOnce(bytes)
      .mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(clock).not.toHaveBeenCalled();
  });
  it('account invalidated during validation prevents a grant', async () => {
    usuario.findUnique
      .mockResolvedValueOnce({ id: 'owner', correoVerificado: true })
      .mockResolvedValueOnce(null);
    await expect(
      service.validate('owner', 'lesson', nonce),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
