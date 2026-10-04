import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitiveService } from './competitive.service';
import { CompetitiveError } from './competitive.rules';

/** Durable admission is the queue; flags affect creation only. Never settle inside closure tx. */
@Injectable()
export class TriviaCompetitiveReconciler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TriviaCompetitiveReconciler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly competitive: CompetitiveService,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.reconcile(), 5000);
    this.timer.unref();
    void this.reconcile();
  }
  async onModuleDestroy() {
    this.stopping = true;
    if (this.timer) clearInterval(this.timer);
    await this.running;
  }
  reconcile(): Promise<void> {
    if (this.stopping) return Promise.resolve();
    if (this.running) return this.running;
    this.running = this.scan()
      .catch((error) => {
        const code = error?.code,
          sql = error?.meta?.code;
        this.logger.error(
          ['P2021', 'P2022'].includes(code) ||
            ['42P01', '42703', '42883'].includes(sql)
            ? 'COMPETITIVE_SCHEMA_MISSING: required Trivia migrations must be applied before this backend.'
            : 'Trivia competitive recovery unavailable; durable work remains pending.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async scan() {
    const pending = await this.prisma.$queryRaw<
      { id: string; usuarioId: string }[]
    >`
      SELECT a.id,a."usuarioId" FROM "IntentoTriviaRush" a LEFT JOIN "TriviaPresence" p ON p."attemptId"=a.id
      WHERE a."competitiveRulesVersion"=1 AND a."competitiveSettledAt" IS NULL
      AND a."competitiveRetryAt" <= timezone('UTC',clock_timestamp())
      AND (a.estado <> 'ACTIVO' OR a."venceEn" <= trivia_presence_now() OR p."graceUntil" <= trivia_presence_now())
      ORDER BY a."competitiveRetryAt",a.id LIMIT 25`;
    for (const a of pending) {
      if (this.stopping) return;
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${a.usuarioId}::uuid FOR UPDATE`;
          await tx.$queryRaw`SELECT trivia_presence_resolve(${a.id}::uuid,NULL::timestamp)`;
        });
        await this.competitive.settle({
          sourceType: 'TRIVIA_ATTEMPT',
          sourceId: a.id,
          participantId: a.usuarioId,
        });
        // Crash before this acknowledgement retries the existing ledger event.
        await this.prisma
          .$executeRaw`UPDATE "IntentoTriviaRush" SET "competitiveSettledAt"=timezone('UTC',clock_timestamp())
          WHERE id=${a.id}::uuid AND "competitiveSettledAt" IS NULL`;
      } catch (error) {
        this.logger.warn(
          `${error instanceof CompetitiveError ? error.code : 'RETRYABLE_FAILURE'}: Trivia settlement remains pending.`,
        );
        await this.prisma
          .$executeRaw`UPDATE "IntentoTriviaRush" SET "competitiveRetryAt"=timezone('UTC',clock_timestamp())+interval '1 minute'
          WHERE id=${a.id}::uuid AND "competitiveSettledAt" IS NULL`;
      }
    }
  }
}
