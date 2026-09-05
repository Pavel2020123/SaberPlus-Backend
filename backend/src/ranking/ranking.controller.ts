import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AuthenticatedRequest } from '../auth/auth.types';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import {
  AlcanceRanking,
  PeriodoRanking,
  RankingService,
} from './ranking.service';

class ConsultarRankingDto {
  @IsOptional()
  @IsEnum(AlcanceRanking)
  alcance: AlcanceRanking = AlcanceRanking.GLOBAL;

  @IsOptional()
  @IsEnum(PeriodoRanking)
  periodo: PeriodoRanking = PeriodoRanking.TOTAL;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(100)
  limite = 50;
}

@Controller('ranking')
@UseGuards(JwtGuard, EmailVerificadoGuard)
export class RankingController {
  constructor(private readonly rankingService: RankingService) {}

  @Get()
  obtener(
    @Request() request: AuthenticatedRequest,
    @Query() query: ConsultarRankingDto,
  ) {
    return this.rankingService.obtenerRanking(
      request.usuario.sub,
      query.alcance,
      query.periodo,
      query.limite,
    );
  }
}
