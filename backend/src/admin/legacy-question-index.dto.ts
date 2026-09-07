import { AreaIcfes } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class LegacyIndexBatchDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limite = 25;
}
export class ApplyLegacyIndexDto extends LegacyIndexBatchDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) revision!: string;
  // Global implicit conversion would turn the string "false" into true.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmado, {
    toClassOnly: true,
  })
  @Equals(true)
  confirmado!: boolean;
}
export class LegacyDuplicatesDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @Type(() => Number) @IsInt() @Min(1) @Max(20) limite = 10;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) despues?: string;
}
export class LegacyMatchesDto extends LegacyIndexBatchDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) despues?: string;
}
export class LegacyFingerprintParams {
  @IsString() @Matches(/^[a-f0-9]{64}$/) huella!: string;
}
