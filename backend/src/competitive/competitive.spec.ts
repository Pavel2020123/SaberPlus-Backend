import {
  ABANDONMENT_PENALTY,
  abandonmentWinXp,
  AbandonmentWin,
  applyDelta,
  GAME_IDS,
  normalXp,
  NormalEvidence,
  RECONNECTION,
  roundHalfUp,
  roundRatio,
} from './competitive.rules';
import {
  competitiveSeason,
  definitiveAbsence,
  sufficientTugPresence,
} from './competitive.policy';
import { CompetitiveVerifierRegistry } from './competitive.contracts';
import { CompetitiveService } from './competitive.service';
import { canonicalSourceId, SOURCE_ID_CONTRACT } from './competitive.source';

describe('competitive source identity and correction boundary', () => {
  it.each(Object.keys(SOURCE_ID_CONTRACT))(
    '%s canonicalizes UUID case and rejects alternative spellings',
    (type) => {
      const id = 'abcdef12-1234-4234-8234-123456789abc';
      expect(canonicalSourceId(type as any, id.toUpperCase())).toBe(id);
      for (const bad of [
        id.replaceAll('-', ''),
        `{${id}}`,
        ` ${id}`,
        'opaque-id',
      ]) {
        expect(() => canonicalSourceId(type as any, bad)).toThrow(
          'INVALID_SOURCE_ID',
        );
      }
    },
  );
  it('does not invent a source ID contract for Memory', () => {
    expect(() =>
      canonicalSourceId('MEMORY_ATTEMPT', 'local-memory-id'),
    ).toThrow('MEMORY_COMPETITIVE_DISABLED');
  });
  it('a floor makes subtraction different from invalidation replay; runtime invalidation is rejected', async () => {
    const replay = (deltas: number[]) =>
      deltas.reduce((balance, delta) => applyDelta(balance, delta).after, 0);
    expect(replay([40, -50, 20])).toBe(20);
    expect(replay([40, -50, 20, -40])).toBe(0);
    expect(replay([-50, 20])).toBe(20);
    const prisma = { $transaction: jest.fn() };
    const service = new CompetitiveService(
      prisma as any,
      new CompetitiveVerifierRegistry([]),
    );
    const id = 'abcdef12-1234-4234-8234-123456789abc';
    await expect(
      service.correct({
        operationId: id,
        actorId: id,
        originalEventId: id,
        reason: 'Not replay',
        nominalDelta: -40,
        kind: 'INVALIDACION',
      } as any),
    ).rejects.toThrow('UNSUPPORTED_CORRECTION_KIND');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('competitive V1 pure rules', () => {
  it.each([
    [12.49, 12],
    [12.5, 13],
    [12.51, 13],
    [0, 0],
    [0.5, 1],
  ])('half-up %s -> %s', (n, expected) =>
    expect(roundHalfUp(n)).toBe(expected),
  );
  it.each([NaN, Infinity, -1])('rejects invalid rounding %s', (n) =>
    expect(() => roundHalfUp(n)).toThrow(),
  );
  it('uses exact rational half-up', () => {
    expect(roundRatio(25, 2)).toBe(13);
    expect(roundRatio(1, 3)).toBe(0);
    expect(() => roundRatio(1, 0)).toThrow();
  });
  const perfect: NormalEvidence[] = [
    { gameId: 'TRIVIA_RUSH', correct: 10, questions: 10, maxCombo: 10 },
    {
      gameId: 'GHOST_DUEL',
      correct: 10,
      questions: 10,
      outcome: 'VICTORIA',
      distinctMode: true,
      ghostFixedAtStart: true,
      compatibleConfiguration: true,
      ghostId: 'fixed-reference',
    },
    { gameId: 'SUMMIT', maxHeight: 5, victory: true },
    {
      gameId: 'TUG_OF_WAR',
      correct: 10,
      presentedRounds: 10,
      outcome: 'VICTORIA',
    },
    { gameId: 'GUARDIAN', correct: 6, shields: 3, victory: true },
    { gameId: 'MEMORY_MATCH', pairs: 10, moves: 10, hints: 0, completed: true },
    {
      gameId: 'BATTLES',
      correct: 8,
      questions: 8,
      mode: 'CARRERA_FANTASMA',
      outcome: 'VICTORIA',
    },
    { gameId: 'STAR_RESCUE', stars: 6, constellations: 2, victory: true },
  ];
  it.each(perfect)('perfect $gameId = 100, deterministic', (evidence) => {
    expect(normalXp(evidence)).toBe(100);
    expect(normalXp(evidence)).toBe(normalXp(evidence));
  });
  it('Trivia combo is bounded; insufficient or malformed bank fails closed', () => {
    expect(
      normalXp({
        gameId: 'TRIVIA_RUSH',
        correct: 5,
        questions: 10,
        maxCombo: 2,
      }),
    ).toBe(41);
    for (const questions of [0, 9, 31, 10.5, NaN])
      expect(() =>
        normalXp({ gameId: 'TRIVIA_RUSH', correct: 0, questions, maxCombo: 0 }),
      ).toThrow();
    expect(() =>
      normalXp({
        gameId: 'TRIVIA_RUSH',
        correct: 3,
        questions: 10,
        maxCombo: 4,
      }),
    ).toThrow();
  });
  it('Ghost first attempt earns only performance; authority is required', () => {
    const ghost = perfect[1] as Extract<
      NormalEvidence,
      { gameId: 'GHOST_DUEL' }
    >;
    expect(normalXp({ ...ghost, ghostId: null, outcome: null })).toBe(80);
    expect(normalXp({ ...ghost, outcome: 'EMPATE' })).toBe(90);
    for (const field of [
      'distinctMode',
      'ghostFixedAtStart',
      'compatibleConfiguration',
    ])
      expect(() => normalXp({ ...ghost, [field]: false })).toThrow(
        'GHOST_AUTHORITY_REQUIRED',
      );
  });
  it('Summit uses maximum height, no unused-question or speed bonus', () => {
    expect(normalXp({ gameId: 'SUMMIT', maxHeight: 3, victory: false })).toBe(
      45,
    );
    expect(() =>
      normalXp({ gameId: 'SUMMIT', maxHeight: 4, victory: true }),
    ).toThrow();
  });
  it('Tug zero presented rounds = zero; unanswered rounds reduce precision', () => {
    expect(
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 0,
        presentedRounds: 0,
        outcome: 'VICTORIA',
      }),
    ).toBe(0);
    expect(
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 2,
        presentedRounds: 8,
        outcome: 'EMPATE',
      }),
    ).toBe(35);
    expect(
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 4,
        presentedRounds: 16,
        outcome: 'EMPATE',
      }),
    ).toBe(35);
    expect(() =>
      normalXp({
        gameId: 'TUG_OF_WAR',
        correct: 2,
        presentedRounds: 1,
        outcome: 'DERROTA',
      }),
    ).toThrow();
  });
  it('Guardian respects 6 correct / 3 shields / 8 question engine', () => {
    expect(
      normalXp({ gameId: 'GUARDIAN', correct: 6, shields: 1, victory: true }),
    ).toBe(80);
    expect(
      normalXp({ gameId: 'GUARDIAN', correct: 5, shields: 0, victory: false }),
    ).toBe(50);
    expect(() =>
      normalXp({ gameId: 'GUARDIAN', correct: 6, shields: 0, victory: true }),
    ).toThrow();
  });
  it.each([
    [6, 80],
    [8, 90],
    [10, 100],
  ])(
    'future Memory %s pairs = %s, hints reduce efficiency',
    (pairs, expected) => {
      const facts = {
        gameId: 'MEMORY_MATCH' as const,
        pairs,
        moves: pairs,
        hints: 0,
        completed: true,
      };
      expect(normalXp(facts)).toBe(expected);
      expect(normalXp({ ...facts, hints: 1 })).toBeLessThan(expected);
      expect(() => normalXp({ ...facts, moves: pairs - 1 })).toThrow();
    },
  );
  it.each(['CARRERA_FANTASMA', 'DUELO_RELAMPAGO', 'SUPERVIVENCIA'] as const)(
    'Battles %s requires full bank; zero correct = zero',
    (mode) => {
      const questions = mode === 'SUPERVIVENCIA' ? 10 : 8;
      expect(
        normalXp({
          gameId: 'BATTLES',
          mode,
          questions,
          correct: 0,
          outcome: 'VICTORIA',
        }),
      ).toBe(0);
      expect(
        normalXp({
          gameId: 'BATTLES',
          mode,
          questions,
          correct: questions,
          outcome: 'EMPATE',
        }),
      ).toBe(75);
      expect(
        normalXp({
          gameId: 'BATTLES',
          mode,
          questions,
          correct: questions,
          outcome: 'DERROTA',
        }),
      ).toBe(50);
      expect(() =>
        normalXp({
          gameId: 'BATTLES',
          mode,
          questions: questions - 1,
          correct: 1,
          outcome: 'VICTORIA',
        }),
      ).toThrow('INCOMPLETE_COMPETITIVE_BANK');
    },
  );
  it('Rescue derives constellations from verified stars', () => {
    expect(
      normalXp({
        gameId: 'STAR_RESCUE',
        stars: 3,
        constellations: 1,
        victory: false,
      }),
    ).toBe(40);
    expect(() =>
      normalXp({
        gameId: 'STAR_RESCUE',
        stars: 2,
        constellations: 1,
        victory: false,
      }),
    ).toThrow();
  });
  it('unsupported versions and games are rejected', () => {
    expect(() => normalXp(perfect[0], 2)).toThrow('UNSUPPORTED_RULES_VERSION');
    expect(() => normalXp({ gameId: 'INSTITUTION' } as any)).toThrow(
      'UNKNOWN_GAME',
    );
  });
  it.each(GAME_IDS)('nominal abandonment %s and zero floor', (game) => {
    const penalty = game === 'TUG_OF_WAR' || game === 'BATTLES' ? -15 : -10;
    expect(ABANDONMENT_PENALTY[game]).toBe(penalty);
    expect(applyDelta(6, penalty)).toEqual({
      before: 6,
      nominal: penalty,
      applied: -6,
      after: 0,
    });
    expect(applyDelta(0, penalty).applied).toBe(0);
  });
  it('rejects balances outside PostgreSQL integer range', () => {
    expect(() => applyDelta(-1, 0)).toThrow();
    expect(() => applyDelta(2_147_483_647, 1)).toThrow();
  });
  const abandon: AbandonmentWin = {
    gameId: 'TUG_OF_WAR',
    correct: 1,
    acceptedAnswers: 1,
    snapshotQuestions: 20,
    activeCompetitiveMatch: true,
    validParticipants: true,
    definitiveAbandonment: true,
    sufficientEvidence: true,
    bothAbsent: false,
  };
  it('Tug abandonment uses full snapshot, not one presented round', () =>
    expect(abandonmentWinXp(abandon)).toBe(23));
  it('no action = zero, an accepted incorrect answer is participation', () => {
    expect(
      abandonmentWinXp({ ...abandon, acceptedAnswers: 0, correct: 0 }),
    ).toBe(0);
    expect(abandonmentWinXp({ ...abandon, correct: 0 })).toBe(20);
  });
  it('Battles abandonment uses full 8/10 and maximum 80', () => {
    expect(
      abandonmentWinXp({
        ...abandon,
        gameId: 'BATTLES',
        mode: 'DUELO_RELAMPAGO',
        snapshotQuestions: 8,
      }),
    ).toBe(28);
    expect(
      abandonmentWinXp({
        ...abandon,
        gameId: 'BATTLES',
        mode: 'SUPERVIVENCIA',
        snapshotQuestions: 10,
        correct: 10,
        acceptedAnswers: 10,
      }),
    ).toBe(80);
    expect(
      abandonmentWinXp({ ...abandon, correct: 20, acceptedAnswers: 20 }),
    ).toBe(80);
  });
  it('both absent = zero; missing presence never pays', () => {
    expect(
      abandonmentWinXp({
        ...abandon,
        bothAbsent: true,
        sufficientEvidence: false,
      }),
    ).toBe(0);
    expect(() =>
      abandonmentWinXp({ ...abandon, sufficientEvidence: false }),
    ).toThrow('PRESENCE_REQUIRED');
  });
  it('Memory and unintegrated sources cannot reach a DB writer', async () => {
    const prisma = { $transaction: jest.fn() };
    const service = new CompetitiveService(
      prisma as any,
      new CompetitiveVerifierRegistry([]),
    );
    const ref = {
      sourceId: 'abcdef12-1234-4234-8234-123456789abc',
      participantId: '11111111-1111-4111-8111-111111111111',
    };
    await expect(
      service.settle({ ...ref, sourceType: 'MEMORY_ATTEMPT' }),
    ).rejects.toThrow('MEMORY_COMPETITIVE_DISABLED');
    await expect(
      service.settle({ ...ref, sourceType: 'TRIVIA_ATTEMPT' }),
    ).rejects.toThrow('SOURCE_NOT_INTEGRATED');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('competitive calendar and reconnect policy', () => {
  it.each([
    ['2026-01-01T04:59:59.999Z', 2025],
    ['2026-01-01T05:00:00.000Z', 2026],
    ['2027-01-01T04:59:59.999Z', 2026],
    ['2027-01-01T05:00:00.000Z', 2027],
  ])('Bogota boundary %s = %s', (date, year) =>
    expect(competitiveSeason(new Date(date))).toBe(year),
  );
  it('invalid server date is rejected', () =>
    expect(() => competitiveSeason(new Date(NaN))).toThrow());
  it.each(GAME_IDS)(
    'policy %s is centralized and not an immediate disconnect penalty',
    (gameId) => {
      const zero = new Date('2026-09-30T00:00:00Z');
      const duration = RECONNECTION[gameId].milliseconds;
      expect(duration).toBe(
        gameId === 'TUG_OF_WAR'
          ? 30_000
          : ['TRIVIA_RUSH', 'GHOST_DUEL'].includes(gameId)
            ? 20_000
            : 86_400_000,
      );
      const evidence = {
        gameId,
        disconnectedAt: zero,
        sessionExpiresAt: new Date(+zero + duration),
        explicitAbandonment: false,
      };
      expect(
        definitiveAbsence({ ...evidence, now: new Date(+zero + duration - 1) }),
      ).toBe(false);
      expect(
        definitiveAbsence({ ...evidence, now: new Date(+zero + duration) }),
      ).toBe(true);
    },
  );
  it('Tug presence must be authenticated after the rival disconnects and outside own grace', () => {
    const evidence = {
      evaluatedAt: new Date(30_000),
      rivalDisconnectedAt: new Date(0),
      remainingInGrace: false,
      lastAuthenticatedPresenceAt: new Date(1),
    };
    expect(sufficientTugPresence(evidence)).toBe(true);
    expect(sufficientTugPresence({ ...evidence, remainingInGrace: true })).toBe(
      false,
    );
    expect(
      sufficientTugPresence({
        ...evidence,
        lastAuthenticatedPresenceAt: new Date(0),
      }),
    ).toBe(false);
    expect(
      sufficientTugPresence({ ...evidence, evaluatedAt: new Date(29_999) }),
    ).toBe(false);
  });
});
