// Own disposable database + IPC only. Never a production worker entry point.
require('ts-node/register/transpile-only');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const {
  CompetitiveService,
} = require('../../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../../src/competitive/competitive.contracts');
const {
  createSoloVerifiers,
} = require('../../src/competitive/competitive.solo');
const {
  CompetitiveReconciler,
} = require('../../src/competitive/competitive.reconciler');
const mode = process.argv[2],
  sourceId = process.argv[3],
  participantId = process.argv[4];
let db, worker;
const send = (m) => process.send?.({ ...m, processPid: process.pid });
function release() {
  return new Promise((resolve) =>
    process.once('message', (m) => {
      if (m === 'RELEASE') resolve();
      else process.exitCode = 1;
    }),
  );
}
async function main() {
  if (
    !process.send ||
    !['before', 'after', 'recover', 'blocked', 'graceful'].includes(mode)
  )
    throw new Error('OWNED_IPC_REQUIRED');
  const { validateCompetitiveDatabase } =
    await import('../../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '1');
  db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const attempt = await db.intentoCima.findUniqueOrThrow({
    where: { id: sourceId },
  });
  if (
    attempt.usuarioId !== participantId ||
    attempt.competitiveRulesVersion !== 1 ||
    attempt.estado === 'ACTIVO'
  )
    throw new Error('OWNED_TERMINAL_REQUIRED');
  const backendPid = (await db.$queryRaw`SELECT pg_backend_pid() AS pid`)[0]
    .pid;
  send({ stage: 'READY', backendPid });
  let database = db;
  if (mode === 'before')
    database = {
      $transaction: (fn, options) =>
        db.$transaction(async (tx) => {
          const result = await fn(tx);
          const count = await tx.eventoXpCompetitivo.count({
            where: { sourceId },
          });
          if (count !== 1) throw new Error('PRECOMMIT_POSTING_REQUIRED');
          send({ stage: 'BEFORE_COMMIT', backendPid });
          await release();
          return result;
        }, options),
    };
  const service = new CompetitiveService(
    database,
    new CompetitiveVerifierRegistry(createSoloVerifiers()),
  );
  if (mode === 'after' || mode === 'recover' || mode === 'graceful') {
    const actual = {
      settle: async (ref) => {
        const event = await service.settle(ref);
        if (mode === 'after' && ref.sourceId === sourceId) {
          send({ stage: 'COMMITTED_UNACKNOWLEDGED', backendPid });
          await release();
        }
        return event;
      },
    };
    worker = new CompetitiveReconciler(db, actual);
    await worker.reconcile();
    await worker.onModuleDestroy();
  } else
    await service.settle({
      sourceType: 'SUMMIT_ATTEMPT',
      sourceId,
      participantId,
    });
  await db.$disconnect();
  send({ stage: 'CLOSED', backendPid });
  process.disconnect();
}
main().catch(async (error) => {
  send({ stage: 'ERROR', code: error.code ?? 'OWNED_WORKER_ERROR' });
  await worker?.onModuleDestroy();
  await db?.$disconnect();
  process.exitCode = 1;
  process.disconnect?.();
});
