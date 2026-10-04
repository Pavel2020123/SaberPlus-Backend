import { CompetitiveVerifierRegistry } from './competitive.contracts';
import { createCompetitiveVerifiers } from './competitive.module';
import {
  abandonmentWinXp,
  applyDelta,
  normalXp,
  roundRatio,
} from './competitive.rules';

describe('TUG tenth checkpoint: preparatory arithmetic, never an enabled verifier', () => {
  it.each([
    ['VICTORIA', 48],
    ['EMPATE', 28],
    ['DERROTA', 8],
  ] as const)('uses exact half-up C=1 R=8 for %s', (outcome, xp) => {
    expect(
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 1,
        presentedRounds: 8,
        outcome,
      }),
    ).toBe(xp);
  });
  const abandonment = {
    gameId: 'TUG_OF_WAR' as const,
    correct: 1,
    snapshotQuestions: 20,
    acceptedAnswers: 1,
    activeCompetitiveMatch: true,
    validParticipants: true,
    definitiveAbandonment: true,
    sufficientEvidence: true,
    bothAbsent: false,
  };
  it('distinguishes R from Qpartida and does not combine normal and abandonment bonuses', () => {
    expect(
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 1,
        presentedRounds: 1,
        outcome: 'VICTORIA',
      }),
    ).toBe(100);
    expect(abandonmentWinXp(abandonment)).toBe(23);
    expect(
      abandonmentWinXp({ ...abandonment, correct: 20, acceptedAnswers: 20 }),
    ).toBe(80);
    expect(
      abandonmentWinXp({ ...abandonment, correct: 0, acceptedAnswers: 0 }),
    ).toBe(0);
    expect(abandonmentWinXp({ ...abandonment, bothAbsent: true })).toBe(0);
  });
  it('rejects insufficient presence instead of treating a sporting winner as payable', () => {
    expect(() =>
      abandonmentWinXp({ ...abandonment, sufficientEvidence: false }),
    ).toThrow('PRESENCE_REQUIRED');
    expect(() =>
      abandonmentWinXp({ ...abandonment, definitiveAbandonment: false }),
    ).toThrow();
  });
  it.each([-1, 0, 1.5, NaN, Infinity])(
    'does not divide by invalid denominator %s',
    (denominator) => {
      expect(() => roundRatio(60, denominator)).toThrow();
    },
  );
  it('preserves the active-abandonment nominal penalty, applied floor and before/after trace', () => {
    expect(applyDelta(7, -15)).toEqual({
      before: 7,
      nominal: -15,
      applied: -7,
      after: 0,
    });
    expect(applyDelta(0, -15)).toEqual({
      before: 0,
      nominal: -15,
      applied: 0,
      after: 0,
    });
  });
  it.each(['VICTORIA', 'EMPATE', 'DERROTA'] as const)(
    'approved normal R=0 gives no base or bonus for %s (arithmetic only)',
    (outcome) => {
      expect(
        normalXp({
          gameId: 'TUG_OF_WAR',
          correct: 0,
          presentedRounds: 0,
          outcome,
        }),
      ).toBe(0);
    },
  );
  it('rejects correct answers incompatible with zero enabled rounds', () => {
    expect(() =>
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 1,
        presentedRounds: 0,
        outcome: 'VICTORIA',
      }),
    ).toThrow();
  });
  it('keeps all terminal variants outside actual settlement pending technical proof', () => {
    const registry = new CompetitiveVerifierRegistry(
      createCompetitiveVerifiers(),
    );
    expect(() => registry.get('TUG_MATCH')).toThrow('SOURCE_NOT_INTEGRATED');
  });
});
