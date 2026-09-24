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
import { AreaIcfes, Dificultad } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { StarRescueService } from './star-rescue.service';

export class CreateStarRescueDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @IsOptional() @IsEnum(Dificultad) dificultad?: Dificultad;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(100) temaId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(100) subtemaId?: string;
}
export class StarRescueAnswerDto {
  @IsString() @Matches(/\S/) @MaxLength(100) preguntaId!: string;
  @IsString() @Matches(/\S/) @MaxLength(100) respuestaId!: string;
  @IsUUID() idempotencyKey!: string;
}

@Controller('rescate-estrellas')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class StarRescueController {
  constructor(private readonly starRescue: StarRescueService) {}
  @Post('intentos')
  start(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateStarRescueDto,
  ) {
    return this.starRescue.start(req.usuario.sub, body);
  }
  @Get('intentos/activo')
  active(@Request() req: AuthenticatedRequest) {
    return this.starRescue.active(req.usuario.sub);
  }
  @Get('intentos/:id')
  get(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.starRescue.get(req.usuario.sub, id);
  }
  @Post('intentos/:id/respuestas')
  answer(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: StarRescueAnswerDto,
  ) {
    return this.starRescue.answer(req.usuario.sub, id, body);
  }
  @Post('intentos/:id/abandonar')
  abandon(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.starRescue.abandon(req.usuario.sub, id);
  }
}
