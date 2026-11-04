import { UnauthorizedException } from '@nestjs/common';
import { exigirVersionSesion } from './session-version.policy';

describe('Versión revocable de sesión', () => {
  it.each([
    [undefined, undefined],
    [0, undefined],
    [0, 0],
    [1, 1],
    [27, 27],
  ])('permite versión vigente %p/%p', (actual, recibida) => {
    expect(() => exigirVersionSesion(actual, recibida)).not.toThrow();
  });
  it.each([
    [1, undefined],
    [1, 0],
    [2, 1],
    [0, 1],
    [null, 0],
    [0, null],
    [1, '1'],
    [1, 1.5],
    [-1, -1],
    [NaN, NaN],
    [Infinity, Infinity],
  ])('rechaza sesión antigua o malformada %p/%p', (actual, recibida) => {
    expect(() => exigirVersionSesion(actual, recibida)).toThrow(
      UnauthorizedException,
    );
  });
});
