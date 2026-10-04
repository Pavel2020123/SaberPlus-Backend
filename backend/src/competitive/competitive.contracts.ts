import { Inject, Injectable } from '@nestjs/common';
import { FuenteXpCompetitivo, Prisma } from '@prisma/client';
import {
  AbandonmentWin,
  GameId,
  NormalEvidence,
  requireEvidence,
} from './competitive.rules';

export interface CompetitiveSource {
  sourceType: FuenteXpCompetitivo;
  sourceId: string;
  participantId: string;
}
/** Internal, trusted adapter output, never an HTTP DTO. Facts must be reconstructed
 * from persisted server evidence inside the supplied transaction. */
export interface VerifiedTerminal {
  source: CompetitiveSource;
  gameId: GameId;
  startedAt: Date;
  terminalAt: Date;
  competitiveOnline: boolean;
  validParticipant: boolean;
  evidenceHash: string;
  resolution:
    | { kind: 'RESULTADO'; facts: NormalEvidence }
    | { kind: 'ABANDONO'; definitive: boolean }
    | { kind: 'VICTORIA_POR_ABANDONO'; facts: AbandonmentWin };
}
/** Exact pair-only contract. NOT accepted by the Date-based settlement API.
 * Epoch microseconds are decimal strings, never client timestamps or JS Date.
 * A3–A5 evidence only: approved simultaneous zero policy, no ledger write or
 * active verifier implied. */
export interface VerifiedTugPairTerminal {
  contract: 'TUG_PAIR_V1';
  xpRulesVersion: 1;
  sourceType: 'TUG_MATCH';
  sourceId: string;
  participants: [string, string];
  admissionUs: string;
  terminalUs: string;
  activation: {
    atUs: string;
    sportsVersion: number;
    presenceId: string;
  } | null;
  classification:
    | 'NORMAL'
    | 'GRACE_ABANDONMENT'
    | 'EXPLICIT_PRE_ACTIVE'
    | 'EXPLICIT_ACTIVE'
    | 'SIMULTANEOUS_CANCELLED'
    | 'GLOBAL_EXPIRED';
  sportingWinner: string | null;
  /** Confirmed individual evidence, including both equal graces; this list is
   * NOT a list of ledger penalties. */
  abandonments: {
    participantId: string;
    reason: 'GRACE' | 'EXPLICIT';
    effectiveUs: string;
    graceStartUs: string | null;
  }[];
  evidenceHash: string;
  settlement: 'NOT_INTEGRATED';
  resolutions: [VerifiedTugResolution, VerifiedTugResolution];
}
export type VerifiedTugResolution =
  | {
      kind: 'NORMAL';
      correct: number;
      actions: number;
      presentedRounds: number;
      outcome: 'VICTORIA' | 'EMPATE' | 'DERROTA';
    }
  | {
      kind: 'NEUTRAL';
      reason: 'PRE_ACTIVE' | 'GLOBAL_EXPIRED' | 'NO_WINNER';
    }
  | {
      kind: 'NEUTRAL';
      reason: 'SIMULTANEOUS';
      positiveXp: 0;
      nominalPenalty: 0;
    }
  | {
      kind: 'PENALIZABLE_ABANDONMENT';
      reason: 'GRACE' | 'EXPLICIT';
      effectiveUs: string;
      graceStartUs: string | null;
    }
  | {
      kind: 'ABANDONMENT_BENEFICIARY';
      correct: number;
      actions: number;
      qPartida: number;
      eligibility:
        | 'SUFFICIENT'
        | 'NO_ACTIONS'
        | 'OWN_GRACE'
        | 'PRESENCE_UNPROVEN';
      presence: TugBeneficiaryPresence;
    };
export interface TugBeneficiaryPresence {
  rivalDisconnectedUs: string | null;
  ownGraceStartUs: string | null;
  openAtTerminal: boolean;
  /** Persisted authenticated interval covering the exact terminal, not today's
   * socket aggregate. Null means no such interval has been demonstrated. */
  openConnectionAtTerminal: {
    connectionId: string;
    eventId: string;
    authenticatedUs: string;
    leaseUntilUs: string;
    authUntilUs: string | null;
  } | null;
  authenticatedEvidence: {
    kind: 'CONNECTED' | 'RENEWED' | 'ACCEPTED_ANSWER';
    id: string;
    atUs: string;
  } | null;
}
/** Separate preparatory interface deliberately has no loadTerminal/settle hook. */
export interface PreciseCompetitivePairEvidence {
  loadPreciseLockedPair(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<VerifiedTugPairTerminal>;
}
export interface CompetitiveVerifier {
  readonly sourceType: FuenteXpCompetitivo;
  /** Verify ownership, immutable snapshot, online origin, terminal state, actions,
   * bank completeness and durable absence/presence; reject missing evidence.
   * Serialize against source mutations; returning booleans from a client is invalid. */
  loadTerminal(
    tx: Prisma.TransactionClient,
    source: CompetitiveSource,
  ): Promise<VerifiedTerminal>;
}
export const COMPETITIVE_VERIFIERS = Symbol('COMPETITIVE_VERIFIERS');
@Injectable()
export class CompetitiveVerifierRegistry {
  private readonly verifiers = new Map<
    FuenteXpCompetitivo,
    CompetitiveVerifier
  >();
  constructor(@Inject(COMPETITIVE_VERIFIERS) verifiers: CompetitiveVerifier[]) {
    for (const verifier of verifiers) {
      requireEvidence(
        !this.verifiers.has(verifier.sourceType),
        'DUPLICATE_VERIFIER',
      );
      this.verifiers.set(verifier.sourceType, verifier);
    }
  }
  get(sourceType: FuenteXpCompetitivo): CompetitiveVerifier {
    const verifier = this.verifiers.get(sourceType);
    requireEvidence(verifier, 'SOURCE_NOT_INTEGRATED');
    return verifier;
  }
}
export const SOURCE_FOR_GAME: Readonly<Record<GameId, FuenteXpCompetitivo>> =
  Object.freeze({
    TRIVIA_RUSH: 'TRIVIA_ATTEMPT',
    GHOST_DUEL: 'TRIVIA_ATTEMPT',
    SUMMIT: 'SUMMIT_ATTEMPT',
    TUG_OF_WAR: 'TUG_MATCH',
    GUARDIAN: 'GUARDIAN_ATTEMPT',
    MEMORY_MATCH: 'MEMORY_ATTEMPT',
    BATTLES: 'BATTLE',
    STAR_RESCUE: 'STAR_RESCUE_ATTEMPT',
  });
