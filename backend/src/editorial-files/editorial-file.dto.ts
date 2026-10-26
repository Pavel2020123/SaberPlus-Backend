import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  AutorizacionArchivoEditorial,
  MotivoRevocacionArchivo,
} from '@prisma/client';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RevokeEditorialFileDto {
  @IsUUID('4')
  operacionId!: string;

  @IsEnum(MotivoRevocacionArchivo)
  motivo!: MotivoRevocacionArchivo;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  detalle!: string;
}

export class UploadEditorialFileDto {
  @IsUUID('4')
  operacionId!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  titulo!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  textoAlternativo!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  fuente!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  titular!: string;

  @IsEnum(AutorizacionArchivoEditorial)
  autorizacion!: AutorizacionArchivoEditorial;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  @Matches(/^[^\p{Cc}\p{Cf}]+$/u)
  referenciaAutorizacion?: string;
}
