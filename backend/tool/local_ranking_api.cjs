// Test-only entry point: real AppModule, authentication and PostgreSQL. No test routes.
const { readFile } = require('node:fs/promises');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { applyLocalCompetitiveControl } = require('./local_competitive_control.cjs');

(async () => {
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(process.env.DATABASE_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')));
  const { AppModule } = require('../dist/app.module');
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
    transform: true, transformOptions: { enableImplicitConversion: true } }));
  app.enableCors({ origin: 'http://127.0.0.1:4173' });
  await app.listen(43187, '127.0.0.1');
  process.send?.({ ready: true });
  process.on('message', async message => {
    if (message === 'stop') { await app.close(); process.exit(0); }
    const acknowledgement = applyLocalCompetitiveControl(message, process.env);
    if (acknowledgement) process.send?.(acknowledgement);
  });
})().catch(() => { console.error('Local validation API failed; no credentials logged.'); process.exit(1); });
