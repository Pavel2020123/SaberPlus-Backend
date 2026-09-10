import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AreaIcfes, ModoBatalla, MotivoReporteBatalla } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { BatallasService } from './batallas.service';
import { IsJsonBoolean } from '../common/is-json-boolean';

class CrearBatallaDto {
  @IsEnum(ModoBatalla)
  modo!: ModoBatalla;

  @IsOptional()
  @IsEnum(AreaIcfes)
  area?: AreaIcfes;

  @IsOptional()
  @IsJsonBoolean()
  invitacionPrivada?: boolean;
}

class ResponderBatallaDto {
  @IsString()
  @MaxLength(100)
  preguntaId!: string;

  @IsString()
  @MaxLength(100)
  respuestaId!: string;
}

class UnirseInvitacionDto {
  @IsString()
  @Matches(/^[A-Za-z2-9]{8}$/)
  codigo!: string;
}

class ReportarBatallaDto {
  @IsEnum(MotivoReporteBatalla)
  motivo!: MotivoReporteBatalla;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}

@Controller('batallas')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class BatallasController {
  constructor(private readonly batallasService: BatallasService) {}

  @Get()
  listar(@Request() request: AuthenticatedRequest) {
    return this.batallasService.listar(request.usuario.sub);
  }

  @Get('bloqueos')
  listarBloqueos(@Request() request: AuthenticatedRequest) {
    return this.batallasService.listarBloqueos(request.usuario.sub);
  }

  @Post('invitaciones/unirse')
  unirseInvitacion(
    @Request() request: AuthenticatedRequest,
    @Body() body: UnirseInvitacionDto,
  ) {
    return this.batallasService.unirseInvitacion(
      request.usuario.sub,
      body.codigo,
    );
  }

  @Post()
  crear(
    @Request() request: AuthenticatedRequest,
    @Body() body: CrearBatallaDto,
  ) {
    return this.batallasService.crear(request.usuario.sub, body);
  }

  @Get(':id')
  obtener(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.obtenerDetalle(request.usuario.sub, batallaId);
  }

  @Post(':id/cancelar')
  cancelar(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.cancelar(request.usuario.sub, batallaId);
  }

  @Post(':id/aceptar')
  aceptar(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.aceptar(request.usuario.sub, batallaId);
  }

  @Post(':id/iniciar')
  iniciar(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.iniciar(request.usuario.sub, batallaId);
  }

  @Post(':id/respuestas')
  responder(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
    @Body() body: ResponderBatallaDto,
  ) {
    return this.batallasService.responder(request.usuario.sub, batallaId, body);
  }

  @Post(':id/finalizar')
  finalizar(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.finalizar(request.usuario.sub, batallaId);
  }

  @Post(':id/bloquear-rival')
  bloquearRival(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
  ) {
    return this.batallasService.bloquearRival(request.usuario.sub, batallaId);
  }

  @Post(':id/reportes')
  reportar(
    @Request() request: AuthenticatedRequest,
    @Param('id') batallaId: string,
    @Body() body: ReportarBatallaDto,
  ) {
    return this.batallasService.reportar(request.usuario.sub, batallaId, body);
  }

  @Delete('bloqueos/:id')
  desbloquear(
    @Request() request: AuthenticatedRequest,
    @Param('id') bloqueoId: string,
  ) {
    return this.batallasService.desbloquear(request.usuario.sub, bloqueoId);
  }
}
