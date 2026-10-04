import {
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export async function resolveTriviaPresence(
  tx: Prisma.TransactionClient,
  id: string,
) {
  await tx.$queryRaw`SELECT trivia_presence_resolve(${id}::uuid, NULL::timestamp)`;
}

// Called only after retry lookup, inside the owner/attempt transaction.
// The SQL guard independently checks this again at insertion time.
export async function requireTriviaPresence(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<Date> {
  try {
    const [row] = await tx.$queryRaw<{ at: Date }[]>`
      SELECT trivia_presence_require_open(${id}::uuid) AS at`;
    return row.at;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2010' &&
      String(error.meta?.message).includes('TRIVIA_PRESENCE_REQUIRED')
    ) {
      throw new ConflictException('TRIVIA_PRESENCE_REQUIRED');
    }
    throw error;
  }
}

@Injectable()
export class TriviaPresenceService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  readonly instanceId = randomUUID();
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopped = false;
  private readonly log = new Logger(TriviaPresenceService.name);
  constructor(private readonly db: PrismaService) {}

  async connect(userId: string, attemptId: string, connectionId: string) {
    const rows = await this.db.$queryRaw<
      { state: string }[]
    >`SELECT trivia_presence_connect(
      ${attemptId}::uuid, ${userId}::uuid, ${connectionId}::uuid, ${this.instanceId}::uuid,
      NULL::timestamp) AS state`;
    return rows[0].state;
  }
  async observe(
    attemptId: string,
    connectionId: string,
    operation: 'RENEW' | 'DISCONNECT' | 'UNCERTAIN',
  ) {
    const rows = await this.db.$queryRaw<
      { state: string }[]
    >`SELECT trivia_presence_observe(
      ${attemptId}::uuid, ${connectionId}::uuid, ${this.instanceId}::uuid, ${operation},
      NULL::timestamp) AS state`;
    return rows[0].state;
  }
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.reconcile(), 5000);
    this.timer.unref();
    void this.reconcile();
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  reconcile(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.scan()
      .catch(() => {
        this.log.error(
          'TRIVIA_PRESENCE_RECOVERY_FAILED: verify schema/database; durable work remains pending.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async scan() {
    // Due terminal work first; scanning from DB survives process restart.
    const rows = await this.db.$queryRaw<
      { id: string }[]
    >`SELECT a.id FROM "IntentoTriviaRush" a
      LEFT JOIN "TriviaPresence" p ON p."attemptId"=a.id
      WHERE a."presenciaVersion"=1 AND a.estado='ACTIVO' AND
      (a."venceEn" <= timezone('UTC',clock_timestamp()) OR p."graceUntil" <= timezone('UTC',clock_timestamp())
       OR EXISTS(SELECT 1 FROM "TriviaConnection" c WHERE c."attemptId"=a.id AND c.state='OPEN'
          AND c."leaseUntil" <= timezone('UTC',clock_timestamp())))
      ORDER BY least(a."venceEn",p."graceUntil"),a.id LIMIT 100`;
    for (const row of rows) {
      if (this.stopped) break;
      try {
        await this.db.$transaction((tx) => resolveTriviaPresence(tx, row.id));
      } catch {
        this.log.error('TRIVIA_PRESENCE_ATTEMPT_PENDING');
      }
    }
  }
}
