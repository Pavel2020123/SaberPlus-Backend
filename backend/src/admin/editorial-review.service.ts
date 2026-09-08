import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AreaIcfes, EstadoContenido, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { lockEditorialArea } from './editorial-lock';
import { createQuestionFingerprint } from '../common/question-fingerprint';
import {
  validateAcademicClassification,
  validateCatalogName,
} from './academic-classification';
import { lessonUrl } from './lesson-editor.service';
import { validateClozeActivity } from './cloze-activity';

export const REVIEW_KINDS = [
  'temas',
  'subtemas',
  'preguntas',
  'casos',
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];
export const REVIEW_TRANSITIONS: Record<EstadoContenido, EstadoContenido[]> = {
  BORRADOR: ['EN_REVISION', 'ARCHIVADO'],
  EN_REVISION: ['BORRADOR', 'PUBLICADO', 'ARCHIVADO'],
  PUBLICADO: ['ARCHIVADO'],
  ARCHIVADO: ['BORRADOR'],
};
const questionInclude = {
  respuestas: { orderBy: { id: 'asc' } },
  subtema: { include: { tema: true } },
  caso: true,
} satisfies Prisma.PreguntaInclude;
const themeInclude = {
  _count: { select: { subtemas: { where: { estadoContenido: 'PUBLICADO' } } } },
} satisfies Prisma.TemaInclude;
const subInclude = {
  tema: true,
  _count: {
    select: { preguntas: { where: { estadoContenido: 'PUBLICADO' } } },
  },
} satisfies Prisma.SubtemaInclude;
const caseInclude = {
  _count: {
    select: { preguntas: { where: { estadoContenido: 'PUBLICADO' } } },
  },
} satisfies Prisma.CasoPreguntaInclude;
type RecordData =
  | {
      tipo: 'temas';
      row: Prisma.TemaGetPayload<{ include: typeof themeInclude }>;
    }
  | {
      tipo: 'subtemas';
      row: Prisma.SubtemaGetPayload<{ include: typeof subInclude }>;
    }
  | {
      tipo: 'preguntas';
      row: Prisma.PreguntaGetPayload<{ include: typeof questionInclude }>;
    }
  | {
      tipo: 'casos';
      row: Prisma.CasoPreguntaGetPayload<{ include: typeof caseInclude }>;
    };
const revisionOf = (data: RecordData) =>
  createHash('sha256').update(JSON.stringify(data)).digest('hex');

@Injectable()
export class EditorialReviewService {
  constructor(private readonly prisma: PrismaService) {}

