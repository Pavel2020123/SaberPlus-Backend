import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from '../auth/jwt.guard';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { LegacyQuestionIndexService } from './legacy-question-index.service';
import { LegacyQuestionIndexController } from './legacy-question-index.controller';
import {
  ApplyLegacyIndexDto,
  LegacyDuplicatesDto,
  LegacyFingerprintParams,
  LegacyIndexBatchDto,
  LegacyMatchesDto,
} from './legacy-question-index.dto';

const row = (id: string, text = '¿Cuánto es 2 + 2?') => ({
  id,
  enunciado: text,
  imagenUrl: null as string | null,
  huellaContenido: null as string | null,
  subtemaId: 's1',
  estadoContenido: 'ARCHIVADO',
  fechaActualizacion: '2026-09-01 12:00:00.123456',
  subtema: {
    id: 's1',
    nombre: 'Banco General',
    temaId: 't1',
    tema: { id: 't1', nombre: 'Aritmética', area: 'MATEMATICAS' },
  },
  respuestas: [
    { id: 'r1', texto: '4' },
    { id: 'r2', texto: '5' },
  ],
});
type Row = ReturnType<typeof row>;
type Find = {
  where: {
    huellaContenido: string | null;
    subtema: { tema: { area: string } };
    id?: { gt: string };
  };
  take: number;
};
type Group = {
  where: {
    subtema: { tema: { area: string } };
    huellaContenido: { in?: string[]; gt?: string };
  };
  having?: unknown;
  take?: number;
};

