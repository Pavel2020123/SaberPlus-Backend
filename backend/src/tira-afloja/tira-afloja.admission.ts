import { Prisma } from '@prisma/client';
import { requireEvidence } from '../competitive/competitive.rules';

/** Admission only, NOT verification or XP activation. Never read a client flag. */
export function tugAdmissionDecision() {
  const enabled = process.env.COMPETITIVE_TUG_ENABLED === 'true';
  return {
    competitiveAdmissionVersion: 1,
    competitiveRulesVersion: enabled ? 1 : null,
    competitivePolicy: {
      policyVersion: 1,
      flag: 'COMPETITIVE_TUG_ENABLED',
      enabled,
    } satisfies Prisma.InputJsonObject,
  };
}

/** Legacy and explicitly non-admitted searches share the non-competitive queue.
 * Existing admitted matches keep their classification when flags change. */
export function tugAdmissionQueue(
  admitted: boolean,
): Prisma.PartidaTiraAflojaWhereInput {
  return admitted
    ? { competitiveAdmissionVersion: 1, competitiveRulesVersion: 1 }
    : { competitiveRulesVersion: null };
}

/** Private admission evidence only; an ADMITTED result is NOT sports verification. */
export function readTugAdmission(row: {
  competitiveAdmissionVersion: number | null;
  competitiveRulesVersion: number | null;
  competitivePolicy: Prisma.JsonValue;
  competitiveAdmissionAt: Date | null;
  competitiveOriginalAId: string | null;
  competitiveOriginalBId: string | null;
  jugadorAId: string;
  jugadorBId: string | null;
}): 'NOT_ADMITTED' | 'ADMITTED' {
  const error = 'TUG_ADMISSION_EVIDENCE_INSUFFICIENT';
  if (row.competitiveAdmissionVersion === null) {
    requireEvidence(
      row.competitiveRulesVersion === null &&
        row.competitivePolicy === null &&
        row.competitiveAdmissionAt === null &&
        row.competitiveOriginalAId === null &&
        row.competitiveOriginalBId === null,
      error,
    );
    return 'NOT_ADMITTED';
  }
  const p = row.competitivePolicy;
  requireEvidence(
    row.competitiveAdmissionVersion === 1 &&
      p &&
      typeof p === 'object' &&
      !Array.isArray(p),
    error,
  );
  requireEvidence(
    Object.keys(p).sort().join(',') === 'enabled,flag,policyVersion' &&
      p.policyVersion === 1 &&
      p.flag === 'COMPETITIVE_TUG_ENABLED' &&
      typeof p.enabled === 'boolean' &&
      row.competitiveRulesVersion === (p.enabled ? 1 : null) &&
      row.competitiveAdmissionAt instanceof Date &&
      Number.isFinite(row.competitiveAdmissionAt.getTime()) &&
      row.competitiveOriginalAId === row.jugadorAId &&
      row.competitiveOriginalBId === row.jugadorBId,
    error,
  );
  return p.enabled ? 'ADMITTED' : 'NOT_ADMITTED';
}
