import {
  calcularFirmaEpayco,
  estadoDesdeRespuestaEpayco,
  firmaEpaycoValida,
} from './epayco.util';

describe('utilidades ePayco', () => {
  const datos = {
    x_ref_payco: '999',
    x_transaction_id: 'tx-1',
    x_amount: '45000',
    x_currency_code: 'COP',
  };

  it('calcula la firma oficial separada por circunflejos', () => {
    expect(calcularFirmaEpayco(datos, '123', 'abc')).toBe(
      'a935906ed23cb9e233746655441c0c604682e5428d191875ba78c4ecb20f284d',
    );
  });

  it('compara la firma sin filtrar diferencias de longitud', () => {
    expect(
      firmaEpaycoValida(
        {
          ...datos,
          x_signature:
            'a935906ed23cb9e233746655441c0c604682e5428d191875ba78c4ecb20f284d',
        },
        '123',
        'abc',
      ),
    ).toBe(true);
    expect(
      firmaEpaycoValida({ ...datos, x_signature: 'incorrecta' }, '123', 'abc'),
    ).toBe(false);
  });

  it('mapea las respuestas en español de ePayco', () => {
    expect(estadoDesdeRespuestaEpayco('Aceptada')).toBe('APROBADA');
    expect(estadoDesdeRespuestaEpayco('Rechazada')).toBe('RECHAZADA');
    expect(estadoDesdeRespuestaEpayco('Pendiente')).toBe('PENDIENTE_BANCO');
    expect(estadoDesdeRespuestaEpayco('Fallida')).toBe('FALLIDA');
  });
});
