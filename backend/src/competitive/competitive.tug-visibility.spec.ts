import { TiraAflojaVisibilityWitness } from '../tira-afloja/tira-afloja-visibility.witness';
import { TiraAflojaService } from '../tira-afloja/tira-afloja.service';

// Operational witness behavior only. Visibility proof is tested on PostgreSQL.
describe('competitive TUG visibility witness boundary', () => {
  it('keeps failed sweep work observable and continues without changing transaction budgets', async () => {
    const db = {
      partidaTiraAfloja: { findMany: jest.fn().mockResolvedValue([{ id: 'expired' }]) },
      $queryRaw: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'certificate' }]),
    };
    const service = new TiraAflojaService(db as any, {} as any);
    const log = jest.spyOn((service as any).log, 'error').mockImplementation(() => {});
    const state = jest.spyOn(service as any, 'procesarEstado')
      .mockRejectedValueOnce({ code: 'P2028', meta: { error: 'Unable to start a transaction in the given time.' } })
      .mockResolvedValueOnce(undefined);
    await (service as any).procesarPartidasVencidas();
    expect(state.mock.calls).toEqual([['certificate'], ['expired']]);
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      event: 'TUG_RECOVERY_PENDING', partidaId: 'certificate', code: 'P2028',
      transactionError: 'Unable to start a transaction in the given time.',
    });
    expect((service as any).barridoEnCurso).toBe(false);
  });
  function fixture() {
    const witness = new TiraAflojaVisibilityWitness({} as any);
    const db = { $queryRaw: jest.fn(), $disconnect: jest.fn() };
    (witness as any).client = db;
    // This fixture tests the operational boundary after database verification.
    (witness as any).identity = Promise.resolve();
    return { witness, db };
  }

  it('does not mint a certificate when PostgreSQL has no pending eligible rows', async () => {
    const { witness, db } = fixture();
    db.$queryRaw.mockResolvedValueOnce([]);
    await witness.certify('00000000-0000-4000-8000-000000000001');
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('retains sports evidence when the observation deadline passes while waiting; subsequent rounds are still processed', async () => {
    const { witness, db } = fixture();
    db.$queryRaw
      .mockResolvedValueOnce([{ ronda: 1 }, { ronda: 2 }])
      .mockRejectedValueOnce({ code: 'P2010', meta: { code: 'PT001' } })
      .mockResolvedValueOnce([{ certified: true }]);
    await witness.certify('00000000-0000-4000-8000-000000000001');
    expect(db.$queryRaw).toHaveBeenCalledTimes(3);
  });

  it.each(['42P01', '42883', '40P01', '23514'])(
    'does not hide SQLSTATE %s as uncertified evidence',
    async (code) => {
      const { witness, db } = fixture();
      const error = { code: 'P2010', meta: { code } };
      db.$queryRaw
        .mockResolvedValueOnce([{ ronda: 1 }])
        .mockRejectedValueOnce(error);
      await expect(
        witness.certify('00000000-0000-4000-8000-000000000001'),
      ).rejects.toBe(error);
    },
  );

  it('releases the separate witness pool on shutdown', async () => {
    const { witness, db } = fixture();
    await witness.close();
    expect(db.$disconnect).toHaveBeenCalledTimes(1);
    expect((witness as any).client).toBeUndefined();
  });

  it('rejects a witness in a different database before reading or writing evidence', async () => {
    const sourceTx = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const observer = { $queryRaw: jest.fn().mockResolvedValue([{ acquired: true }]) };
    const source = { $transaction: jest.fn((work) => work(sourceTx)) };
    const db = { $transaction: jest.fn((work) => work(observer)), $queryRaw: jest.fn() };
    const witness = new TiraAflojaVisibilityWitness(source as any);
    (witness as any).client = db;
    await expect(witness.certify('owned-match')).rejects.toThrow('TUG_WITNESS_DATABASE_MISMATCH');
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect((witness as any).identity).toBeUndefined();
  });

  it.each([
    { code: 'P1001' },
    { code: 'P2010', meta: { code: '23514' } },
    { code: 'P2010', meta: { code: '42P01' } },
  ])('reports witness failure without rejecting an already committed sports operation: %j', async (error) => {
    const service = new TiraAflojaService({} as any, {} as any);
    const log = jest.spyOn((service as any).log, 'error').mockImplementation(() => {});
    jest.spyOn((service as any).visibilityWitness, 'certify').mockRejectedValue(error);
    await expect((service as any).certificarSinRevertirDeporte('owned-match')).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('TUG_VISIBILITY_PENDING'));
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ partidaId: 'owned-match', code: error.code });
  });
});
