import { STAR_RESCUE_RULES, starRescueScore } from './star-rescue.rules';

const replay = (values: boolean[]) =>
  starRescueScore(values.map((esCorrecta) => ({ esCorrecta })));

describe('Star Rescue version 1', () => {
  it('starts empty and freezes the rules', () => {
    expect(Object.isFrozen(STAR_RESCUE_RULES)).toBe(true);
    expect(replay([])).toEqual({
      estrellas: 0,
      constelaciones: 0,
      aciertos: 0,
      errores: 0,
      respondidas: 0,
      estado: 'ACTIVO',
    });
  });
  it('incorrect answers keep rescued stars; each three make a constellation', () => {
    const score = replay([true, true, true, false]);
    expect(score).toMatchObject({
      estrellas: 3,
      constelaciones: 1,
      errores: 1,
      estado: 'ACTIVO',
    });
  });
  it('wins immediately at six, including on question ten', () => {
    expect(replay(Array<boolean>(6).fill(true))).toMatchObject({
      estrellas: 6,
      constelaciones: 2,
      estado: 'VICTORIA',
    });
    expect(
      replay([
        ...Array<boolean>(4).fill(false),
        ...Array<boolean>(6).fill(true),
      ]).estado,
    ).toBe('VICTORIA');
  });
  it('returns a partial rescue after ten questions', () => {
    expect(
      replay([
        ...Array<boolean>(5).fill(true),
        ...Array<boolean>(5).fill(false),
      ]),
    ).toMatchObject({ estrellas: 5, constelaciones: 1, estado: 'AGOTADO' });
    expect(replay(Array<boolean>(10).fill(false)).estrellas).toBe(0);
  });
  it('rejects histories past the limit or past victory', () => {
    expect(() => replay(Array<boolean>(11).fill(false))).toThrow();
    expect(() => replay([...Array<boolean>(6).fill(true), false])).toThrow();
  });
});
