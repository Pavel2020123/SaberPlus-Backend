import { replayTugPresence } from './competitive.tug-presence-replay';

describe('private TUG presence reconstruction (not settlement)', () => {
  const origin = 1791000000000001n;
  const connections = [
    {
      id: 'socket',
      matchId: 'match',
      userId: 'A',
      connectedUs: String(origin),
      authUs: null,
      state: 'CLOSED',
      lastUs: String(origin),
      leaseUs: String(origin + 45000000n),
      closedUs: String(origin + 1n),
    },
  ];
  const event = (
    id: number,
    kind: string,
    offset: bigint,
    connectionId: string | null = 'socket',
  ) => ({
    id: String(BigInt(id) + 9007199254740992n),
    matchId: 'match',
    userId: 'A',
    connectionId,
    kind,
    atUs: String(origin + offset),
  });
  const load = (events: any[], offset = 30000001n) =>
    replayTugPresence(['A', 'B'], connections, events, String(origin + offset));
  it('requires the confirmed last disconnect and preserves exact grace microseconds', () => {
    const p = load([
      event(1, 'CONNECTED', 0n),
      event(2, 'DISCONNECTED', 1n),
      event(3, 'GRACE', 1n),
    ]);
    expect(p.graceAt(origin + 30000000n)[0].end).toBe(origin + 30000001n);
    expect(p.openAt('A', origin)).toBe(true);
    expect(p.openAt('A', origin + 1n)).toBe(false);
  });
  it.each([1n, 30000000n])(
    'accepts authenticated reconnection at valid offset %sµs',
    (offset) => {
      const reconnected = {
        ...connections[0],
        id: 'new-socket',
        state: 'OPEN',
        connectedUs: String(origin + offset),
        lastUs: String(origin + offset),
        leaseUs: String(origin + offset + 45000000n),
        closedUs: null,
      };
      const events = [
        event(1, 'CONNECTED', 0n),
        event(2, 'DISCONNECTED', 1n),
        event(3, 'GRACE', 1n),
        event(4, 'CONNECTED', offset, 'new-socket'),
      ];
      const p = replayTugPresence(
        ['A', 'B'],
        [...connections, reconnected],
        events,
        String(origin + 30000001n),
      );
      expect(p.graces[0].cancelled).toBe(origin + offset);
      expect(p.graceAt(origin + 30000001n)).toEqual([]);
    },
  );
  it.each([
    [30000001n, 'LATE_RECONNECT'],
    [0n, 'RETROACTIVE_RECONNECT'],
  ] as const)(
    'rejects reconnection at invalid offset %sµs with %s',
    (offset, code) => {
      const reconnected = {
        ...connections[0],
        id: 'new-socket',
        connectedUs: String(origin + offset),
      };
      const events = [
        event(1, 'CONNECTED', 0n),
        event(2, 'DISCONNECTED', 1n),
        event(3, 'GRACE', 1n),
        event(4, 'CONNECTED', offset, 'new-socket'),
      ];
      expect(() =>
        replayTugPresence(
          ['A', 'B'],
          [...connections, reconnected],
          events,
          String(origin + 30000001n),
        ),
      ).toThrow(code);
    },
  );
  it('UNKNOWN alone never manufactures grace and cannot originate one', () => {
    const events = [event(1, 'CONNECTED', 0n), event(2, 'UNKNOWN', 1n)];
    expect(
      replayTugPresence(
        ['A', 'B'],
        [{ ...connections[0], state: 'UNKNOWN' }],
        events,
        String(origin + 30000001n),
      ).graces,
    ).toEqual([]);
    expect(() => load([...events, event(3, 'GRACE', 1n)])).toThrow(
      /GRACE_ORIGIN/,
    );
  });
  it('rejects duplicate transitions even at identical timestamps', () => {
    expect(() =>
      load([
        event(1, 'CONNECTED', 0n),
        event(2, 'DISCONNECTED', 1n),
        event(3, 'DISCONNECTED', 1n),
      ]),
    ).toThrow(/DUPLICATE_TRANSITION/);
  });
  it('rejects a missing grace after the last confirmed disconnect in demonstrable ACTIVE time', () => {
    const events = [event(1, 'CONNECTED', 0n), event(2, 'DISCONNECTED', 1n)];
    expect(() =>
      replayTugPresence(
        ['A', 'B'],
        connections,
        events,
        String(origin + 30000001n),
        String(origin),
      ),
    ).toThrow(/MISSING_GRACE/);
  });
  it('an expired lease does not authorize a fabricated confirmed disconnect', () => {
    expect(() =>
      load(
        [event(1, 'CONNECTED', 0n), event(2, 'DISCONNECTED', 45000000n)],
        45000000n,
      ),
    ).toThrow(/EXPIRED_DISCONNECT/);
  });
  it('keeps physical post-terminal observer refresh out of canonical terminal history', () => {
    const events = [event(1, 'CONNECTED', 0n), event(2, 'UNKNOWN', 45000000n)];
    const summary = {
      ...connections[0],
      state: 'UNKNOWN',
      closedUs: String(origin + 45000000n),
    };
    expect(
      replayTugPresence(['A', 'B'], [summary], events, String(origin + 1n))
        .events,
    ).toEqual(events.slice(0, 1));
  });
  it('does not accept reversed sequence IDs above the safe JS integer range', () => {
    expect(() =>
      load([event(2, 'CONNECTED', 0n), event(1, 'DISCONNECTED', 1n)]),
    ).toThrow(/ORDER_OR_OWNER/);
  });
});
