import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AreaIcfes } from '@prisma/client';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { TriviaRushService } from './trivia-rush.service';

class CrearTugLocalDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(AreaIcfes, { each: true })
  areas!: AreaIcfes[];
}

class RondaTugLocalDto {
  @IsString()
  @MaxLength(100)
  preguntaId!: string;
}

class TimeoutTugLocalDto extends RondaTugLocalDto {
  @IsUUID()
  idempotencyKey!: string;
}

class RespuestaTugLocalDto extends TimeoutTugLocalDto {
  @IsString()
  @MaxLength(100)
  respuestaId!: string;
}

@Controller('tira-local/intentos')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class TugLocalController {
  constructor(private readonly service: TriviaRushService) {}

  @Post()
  crear(
    @Request() request: AuthenticatedRequest,
    @Body() body: CrearTugLocalDto,
  ) {
    return this.service.crear(request.usuario.sub, {
      areas: body.areas,
      duracionSegundos: 60,
      modalidad: 'TUG_LOCAL',
    });
  }

  @Get(':id')
  async obtener(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.service.verificarFlujo(request.usuario.sub, id, true);
    return this.service.obtener(request.usuario.sub, id);
  }

  @Post(':id/ronda')
  iniciar(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RondaTugLocalDto,
  ) {
    return this.service.iniciarRondaLocal(
      request.usuario.sub,
      id,
      body.preguntaId,
    );
  }

  @Post(':id/sin-respuesta')
  timeout(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: TimeoutTugLocalDto,
  ) {
    return this.service.vencerRondaLocal(request.usuario.sub, id, body);
  }

  @Post(':id/respuestas')
  async responder(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: RespuestaTugLocalDto,
  ) {
    await this.service.verificarFlujo(request.usuario.sub, id, true);
    return this.service.responder(request.usuario.sub, id, body, true);
  }

  @Post(':id/abandonar')
  async abandonar(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    await this.service.verificarFlujo(request.usuario.sub, id, true);
    return this.service.abandonar(request.usuario.sub, id);
  }
}
