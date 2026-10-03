import { replayTugRound } from './competitive.tug-replay';

describe('isolated TUG replay PostgreSQL microsecond boundary', () => {
  const at = 1791000000000999n;
  const answer = (offset: bigint) => ({
    esCorrecta: true,
    atUs: (at + offset).toString(),
  });
  it('preserves the inclusive 200000µs tie, in both directions', () => {
    expect(replayTugRound(answer(0n), answer(200000n))).toEqual({
      movement: 0,
      reason: 'EMPATE_RAPIDEZ',
    });
    expect(replayTugRound(answer(200000n), answer(0n))).toEqual({
      movement: 0,
      reason: 'EMPATE_RAPIDEZ',
    });
  });
  it('does not collapse 200001µs into a millisecond tie', () => {
    expect(replayTugRound(answer(0n), answer(200001n))).toEqual({
      movement: 1,
      reason: 'A_MAS_RAPIDO',
    });
    expect(replayTugRound(answer(200001n), answer(0n))).toEqual({
      movement: -1,
      reason: 'B_MAS_RAPIDO',
    });
  });
});
