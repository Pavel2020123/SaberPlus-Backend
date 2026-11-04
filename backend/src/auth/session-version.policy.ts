import { UnauthorizedException } from '@nestjs/common';

/** Missing versions only represent legacy v0; they cannot revive a reset account. */
export function exigirVersionSesion(actual: unknown, recibida: unknown): void {
  const versionActual = actual === undefined ? 0 : actual;
  const versionRecibida = recibida === undefined ? 0 : recibida;
  if (
    !Number.isSafeInteger(versionActual) ||
    !Number.isSafeInteger(versionRecibida) ||
    (versionActual as number) < 0 ||
    (versionRecibida as number) < 0 ||
    versionActual !== versionRecibida
  ) {
    throw new UnauthorizedException(
      'La sesión ya no es válida. Inicia sesión de nuevo.',
    );
  }
}
