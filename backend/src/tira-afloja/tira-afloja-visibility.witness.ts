import { PrismaClient } from '@prisma/client';
import { randomInt } from 'node:crypto';

/** Private post-COMMIT witness, never invoked with the writer's transaction. */
export class TiraAflojaVisibilityWitness {
  private client?: PrismaClient;
  private identity?: Promise<void>;
  constructor(private readonly source: PrismaClient) {}
  // Separate pool. Verify the actual PostgreSQL database before any evidence query.
  private database(): PrismaClient {
    return (this.client ??= new PrismaClient());
  }
  async certify(partidaId: string): Promise<void> {
    const db = this.database();
    this.identity ??= this.verifyDatabase(db).catch((error) => {
      this.identity = undefined;
      throw error;
    });
    await this.identity;
    const rounds = await db.$queryRaw<{ ronda: number }[]>`
      SELECT DISTINCT r.ronda FROM "TiraAflojaRondaPresentada" r
      JOIN "PartidaTiraAfloja" m ON m.id=r."partidaId"
      WHERE m.id=${partidaId}::uuid AND m."certificacionRVersion"=1
        AND timezone('UTC',clock_timestamp())<least(r."venceEn",m."expiraEn")
        AND NOT EXISTS(SELECT 1 FROM "TugRoundVisibility" c
          WHERE c."partidaId"=r."partidaId" AND c.ronda=r.ronda)
      ORDER BY r.ronda`;
    for (const { ronda } of rounds) {
      try {
        await db.$queryRaw`SELECT tug_certify_presented_round(${partidaId}::uuid,${ronda}::integer) AS certified`;
      } catch (error) {
        // Expiration while waiting for a lock leaves R uncertified. Missing
        // schema, connectivity and other SQL errors must remain visible.
        if (error?.code !== 'P2010' || error?.meta?.code !== 'PT001')
          throw error;
      }
    }
  }
  private async verifyDatabase(db: PrismaClient): Promise<void> {
    // A random, transaction-scoped challenge is visible only in this database's
    // advisory-lock namespace. No application rows or persistent settings change.
    const a = randomInt(1, 2147483647), b = randomInt(1, 2147483647);
    await this.source.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(${a}::integer,${b}::integer)::text`;
      await db.$transaction(async (observer) => {
        const [proof] = await observer.$queryRaw<{ acquired: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${a}::integer,${b}::integer) AS acquired`;
        if (proof.acquired)
          throw new Error('TUG_WITNESS_DATABASE_MISMATCH');
      });
    });
  }
  async close(): Promise<void> {
    await this.client?.$disconnect();
    this.client = undefined;
    this.identity = undefined;
  }
}
