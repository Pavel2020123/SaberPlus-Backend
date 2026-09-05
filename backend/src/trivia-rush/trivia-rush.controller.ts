import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  BadRequestException,
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
import { AreaIcfes, TipoPotenciadorTriviaRush } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { TriviaRushService } from './trivia-rush.service';

class CrearTriviaRushDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @IsEnum(AreaIcfes, { each: true })
  areas!: AreaIcfes[];

  @IsIn([60, 90, 120])
  duracionSegundos!: number;
}

class ResponderTriviaRushDto {
  @IsString()
  @MaxLength(100)
  preguntaId!: string;

  @IsString()
  @MaxLength(100)
  respuestaId!: string;

  @IsUUID()
  idempotencyKey!: string;
}

class ActivarPotenciadorDto {
  @IsString()
  @MaxLength(100)
  preguntaId!: string;

  @IsEnum(TipoPotenciadorTriviaRush)
  potenciador!: TipoPotenciadorTriviaRush;

  @IsUUID()
  concesionId!: string;

  @IsUUID()
  idempotencyKey!: string;
}

@Controller('trivia-rush')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class TriviaRushController {
  constructor(private readonly triviaRushService: TriviaRushService) {}

  @Post('intentos')
  crear(
    @Request() request: AuthenticatedRequest,
    @Body() body: CrearTriviaRushDto,
  ) {
    return this.triviaRushService.crear(request.usuario.sub, body);
  }

  @Get('intentos/activo')
  obtenerActivo(@Request() request: AuthenticatedRequest) {
    return this.triviaRushService.obtenerActivo(request.usuario.sub);
  }

  @Get('fantasma')
  obtenerFantasma(
    @Request() request: AuthenticatedRequest,
    @Query('areas') areas: string,
    @Query('duracionSegundos', new ParseIntPipe()) duracionSegundos: number,
  ) {
    const valores = (areas ?? '')
      .split(',')
      .map((area) => area.trim())
      .filter(Boolean);
    const validas = valores.filter((area): area is AreaIcfes =>
      Object.values(AreaIcfes).includes(area as AreaIcfes),
    );
    if (
      validas.length === 0 ||
      validas.length !== valores.length ||
      new Set(validas).size !== validas.length
    ) {
      throw new BadRequestException(
        'Debes indicar entre una y cinco areas validas sin repetir.',
      );
    }
    return this.triviaRushService.obtenerFantasma(request.usuario.sub, {
      areas: validas,
      duracionSegundos,
    });
  }

  @Get('intentos/:id')
  obtener(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) intentoId: string,
  ) {
    return this.triviaRushService.obtener(request.usuario.sub, intentoId);
  }

  @Post('intentos/:id/respuestas')
  responder(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) intentoId: string,
    @Body() body: ResponderTriviaRushDto,
  ) {
    return this.triviaRushService.responder(
      request.usuario.sub,
      intentoId,
      body,
    );
  }

  @Post('intentos/:id/potenciadores')
  activarPotenciador(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) intentoId: string,
    @Body() body: ActivarPotenciadorDto,
  ) {
    return this.triviaRushService.activarPotenciador(
      request.usuario.sub,
      intentoId,
      body,
    );
  }

  @Post('intentos/:id/finalizar')
  finalizar(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) intentoId: string,
  ) {
    return this.triviaRushService.finalizar(request.usuario.sub, intentoId);
  }

  @Post('intentos/:id/abandonar')
  abandonar(
    @Request() request: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) intentoId: string,
  ) {
    return this.triviaRushService.abandonar(request.usuario.sub, intentoId);
  }
}
