import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ArchivoEditorial,
  Prisma,
  RevocacionArchivoEditorial,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileService } from './editorial-file.service';
import { RevokeEditorialFileDto } from './editorial-file.dto';
import { historicalAnswerOption } from './historical-answer-option';
import { editorialImagePath } from './editorial-image-reference';
import { sha256 } from './editorial-image';

describe('C5-H1: prueba histórica propia y revocación', () => {
  const id = '40df4f38-fec2-4cb1-89af-91f67a476b52';
  const actor = 'af6119b0-0ab2-4c7d-9dd7-a6dfdfb0cdbe';
  const bytes = Buffer.from('bytes WEBP ya normalizados por la carga');
  const dto: RevokeEditorialFileDto = {
    operacionId: '17406e58-4529-4e6e-8360-2d4dd9e1f12b',
    motivo: 'DERECHOS',
    detalle: 'Se revocó el permiso de la ilustración.',
  };
  let file: ArchivoEditorial & {
    revocacion: RevocacionArchivoEditorial | null;
  };
  let revocation: RevocacionArchivoEditorial | null;
  const db = {
    archivoEditorial: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    revocacionArchivoEditorial: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    imagenHistorialRespuesta: { count: jest.fn() },
    pregunta: { count: jest.fn() },
    casoPregunta: { count: jest.fn() },
    subtema: { count: jest.fn() },
    respuesta: { count: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const store = { read: jest.fn(), put: jest.fn(), remove: jest.fn() };
  const runtime = {
    assertEnabled: jest.fn(),
    historyEnabled: jest.fn(),
    snapshotsEnabled: jest.fn(),
    triviaSnapshotsEnabled: jest.fn(),
    tugSnapshotsEnabled: jest.fn(),
    battleSnapshotsEnabled: jest.fn(),
  };
  const service = new EditorialFileService(
    db as unknown as PrismaService,
    store,
    runtime as unknown as EditorialFileRuntime,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    file = {
      id,
      estado: 'DISPONIBLE',
      sha256: sha256(bytes),
      bytes: bytes.length,
      revocacion: null,
    } as typeof file;
    revocation = null;
    runtime.historyEnabled.mockReturnValue(true);
    db.archivoEditorial.findUnique.mockImplementation(
      () => file && { ...file, revocacion: revocation },
    );
    db.archivoEditorial.findFirst.mockResolvedValue(null);
    db.revocacionArchivoEditorial.findUnique.mockImplementation(
      ({ where }: { where: { operacionId: string } }) =>
        revocation?.operacionId === where.operacionId ? revocation : null,
    );
    db.revocacionArchivoEditorial.findFirst.mockImplementation(
      ({
        where,
      }: {
        where: { actorId: string; archivoId: string; operacionId: string };
      }) =>
        revocation &&
        Object.entries(where).every(([key, value]) => revocation[key] === value)
          ? revocation
          : null,
    );
    db.revocacionArchivoEditorial.create.mockImplementation(
      ({ data }: { data: Omit<RevocacionArchivoEditorial, 'creadoEn'> }) => {
        revocation = { ...data, creadoEn: new Date() };
        return revocation;
      },
    );
    db.$transaction.mockImplementation(
      (fn: (tx: typeof db) => Promise<unknown>) => fn(db),
    );
    for (const model of [
      db.pregunta,
      db.casoPregunta,
      db.subtema,
      db.respuesta,
      db.imagenHistorialRespuesta,
    ])
      model.count.mockResolvedValue(0);
    store.read.mockResolvedValue(bytes);
  });

  it('permite el historial solo con propietario JWT, mismo propietario del registro y SHA original', async () => {
    db.archivoEditorial.findFirst.mockResolvedValueOnce({ id });
    await expect(service.publishedContent(id, actor)).resolves.toEqual(bytes);
    const calls = db.archivoEditorial.findFirst.mock.calls as unknown as [
      Prisma.ArchivoEditorialFindFirstArgs,
    ][];
    const query = calls[0][0];
    expect(query.where?.revocacion).toBeNull();
    expect(query.where?.OR).toContainEqual({
      imagenesHistoricas: {
        some: {
          usuarioId: actor,
          sha256: file.sha256,
          historial: { usuarioId: actor },
        },
      },
    });
  });

  it('sin uso publicado ni prueba histórica propia no entrega bytes', async () => {
    await expect(service.publishedContent(id, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(store.read).not.toHaveBeenCalled();
  });

  it.each([undefined, ''])(
    'sin actor no añade permiso histórico: %s',
    async (user) => {
      await expect(service.publishedContent(id, user)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(
        JSON.stringify(db.archivoEditorial.findFirst.mock.calls),
      ).not.toContain('imagenesHistoricas');
    },
  );

  it('desactivar H1 mantiene la lectura publicada y excluye el historial', async () => {
    runtime.historyEnabled.mockReturnValue(false);
    db.archivoEditorial.findFirst.mockResolvedValueOnce({ id });
    await expect(service.publishedContent(id, actor)).resolves.toEqual(bytes);
    expect(
      JSON.stringify(db.archivoEditorial.findFirst.mock.calls),
    ).not.toContain('imagenesHistoricas');
  });

  it.each(['PREPARADO', 'RETIRADO'] as const)(
    'no concede permisos al archivo %s',
    async (state) => {
      file.estado = state;
      await expect(service.publishedContent(id, actor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(db.archivoEditorial.findFirst).not.toHaveBeenCalled();
      expect(store.read).not.toHaveBeenCalled();
    },
  );

  it('UUID inexistente y recurso privado tienen el mismo 404', async () => {
    const denied = await service
      .publishedContent(id, actor)
      .catch((e: unknown) => e);
    db.archivoEditorial.findUnique.mockResolvedValueOnce(null);
    const missing = await service
      .publishedContent(id, actor)
      .catch((e: unknown) => e);
    expect(missing).toEqual(denied);
  });

  it('una imagen alterada no se entrega aunque exista permiso histórico', async () => {
    db.archivoEditorial.findFirst.mockResolvedValueOnce({ id });
    store.read.mockResolvedValueOnce(Buffer.from('alterado'));
    await expect(service.publishedContent(id, actor)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('protege de retirada también la referencia histórica sin asociaciones actuales', async () => {
    db.imagenHistorialRespuesta.count.mockResolvedValueOnce(1);
    await expect(service.retire(id)).rejects.toBeInstanceOf(ConflictException);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it('revoca con recibo durable; reintentar no borra bytes, respuestas o XP', async () => {
    const first = await service.revoke(actor, id, dto);
    expect(await service.revoke(actor, id, dto)).toEqual(first);
    expect(await service.revoke(actor, id.toUpperCase(), dto)).toEqual(first);
    expect(db.revocacionArchivoEditorial.create).toHaveBeenCalledTimes(1);
    expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      db.revocacionArchivoEditorial.create.mock.invocationCallOrder[0],
    );
    expect(store.remove).not.toHaveBeenCalled();
    expect(db.archivoEditorial.updateMany).not.toHaveBeenCalled();
    expect(first).not.toHaveProperty('huellaSolicitud');
    expect(first).not.toHaveProperty('actorId');
  });

  it('la revocación bloquea toda lectura aun con uso publicado e historial', async () => {
    await service.revoke(actor, id, dto);
    db.archivoEditorial.findFirst.mockResolvedValue({ id });
    await expect(service.publishedContent(id, actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.content(id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.retire(id)).rejects.toBeInstanceOf(ConflictException);
    expect(await service.detail(id)).toMatchObject({
      estado: 'REVOCADO',
      contenidoUrl: null,
      puedeReintentar: false,
    });
    expect(await service.detail(id)).not.toHaveProperty('detalle');
    expect(store.read).not.toHaveBeenCalled();
  });

  it('recomprueba la revocación que confirma mientras se leen los bytes', async () => {
    store.read.mockImplementationOnce(async () => {
      await service.revoke(actor, id, dto);
      return bytes;
    });
    await expect(service.content(id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no cambia el motivo ni el archivo al reutilizar una operación', async () => {
    await service.revoke(actor, id, dto);
    await expect(
      service.revoke(actor, id, { ...dto, motivo: 'SEGURIDAD' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.revoke(actor, 'otro archivo', dto),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.revoke('otro administrador', id, dto),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('no permite otra operación para deshacer o sobrescribir una revocación', async () => {
    await service.revoke(actor, id, dto);
    await expect(
      service.revoke(actor, id, { ...dto, operacionId: id }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('solo el ADMIN emisor consulta el recibo de esa operación y archivo', async () => {
    const receipt = await service.revoke(actor, id, dto);
    expect(await service.revocationReceipt(actor, id, dto.operacionId)).toEqual(
      receipt,
    );
    await expect(
      service.revocationReceipt('otro', id, dto.operacionId),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.revocationReceipt(actor, 'otro', dto.operacionId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('resuelve una reserva única concurrente fuera de la transacción abortada', async () => {
    const receipt = await service.revoke(actor, id, dto);
    db.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Duplicado', {
        code: 'P2002',
        clientVersion: '5.22.0',
      }),
    );
    expect(await service.revoke(actor, id, dto)).toEqual(receipt);
    db.$transaction.mockRejectedValueOnce(new Error('SQL sin conexión'));
    await expect(service.revoke(actor, id, dto)).rejects.toThrow(
      'SQL sin conexión',
    );
  });

  it('revocar un archivo inexistente no inventa un recibo', async () => {
    db.archivoEditorial.findUnique.mockResolvedValueOnce(null);
    await expect(service.revoke(actor, id, dto)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(db.revocacionArchivoEditorial.create).not.toHaveBeenCalled();
  });

  it('la proyección histórica usa la captura original sin filtrar campos de solución', () => {
    const result = historicalAnswerOption(
      {
        id: 'respuesta',
        texto: 'Opción',
        imagenUrl: editorialImagePath(actor),
        esCorrecta: true,
      } as { id: string; texto: string; imagenUrl: string },
      [{ respuestaId: 'respuesta', archivoId: id, rol: 'SELECCIONADA' }],
      'SELECCIONADA',
    );
    expect(result).toEqual({
      id: 'respuesta',
      texto: 'Opción',
      imagenUrl: editorialImagePath(id),
    });
  });

  it('una captura de otra respuesta/rol no sustituye la imagen y el legado conserva contrato', () => {
    const option = { id: 'respuesta', texto: 'Opción' };
    expect(historicalAnswerOption(option, undefined, 'CORRECTA')).toEqual(
      option,
    );
    expect(
      historicalAnswerOption(
        option,
        [{ respuestaId: 'otra', archivoId: id, rol: 'CORRECTA' }],
        'CORRECTA',
      ),
    ).toEqual(option);
    expect(
      historicalAnswerOption(
        option,
        [{ respuestaId: 'respuesta', archivoId: id, rol: 'SELECCIONADA' }],
        'CORRECTA',
      ),
    ).toEqual(option);
  });
});

describe('C5-H1 permanece opt-in y exclusivamente local', () => {
  const saved = { ...process.env };
  afterAll(() => {
    process.env = saved;
  });
  it.each([
    ['true', 'true', 'development', true],
    ['true', 'true', 'test', true],
    ['true', 'true', 'production', false],
    ['true', 'true', 'staging', false],
    ['false', 'true', 'test', false],
    ['true', 'false', 'test', false],
    ['', 'true', 'test', false],
  ])(
    'historial=%s archivos=%s entorno=%s => %s',
    (history, files, environment, enabled) => {
      process.env.EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED = String(history);
      process.env.EDITORIAL_FILES_LOCAL_ENABLED = String(files);
      process.env.NODE_ENV = String(environment);
      expect(new EditorialFileRuntime().historyEnabled()).toBe(enabled);
    },
  );
});
