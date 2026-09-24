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
import { KnowledgeShieldService } from './knowledge-shield.service';

export class CreateKnowledgeShieldDto {
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @IsOptional() @IsEnum(Dificultad) dificultad?: Dificultad;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(100) temaId?: string;
  @IsOptional() @IsString() @Matches(/\S/) @MaxLength(100) subtemaId?: string;
}
export class KnowledgeShieldAnswerDto {
  @IsString() @Matches(/\S/) @MaxLength(100) preguntaId!: string;
  @IsString() @Matches(/\S/) @MaxLength(100) respuestaId!: string;
  @IsUUID() idempotencyKey!: string;
}

@Controller('escudo-conocimiento')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class KnowledgeShieldController {
  constructor(private readonly knowledgeShield: KnowledgeShieldService) {}
  @Post('intentos')
  start(
    @Request() req: AuthenticatedRequest,
    @Body() body: CreateKnowledgeShieldDto,
  ) {
    return this.knowledgeShield.start(req.usuario.sub, body);
  }
  @Get('intentos/activo')
  active(@Request() req: AuthenticatedRequest) {
    return this.knowledgeShield.active(req.usuario.sub);
  }
  @Get('intentos/:id')
  get(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.knowledgeShield.get(req.usuario.sub, id);
  }
  @Post('intentos/:id/respuestas')
  answer(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: KnowledgeShieldAnswerDto,
  ) {
    return this.knowledgeShield.answer(req.usuario.sub, id, body);
  }
  @Post('intentos/:id/abandonar')
  abandon(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.knowledgeShield.abandon(req.usuario.sub, id);
  }
}
