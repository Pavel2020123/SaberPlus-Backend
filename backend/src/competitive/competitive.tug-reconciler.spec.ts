import { Logger } from '@nestjs/common';
import { TugCompetitiveReconciler } from './competitive.tug-reconciler';
import { CompetitiveError } from './competitive.rules';

describe('competitive TUG durable pair recovery', () => {
  let warn: jest.SpyInstance, error: jest.SpyInstance;
  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  function fixture(failure?: Error, orphan = false) {
    const prisma = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'owned' }])
        .mockResolvedValue([{ orphan }]),
    };
    const pair = {
      settlePrecisePair: failure
        ? jest.fn().mockRejectedValue(failure)
        : jest.fn().mockResolvedValue({}),
    };
    return {
      prisma,
      pair,
      worker: new TugCompetitiveReconciler(prisma as any, pair as any),
    };
  }
  it('discovers durable terminals and invokes only pair settlement without inspecting admission flags', async () => {
    const f = fixture();
    await f.worker.reconcile();
    expect(f.pair.settlePrecisePair).toHaveBeenCalledWith('owned');
    expect(f.prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
  it.each(['P1001', 'P2028', '40P01'])(
    'keeps transient %s failures pending with observable diagnostics',
    async (code) => {
      const f = fixture(Object.assign(new Error('temporary'), { code }));
      await f.worker.reconcile();
      expect(f.prisma.$executeRaw.mock.calls[1]).toContain('PENDING');
      expect(warn).toHaveBeenCalled();
    },
  );
  it('quarantines contradictory evidence instead of endless retries', async () => {
    const f = fixture(new CompetitiveError('PAIR_PARTIAL_SETTLEMENT'));
    await f.worker.reconcile();
    expect(f.prisma.$executeRaw.mock.calls[1]).toContain('INVALID');
    expect(warn).toHaveBeenCalled();
  });
  it.each([true, false])(
    'missing certificates wait without a deadline inference; visible orphan=%s is quarantined',
    async (orphan) => {
      const f = fixture(
        new CompetitiveError('TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN'),
        orphan,
      );
      await f.worker.reconcile();
      expect(f.prisma.$executeRaw.mock.calls[1]).toContain(
        orphan ? 'INVALID' : 'PENDING',
      );
      expect(f.prisma.$executeRaw.mock.calls[1]).toContain(orphan ? 60 : 300);
    },
  );
  it('reports missing schema without declaring success or losing the durable source', async () => {
    const f = fixture();
    f.prisma.$executeRaw.mockRejectedValueOnce({ code: 'P2021' });
    await f.worker.reconcile();
    expect(error).toHaveBeenCalled();
    expect(f.pair.settlePrecisePair).not.toHaveBeenCalled();
  });
  it('coalesces local concurrent recovery and stops after shutdown', async () => {
    const f = fixture();
    const a = f.worker.reconcile(),
      b = f.worker.reconcile();
    expect(a).toBe(b);
    await a;
    await f.worker.onModuleDestroy();
    await f.worker.reconcile();
    expect(f.pair.settlePrecisePair).toHaveBeenCalledTimes(1);
  });
});
