/** Pure V1 economy. Never accepts XP calculated by a client. */
export const XP_RULES_VERSION = 1 as const;
export const GAME_IDS = [
  'TRIVIA_RUSH',
  'GHOST_DUEL',
  'SUMMIT',
  'TUG_OF_WAR',
  'GUARDIAN',
  'MEMORY_MATCH',
  'BATTLES',
  'STAR_RESCUE',
] as const;
export type GameId = (typeof GAME_IDS)[number];
export type Outcome = 'VICTORIA' | 'EMPATE' | 'DERROTA';
export type BattleMode =
  | 'CARRERA_FANTASMA'
  | 'DUELO_RELAMPAGO'
  | 'SUPERVIVENCIA';
export class CompetitiveError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function requireEvidence(
  condition: unknown,
  code = 'INVALID_EVIDENCE',
): asserts condition {
  if (!condition) throw new CompetitiveError(code);
}
export function integer(
  value: number,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): void {
  requireEvidence(Number.isSafeInteger(value) && value >= min && value <= max);
}
export function gameId(value: string): asserts value is GameId {
  requireEvidence(GAME_IDS.includes(value as GameId), 'UNKNOWN_GAME');
}
/** Half-up for decimal inputs; rule formulas use the exact rational variant below. */
export function roundHalfUp(value: number): number {
  requireEvidence(
    Number.isFinite(value) &&
      value >= 0 &&
      value <= Number.MAX_SAFE_INTEGER - 1,
  );
  return Math.floor(value + 0.5);
}
export function roundRatio(numerator: number, denominator: number): number {
  integer(numerator);
  integer(denominator, 1);
  return Number(
    (2n * BigInt(numerator) + BigInt(denominator)) / (2n * BigInt(denominator)),
  );
}
function result(value: Outcome): void {
  requireEvidence(['VICTORIA', 'EMPATE', 'DERROTA'].includes(value));
}
function victory(value: boolean): void {
  requireEvidence(typeof value === 'boolean');
}
export function battleQuestions(mode: BattleMode): number {
  requireEvidence(
    ['CARRERA_FANTASMA', 'DUELO_RELAMPAGO', 'SUPERVIVENCIA'].includes(mode),
  );
  return mode === 'SUPERVIVENCIA' ? 10 : 8;
}
export type NormalEvidence =
  | {
      gameId: 'TRIVIA_RUSH';
      correct: number;
      questions: number;
      maxCombo: number;
    }
  | {
      gameId: 'GHOST_DUEL';
      correct: number;
      questions: number;
      outcome: Outcome | null;
      distinctMode: boolean;
      ghostFixedAtStart: boolean;
      ghostId: string | null;
      compatibleConfiguration: boolean;
    }
  | { gameId: 'SUMMIT'; maxHeight: number; victory: boolean }
  | {
      gameId: 'TUG_OF_WAR';
      correct: number;
      presentedRounds: number;
      outcome: Outcome;
    }
  | { gameId: 'GUARDIAN'; correct: number; shields: number; victory: boolean }
  | {
      gameId: 'MEMORY_MATCH';
      pairs: number;
      moves: number;
      hints: number;
      completed: boolean;
    }
  | {
      gameId: 'BATTLES';
      correct: number;
      questions: number;
      mode: BattleMode;
      outcome: Outcome;
    }
  | {
      gameId: 'STAR_RESCUE';
      stars: number;
      constellations: number;
      victory: boolean;
    };

