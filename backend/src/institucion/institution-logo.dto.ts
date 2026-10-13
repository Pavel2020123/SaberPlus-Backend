import { Transform } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class InstitutionLogoDto {
  // Multipart trae texto; solo admitir la representación decimal canónica.
  @Transform(({ obj }) =>
    typeof obj.revision === 'string' && /^(0|[1-9]\d{0,9})$/.test(obj.revision)
      ? Number(obj.revision)
      : typeof obj.revision === 'number'
        ? obj.revision
        : NaN,
  )
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
}

export function managedLogoUrl(value?: string | null): string | null {
  return typeof value === 'string' &&
    /^\/instituciones\/directorio\/[0-9a-f-]{36}\/logo\/[1-9]\d{0,9}$/.test(
      value,
    )
    ? value
    : null;
}
