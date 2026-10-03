import {
  CompetitiveVerifierRegistry,
  SOURCE_FOR_GAME,
} from './competitive.contracts';
import { createCompetitiveVerifiers } from './competitive.module';
import { canonicalSourceId } from './competitive.source';
import {
  ABANDONMENT_PENALTY,
  abandonmentWinXp,
  applyDelta,
  normalXp,
  RECONNECTION,
} from './competitive.rules';

describe('Tira V1: approved arithmetic and unavailable runtime boundary', () => {
  it('keeps TUG_MATCH identity but cannot liquidate without a real verifier', () => {
    expect(SOURCE_FOR_GAME.TUG_OF_WAR).toBe('TUG_MATCH');
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(canonicalSourceId('TUG_MATCH', id.toUpperCase())).toBe(id);
    expect(() =>
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()).get(
        'TUG_MATCH',
      ),
    ).toThrow('SOURCE_NOT_INTEGRATED');
  });
  it.each([
    [1, 16, 'VICTORIA', 44],
    [1, 16, 'EMPATE', 24],
    [1, 16, 'DERROTA', 4],
    [0, 20, 'EMPATE', 20],
    [20, 20, 'VICTORIA', 100],
    [0, 0, 'VICTORIA', 0],
  ] as const)(
    'normal C=%s R=%s %s gives %s (pure rule, not an engine payment)',
    (correct, presentedRounds, outcome, xp) => {
      expect(
        normalXp({ gameId: 'TUG_OF_WAR', correct, presentedRounds, outcome }),
      ).toBe(xp);
    },
  );
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
  it('uses frozen Qpartida for early abandonment, not presented rounds', () => {
    expect(abandonmentWinXp(abandonment)).toBe(23);
    expect(
      abandonmentWinXp({ ...abandonment, correct: 20, acceptedAnswers: 20 }),
    ).toBe(80);
    expect(abandonmentWinXp({ ...abandonment, correct: 0 })).toBe(20);
    expect(
      abandonmentWinXp({ ...abandonment, correct: 0, acceptedAnswers: 0 }),
    ).toBe(0);
    expect(abandonmentWinXp({ ...abandonment, bothAbsent: true })).toBe(0);
    expect(() =>
      abandonmentWinXp({ ...abandonment, sufficientEvidence: false }),
    ).toThrow('PRESENCE_REQUIRED');
  });
  it('retains the 30 s policy and nominal -15 with floor zero without activating it', () => {
    expect(RECONNECTION.TUG_OF_WAR.milliseconds).toBe(30_000);
    expect(ABANDONMENT_PENALTY.TUG_OF_WAR).toBe(-15);
    expect(applyDelta(7, -15)).toMatchObject({ applied: -7, after: 0 });
  });
});
