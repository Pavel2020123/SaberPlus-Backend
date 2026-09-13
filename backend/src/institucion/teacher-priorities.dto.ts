import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AreaIcfes } from '@prisma/client';

export class CreateTeacherPriorityDto {
  // El cliente genera este UUID UNA vez y lo conserva al reintentar.
  @IsUUID('4')
  id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  temaId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  subtemaId?: string;

  @IsISO8601({ strict: true })
  venceEn!: string;
}

export class TeacherPriorityPageDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pagina = 1;
}

export class TeacherPriorityCatalogDto extends TeacherPriorityPageDto {
  @IsOptional()
  @IsEnum(AreaIcfes)
  area?: AreaIcfes;
}
