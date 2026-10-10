import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class InstitutionDirectoryQuery {
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
