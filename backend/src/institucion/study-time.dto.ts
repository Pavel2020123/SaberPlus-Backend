import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';

export const POMODORO_EVENT_ID =
  /^pomodoro:(?:[0-9]{13,20}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/;

export class PomodoroEventDto {
  @IsString()
  @Matches(POMODORO_EVENT_ID)
  eventoId!: string;

  @IsInt()
  @Equals(1500)
  duracionSegundos!: number;

  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  finalizadoEn!: string;
}

export class SyncPomodorosDto {
  @Equals(1)
  version!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PomodoroEventDto)
  eventos!: PomodoroEventDto[];
}

export class StudyTimeQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([7, 30, 90])
  dias: number = 30;
}
