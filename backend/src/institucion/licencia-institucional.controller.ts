import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TipoCupoInstitucional } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { LicenciaInstitucionalService } from './licencia-institucional.service';

class OperacionDto {
  @IsUUID('4') operacionId!: string;
}
class AcuerdoDto extends OperacionDto {
  @IsIn([6, 12, 18, 24]) meses!: number;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  inicio?: string;
  @IsInt() @Min(0) @Max(2147483647) cuposEstudiantes!: number;
  @IsInt() @Min(0) @Max(2147483647) cuposDocentes!: number;
  @IsString() @MaxLength(255) @Matches(/\S/) referenciaAcuerdo!: string;
}
class SuspensionDto extends OperacionDto {
  @IsBoolean() suspendida!: boolean;
}
class UsuarioCupoDto extends OperacionDto {
  @IsUUID() usuarioId!: string;
  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  versionAsignacion?: string;
}
class AsignacionDto extends UsuarioCupoDto {
  @IsEnum(TipoCupoInstitucional) tipo!: TipoCupoInstitucional;
}
class RetornoPersonalDto extends OperacionDto {
  @IsUUID() usuarioId!: string;
  @IsUUID() asignacionId!: string;
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  versionAsignacion!: string;
}

@Controller('instituciones/:institucionId/licencia')
@UseGuards(JwtGuard)
export class LicenciaInstitucionalController {
  constructor(private readonly service: LicenciaInstitucionalService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  consultar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
  ) {
    return this.service.consultar(req.usuario.sub, id);
  }
  @Post('activar')
  @Header('Cache-Control', 'private, no-store')
  activar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: AcuerdoDto,
  ) {
    return this.service.acordar(req.usuario.sub, id, dto, false);
  }
  @Post('renovar')
  @Header('Cache-Control', 'private, no-store')
  renovar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: AcuerdoDto,
  ) {
    return this.service.acordar(req.usuario.sub, id, dto, true);
  }
  @Post('suspension')
  @Header('Cache-Control', 'private, no-store')
  suspender(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: SuspensionDto,
  ) {
    return this.service.suspender(
      req.usuario.sub,
      id,
      dto.operacionId,
      dto.suspendida,
    );
  }
  @Post('asignaciones')
  @Header('Cache-Control', 'private, no-store')
  asignar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: AsignacionDto,
  ) {
    return this.service.asignar(
      req.usuario.sub,
      id,
      dto.operacionId,
      dto.usuarioId,
      dto.tipo,
    );
  }
  @Post('aceptar')
  @Header('Cache-Control', 'private, no-store')
  aceptar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: OperacionDto,
  ) {
    return this.service.aceptar(req.usuario.sub, id, dto.operacionId);
  }
  @Post('retirar')
  @Header('Cache-Control', 'private, no-store')
  retirar(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: UsuarioCupoDto,
  ) {
    return this.service.retirar(
      req.usuario.sub,
      id,
      dto.operacionId,
      dto.usuarioId,
      dto.versionAsignacion,
    );
  }

  @Post('volver-personal')
  @Header('Cache-Control', 'private, no-store')
  volverPersonal(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Body() dto: RetornoPersonalDto,
  ) {
    return this.service.volverPersonal(
      req.usuario.sub,
      id,
      dto.operacionId,
      dto.usuarioId,
      dto.asignacionId,
      dto.versionAsignacion,
    );
  }

  @Get('bajas')
  @Header('Cache-Control', 'private, no-store')
  bajas(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
    @Query('pagina', new DefaultValuePipe(1), ParseIntPipe) pagina: number,
  ) {
    return this.service.bajas(req.usuario.sub, id, pagina);
  }

  @Get('mi-salida')
  @Header('Cache-Control', 'private, no-store')
  miSalida(
    @Request() req: AuthenticatedRequest,
    @Param('institucionId', ParseUUIDPipe) id: string,
  ) {
    return this.service.miSalida(req.usuario.sub, id);
  }
}
