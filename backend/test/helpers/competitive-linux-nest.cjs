// Test-only supervisor. The signalled Node child runs the real compiled main/AppModule.
const { fork } = require('node:child_process');
const emit = (data) => console.log(JSON.stringify({ cp22: true, ...data }));
if (process.argv[2] !== 'backend') {
  const child = fork(__filename, ['backend'], {
    stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  });
  child.on('message', (data) => emit(data));
  child.on('exit', (code, signal) => {
    emit({ phase: 'child-exit', pid: child.pid, code, signal });
    process.exitCode = code ?? 0;
  });
} else {
  process.on('uncaughtExceptionMonitor', (error) => {
    const password = new URL(process.env.DATABASE_URL).password;
    process.send({
      cp22: true,
      phase: 'bootstrap-error',
      pid: process.pid,
      code: error.code ?? null,
      message: String(error.message)
        .replaceAll(password, '[redacted]')
        .replace(/postgresql:\/\/\S+/g, '[owned DB]'),
    });
  });
  const { NestFactory } = require('@nestjs/core');
  const { PrismaService } = require('../app/dist/prisma/prisma.service');
  const classes = [
    ['PrismaService', PrismaService],
    [
      'CompetitiveReconciler',
      require('../app/dist/competitive/competitive.reconciler')
        .CompetitiveReconciler,
    ],
    [
      'TriviaCompetitiveReconciler',
      require('../app/dist/competitive/competitive.trivia-reconciler')
        .TriviaCompetitiveReconciler,
    ],
    [
      'TugCompetitiveReconciler',
      require('../app/dist/competitive/competitive.tug-reconciler')
        .TugCompetitiveReconciler,
    ],
    [
      'TriviaPresenceService',
      require('../app/dist/trivia-rush/trivia-presence.service')
        .TriviaPresenceService,
    ],
    [
      'TiraAflojaService',
      require('../app/dist/tira-afloja/tira-afloja.service').TiraAflojaService,
    ],
    [
      'TriviaPresenceGateway',
      require('../app/dist/trivia-rush/trivia-presence.gateway')
        .TriviaPresenceGateway,
    ],
    [
      'TiraAflojaGateway',
      require('../app/dist/tira-afloja/tira-afloja.gateway').TiraAflojaGateway,
    ],
  ];
  const send = (data) =>
    process.send({
      ...data,
      pid: process.pid,
      node: process.version,
      platform: process.platform,
    });
  for (const [name, Class] of classes) {
    if (!Class) throw new Error(`Missing real provider ${name}`);
    const original = Class.prototype.onModuleDestroy;
    Class.prototype.onModuleDestroy = async function (...args) {
      send({ phase: 'hook-start', provider: name });
      await original.apply(this, args);
      send({ phase: 'hook-end', provider: name });
    };
  }
  const transaction = PrismaService.prototype.$transaction;
  PrismaService.prototype.$transaction = function (callback, options) {
    if (typeof callback !== 'function')
      return transaction.call(this, callback, options);
    return transaction.call(
      this,
      async (tx) => {
        const backendPid = (
          await tx.$queryRaw`SELECT pg_backend_pid() AS pid`
        )[0].pid;
        if (process.env.CP22_MODE === 'lock')
          send({ phase: 'transaction', backendPid });
        const result = await callback(tx);
        if (process.env.CP22_MODE === 'kill-before') {
          const count = await tx.eventoXpCompetitivo.count({
            where: { sourceId: process.env.CP22_SOURCE },
          });
          if (count === 1) {
            send({ phase: 'precommit', backendPid });
            await new Promise(() => {});
          }
        }
        return result;
      },
      options,
    );
  };
  const create = NestFactory.create.bind(NestFactory);
  NestFactory.create = async (...args) => {
    const app = await create(...args);
    // Nest 11's exception proxy intercepts assignment to app.listen. Observe
    // the real server instead; do not replace an application method.
    app.getHttpServer().once('listening', async () => {
      const prisma = app.get(PrismaService);
      const tug = app.get(classes[5][1]);
      await tug.visibilityWitness.certify(require('node:crypto').randomUUID());
      const mainPid = (
        await prisma.$queryRaw`SELECT pg_backend_pid() AS pid`
      )[0].pid;
      const witnessPid = (
        await tug.visibilityWitness.client
          .$queryRaw`SELECT pg_backend_pid() AS pid`
      )[0].pid;
      send({ phase: 'ready', mainPid, witnessPid });
    });
    return app;
  };
  // No minimal module, replacement Prisma/verifier or fabricated settlement.
  require('../app/dist/main');
}
