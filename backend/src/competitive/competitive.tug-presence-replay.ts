import { requireEvidence } from './competitive.rules';

interface PresenceConnection {
  id: string;
  matchId: string;
  userId: string;
  connectedUs: string;
  authUs: string | null;
  state: string;
  lastUs: string;
  leaseUs: string;
  closedUs: string | null;
}
interface PresenceEvent {
  id: string;
  matchId: string;
  userId: string;
  connectionId: string | null;
  kind: string;
  atUs: string;
}
interface ConnectionState {
  state: 'OPEN' | 'CLOSED' | 'UNKNOWN' | 'RETIRED';
  last: bigint;
  auth: string | null;
  closed?: bigint;
}
function check(ok: unknown, code: string): asserts ok {
  requireEvidence(ok, `TUG_REPLAY_PRESENCE_${code}`);
}
function record(value: unknown): Record<string, unknown> {
  check(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'ROW',
  );
  return value as Record<string, unknown>;
}
function isConnection(value: unknown): value is PresenceConnection {
  const row = record(value);
  return (
    [
      'id',
      'matchId',
      'userId',
      'connectedUs',
      'state',
      'lastUs',
      'leaseUs',
    ].every((field) => typeof row[field] === 'string') &&
    (row.authUs === null || typeof row.authUs === 'string') &&
    (row.closedUs === null || typeof row.closedUs === 'string')
  );
}
function isEvent(value: unknown): value is PresenceEvent {
  const row = record(value);
  return (
    ['id', 'matchId', 'userId', 'kind', 'atUs'].every(
      (field) => typeof row[field] === 'string',
    ) &&
    (row.connectionId === null || typeof row.connectionId === 'string')
  );
}
const us = (v: unknown) => {
  check(typeof v === 'string' && /^\d+$/.test(v), 'TIME');
  return BigInt(v);
};

/** Read-only history reconstruction. IDs, not truncated dates, order events.
 * UNKNOWN preserves uncertainty; only a final confirmed DISCONNECTED starts
 * grace. No inference from the aggregate, socket absence or sporting winner. */
