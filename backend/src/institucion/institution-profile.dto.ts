import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateInstitutionProfileDto {
  // Recuperar el valor original evita coerciones implícitas de booleanos/textos.
  @Transform(({ obj }) => obj.revision)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;

  @Transform(({ obj }) =>
    typeof obj.descripcion === 'string'
      ? obj.descripcion.trim()
      : obj.descripcion,
  )
  @IsString()
  @MaxLength(500)
  descripcion!: string;
}
