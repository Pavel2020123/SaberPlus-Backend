import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { DiagnosticoService } from './diagnostico.service';

class RespuestaDiagnosticoDto {
  @IsString()
  @IsNotEmpty()
  preguntaId!: string;

  @IsString()
  @IsNotEmpty()
  respuestaId!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(7200)
  tiempoRespuestaSegundos?: number;
}

class FinalizarDiagnosticoDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RespuestaDiagnosticoDto)
  respuestas!: RespuestaDiagnosticoDto[];
}

@Controller('diagnostico-inicial')
@UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
export class DiagnosticoController {
  constructor(private readonly diagnosticoService: DiagnosticoService) {}

  @Get()
  obtenerEstado(@Request() req: AuthenticatedRequest) {
    return this.diagnosticoService.obtenerEstado(req.usuario.sub);
  }

  @Post('iniciar')
  iniciar(@Request() req: AuthenticatedRequest) {
    return this.diagnosticoService.iniciar(req.usuario.sub);
  }

  @Post('finalizar')
  finalizar(
    @Request() req: AuthenticatedRequest,
    @Body() body: FinalizarDiagnosticoDto,
  ) {
    return this.diagnosticoService.finalizar(req.usuario.sub, body.respuestas);
  }
}
