import { Transform, Type } from 'class-transformer';
import { IsJsonBoolean } from '../common/is-json-boolean';
import {
  Equals,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const approvalStates = [
  'PENDIENTE',
  'REQUIERE_INFORMACION',
  'APROBADA',
  'RECHAZADA',
  'SUSPENDIDA',
  'LEGADO_EN_REVISION',
] as const;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;

export class SubmitInstitutionDto {
  @IsInt() @Min(0) @Max(1000000) revision!: number;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) nombre!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(120) ciudad!: string;
  @Transform(trim) @IsEmail() @MaxLength(254) correoInstitucional!: string;
  @Transform(trim) @IsString() @MinLength(5) @MaxLength(120) contacto!: string;
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true, require_tld: true })
  @MaxLength(500)
  referenciaUrl?: string;
  @Transform(trim)
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  evidencia!: string;
  @IsJsonBoolean() @Equals(true) declaracion!: boolean;
}

export class ReviewInstitutionDto {
  @IsInt() @Min(1) @Max(1000000) revision!: number;
  @IsIn(['APROBADA', 'RECHAZADA', 'REQUIERE_INFORMACION', 'SUSPENDIDA'])
  estado!: 'APROBADA' | 'RECHAZADA' | 'REQUIERE_INFORMACION' | 'SUSPENDIDA';
  @Transform(trim) @IsString() @MinLength(10) @MaxLength(1000) mensaje!: string;
  @Transform(trim)
  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  notaInterna!: string;
  @IsJsonBoolean() @Equals(true) confirmado!: boolean;
}

export class ApprovalListDto {
  @IsOptional() @IsIn(approvalStates) estado?: (typeof approvalStates)[number];
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) pagina = 1;
}
export class InstitutionMatchDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(120)
  nombre!: string;
}
