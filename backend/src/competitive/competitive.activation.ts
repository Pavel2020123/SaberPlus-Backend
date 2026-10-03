import { ForbiddenException } from '@nestjs/common';

export function assertTriviaCompetitiveCreationAllowed(mode?: string) {
  const flag =
    mode === 'TRIVIA_RUSH'
      ? 'COMPETITIVE_TRIVIA_ENABLED'
      : mode === 'GHOST_DUEL'
        ? 'COMPETITIVE_GHOST_ENABLED'
        : undefined;
  if (!flag || process.env[flag] !== 'true')
    throw new ForbiddenException({
      code: 'COMPETITIVE_TRIVIA_DISABLED',
      message: 'La modalidad competitiva no esta habilitada.',
    });
}

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
