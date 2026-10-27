import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  registerDecorator,
} from 'class-validator';
import {
  AreaIcfes,
  EstadoReportePregunta,
  MotivoReportePregunta,
} from '@prisma/client';

/** Preserve JSON types even when the global pipe enables implicit conversion. */
const Raw = () =>
  Transform(
    ({ obj, key }: { obj: Record<string, unknown>; key: string }) => obj[key],
    { toClassOnly: true },
  );
export const optionalField = (_: unknown, value: unknown) =>
  value !== undefined;
function ReportText(required = false): PropertyDecorator {
  return (target, propertyName) =>
    registerDecorator({
      name: 'reportText',
      target: target.constructor,
      propertyName: String(propertyName),
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          [...value.trim()].length <= 500 &&
          (!required || value.trim().length > 0) &&
          [...value].every((character) => {
            const code = character.charCodeAt(0);
            const loneSurrogate =
              character.length === 1 && code >= 0xd800 && code <= 0xdfff;
            return (
              !loneSurrogate &&
              code !== 127 &&
              (code >= 32 || ['\t', '\n', '\r'].includes(character))
            );
          }),
        defaultMessage: () => 'Escribe texto válido de hasta 500 caracteres.',
      },
    });
}

export class CreateQuestionReportDto {
  @Raw() @IsUUID('4') operacionId!: string;
  @Raw() @IsString() @MaxLength(120) @Matches(/^\S+$/) preguntaId!: string;
  @Raw() @IsEnum(MotivoReportePregunta) motivo!: MotivoReportePregunta;
  @ValidateIf(optionalField) @Raw() @ReportText() detalle?: string;
}

export class ReviewQuestionReportDto {
  @Raw() @IsUUID('4') operacionId!: string;
  @Raw() @IsInt() @Min(0) @Max(2147483646) revision!: number;
  @Raw() @IsEnum(EstadoReportePregunta) destino!: EstadoReportePregunta;
  @Raw() @ReportText(true) motivoRevision!: string;
}

export class QuestionReportPageDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(10000) pagina = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limite = 20;
}

export class AdminQuestionReportQuery extends QuestionReportPageDto {
  @ValidateIf(optionalField) @Raw() @IsEnum(AreaIcfes) area?: AreaIcfes;
  @ValidateIf(optionalField)
  @Raw()
  @IsEnum(EstadoReportePregunta)
  estado?: EstadoReportePregunta;
  @ValidateIf(optionalField)
  @Raw()
  @IsEnum(MotivoReportePregunta)
  motivo?: MotivoReportePregunta;
  @ValidateIf(optionalField)
  @Raw()
  @IsString()
  @MaxLength(120)
  @Matches(/^\S+$/)
  subtemaId?: string;
}
