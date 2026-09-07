import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import { validateAcademicClassification } from './academic-classification';
import { lessonUrl } from './lesson-editor.service';
import { EditorialCaseDto, EditorialQuestionDto } from './question-editor.dto';

const questionInclude = {
  respuestas: { orderBy: { id: 'asc' } },
  caso: true,
  subtema: { include: { tema: true } },
  _count: true,
} satisfies Prisma.PreguntaInclude;
type Question = Prisma.PreguntaGetPayload<{ include: typeof questionInclude }>;
const caseInclude = { _count: { select: { preguntas: true } } } as const;
type Case = Prisma.CasoPreguntaGetPayload<{ include: typeof caseInclude }>;
const revisionOf = (row: unknown) =>
  createHash('sha256').update(JSON.stringify(row)).digest('hex');
function textField(value: string, max: number, required = true) {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    value.includes('\u0000') ||
    (required && !value.trim())
  )
    throw new BadRequestException(
      'Revisa los textos obligatorios y sus límites.',
    );
  return value.trim();
}
function stale() {
  return new ConflictException({
    code: 'EDITOR_STALE',
    message: 'El registro cambió. Recarga antes de guardar.',
  });
}

@Injectable()
export class QuestionEditorService {
  constructor(private readonly prisma: PrismaService) {}

  private questionView(row: Question) {
    let classified = true;
    try {
      validateAcademicClassification(row.subtema);
    } catch {
      classified = false;
    }
    const editable =
      row.estadoContenido === 'BORRADOR' &&
      !row.fechaPublicacion &&
      classified &&
      Object.entries(row._count).every(
        ([relation, count]) => relation === 'respuestas' || count === 0,
      );
    return {
      id: row.id,
      subtemaId: row.subtemaId,
      area: row.subtema.tema.area,
      enunciado: row.enunciado,
      explicacion: row.explicacion ?? '',
      imagenUrl: row.imagenUrl ?? '',
      dificultad: row.dificultad,
      casoId: row.casoId ?? '',
      ordenEnCaso: row.ordenEnCaso,
      caso: row.caso,
      respuestas: row.respuestas.map((option) => ({
        texto: option.texto,
        esCorrecta: option.esCorrecta,
        explicacion: option.explicacion ?? '',
      })),
      estadoContenido: row.estadoContenido,
      editable,
      revision: revisionOf(row),
    };
  }
  private caseView(row: Case) {
    return {
      id: row.id,
      area: row.area,
      titulo: row.titulo ?? '',
      contexto: row.contexto,
      imagenUrl: row.imagenUrl ?? '',
      estadoContenido: row.estadoContenido,
      preguntas: row._count.preguntas,
      editable:
        row.estadoContenido === 'BORRADOR' &&
        !row.fechaPublicacion &&
        row._count.preguntas === 0,
      revision: revisionOf(row),
    };
  }
  private async question(db: Prisma.TransactionClient, id: string) {
    const row = await db.pregunta.findUnique({
      where: { id },
      include: questionInclude,
    });
    if (!row) throw new NotFoundException('La pregunta no existe.');
    return row;
  }
  private async case(db: Prisma.TransactionClient, id: string) {
    const row = await db.casoPregunta.findUnique({
      where: { id },
      include: caseInclude,
    });
    if (!row) throw new NotFoundException('El caso no existe.');
    return row;
  }
  async detallePregunta(id: string) {
    return this.questionView(await this.question(this.prisma, id));
  }
  async detalleCaso(id: string) {
    return this.caseView(await this.case(this.prisma, id));
  }

