import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { lockEditorialArea } from './editorial-lock';
import { ClozeActivity, validateClozeActivity } from './cloze-activity';
import {
  catalogNameKey,
  isGenericCatalogName,
  validateCatalogName,
} from './academic-classification';

export type EditorKind = 'temas' | 'subtemas';
const themeInclude = { _count: { select: { subtemas: true } } } as const;
const lessonInclude = {
  tema: true,
  _count: {
    select: { preguntas: true, progresotemas: true, actividadesPlan: true },
  },
} as const;
type Theme = Prisma.TemaGetPayload<{ include: typeof themeInclude }>;
type Lesson = Prisma.SubtemaGetPayload<{ include: typeof lessonInclude }>;
type Row = Theme | Lesson;

export function lessonUrl(value: string): string | null {
  if (typeof value !== 'string' || value.length > 2000)
    throw new BadRequestException(
      'La referencia debe ser texto de hasta 2000 caracteres.',
    );
  const result = value.trim();
  if (!result) return null;
  try {
    const url = new URL(result);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      /[\s\p{Cc}\p{Cf}]/u.test(result)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new BadRequestException(
      'Usa una URL HTTPS completa y sin credenciales.',
    );
  }
}

@Injectable()
export class LessonEditorService {
  constructor(private readonly prisma: PrismaService) {}

  private async row(
    db: Prisma.TransactionClient,
    kind: EditorKind,
    id: string,
  ): Promise<Row> {
    const row =
      kind === 'temas'
        ? await db.tema.findUnique({ where: { id }, include: themeInclude })
        : await db.subtema.findUnique({
            where: { id },
            include: lessonInclude,
          });
    if (!row) throw new NotFoundException('El registro ya no existe.');
    return row;
  }

  private view(row: Row) {
    const isLesson = 'temaId' in row;
    const draft = row.estadoContenido === 'BORRADOR' && !row.fechaPublicacion;
    const classified =
      !isGenericCatalogName(row.nombre) &&
      (!isLesson || !isGenericCatalogName(row.tema.nombre));
    const editable =
      isLesson &&
      draft &&
      classified &&
      row.tema.estadoContenido !== 'ARCHIVADO' &&
      row._count.progresotemas === 0 &&
      row._count.actividadesPlan === 0 &&
      !row.tipoInteractivo &&
      row.datosInteractivo == null;
    const renombrable = isLesson
      ? editable && row._count.preguntas === 0
      : draft && row._count.subtemas === 0;
    return {
      id: row.id,
      nombre: row.nombre,
      estadoContenido: row.estadoContenido,
      area: isLesson ? row.tema.area : row.area,
      temaId: isLesson ? row.temaId : null,
      contenido: isLesson ? (row.contenido ?? '') : '',
      videoUrl: isLesson ? (row.videoUrl ?? '') : '',
      imagenUrl: isLesson ? (row.imagenUrl ?? '') : '',
      // Hash the current snapshot, not a rounded timestamp comparison in PostgreSQL.
      revision: createHash('sha256').update(JSON.stringify(row)).digest('hex'),
      editable,
      renombrable,
      motivo:
        editable || renombrable
          ? ''
          : 'Solo lectura: publicado, en revisión, archivado, interactivo o con uso académico. Los temas solo se renombran si están vacíos y nunca publicados.',
    };
  }

  async detalle(kind: EditorKind, id: string) {
    return this.view(await this.row(this.prisma, kind, id));
  }

  private clozeView(row: Row) {
    if (!('temaId' in row))
      throw new BadRequestException('CLOZE requiere un subtema.');
    // Keep the same revision as the prose editor, including the stored JSON.
    const base = this.view(row);
    const editable =
      this.view({ ...row, tipoInteractivo: null, datosInteractivo: null })
        .editable &&
      (row.tipoInteractivo === null || row.tipoInteractivo === 'CLOZE');
    let datosInteractivo: ClozeActivity | null = null;
    const errores: string[] = [];
    if (row.tipoInteractivo === 'CLOZE') {
      try {
        datosInteractivo = validateClozeActivity(row.datosInteractivo);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        errores.push(error.message);
      }
    } else if (row.tipoInteractivo || row.datosInteractivo != null) {
      errores.push('Tipo de interactivo no compatible o datos sin tipo.');
    }
    return {
      ...base,
      editable,
      motivo: editable
        ? ''
        : 'Solo se edita CLOZE en borradores clasificados, nunca publicados y sin uso académico.',
      tipoInteractivo: row.tipoInteractivo,
      datosInteractivo,
      errores,
    };
  }

