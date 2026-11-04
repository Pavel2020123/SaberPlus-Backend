import {
  evaluarCupoInstitucional,
  evaluarLicenciaInstitucional,
  inicioRenovacionInstitucional,
  limiteOfflineInstitucional,
  PeriodoLicenciaInstitucional,
} from './licencia-institucional.policy';

const fecha = (dia: number) => new Date(Date.UTC(2026, 10, dia));
const contrato = (): PeriodoLicenciaInstitucional => ({
  institucionId: 'colegio-a',
  inicio: fecha(2),
  fin: fecha(10),
  suspendida: false,
  cuposEstudiantes: 75,
  cuposDocentes: 3,
});

describe('LIC-1 policy core (not activated)', () => {
  it.each([
    [fecha(1), 'PROGRAMADA', false],
    [fecha(2), 'ACTIVA', true],
    [new Date(fecha(10).getTime() - 1), 'ACTIVA', true],
    [fecha(10), 'VENCIDA', false],
    [fecha(11), 'VENCIDA', false],
  ])('evaluates explicit boundary %s', (ahora, estado, habilitaPractica) => {
    expect(
      evaluarLicenciaInstitucional('colegio-a', contrato(), ahora),
    ).toEqual({
      estado,
      habilitaPractica,
    });
  });
  it('does not grant free access when missing a license', () => {
    expect(evaluarLicenciaInstitucional('colegio-a', null, fecha(3))).toEqual({
      estado: 'SIN_LICENCIA',
      habilitaPractica: false,
    });
  });
  it.each([1, 3, 11])('suspension always denies at day %i', (dia) => {
    expect(
      evaluarLicenciaInstitucional(
        'colegio-a',
        {
          ...contrato(),
          suspendida: true,
        },
        fecha(dia),
      ),
    ).toEqual({ estado: 'SUSPENDIDA', habilitaPractica: false });
  });
  it('rejects cross-institution use', () => {
    expect(() =>
      evaluarLicenciaInstitucional('colegio-b', contrato(), fecha(3)),
    ).toThrow();
  });
  it.each([
    { inicio: fecha(10) },
    { fin: fecha(1) },
    { fin: new Date(NaN) },
    { cuposEstudiantes: -1 },
    { cuposDocentes: 1.5 },
    { cuposEstudiantes: Number.MAX_SAFE_INTEGER + 1 },
    { institucionId: '' },
  ])('rejects malformed contract %j', (cambio) => {
    expect(() =>
      evaluarLicenciaInstitucional(
        'colegio-a',
        {
          ...contrato(),
          ...cambio,
        },
        fecha(3),
      ),
    ).toThrow();
  });
  it('rejects invalid server clock even without a license', () => {
    expect(() =>
      evaluarLicenciaInstitucional('colegio-a', null, new Date(NaN)),
    ).toThrow();
  });
  it.each([
    [75, 74, 1, true, 1],
    [75, 75, 1, false, 0],
    [75, 74, 2, false, 1],
    [3, 2, 1, true, 1],
    [0, 0, 1, false, 0],
    [75, 76, 0, false, 0],
  ])(
    'previews capacity without reserving it',
    (limite, usados, nuevos, permite, disponibles) => {
      expect(evaluarCupoInstitucional(limite, usados, nuevos)).toEqual({
        permite,
        disponibles,
      });
    },
  );
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid seat count %s',
    (valor) => {
      expect(() => evaluarCupoInstitucional(75, valor, 1)).toThrow();
      expect(() => evaluarCupoInstitucional(valor, 0, 1)).toThrow();
      expect(() => evaluarCupoInstitucional(75, 0, valor)).toThrow();
    },
  );
  it('preserves the remaining period on early renewal', () => {
    expect(
      inicioRenovacionInstitucional(fecha(10), fecha(3), fecha(4)),
    ).toEqual(fecha(10));
  });
  it.each([10, 11])('uses an agreed new date once expired', (dia) => {
    expect(
      inicioRenovacionInstitucional(fecha(10), fecha(dia), fecha(15)),
    ).toEqual(fecha(15));
  });
  it('refuses retroactive renewal after expiration', () => {
    expect(() =>
      inicioRenovacionInstitucional(fecha(10), fecha(12), fecha(11)),
    ).toThrow();
  });
  it('caps offline use at license end, without mutating dates', () => {
    const periodo = contrato();
    expect(limiteOfflineInstitucional(periodo, fecha(9), fecha(12))).toEqual(
      fecha(10),
    );
    expect(periodo.fin).toEqual(fecha(10));
  });
  it('retains an earlier private deadline', () => {
    expect(limiteOfflineInstitucional(contrato(), fecha(3), fecha(6))).toEqual(
      fecha(6),
    );
  });
  it.each([1, 10, 11])('refuses an inactive offline validation %i', (dia) => {
    expect(() =>
      limiteOfflineInstitucional(contrato(), fecha(dia), fecha(dia + 1)),
    ).toThrow();
  });
  it.each([2, 3, 7])('refuses expired or overlong private window %i', (dia) => {
    expect(() =>
      limiteOfflineInstitucional(contrato(), fecha(3), fecha(dia)),
    ).toThrow();
  });
  it('does not modify the existing contract during evaluation or renewal', () => {
    const periodo = Object.freeze(contrato());
    evaluarLicenciaInstitucional('colegio-a', periodo, fecha(3));
    const fin = inicioRenovacionInstitucional(periodo.fin, fecha(3), fecha(4));
    fin.setTime(0);
    expect(periodo.fin).toEqual(fecha(10));
  });
});
