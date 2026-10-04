import {
  buildTugSnapshot,
  tugSnapshot,
} from '../tira-afloja/tira-afloja.evidence';

function fixture() {
  const match = {
    jugadorAId: 'a',
    jugadorBId: 'b',
    area: null,
    versionReglas: 1,
    expiraEn: new Date('2026-10-03T01:00:00Z'),
  };
  const assigned = Array.from({ length: 4 }, (_, i) => ({
    orden: i + 1,
    preguntaId: `q${i}`,
    opcionesOrden: ['wrong', 'right'],
    pregunta: {
      id: `q${i}`,
      enunciado: `original ${i}`,
      imagenUrl: null,
      explicacion: 'private',
      dificultad: 'BASICO',
      caso: null,
      subtema: { nombre: 'sub', tema: { nombre: 'topic', area: 'INGLES' } },
      respuestas: [
        {
          id: 'right',
          texto: 'original right',
          esCorrecta: true,
          explicacion: null,
        },
        {
          id: 'wrong',
          texto: 'original wrong',
          esCorrecta: false,
          explicacion: null,
        },
      ],
    },
  })) as Parameters<typeof buildTugSnapshot>[1];
  return { match, assigned };
}
describe('Tug server evidence snapshot without XP admission', () => {
  it('freezes original order, options, content, solutions, config and participants', () => {
    const { match, assigned } = fixture();
    const s = buildTugSnapshot(match, assigned);
    expect(s.qPartida).toBe(4);
    expect(s.participants).toEqual({ A: 'a', B: 'b' });
    expect(s.questions.map((q) => q.orden)).toEqual([1, 2, 3, 4]);
    expect(s.questions[0].pregunta.respuestas.map((r) => r.id)).toEqual([
      'wrong',
      'right',
    ]);
    assigned[0].pregunta.enunciado = 'changed';
    assigned[0].pregunta.respuestas[0].esCorrecta = false;
    (assigned[0].opcionesOrden as string[]).reverse();
    expect(s.questions[0].pregunta.enunciado).toBe('original 0');
    expect(s.questions[0].pregunta.respuestas[1].esCorrecta).toBe(true);
    expect(s.questions[0].opcionesOrden).toEqual(['wrong', 'right']);
  });
  it.each(['count', 'solution', 'order', 'participant'] as const)(
    'rejects invalid original %s',
    (kind) => {
      const { match, assigned } = fixture();
      if (kind === 'count') assigned.pop();
      if (kind === 'solution')
        assigned[0].pregunta.respuestas[1].esCorrecta = true;
      if (kind === 'order') assigned[0].opcionesOrden = ['right', 'right'];
      if (kind === 'participant') match.jugadorBId = match.jugadorAId;
      expect(() => buildTugSnapshot(match, assigned)).toThrow();
    },
  );
  it('keeps legacy absence and rejects malformed versioned evidence', () => {
    expect(tugSnapshot({ evidenciaVersion: null })).toBeNull();
    expect(() =>
      tugSnapshot({ evidenciaVersion: 1, snapshotInicial: {} }),
    ).toThrow();
  });
});
