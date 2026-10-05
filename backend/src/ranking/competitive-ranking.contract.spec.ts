import { JuegoCompetitivo, RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AlcanceRanking,
  PeriodoRanking,
  RankingService,
} from './ranking.service';
import { crearAliasRanking } from './ranking.alias';
import {
  COMPETITIVE_RANKING_AVAILABILITY,
  CompetitiveRankingCandidate,
  parseCompetitiveRankingQuery,
  projectCompetitiveRanking,
} from './competitive-ranking.contract';

const id = (n: number) =>
  `abcdefab-0000-0000-0000-${String(n).padStart(12, '0')}`;
const query = { juego: JuegoCompetitivo.TRIVIA_RUSH, temporada: 2026 };
const candidate = (
  n: number,
  changes: Partial<CompetitiveRankingCandidate> = {},
): CompetitiveRankingCandidate => ({
  usuarioId: id(n),
  rol: RolUsuario.ESTUDIANTE,
  gameId: query.juego,
  temporada: 2026,
  xp: 100,
  alcanzadoEn: new Date('2026-09-01T12:00:00.000Z'),
  updatedAt: new Date('2026-09-02T12:00:00.000Z'),
  ...changes,
});

describe('competitive ranking isolated contract I2-1', () => {
  const previous = process.env.RANKING_ALIAS_SECRET;
  beforeEach(() => {
    process.env.RANKING_ALIAS_SECRET = 'isolated-contract-test-secret';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.RANKING_ALIAS_SECRET;
    else process.env.RANKING_ALIAS_SECRET = previous;
  });

  it('counts only positive balances; zero has no own position even with a previous reachedAt', () => {
    const board = projectCompetitiveRanking(
      query,
      [
        candidate(1),
        candidate(2, { xp: 0 }),
        candidate(3, { xp: 0, alcanzadoEn: null }),
      ],
      id(2),
    );
    expect(board.totalParticipantes).toBe(1);
    expect(board.miPosicion).toBeNull();
    expect(board.ranking).toHaveLength(1);
    expect(
      projectCompetitiveRanking(
        query,
        [candidate(3, { xp: 0, alcanzadoEn: null })],
        id(3),
      ).miPosicion,
    ).toBeNull();
  });

  it('orders XP, then reachedAt, then canonical UUID; positions do not share a sporting tie', () => {
    const rows = [
      candidate(5, { xp: 90 }),
      candidate(3),
      candidate(2, { usuarioId: id(2).toUpperCase() }),
      candidate(4, { alcanzadoEn: new Date('2026-09-01T11:59:59.999Z') }),
      candidate(1, { xp: 101 }),
    ];
    const original = JSON.stringify(rows);
    const board = projectCompetitiveRanking(query, rows, id(5));
    expect(board.ranking.map((r) => r.alias)).toEqual([
      crearAliasRanking(id(1), 'GLOBAL'),
      crearAliasRanking(id(4), 'GLOBAL'),
      crearAliasRanking(id(2), 'GLOBAL'),
      crearAliasRanking(id(3), 'GLOBAL'),
      'Tú',
    ]);
    expect(board.ranking.map((r) => r.posicion)).toEqual([1, 2, 3, 4, 5]);
    expect(
      projectCompetitiveRanking(query, [...rows].reverse(), id(5)),
    ).toEqual(board);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('does not use another game, year or staff member to rank; no institution is required', () => {
    const board = projectCompetitiveRanking(
      query,
      [
        candidate(1),
        candidate(2, { gameId: JuegoCompetitivo.GHOST_DUEL, xp: 999 }),
        candidate(3, { temporada: 2027, xp: 999 }),
        candidate(4, { rol: RolUsuario.PROFESOR }),
        candidate(5, { rol: RolUsuario.ADMIN }),
      ],
      id(1),
    );
    expect(board.totalParticipantes).toBe(1);
    expect(board.miPosicion).toMatchObject({ posicion: 1, xp: 100 });
  });

  it('limits TOP to 50 and separately returns position 51 and total 60', () => {
    const rows = Array.from({ length: 60 }, (_, i) =>
      candidate(i + 1, { xp: 1000 - i }),
    );
    const board = projectCompetitiveRanking(query, rows, id(51));
    expect(board.estado).toBe('CON_PARTICIPANTES');
    if (board.estado !== 'CON_PARTICIPANTES')
      throw new Error('Expected populated ranking');
    expect(board.limite).toBe(50);
    expect(board.ranking).toHaveLength(50);
    expect(board.ranking[0].posicion).toBe(1);
    expect(board.ranking[49].posicion).toBe(50);
    expect(board.ranking.every((r) => !r.esUsuarioActual)).toBe(true);
    expect(board.miPosicion).toEqual({
      posicion: 51,
      alias: 'Tú',
      xp: 950,
      esUsuarioActual: true,
    });
    expect(board.totalParticipantes).toBe(60);
  });

  it('returns no own position for an absent authenticated user', () => {
    expect(
      projectCompetitiveRanking(query, [candidate(1)], id(2)).miPosicion,
    ).toBeNull();
  });

  it.each(
    Object.values(JuegoCompetitivo).filter(
      (game) => COMPETITIVE_RANKING_AVAILABILITY[game],
    ),
  )(
    'represents integrated %s without participants as available and empty',
    (juego) => {
      expect(projectCompetitiveRanking({ ...query, juego }, [], id(1))).toEqual(
        {
          juego,
          temporada: 2026,
          limite: 50,
          estado: 'SIN_PARTICIPANTES',
          totalParticipantes: 0,
          ranking: [],
          miPosicion: null,
        },
      );
    },
  );

  it.each([JuegoCompetitivo.MEMORY_MATCH, JuegoCompetitivo.BATTLES])(
    '%s is not available, even if unverified rows are supplied',
    (juego) => {
      expect(
        projectCompetitiveRanking(
          { ...query, juego },
          [candidate(1, { gameId: juego })],
          id(1),
        ),
      ).toEqual({
        juego,
        temporada: 2026,
        limite: 50,
        estado: 'NO_DISPONIBLE',
        totalParticipantes: null,
        ranking: [],
        miPosicion: null,
      });
    },
  );

  it('explicitly presents safe fields, never arbitrary evidence metadata', () => {
    const unsafe = {
      ...candidate(2),
      nombre: 'PRIVATE_NAME',
      correo: 'PRIVATE_EMAIL',
      institucionId: 'PRIVATE_INSTITUTION',
      contrasenaHash: 'PRIVATE_HASH',
      respuestaCorrecta: 'PRIVATE_ANSWER',
    };
    const board = projectCompetitiveRanking(query, [unsafe], id(1));
    expect(Object.keys(board.ranking[0]).sort()).toEqual([
      'alias',
      'esUsuarioActual',
      'posicion',
      'xp',
    ]);
    expect(JSON.stringify(board)).not.toMatch(
      /PRIVATE_|abcdefab|usuarioId|alcanzadoEn|updatedAt/,
    );
  });

  it.each([null, new Date(NaN), new Date('2026-09-03T00:00:00Z')])(
    'blocks the entire selection for positive reachedAt anomaly %s',
    (alcanzadoEn) => {
      expect(() =>
        projectCompetitiveRanking(
          query,
          [candidate(1), candidate(2, { alcanzadoEn })],
          id(1),
        ),
      ).toThrow('POSITIVE_BALANCE_INVALID_REACHED_AT');
    },
  );

  it('does not invent updatedAt, and accepts reachedAt exactly equal to updatedAt', () => {
    expect(() =>
      projectCompetitiveRanking(
        query,
        [candidate(1, { updatedAt: new Date(NaN) })],
        id(1),
      ),
    ).toThrow('POSITIVE_BALANCE_INVALID_REACHED_AT');
    expect(
      projectCompetitiveRanking(
        query,
        [candidate(1, { updatedAt: new Date('2026-09-01T12:00:00Z') })],
        id(1),
      ).estado,
    ).toBe('CON_PARTICIPANTES');
  });

  it('a correction changes the order using the current reachedAt without restoring an earlier timestamp', () => {
    const board = projectCompetitiveRanking(
      query,
      [
        candidate(1, { alcanzadoEn: new Date('2026-09-02T11:00:00Z') }),
        candidate(2),
      ],
      id(1),
    );
    expect(board.miPosicion?.posicion).toBe(2);
  });

  it('rejects duplicate canonical IDs and invalid participant IDs', () => {
    expect(() =>
      projectCompetitiveRanking(
        query,
        [candidate(1), candidate(1, { usuarioId: id(1).toUpperCase() })],
        id(1),
      ),
    ).toThrow('DUPLICATE_COMPETITIVE_BALANCE');
    expect(() =>
      projectCompetitiveRanking(query, [], 'arbitrary-client-id'),
    ).toThrow('INVALID_COMPETITIVE_PARTICIPANT');
  });

  it.each([-1, 1.5, NaN, Infinity, 2_147_483_648])(
    'rejects invalid XP %s without clamping or rewarding',
    (xp) => {
      expect(() =>
        projectCompetitiveRanking(query, [candidate(1, { xp })], id(1)),
      ).toThrow('INVALID_COMPETITIVE_XP');
    },
  );

  it.each(['TRIVIA', 'trivia_rush', '', null, ['TRIVIA_RUSH'], {}])(
    'rejects invalid game %s',
    (juego) => {
      expect(() => parseCompetitiveRankingQuery(juego, 2026)).toThrow(
        'INVALID_COMPETITIVE_GAME',
      );
    },
  );

  it.each([
    0,
    10000,
    -2026,
    2026.5,
    NaN,
    Infinity,
    '2026.0',
    '2e3',
    ' 2026',
    '02026',
    '',
    null,
    true,
    ['2026'],
  ])('rejects invalid year %s', (year) => {
    expect(() => parseCompetitiveRankingQuery(query.juego, year)).toThrow(
      'INVALID_COMPETITIVE_SEASON',
    );
  });

  it.each([1, 2026, 9999, '2026'])(
    'accepts the existing schema year range %s without consulting time or DB',
    (year) => {
      expect(parseCompetitiveRankingQuery(query.juego, year).temporada).toBe(
        Number(year),
      );
    },
  );

  it.each([AlcanceRanking.GLOBAL, AlcanceRanking.INSTITUCION])(
    'reuses actual legacy HMAC pseudonyms for %s without changing its response',
    async (alcance) => {
      const prisma = {
        usuario: {
          findUnique: jest.fn().mockResolvedValue({
            id: id(1),
            rol: RolUsuario.ESTUDIANTE,
            institucionId: 'institution',
          }),
          findMany: jest.fn().mockResolvedValue([
            { id: id(2), xpTotal: 200 },
            { id: id(1), xpTotal: 100 },
          ]),
        },
      } as unknown as PrismaService;
      const legacy = await new RankingService(prisma).obtenerRanking(
        id(1),
        alcance,
        PeriodoRanking.TOTAL,
        50,
      );
      expect(legacy.ranking[0].alias).toBe(crearAliasRanking(id(2), alcance));
      expect(legacy.miPosicion).toMatchObject({
        alias: 'Tú',
        posicion: 2,
        xp: 100,
      });
      expect(legacy).toMatchObject({
        alcance,
        periodo: 'TOTAL',
        totalParticipantes: 2,
      });
      if (alcance === AlcanceRanking.GLOBAL) {
        expect(
          projectCompetitiveRanking(query, [candidate(2)], id(1)).ranking[0]
            .alias,
        ).toBe(legacy.ranking[0].alias);
      }
    },
  );
});
