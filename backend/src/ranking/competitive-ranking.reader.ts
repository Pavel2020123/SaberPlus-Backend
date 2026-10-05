import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canonicalRankingUserId,
  COMPETITIVE_RANKING_AVAILABILITY,
  COMPETITIVE_TOP_LIMIT,
  CompetitiveRankingBoard,
  CompetitiveRankingContractError,
  CompetitiveRankingEntry,
  CompetitiveRankingQuery,
  parseCompetitiveRankingQuery,
  projectCompetitiveRanking,
} from './competitive-ranking.contract';
import { crearAliasRanking } from './ranking.alias';

interface InternalEntry {
  usuarioId: string;
  xp: number;
  posicion: number;
}
interface ReadResult {
  total: bigint;
  invalidReachedAt: boolean;
  top: InternalEntry[];
  own: InternalEntry | null;
}

/** One statement = one PostgreSQL MVCC snapshot, including validation outside TOP 50. */
export function competitiveRankingStatement(
  query: CompetitiveRankingQuery,
  authenticatedUserId: string,
): Prisma.Sql {
  const { juego, temporada } = parseCompetitiveRankingQuery(
    query.juego,
    query.temporada,
  );
  const ownId = canonicalRankingUserId(authenticatedUserId);
  return Prisma.sql`
    WITH population AS MATERIALIZED (
      SELECT b."usuarioId", b.xp, b."alcanzadoEn", b."updatedAt"
      FROM "BalanceCompetitivo" b JOIN "Usuario" u ON u.id=b."usuarioId"
      WHERE b."gameId"=${juego}::"JuegoCompetitivo" AND b.temporada=${temporada}
        AND u.rol='ESTUDIANTE'::"RolUsuario" AND b.xp>0
    ), stats AS MATERIALIZED (
      SELECT count(*) AS total, coalesce(bool_or(
        "alcanzadoEn" IS NULL OR NOT isfinite("alcanzadoEn")
        OR NOT isfinite("updatedAt") OR "alcanzadoEn">"updatedAt"
      ), false) AS "invalidReachedAt" FROM population
    ), ranked AS MATERIALIZED (
      SELECT "usuarioId", xp,
        row_number() OVER (ORDER BY xp DESC, "alcanzadoEn" ASC, "usuarioId" ASC) AS posicion
      FROM population WHERE NOT (SELECT "invalidReachedAt" FROM stats)
    ), top AS (
      SELECT * FROM ranked ORDER BY posicion LIMIT ${COMPETITIVE_TOP_LIMIT}
    )
    SELECT stats.total, stats."invalidReachedAt",
      coalesce((SELECT jsonb_agg(to_jsonb(top) ORDER BY posicion) FROM top), '[]'::jsonb) AS top,
      (SELECT to_jsonb(r) FROM ranked r WHERE "usuarioId"=${ownId}::uuid) AS own
    FROM stats`;
}

/** Internal only: no controller/provider registration yet; never writes XP. */
@Injectable()
export class CompetitiveRankingReader {
  private readonly logger = new Logger(CompetitiveRankingReader.name);
  constructor(private readonly prisma: PrismaService) {}

  async read(
    query: CompetitiveRankingQuery,
    authenticatedUserId: string,
  ): Promise<CompetitiveRankingBoard> {
    const selection = parseCompetitiveRankingQuery(
      query.juego,
      query.temporada,
    );
    const ownId = canonicalRankingUserId(authenticatedUserId);
    if (!COMPETITIVE_RANKING_AVAILABILITY[selection.juego]) {
      return projectCompetitiveRanking(selection, [], ownId);
    }
    let result: ReadResult;
    try {
      [result] = await this.prisma.$queryRaw<ReadResult[]>(
        competitiveRankingStatement(selection, ownId),
      );
    } catch (error) {
      // No SQL text, parameters, messages or raw Prisma error objects in diagnostics.
      const known = error instanceof Prisma.PrismaClientKnownRequestError;
      const sqlCode = known ? error.meta?.code : undefined;
      this.logger.error({
        code: 'COMPETITIVE_RANKING_READ_FAILED',
        ...selection,
        prismaCode: known ? error.code : 'UNKNOWN',
        sqlState:
          typeof sqlCode === 'string' && /^[A-Z0-9]{5}$/.test(sqlCode)
            ? sqlCode
            : null,
      });
      throw new CompetitiveRankingContractError(
        'COMPETITIVE_RANKING_READ_FAILED',
      );
    }
    if (result.invalidReachedAt) {
      this.logger.warn({
        code: 'POSITIVE_BALANCE_INVALID_REACHED_AT',
        ...selection,
      });
      throw new CompetitiveRankingContractError(
        'POSITIVE_BALANCE_INVALID_REACHED_AT',
      );
    }
    if (result.total === 0n)
      return projectCompetitiveRanking(selection, [], ownId);
    const total = Number(result.total);
    if (!Number.isSafeInteger(total) || total < 1) {
      throw new CompetitiveRankingContractError(
        'COMPETITIVE_RANKING_COUNT_UNREPRESENTABLE',
      );
    }
    const present = (row: InternalEntry): CompetitiveRankingEntry => ({
      posicion: row.posicion,
      alias:
        row.usuarioId === ownId
          ? 'Tú'
          : crearAliasRanking(row.usuarioId, 'GLOBAL'),
      xp: row.xp,
      esUsuarioActual: row.usuarioId === ownId,
    });
    return {
      ...selection,
      limite: COMPETITIVE_TOP_LIMIT,
      estado: 'CON_PARTICIPANTES',
      totalParticipantes: total,
      ranking: result.top.map(present),
      miPosicion: result.own === null ? null : present(result.own),
    };
  }
}
