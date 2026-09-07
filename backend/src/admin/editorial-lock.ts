import { BadRequestException } from '@nestjs/common';
import { AreaIcfes, Prisma } from '@prisma/client';

/** Acquire before catalog/name locks and parent/child row locks, never after. */
export async function lockEditorialArea(
  tx: Prisma.TransactionClient,
  area: AreaIcfes,
): Promise<void> {
  if (!Object.values(AreaIcfes).includes(area))
    throw new BadRequestException('El área editorial no es válida.');
  await tx.$queryRaw`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`editor:area:${area}`}))`;
}
