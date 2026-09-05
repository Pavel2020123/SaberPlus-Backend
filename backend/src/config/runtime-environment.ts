export interface RuntimeEnvironment {
  isProduction: boolean;
  port: number;
  allowedOrigins: string[];
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${key}.`);
  }
  return value;
}

export function parseAllowedOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  for (const origin of origins) {
    const parsed = new URL(origin);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin
    ) {
      throw new Error(`Invalid CORS origin: ${origin}.`);
    }
  }

  return [...new Set(origins)];
}

export function loadRuntimeEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeEnvironment {
  const databaseUrl = required(env, 'DATABASE_URL');
  const directUrl = required(env, 'DIRECT_URL');
  const jwtSecret = required(env, 'JWT_SECRET');
  const isProduction = env.NODE_ENV === 'production';

  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
  }
  if (!/^postgres(?:ql)?:\/\//.test(directUrl)) {
    throw new Error('DIRECT_URL must be a PostgreSQL connection URL.');
  }

  const parsedPort = Number.parseInt(env.PORT ?? '3000', 10);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  if (isProduction) {
    if (jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must contain at least 32 characters in production.',
      );
    }
    const rankingSecret = required(env, 'RANKING_ALIAS_SECRET');
    if (rankingSecret.length < 32) {
      throw new Error(
        'RANKING_ALIAS_SECRET must contain at least 32 characters in production.',
      );
    }
    if (rankingSecret === jwtSecret) {
      throw new Error(
        'RANKING_ALIAS_SECRET must be different from JWT_SECRET.',
      );
    }
  }

  const fallbackOrigin = env.FRONTEND_URL?.trim() || 'http://localhost:3001';
  const allowedOrigins = parseAllowedOrigins(
    env.ALLOWED_ORIGINS?.trim() || fallbackOrigin,
  );

  if (
    isProduction &&
    allowedOrigins.some((origin) => !origin.startsWith('https://'))
  ) {
    throw new Error('Every production CORS origin must use HTTPS.');
  }

  return {
    isProduction,
    port: parsedPort,
    allowedOrigins,
  };
}
