import { ForbiddenException } from '@nestjs/common';

/** Server-only admission gate. Never apply to accepted attempts or settlement. */
export function assertSoloCompetitiveCreationAllowed(competitive?: boolean) {
  if (competitive === true && process.env.COMPETITIVE_SOLO_ENABLED !== 'true') {
    throw new ForbiddenException({
      code: 'COMPETITIVE_SOLO_DISABLED',
      message:
        'La creacion de nuevas partidas competitivas esta deshabilitada.',
    });
  }
}
