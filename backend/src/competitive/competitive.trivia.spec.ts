import { assertTriviaCompetitiveCreationAllowed } from './competitive.activation';
import { createCompetitiveVerifiers } from './competitive.module';
import {
  CompetitiveVerifierRegistry,
  SOURCE_FOR_GAME,
} from './competitive.contracts';
import { ghostOutcome } from './competitive.trivia';
import { normalXp } from './competitive.rules';

describe('Trivia competitive V1 decisions and admission', () => {
  it('represents no ghost as no outcome; a real ghost requires a verified outcome', () => {
    const facts = {
      gameId: 'GHOST_DUEL' as const,
      correct: 10,
      questions: 10,
      outcome: null,
      distinctMode: true,
      ghostFixedAtStart: true,
      compatibleConfiguration: true,
    };
    expect(normalXp({ ...facts, ghostId: null })).toBe(80);
    expect(() => normalXp({ ...facts, ghostId: 'fixed' })).toThrow(
      'GHOST_RESULT_REQUIRED',
    );
  });
  const flags = [
    'COMPETITIVE_TRIVIA_ENABLED',
    'COMPETITIVE_GHOST_ENABLED',
    'COMPETITIVE_SOLO_ENABLED',
  ];
  const saved = flags.map((k) => process.env[k]);
  beforeEach(() => flags.forEach((k) => delete process.env[k]));
  afterEach(() =>
    flags.forEach((k, i) =>
      saved[i] === undefined
        ? delete process.env[k]
        : (process.env[k] = saved[i]),
    ),
  );
  it('registers exactly one shared source for both immutable modes', () => {
    const registry = new CompetitiveVerifierRegistry(
      createCompetitiveVerifiers(),
    );
    expect(registry.get(SOURCE_FOR_GAME.TRIVIA_RUSH)).toBe(
      registry.get(SOURCE_FOR_GAME.GHOST_DUEL),
    );
    for (const source of ['TUG_MATCH', 'MEMORY_ATTEMPT', 'BATTLE'] as const)
      expect(() => registry.get(source)).toThrow('SOURCE_NOT_INTEGRATED');
  });
  it.each(['TRIVIA_RUSH', 'GHOST_DUEL'])(
    'defaults %s to OFF independently of solo',
    (mode) => {
      process.env.COMPETITIVE_SOLO_ENABLED = 'true';
      expect(() => assertTriviaCompetitiveCreationAllowed(mode)).toThrow();
    },
  );
  it('admits each mode only for its exact true server configuration', () => {
    process.env.COMPETITIVE_TRIVIA_ENABLED = 'true';
    expect(() =>
      assertTriviaCompetitiveCreationAllowed('TRIVIA_RUSH'),
    ).not.toThrow();
    expect(() =>
      assertTriviaCompetitiveCreationAllowed('GHOST_DUEL'),
    ).toThrow();
    process.env.COMPETITIVE_GHOST_ENABLED = 'true';
    expect(() =>
      assertTriviaCompetitiveCreationAllowed('GHOST_DUEL'),
    ).not.toThrow();
    process.env.COMPETITIVE_TRIVIA_ENABLED = '1';
    expect(() =>
      assertTriviaCompetitiveCreationAllowed('TRIVIA_RUSH'),
    ).toThrow();
    expect(() => assertTriviaCompetitiveCreationAllowed()).toThrow();
  });
  it.each([
    [601, 600, 'VICTORIA'],
    [600, 600, 'EMPATE'],
    [599, 600, 'DERROTA'],
  ] as const)('compares scores %s and %s only', (score, ghost, outcome) => {
    expect(ghostOutcome(score, ghost)).toBe(outcome);
  });
  it.each([
    [0, 0, 10, 0],
    [4, 4, 10, 40],
    [4, 2, 10, 34],
    [5, 4, 10, 47],
    [10, 10, 10, 100],
    [30, 30, 30, 100],
    [1, 1, 16, 6],
    [1, 1, 24, 4],
    [2, 1, 20, 9],
  ])('exact Trivia C=%s M=%s Q=%s', (correct, maxCombo, questions, xp) => {
    expect(
      normalXp({ gameId: 'TRIVIA_RUSH', correct, maxCombo, questions }),
    ).toBe(xp);
  });
  it.each([
    ['VICTORIA', 100],
    ['EMPATE', 90],
    ['DERROTA', 80],
  ] as const)('Ghost full performance %s', (outcome, xp) => {
    const facts = {
      gameId: 'GHOST_DUEL' as const,
      correct: 10,
      questions: 10,
      outcome,
      distinctMode: true,
      ghostFixedAtStart: true,
      compatibleConfiguration: true,
    };
    expect(normalXp({ ...facts, ghostId: 'fixed' })).toBe(xp);
    expect(() => normalXp({ ...facts, ghostId: null })).toThrow(
      'GHOST_RESULT_WITHOUT_REFERENCE',
    );
  });
  it.each(['VICTORIA', 'EMPATE', 'DERROTA'] as const)(
    'rejects fictitious %s without a ghost',
    (outcome) => {
      expect(() =>
        normalXp({
          gameId: 'GHOST_DUEL',
          correct: 10,
          questions: 10,
          outcome,
          ghostId: null,
          distinctMode: true,
          ghostFixedAtStart: true,
          compatibleConfiguration: true,
        }),
      ).toThrow('GHOST_RESULT_WITHOUT_REFERENCE');
    },
  );
  it.each([undefined, 'INVALID', 0])(
    'rejects malformed outcome %s for a real ghost',
    (outcome) => {
      expect(() =>
        normalXp({
          gameId: 'GHOST_DUEL',
          correct: 10,
          questions: 10,
          outcome,
          ghostId: 'fixed',
          distinctMode: true,
          ghostFixedAtStart: true,
          compatibleConfiguration: true,
        } as any),
      ).toThrow();
    },
  );
});
