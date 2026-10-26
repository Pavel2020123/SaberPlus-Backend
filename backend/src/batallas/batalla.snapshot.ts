import { BadRequestException } from '@nestjs/common';
import { OrigenRespuesta, Prisma } from '@prisma/client';
import { publicAnswerOption } from '../common/public-answer-option';

export const battleQuestionInclude = {
  respuestas: true,
  caso: { select: { contexto: true, imagenUrl: true } },
  subtema: { select: { tema: { select: { area: true } } } },
} as const;
type Question = Prisma.PreguntaGetPayload<{
  include: typeof battleQuestionInclude;
}>;

export function freezeBattleQuestion(
  q: Question,
  orden: number,
  opcionesOrden: string[],
) {
  return {
    version: 1 as const,
    preguntaId: q.id,
    orden,
    opcionesOrden: [...opcionesOrden],
    pregunta: {
      id: q.id,
      enunciado: q.enunciado,
      imagenUrl: q.imagenUrl,
      explicacion: q.explicacion,
      caso: q.caso ? { ...q.caso } : null,
      subtema: { tema: { area: q.subtema.tema.area } },
      respuestas: q.respuestas.map((r) => ({
        ...publicAnswerOption(r),
        esCorrecta: r.esCorrecta,
        explicacion: r.explicacion,
      })),
    },
  };
}

export type BattleQuestion = ReturnType<
  typeof freezeBattleQuestion
>['pregunta'];

export function readBattleSnapshot(raw: Prisma.JsonValue | null | undefined) {
  if (raw == null) return null;
  const s = raw as unknown as ReturnType<typeof freezeBattleQuestion>;
  if (
    s.version !== 1 ||
    !s.pregunta ||
    s.preguntaId !== s.pregunta.id ||
    !Number.isInteger(s.orden) ||
    s.orden < 0 ||
    !Array.isArray(s.opcionesOrden) ||
    !Array.isArray(s.pregunta.respuestas) ||
    s.pregunta.respuestas.length < 2 ||
    s.opcionesOrden.length !== s.pregunta.respuestas.length
  )
    throw new BadRequestException(
      'La copia original de la batalla no está disponible.',
    );
  return s;
}

// Solo historial propio confirmado: una sesión/URL facilitada por el cliente no
// basta para cargar una copia privada. Consulta en lote, no una por pregunta.
export async function ownBattleHistoryQuestions(
  db: Pick<Prisma.TransactionClient, '$queryRaw'>,
  owner: string,
  records: readonly { id: string; origen: OrigenRespuesta }[],
) {
  const ids = records.filter((r) => r.origen === 'BATALLA').map((r) => r.id);
  const originals = new Map<string, BattleQuestion>();
  if (!ids.length) return originals;
  const rows = await db.$queryRaw<
    { id: string; snapshot: Prisma.JsonValue }[]
  >(Prisma.sql`
    SELECT h.id,p."snapshotInicial" AS snapshot FROM "HistorialRespuesta" h
    JOIN "BatallaRespuesta" r ON r."batallaId"=h."sesionId" AND r."usuarioId"=h."usuarioId"
      AND r."preguntaId"=h."preguntaId" AND r."respuestaSeleccionadaId"=h."respuestaSeleccionadaId" AND r."esCorrecta"=h."esCorrecta"
    JOIN "BatallaPregunta" p ON p."batallaId"=r."batallaId" AND p."preguntaId"=r."preguntaId" AND p.orden=r.orden
    WHERE h.id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))})
      AND h."usuarioId"=${owner}::uuid AND h.origen='BATALLA' AND p."snapshotInicial"->'version'='1'::jsonb
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(p."snapshotInicial"->'pregunta'->'respuestas') option
        WHERE option->>'id'=h."respuestaCorrectaId" AND option->'esCorrecta'='true'::jsonb)`);
  for (const row of rows) {
    const snapshot = readBattleSnapshot(row.snapshot);
    if (snapshot) originals.set(row.id, snapshot.pregunta);
  }
  return originals;
}