describe('legacy fingerprint batches (transactional persistence double)', () => {
  let records: Row[] = [];
  const queryRaw = jest.fn<
    Promise<unknown[]>,
    [TemplateStringsArray, ...unknown[]]
  >();
  const executeRaw = jest.fn<
    Promise<number>,
    [TemplateStringsArray, string, string]
  >();
  const pregunta = {
    findMany: jest.fn(),
    count: jest.fn(),
    groupBy: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  };
  const tx = { pregunta, $queryRaw: queryRaw, $executeRaw: executeRaw };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new LegacyQuestionIndexService(
    prisma as unknown as PrismaService,
  );
  const q = { area: 'MATEMATICAS' as const, limite: 2 };
  const previousGate = process.env.EDITORIAL_LEGACY_INDEX_ENABLED;
  const hash = (r: Row) =>
    createQuestionFingerprint({
      area: r.subtema.tema.area,
      enunciado: r.enunciado,
      imagen: r.imagenUrl,
      opciones: r.respuestas,
    });

  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.EDITORIAL_LEGACY_INDEX_ENABLED;
    records = [row('a'), row('b'), row('c', 'Otra pregunta')];
    queryRaw.mockResolvedValue([]);
    pregunta.findMany.mockImplementation((args: Find) =>
      Promise.resolve(
        structuredClone(
          records
            .filter(
              (r) =>
                r.huellaContenido === args.where.huellaContenido &&
                r.subtema.tema.area === args.where.subtema.tema.area &&
                (!args.where.id || r.id > args.where.id.gt),
            )
            .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
            .slice(0, args.take),
        ),
      ),
    );
    pregunta.count.mockImplementation((args: { where: Find['where'] }) =>
      Promise.resolve(
        records.filter(
          (r) =>
            r.huellaContenido === null &&
            r.subtema.tema.area === args.where.subtema.tema.area,
        ).length,
      ),
    );
    pregunta.groupBy.mockImplementation((args: Group) => {
      const counts = new Map<string, number>();
      for (const r of records) {
        const key = r.huellaContenido;
        if (
          !key ||
          r.subtema.tema.area !== args.where.subtema.tema.area ||
          (args.where.huellaContenido.in &&
            !args.where.huellaContenido.in.includes(key)) ||
          (args.where.huellaContenido.gt &&
            key <= args.where.huellaContenido.gt)
        )
          continue;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      return Promise.resolve(
        [...counts]
          .sort(([a], [b]) => (a < b ? -1 : 1))
          .filter(([, count]) => !args.having || count > 1)
          .slice(0, args.take)
          .map(([key, count]) => ({
            huellaContenido: key,
            _count: { _all: count },
          })),
      );
    });
    executeRaw.mockImplementation((_sql, value, id) => {
      const target = records.find(
        (r) => r.id === id && r.huellaContenido === null,
      );
      if (!target) return Promise.resolve(0);
      target.huellaContenido = value;
      return Promise.resolve(1);
    });
    prisma.$transaction.mockImplementation(
      async (action: (client: typeof tx) => Promise<unknown>) => {
        const snapshot = structuredClone(records);
        try {
          return await action(tx);
        } catch (error) {
          records = snapshot;
          throw error;
        }
      },
    );
  });
  afterEach(() => {
    expect(pregunta.update).not.toHaveBeenCalled();
    expect(pregunta.delete).not.toHaveBeenCalled();
    expect(pregunta.create).not.toHaveBeenCalled();
    if (previousGate === undefined)
      delete process.env.EDITORIAL_LEGACY_INDEX_ENABLED;
    else process.env.EDITORIAL_LEGACY_INDEX_ENABLED = previousGate;
  });
  const apply = async () => {
    const preview = await service.preview(q);
    return service.apply({
      ...q,
      revision: preview.revision,
      confirmado: true,
    });
  };

  it('previews a bounded area-specific batch without writing or exposing answers/text', async () => {
    const before = structuredClone(records);
    const result = await service.preview(q);
    expect(result).toMatchObject({
      habilitado: false,
      pendientesEnArea: 3,
      hayMas: true,
    });
    expect(result.items.map((r) => r.id)).toEqual(['a', 'b']);
    expect(result.items[0]).toMatchObject({
      requiereClasificacion: true,
      coincidenciasEnLote: 1,
      coincidenciasIndexadas: 0,
      huella: hash(records[0]),
    });
    expect(result.items[0]).not.toHaveProperty('enunciado');
    expect(result.items[0]).not.toHaveProperty('respuestas');
    expect(records).toEqual(before);
    expect(executeRaw).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(pregunta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
        orderBy: { id: 'asc' },
        where: {
          huellaContenido: null,
          subtema: { tema: { area: 'MATEMATICAS' } },
        },
      }),
    );
  });
  it.each([undefined, 'false', 'TRUE', '1'])(
    'keeps mutation disabled for gate %s',
    async (gate) => {
      if (gate !== undefined) process.env.EDITORIAL_LEGACY_INDEX_ENABLED = gate;
      await expect(apply()).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );
  it('requires explicit confirmation even with the gate enabled', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    const preview = await service.preview(q);
    await expect(
      service.apply({ ...q, revision: preview.revision, confirmado: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
  it('indexes only missing hashes, preserving state, text, classification and microsecond timestamp', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    const before = structuredClone(records);
    const result = await apply();
    expect(result).toMatchObject({
      indexadas: 2,
      ids: ['a', 'b'],
      pendientesEnArea: 1,
    });
    expect(records).toEqual(
      before.map((r, i) => ({ ...r, huellaContenido: i < 2 ? hash(r) : null })),
    );
    const call = executeRaw.mock.calls[0];
    expect(call[0].join('?')).toBe(
      'UPDATE "Pregunta" SET "huellaContenido" = ? WHERE id = ? AND "huellaContenido" IS NULL',
    );
    expect(queryRaw.mock.calls[0][1]).toBe('editor:area:MATEMATICAS');
    expect(queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      executeRaw.mock.invocationCallOrder[0],
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 5000,
      timeout: 30000,
    });
  });
  it('resumes from remaining null hashes and never overwrites a preexisting hash', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    records[0].huellaContenido = 'f'.repeat(64);
    await apply();
    expect(records[0].huellaContenido).toBe('f'.repeat(64));
    expect((await service.preview(q)).items).toEqual([]);
    expect((await apply()).indexadas).toBe(0);
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
  it('rejects a replay after a lost response rather than silently indexing the next batch', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    const preview = await service.preview(q);
    const command = { ...q, revision: preview.revision, confirmado: true };
    await service.apply(command);
    await expect(service.apply(command)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(records[2].huellaContenido).toBeNull();
    expect(executeRaw).toHaveBeenCalledTimes(2);
  });
  it('rejects stale content after waiting on the row lock without any write', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    const preview = await service.preview(q);
    queryRaw.mockResolvedValueOnce([]).mockImplementationOnce(() => {
      records[0].enunciado = 'Edición concurrente';
      return Promise.resolve([]);
    });
    await expect(
      service.apply({ ...q, revision: preview.revision, confirmado: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executeRaw).not.toHaveBeenCalled();
  });
  it('does not silently use a preview for another area or batch size', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    const { revision } = await service.preview(q);
    await expect(
      service.apply({ ...q, limite: 1, revision, confirmado: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.apply({ ...q, area: 'INGLES', revision, confirmado: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(executeRaw).not.toHaveBeenCalled();
  });
  it('rolls back the whole batch when a conditional update fails', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    executeRaw
      .mockImplementationOnce((_sql, value, id) => {
        records.find((r) => r.id === id).huellaContenido = value;
        return Promise.resolve(1);
      })
      .mockResolvedValueOnce(0);
    await expect(apply()).rejects.toBeInstanceOf(ConflictException);
    expect(records.every((r) => r.huellaContenido === null)).toBe(true);
  });
  it('reports known indexed and within-batch matches, without resolving or deleting them', async () => {
    records[2] = row('c');
    records[2].huellaContenido = hash(records[2]);
    expect((await service.preview(q)).items[0]).toMatchObject({
      coincidenciasIndexadas: 1,
      coincidenciasEnLote: 1,
    });
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    await apply();
    const report = await service.duplicates({
      area: 'MATEMATICAS',
      limite: 10,
    });
    expect(report).toMatchObject({
      pendientesEnArea: 0,
      hayMas: false,
      siguiente: null,
      items: [{ huella: hash(records[0]), cantidad: 3 }],
    });
    const matches = await service.matches(hash(records[0]), {
      ...q,
      limite: 1,
    });
    expect(matches).toMatchObject({
      hayMas: true,
      siguiente: 'a',
      items: [{ id: 'a', estadoContenido: 'ARCHIVADO' }],
    });
    expect(
      (
        await service.matches(hash(records[0]), {
          ...q,
          despues: matches.siguiente,
        })
      ).items.map((r) => r.id),
    ).toEqual(['b', 'c']);
    expect(
      (await service.matches(hash(records[0]), { ...q, area: 'INGLES' })).items,
    ).toEqual([]);
  });
  it('paginates duplicate groups by hash and warns about still-unindexed questions', async () => {
    records = [
      row('a'),
      row('b'),
      row('c', 'Otro'),
      row('d', 'Otro'),
      row('e', 'Pendiente'),
    ];
    for (const r of records.slice(0, 4)) r.huellaContenido = hash(r);
    const first = await service.duplicates({ ...q, limite: 1 });
    expect(first).toMatchObject({ hayMas: true, pendientesEnArea: 1 });
    const second = await service.duplicates({
      ...q,
      limite: 1,
      despues: first.siguiente,
    });
    expect(second).toMatchObject({ hayMas: false, siguiente: null });
    expect(second.items[0].huella).not.toBe(first.items[0].huella);
  });
  it('bounds an empty preview without generating an invalid IN () query', async () => {
    records = [];
    const preview = await service.preview(q);
    expect(preview).toMatchObject({
      items: [],
      pendientesEnArea: 0,
      hayMas: false,
    });
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    await apply();
    expect(queryRaw).toHaveBeenCalledTimes(1); // only the area lock
    expect(executeRaw).not.toHaveBeenCalled();
    expect(pregunta.groupBy).not.toHaveBeenCalled();
  });
  it('processes more than 2000 records without offsets, skips or oversized batches', async () => {
    process.env.EDITORIAL_LEGACY_INDEX_ENABLED = 'true';
    records = Array.from({ length: 2001 }, (_, i) =>
      row(String(i).padStart(4, '0'), `Pregunta ${i}`),
    );
    const batch = { ...q, limite: 100 };
    let processed = 0;
    for (let i = 0; i < 21; i++) {
      const preview = await service.preview(batch);
      expect(preview.items.length).toBeLessThanOrEqual(100);
      processed += (
        await service.apply({
          ...batch,
          revision: preview.revision,
          confirmado: true,
        })
      ).indexadas;
    }
    expect(processed).toBe(2001);
    expect(records.every((r) => r.huellaContenido === hash(r))).toBe(true);
    expect((await service.preview(batch)).pendientesEnArea).toBe(0);
    // A newly inserted lower ID cannot disappear behind an old offset/cursor.
    records.push(row('0000-new', 'Nueva pregunta antigua'));
    expect((await service.preview(batch)).items.map((r) => r.id)).toEqual([
      '0000-new',
    ]);
  });
});

describe('legacy index ADMIN and input contracts', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  it('protects all index routes with ADMIN', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LegacyQuestionIndexController),
    ).toEqual([AdminGuard]);
  });
  it('defaults to 25 and transforms bounded query limits', async () => {
    await expect(
      pipe.transform(
        { area: 'INGLES' },
        { type: 'query', metatype: LegacyIndexBatchDto },
      ),
    ).resolves.toMatchObject({ limite: 25 });
    await expect(
      pipe.transform(
        { area: 'INGLES', limite: '100' },
        { type: 'query', metatype: LegacyIndexBatchDto },
      ),
    ).resolves.toMatchObject({ limite: 100 });
  });
  it.each([
    {},
    { area: 'INVENTADA' },
    { area: 'INGLES', limite: 101 },
    { area: 'INGLES', limite: 0 },
    { area: 'INGLES', limite: 1.5 },
    { area: 'INGLES', ids: ['arbitrary'] },
  ])('rejects malformed or unbounded batches: %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'query', metatype: LegacyIndexBatchDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([
    { area: 'INGLES', revision: 'a'.repeat(64) },
    { area: 'INGLES', revision: 'a'.repeat(64), confirmado: 'true' },
    { area: 'INGLES', revision: 'a'.repeat(64), confirmado: 'false' },
    { area: 'INGLES', revision: 'a'.repeat(64), confirmado: 1 },
    { area: 'INGLES', revision: 'a'.repeat(64), confirmado: false },
    { area: 'INGLES', revision: 'bad', confirmado: true },
    {
      area: 'INGLES',
      revision: 'a'.repeat(64),
      confirmado: true,
      huella: 'b'.repeat(64),
    },
  ])('rejects unconfirmed or forged command fields: %j', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: ApplyLegacyIndexDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('validates report limits and cursors', async () => {
    await expect(
      pipe.transform(
        { area: 'INGLES', limite: 21 },
        { type: 'query', metatype: LegacyDuplicatesDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { area: 'INGLES', despues: 'not-a-hash' },
        { type: 'query', metatype: LegacyDuplicatesDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { huella: 'SQL injection' },
        { type: 'param', metatype: LegacyFingerprintParams },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform(
        { area: 'INGLES', despues: '' },
        { type: 'query', metatype: LegacyMatchesDto },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
