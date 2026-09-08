import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isGenericCatalogName,
  validateAcademicClassification,
} from './academic-classification';
import { lockEditorialArea } from './editorial-lock';
import { ApplyReclassificationDto } from './question-reclassification.dto';

const include = {
  subtema: { include: { tema: true } },
  caso: true,
  respuestas: { orderBy: { id: 'asc' } },
  _count: true,
} satisfies Prisma.PreguntaInclude;
type Question = Prisma.PreguntaGetPayload<{ include: typeof include }>;
type Destination = Prisma.SubtemaGetPayload<{ include: { tema: true } }>;
type Usage = { diagnostico: boolean; simulacro: boolean; guardian: boolean };
type Snapshot = { pregunta: Question; destino: Destination; uso: Usage };
function idValue(value: string) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 120 ||
    /[\p{Cc}\p{Cf}]/u.test(value)
  )
    throw new BadRequestException(
      'Indica los identificadores de pregunta y subtema.',
    );
}
function revisionOf(value: Snapshot) {
  return createHash('sha256')
    .update(JSON.stringify({ version: 'reclassification-v1', ...value }))
    .digest('hex');
}

@Injectable()
export class QuestionReclassificationService {
  constructor(private readonly prisma: PrismaService) {}

  private async records(
    db: Prisma.TransactionClient,
    id: string,
    destinoSubtemaId: string,
  ) {
    const pregunta = await db.pregunta.findUnique({ where: { id }, include });
    if (!pregunta) throw new NotFoundException('La pregunta no existe.');
    const destino = await db.subtema.findUnique({
      where: { id: destinoSubtemaId },
      include: { tema: true },
    });
    if (!destino)
      throw new NotFoundException('El subtema de destino no existe.');
    return { pregunta, destino };
  }
  private async usage(
    db: Prisma.TransactionClient,
    id: string,
  ): Promise<Usage> {
    // These references are JSON, so Pregunta._count does not detect them.
    // Include completed/expired attempts too: they remain historical evidence.
    const diagnostico = await db.diagnosticoInicial.findFirst({
      where: { preguntaIds: { array_contains: [id] } },
      select: { id: true },
    });
    const simulacro = await db.intentoSimulacro.findFirst({
      where: { preguntaIds: { array_contains: [id] } },
      select: { id: true },
    });
    // Guardian is an optional, not-yet-deployed migration. Do not import its
    // generated model or alter its worktree. If present, check its private snapshot.
    const tables = await db.$queryRaw<
      { presente: boolean }[]
    >`SELECT to_regclass('"IntentoGuardian"') IS NOT NULL AS presente`;
    if (tables.length !== 1 || typeof tables[0].presente !== 'boolean')
      throw new ServiceUnavailableException(
        'No se pudo comprobar el uso académico. No se reclasificó la pregunta.',
      );
    const guardian = tables[0].presente
      ? await db.$queryRaw<
          { id: string }[]
        >`SELECT id FROM "IntentoGuardian" WHERE preguntas @> ${JSON.stringify([{ question: { id } }])}::jsonb LIMIT 1`
      : [];
    return {
      diagnostico: !!diagnostico,
      simulacro: !!simulacro,
      guardian: guardian.length > 0,
    };
  }
  private view(snapshot: Snapshot) {
    const { pregunta: row, destino, uso } = snapshot;
    const bloqueos: string[] = [];
    if (!['BORRADOR', 'ARCHIVADO'].includes(row.estadoContenido))
      bloqueos.push('Solo se reclasifican preguntas en borrador o archivadas.');
    if (row.fechaPublicacion)
      bloqueos.push(
        'La pregunta ya fue publicada. Necesita un flujo de versiones.',
      );
    const hasRelations = Object.entries(row._count).some(
      ([name, count]) => name !== 'respuestas' && count > 0,
    );
    if (
      hasRelations ||
      Object.values(uso).some(Boolean) ||
      row.porcentajeAciertos !== 0 ||
      row.tiempoPromedioSegundos !== 0
    )
      bloqueos.push(
        'Hay uso académico registrado. No se moverá la clasificación de resultados anteriores.',
      );
    if (row.subtemaId === destino.id)
      bloqueos.push('Selecciona un subtema distinto al actual.');
    if (row.subtema.tema.area !== destino.tema.area)
      bloqueos.push(
        'El destino debe pertenecer a la misma área. Cambiar de área requiere revisión especializada.',
      );
    try {
      validateAcademicClassification(destino);
    } catch {
      bloqueos.push(
        'Elige un tema y subtema específicos, válidos y no archivados.',
      );
    }
    if (row.caso && row.caso.area !== row.subtema.tema.area)
      bloqueos.push(
        'El caso tiene un área incompatible. Requiere revisión especializada.',
      );
    const habilitado =
      process.env.EDITORIAL_RECLASSIFICATION_ENABLED === 'true';
    return {
      id: row.id,
      revision: revisionOf(snapshot),
      habilitado,
      puedeReclasificar: habilitado && bloqueos.length === 0,
      bloqueos,
      pregunta: {
        enunciado: row.enunciado,
        imagenUrl: row.imagenUrl,
        explicacion: row.explicacion,
        estadoContenido: row.estadoContenido,
        respuestas: row.respuestas.map((r) => ({
          texto: r.texto,
          esCorrecta: r.esCorrecta,
        })),
        casoId: row.casoId,
        ordenEnCaso: row.ordenEnCaso,
        caso: row.caso
          ? {
              id: row.caso.id,
              titulo: row.caso.titulo,
              contexto: row.caso.contexto,
              imagenUrl: row.caso.imagenUrl,
            }
          : null,
      },
      origen: {
        area: row.subtema.tema.area,
        temaId: row.subtema.temaId,
        tema: row.subtema.tema.nombre,
        subtemaId: row.subtemaId,
        subtema: row.subtema.nombre,
        generico:
          isGenericCatalogName(row.subtema.nombre) ||
          isGenericCatalogName(row.subtema.tema.nombre),
      },
      destino: {
        area: destino.tema.area,
        temaId: destino.temaId,
        tema: destino.tema.nombre,
        subtemaId: destino.id,
        subtema: destino.nombre,
      },
      advertencias: [
        'La clasificación la decide un editor; esta herramienta no deduce el tema ni confirma su exactitud.',
        'Se conserva el estado, contenido, respuestas, caso y huella. No publica, fusiona ni borra duplicados.',
        'Una pregunta con uso requiere versiones y conservación de su clasificación histórica (C6).',
      ],
    };
  }
  async preview(id: string, destinoSubtemaId: string) {
    idValue(id);
    idValue(destinoSubtemaId);
    return this.view({
      ...(await this.records(this.prisma, id, destinoSubtemaId)),
      uso: await this.usage(this.prisma, id),
    });
  }
  async apply(id: string, dto: ApplyReclassificationDto) {
    idValue(id);
    idValue(dto.destinoSubtemaId);
    if (
      dto.confirmado !== true ||
      typeof dto.revision !== 'string' ||
      !/^[a-f0-9]{64}$/.test(dto.revision)
    )
      throw new BadRequestException(
        'Confirma la revisión actual de la reclasificación.',
      );
    if (process.env.EDITORIAL_RECLASSIFICATION_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'La reclasificación está deshabilitada en este entorno.',
      );
    return this.prisma.$transaction(
      async (tx) => {
        const initial = await this.records(tx, id, dto.destinoSubtemaId);
        const area = initial.pregunta.subtema.tema.area;
        // Never take foreign-area row locks for an invalid cross-area request.
        if (area !== initial.destino.tema.area)
          throw new BadRequestException(
            'El destino debe pertenecer a la misma área.',
          );
        await lockEditorialArea(tx, area);
        const themes = [
          ...new Set([initial.pregunta.subtema.temaId, initial.destino.temaId]),
        ].sort();
        const subthemes = [
          ...new Set([initial.pregunta.subtemaId, initial.destino.id]),
        ].sort();
        for (const temaId of themes)
          await tx.$queryRaw`SELECT id FROM "Tema" WHERE id = ${temaId} FOR UPDATE`;
        for (const subtemaId of subthemes)
          await tx.$queryRaw`SELECT id FROM "Subtema" WHERE id = ${subtemaId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "Pregunta" WHERE id = ${id} FOR UPDATE`;
        if (initial.pregunta.casoId)
          await tx.$queryRaw`SELECT id FROM "CasoPregunta" WHERE id = ${initial.pregunta.casoId} FOR UPDATE`;
        const current = {
          ...(await this.records(tx, id, dto.destinoSubtemaId)),
          uso: await this.usage(tx, id),
        };
        if (
          current.pregunta.subtema.tema.area !== area ||
          revisionOf(current) !== dto.revision
        )
          throw new ConflictException({
            code: 'RECLASSIFICATION_STALE',
            message:
              'La pregunta, el destino o su uso cambiaron. Revisa otra vez; no se movió la pregunta.',
          });
        const review = this.view(current);
        if (review.bloqueos.length)
          throw new BadRequestException({
            code: 'RECLASSIFICATION_BLOCKED',
            message: 'No es seguro reclasificar esta pregunta.',
            bloqueos: review.bloqueos,
          });
        const changed = await tx.pregunta.update({
          where: { id },
          data: { subtemaId: dto.destinoSubtemaId },
          select: {
            id: true,
            subtemaId: true,
            estadoContenido: true,
            fechaActualizacion: true,
          },
        });
        return {
          pregunta: changed,
          origenSubtemaId: current.pregunta.subtemaId,
          mensaje:
            'Clasificación actualizada sin publicar ni modificar contenido. Revisa la pregunta antes de enviarla a publicación.',
        };
      },
      { maxWait: 5000, timeout: 15000 },
    );
  }
}
