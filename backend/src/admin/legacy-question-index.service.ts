import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { isGenericCatalogName } from './academic-classification';
import { lockEditorialArea } from './editorial-lock';
import {
  ApplyLegacyIndexDto,
  LegacyDuplicatesDto,
  LegacyIndexBatchDto,
  LegacyMatchesDto,
} from './legacy-question-index.dto';

const classification = {
  id: true,
  nombre: true,
  temaId: true,
  tema: { select: { id: true, nombre: true, area: true } },
} satisfies Prisma.SubtemaSelect;
const indexSelect = {
  id: true,
  enunciado: true,
  imagenUrl: true,
  huellaContenido: true,
  subtemaId: true,
  estadoContenido: true,
  subtema: { select: classification },
  respuestas: { select: { id: true, texto: true }, orderBy: { id: 'asc' } },
} satisfies Prisma.PreguntaSelect;
type IndexRow = Prisma.PreguntaGetPayload<{ select: typeof indexSelect }>;
const matchSelect = {
  id: true,
  subtemaId: true,
  estadoContenido: true,
  subtema: { select: classification },
} satisfies Prisma.PreguntaSelect;

function scope(area: AreaIcfes, limite: number, maximum = 100) {
  if (
    !Object.values(AreaIcfes).includes(area) ||
    !Number.isInteger(limite) ||
    limite < 1 ||
    limite > maximum
  )
    throw new BadRequestException('Área o tamaño de lote inválido.');
}
function fingerprint(value: string) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    throw new BadRequestException('La huella/revisión no es válida.');
}
function metadata(
  row: Prisma.PreguntaGetPayload<{ select: typeof matchSelect }>,
) {
  return {
    id: row.id,
    subtemaId: row.subtemaId,
    temaId: row.subtema.temaId,
    estadoContenido: row.estadoContenido,
    requiereClasificacion:
      isGenericCatalogName(row.subtema.nombre) ||
      isGenericCatalogName(row.subtema.tema.nombre),
  };
}

@Injectable()
export class LegacyQuestionIndexService {
  constructor(private readonly prisma: PrismaService) {}

