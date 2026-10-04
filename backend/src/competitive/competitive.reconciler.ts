import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitiveService } from './competitive.service';
import { CompetitiveError } from './competitive.rules';
import {
  lockSoloAttempt,
  SOLO_GAMES,
  SoloAttempt,
  SoloGame,
  soloTable,
} from './competitive.solo';

/** The pending queue is the authoritative attempt itself. A crash cannot lose a callback. */
@Injectable()
export class CompetitiveReconciler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(CompetitiveReconciler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly competitive: CompetitiveService,
  ) {}
  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.reconcile(), 30_000);
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
      .catch((error: unknown) => {
        const dbError = error as { code?: string; meta?: { code?: string } };
        const missingSchema =
          ['P2021', 'P2022'].includes(dbError?.code ?? '') ||
          (dbError?.code === 'P2010' &&
            ['42P01', '42703'].includes(dbError.meta?.code ?? ''));
        this.logger.error(
          missingSchema
            ? 'COMPETITIVE_SCHEMA_MISSING: apply and verify required migrations before running this backend; durable work remains pending.'
            : 'Competitive reconciliation unavailable; durable work remains pending.',
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async scan() {
    for (const game of SOLO_GAMES) {
      const pending = await this.prisma.$queryRaw<SoloAttempt[]>(Prisma.sql`
        SELECT * FROM ${soloTable(game)} WHERE "competitiveRulesVersion" = 1
        AND "competitiveSettledAt" IS NULL AND "competitiveRetryAt" <= clock_timestamp()
        AND (estado <> 'ACTIVO' OR "venceEn" <= timezone('UTC', clock_timestamp()))
        ORDER BY "competitiveRetryAt", id LIMIT 25`);
      for (const attempt of pending) {
        if (this.stopping) return;
        try {
          await this.expire(game, attempt);
          await this.competitive.settle({
            sourceType: game.sourceType,
            sourceId: attempt.id,
            participantId: attempt.usuarioId,
          });
          // If we crash here, the next pass reuses the same ledger event.
          await this.prisma
            .$executeRaw(Prisma.sql`UPDATE ${soloTable(game)} SET "competitiveSettledAt" = clock_timestamp()
            WHERE id = ${attempt.id}::uuid AND "competitiveSettledAt" IS NULL`);
        } catch (error) {
          this.logger.warn(
            `${game.gameId}: ${error instanceof CompetitiveError ? error.code : 'RETRYABLE_FAILURE'}; settlement remains pending.`,
          );
          await this.prisma
            .$executeRaw(Prisma.sql`UPDATE ${soloTable(game)} SET "competitiveRetryAt" = clock_timestamp() + interval '1 minute'
            WHERE id = ${attempt.id}::uuid AND "competitiveSettledAt" IS NULL`);
        }
      }
    }
  }
  private async expire(game: SoloGame, attempt: SoloAttempt) {
    await this.prisma.$transaction(async (tx) => {
      // Same order as settlement/game mutations: user -> attempt; never call settle here.
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id = ${attempt.usuarioId}::uuid FOR UPDATE`;
      const row = await lockSoloAttempt(tx, game, attempt.id);
      if (row.estado === 'ACTIVO') {
        await tx.$executeRaw(Prisma.sql`UPDATE ${soloTable(game)} SET estado = 'EXPIRADO', "finalizadoEn" = "venceEn"
          WHERE id = ${row.id}::uuid AND "venceEn" <= timezone('UTC', clock_timestamp())`);
      }
    });
  }
}
