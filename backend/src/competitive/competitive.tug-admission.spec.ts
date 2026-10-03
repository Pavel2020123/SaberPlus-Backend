import {
  readTugAdmission,
  tugAdmissionDecision,
  tugAdmissionQueue,
} from '../tira-afloja/tira-afloja.admission';
import { CompetitiveVerifierRegistry } from './competitive.contracts';
import { createCompetitiveVerifiers } from './competitive.module';

describe('Tug server-only admission, not XP activation', () => {
  const previous = process.env.COMPETITIVE_TUG_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
    else process.env.COMPETITIVE_TUG_ENABLED = previous;
  });
  it.each([undefined, 'false', 'TRUE', '1', ''])(
    'fails closed for flag %s',
    (value) => {
      if (value === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
      else process.env.COMPETITIVE_TUG_ENABLED = value;
      expect(tugAdmissionDecision()).toEqual({
        competitiveAdmissionVersion: 1,
        competitiveRulesVersion: null,
        competitivePolicy: {
          policyVersion: 1,
          flag: 'COMPETITIVE_TUG_ENABLED',
          enabled: false,
        },
      });
    },
  );
  it('isolates the future admitted queue but never registers a verifier', () => {
    process.env.COMPETITIVE_TUG_ENABLED = 'true';
    const saved = tugAdmissionDecision();
    expect(saved.competitiveRulesVersion).toBe(1);
    expect(tugAdmissionQueue(true)).toEqual({
      competitiveAdmissionVersion: 1,
      competitiveRulesVersion: 1,
    });
    expect(tugAdmissionQueue(false)).toEqual({ competitiveRulesVersion: null });
    process.env.COMPETITIVE_TUG_ENABLED = 'false';
    expect(saved.competitiveRulesVersion).toBe(1);
    expect(tugAdmissionDecision().competitiveRulesVersion).toBeNull();
    expect(() =>
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()).get(
        'TUG_MATCH',
      ),
    ).toThrow('SOURCE_NOT_INTEGRATED');
  });
  it('distinguishes non-admission from insufficient or contradictory private evidence', () => {
    const legacy = {
      competitiveAdmissionVersion: null,
      competitiveRulesVersion: null,
      competitivePolicy: null,
      competitiveAdmissionAt: null,
      competitiveOriginalAId: null,
      competitiveOriginalBId: null,
      jugadorAId: 'original-a',
      jugadorBId: null,
    };
    expect(readTugAdmission(legacy)).toBe('NOT_ADMITTED');
    expect(() =>
      readTugAdmission({ ...legacy, competitiveRulesVersion: 1 }),
    ).toThrow('TUG_ADMISSION_EVIDENCE_INSUFFICIENT');
    process.env.COMPETITIVE_TUG_ENABLED = 'true';
    const admitted = {
      ...legacy,
      ...tugAdmissionDecision(),
      competitiveAdmissionAt: new Date(),
      competitiveOriginalAId: legacy.jugadorAId,
    };
    expect(readTugAdmission(admitted)).toBe('ADMITTED');
    expect(() =>
      readTugAdmission({ ...admitted, jugadorAId: 'replaced-a' }),
    ).toThrow('TUG_ADMISSION_EVIDENCE_INSUFFICIENT');
    expect(() =>
      readTugAdmission({ ...admitted, competitiveAdmissionAt: null }),
    ).toThrow('TUG_ADMISSION_EVIDENCE_INSUFFICIENT');
  });
});