  private pending(area: AreaIcfes): Prisma.PreguntaWhereInput {
    return { huellaContenido: null, subtema: { tema: { area } } };
  }
  private rows(db: Prisma.TransactionClient, q: LegacyIndexBatchDto) {
    // No offset or client-supplied ID list. The next unindexed records are the checkpoint.
    return db.pregunta.findMany({
      where: this.pending(q.area),
      orderBy: { id: 'asc' },
      take: q.limite + 1,
      select: indexSelect,
    });
  }
  private hash(row: IndexRow) {
    return createQuestionFingerprint({
      area: row.subtema.tema.area,
      enunciado: row.enunciado,
      imagen: row.imagenUrl,
      opciones: row.respuestas,
    });
  }
  private revision(q: LegacyIndexBatchDto, rows: IndexRow[]) {
    return createHash('sha256')
      .update(
        JSON.stringify({
          version: 'legacy-index-v1',
          area: q.area,
          limite: q.limite,
          rows,
        }),
      )
      .digest('hex');
  }
  private async describe(
    db: Prisma.TransactionClient,
    q: LegacyIndexBatchDto,
    found: IndexRow[],
  ) {
    const rows = found.slice(0, q.limite);
    const hashes = rows.map((row) => this.hash(row));
    const indexed = hashes.length
      ? await db.pregunta.groupBy({
          by: ['huellaContenido'],
          where: {
            subtema: { tema: { area: q.area } },
            huellaContenido: { in: [...new Set(hashes)] },
          },
          _count: { _all: true },
        })
      : [];
    const counts = new Map(
      indexed.map((group) => [group.huellaContenido, group._count._all]),
    );
    return {
      habilitado: process.env.EDITORIAL_LEGACY_INDEX_ENABLED === 'true',
      area: q.area,
      limite: q.limite,
      revision: this.revision(q, rows),
      pendientesEnArea: await db.pregunta.count({
        where: this.pending(q.area),
      }),
      hayMas: found.length > q.limite,
      items: rows.map((row, i) => ({
        ...metadata(row),
        huella: hashes[i],
        coincidenciasIndexadas: counts.get(hashes[i]) ?? 0,
        coincidenciasEnLote:
          hashes.filter((hash) => hash === hashes[i]).length - 1,
      })),
      advertencia:
        'Solo se calcula la huella. Las coincidencias no incluyen preguntas sin indexar fuera de este lote. No se borra, publica ni reclasifica contenido.',
    };
  }
  async preview(q: LegacyIndexBatchDto) {
    scope(q.area, q.limite);
    return this.describe(this.prisma, q, await this.rows(this.prisma, q));
  }
  async apply(q: ApplyLegacyIndexDto) {
    scope(q.area, q.limite);
    fingerprint(q.revision);
    if (q.confirmado !== true)
      throw new BadRequestException('Confirma el lote revisado.');
    if (process.env.EDITORIAL_LEGACY_INDEX_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'La indexación del legado está deshabilitada en este entorno.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        await lockEditorialArea(tx, q.area);
        const initial = (await this.rows(tx, q)).slice(0, q.limite);
        if (initial.length) {
          await tx.$queryRaw`SELECT id FROM "Pregunta" WHERE id IN (${Prisma.join(initial.map((row) => row.id))}) ORDER BY id FOR UPDATE`;
        }
        const rows = (await this.rows(tx, q)).slice(0, q.limite);
        if (this.revision(q, rows) !== q.revision)
          throw new ConflictException({
            code: 'LEGACY_INDEX_STALE',
            message:
              'El lote cambió o ya se procesó. Consulta una nueva vista previa; no se indexó el lote siguiente.',
          });
        for (const row of rows) {
          // Parameterized SQL intentionally leaves fechaActualizacion untouched,
          // including PostgreSQL microseconds that a JS Date cannot round-trip.
          const changed =
            await tx.$executeRaw`UPDATE "Pregunta" SET "huellaContenido" = ${this.hash(row)} WHERE id = ${row.id} AND "huellaContenido" IS NULL`;
          if (changed !== 1)
            throw new ConflictException(
              'El lote cambió durante la indexación. Se revierte este lote.',
            );
        }
        return {
          area: q.area,
          indexadas: rows.length,
          ids: rows.map((row) => row.id),
          pendientesEnArea: await tx.pregunta.count({
            where: this.pending(q.area),
          }),
          advertencia:
            'Indexar no confirma calidad ni clasificación. Consulta duplicados y revisa el legado antes de publicar.',
        };
      },
      { maxWait: 5000, timeout: 30000 },
    );
  }
  async duplicates(q: LegacyDuplicatesDto) {
    scope(q.area, q.limite, 20);
    if (q.despues !== undefined) fingerprint(q.despues);
    const groups = await this.prisma.pregunta.groupBy({
      by: ['huellaContenido'],
      where: {
        subtema: { tema: { area: q.area } },
        huellaContenido: { not: null, ...(q.despues ? { gt: q.despues } : {}) },
      },
      having: { huellaContenido: { _count: { gt: 1 } } },
      orderBy: { huellaContenido: 'asc' },
      take: q.limite + 1,
      _count: { _all: true },
    });
    const items = groups.slice(0, q.limite).map((group) => ({
      huella: group.huellaContenido,
      cantidad: group._count._all,
    }));
    return {
      area: q.area,
      items,
      hayMas: groups.length > q.limite,
      siguiente:
        groups.length > q.limite ? items[items.length - 1].huella : null,
      pendientesEnArea: await this.prisma.pregunta.count({
        where: this.pending(q.area),
      }),
      advertencia:
        'Incluye archivadas. Los grupos solo cubren huellas ya indexadas; reinicia el informe al completar nuevos lotes.',
    };
  }
  async matches(huella: string, q: LegacyMatchesDto) {
    scope(q.area, q.limite);
    fingerprint(huella);
    if (
      q.despues !== undefined &&
      (typeof q.despues !== 'string' || !q.despues || q.despues.length > 120)
    )
      throw new BadRequestException('El cursor no es válido.');
    const rows = await this.prisma.pregunta.findMany({
      where: {
        huellaContenido: huella,
        subtema: { tema: { area: q.area } },
        ...(q.despues ? { id: { gt: q.despues } } : {}),
      },
      orderBy: { id: 'asc' },
      take: q.limite + 1,
      select: matchSelect,
    });
    const items = rows.slice(0, q.limite).map(metadata);
    return {
      area: q.area,
      huella,
      items,
      hayMas: rows.length > q.limite,
      siguiente: rows.length > q.limite ? items[items.length - 1].id : null,
    };
  }
}
