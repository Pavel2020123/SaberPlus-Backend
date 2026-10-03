import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export async function requireTugPresence(
  tx: Prisma.TransactionClient,
  matchId: string,
  userId: string,
) {
  try {
    const [row] = await tx.$queryRaw<{ at: Date }[]>`
      SELECT tug_presence_require_open(${matchId}::uuid,${userId}::uuid) AS at`;
    return row.at;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2010' &&
      String(error.meta?.message).includes('TUG_PRESENCE_REQUIRED')
    ) {
      throw new ConflictException('TUG_PRESENCE_REQUIRED');
    }
    throw error;
  }
}

@Injectable()
export class TiraAflojaPresenceService {
  readonly instanceId = randomUUID();
  constructor(private readonly db: PrismaService) {}
  async enrolled(matchId: string) {
    const match = await this.db.partidaTiraAfloja.findUnique({
      where: { id: matchId },
      select: { presenciaVersion: true },
    });
    return match?.presenciaVersion === 1;
  }
  async isOpen(matchId: string, userId: string) {
    const [row] = await this.db.$queryRaw<{ valid: boolean }[]>`
      SELECT EXISTS(SELECT 1 FROM "TugConnection" WHERE "matchId"=${matchId}::uuid
        AND "userId"=${userId}::uuid AND state='OPEN'
        AND "leaseUntil">timezone('UTC',clock_timestamp())) AS valid`;
    return row.valid;
  }
  async connect(
    userId: string,
    matchId: string,
    connectionId: string,
    authUntil?: Date,
  ) {
    const [row] = await this.db.$queryRaw<{ state: string }[]>`
      SELECT tug_presence_connect(${matchId}::uuid,${userId}::uuid,
        ${connectionId}::uuid,${this.instanceId}::uuid,NULL::timestamp,${authUntil ?? null}::timestamp) AS state`;
    return row.state;
  }
  async observe(
    matchId: string,
    connectionId: string,
    operation: 'RENEW' | 'DISCONNECT' | 'UNCERTAIN',
  ) {
    const [row] = await this.db.$queryRaw<{ state: string }[]>`
      SELECT tug_presence_observe(${matchId}::uuid,${connectionId}::uuid,
        ${this.instanceId}::uuid,${operation},NULL::timestamp) AS state`;
    return row.state;
  }
}
