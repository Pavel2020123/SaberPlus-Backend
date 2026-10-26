import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  editorialImageData,
  editorialImagesData,
} from './editorial-file-association';
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

  it('la revocación prevalece aunque el estado de almacenamiento sea DISPONIBLE', async () => {
    db.archivoEditorial.findUnique.mockResolvedValueOnce({
      id,
      estado: 'DISPONIBLE',
      revocacion: { archivoId: id },
    });
    await expect(
      editorialImageData(tx, editorialImagePath(id)),
    ).rejects.toBeInstanceOf(ConflictException);
  });
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

  it('ordena y deduplica los locks pero conserva el orden original y las repeticiones', async () => {
    const other = '1df4f385-fec2-4cb1-89af-91f67a476b52';
    const paths = [
      editorialImagePath(id),
      '',
      editorialImagePath(other),
      editorialImagePath(id.toUpperCase()),
    ];
    expect(await editorialImagesData(tx, paths)).toEqual([
      { imagenUrl: paths[0], archivoImagenId: id },
      { imagenUrl: null, archivoImagenId: null },
      { imagenUrl: paths[2], archivoImagenId: other },
      { imagenUrl: paths[0], archivoImagenId: id },
    ]);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    expect(db.$queryRaw.mock.calls.map((args: unknown[]) => args[1])).toEqual([
      other,
      id,
    ]);
  });

  it('valida toda la entrada antes de bloquear un recurso', async () => {
    await expect(
      editorialImagesData(tx, [editorialImagePath(id), 'javascript:alert(1)']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('un lote sin recursos privados no necesita activar el almacenamiento', async () => {
    process.env.EDITORIAL_FILES_LOCAL_ENABLED = 'false';
    expect(
      await editorialImagesData(tx, ['', 'https://example.com/a.png']),
    ).toHaveLength(2);
    expect(await editorialImagesData(tx, [])).toEqual([]);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it('no permite el lote cuando una imagen no está disponible', async () => {
    db.archivoEditorial.findUnique.mockResolvedValueOnce(null);
    await expect(
      editorialImagesData(tx, [editorialImagePath(id), editorialImagePath(id)]),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
