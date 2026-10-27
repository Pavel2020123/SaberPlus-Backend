import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateStudentInstitutionRequestDto {
  // UUID de operación generado una vez por el cliente; conservar al reintentar.
  @IsUUID('4')
  id!: string;

  @IsUUID('4')
  institucionId!: string;

  @IsOptional()
  @Transform(({ obj }) => obj.mensaje)
  @IsString()
  @MaxLength(500)
  mensaje?: string;
}

export class StudentInstitutionRequestRevisionDto {
  // La API habilita conversión implícita: conservar el tipo JSON original.
  @Transform(({ obj }) => obj.revision)
  @IsInt()
  @Min(0)
  @Max(2147483646)
  revision!: number;
}

export class ReviewStudentInstitutionRequestDto extends StudentInstitutionRequestRevisionDto {
  @IsIn(['APROBAR', 'RECHAZAR'])
  decision!: 'APROBAR' | 'RECHAZAR';
}

export class StudentInstitutionRequestsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pagina: number = 1;
}

export class OwnerStudentInstitutionRequestsQuery extends StudentInstitutionRequestsQuery {
  @IsOptional()
  @IsIn(['PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA'])
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA' = 'PENDIENTE';
}