export function normalXp(
  e: NormalEvidence,
  version: number = XP_RULES_VERSION,
): number {
  requireEvidence(version === XP_RULES_VERSION, 'UNSUPPORTED_RULES_VERSION');
  gameId(e.gameId);
  switch (e.gameId) {
    case 'TRIVIA_RUSH':
      integer(e.questions, 10, 30);
      integer(e.correct, 0, e.questions);
      integer(e.maxCombo, 0, e.correct);
      requireEvidence(e.correct === 0 ? e.maxCombo === 0 : e.maxCombo > 0);
      return roundRatio(70 * e.correct + 30 * e.maxCombo, e.questions);
    case 'GHOST_DUEL':
      integer(e.questions, 10, 30);
      integer(e.correct, 0, e.questions);
      requireEvidence(
        e.ghostId !== null || e.outcome === null,
        'GHOST_RESULT_WITHOUT_REFERENCE',
      );
      if (e.outcome !== null) result(e.outcome);
      requireEvidence(
        e.distinctMode === true &&
          e.ghostFixedAtStart === true &&
          e.compatibleConfiguration === true,
        'GHOST_AUTHORITY_REQUIRED',
      );
      requireEvidence(
        e.ghostId === null ||
          (typeof e.ghostId === 'string' && e.ghostId.length > 0),
      );
      requireEvidence(
        e.ghostId === null || e.outcome !== null,
        'GHOST_RESULT_REQUIRED',
      );
      return (
        roundRatio(80 * e.correct, e.questions) +
        (e.ghostId === null
          ? 0
          : { VICTORIA: 20, EMPATE: 10, DERROTA: 0 }[e.outcome!])
      );
    case 'SUMMIT':
      integer(e.maxHeight, 0, 5);
      victory(e.victory);
      requireEvidence(e.victory === (e.maxHeight === 5));
      return 15 * e.maxHeight + 25 * Number(e.victory);
    case 'TUG_OF_WAR':
      integer(e.presentedRounds, 0, 20);
      integer(e.correct, 0, e.presentedRounds);
      result(e.outcome);
      return e.presentedRounds === 0
        ? 0
        : roundRatio(60 * e.correct, e.presentedRounds) +
            { VICTORIA: 40, EMPATE: 20, DERROTA: 0 }[e.outcome];
    case 'GUARDIAN':
      integer(e.correct, 0, 6);
      integer(e.shields, 0, 3);
      victory(e.victory);
      requireEvidence(e.correct + (3 - e.shields) <= 8);
      requireEvidence(
        e.victory
          ? e.correct === 6 && e.shields >= 1
          : e.correct < 6 && e.shields === 0,
      );
      return 10 * e.correct + Number(e.victory) * (10 + 10 * e.shields);
    case 'MEMORY_MATCH':
      requireEvidence([6, 8, 10].includes(e.pairs) && e.completed === true);
      integer(e.moves, e.pairs);
      integer(e.hints);
      integer(e.moves + e.hints, 1);
      return 5 * e.pairs + roundRatio(50 * e.pairs, e.moves + e.hints);
    case 'BATTLES':
      requireEvidence(
        e.questions === battleQuestions(e.mode),
        'INCOMPLETE_COMPETITIVE_BANK',
      );
      integer(e.correct, 0, e.questions);
      result(e.outcome);
      return roundRatio(
        { VICTORIA: 100, EMPATE: 75, DERROTA: 50 }[e.outcome] * e.correct,
        e.questions,
      );
    case 'STAR_RESCUE':
      integer(e.stars, 0, 6);
      integer(e.constellations, 0, 2);
      victory(e.victory);
      requireEvidence(
        e.constellations === Math.floor(e.stars / 3) &&
          e.victory === (e.stars === 6),
      );
      return 10 * e.stars + 10 * e.constellations + 20 * Number(e.victory);
  }
}

export const ABANDONMENT_PENALTY: Readonly<Record<GameId, number>> =
  Object.freeze({
    TRIVIA_RUSH: -10,
    GHOST_DUEL: -10,
    SUMMIT: -10,
    TUG_OF_WAR: -15,
    GUARDIAN: -10,
    MEMORY_MATCH: -10,
    BATTLES: -15,
    STAR_RESCUE: -10,
  });
const day = 24 * 60 * 60 * 1000;
export const RECONNECTION = Object.freeze({
  TRIVIA_RUSH: Object.freeze({
    milliseconds: 20_000,
    kind: 'GRACE',
    clockContinues: true,
  }),
  GHOST_DUEL: Object.freeze({
    milliseconds: 20_000,
    kind: 'GRACE',
    clockContinues: true,
  }),
  TUG_OF_WAR: Object.freeze({
    milliseconds: 30_000,
    kind: 'GRACE',
  }),
  SUMMIT: Object.freeze({ milliseconds: day, kind: 'SESSION' }),
  GUARDIAN: Object.freeze({ milliseconds: day, kind: 'SESSION' }),
  MEMORY_MATCH: Object.freeze({ milliseconds: day, kind: 'SESSION' }),
  BATTLES: Object.freeze({ milliseconds: day, kind: 'ASYNC' }),
  STAR_RESCUE: Object.freeze({ milliseconds: day, kind: 'SESSION' }),
});
export interface AbandonmentWin {
  gameId: 'TUG_OF_WAR' | 'BATTLES';
  correct: number;
  snapshotQuestions: number;
  acceptedAnswers: number;
  mode?: BattleMode;
  activeCompetitiveMatch: boolean;
  validParticipants: boolean;
  definitiveAbandonment: boolean;
  sufficientEvidence: boolean;
  bothAbsent: boolean;
}
export function abandonmentWinXp(e: AbandonmentWin): number {
  requireEvidence(e.gameId === 'TUG_OF_WAR' || e.gameId === 'BATTLES');
  requireEvidence(
    e.activeCompetitiveMatch === true &&
      e.validParticipants === true &&
      e.definitiveAbandonment === true &&
      typeof e.bothAbsent === 'boolean',
  );
  if (e.gameId === 'BATTLES')
    requireEvidence(
      e.snapshotQuestions === battleQuestions(e.mode!),
      'INCOMPLETE_COMPETITIVE_BANK',
    );
  else integer(e.snapshotQuestions, 4, 20);
  integer(e.acceptedAnswers, 0, e.snapshotQuestions);
  integer(e.correct, 0, e.acceptedAnswers);
  if (e.bothAbsent) return 0;
  requireEvidence(e.sufficientEvidence === true, 'PRESENCE_REQUIRED');
  return e.acceptedAnswers === 0
    ? 0
    : Math.min(80, roundRatio(60 * e.correct, e.snapshotQuestions) + 20);
}
export function applyDelta(balance: number, nominal: number) {
  integer(balance, 0, 2_147_483_647);
  integer(nominal, -2_147_483_647, 2_147_483_647);
  const applied = Math.max(nominal, -balance) || 0; // Canonical integer zero, never JS -0.
  const after = balance + applied;
  integer(after, 0, 2_147_483_647);
  return { before: balance, nominal, applied, after };
}
