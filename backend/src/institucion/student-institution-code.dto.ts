import { Transform } from 'class-transformer';
import { IsInt, IsUUID, Matches, Max, Min } from 'class-validator';

export class RotateStudentInstitutionCodeDto {
  @IsUUID('4')
  id!: string;

  @Transform(({ obj }) => obj.revision)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
}

export class PreviewStudentInstitutionCodeDto {
  @Transform(({ obj }) =>
    typeof obj.codigo === 'string'
      ? obj.codigo.trim().toUpperCase()
      : obj.codigo,
  )
  @Matches(/^SPI-[A-F0-9]{32}$/)
  codigo!: string;
}

export class JoinStudentInstitutionCodeDto extends PreviewStudentInstitutionCodeDto {
  @IsUUID('4')
  id!: string;

  @IsUUID('4')
  institucionId!: string;

  @Transform(({ obj }) => obj.revision)
  @IsInt()
  @Min(1)
  @Max(2147483647)
  revision!: number;
}
