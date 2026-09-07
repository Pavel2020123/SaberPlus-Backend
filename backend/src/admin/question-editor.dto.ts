import { AreaIcfes, Dificultad } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CatalogPageDto } from './academic-catalog.controller';

export class EditorialOptionDto {
  @IsString() @MinLength(1) @MaxLength(4000) texto!: string;
  @IsBoolean() esCorrecta!: boolean;
  @IsString() @MaxLength(4000) explicacion!: string;
}
export class EditorialQuestionDto {
  @IsString() @MinLength(1) @MaxLength(120) subtemaId!: string;
  @IsString() @MinLength(1) @MaxLength(12000) enunciado!: string;
  @IsString() @MinLength(1) @MaxLength(12000) explicacion!: string;
  @IsString() @MaxLength(2000) imagenUrl!: string;
  @IsEnum(Dificultad) dificultad!: Dificultad;
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => EditorialOptionDto)
  respuestas!: EditorialOptionDto[];
  @IsString() @MaxLength(120) casoId!: string;
  @IsOptional() @IsInt() @Min(1) @Max(10000) ordenEnCaso?: number;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) revision?: string;
}
export class EditorialCaseDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @IsString() @MinLength(1) @MaxLength(200) titulo!: string;
  @IsString() @MinLength(1) @MaxLength(20000) contexto!: string;
  @IsString() @MaxLength(2000) imagenUrl!: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) revision?: string;
}
export class EditorialQuestionsQuery extends CatalogPageDto {
  @IsString() @MinLength(1) @MaxLength(120) subtemaId!: string;
}
export class EditorialCasesQuery extends CatalogPageDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
}
