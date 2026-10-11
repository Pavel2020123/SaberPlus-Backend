import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  Matches,
  ValidateIf,
} from 'class-validator';

export class InstitutionDirectoryQuery {
  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @Matches(/^\d{2}$/)
  departamentoCodigo?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @Transform(({ obj, key }) => obj[key])
  @IsString()
  @Matches(/^\d{5}$/)
  municipioCodigo?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @MaxLength(120)
  q?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pagina = 1;
}
