import { ForbiddenException } from '@nestjs/common';

export type VerificationState = {
  estadoVerificacion?: string;
  transicionHasta?: Date | null;
};

export function institutionOperational(
  value: VerificationState | null,
  now = new Date(),
) {
  return (
    value?.estadoVerificacion === 'APROBADA' ||
    (value?.estadoVerificacion === 'LEGADO_EN_REVISION' &&
      value.transicionHasta instanceof Date &&
      value.transicionHasta > now)
  );
}

export function requireInstitutionOperational(value: VerificationState | null) {
  if (!institutionOperational(value)) {
    throw new ForbiddenException({
      codigo: 'INSTITUCION_NO_APROBADA',
      mensaje:
        'La institución necesita aprobación de SaberPlus. Consulta el estado de su verificación.',
    });
  }
}
