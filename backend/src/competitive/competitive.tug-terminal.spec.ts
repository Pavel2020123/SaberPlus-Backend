import { verifiedTugPair } from './competitive.tug-terminal';
import { TugReplayEvidence } from './competitive.tug-replay';
import { TugBeneficiaryPresence } from './competitive.contracts';

describe('competitive TUG precise pair contract (no settlement)', () => {
  const activation = 1791000000000001n;
  const disconnected = activation + 1n;
  const terminal = disconnected + 30000000n;
  const evidence = (): TugReplayEvidence => ({
    classification: 'GRACE_ABANDONMENT',
    phase: 'ACTIVE',
    participants: ['A', 'B'],
    terminalUs: String(terminal),
    winner: 'B',
    correct: [0, 0],
    actions: [0, 1],
    presentedRounds: 1,
    qPartida: 4,
    abandonment: [
      { userId: 'A', reason: 'GRACE', effectiveUs: String(terminal) },
    ],
    evidenceHash: 'a'.repeat(64),
  });
  const presence = (): TugBeneficiaryPresence => ({
    rivalDisconnectedUs: String(disconnected),
    ownGraceStartUs: null,
    openAtTerminal: false, // UNKNOWN now does not erase the accepted proof.
    openConnectionAtTerminal: null,
    authenticatedEvidence: {
      kind: 'ACCEPTED_ANSWER',
      id: 'answer',
      atUs: String(disconnected + 1n),
    },
  });
  const openProof = () => ({
    connectionId: 'B-socket',
    eventId: '6',
    authenticatedUs: String(activation),
    leaseUntilUs: String(activation + 45000000n),
    authUntilUs: null as string | null,
  });
  const proof = () => ({
    sourceId: 'match',
    temporalVersion: 1,
    admissionUs: String(activation - 1n),
    observedUs: String(terminal),
    activation: { atUs: String(activation), sportsVersion: 3, presenceId: '5' },
    graceStarts: { A: String(disconnected) },
    beneficiaryPresence: { B: presence() },
  });
  it('preserves fractional time, incorrect accepted participation and proven UNKNOWN beneficiary', () => {
    const r = verifiedTugPair(evidence(), proof());
    expect(r.terminalUs).toBe(String(terminal));
    expect(r.resolutions[0].kind).toBe('PENALIZABLE_ABANDONMENT');
    expect(r.resolutions[1]).toMatchObject({
      kind: 'ABANDONMENT_BENEFICIARY',
      correct: 0,
      actions: 1,
      eligibility: 'SUFFICIENT',
    });
    expect(r.settlement).toBe('NOT_INTEGRATED');
    expect(r).not.toHaveProperty('xp');
  });
  it.each([true, false])(
    'current OPEN=%s alone cannot prove presence after rival disconnect',
    (open) => {
      const p = proof();
      p.beneficiaryPresence.B.openAtTerminal = open;
      p.beneficiaryPresence.B.openConnectionAtTerminal = open
        ? openProof()
        : null;
      p.beneficiaryPresence.B.authenticatedEvidence!.atUs =
        String(disconnected);
      expect(verifiedTugPair(evidence(), p).resolutions[1]).toMatchObject({
        eligibility: 'PRESENCE_UNPROVEN',
      });
    },
  );
  it('one microsecond later proves presence, while one earlier does not', () => {
    const p = proof();
    p.beneficiaryPresence.B.authenticatedEvidence!.atUs = String(
      disconnected - 1n,
    );
    expect(verifiedTugPair(evidence(), p).resolutions[1]).toMatchObject({
      eligibility: 'PRESENCE_UNPROVEN',
    });
    p.beneficiaryPresence.B.authenticatedEvidence!.atUs = String(
      disconnected + 1n,
    );
    expect(verifiedTugPair(evidence(), p).resolutions[1]).toMatchObject({
      eligibility: 'SUFFICIENT',
    });
  });
  it('zero actions yields NO_ACTIONS without inventing presence or performance', () => {
    const e = evidence();
    e.actions[1] = 0;
    const p = proof();
    p.beneficiaryPresence.B.authenticatedEvidence = null;
    expect(verifiedTugPair(e, p).resolutions[1]).toMatchObject({
      eligibility: 'NO_ACTIONS',
    });
  });
  it('own active grace blocks positive eligibility despite sporting victory', () => {
    const p = proof();
    p.beneficiaryPresence.B.ownGraceStartUs = String(disconnected + 1n);
    expect(verifiedTugPair(evidence(), p).resolutions[1]).toMatchObject({
      eligibility: 'OWN_GRACE',
    });
  });
  it('pre-ACTIVA EXPLICIT preserves sporting winner but is neutral for BOTH', () => {
    const e = evidence();
    e.classification = 'EXPLICIT_PRE_ACTIVE';
    e.phase = 'PRE_ACTIVE';
    e.actions = [0, 0];
    e.presentedRounds = 0;
    e.qPartida = null;
    e.abandonment[0].reason = 'EXPLICIT';
    expect(
      verifiedTugPair(e, { ...proof(), activation: null }).resolutions,
    ).toEqual([
      { kind: 'NEUTRAL', reason: 'PRE_ACTIVE' },
      { kind: 'NEUTRAL', reason: 'PRE_ACTIVE' },
    ]);
  });
  it.each([null, 'B'])(
    'EXPLICIT_ACTIVE with sporting winner %s proves phase and uses historical OPEN interval',
    (winner) => {
      const e = evidence();
      e.classification = 'EXPLICIT_ACTIVE';
      e.abandonment[0].reason = 'EXPLICIT';
      e.winner = winner;
      const p = proof();
      p.beneficiaryPresence.B.openAtTerminal = true;
      p.beneficiaryPresence.B.openConnectionAtTerminal = openProof();
      const r = verifiedTugPair(e, p);
      expect(r.resolutions[0].kind).toBe('PENALIZABLE_ABANDONMENT');
      expect(r.resolutions[1]).toMatchObject(
        winner
          ? { eligibility: 'SUFFICIENT' }
          : { kind: 'NEUTRAL', reason: 'NO_WINNER' },
      );
    },
  );
  it('only exactly simultaneous confirmed graces have approved zero reward and zero penalty', () => {
    const e = evidence();
    e.classification = 'SIMULTANEOUS_CANCELLED';
    e.winner = null;
    e.correct = [1, 0];
    e.actions = [1, 1];
    e.abandonment.push({ ...e.abandonment[0], userId: 'B' });
    const p = proof();
    p.graceStarts['B'] = String(disconnected);
    const r = verifiedTugPair(e, p);
    expect(r).not.toHaveProperty('policyBlock');
    expect(r.resolutions).toEqual([
      {
        kind: 'NEUTRAL',
        reason: 'SIMULTANEOUS',
        positiveXp: 0,
        nominalPenalty: 0,
      },
      {
        kind: 'NEUTRAL',
        reason: 'SIMULTANEOUS',
        positiveXp: 0,
        nominalPenalty: 0,
      },
    ]);
    p.graceStarts['B'] = String(disconnected + 1n);
    expect(() => verifiedTugPair(e, p)).toThrow('GRACE_PHASE');
  });
  it.each(['SUFFICIENT', 'PRESENCE_UNPROVEN', 'OWN_GRACE', 'NO_ACTIONS'])(
    'EXPLICIT_ACTIVE separates own penalty evidence from beneficiary %s',
    (eligibility) => {
      const e = evidence();
      e.classification = 'EXPLICIT_ACTIVE';
      e.abandonment[0].reason = 'EXPLICIT';
      const p = proof();
      if (eligibility !== 'PRESENCE_UNPROVEN') {
        p.beneficiaryPresence.B.openAtTerminal = true;
        p.beneficiaryPresence.B.openConnectionAtTerminal = openProof();
      }
      if (eligibility === 'OWN_GRACE')
        p.beneficiaryPresence.B.ownGraceStartUs = String(disconnected);
      if (eligibility === 'NO_ACTIONS') e.actions[1] = 0;
      const r = verifiedTugPair(e, p);
      expect(r.resolutions[0]).toMatchObject({
        kind: 'PENALIZABLE_ABANDONMENT',
        reason: 'EXPLICIT',
      });
      expect(r.resolutions[1]).toMatchObject({ eligibility });
    },
  );
  it.each([
    'FLAG_ONLY',
    'EXPIRED_LEASE',
    'EXPIRED_AUTH',
    'FUTURE',
    'FORGED_LEASE',
  ])('rejects incompatible historical OPEN proof %s', (variant) => {
    const e = evidence();
    e.classification = 'EXPLICIT_ACTIVE';
    e.abandonment[0].reason = 'EXPLICIT';
    const p = proof(),
      open = openProof();
    p.beneficiaryPresence.B.openAtTerminal = true;
    p.beneficiaryPresence.B.openConnectionAtTerminal = open;
    if (variant === 'FLAG_ONLY')
      p.beneficiaryPresence.B.openConnectionAtTerminal = null;
    if (variant === 'EXPIRED_LEASE') open.leaseUntilUs = String(terminal);
    if (variant === 'EXPIRED_AUTH') {
      open.authUntilUs = String(terminal);
      open.leaseUntilUs = String(terminal);
    }
    if (variant === 'FUTURE') open.authenticatedUs = String(terminal + 1n);
    if (variant === 'FORGED_LEASE')
      open.leaseUntilUs = String(activation + 45000001n);
    expect(() => verifiedTugPair(e, p)).toThrow(
      variant === 'FLAG_ONLY' ? 'OPEN_PROOF' : 'OPEN_INTERVAL',
    );
  });
  it('global expiration stays neutral, never a sporting tie', () => {
    const e = evidence();
    e.classification = 'GLOBAL_EXPIRED';
    e.winner = null;
    e.abandonment = [];
    expect(verifiedTugPair(e, proof()).resolutions).toEqual([
      { kind: 'NEUTRAL', reason: 'GLOBAL_EXPIRED' },
      { kind: 'NEUTRAL', reason: 'GLOBAL_EXPIRED' },
    ]);
  });
  it.each(['UNKNOWN', 'EXPLICIT', 'MISSING'])(
    'does not apply simultaneous zero policy to %s absence evidence',
    (reason) => {
      const e = evidence();
      e.classification = 'SIMULTANEOUS_CANCELLED';
      e.winner = null;
      e.abandonment =
        reason === 'MISSING'
          ? []
          : [
              { ...e.abandonment[0], reason },
              { ...e.abandonment[0], userId: 'B', reason },
            ];
      const p = proof();
      p.graceStarts['B'] = String(disconnected);
      expect(() => verifiedTugPair(e, p)).toThrow(
        reason === 'MISSING' ? 'SIMULTANEOUS' : 'ABANDONMENT_REASON',
      );
    },
  );
  it.each([null, 'A', 'B'])(
    'NORMAL preserves sporting outcome %s',
    (winner) => {
      const e = evidence();
      e.classification = 'NORMAL';
      e.abandonment = [];
      e.winner = winner;
      const r = verifiedTugPair(e, proof());
      expect(r.resolutions.map((x: any) => x.outcome)).toEqual(
        winner === null
          ? ['EMPATE', 'EMPATE']
          : winner === 'A'
            ? ['VICTORIA', 'DERROTA']
            : ['DERROTA', 'VICTORIA'],
      );
    },
  );
  it('hash remains stable across reads and a skewed Node clock', () => {
    const r = verifiedTugPair(evidence(), proof());
    const spy = jest.spyOn(Date, 'now').mockReturnValue(0);
    try {
      expect(
        verifiedTugPair(evidence(), {
          ...proof(),
          observedUs: String(terminal + 1n),
        }),
      ).toEqual(r);
    } finally {
      spy.mockRestore();
    }
  });
  it.each([
    [
      'unversioned phase',
      (e: any, p: any) => {
        p.temporalVersion = null;
      },
      'TEMPORAL_VERSION_REQUIRED',
    ],
    [
      'missing activation',
      (e: any, p: any) => {
        p.activation = null;
      },
      'PHASE',
    ],
    [
      'activation after terminal',
      (e: any, p: any) => {
        p.activation.atUs = String(terminal + 1n);
      },
      'ACTIVATION',
    ],
    [
      'grace before activation',
      (e: any, p: any) => {
        p.graceStarts.A = String(activation - 1n);
      },
      'GRACE_PHASE',
    ],
    [
      'future terminal',
      (e: any, p: any) => {
        p.observedUs = String(terminal - 1n);
      },
      'TIMELINE',
    ],
    [
      'correct without action',
      (e: any) => {
        e.correct[0] = 1;
      },
      'COUNTS',
    ],
    [
      'action without certified R',
      (e: any) => {
        e.presentedRounds = 0;
      },
      'COUNTS',
    ],
    [
      'wrong abandonment timestamp',
      (e: any) => {
        e.abandonment[0].effectiveUs = String(terminal - 1n);
      },
      'ABANDONMENT',
    ],
    [
      'fictitious winner',
      (e: any) => {
        e.winner = 'C';
      },
      'PARTICIPANTS',
    ],
  ])('rejects %s', (_label, mutate: any, error) => {
    const e = evidence(),
      p = proof();
    mutate(e, p);
    expect(() => verifiedTugPair(e, p)).toThrow(String(error));
  });
});
