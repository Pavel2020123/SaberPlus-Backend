import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitiveError } from './competitive.rules';
import { CompetitiveTugPairProtocol } from './competitive.tug-pair-protocol';

/** Admission + terminal are the durable queue. No flag controls recovery. */
@Injectable()
export class TugCompetitiveReconciler
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(TugCompetitiveReconciler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<void>;
  private stopping = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly pair: CompetitiveTugPairProtocol,
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
        this.logger.error(
          `TUG_RECOVERY_UNAVAILABLE ${error?.code ?? 'UNKNOWN'} ${error?.meta?.code ?? ''}: required local schema/connection must be available; terminal origins remain durable.`,
        );
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async scan() {
    // Excludes all historical/prepared unversioned sources, not a backfill.
    await this.prisma
      .$executeRaw`INSERT INTO "TugCompetitiveSettlement" ("sourceId")
      SELECT id FROM "PartidaTiraAfloja" WHERE "competitiveAdmissionVersion"=1
       AND "competitiveRulesVersion"=1 AND "temporalVersion"=1
       AND estado NOT IN ('BUSCANDO','PREPARANDO','ACTIVA') ON CONFLICT DO NOTHING`;
    const pending = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "sourceId" AS id FROM "TugCompetitiveSettlement" WHERE state='PENDING'
       AND "retryAt"<=clock_timestamp() ORDER BY "retryAt","sourceId" LIMIT 25`;
    for (const p of pending) {
      if (this.stopping) return;
      try {
        await this.pair.settlePrecisePair(p.id);
      } catch (error) {
        const evidenceError = error instanceof CompetitiveError;
        const code = evidenceError
          ? error.code
          : `RETRYABLE_${error?.code ?? 'UNKNOWN'}_${error?.meta?.code ?? ''}`;
        // Absence is not proof that an independent observation cannot commit.
        // The witness may already hold an on-time observation in an open tx.
        // Visible orphan certificates ARE contradictory; missing ones remain
        // durable PENDING, with a slow retry, even after the original deadline.
        let awaitingWitness = false;
        if (code === 'TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN') {
          const [evidence] = await this.prisma.$queryRaw<{ orphan: boolean }[]>`
            SELECT EXISTS(SELECT 1 FROM "TugRoundVisibility" v
             WHERE v."partidaId"=${p.id}::uuid AND NOT EXISTS(
               SELECT 1 FROM "TiraAflojaRondaPresentada" r
               WHERE r."partidaId"=v."partidaId" AND r.ronda=v.ronda)) AS orphan`;
          awaitingWitness = !evidence.orphan;
        }
        const invalid = evidenceError && !awaitingWitness;
        this.logger.warn(
          `${code}: ${p.id} ${invalid ? 'requires evidence review' : 'remains pending'}.`,
        );
        await this.prisma.$executeRaw`UPDATE "TugCompetitiveSettlement"
          SET state=${invalid ? 'INVALID' : 'PENDING'},attempts=attempts+1,"lastError"=${code},
           "retryAt"=clock_timestamp()+${awaitingWitness ? 300 : 60}::integer*interval '1 second'
          WHERE "sourceId"=${p.id}::uuid AND state='PENDING'`;
      }
    }
  }
}