  private async read(
    db: Prisma.TransactionClient,
    tipo: ReviewKind,
    id: string,
  ): Promise<RecordData> {
    if (tipo === 'temas') {
      const row = await db.tema.findUnique({
        where: { id },
        include: themeInclude,
      });
      if (row) return { tipo, row };
    }
    if (tipo === 'subtemas') {
      const row = await db.subtema.findUnique({
        where: { id },
        include: subInclude,
      });
      if (row) return { tipo, row };
    }
    if (tipo === 'preguntas') {
      const row = await db.pregunta.findUnique({
        where: { id },
        include: questionInclude,
      });
      if (row) return { tipo, row };
    }
    if (tipo === 'casos') {
      const row = await db.casoPregunta.findUnique({
        where: { id },
        include: caseInclude,
      });
      if (row) return { tipo, row };
    }
    throw new NotFoundException('El registro editorial no existe.');
  }
  private area(data: RecordData): AreaIcfes {
    if (data.tipo === 'subtemas') return data.row.tema.area;
    if (data.tipo === 'preguntas') return data.row.subtema.tema.area;
    return data.row.area;
  }
  private async review(db: Prisma.TransactionClient, data: RecordData) {
    const bloqueos: string[] = [],
      advertencias: string[] = [],
      contenido: string[] = [];
    let dependientesPublicados = 0;
    const check = (valid: boolean, message: string) => {
      if (!valid) bloqueos.push(message);
    };
    const name = (value: string) => {
      try {
        validateCatalogName(value);
      } catch {
        bloqueos.push(
          'Clasificación pendiente: utiliza nombres académicos específicos, no Banco General.',
        );
      }
    };
    const resource = (url: string | null) => {
      if (url) {
        try {
          lessonUrl(url);
        } catch {
          bloqueos.push(
            'Referencia de recurso inválida: utiliza HTTPS sin credenciales.',
          );
        }
        contenido.push(`Recurso: ${url}`);
        advertencias.push(
          'La referencia no se descargó: comprueba disponibilidad, derechos y descripción accesible del recurso.',
        );
      }
    };
    if (data.row.fechaPublicacion && data.row.estadoContenido !== 'PUBLICADO')
      advertencias.push(
        'Este registro ya estuvo publicado. Volver a borrador no lo convierte en contenido nuevo ni habilita editar su historial.',
      );
    if (data.tipo === 'temas') {
      name(data.row.nombre);
      contenido.push(data.row.nombre);
      dependientesPublicados = data.row._count.subtemas;
    }
    if (data.tipo === 'subtemas') {
      const row = data.row;
      name(row.nombre);
      name(row.tema.nombre);
      check(
        row.tema.estadoContenido === 'PUBLICADO',
        'Publica primero el tema padre.',
      );
      contenido.push(row.nombre, row.contenido ?? '');
      resource(row.imagenUrl);
      resource(row.videoUrl);
      dependientesPublicados = row._count.preguntas;
      if (
        !row.contenido?.trim() &&
        !row.videoUrl &&
        !row.imagenUrl &&
        !row.tipoInteractivo
      )
        advertencias.push(
          'Subtema sin lección: se publicará solo su estructura académica.',
        );
      if (row.tipoInteractivo === 'CLOZE') {
        try {
          const activity = validateClozeActivity(row.datosInteractivo);
          contenido.push(`CLOZE: ${activity.textoConEspacios}`);
          activity.espacios.forEach((blank, i) => {
            contenido.push(
              `Espacio ${i + 1}:`,
              ...blank.opciones.map(
                (option, index) =>
                  `${index + 1}. ${option}${index === blank.correctaIndex ? ' [CORRECTA]' : ''}`,
              ),
            );
          });
          advertencias.push(
            'CLOZE es práctica de autocorrección: Flutter recibe las respuestas; no certifica dominio ni puntúa el diagnóstico.',
          );
        } catch (error) {
          if (!(error instanceof BadRequestException)) throw error;
          bloqueos.push(error.message);
        }
      } else if (row.tipoInteractivo || row.datosInteractivo != null) {
        bloqueos.push(
          'Interactivo no compatible o datos sin tipo: corrige el borrador antes de publicar.',
        );
      }
    }
    if (data.tipo === 'casos') {
      check(!!data.row.contexto.trim(), 'El caso necesita un contexto.');
      check(!!data.row.titulo?.trim(), 'El caso necesita un título.');
      contenido.push(data.row.titulo ?? '', data.row.contexto);
      resource(data.row.imagenUrl);
      dependientesPublicados = data.row._count.preguntas;
    }
    if (data.tipo === 'preguntas') {
      const row = data.row;
      try {
        validateAcademicClassification(row.subtema);
      } catch {
        bloqueos.push(
          'El tema/subtema necesita clasificación específica y no puede estar archivado.',
        );
      }
      check(
        row.subtema.estadoContenido === 'PUBLICADO' &&
          row.subtema.tema.estadoContenido === 'PUBLICADO',
        'Publica primero el tema y el subtema.',
      );
      check(!!row.enunciado.trim(), 'Falta el enunciado.');
      check(!!row.explicacion?.trim(), 'Falta la explicación general.');
      check(
        row.respuestas.length >= 2 &&
          row.respuestas.length <= 6 &&
          row.respuestas.every((option) => !!option.texto.trim()),
        'Se necesitan de 2 a 6 opciones con texto.',
      );
      check(
        row.respuestas.filter((option) => option.esCorrecta).length === 1,
        'Debe existir exactamente una opción correcta.',
      );
      const keys = row.respuestas.map((option) =>
        option.texto
          .normalize('NFKC')
          .trim()
          .toLocaleLowerCase('es-CO')
          .replace(/\s+/g, ' '),
      );
      check(
        new Set(keys).size === keys.length,
        'Las opciones no pueden repetirse.',
      );
      if (row.caso) {
        check(
          row.caso.estadoContenido === 'PUBLICADO' &&
            row.caso.area === this.area(data),
          'Publica primero un caso de la misma área.',
        );
        check(!!row.caso.contexto.trim(), 'El caso no tiene contexto.');
        check(
          Number.isInteger(row.ordenEnCaso) && (row.ordenEnCaso ?? 0) > 0,
          'El orden dentro del caso no es válido.',
        );
        const occupied = await db.pregunta.findFirst({
          where: {
            id: { not: row.id },
            casoId: row.caso.id,
            ordenEnCaso: row.ordenEnCaso,
          },
          select: { id: true },
        });
        check(!occupied, 'El orden del caso está ocupado por otra pregunta.');
        contenido.push(`Caso: ${row.caso.titulo ?? ''}`, row.caso.contexto);
        resource(row.caso.imagenUrl);
      } else
        check(
          !row.casoId && row.ordenEnCaso === null,
          'Revisa la asociación con el caso y su orden.',
        );
      contenido.push(
        row.enunciado,
        ...row.respuestas.map(
          (option, i) =>
            `${i + 1}. ${option.texto}${option.esCorrecta ? ' [CORRECTA]' : ''}\n${option.explicacion ?? ''}`,
        ),
        `Explicación: ${row.explicacion ?? ''}`,
      );
      resource(row.imagenUrl);
      const huella = createQuestionFingerprint({
        area: this.area(data),
        enunciado: row.enunciado,
        imagen: row.imagenUrl,
        opciones: row.respuestas,
      });
      const candidates = await db.pregunta.findMany({
        where: {
          id: { not: row.id },
          estadoContenido: { not: 'ARCHIVADO' },
          OR: [
            { huellaContenido: huella },
            {
              huellaContenido: null,
              subtema: { tema: { area: this.area(data) } },
            },
          ],
        },
        take: 2001,
        select: {
          id: true,
          huellaContenido: true,
          enunciado: true,
          imagenUrl: true,
          respuestas: { select: { texto: true } },
        },
      });
      if (candidates.length > 2000)
        bloqueos.push(
          'Falta indexar el banco heredado; la comprobación de duplicados no está completa.',
        );
      else {
        const duplicate = candidates.find(
          (item) =>
            (item.huellaContenido ??
              createQuestionFingerprint({
                area: this.area(data),
                enunciado: item.enunciado,
                imagen: item.imagenUrl,
                opciones: item.respuestas,
              })) === huella,
        );
        if (duplicate)
          bloqueos.push(
            `Pregunta coincidente: ${duplicate.id}. Revisa el duplicado antes de publicar.`,
          );
      }
    }
    if (dependientesPublicados)
      advertencias.push(
        `Tiene ${dependientesPublicados} dependiente(s) publicado(s). Archívalos primero; no hay cambios en cascada.`,
      );
    advertencias.push(
      'Revisión humana pendiente de responsabilidad editorial: exactitud, derechos del contenido y accesibilidad.',
    );
    const destinos = REVIEW_TRANSITIONS[data.row.estadoContenido].filter(
      (destino) =>
        (destino !== 'PUBLICADO' || !bloqueos.length) &&
        (destino !== 'ARCHIVADO' || !dependientesPublicados),
    );
    return {
      tipo: data.tipo,
      id: data.row.id,
      area: this.area(data),
      estadoContenido: data.row.estadoContenido,
      revision: revisionOf(data),
      habilitado: process.env.EDITORIAL_PUBLICATION_ENABLED === 'true',
      destinos,
      bloqueos: [...new Set(bloqueos)],
      advertencias: [...new Set(advertencias)],
      contenido,
    };
  }
  async detalle(tipo: ReviewKind, id: string) {
    return this.review(this.prisma, await this.read(this.prisma, tipo, id));
  }

