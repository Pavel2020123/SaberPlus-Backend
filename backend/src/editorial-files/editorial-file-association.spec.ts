import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { editorialImageData } from './editorial-file-association';
import {
  editorialImagePath,
  managedEditorialImageId,
} from './editorial-image-reference';

describe('asociación de imágenes a contenido', () => {
  const id = '2df4f385-fec2-4cb1-89af-91f67a476b52';
  const oldFlag = process.env.EDITORIAL_FILES_LOCAL_ENABLED;
  const oldEnvironment = process.env.NODE_ENV;
  const db = {
    $queryRaw: jest.fn(),
    archivoEditorial: { findUnique: jest.fn() },
  };
  const tx = db as unknown as Prisma.TransactionClient;
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'true';
    process.env.NODE_ENV = 'test';
    db.archivoEditorial.findUnique.mockResolvedValue({
      id,
      estado: 'DISPONIBLE',
    });
  });
  afterAll(() => {
    if (oldFlag === undefined) delete process.env.EDITORIAL_FILES_LOCAL_ENABLED;
    else process.env.EDITORIAL_FILES_LOCAL_ENABLED = oldFlag;
    if (oldEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldEnvironment;
  });
  it('mantiene enlaces HTTPS y permite quitar la asociación sin consultar archivos', async () => {
    expect(
      await editorialImageData(tx, 'https://example.com/imagen.png'),
    ).toEqual({
      imagenUrl: 'https://example.com/imagen.png',
      archivoImagenId: null,
    });
    expect(await editorialImageData(tx, '')).toEqual({
      imagenUrl: null,
      archivoImagenId: null,
    });
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it('bloquea el recurso antes de asociar una imagen disponible', async () => {
    expect(await editorialImageData(tx, editorialImagePath(id))).toEqual({
      imagenUrl: editorialImagePath(id),
      archivoImagenId: id,
    });
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.archivoEditorial.findUnique.mock.invocationCallOrder[0],
    );
  });
  it.each(['PREPARADO', 'RETIRADO', null])(
    'impide asociar un recurso %s',
    async (state) => {
      db.archivoEditorial.findUnique.mockResolvedValue(
        state ? { id, estado: state } : null,
      );
      await expect(
        editorialImageData(tx, editorialImagePath(id)),
      ).rejects.toBeInstanceOf(ConflictException);
    },
  );
  it('conserva compatibilidad HTTPS cuando la nueva carga está desactivada', async () => {
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'false';
    expect(
      (await editorialImageData(tx, 'https://example.com/a')).archivoImagenId,
    ).toBeNull();
    await expect(
      editorialImageData(tx, editorialImagePath(id)),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
  it.each([
    '/recursos/editoriales/../x',
    `/recursos/editoriales/${id}?token=x`,
    `/admin/archivos/${id}/contenido`,
    'javascript:alert(1)',
  ])('rechaza referencia no admitida %s', async (value) => {
    expect(managedEditorialImageId(value)).toBeNull();
    await expect(editorialImageData(tx, value)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});
