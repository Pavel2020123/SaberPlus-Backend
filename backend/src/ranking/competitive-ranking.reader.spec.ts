import { JuegoCompetitivo } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompetitiveRankingReader,
  competitiveRankingStatement,
} from './competitive-ranking.reader';

const id = 'abcdefab-0000-0000-0000-000000000001';
const query = { juego: JuegoCompetitivo.TRIVIA_RUSH, temporada: 2026 };
describe('competitive ranking reader boundary', () => {
  const raw = jest.fn();
  const reader = new CompetitiveRankingReader({
    $queryRaw: raw,
  } as unknown as PrismaService);
  beforeEach(() => raw.mockReset());
  it.each([JuegoCompetitivo.MEMORY_MATCH, JuegoCompetitivo.BATTLES])(
    'does not query unavailable %s',
    async (juego) => {
      expect(await reader.read({ ...query, juego }, id)).toMatchObject({
        estado: 'NO_DISPONIBLE',
        totalParticipantes: null,
      });
      expect(raw).not.toHaveBeenCalled();
    },
  );
  it('validates parameters/context before querying', async () => {
    await expect(reader.read(query, 'client-id')).rejects.toThrow(
      'INVALID_COMPETITIVE_PARTICIPANT',
    );
    await expect(reader.read({ ...query, temporada: 0 }, id)).rejects.toThrow(
      'INVALID_COMPETITIVE_SEASON',
    );
    expect(raw).not.toHaveBeenCalled();
  });
  it('uses one parameterized SELECT with only bounded rows returned', async () => {
    raw.mockResolvedValue([
      {
        total: 60n,
        invalidReachedAt: false,
        top: [{ usuarioId: id, xp: 100, posicion: 1 }],
        own: { usuarioId: id, xp: 100, posicion: 1 },
      },
    ]);
    expect((await reader.read(query, id)).miPosicion).toEqual({
      posicion: 1,
      alias: 'Tú',
      xp: 100,
      esUsuarioActual: true,
    });
    expect(raw).toHaveBeenCalledTimes(1);
    const sql = competitiveRankingStatement(query, id.toUpperCase());
    expect(sql.values).toEqual([query.juego, 2026, 50, id]);
    expect(sql.sql).not.toContain(id);
  });
  it('fails closed with a safe private diagnostic on invalid evidence', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    try {
      raw.mockResolvedValue([
        { total: 60n, invalidReachedAt: true, top: [], own: null },
      ]);
      await expect(reader.read(query, id)).rejects.toThrow(
        'POSITIVE_BALANCE_INVALID_REACHED_AT',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(id);
    } finally {
      log.mockRestore();
    }
  });
  it('does not leak an unexpected database error or its private details', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    try {
      raw.mockRejectedValue(new Error('PRIVATE_SQL ' + id));
      await expect(reader.read(query, id)).rejects.toThrow(
        /^COMPETITIVE_RANKING_READ_FAILED$/,
      );
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /PRIVATE_SQL|abcdefab/,
      );
    } finally {
      log.mockRestore();
    }
  });
});
