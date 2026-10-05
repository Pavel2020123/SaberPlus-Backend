import { JuegoCompetitivo, RolUsuario } from '@prisma/client';
import { crearAliasRanking } from './ranking.alias';

export const COMPETITIVE_TOP_LIMIT = 50 as const;

/** Capability, not admission or deployment authorization. Flags never erase balances. */
export const COMPETITIVE_RANKING_AVAILABILITY: Readonly<
  Record<JuegoCompetitivo, boolean>
> = Object.freeze({
  TRIVIA_RUSH: true,
  GHOST_DUEL: true,
  SUMMIT: true,
  TUG_OF_WAR: true,
  GUARDIAN: true,
  MEMORY_MATCH: false,
  BATTLES: false,
  STAR_RESCUE: true,
});

export interface CompetitiveRankingQuery {
  juego: JuegoCompetitivo;
  temporada: number;
}

/** Internal server evidence only; never bind these fields to a client DTO. */
export interface CompetitiveRankingCandidate {
  usuarioId: string;
  rol: RolUsuario;
  gameId: JuegoCompetitivo;
  temporada: number;
  xp: number;
  alcanzadoEn: Date | null;
  updatedAt: Date;
}

export interface CompetitiveRankingEntry {
  posicion: number;
  alias: string;
  xp: number;
  esUsuarioActual: boolean;
}

interface RankingBase extends CompetitiveRankingQuery {
  limite: typeof COMPETITIVE_TOP_LIMIT;
}

export type CompetitiveRankingBoard = RankingBase &
  (
    | {
        estado: 'NO_DISPONIBLE';
        totalParticipantes: null;
        ranking: readonly [];
        miPosicion: null;
      }
    | {
        estado: 'SIN_PARTICIPANTES';
        totalParticipantes: 0;
        ranking: readonly [];
        miPosicion: null;
      }
    | {
        estado: 'CON_PARTICIPANTES';
        totalParticipantes: number;
        ranking: readonly CompetitiveRankingEntry[];
        miPosicion: CompetitiveRankingEntry | null;
      }
  );

export class CompetitiveRankingContractError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'CompetitiveRankingContractError';
  }
}

function requireContract(condition: boolean, code: string): asserts condition {
  if (!condition) throw new CompetitiveRankingContractError(code);
}

/** No HTTP binding yet. Years 1..9999 follow the existing season DB invariant. */
export function parseCompetitiveRankingQuery(
  juego: unknown,
  temporada: unknown,
): CompetitiveRankingQuery {
  requireContract(
    typeof juego === 'string' &&
      Object.values(JuegoCompetitivo).includes(juego as JuegoCompetitivo),
    'INVALID_COMPETITIVE_GAME',
  );
  const year =
    typeof temporada === 'string' && /^[1-9]\d{0,3}$/.test(temporada)
      ? Number(temporada)
      : temporada;
  requireContract(
    typeof year === 'number' &&
      Number.isInteger(year) &&
      year >= 1 &&
      year <= 9999,
    'INVALID_COMPETITIVE_SEASON',
  );
  return { juego: juego as JuegoCompetitivo, temporada: year };
}

function canonicalUserId(id: string): string {
  requireContract(
    typeof id === 'string' &&
      /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id),
    'INVALID_COMPETITIVE_PARTICIPANT',
  );
  return id.toLowerCase();
}

/** Pure reference projection for isolated contract tests, not a PostgreSQL reader.
 * I2-2 must provide one consistent snapshot; I2-3 derives authenticatedUserId from JWT.
 */
export function projectCompetitiveRanking(
  query: CompetitiveRankingQuery,
  candidates: readonly CompetitiveRankingCandidate[],
  authenticatedUserId: string,
): CompetitiveRankingBoard {
  const selection = parseCompetitiveRankingQuery(query.juego, query.temporada);
  const ownId = canonicalUserId(authenticatedUserId);
  const base = { ...selection, limite: COMPETITIVE_TOP_LIMIT };
  if (!COMPETITIVE_RANKING_AVAILABILITY[selection.juego]) {
    return {
      ...base,
      estado: 'NO_DISPONIBLE',
      totalParticipantes: null,
      ranking: [],
      miPosicion: null,
    };
  }

  const selected = candidates.filter(
    (row) =>
      row.gameId === selection.juego &&
      row.temporada === selection.temporada &&
      row.rol === RolUsuario.ESTUDIANTE,
  );
  const ids = new Set<string>();
  const positive = selected.flatMap((row) => {
    const id = canonicalUserId(row.usuarioId);
    requireContract(!ids.has(id), 'DUPLICATE_COMPETITIVE_BALANCE');
    ids.add(id);
    requireContract(
      Number.isInteger(row.xp) && row.xp >= 0 && row.xp <= 2_147_483_647,
      'INVALID_COMPETITIVE_XP',
    );
    if (row.xp === 0) return [];
    requireContract(
      row.alcanzadoEn instanceof Date &&
        Number.isFinite(row.alcanzadoEn.getTime()) &&
        row.updatedAt instanceof Date &&
        Number.isFinite(row.updatedAt.getTime()) &&
        row.alcanzadoEn <= row.updatedAt,
      'POSITIVE_BALANCE_INVALID_REACHED_AT',
    );
    return [{ id, xp: row.xp, reached: row.alcanzadoEn.getTime() }];
  });
  positive.sort(
    (a, b) =>
      b.xp - a.xp ||
      a.reached - b.reached ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  if (!positive.length) {
    return {
      ...base,
      estado: 'SIN_PARTICIPANTES',
      totalParticipantes: 0,
      ranking: [],
      miPosicion: null,
    };
  }
  // Explicit allowlist: no IDs, names, institution, dates or candidate metadata.
  const present = (
    row: (typeof positive)[number],
    index: number,
  ): CompetitiveRankingEntry => ({
    posicion: index + 1,
    alias: row.id === ownId ? 'Tú' : crearAliasRanking(row.id, 'GLOBAL'),
    xp: row.xp,
    esUsuarioActual: row.id === ownId,
  });
  const ownIndex = positive.findIndex((row) => row.id === ownId);
  return {
    ...base,
    estado: 'CON_PARTICIPANTES',
    totalParticipantes: positive.length,
    ranking: positive.slice(0, COMPETITIVE_TOP_LIMIT).map(present),
    miPosicion: ownIndex === -1 ? null : present(positive[ownIndex], ownIndex),
  };
}
