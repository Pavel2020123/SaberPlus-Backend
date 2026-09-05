import path from 'node:path';
import process from 'node:process';
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const envFile = path.resolve(process.argv[2] ?? '.env.staging.local');
const loaded = config({ path: envFile, quiet: true });

if (loaded.error) {
  console.error('DATABASE_PROBE=ENV_FILE_ERROR');
  process.exit(1);
}

const prisma = new PrismaClient();
const verifySchema = process.argv.includes('--verify-schema');

try {
  await prisma.$queryRawUnsafe('SELECT 1');
  console.log('DATABASE_PROBE=OK');

  if (verifySchema) {
    const [migrationState] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        )::int AS applied,
        COUNT(*) FILTER (
          WHERE finished_at IS NULL AND rolled_back_at IS NULL
        )::int AS failed
      FROM "_prisma_migrations"
    `);
    const [schemaState] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*) FILTER (WHERE table_name = 'Usuario')::int AS users_table,
        COUNT(*) FILTER (WHERE table_name = 'Pregunta')::int AS questions_table,
        COUNT(*) FILTER (WHERE table_name = 'Institucion')::int AS institutions_table,
        COUNT(*) FILTER (WHERE table_name = 'IntentoTriviaRush')::int AS trivia_table,
        COUNT(*) FILTER (WHERE table_name = 'PartidaTiraAfloja')::int AS tug_table
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    const expectedTablesPresent = Object.values(schemaState).every(
      (value) => Number(value) === 1,
    );
    console.log(`MIGRATIONS_APPLIED=${Number(migrationState.applied)}`);
    console.log(`MIGRATIONS_FAILED=${Number(migrationState.failed)}`);
    console.log(`KEY_TABLES_PRESENT=${expectedTablesPresent ? 'YES' : 'NO'}`);

    if (
      Number(migrationState.applied) !== 39 ||
      Number(migrationState.failed) !== 0 ||
      !expectedTablesPresent
    ) {
      process.exitCode = 2;
    }
  }
} catch (error) {
  const code = typeof error?.code === 'string' ? error.code : 'UNKNOWN';
  const rawMessage = error instanceof Error ? error.message : String(error);
  const safeMessage = rawMessage
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[REDACTED_DATABASE_URL]')
    .replace(/password\s*[=:]\s*\S+/gi, 'password=[REDACTED]')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(' | ');
  const knownReasons = {
    P1000: 'AUTHENTICATION_FAILED',
    P1001: 'DATABASE_UNREACHABLE',
    P1002: 'CONNECTION_TIMEOUT',
    P1003: 'DATABASE_NOT_FOUND',
    P1013: 'INVALID_CONNECTION_STRING',
  };

  console.error('DATABASE_PROBE=FAILED');
  console.error(`DATABASE_ERROR_CODE=${code}`);
  console.error(`DATABASE_ERROR_REASON=${knownReasons[code] ?? 'UNKNOWN'}`);
  console.error(`DATABASE_ERROR_MESSAGE=${safeMessage}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
