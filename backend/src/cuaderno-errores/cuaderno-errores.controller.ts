import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AreaIcfes, EstadoCuadernoError } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { PlanVigenteGuard } from '../auth/plan-vigente.guard';
import { CuadernoErroresService } from './cuaderno-errores.service';

class ConsultarCuadernoDto {
  @IsOptional()
  @IsEnum(AreaIcfes)
  area?: AreaIcfes;

  @IsOptional()
  @IsEnum(EstadoCuadernoError)
  estado?: EstadoCuadernoError;
}

class ActualizarErrorDto {
  @IsOptional()
  @IsString()
  @MaxLength(1600)
  nota?: string;

  @IsOptional()
  @IsEnum(EstadoCuadernoError)
  estado?: EstadoCuadernoError;
}

@Controller('cuaderno-errores')
@UseGuards(JwtGuard, EmailVerificadoGuard, PlanVigenteGuard)
export class CuadernoErroresController {
  constructor(private readonly cuadernoErrores: CuadernoErroresService) {}

  @Get()
  listar(
    @Request() request: AuthenticatedRequest,
    @Query() query: ConsultarCuadernoDto,
  ) {
    return this.cuadernoErrores.listar(request.usuario.sub, query);
  }

  @Patch(':preguntaId')
  actualizar(
    @Request() request: AuthenticatedRequest,
    @Param('preguntaId') preguntaId: string,
    @Body() body: ActualizarErrorDto,
  ) {
    return this.cuadernoErrores.actualizar(
      request.usuario.sub,
      preguntaId,
      body,
    );
  }
}
