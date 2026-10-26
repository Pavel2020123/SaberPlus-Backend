import {
  ConflictException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArchivoEditorial, Prisma } from '@prisma/client';
import * as sharpModule from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { UploadEditorialFileDto } from './editorial-file.dto';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';

const sharp = sharpModule as unknown as typeof import('sharp').default;
describe('recibos, integridad y ciclo de archivos editoriales', () => {
  const actor = '4aa6c569-f4a7-4b1e-9f8a-4b50ab693a36';
  const dto: UploadEditorialFileDto = {
    operacionId: 'f2c743aa-7ba2-454b-9319-b6e234f7d206',
    titulo: 'Diagrama de fracciones',
    textoAlternativo: 'Círculo dividido en cuatro partes iguales.',
    fuente: 'Ilustración propia',
    titular: 'Equipo SaberPlus',
    autorizacion: 'ORIGINAL',
  };
  let row: ArchivoEditorial | null;
  let image: Buffer;
  const table = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const store = { put: jest.fn(), read: jest.fn(), remove: jest.fn() };
  const runtime = {
    assertEnabled: jest.fn(),
    historyEnabled: jest.fn(),
    snapshotsEnabled: jest.fn(),
    triviaSnapshotsEnabled: jest.fn(),
    tugSnapshotsEnabled: jest.fn(),
    battleSnapshotsEnabled: jest.fn(),
  };
  const db = {
    archivoEditorial: table,
    pregunta: { count: jest.fn() },
    casoPregunta: { count: jest.fn() },
    subtema: { count: jest.fn() },
    respuesta: { count: jest.fn() },
    imagenHistorialRespuesta: { count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const service = new EditorialFileService(
    db as unknown as PrismaService,
    store,
    runtime as unknown as EditorialFileRuntime,
  );
  beforeAll(async () => {
    image = await sharp({
      create: { width: 32, height: 16, channels: 3, background: 'white' },
    })
      .png()
      .toBuffer();
  });
  beforeEach(() => {
    jest.resetAllMocks();
    row = null;
    db.$transaction.mockImplementation(
      (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        fn(db as unknown as Prisma.TransactionClient),
    );
    for (const model of [
      db.pregunta,
      db.casoPregunta,
      db.subtema,
      db.respuesta,
      db.imagenHistorialRespuesta,
    ])
      model.count.mockResolvedValue(0);
    table.findUnique.mockImplementation(() => row && { ...row });
    table.findFirst.mockImplementation(
      ({ where }: { where: { creadoPorId: string } }) =>
        row?.creadoPorId === where.creadoPorId ? { ...row } : null,
    );
    table.create.mockImplementation(
      ({ data }: { data: Partial<ArchivoEditorial> }) => {
        row = {
          ...data,
          estado: 'PREPARADO',
          creadoEn: new Date(),
          actualizadoEn: new Date(),
        } as ArchivoEditorial;
        return { ...row };
      },
    );
    table.updateMany.mockImplementation(
      ({ data }: { data: { estado: ArchivoEditorial['estado'] } }) => {
        if (row?.estado === 'RETIRADO') return { count: 0 };
        if (row) row.estado = data.estado;
        return { count: 1 };
      },
    );
    store.put.mockImplementation((_id: string, bytes: Buffer) => {
      store.read.mockResolvedValue(bytes);
    });
  });

  it('reserva el recibo antes de guardar bytes, confirma y no expone rutas internas', async () => {
    const result = await service.upload(actor, dto, image);
    expect(result).toMatchObject({
      estado: 'DISPONIBLE',
      tipo: 'image/webp',
      ancho: 32,
      alto: 16,
      puedeReintentar: false,
    });
    expect(result.contenidoUrl).toBe(`/admin/archivos/${result.id}/contenido`);
    expect(table.create.mock.invocationCallOrder[0]).toBeLessThan(
      store.put.mock.invocationCallOrder[0],
    );
    expect(result).not.toHaveProperty('huellaSolicitud');
    expect(result).not.toHaveProperty('creadoPorId');
    expect(await service.content(result.id)).toBeInstanceOf(Buffer);
    expect(await service.content(result.id.toUpperCase())).toBeInstanceOf(
      Buffer,
    );
    expect(store.read).toHaveBeenLastCalledWith(result.id);
  });

  it('un reintento idéntico no crea otro recurso ni vuelve a escribir bytes', async () => {
    const first = await service.upload(actor, dto, image);
    expect(await service.upload(actor, dto, image)).toEqual(first);
    expect(table.create).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('una carga repetida no reactiva una revocación confirmada', async () => {
    await service.upload(actor, dto, image);
    table.findUnique.mockImplementation(() => ({
      ...row,
      revocacion: { archivoId: row.id },
    }));
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('una revocación durante IO impide confirmar la carga y conserva bytes para auditoría', async () => {
    store.put.mockImplementationOnce(() => {
      table.findUnique.mockImplementation(() => ({
        ...row,
        revocacion: { archivoId: row.id },
      }));
    });
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(table.updateMany).not.toHaveBeenCalled();
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('cambiar metadatos en la misma operación devuelve conflicto', async () => {
    await service.upload(actor, dto, image);
    await expect(
      service.upload(actor, { ...dto, titulo: 'Otro' }, image),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('cambiar los bytes en la misma operación no sobrescribe el recurso', async () => {
    await service.upload(actor, dto, image);
    const other = await sharp(image).negate().png().toBuffer();
    await expect(service.upload(actor, dto, other)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('otra cuenta no puede consultar ni reutilizar el recibo', async () => {
    await service.upload(actor, dto, image);
    await expect(
      service.receipt('otra-cuenta', dto.operacionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.upload('otra-cuenta', dto, image),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('archivo inválido o autorización incompleta no crean metadatos', async () => {
    await expect(
      service.upload(actor, dto, Buffer.from('PNG falso')),
    ).rejects.toThrow();
    await expect(
      service.upload(actor, { ...dto, autorizacion: 'LICENCIA' }, image),
    ).rejects.toThrow('referencia');
    expect(table.create).not.toHaveBeenCalled();
    expect(store.put).not.toHaveBeenCalled();
  });

  it('una escritura fallida deja PREPARADO y permite reintentar el mismo envío', async () => {
    store.put.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(await service.receipt(actor, dto.operacionId)).toMatchObject({
      estado: 'PREPARADO',
      contenidoUrl: null,
      puedeReintentar: true,
    });
    await expect(service.content(row.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service.upload(actor, dto, image)).estado).toBe('DISPONIBLE');
    expect(table.create).toHaveBeenCalledTimes(1);
  });

  it('un acuse de confirmación perdido recupera los mismos bytes y recibo', async () => {
    table.updateMany.mockRejectedValueOnce(
      new Error('Conexión de base interrumpida'),
    );
    await expect(service.upload(actor, dto, image)).rejects.toThrow();
    expect((await service.receipt(actor, dto.operacionId)).estado).toBe(
      'PREPARADO',
    );
    expect((await service.upload(actor, dto, image)).estado).toBe('DISPONIBLE');
    expect(table.create).toHaveBeenCalledTimes(1);
  });

  it('la reserva simultánea P2002 recupera el recibo ganador', async () => {
    const result = await service.upload(actor, dto, image);
    const saved = row;
    table.findUnique.mockResolvedValueOnce(null);
    table.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Conflicto único', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    row = saved;
    expect(await service.upload(actor, dto, image)).toEqual(result);
  });

  it('si la confirmación se guardó pero se perdió el acuse, el reintento no vuelve a escribir', async () => {
    table.updateMany.mockImplementationOnce(() => {
      row.estado = 'DISPONIBLE';
      throw new Error('Acuse perdido después de confirmar');
    });
    await expect(service.upload(actor, dto, image)).rejects.toThrow(
      'Acuse perdido',
    );
    expect((await service.receipt(actor, dto.operacionId)).estado).toBe(
      'DISPONIBLE',
    );
    expect((await service.upload(actor, dto, image)).estado).toBe('DISPONIBLE');
    expect(table.create).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('otro error de base no se confunde con una reserva repetida', async () => {
    table.create.mockRejectedValueOnce(new Error('Base no disponible'));
    await expect(service.upload(actor, dto, image)).rejects.toThrow(
      'Base no disponible',
    );
    expect(store.put).not.toHaveBeenCalled();
  });

  it('detecta bytes corruptos y no los entrega', async () => {
    const result = await service.upload(actor, dto, image);
    store.read.mockResolvedValue(Buffer.alloc(result.bytes));
    await expect(service.content(result.id)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('la retirada revoca acceso antes del borrado; el reintento termina la limpieza', async () => {
    const result = await service.upload(actor, dto, image);
    store.remove.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(
      service.retire(result.id.toUpperCase()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(store.remove).toHaveBeenCalledWith(result.id);
    expect(row?.estado).toBe('RETIRADO');
    await expect(service.content(result.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect((await service.retire(result.id)).estado).toBe('RETIRADO');
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('una retirada durante la escritura no resucita el recurso', async () => {
    store.put.mockImplementation(() => {
      row.estado = 'RETIRADO';
    });
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(row?.estado).toBe('RETIRADO');
    expect(store.remove).toHaveBeenCalledTimes(1);
  });

  it('si cambió la normalización de un envío PREPARADO no publica bytes distintos', async () => {
    store.put.mockRejectedValueOnce(new ServiceUnavailableException());
    await expect(service.upload(actor, dto, image)).rejects.toThrow();
    row.sha256 = '0'.repeat(64);
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('desactivado no consulta base ni procesa archivos', async () => {
    runtime.assertEnabled.mockImplementation(() => {
      throw new ServiceUnavailableException();
    });
    await expect(service.upload(actor, dto, image)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(
      service.receipt(actor, dto.operacionId),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(table.findUnique).not.toHaveBeenCalled();
    expect(table.create).not.toHaveBeenCalled();
  });

  it('detalle y retirada desconocidos devuelven 404', async () => {
    await expect(service.detail('desconocido')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.retire('desconocido')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(store.remove).not.toHaveBeenCalled();
  });

  it.each(['pregunta', 'casoPregunta', 'subtema', 'respuesta'] as const)(
    'protege una imagen usada por %s aunque sea una versión anterior',
    async (kind) => {
      const result = await service.upload(actor, dto, image);
      db[kind].count.mockResolvedValue(1);
      await expect(service.retire(result.id)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(row.estado).toBe('DISPONIBLE');
      expect(store.remove).not.toHaveBeenCalled();
    },
  );

  it('lectura por una opción exige pregunta y padres publicados, sin filtrar por si es correcta', async () => {
    const uploaded = await service.upload(actor, dto, image);
    table.findFirst.mockResolvedValueOnce({ id: uploaded.id });
    await expect(service.publishedContent(uploaded.id)).resolves.toEqual(
      await store.read(uploaded.id),
    );
    const calls = table.findFirst.mock.calls as unknown as [
      Prisma.ArchivoEditorialFindFirstArgs,
    ][];
    const query = calls[0][0];
    expect(query.where).toMatchObject({
      id: uploaded.id,
      estado: 'DISPONIBLE',
    });
    expect(query.where?.OR).toContainEqual({
      opciones: {
        some: {
          pregunta: {
            estadoContenido: 'PUBLICADO',
            subtema: {
              estadoContenido: 'PUBLICADO',
              tema: { estadoContenido: 'PUBLICADO' },
            },
          },
        },
      },
    });
    expect(JSON.stringify(query)).not.toContain('esCorrecta');
    expect(query.select).toEqual({ id: true });
  });

  it('un recurso sin uso publicado no alcanza el disco', async () => {
    const uploaded = await service.upload(actor, dto, image);
    table.findFirst.mockResolvedValueOnce(null);
    await expect(service.publishedContent(uploaded.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(store.read).not.toHaveBeenCalled();
  });
});
