import { readCompetitiveOptIn } from './competitive-opt-in';

describe('raw competitive opt-in boundary', () => {
  it.each([true, false, 'true', 'false', 0, 1, null, undefined])(
    'preserves %p for DTO validation instead of coercing it',
    (competitive) => {
      expect(readCompetitiveOptIn({ obj: { competitive } })).toBe(competitive);
    },
  );
  it.each([null, undefined, 'true', 1, {}])(
    'returns absence for a source without the field: %p',
    (obj) => {
      expect(readCompetitiveOptIn({ obj })).toBeUndefined();
    },
  );
});
