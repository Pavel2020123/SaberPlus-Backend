import { CompetitivePairProtocol } from './competitive.pair-protocol';
describe('competitive pair kernel admission boundary', () => {
  it('rejects unsupported version before a transaction or any evidence access', async () => {
    const database = { $transaction: jest.fn() };
    const evidence = {
      originalParticipants: jest.fn(),
      loadLockedPair: jest.fn(),
    };
    const service = new CompetitivePairProtocol(database as any, evidence);
    await expect(
      service.settlePair('00000000-0000-4000-8000-000000000001', 2),
    ).rejects.toThrow('UNSUPPORTED_RULES_VERSION');
    expect(database.$transaction).not.toHaveBeenCalled();
    expect(evidence.originalParticipants).not.toHaveBeenCalled();
  });
});
