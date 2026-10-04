import { PrismaClient } from '@prisma/client';
import { checkCompetitiveReadiness } from './competitive.readiness';
describe('competitive readiness read-only contract', () => {
  it('uses bounded transaction, read-only mode and statement timeout', async () => {
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(0),
      $queryRaw: jest.fn().mockResolvedValue([{ ok: true }]),
    };
    const transaction = jest.fn((fn) => fn(tx));
    await checkCompetitiveReadiness({
      $transaction: transaction,
    } as unknown as PrismaClient);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      maxWait: 1000,
      timeout: 2500,
    });
    expect(tx.$executeRaw.mock.calls[0][0].join('')).toBe(
      'SET TRANSACTION READ ONLY',
    );
    expect(tx.$executeRaw.mock.calls[1][0].join('')).toContain(
      'statement_timeout',
    );
    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it.each([false, undefined])(
    'rejects absent/failed migration evidence (%s)',
    async (ok) => {
      const tx = {
        $executeRaw: jest.fn(),
        $queryRaw: jest
          .fn()
          .mockResolvedValue(ok === undefined ? [] : [{ ok }]),
      };
      await expect(
        checkCompetitiveReadiness({
          $transaction: (fn) => fn(tx),
        } as unknown as PrismaClient),
      ).rejects.toThrow('COMPETITIVE_READINESS_UNAVAILABLE');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    },
  );
  it('rejects incompatible schema or permissions', async () => {
    const tx = {
      $executeRaw: jest.fn(),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ ok: true }])
        .mockResolvedValueOnce([{ ok: false }]),
    };
    await expect(
      checkCompetitiveReadiness({
        $transaction: (fn) => fn(tx),
      } as unknown as PrismaClient),
    ).rejects.toThrow('COMPETITIVE_READINESS_UNAVAILABLE');
  });
});
