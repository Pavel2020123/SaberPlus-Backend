import { BadRequestException } from '@nestjs/common';
import { AreaIcfes, ModalidadTriviaRush, Prisma } from '@prisma/client';

export const snapshotQuestionInclude = {
  respuestas: true,
  subtema: { include: { tema: true } },
  caso: { select: { contexto: true, imagenUrl: true } },
} as const;
type Question = Prisma.PreguntaGetPayload<{
  include: typeof snapshotQuestionInclude;
}>;

export function freezeQuestion(
  p: Question,
  orden: number,
  opcionesOrden: string[],
) {
  return {
    preguntaId: p.id,
    orden,
    opcionesOrden,
    pregunta: {
      id: p.id,
      enunciado: p.enunciado,
      imagenUrl: p.imagenUrl,
      explicacion: p.explicacion,
      dificultad: p.dificultad,
      subtemaId: p.subtemaId,
      subtema: {
        nombre: p.subtema.nombre,
        tema: { nombre: p.subtema.tema.nombre, area: p.subtema.tema.area },
      },
      caso: p.caso,
      respuestas: p.respuestas.map((r) => ({
        id: r.id,
        texto: r.texto,
        esCorrecta: r.esCorrecta,
        explicacion: r.explicacion,
      })),
    },
  };
}
export interface TriviaSnapshot {
  version: 1;
  q: number;
  config: {
    areas: AreaIcfes[];
    duracionSegundos: number;
    versionReglas: number;
    modalidad: ModalidadTriviaRush;
  };
  questions: ReturnType<typeof freezeQuestion>[];
  // null is an explicit absence at admission, never re-selected on reads.
  ghost: {
    intentoId: string;
    puntaje: number;
    respuestasCorrectas: number;
    mejorCombo: number;
    finalizadoEn: string;
    q: number;
    config: TriviaSnapshot['config'];
    checkpoints: { segundosTranscurridos: number; puntaje: number }[];
  } | null;
}
export function readTriviaSnapshot(attempt: {
  evidenciaVersion?: number | null;
  snapshotInicial?: Prisma.JsonValue | null;
}): TriviaSnapshot | null {
  if (attempt.evidenciaVersion == null) return null;
  const s = attempt.snapshotInicial as unknown as TriviaSnapshot;
  if (
    attempt.evidenciaVersion !== 1 ||
    !s ||
    s.version !== 1 ||
    !Number.isInteger(s.q) ||
    s.q < 10 ||
    s.q > 30 ||
    !Array.isArray(s.questions) ||
    s.questions.length !== s.q
  )
    throw new BadRequestException('Evidencia inicial de Trivia invalida.');
  return s;
}
