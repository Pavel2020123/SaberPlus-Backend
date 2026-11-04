import {
  finPeriodoInstitucional,
  limiteEntregaInstitucional,
  PeriodoLicenciaInstitucional,
} from './licencia-institucional.policy';

describe('institutional agreed calendar and delivery cap', () => {
  it.each([
    ['2026-08-31T23:30:00-05:00', 6, '2027-02-28T23:30:00-05:00'],
    ['2027-08-31T23:30:00-05:00', 6, '2028-02-29T23:30:00-05:00'],
    ['2028-02-29T00:00:00-05:00', 12, '2029-02-28T00:00:00-05:00'],
    ['2026-11-02T12:15:45.123-05:00', 18, '2028-05-02T12:15:45.123-05:00'],
    ['2026-11-02T12:00:00-05:00', 24, '2028-11-02T12:00:00-05:00'],
  ])('adds Colombia months to %s', (inicio, meses, fin) => {
    const original = new Date(inicio);
    expect(finPeriodoInstitucional(original, meses)).toEqual(new Date(fin));
    expect(original).toEqual(new Date(inicio));
  });
  it.each([0, 1, 6.5, 25, NaN, Infinity])('rejects duration %s', (meses) => {
    expect(() => finPeriodoInstitucional(new Date(), meses)).toThrow();
  });
  it('rejects invalid start', () => {
    expect(() => finPeriodoInstitucional(new Date(NaN), 6)).toThrow();
  });
  const periodo: PeriodoLicenciaInstitucional = {
    institucionId: 'a',
    inicio: new Date('2026-01-01T05:00:00Z'),
    fin: new Date('2026-07-01T05:00:00Z'),
    suspendida: false,
    cuposEstudiantes: 75,
    cuposDocentes: 3,
  };
  const iniciado = new Date('2026-07-01T04:00:00Z');
  it.each([
    [null, '2026-07-02T05:00:00Z'],
    ['2026-07-01T06:00:00Z', '2026-07-01T06:00:00Z'],
    ['2026-07-03T05:00:00Z', '2026-07-02T05:00:00Z'],
  ])(
    'caps an existing attempt with original deadline %s',
    (original, esperado) => {
      expect(
        limiteEntregaInstitucional(
          periodo,
          iniciado,
          original ? new Date(original) : null,
        ),
      ).toEqual(new Date(esperado));
    },
  );
  it.each([periodo.fin, new Date('2025-12-31T05:00:00Z'), new Date(NaN)])(
    'rejects an attempt not begun under active coverage',
    (inicio) => {
      expect(() => limiteEntregaInstitucional(periodo, inicio, null)).toThrow();
    },
  );
  it('never grants grace for suspension', () => {
    expect(() =>
      limiteEntregaInstitucional(
        { ...periodo, suspendida: true },
        iniciado,
        null,
      ),
    ).toThrow();
  });
  it.each([iniciado, new Date(NaN)])(
    'rejects an invalid original deadline',
    (fin) => {
      expect(() =>
        limiteEntregaInstitucional(periodo, iniciado, fin),
      ).toThrow();
    },
  );
});
