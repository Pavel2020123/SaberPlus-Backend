import {
  PRIVATE_OFFLINE_WINDOW_SECONDS,
  privateOfflineGrantPolicy,
} from './private-offline-policy';

describe('private offline policy, not an authorization endpoint', () => {
  const input = {
    ownerId: 'owner',
    contextId: 'lesson',
    requestNonce: 'a'.repeat(64),
    validatedAt: new Date('2026-11-01T00:00:00.000Z'),
  };
  it('uses exactly 72 hours from backend validation, independent of local timezone', () => {
    const result = privateOfflineGrantPolicy(input);
    expect(PRIVATE_OFFLINE_WINDOW_SECONDS).toBe(259200);
    expect(result.expiresAt).toBe('2026-11-04T00:00:00.000Z');
    expect(result.validatedAt).toBe(input.validatedAt.toISOString());
    expect(input.validatedAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('binds the policy response to owner, context and fresh request nonce', () => {
    expect(privateOfflineGrantPolicy(input)).toEqual({
      ...input,
      policyVersion: 1,
      validatedAt: '2026-11-01T00:00:00.000Z',
      expiresAt: '2026-11-04T00:00:00.000Z',
    });
  });
  for (const invalid of [
    { ownerId: '' },
    { contextId: '' },
    { requestNonce: 'old' },
    { validatedAt: new Date(NaN) },
  ]) {
    it(`rejects invalid ${Object.keys(invalid)[0]}`, () => {
      expect(() =>
        privateOfflineGrantPolicy({ ...input, ...invalid }),
      ).toThrow();
    });
  }
});