export function replayTugPresence(
  participants: string[],
  rawConnections: unknown[],
  rawEvents: unknown[],
  terminalUs: string,
  activeRoundStartUs?: string,
  activation?: { atUs: string; presenceId: string },
) {
  const terminal = us(terminalUs);
  // Keep the original objects, including additional immutable fields used in
  // canonical evidence hashes. Validate their shape rather than asserting JSON.
  const connections = rawConnections.map((value) => {
    check(isConnection(value), 'CONNECTION_DATA');
    return value;
  });
  const events = rawEvents.map((value) => {
    check(isEvent(value), 'EVENT_DATA');
    return value;
  });
  const states = new Map<string, ConnectionState>();
  const graces: {
    userId: string;
    start: bigint;
    end: bigint;
    cancelled?: bigint;
  }[] = [];
  const active = new Map<string, (typeof graces)[number]>();
  let previousId = 0n;
  const relevant = events.filter((e) => us(e.atUs) <= terminal);
  // Validate the entire immutable history, including legitimate lease refresh
  // after a retroactively timed sports closure. Hash/proof uses its terminal cut.
  for (const e of events) {
    check(
      us(e.id) > previousId && participants.includes(e.userId),
      'ORDER_OR_OWNER',
    );
    previousId = us(e.id);
    const at = us(e.atUs);
    if (e.kind === 'ABANDONED') {
      check(e.connectionId === null, 'ABANDONED_CONNECTION');
      continue; // Cross-checked against individual terminal records by the caller.
    }
    const c = connections.find((c) => c.id === e.connectionId);
    check(c && c.userId === e.userId && c.matchId === e.matchId, 'CONNECTION');
    const old = states.get(c.id);
    if (e.kind === 'CONNECTED') {
      check(!old && at === us(c.connectedUs), 'CONNECTED');
      check(c.authUs === null || us(c.authUs) > at, 'AUTH_EXPIRED');
      const grace = active.get(e.userId);
      check(!grace || at >= grace.start, 'RETROACTIVE_RECONNECT');
      check(!grace || at < grace.end, 'LATE_RECONNECT');
      if (grace) {
        grace.cancelled = at;
        active.delete(e.userId);
      }
      states.set(c.id, { state: 'OPEN', last: at, auth: c.authUs });
    } else if (e.kind === 'GRACE') {
      check(
        !activation ||
          (at >= us(activation.atUs) && us(e.id) > us(activation.presenceId)),
        'GRACE_BEFORE_ACTIVE',
      );
      check(
        old?.state === 'CLOSED' && old.closed === at && !active.has(e.userId),
        'GRACE_ORIGIN',
      );
      const previous = events[events.indexOf(e) - 1];
      check(
        previous?.kind === 'DISCONNECTED' &&
          previous.connectionId === c.id &&
          previous.atUs === e.atUs,
        'GRACE_EVENT',
      );
      check(
        !connections.some(
          (other) =>
            other.userId === e.userId &&
            ['OPEN', 'UNKNOWN'].includes(states.get(other.id)?.state),
        ),
        'GRACE_UNCERTAIN',
      );
      const grace = { userId: e.userId, start: at, end: at + 30000000n };
      graces.push(grace);
      active.set(e.userId, grace);
    } else {
      check(old && at >= old.last, 'MISSING_OR_REVERSED');
      if (e.kind === 'RETIRED') {
        check(old.state === 'UNKNOWN', 'RETIRED');
        old.state = 'RETIRED';
      } else {
        check(old.state === 'OPEN', 'DUPLICATE_TRANSITION');
        if (e.kind === 'RENEWED') {
          check(at < lease(old), 'EXPIRED_RENEW');
          old.last = at;
        } else {
          check(e.kind === 'UNKNOWN' || e.kind === 'DISCONNECTED', 'KIND');
          check(
            e.kind !== 'DISCONNECTED' || at < lease(old),
            'EXPIRED_DISCONNECT',
          );
          old.state = e.kind === 'UNKNOWN' ? 'UNKNOWN' : 'CLOSED';
          old.closed = at;
          if (
            e.kind === 'DISCONNECTED' &&
            activeRoundStartUs &&
            !active.has(e.userId) &&
            !connections.some(
              (other) =>
                other.userId === e.userId &&
                ['OPEN', 'UNKNOWN'].includes(states.get(other.id)?.state),
            )
          ) {
            const start = us(activeRoundStartUs);
            const afterActivation = activation
              ? at >= us(activation.atUs) &&
                us(e.id) > us(activation.presenceId)
              : at >= start;
            if (!activation)
              check(
                at < start - 3000000n || at >= start,
                'GRACE_PHASE_UNPROVEN',
              );
            if (afterActivation) {
              const next = events[events.indexOf(e) + 1];
              check(
                next?.kind === 'GRACE' &&
                  next.connectionId === c.id &&
                  next.atUs === e.atUs,
                'MISSING_GRACE',
              );
            }
          }
        }
      }
    }
  }
  // Every connection established by the terminal must have its immutable origin.
  check(
    connections.every((c) => states.has(c.id)),
    'MISSING_CONNECTED',
  );
  for (const c of connections) {
    const state = states.get(c.id);
    check(
      c.state === state.state &&
        us(c.lastUs) === state.last &&
        us(c.leaseUs) === lease(state) &&
        (state.closed === undefined
          ? c.closedUs === null
          : us(c.closedUs) === state.closed),
      'CONNECTION_SUMMARY',
    );
  }
  function lease(c: ConnectionState): bigint {
    const end = c.last + 45000000n;
    return c.auth === null ? end : end < us(c.auth) ? end : us(c.auth);
  }
  const graceAt = (at: bigint) =>
    graces.filter(
      (g) => g.start <= at && (g.cancelled === undefined || at < g.cancelled),
    );
  // Reconstruct OPEN at the accepted action's precise instant, rather than
  // using the connection's mutable final state or today's lease.
  const openConnectionAt = (user: string, at: bigint) => {
    for (const c of [...connections].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    )) {
      if (c.userId !== user || us(c.connectedUs) > at) continue;
      const history = relevant.filter(
        (e) =>
          e.connectionId === c.id && us(e.atUs) <= at && e.kind !== 'GRACE',
      );
      const last = history[history.length - 1];
      if (!last || !['CONNECTED', 'RENEWED'].includes(last.kind)) continue;
      const end = us(last.atUs) + 45000000n;
      if (at < end && (c.authUs === null || at < us(c.authUs)))
        return {
          connectionId: c.id,
          eventId: last.id,
          authenticatedUs: last.atUs,
          leaseUntilUs: (c.authUs === null || end < us(c.authUs)
            ? end
            : us(c.authUs)
          ).toString(),
          authUntilUs: c.authUs,
        };
    }
    return null;
  };
  const openAt = (user: string, at: bigint) =>
    openConnectionAt(user, at) !== null;
  return { events: relevant, graces, graceAt, openAt, openConnectionAt };
}
