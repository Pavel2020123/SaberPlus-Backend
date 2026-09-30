import { ForbiddenException, SetMetadata } from '@nestjs/common';

export const INITIAL_PASSWORD_ACCESS = 'auth:initial-password-access';

// Solo para restaurar sesión y resolver el cambio inicial; nunca a nivel clase.
export const AllowInitialPasswordAccess = () =>
  SetMetadata(INITIAL_PASSWORD_ACCESS, true);

export function requireChangedInitialPassword(pending: boolean | undefined) {
  if (pending === true) {
    throw new ForbiddenException({
      statusCode: 403,
      code: 'INITIAL_PASSWORD_CHANGE_REQUIRED',
      message: 'Debes cambiar tu contraseña inicial antes de continuar.',
    });
  }
}
