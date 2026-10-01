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
