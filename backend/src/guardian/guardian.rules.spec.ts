import { guardianScore } from './guardian.rules';

describe('Guardian rules', () => {
  it('begins with three shields and six guardian energy', () => {
    expect(guardianScore([])).toEqual({
      aciertos: 0,
      errores: 0,
      escudo: 3,
      energiaGuardian: 6,
      estado: 'ACTIVO',
    });
  });

  it('requires six correct answers and loses on the third mistake', () => {
    expect(guardianScore(Array(5).fill({ esCorrecta: true })).estado).toBe(
      'ACTIVO',
    );
    expect(guardianScore(Array(6).fill({ esCorrecta: true }))).toMatchObject({
      estado: 'VICTORIA',
      energiaGuardian: 0,
      escudo: 3,
    });
    expect(guardianScore(Array(2).fill({ esCorrecta: false })).estado).toBe(
      'ACTIVO',
    );
    expect(guardianScore(Array(3).fill({ esCorrecta: false }))).toMatchObject({
      estado: 'DERROTA',
      escudo: 0,
      energiaGuardian: 6,
    });
  });

  it('all possible eight-question paths finish without exhausting the bank while active', () => {
    for (let pattern = 0; pattern < 256; pattern++) {
      const answers: { esCorrecta: boolean }[] = [];
      for (let index = 0; index < 8; index++) {
        if (guardianScore(answers).estado !== 'ACTIVO') break;
        answers.push({ esCorrecta: (pattern & (1 << index)) !== 0 });
      }
      const result = guardianScore(answers);
      expect(result.estado).not.toBe('ACTIVO');
      expect(result.escudo).toBeGreaterThanOrEqual(0);
      expect(result.energiaGuardian).toBeGreaterThanOrEqual(0);
    }
  });
});
