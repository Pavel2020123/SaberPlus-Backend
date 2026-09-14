import { OrigenRespuesta } from '@prisma/client';
import {
  StudyAnswer,
  STUDY_TIME_LIMIT,
  studyDay,
  studyWindow,
  summarizeStudyTime,
} from './study-time.rules';

const now = new Date('2026-09-14T16:00:00Z');
const row = (changes: Partial<StudyAnswer> = {}): StudyAnswer => ({
  id: 'a',
  sesionId: 'session',
  preguntaId: 'q',
  origen: OrigenRespuesta.PRACTICA,
  esCorrecta: true,
  tiempoRespuestaSegundos: 60,
  fechaRespuesta: new Date('2026-09-14T05:00:00Z'),
  ...changes,
});

describe('P4-A reglas de tiempo y evolución', () => {
  it('usa el día colombiano, no el del servidor, con ambos bordes', () => {
    expect(studyDay(new Date('2026-09-14T04:59:59.999Z'))).toBe('2026-09-13');
    expect(studyDay(new Date('2026-09-14T05:00:00Z'))).toBe('2026-09-14');
    expect(studyWindow(now, 7).start.toISOString()).toBe(
      '2026-09-08T05:00:00.000Z',
    );
  });
  it.each([7, 30, 90])(
    'devuelve %i días sin atribuir desinterés al no tener registros',
    (days) => {
      const result = summarizeStudyTime([], [], now, days);
      expect(result.evolucion).toHaveLength(days);
      expect(
        result.evolucion.every(
          (day) =>
            day.estado === 'SIN_REGISTROS' && day.porcentajeAciertos === null,
        ),
      ).toBe(true);
      expect(result.totales.respuestas).toBe(0);
    },
  );
  it('no suma Pomodoro y preguntas en un total único y no concede dominio o XP', () => {
    const result = summarizeStudyTime(
      [row()],
      [{ eventoId: 'p', duracionSegundos: 1500, finalizadoEn: now }],
      now,
      7,
    );
    expect(result.totales).toMatchObject({
      segundosEvaluaciones: 60,
      segundosPomodoroDeclarados: 1500,
    });
    expect(result.totales).not.toHaveProperty('totalSegundos');
    expect(result.politica).toMatchObject({
      fuentesNoSumables: true,
      acreditaDominio: false,
      acreditaAtencion: false,
      otorgaXp: false,
    });
  });
  it('desduplica sesión/pregunta, pero otra sesión es nueva práctica', () => {
    const result = summarizeStudyTime(
      [
        row({ id: 'b', esCorrecta: false }),
        row(),
        row({ id: 'c', sesionId: 'another', esCorrecta: false }),
      ],
      [],
      now,
      7,
    );
    expect(result.totales).toMatchObject({
      respuestas: 2,
      aciertos: 1,
      errores: 1,
      sesionesEvaluacion: 2,
      segundosEvaluaciones: 120,
    });
    expect(
      result.evolucion[result.evolucion.length - 1].porcentajeAciertos,
    ).toBe(50);
  });
  it.each([null, -1, 7201, 1.5])(
    'distingue tiempo ausente o inválido %s de cero',
    (seconds) => {
      const result = summarizeStudyTime(
        [row({ tiempoRespuestaSegundos: seconds })],
        [],
        now,
        7,
      );
      expect(result.totales).toMatchObject({
        respuestas: 1,
        respuestasSinTiempo: 1,
        segundosEvaluaciones: 0,
      });
    },
  );
  it('acepta los límites del contrato de respuesta sin inventar minutos', () => {
    const result = summarizeStudyTime(
      [
        row({ tiempoRespuestaSegundos: 0 }),
        row({ id: 'b', preguntaId: 'q2', tiempoRespuestaSegundos: 7200 }),
      ],
      [],
      now,
      7,
    );
    expect(result.totales.respuestasSinTiempo).toBe(0);
    expect(result.totales.segundosEvaluaciones).toBe(7200);
  });
  it('excluye futuro, fuera de ventana y juegos todavía no integrados', () => {
    const result = summarizeStudyTime(
      [
        row({ fechaRespuesta: new Date(now.getTime() + 1) }),
        row({ fechaRespuesta: new Date('2026-09-01T10:00:00Z') }),
        row({ origen: OrigenRespuesta.BATALLA }),
        row({ origen: OrigenRespuesta.TRIVIA_RUSH }),
      ],
      [
        {
          eventoId: 'p',
          finalizadoEn: new Date(now.getTime() + 1),
          duracionSegundos: 1500,
        },
      ],
      now,
      7,
    );
    expect(result.totales.respuestas).toBe(0);
    expect(result.totales.bloquesPomodoro).toBe(0);
  });
  it('desduplica bloques y no integra duraciones diferentes de 25 minutos', () => {
    const block = { eventoId: 'p', finalizadoEn: now, duracionSegundos: 1500 };
    expect(
      summarizeStudyTime(
        [],
        [block, block, { ...block, eventoId: 'x', duracionSegundos: 60 }],
        now,
        7,
      ).totales.bloquesPomodoro,
    ).toBe(1);
  });
  it('muestra la muestra incompleta sin porcentajes o falsos días sin estudio', () => {
    const answers = Array.from({ length: STUDY_TIME_LIMIT + 1 }, (_, n) =>
      row({ id: String(n), preguntaId: String(n) }),
    );
    const result = summarizeStudyTime(answers, [], now, 7);
    expect(result.parcial).toBe(true);
    expect(result.totales.respuestas).toBe(STUDY_TIME_LIMIT);
    expect(
      result.evolucion.every(
        (d) => d.estado === 'MUESTRA_PARCIAL' && d.porcentajeAciertos === null,
      ),
    ).toBe(true);
  });
  it('no publica IDs, preguntas, opciones, claves o tiempos individuales', () => {
    const encoded = JSON.stringify(summarizeStudyTime([row()], [], now, 7));
    for (const field of [
      'preguntaId',
      'sesionId',
      'eventoId',
      'respuestaCorrectaId',
      'tiempoRespuestaSegundos',
    ])
      expect(encoded).not.toContain(`"${field}"`);
  });
});
