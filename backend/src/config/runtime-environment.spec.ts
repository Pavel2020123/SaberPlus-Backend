import { loadRuntimeEnvironment } from './runtime-environment';

const validEnvironment = {
  DATABASE_URL: 'postgresql://runtime.example/database',
  DIRECT_URL: 'postgresql://migrations.example/database',
  JWT_SECRET: 'j'.repeat(32),
  RANKING_ALIAS_SECRET: 'r'.repeat(32),
  FRONTEND_URL: 'https://staging.saberplus.example',
  NODE_ENV: 'production',
  PORT: '10000',
};

describe('loadRuntimeEnvironment', () => {
  it('loads a secure production environment', () => {
    expect(loadRuntimeEnvironment(validEnvironment)).toEqual({
      isProduction: true,
      port: 10000,
      allowedOrigins: ['https://staging.saberplus.example'],
    });
  });

  it('accepts and deduplicates multiple explicit origins', () => {
    expect(
      loadRuntimeEnvironment({
        ...validEnvironment,
        ALLOWED_ORIGINS:
          'https://web.saberplus.example, https://admin.saberplus.example, https://web.saberplus.example',
      }).allowedOrigins,
    ).toEqual([
      'https://web.saberplus.example',
      'https://admin.saberplus.example',
    ]);
  });

  it('rejects missing database configuration', () => {
    expect(() =>
      loadRuntimeEnvironment({ ...validEnvironment, DATABASE_URL: '' }),
    ).toThrow('DATABASE_URL');
  });

  it('rejects weak or reused production secrets', () => {
    expect(() =>
      loadRuntimeEnvironment({ ...validEnvironment, JWT_SECRET: 'short' }),
    ).toThrow('JWT_SECRET');
    expect(() =>
      loadRuntimeEnvironment({
        ...validEnvironment,
        RANKING_ALIAS_SECRET: validEnvironment.JWT_SECRET,
      }),
    ).toThrow('must be different');
  });

  it('rejects insecure production origins', () => {
    expect(() =>
      loadRuntimeEnvironment({
        ...validEnvironment,
        ALLOWED_ORIGINS: 'http://staging.saberplus.example',
      }),
    ).toThrow('must use HTTPS');
  });
});
