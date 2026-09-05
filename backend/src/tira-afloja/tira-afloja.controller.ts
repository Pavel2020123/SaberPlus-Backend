import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { TiraAflojaService } from './tira-afloja.service';

class BuscarPartidaDto {
  @IsOptional()
  @IsEnum(AreaIcfes)
  area?: AreaIcfes;
}

class ResponderRondaDto {
  @IsInt()
  @Min(1)
  ronda!: number;

  @IsUUID()
  preguntaId!: string;

  @IsUUID()
  respuestaId!: string;

  @IsUUID()
  idempotencyKey!: string;
}

@Controller('tira-afloja')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class TiraAflojaController {
  constructor(private readonly tiraAflojaService: TiraAflojaService) {}

  @Post('emparejamiento')
  emparejar(
    @Request() request: AuthenticatedRequest,
    @Body() body: BuscarPartidaDto,
  ) {
    return this.tiraAflojaService.emparejar(request.usuario.sub, body.area);
  }

  @Get('activa')
  obtenerActiva(@Request() request: AuthenticatedRequest) {
    return this.tiraAflojaService.obtenerActiva(request.usuario.sub);
  }

  @Get(':id')
  obtener(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) partidaId: string,
    @Query('desdeVersion', new ParseIntPipe({ optional: true }))
    desdeVersion?: number,
  ) {
    return this.tiraAflojaService.obtener(
      request.usuario.sub,
      partidaId,
      desdeVersion,
    );
  }

  @Post(':id/listo')
  marcarListo(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) partidaId: string,
  ) {
    return this.tiraAflojaService.marcarListo(request.usuario.sub, partidaId);
  }

  @Post(':id/respuestas')
  responder(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) partidaId: string,
    @Body() body: ResponderRondaDto,
  ) {
    return this.tiraAflojaService.responder(
      request.usuario.sub,
      partidaId,
      body,
    );
  }

  @Post(':id/abandonar')
  abandonar(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) partidaId: string,
  ) {
    return this.tiraAflojaService.abandonar(request.usuario.sub, partidaId);
  }
}
