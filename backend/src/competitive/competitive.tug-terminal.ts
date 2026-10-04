import {
  TugBeneficiaryPresence,
  VerifiedTugPairTerminal,
  VerifiedTugResolution,
} from './competitive.contracts';
import type { TugReplayEvidence } from './competitive.tug-replay';
import { requireEvidence } from './competitive.rules';
import { competitiveHash } from './competitive.service';

const check = (ok: unknown, code: string) =>
  requireEvidence(ok, `TUG_CONTRACT_${code}`);
const us = (value: string) => {
  check(typeof value === 'string' && /^\d+$/.test(value), 'TIME');
  return BigInt(value);
};

/** Internal projection of an already validated sports + presence replay.
 * Pure, exact, pair-wide and unregistered. Never computes or posts XP.
 * The old VerifiedTerminal remains unchanged for other verified games. */
export function verifiedTugPair(
  evidence: TugReplayEvidence,
  proof: {
    sourceId: string;
    temporalVersion: number | null;
    admissionUs: string;
    observedUs: string;
    activation: VerifiedTugPairTerminal['activation'];
    graceStarts: Record<string, string>;
    beneficiaryPresence: Record<string, TugBeneficiaryPresence>;
  },
): VerifiedTugPairTerminal {
  check(proof.temporalVersion === 1, 'TEMPORAL_VERSION_REQUIRED');
  const { participants, classification, winner, terminalUs } = evidence;
  const terminal = us(terminalUs);
  check(
    participants.length === 2 &&
      participants[0] !== participants[1] &&
      (winner === null || participants.includes(winner)),
    'PARTICIPANTS',
  );
  check(
    us(proof.admissionUs) <= terminal && terminal <= us(proof.observedUs),
    'TIMELINE',
  );
  const active = evidence.phase === 'ACTIVE';
  check(active === (proof.activation !== null), 'PHASE');
  if (proof.activation) {
    check(
      us(proof.activation.atUs) >= us(proof.admissionUs) &&
        us(proof.activation.atUs) <= terminal &&
        Number.isInteger(proof.activation.sportsVersion) &&
        proof.activation.sportsVersion > 0,
      'ACTIVATION',
    );
    us(proof.activation.presenceId);
    check(
      Number.isInteger(evidence.qPartida) &&
        evidence.qPartida! >= 4 &&
        evidence.qPartida! <= 20 &&
        evidence.presentedRounds <= evidence.qPartida!,
      'Q',
    );
  }
  check(
    evidence.actions.length === 2 &&
      evidence.correct.length === 2 &&
      Number.isInteger(evidence.presentedRounds) &&
      evidence.presentedRounds >= 0 &&
      evidence.presentedRounds <= 20 &&
      evidence.actions.every(
        (a, i) =>
          Number.isInteger(a) &&
          a >= 0 &&
          a <= evidence.presentedRounds &&
          Number.isInteger(evidence.correct[i]) &&
          evidence.correct[i] >= 0 &&
          evidence.correct[i] <= a,
      ),
    'COUNTS',
  );
  const abandoned = evidence.abandonment;
  check(
    new Set(abandoned.map((a) => a.userId)).size === abandoned.length &&
      abandoned.every(
        (a) => participants.includes(a.userId) && a.effectiveUs === terminalUs,
      ),
    'ABANDONMENT',
  );
  let resolutions: VerifiedTugResolution[];
  if (classification === 'NORMAL') {
    check(active && abandoned.length === 0, 'NORMAL_PHASE');
    resolutions = participants.map((user, i) => ({
      kind: 'NORMAL',
      correct: evidence.correct[i],
      actions: evidence.actions[i],
      presentedRounds: evidence.presentedRounds,
      outcome:
        winner === null ? 'EMPATE' : user === winner ? 'VICTORIA' : 'DERROTA',
    }));
  } else if (classification === 'EXPLICIT_PRE_ACTIVE') {
    check(
      !active &&
        abandoned.length === 1 &&
        abandoned[0].reason === 'EXPLICIT' &&
        evidence.presentedRounds === 0 &&
        evidence.actions.every((a) => a === 0),
      'PRE_ACTIVE',
    );
    resolutions = participants.map(() => ({
      kind: 'NEUTRAL',
      reason: 'PRE_ACTIVE',
    }));
  } else if (classification === 'GLOBAL_EXPIRED') {
    check(active && winner === null && abandoned.length === 0, 'GLOBAL');
    resolutions = participants.map(() => ({
      kind: 'NEUTRAL',
      reason: 'GLOBAL_EXPIRED',
    }));
  } else {
    check(active && proof.activation, 'ABANDONMENT_PHASE');
    const reason = classification === 'EXPLICIT_ACTIVE' ? 'EXPLICIT' : 'GRACE';
    check(
      abandoned.every((a) => a.reason === reason),
      'ABANDONMENT_REASON',
    );
    if (reason === 'GRACE') {
      for (const a of abandoned) {
        const start = proof.graceStarts[a.userId];
        check(
          start &&
            us(start) >= us(proof.activation!.atUs) &&
            us(start) + 30000000n === terminal,
          'GRACE_PHASE',
        );
      }
    }
    if (classification === 'SIMULTANEOUS_CANCELLED') {
      check(winner === null && abandoned.length === 2, 'SIMULTANEOUS');
      resolutions = participants.map(() => ({
        kind: 'NEUTRAL',
        reason: 'SIMULTANEOUS',
        positiveXp: 0,
        nominalPenalty: 0,
      }));
    } else {
      check(
        (classification === 'GRACE_ABANDONMENT' ||
          classification === 'EXPLICIT_ACTIVE') &&
          abandoned.length === 1 &&
          winner !== abandoned[0].userId &&
          (reason !== 'GRACE' || winner !== null),
        'SINGLE_ABANDONMENT',
      );
      resolutions = participants.map((user, i): VerifiedTugResolution => {
        if (user === abandoned[0].userId)
          return {
            kind: 'PENALIZABLE_ABANDONMENT',
            reason,
            effectiveUs: terminalUs,
            graceStartUs: reason === 'GRACE' ? proof.graceStarts[user] : null,
          };
        if (winner !== user) return { kind: 'NEUTRAL', reason: 'NO_WINNER' };
        check(
          Number.isInteger(evidence.qPartida) &&
            evidence.qPartida! >= 4 &&
            evidence.qPartida! <= 20 &&
            evidence.presentedRounds <= evidence.qPartida!,
          'Q',
        );
        const presence = proof.beneficiaryPresence[user];
        check(
          presence && typeof presence.openAtTerminal === 'boolean',
          'PRESENCE',
        );
        const open = presence.openConnectionAtTerminal;
        check(
          open !== undefined && presence.openAtTerminal === (open !== null),
          'OPEN_PROOF',
        );
        if (open) {
          const authenticated = us(open.authenticatedUs),
            lease = us(open.leaseUntilUs);
          const maximumLease = authenticated + 45000000n;
          const expectedLease =
            open.authUntilUs === null || maximumLease < us(open.authUntilUs)
              ? maximumLease
              : us(open.authUntilUs);
          check(
            open.connectionId &&
              us(open.eventId) > 0n &&
              authenticated <= terminal &&
              terminal < lease &&
              lease === expectedLease,
            'OPEN_INTERVAL',
          );
        }
        if (presence.ownGraceStartUs !== null)
          check(us(presence.ownGraceStartUs) <= terminal, 'OWN_GRACE');
        const auth = presence.authenticatedEvidence;
        if (auth)
          check(
            us(auth.atUs) <= terminal &&
              ['CONNECTED', 'RENEWED', 'ACCEPTED_ANSWER'].includes(auth.kind) &&
              auth.id,
            'AUTHENTICATED_EVIDENCE',
          );
        if (reason === 'GRACE')
          check(
            presence.rivalDisconnectedUs ===
              proof.graceStarts[abandoned[0].userId],
            'RIVAL_DISCONNECT',
          );
        const sufficient =
          presence.ownGraceStartUs === null &&
          (reason === 'EXPLICIT'
            ? open !== null
            : auth !== null &&
              us(auth.atUs) > us(presence.rivalDisconnectedUs!));
        return {
          kind: 'ABANDONMENT_BENEFICIARY',
          correct: evidence.correct[i],
          actions: evidence.actions[i],
          qPartida: evidence.qPartida!,
          presence,
          eligibility:
            evidence.actions[i] === 0
              ? 'NO_ACTIONS'
              : presence.ownGraceStartUs !== null
                ? 'OWN_GRACE'
                : sufficient
                  ? 'SUFFICIENT'
                  : 'PRESENCE_UNPROVEN',
        };
      });
    }
  }
  const result = {
    contract: 'TUG_PAIR_V1' as const,
    xpRulesVersion: 1 as const,
    sourceType: 'TUG_MATCH' as const,
    sourceId: proof.sourceId,
    participants,
    admissionUs: proof.admissionUs,
    terminalUs,
    activation: proof.activation,
    classification,
    sportingWinner: winner,
    abandonments: abandoned.map((a) => ({
      participantId: a.userId,
      reason: a.reason as 'GRACE' | 'EXPLICIT',
      effectiveUs: a.effectiveUs,
      graceStartUs: a.reason === 'GRACE' ? proof.graceStarts[a.userId] : null,
    })),
    settlement: 'NOT_INTEGRATED' as const,
    resolutions: resolutions as [VerifiedTugResolution, VerifiedTugResolution],
  };
  // The observation clock is a validity check, not mutable evidence in the hash.
  return {
    ...result,
    evidenceHash: competitiveHash({ replay: evidence.evidenceHash, ...result }),
  };
}
