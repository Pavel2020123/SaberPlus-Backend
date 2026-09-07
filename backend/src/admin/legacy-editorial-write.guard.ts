import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  GoneException,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export const LEGACY_EDITORIAL_REPLACEMENT = 'editorial:legacy-replacement';

/** Do not forward old payloads: they lack an explicit revision/confirmation. */
@Injectable()
export class LegacyEditorialWriteGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): never {
    const replacement = this.reflector.get<string>(
      LEGACY_EDITORIAL_REPLACEMENT,
      context.getHandler(),
    );
    throw new GoneException({
      statusCode: 410,
      code: 'LEGACY_EDITORIAL_WRITE_RETIRED',
      message:
        'Esta escritura editorial fue retirada. Usa el editor ADMIN con su revisión actual; no reenvíes automáticamente este cuerpo.',
      replacement: replacement ?? null,
    });
  }
}

export function RetiredEditorialWrite(replacement: string) {
  return applyDecorators(
    SetMetadata(LEGACY_EDITORIAL_REPLACEMENT, replacement),
    UseGuards(LegacyEditorialWriteGuard),
  );
}
