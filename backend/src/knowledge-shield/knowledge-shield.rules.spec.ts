import {
  KNOWLEDGE_SHIELD_RULES,
  knowledgeShieldScore,
} from './knowledge-shield.rules';

const score = (...answers: boolean[]) =>
  knowledgeShieldScore(answers.map((esCorrecta) => ({ esCorrecta })));
describe('Knowledge Shield rules v1', () => {
  it('starts with three shield points and zero pages', () => {
    expect(score()).toEqual({
      escudo: 3,
      paginas: 0,
      aciertos: 0,
      errores: 0,
      respondidas: 0,
      estado: 'ACTIVO',
    });
    expect(Object.isFrozen(KNOWLEDGE_SHIELD_RULES)).toBe(true);
  });
  it('caps repairs and applies an attack at each fourth question', () => {
    for (let count = 1; count <= 12; count++) {
      const result = score(...Array<boolean>(count).fill(true));
      expect(result.escudo).toBe(count % 4 === 0 ? 2 : 3);
      expect(result.paginas).toBe(Math.floor(count / 4));
      expect(result.estado).toBe(count === 12 ? 'VICTORIA' : 'ACTIVO');
    }
  });
  it('repairs previous damage without exceeding the maximum', () => {
    expect(score(false).escudo).toBe(2);
    expect(score(false, true).escudo).toBe(3);
  });
  it('loses immediately at zero and cannot answer after defeat', () => {
    expect(score(false, false, false)).toMatchObject({
      escudo: 0,
      paginas: 0,
      estado: 'DERROTA',
      respondidas: 3,
    });
    expect(() => score(false, false, false, true)).toThrow();
  });
  it('a round attack may defeat and grants no page for that round', () => {
    expect(score(true, true, false, false)).toMatchObject({
      escudo: 0,
      paginas: 0,
      estado: 'DERROTA',
      respondidas: 4,
    });
  });
  it('does not reset the shield at the next round', () => {
    expect(score(true, true, true, true, false)).toMatchObject({
      escudo: 1,
      paginas: 1,
      estado: 'ACTIVO',
    });
  });
  it('last round defeat precedes victory and retains earlier pages', () => {
    expect(score(...Array<boolean>(10).fill(true), false, false)).toMatchObject(
      {
        escudo: 0,
        paginas: 2,
        estado: 'DERROTA',
        respondidas: 12,
      },
    );
  });
  it('rejects answers beyond the question limit or non-boolean grading', () => {
    expect(() => score(...Array<boolean>(13).fill(true))).toThrow();
    expect(() =>
      knowledgeShieldScore([{ esCorrecta: 1 as unknown as boolean }]),
    ).toThrow();
  });
  it('all reachable histories preserve bounds and terminal rules', () => {
    const visit = (answers: boolean[]) => {
      const result = score(...answers);
      expect(result.escudo).toBeGreaterThanOrEqual(0);
      expect(result.escudo).toBeLessThanOrEqual(3);
      expect(result.paginas).toBeLessThanOrEqual(
        Math.floor(answers.length / 4),
      );
      expect(result.aciertos + result.errores).toBe(answers.length);
      if (result.estado === 'ACTIVO') {
        visit([...answers, true]);
        visit([...answers, false]);
      } else {
        expect(() => score(...answers, true)).toThrow();
        expect(result.estado === 'VICTORIA').toBe(
          result.paginas === 3 && result.escudo > 0,
        );
      }
    };
    visit([]);
  });
});
