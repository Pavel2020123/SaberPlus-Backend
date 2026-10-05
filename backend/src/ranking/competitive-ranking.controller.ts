import {
  BadRequestException,
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  ForbiddenException,
  Get,
  Header,
  Injectable,
  InternalServerErrorException,
  Logger,
  Query,
  Request,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, Matches } from 'class-validator';
import { JuegoCompetitivo, RolUsuario } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { CompetitiveRankingReader } from './competitive-ranking.reader';
import {
  CompetitiveRankingContractError,
  parseCompetitiveRankingQuery,
} from './competitive-ranking.contract';

export class CompetitiveRankingQueryDto {
  @Transform(({ obj }) => obj.juego)
  @IsEnum(JuegoCompetitivo)
  juego!: JuegoCompetitivo;

  // Preserve raw query syntax despite global implicit conversion.
  @Transform(({ obj }) => obj.temporada)
  @IsString()
  @Matches(/^[1-9]\d{0,3}$/)
  temporada!: string;
}

/** Runs after the existing signature/current-user verification, before DTO pipes. */
@Injectable()
export class CompetitiveRankingStudentGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (req.usuario?.rol !== RolUsuario.ESTUDIANTE) {
      throw new ForbiddenException({
        code: 'COMPETITIVE_RANKING_STUDENT_REQUIRED',
        message: 'El ranking competitivo está disponible para estudiantes.',
      });
    }
    return true;
  }
}

@Controller('ranking/competitivo')
@UseGuards(JwtGuard, CompetitiveRankingStudentGuard, EmailVerificadoGuard)
export class CompetitiveRankingController {
  private readonly logger = new Logger(CompetitiveRankingController.name);
  constructor(private readonly reader: CompetitiveRankingReader) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'Authorization')
  async obtener(
    @Request() req: AuthenticatedRequest,
    @Query() query: CompetitiveRankingQueryDto,
    @Body() body: unknown,
  ) {
    if (
      body != null &&
      (typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new BadRequestException({
        code: 'INVALID_COMPETITIVE_RANKING_QUERY',
        message: 'Esta consulta no admite contenido en el body.',
      });
    }
    try {
      const selection = parseCompetitiveRankingQuery(
        query.juego,
        query.temporada,
      );
      return await this.reader.read(selection, req.usuario.sub);
    } catch (error) {
      const code =
        error instanceof CompetitiveRankingContractError ? error.code : null;
      if (
        code === 'INVALID_COMPETITIVE_GAME' ||
        code === 'INVALID_COMPETITIVE_SEASON'
      ) {
        throw new BadRequestException({
          code: 'INVALID_COMPETITIVE_RANKING_QUERY',
          message: 'Indica un juego y una temporada válidos.',
        });
      }
      const safe = {
        code: 'COMPETITIVE_RANKING_UNAVAILABLE',
        message:
          'No se pudo consultar el ranking competitivo. Inténtalo más tarde.',
      };
      if (code === 'COMPETITIVE_RANKING_READ_FAILED')
        throw new ServiceUnavailableException(safe);
      // Includes malformed trusted context, evidence anomalies and unexpected errors.
      // Never log/serialize the original error or a client's/private identifier.
      this.logger.error({ code: 'COMPETITIVE_RANKING_HTTP_FAILURE' });
      throw new InternalServerErrorException(safe);
    }
  }
}
