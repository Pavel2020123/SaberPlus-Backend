import {
  buildLearningEvidence,
  EvidenceRecord,
  evidenceWindow,
} from './learning-evidence.rules';

const now = new Date('2026-09-06T15:00:00Z');
function record(index: number, correct = true): EvidenceRecord {
  return {
    id: `r-${index}`,
    preguntaId: `p-${index}`,
    sesionId: `session-${index % 2}`,
    area: 'MATEMATICAS',
    esCorrecta: correct,
    fechaRespuesta: new Date(
      index % 2 ? '2026-09-05T15:00:00Z' : '2026-09-04T15:00:00Z',
    ),
    pregunta: {
      estadoContenido: 'PUBLICADO',
      subtema: {
        id: 's1',
        nombre: 'Regla de tres',
        estadoContenido: 'PUBLICADO',
        tema: {
          id: 't1',
          nombre: 'Proporcionalidad',
          area: 'MATEMATICAS',
          estadoContenido: 'PUBLICADO',
        },
      },
    },
  };
}
function rows(count: number, correct: number) {
  return Array.from({ length: count }, (_, i) => record(i, i < correct));
}

describe('Evidencia académica v1', () => {
  it('sin respuestas no inventa temas ni falencias', () => {
    expect(buildLearningEvidence([], now)).toMatchObject({
      version: 1,
      parcial: false,
      temas: [],
    });
  });

  it('un error aislado indica evidencia insuficiente', () => {
    expect(
      buildLearningEvidence([record(0, false)], now).temas[0].subtemas[0],
    ).toMatchObject({
      incorrectas: 1,
      preguntasUnicas: 1,
      estado: 'EVIDENCIA_INSUFICIENTE',
    });
  });

  it.each<[number, number, string]>([
    [4, 4, 'EVIDENCIA_INSUFICIENTE'],
    [5, 2, 'POR_REFORZAR'],
    [5, 3, 'EN_PROCESO'],
    [5, 4, 'FORTALEZA'],
  ])('clasifica %s preguntas y %s aciertos', (count, correct, state) => {
    expect(
      buildLearningEvidence(rows(count, correct), now).temas[0].subtemas[0]
        .estado,
    ).toBe(state);
  });

  it('tema exige diez preguntas y no hereda la etiqueta de un solo subtema', () => {
    expect(buildLearningEvidence(rows(5, 5), now).temas[0].estado).toBe(
      'EVIDENCIA_INSUFICIENTE',
    );
    expect(buildLearningEvidence(rows(10, 8), now).temas[0].estado).toBe(
      'FORTALEZA',
    );
  });

  it('cinco preguntas de una sola sesión no bastan', () => {
    const input = rows(5, 5).map((r) => ({ ...r, sesionId: 'same' }));
    expect(buildLearningEvidence(input, now).temas[0].subtemas[0].estado).toBe(
      'EVIDENCIA_INSUFICIENTE',
    );
  });

  it('distintas sesiones del mismo día no bastan', () => {
    const input = rows(5, 5).map((r) => ({
      ...r,
      fechaRespuesta: new Date('2026-09-05T15:00:00Z'),
    }));
    expect(buildLearningEvidence(input, now).temas[0].subtemas[0].dias).toBe(1);
    expect(buildLearningEvidence(input, now).temas[0].estado).toBe(
      'EVIDENCIA_INSUFICIENTE',
    );
  });

  it('cuenta días de Bogotá, no cambios de fecha UTC', () => {
    const input = rows(5, 5).map((r, i) => ({
      ...r,
      fechaRespuesta: new Date(
        i % 2 ? '2026-09-05T23:30:00Z' : '2026-09-06T01:30:00Z',
      ),
    }));
    expect(buildLearningEvidence(input, now).temas[0].subtemas[0].dias).toBe(1);
  });

  it('cien repeticiones no cuentan como cien preguntas ni reemplazan el primer error', () => {
    const input = [
      record(0, false),
      ...Array.from({ length: 100 }, (_, i) => ({
        ...record(i + 1),
        preguntaId: 'p-0',
        fechaRespuesta: new Date('2026-09-06T14:00:00Z'),
      })),
    ];
    const result = buildLearningEvidence(input.reverse(), now);
    expect(result.repeticionesIgnoradas).toBe(100);
    expect(result.temas[0].subtemas[0]).toMatchObject({
      preguntasUnicas: 1,
      correctas: 0,
      estado: 'EVIDENCIA_INSUFICIENTE',
    });
  });

  it('excluye respuestas fuera de ventana o futuras; acepta el límite exacto', () => {
    const input = [
      { ...record(0), fechaRespuesta: evidenceWindow(now) },
      {
        ...record(1),
        fechaRespuesta: new Date(evidenceWindow(now).getTime() - 1),
      },
      { ...record(2), fechaRespuesta: new Date(now.getTime() + 1) },
    ];
    expect(buildLearningEvidence(input, now)).toMatchObject({
      registrosExcluidos: 2,
      temas: [{ preguntasUnicas: 1 }],
    });
  });

  it.each(['pregunta', 'subtema', 'tema', 'generico', 'area'])(
    'excluye clasificación no utilizable: %s',
    (reason) => {
      const row = record(0);
      if (reason === 'pregunta') row.pregunta.estadoContenido = 'ARCHIVADO';
      if (reason === 'subtema')
        row.pregunta.subtema.estadoContenido = 'BORRADOR';
      if (reason === 'tema')
        row.pregunta.subtema.tema.estadoContenido = 'EN_REVISION';
      if (reason === 'generico') row.pregunta.subtema.nombre = 'Banco General';
      if (reason === 'area') row.area = 'INGLES';
      expect(buildLearningEvidence([row], now)).toMatchObject({
        registrosExcluidos: 1,
        temas: [],
      });
    },
  );

  it('no mezcla subtemas con nombres iguales y distintos IDs', () => {
    const input = rows(6, 6);
    for (const row of input.slice(3)) row.pregunta.subtema.id = 's2';
    expect(
      buildLearningEvidence(input, now).temas[0].subtemas.map(
        (s) => s.preguntasUnicas,
      ),
    ).toEqual([3, 3]);
  });

  it('un historial truncado no produce conclusiones de fortaleza ni refuerzo', () => {
    const result = buildLearningEvidence(rows(12, 12), now, true);
    expect(result.parcial).toBe(true);
    expect(result.temas[0].estado).toBe('EVIDENCIA_INSUFICIENTE');
    expect(result.temas[0].subtemas[0].estado).toBe('EVIDENCIA_INSUFICIENTE');
  });

  it('solo serializa métricas y clasificación, no IDs de intentos o respuestas', () => {
    const json = JSON.stringify(buildLearningEvidence(rows(5, 5), now));
    for (const key of [
      'preguntaId',
      'sesionId',
      'esCorrecta',
      'usuarioId',
      'respuestaCorrectaId',
    ])
      expect(json).not.toContain(`"${key}"`);
  });
});
