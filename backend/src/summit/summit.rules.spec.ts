import { SUMMIT_RULES, summitScore } from './summit.rules';

describe('Salto a la cima rules v1', () => {
  const score = (...values: boolean[]) =>
    summitScore(values.map((esCorrecta) => ({ esCorrecta })));
  it('starts on the floor', () =>
    expect(score()).toMatchObject({
      escalon: 0,
      respondidas: 0,
      estado: 'ACTIVO',
    }));
  it('descends exactly once, never below zero, and preserves the peak', () => {
    expect(score(false, true, true, false)).toMatchObject({
      escalon: 1,
      maximoEscalon: 2,
      errores: 2,
      aciertos: 2,
      ultimoMovimiento: -1,
    });
    expect(score(false, false)).toMatchObject({
      escalon: 0,
      ultimoMovimiento: 0,
    });
  });
  it('wins at five and never accepts more answers', () => {
    expect(score(true, true, true, true, true).estado).toBe('VICTORIA');
    expect(() => score(true, true, true, true, true, false)).toThrow();
  });
  it('ends after twelve questions, independent of correct count', () => {
    expect(score(...Array.from({ length: 12 }, () => false)).estado).toBe(
      'AGOTADO',
    );
    expect(
      score(...Array.from({ length: 12 }, (_, i) => i % 2 === 0)),
    ).toMatchObject({ aciertos: 6, escalon: 0, estado: 'AGOTADO' });
    expect(() => score(...Array.from({ length: 13 }, () => false))).toThrow();
    expect(SUMMIT_RULES).toEqual({ version: 1, target: 5, questions: 12 });
  });
});
