import {
  Equals,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CARD_VERSION } from './card-registry';
export class ReviewEventDto {
  @Equals(1) version!: number;
  @IsUUID('4') eventoId!: string;
  @IsString() @MaxLength(200) tarjetaId!: string;
  @Equals(CARD_VERSION) contenidoVersion!: string;
  @IsInt() @Min(0) @Max(2147483646) revision!: number;
  @IsIn(['remembered', 'needsPractice']) resultado!:
    | 'remembered'
    | 'needsPractice';
}
