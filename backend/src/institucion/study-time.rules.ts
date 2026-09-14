import { OrigenRespuesta } from '@prisma/client';

const DAY_MS = 86400000;
export const STUDY_TIME_LIMIT = 10000;
export const STUDY_TIME_ORIGINS: OrigenRespuesta[] = [
  OrigenRespuesta.PRACTICA,
  OrigenRespuesta.SIMULACRO,
  OrigenRespuesta.PERSONALIZADO,
  OrigenRespuesta.DIAGNOSTICO,
  OrigenRespuesta.ADAPTATIVO,
];
export const STUDY_TIME_POLICY = {
  version: 1,
  zonaHoraria: 'America/Bogota',
  duracionPomodoroSegundos: 1500,
  diasMaximosSincronizacion: 90,
  maximoEventosPorLote: 50,
  maximoRegistrosEvaluacion: STUDY_TIME_LIMIT,
  fuentesNoSumables: true,
  acreditaAtencion: false,
  acreditaDominio: false,
  otorgaXp: false,
  criterioEvaluacion: 'PRIMER_REGISTRO_POR_SESION_Y_PREGUNTA',
  criterioDia: 'FECHA_DE_CONFIRMACION_O_FINALIZACION',
  medicionEvaluaciones: 'TIEMPOS_DECLARADOS_EN_RESPUESTAS_CONFIRMADAS',
  medicionPomodoro: 'BLOQUES_COMPLETADOS_DECLARADOS_POR_DISPOSITIVO',
} as const;

// El desplazamiento de Bogotá es UTC-05:00; no depende de la zona del servidor.
export function studyDay(date: Date): string {
  return new Date(date.getTime() - 5 * 3600000).toISOString().slice(0, 10);
}
export function studyWindow(now: Date, days: number) {
  const today = new Date(`${studyDay(now)}T00:00:00-05:00`);
  return { start: new Date(today.getTime() - (days - 1) * DAY_MS), end: now };
}

export interface StudyAnswer {
  id: string;
  sesionId: string;
  preguntaId: string;
  origen: OrigenRespuesta;
  esCorrecta: boolean;
  tiempoRespuestaSegundos: number | null;
  fechaRespuesta: Date;
}
export interface StudyPomodoro {
  eventoId: string;
  finalizadoEn: Date;
  duracionSegundos: number;
}

function emptyMetrics() {
  return {
    segundosEvaluaciones: 0,
    segundosPomodoroDeclarados: 0,
    respuestas: 0,
    aciertos: 0,
    errores: 0,
    respuestasSinTiempo: 0,
    sesionesEvaluacion: 0,
    bloquesPomodoro: 0,
  };
}

export function summarizeStudyTime(
  answers: StudyAnswer[],
  pomodoros: StudyPomodoro[],
  now: Date,
  days: number,
) {
  const { start, end } = studyWindow(now, days);
  const buckets = new Map<string, ReturnType<typeof emptyMetrics>>();
  const sessions = new Map<string, Set<string>>();
  for (let i = 0; i < days; i++) {
    const key = studyDay(new Date(start.getTime() + i * DAY_MS));
    buckets.set(key, emptyMetrics());
    sessions.set(key, new Set());
  }
  const partial = answers.length > STUDY_TIME_LIMIT;
  const seen = new Set<string>();
  const allSessions = new Set<string>();
  // Consulta ordenada ascendente y limitada. Defensa pura también ante desorden.
  for (const row of [...answers]
    .sort(
      (a, b) =>
        a.fechaRespuesta.getTime() - b.fechaRespuesta.getTime() ||
        a.id.localeCompare(b.id),
    )
    .slice(0, STUDY_TIME_LIMIT)) {
    if (
      row.fechaRespuesta < start ||
      row.fechaRespuesta > end ||
      !STUDY_TIME_ORIGINS.includes(row.origen)
    )
      continue;
    const key = JSON.stringify([row.sesionId, row.preguntaId]);
    if (seen.has(key)) continue;
    seen.add(key);
    const day = studyDay(row.fechaRespuesta);
    const bucket = buckets.get(day);
    bucket.respuestas++;
    if (row.esCorrecta) bucket.aciertos++;
    else bucket.errores++;
    const seconds = row.tiempoRespuestaSegundos;
    if (
      seconds == null ||
      !Number.isInteger(seconds) ||
      seconds < 0 ||
      seconds > 7200
    ) {
      bucket.respuestasSinTiempo++;
    } else {
      bucket.segundosEvaluaciones += seconds;
    }
    sessions.get(day).add(row.sesionId);
    allSessions.add(row.sesionId);
  }
  const seenPomodoros = new Set<string>();
  for (const row of pomodoros) {
    if (
      row.finalizadoEn < start ||
      row.finalizadoEn > end ||
      row.duracionSegundos !== 1500 ||
      seenPomodoros.has(row.eventoId)
    )
      continue;
    seenPomodoros.add(row.eventoId);
    const bucket = buckets.get(studyDay(row.finalizadoEn));
    bucket.segundosPomodoroDeclarados += row.duracionSegundos;
    bucket.bloquesPomodoro++;
  }
  const total = emptyMetrics();
  const evolution = [...buckets].map(([fecha, bucket]) => {
    bucket.sesionesEvaluacion = sessions.get(fecha).size;
    for (const key of Object.keys(total) as (keyof typeof total)[])
      total[key] += bucket[key];
    return {
      fecha,
      ...bucket,
      estado: partial
        ? 'MUESTRA_PARCIAL'
        : bucket.respuestas || bucket.bloquesPomodoro
          ? 'CON_REGISTROS'
          : 'SIN_REGISTROS',
      // No comparar dificultad de bancos distintos ni inferir dominio de este porcentaje.
      porcentajeAciertos:
        !partial && bucket.respuestas
          ? Math.round((bucket.aciertos * 1000) / bucket.respuestas) / 10
          : null,
    };
  });
  total.sesionesEvaluacion = allSessions.size;
  return {
    version: 1,
    politica: STUDY_TIME_POLICY,
    desde: start.toISOString(),
    hasta: end.toISOString(),
    dias: days,
    parcial: partial,
    registrosEvaluacionLeidos: Math.min(answers.length, STUDY_TIME_LIMIT),
    totales: total,
    evolucion: evolution,
  };
}