  async cambiar(
    tipo: ReviewKind,
    id: string,
    revision: string,
    destino: EstadoContenido,
  ) {
    // Release gate: keep new state writes off until legacy writers are unified in D2.
    if (process.env.EDITORIAL_PUBLICATION_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'La publicación editorial está deshabilitada hasta completar la preparación del entorno.',
      );
    return this.prisma.$transaction(async (tx) => {
      const initial = await this.read(tx, tipo, id);
      await lockEditorialArea(tx, this.area(initial));
      const temaId =
        initial.tipo === 'temas'
          ? initial.row.id
          : initial.tipo === 'subtemas'
            ? initial.row.temaId
            : initial.tipo === 'preguntas'
              ? initial.row.subtema.temaId
              : null;
      const subtemaId =
        initial.tipo === 'subtemas'
          ? initial.row.id
          : initial.tipo === 'preguntas'
            ? initial.row.subtemaId
            : null;
      if (temaId)
        await tx.$queryRaw`SELECT id FROM "Tema" WHERE id = ${temaId} FOR UPDATE`;
      if (subtemaId)
        await tx.$queryRaw`SELECT id FROM "Subtema" WHERE id = ${subtemaId} FOR UPDATE`;
      if (initial.tipo === 'preguntas')
        await tx.$queryRaw`SELECT id FROM "Pregunta" WHERE id = ${id} FOR UPDATE`;
      const casoId =
        initial.tipo === 'casos'
          ? initial.row.id
          : initial.tipo === 'preguntas'
            ? initial.row.casoId
            : null;
      if (casoId)
        await tx.$queryRaw`SELECT id FROM "CasoPregunta" WHERE id = ${casoId} FOR UPDATE`;
      const current = await this.read(tx, tipo, id);
      if (revision !== revisionOf(current))
        throw new ConflictException({
          code: 'EDITOR_STALE',
          message: 'El contenido cambió; vuelve a revisar antes de publicar.',
        });
      const checks = await this.review(tx, current);
      if (!checks.destinos.includes(destino))
        throw new BadRequestException(
          'La transición no está permitida. Recarga los controles de revisión.',
        );
      const data = {
        estadoContenido: destino,
        ...(destino === 'PUBLICADO'
          ? { fechaPublicacion: current.row.fechaPublicacion ?? new Date() }
          : {}),
      };
      if (tipo === 'temas') await tx.tema.update({ where: { id }, data });
      if (tipo === 'subtemas') await tx.subtema.update({ where: { id }, data });
      if (tipo === 'casos')
        await tx.casoPregunta.update({ where: { id }, data });
      if (current.tipo === 'preguntas')
        await tx.pregunta.update({
          where: { id },
          data: {
            ...data,
            ...(destino === 'PUBLICADO'
              ? {
                  huellaContenido: createQuestionFingerprint({
                    area: this.area(current),
                    enunciado: current.row.enunciado,
                    imagen: current.row.imagenUrl,
                    opciones: current.row.respuestas,
                  }),
                }
              : {}),
          },
        });
      return this.review(tx, await this.read(tx, tipo, id));
    });
  }
}
