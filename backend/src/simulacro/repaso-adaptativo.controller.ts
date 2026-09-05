import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { RepasoAdaptativoService } from './repaso-adaptativo.service';

class GenerarRepasoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(30)
  cantidad?: number;
}

class RespuestaAdaptativaDto {
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

class CalificarRepasoDto {
  @IsUUID()
  intentoId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RespuestaAdaptativaDto)
  respuestas!: RespuestaAdaptativaDto[];
}

@Controller('repaso-adaptativo')
@UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
export class RepasoAdaptativoController {
  constructor(private readonly repaso: RepasoAdaptativoService) {}

  @Get('perfil')
  obtenerPerfil(@Request() request: AuthenticatedRequest) {
    return this.repaso.obtenerPerfil(request.usuario.sub);
  }

  @Post('generar')
  generar(
    @Request() request: AuthenticatedRequest,
    @Query() query: GenerarRepasoDto,
  ) {
    return this.repaso.generar(request.usuario.sub, query.cantidad);
  }

  @Post('calificar')
  calificar(
    @Request() request: AuthenticatedRequest,
    @Body() body: CalificarRepasoDto,
  ) {
    return this.repaso.calificar(
      request.usuario.sub,
      body.intentoId,
      body.respuestas,
    );
  }
}