  async detalleCloze(id: string) {
    return this.clozeView(await this.row(this.prisma, 'subtemas', id));
  }

  async guardarCloze(id: string, revision: string, value: unknown) {
    const datosInteractivo = validateClozeActivity(value);
    return this.clozeView(
      await this.modify('subtemas', id, revision, async (tx, row) => {
        if (!this.clozeView(row).editable)
          throw new BadRequestException('Este interactivo es de solo lectura.');
        await tx.subtema.update({
          where: { id },
          data: { tipoInteractivo: 'CLOZE', datosInteractivo },
        });
      }),
    );
  }

  async quitarCloze(id: string, revision: string, confirmado: unknown) {
    if (confirmado !== true)
      throw new BadRequestException(
        'Confirma explícitamente el retiro del ejercicio.',
      );
    return this.clozeView(
      await this.modify('subtemas', id, revision, async (tx, row) => {
        if (!this.clozeView(row).editable)
          throw new BadRequestException('Este interactivo es de solo lectura.');
        await tx.subtema.update({
          where: { id },
          data: { tipoInteractivo: null, datosInteractivo: Prisma.DbNull },
        });
      }),
    );
  }

  private async modify(
    kind: EditorKind,
    id: string,
    revision: string,
    change: (tx: Prisma.TransactionClient, row: Row) => Promise<void>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const initial = await this.row(tx, kind, id);
      await lockEditorialArea(
        tx,
        'temaId' in initial ? initial.tema.area : initial.area,
      );
      const scope =
        'temaId' in initial
          ? `catalogo:tema:${initial.temaId}`
          : `catalogo:area:${initial.area}`;
      // Same ordering/scopes as catalog creation; parent first, then subtopic.
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${scope}))`;
      const temaId = 'temaId' in initial ? initial.temaId : initial.id;
      await tx.$queryRaw`SELECT id FROM "Tema" WHERE id = ${temaId} FOR UPDATE`;
      if (kind === 'subtemas')
        await tx.$queryRaw`SELECT id FROM "Subtema" WHERE id = ${id} FOR UPDATE`;
      const current = await this.row(tx, kind, id);
      if (revision !== this.view(current).revision)
        throw new ConflictException(
          'El registro cambió. Recarga antes de guardar; tu texto no se sobrescribió.',
        );
      await change(tx, current);
      return this.row(tx, kind, id);
    });
  }

  async guardar(
    id: string,
    revision: string,
    contenido: string,
    videoUrl: string,
    imagenUrl: string,
  ) {
    if (
      typeof contenido !== 'string' ||
      contenido.length > 30000 ||
      contenido.includes('\u0000')
    )
      throw new BadRequestException(
        'La lección admite hasta 30000 caracteres, sin caracteres nulos.',
      );
    const data = {
      contenido,
      videoUrl: lessonUrl(videoUrl),
      imagenUrl: lessonUrl(imagenUrl),
    };
    return this.view(
      await this.modify('subtemas', id, revision, async (tx, row) => {
        if (!this.view(row).editable)
          throw new BadRequestException('Esta lección es de solo lectura.');
        await tx.subtema.update({ where: { id }, data });
      }),
    );
  }

  async renombrar(
    kind: EditorKind,
    id: string,
    revision: string,
    value: string,
  ) {
    const nombre = validateCatalogName(value);
    return this.view(
      await this.modify(kind, id, revision, async (tx, row) => {
        if (!this.view(row).renombrable)
          throw new BadRequestException(
            'Este nombre ya tiene uso académico o no es un borrador vacío.',
          );
        const siblings =
          'temaId' in row
            ? await tx.subtema.findMany({
                where: { temaId: row.temaId, id: { not: id } },
                select: { nombre: true },
              })
            : await tx.tema.findMany({
                where: { area: row.area, id: { not: id } },
                select: { nombre: true },
              });
        if (
          siblings.some(
            (sibling) =>
              catalogNameKey(sibling.nombre) === catalogNameKey(nombre),
          )
        )
          throw new ConflictException(
            'Ese nombre ya existe en esta clasificación.',
          );
        if (kind === 'temas')
          await tx.tema.update({ where: { id }, data: { nombre } });
        else await tx.subtema.update({ where: { id }, data: { nombre } });
      }),
    );
  }
}
