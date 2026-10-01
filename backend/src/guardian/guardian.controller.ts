import { Transform } from 'class-transformer';
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
  IsBoolean,
  IsOptional,
  IsString,
  IsNotEmpty,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { GuardianService } from './guardian.service';

class CreateGuardianDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ obj }) => obj.competitive)
  competitive?: boolean;
  @IsEnum(AreaIcfes) area!: AreaIcfes;
  @IsEnum(Dificultad) dificultad!: Dificultad;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) subtemaId?: string;
}
class GuardianAnswerDto {
  @IsString() @IsNotEmpty() @MaxLength(100) preguntaId!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) respuestaId!: string;
  @IsUUID() idempotencyKey!: string;
}

@Controller('guardian')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class GuardianController {
  constructor(private readonly guardian: GuardianService) {}
  @Post('intentos')
  start(@Request() req: AuthenticatedRequest, @Body() body: CreateGuardianDto) {
    return this.guardian.start(req.usuario.sub, body);
  }
  @Get('intentos/activo')
  active(@Request() req: AuthenticatedRequest) {
    return this.guardian.active(req.usuario.sub);
  }
  @Get('intentos/:id')
  get(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.guardian.get(req.usuario.sub, id);
  }
  @Post('intentos/:id/respuestas')
  answer(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: GuardianAnswerDto,
  ) {
    return this.guardian.answer(req.usuario.sub, id, body);
  }
  @Post('intentos/:id/abandonar')
  abandon(
    @Request() req: AuthenticatedRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.guardian.abandon(req.usuario.sub, id);
  }
}
