import { FuenteXpCompetitivo } from '@prisma/client';
import { requireEvidence } from './competitive.rules';

/** Audited against schema.prisma. Memory has no authoritative source model yet. */
export const SOURCE_ID_CONTRACT = Object.freeze({
  TRIVIA_ATTEMPT: 'IntentoTriviaRush.id',
  SUMMIT_ATTEMPT: 'IntentoCima.id',
  TUG_MATCH: 'PartidaTiraAfloja.id',
  GUARDIAN_ATTEMPT: 'IntentoGuardian.id',
  BATTLE: 'Batalla.id',
  STAR_RESCUE_ATTEMPT: 'IntentoRescateEstrellas.id',
});

export function canonicalSourceId(
  type: FuenteXpCompetitivo,
  value: string,
): string {
  requireEvidence(type !== 'MEMORY_ATTEMPT', 'MEMORY_COMPETITIVE_DISABLED');
  requireEvidence(
    Object.prototype.hasOwnProperty.call(SOURCE_ID_CONTRACT, type),
    'UNKNOWN_SOURCE',
  );
  // These six existing PKs are @db.Uuid. Accept standard UUID spelling only,
  // normalize case before locking/hashing/loading. PostgreSQL's alternative
  // compact/braced/hyphen placements are rejected, never separate identities.
  requireEvidence(
    typeof value === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      ),
    'INVALID_SOURCE_ID',
  );
  return value.toLowerCase();
}
