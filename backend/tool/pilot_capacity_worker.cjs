// Owned local benchmark worker. Not a deployment entry point.
const { readFile } = require('node:fs/promises');
const { performance } = require('node:perf_hooks');
const { createRequire } = require('node:module');
const requireBackend = createRequire(require('node:path').join(__dirname, '../package.json'));
let app, timer, sampling;
(async () => {
  const { validateCompetitiveDatabase } = await import('./test_competitive_postgres.mjs');
  validateCompetitiveDatabase(process.env.DATABASE_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')));
  if (process.env.NODE_ENV !== 'test') throw Error('Test only');
  const { NestFactory } = requireBackend('@nestjs/core');
  const { ValidationPipe } = requireBackend('@nestjs/common');
  const { AppModule } = requireBackend('./dist/app.module');
  app = await NestFactory.create(AppModule, { logger: false });
  // Browser QA only in this already ownership-validated disposable worker.
  // Production CORS is not modified or proven by this local allowance.
  if (process.env.LIC2_PANEL_BROWSER_LOCAL === 'true') {
    app.enableCors({ origin: /^http:\/\/127\.0\.0\.1:\d+$/ });
  }
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true } }));
  // Use the same verified-user quota and bounded login queue as main.ts.
  const { sharedNetworkLimiters, sharedNetworkLimitConfig, networkKey } = requireBackend('./dist/security/shared-network-limits');
  const { boundedLoginQueue } = requireBackend('./dist/security/login-admission-queue');
  const quotaDb = app.get(requireBackend('./dist/prisma/prisma.service').PrismaService);
  const quotaJwt = app.get(requireBackend('@nestjs/jwt').JwtService);
  app.use(...sharedNetworkLimiters({ verify: (token) => quotaJwt.verifyAsync(token, { algorithms: ['HS256'], ignoreExpiration: false }),
    currentUserId: async (id) => (await quotaDb.usuario.findUnique({ where: { id }, select: { id: true } }))?.id ?? null },
    sharedNetworkLimitConfig({ NODE_ENV: 'production' })));
  app.use('/auth/login', boundedLoginQueue(), requireBackend('express-rate-limit')({ windowMs: 15 * 60 * 1000, max: 10,
    skipSuccessfulRequests: true, keyGenerator: (req) => networkKey(req.ip) }));
  await app.listen(0, '127.0.0.1');
  let cpu = process.cpuUsage(), at = performance.now();
  const db = app.get(requireBackend('./dist/prisma/prisma.service').PrismaService);
  timer = setInterval(() => {
    if (sampling) return;
    const now = performance.now(), used = process.cpuUsage(), elapsed = now - at;
    const metric = { type: 'resources', rssMiB: process.memoryUsage().rss / 1048576,
      heapMiB: process.memoryUsage().heapUsed / 1048576,
      cpuOneCorePct: ((used.user - cpu.user) + (used.system - cpu.system)) / (elapsed * 10) };
    cpu = used; at = now;
    sampling = db.$queryRaw`SELECT count(*)::int AS total,
      (count(*) FILTER (WHERE state='active'))::int AS active,
      (count(*) FILTER (WHERE wait_event_type IN ('Lock','LWLock','IO')))::int AS waiting
      FROM pg_stat_activity WHERE usename=current_user`
      .then(([row]) => { Object.assign(metric, { dbTotal: row.total, dbActive: Math.max(0, row.active - 1), dbWaiting: row.waiting }); })
      .catch(() => { metric.dbSampleFailed = true; })
      .finally(() => { process.send?.(metric); sampling = undefined; });
  }, 1000);
  timer.unref();
  process.send?.({ type: 'ready', base: await app.getUrl() });
  process.on('message', (m) => {
    if (m === 'lic1-route-inventory')
      process.send?.({ type: 'lic1-routes', inventory: require('./lic1_runtime_routes.cjs').inspectLicenseRoutes(app) });
  });
  const stop = async () => { clearInterval(timer); await sampling; await app.close(); process.exit(0); };
  process.on('message', (m) => { if (m === 'stop') void stop(); });
  process.on('disconnect', () => { void stop(); });
  setTimeout(() => { void stop(); }, 12 * 60 * 1000).unref();
})().catch(() => { process.send?.({ type: 'failed' }); process.exit(1); });
