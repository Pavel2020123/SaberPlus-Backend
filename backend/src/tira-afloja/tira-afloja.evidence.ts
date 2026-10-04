import { BadRequestException } from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';

export const TUG_QUESTION_INCLUDE = {
  respuestas: true,
  caso: true,
  subtema: { include: { tema: true } },
} satisfies Prisma.PreguntaInclude;
type Question = Prisma.PreguntaGetPayload<{
  include: typeof TUG_QUESTION_INCLUDE;
}>;
export interface TugSnapshot {
  version: 1;
  qPartida: number;
  participants: { A: string; B: string };
  config: {
    area: AreaIcfes | null;
    versionReglas: number;
    segundosPorRonda: 10;
    pausaMs: 1500;
    cuentaRegresivaMs: 3000;
    posicionMeta: 4;
    empateRapidezMs: 200;
    expiraEn: string;
  };
  questions: Array<{
    orden: number;
    preguntaId: string;
    opcionesOrden: string[];
    pregunta: {
      id: string;
      enunciado: string;
      imagenUrl: string | null;
      explicacion: string | null;
      dificultad: string;
      contexto: {
        id: string;
        titulo: string | null;
        contexto: string;
        imagenUrl: string | null;
      } | null;
      area: AreaIcfes;
      tema: string;
      subtema: string;
      respuestas: Array<{
        id: string;
        texto: string;
        esCorrecta: boolean;
        explicacion: string | null;
      }>;
    };
  }>;
}
export function buildTugSnapshot(
  match: {
    jugadorAId: string;
    jugadorBId: string | null;
    area: AreaIcfes | null;
    versionReglas: number;
    expiraEn: Date;
  },
  assigned: Array<{
    orden: number;
    preguntaId: string;
    opcionesOrden: Prisma.JsonValue;
    pregunta: Question;
  }>,
): TugSnapshot {
  if (
    !match.jugadorBId ||
    match.jugadorAId === match.jugadorBId ||
    match.versionReglas !== 1 ||
    assigned.length < 4 ||
    assigned.length > 20
  )
    throw new BadRequestException('Configuracion de evidencia Tira no valida.');
  const seen = new Set<string>();
  const questions = assigned.map((entry, i) => {
    const q = entry.pregunta;
    const order = entry.opcionesOrden;
    if (
      entry.orden !== i + 1 ||
      seen.has(q.id) ||
      entry.preguntaId !== q.id ||
      !q.enunciado.trim() ||
      q.respuestas.length < 2 ||
      q.respuestas.filter((r) => r.esCorrecta).length !== 1 ||
      !Array.isArray(order) ||
      order.length !== q.respuestas.length ||
      new Set(order).size !== order.length ||
      order.some(
        (id) =>
          typeof id !== 'string' || !q.respuestas.some((r) => r.id === id),
      ) ||
      q.respuestas.some((r) => !r.texto.trim())
    )
      throw new BadRequestException(
        'Banco original de Tira insuficiente o incompatible.',
      );
    seen.add(q.id);
    return {
      orden: entry.orden,
      preguntaId: q.id,
      opcionesOrden: [...order] as string[],
      pregunta: {
        id: q.id,
        enunciado: q.enunciado,
        imagenUrl: q.imagenUrl,
        explicacion: q.explicacion,
        dificultad: q.dificultad,
        contexto: q.caso
          ? {
              id: q.caso.id,
              titulo: q.caso.titulo,
              contexto: q.caso.contexto,
              imagenUrl: q.caso.imagenUrl,
            }
          : null,
        area: q.subtema.tema.area,
        tema: q.subtema.tema.nombre,
        subtema: q.subtema.nombre,
        respuestas: (order as string[]).map((id) => {
          const r = q.respuestas.find((r) => r.id === id)!;
          return {
            id: r.id,
            texto: r.texto,
            esCorrecta: r.esCorrecta,
            explicacion: r.explicacion,
          };
        }),
      },
    };
  });
  return {
    version: 1,
    qPartida: questions.length,
    participants: { A: match.jugadorAId, B: match.jugadorBId },
    config: {
      area: match.area,
      versionReglas: match.versionReglas,
      segundosPorRonda: 10,
      pausaMs: 1500,
      cuentaRegresivaMs: 3000,
      posicionMeta: 4,
      empateRapidezMs: 200,
      expiraEn: match.expiraEn.toISOString(),
    },
    questions,
  };
}
export function tugSnapshot(match: {
  evidenciaVersion?: number | null;
  snapshotInicial?: Prisma.JsonValue | null;
}): TugSnapshot | null {
  if (match.evidenciaVersion == null) return null;
  const s = match.snapshotInicial as unknown as TugSnapshot;
  if (
    match.evidenciaVersion !== 1 ||
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.questions) ||
    s.qPartida !== s.questions.length
  )
    throw new BadRequestException('Evidencia Tira no disponible o corrupta.');
  return s;
}
