import { Transform } from 'class-transformer';
import {
  Equals,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ReclassificationParams {
  @IsString() @MinLength(1) @MaxLength(120) id!: string;
}
export class ReclassificationDestinationDto {
  @IsString() @MinLength(1) @MaxLength(120) destinoSubtemaId!: string;
}
export class ApplyReclassificationDto extends ReclassificationDestinationDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) revision!: string;
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.confirmado, {
    toClassOnly: true,
  })
  @Equals(true)
  confirmado!: boolean;
}