  async preguntas(subtemaId: string, pagina: number, limite: number) {
    const subtema = await this.prisma.subtema.findUnique({
      where: { id: subtemaId },
      include: { tema: true },
    });
    if (!subtema) throw new NotFoundException('El subtema no existe.');
    let permiteCrear = true;
    try {
      validateAcademicClassification(subtema);
    } catch {
      permiteCrear = false;
    }
    const rows = await this.prisma.pregunta.findMany({
      where: { subtemaId },
      skip: (pagina - 1) * limite,
      take: limite + 1,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        enunciado: true,
        estadoContenido: true,
        subtemaId: true,
      },
    });
    return {
      pagina,
      limite,
      hayMas: rows.length > limite,
      items: rows.slice(0, limite),
      subtema: {
        id: subtema.id,
        nombre: subtema.nombre,
        area: subtema.tema.area,
        permiteCrear,
      },
    };
  }
  async casos(area: AreaIcfes, pagina: number, limite: number) {
    const rows = await this.prisma.casoPregunta.findMany({
      where: { area },
      skip: (pagina - 1) * limite,
      take: limite + 1,
      orderBy: { id: 'asc' },
      select: { id: true, titulo: true, estadoContenido: true, area: true },
    });
    return {
      pagina,
      limite,
      hayMas: rows.length > limite,
      items: rows.slice(0, limite),
    };
  }
  async guardarCaso(body: EditorialCaseDto, id?: string) {
    const data = {
      titulo: textField(body.titulo, 200),
      contexto: textField(body.contexto, 20000),
      imagenUrl: lessonUrl(body.imagenUrl),
    };
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`editor:area:${body.area}`}))`;
      if (id) {
        await tx.$queryRaw`SELECT id FROM "CasoPregunta" WHERE id = ${id} FOR UPDATE`;
        const row = await this.case(tx, id);
        if (!body.revision || revisionOf(row) !== body.revision) throw stale();
        if (row.area !== body.area || !this.caseView(row).editable)
          throw new BadRequestException('Caso de solo lectura o de otra área.');
      }
      const row = id
        ? await tx.casoPregunta.update({
            where: { id },
            data,
            include: caseInclude,
          })
        : await tx.casoPregunta.create({
            data: { ...data, area: body.area, estadoContenido: 'BORRADOR' },
            include: caseInclude,
          });
      return this.caseView(row);
    });
  }

  async guardarPregunta(body: EditorialQuestionDto, id?: string) {
    const enunciado = textField(body.enunciado, 12000),
      explicacion = textField(body.explicacion, 12000);
    const imagenUrl = lessonUrl(body.imagenUrl);
    if (
      !Array.isArray(body.respuestas) ||
      body.respuestas.length < 2 ||
      body.respuestas.length > 6 ||
      body.respuestas.some(
        (option) => typeof option.esCorrecta !== 'boolean',
      ) ||
      body.respuestas.filter((option) => option.esCorrecta).length !== 1
    )
      throw new BadRequestException(
        'Usa de 2 a 6 opciones y exactamente una correcta.',
      );
    const respuestas = body.respuestas.map((option) => ({
      texto: textField(option.texto, 4000),
      esCorrecta: option.esCorrecta,
      explicacion: textField(option.explicacion, 4000, false) || null,
    }));
    const optionKeys = respuestas.map((option) =>
      option.texto
        .normalize('NFKC')
        .toLocaleLowerCase('es-CO')
        .replace(/\s+/g, ' '),
    );
    if (new Set(optionKeys).size !== optionKeys.length)
      throw new BadRequestException('Las opciones no pueden repetirse.');
    const casoId = body.casoId || null;
    if (
      (casoId &&
        (!Number.isInteger(body.ordenEnCaso) ||
          body.ordenEnCaso < 1 ||
          body.ordenEnCaso > 10000)) ||
      (!casoId && body.ordenEnCaso != null)
    )
      throw new BadRequestException(
        'Indica un orden positivo solo si seleccionaste un caso.',
      );
    return this.prisma.$transaction(async (tx) => {
      const initial = await tx.subtema.findUnique({
        where: { id: body.subtemaId },
        include: { tema: true },
      });
      if (!initial) throw new NotFoundException('El subtema no existe.');
      const area = initial.tema.area;
      await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`editor:area:${area}`}))`;
      await tx.$queryRaw`SELECT id FROM "Tema" WHERE id = ${initial.temaId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Subtema" WHERE id = ${body.subtemaId} FOR UPDATE`;
      const parent = await tx.subtema.findUnique({
        where: { id: body.subtemaId },
        include: { tema: true },
      });
      if (!parent) throw new NotFoundException('El subtema no existe.');
      validateAcademicClassification(parent);
      if (id) {
        await tx.$queryRaw`SELECT id FROM "Pregunta" WHERE id = ${id} FOR UPDATE`;
        const row = await this.question(tx, id);
        if (!body.revision || revisionOf(row) !== body.revision) throw stale();
        if (
          row.subtemaId !== body.subtemaId ||
          !this.questionView(row).editable
        )
          throw new BadRequestException(
            'Pregunta de solo lectura o de otro subtema.',
          );
      }
      if (casoId) {
        await tx.$queryRaw`SELECT id FROM "CasoPregunta" WHERE id = ${casoId} FOR UPDATE`;
        const caso = await this.case(tx, casoId);
        if (caso.area !== area || caso.estadoContenido === 'ARCHIVADO')
          throw new BadRequestException(
            'Selecciona un caso no archivado de la misma área.',
          );
        const occupied = await tx.pregunta.findFirst({
          where: {
            casoId,
            ordenEnCaso: body.ordenEnCaso,
            ...(id ? { id: { not: id } } : {}),
          },
          select: { id: true },
        });
        if (occupied)
          throw new ConflictException({
            code: 'CASE_ORDER_TAKEN',
            message: 'Ese orden ya está ocupado en el caso.',
          });
      }
      const huellaContenido = createQuestionFingerprint({
        area,
        enunciado,
        imagen: imagenUrl,
        opciones: respuestas,
      });
      // Include archived and legacy questions. Legacy is bounded and fail-closed;
      // large unindexed banks must be backfilled before this editor can accept new entries.
      const matches = await tx.pregunta.findMany({
        where: {
          ...(id ? { id: { not: id } } : {}),
          OR: [
            { huellaContenido },
            { huellaContenido: null, subtema: { tema: { area } } },
          ],
        },
        take: 2001,
        select: {
          id: true,
          subtemaId: true,
          estadoContenido: true,
          huellaContenido: true,
          enunciado: true,
          imagenUrl: true,
          respuestas: { select: { texto: true } },
        },
      });
      if (matches.length > 2000)
        throw new ConflictException({
          code: 'LEGACY_INDEX_REQUIRED',
          message: 'El banco heredado requiere indexación antes de continuar.',
        });
      const duplicate = matches.find(
        (row) =>
          (row.huellaContenido ??
            createQuestionFingerprint({
              area,
              enunciado: row.enunciado,
              imagen: row.imagenUrl,
              opciones: row.respuestas,
            })) === huellaContenido,
      );
      if (duplicate)
        throw new ConflictException({
          code: 'DUPLICATE_QUESTION',
          message: 'La pregunta ya existe.',
          duplicate: {
            id: duplicate.id,
            subtemaId: duplicate.subtemaId,
            estadoContenido: duplicate.estadoContenido,
          },
        });
      const data = {
        enunciado,
        explicacion,
        imagenUrl,
        dificultad: body.dificultad,
        casoId,
        ordenEnCaso: casoId ? body.ordenEnCaso : null,
        huellaContenido,
      };
      const row = id
        ? await tx.pregunta.update({
            where: { id },
            data: {
              ...data,
              respuestas: { deleteMany: {}, create: respuestas },
            },
            include: questionInclude,
          })
        : await tx.pregunta.create({
            data: {
              ...data,
              subtemaId: body.subtemaId,
              estadoContenido: 'BORRADOR',
              respuestas: { create: respuestas },
            },
            include: questionInclude,
          });
      return this.questionView(row);
    });
  }
}
