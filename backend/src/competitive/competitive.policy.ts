import { GameId, RECONNECTION, requireEvidence } from './competitive.rules';

export function validDate(date: Date): void {
  requireEvidence(
    date instanceof Date && Number.isFinite(date.getTime()),
    'INVALID_SERVER_DATE',
  );
}
export function competitiveSeason(terminalAt: Date): number {
  validDate(terminalAt);
  return Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Bogota',
      year: 'numeric',
    }).format(terminalAt),
  );
}
export interface AbsenceEvidence {
  gameId: GameId;
  now: Date;
  sessionExpiresAt: Date;
  disconnectedAt?: Date;
  explicitAbandonment: boolean;
}
export function definitiveAbsence(e: AbsenceEvidence): boolean {
  validDate(e.now);
  validDate(e.sessionExpiresAt);
  requireEvidence(typeof e.explicitAbandonment === 'boolean');
  if (e.explicitAbandonment) return true;
  const policy = RECONNECTION[e.gameId];
  requireEvidence(!!policy, 'UNKNOWN_GAME');
  if (policy.kind !== 'GRACE') return e.now >= e.sessionExpiresAt;
  if (!e.disconnectedAt) return false;
  validDate(e.disconnectedAt);
  return e.now.getTime() >= e.disconnectedAt.getTime() + policy.milliseconds;
}
/** Input must be loaded from durable authenticated server presence, never client timestamps. */
export function sufficientTugPresence(e: {
  evaluatedAt: Date;
  rivalDisconnectedAt: Date;
  remainingInGrace: boolean;
  lastAuthenticatedPresenceAt: Date | null;
}): boolean {
  validDate(e.evaluatedAt);
  validDate(e.rivalDisconnectedAt);
  requireEvidence(typeof e.remainingInGrace === 'boolean');
  if (e.remainingInGrace || !e.lastAuthenticatedPresenceAt) return false;
  validDate(e.lastAuthenticatedPresenceAt);
  return (
    e.evaluatedAt.getTime() >=
      e.rivalDisconnectedAt.getTime() + RECONNECTION.TUG_OF_WAR.milliseconds &&
    e.lastAuthenticatedPresenceAt > e.rivalDisconnectedAt &&
    e.lastAuthenticatedPresenceAt <= e.evaluatedAt
  );
}
