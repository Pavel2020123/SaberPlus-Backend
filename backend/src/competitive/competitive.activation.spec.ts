import { assertSoloCompetitiveCreationAllowed } from './competitive.activation';

describe('server-only solo competitive activation', () => {
  const previous = process.env.COMPETITIVE_SOLO_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
    else process.env.COMPETITIVE_SOLO_ENABLED = previous;
  });
  it.each([undefined, 'false', '', 'TRUE', '1', 'invalid'])(
    'fails closed for %s while allowing legacy creation',
    (value) => {
      if (value === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
      else process.env.COMPETITIVE_SOLO_ENABLED = value;
      expect(() => assertSoloCompetitiveCreationAllowed(true)).toThrow();
      expect(() => assertSoloCompetitiveCreationAllowed(false)).not.toThrow();
      expect(() => assertSoloCompetitiveCreationAllowed()).not.toThrow();
    },
  );
  it('requires the explicit server value true', () => {
    process.env.COMPETITIVE_SOLO_ENABLED = 'true';
    expect(() => assertSoloCompetitiveCreationAllowed(true)).not.toThrow();
    process.env.COMPETITIVE_SOLO_ENABLED = 'false';
    expect(() => assertSoloCompetitiveCreationAllowed(true)).toThrow();
  });
});
