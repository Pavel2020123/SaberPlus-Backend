import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, ValidateNested } from 'class-validator';
import { PREGUNTA_IDS, RespuestaOV } from './ov1.rules';

export class RespuestaVocacionalDto {
  @IsIn(PREGUNTA_IDS)
  preguntaId!: string;

  // Object metadata deliberately prevents implicit string-to-number conversion.
  @IsIn([0, 1, 2, 3, 4, 'NO_SE'])
  valor!: RespuestaOV;
}
export class GuardarRespuestasVocacionalesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ArrayUnique((r: RespuestaVocacionalDto) => r?.preguntaId)
  @ValidateNested({ each: true })
  @Type(() => RespuestaVocacionalDto)
  respuestas!: RespuestaVocacionalDto[];
}
