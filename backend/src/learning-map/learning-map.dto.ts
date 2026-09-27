import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MAX_DIRECT_BASES } from './learning-map.graph';

export class MapSubtopicDto {
  @IsString()
  @MaxLength(128)
  @Matches(/^[a-zA-Z0-9_-]+$/)
  id!: string;
}

export class ReplaceLearningBasesDto {
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;

  @IsArray()
  @ArrayMaxSize(MAX_DIRECT_BASES)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(128, { each: true })
  @Matches(/^[a-zA-Z0-9_-]+$/, { each: true })
  previos!: string[];
}
