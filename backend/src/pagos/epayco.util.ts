import * as crypto from 'crypto';

export const PRECIO_ACCESO_COMPLETO_COP = 45000;

export const PRECIO_INSTITUCIONAL_COP = {
  RANGO_10_39: 35000,
  RANGO_40_99: 30000,
};

export interface DatosFirmaEpayco {
  x_ref_payco: string;
  x_transaction_id: string;
  x_amount: string;
  x_currency_code: string;
}

export function calcularFirmaEpayco(
  datos: DatosFirmaEpayco,
  customerId: string,
  pKey: string,
): string {
  const cadena = [
    customerId,
    pKey,
    datos.x_ref_payco,
    datos.x_transaction_id,
    datos.x_amount,
    datos.x_currency_code,
  ].join('^');

  return crypto.createHash('sha256').update(cadena).digest('hex');
}

export function firmaEpaycoValida(
  datos: DatosFirmaEpayco & { x_signature: string },
  customerId: string,
  pKey: string,
): boolean {
  const calculada = calcularFirmaEpayco(datos, customerId, pKey);
  const recibida = (datos.x_signature || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(recibida)) return false;

  return crypto.timingSafeEqual(
    Buffer.from(calculada, 'hex'),
    Buffer.from(recibida, 'hex'),
  );
}

export function estadoDesdeRespuestaEpayco(
  respuesta: string,
): 'APROBADA' | 'RECHAZADA' | 'PENDIENTE_BANCO' | 'FALLIDA' {
  switch (respuesta.trim().toLocaleLowerCase('es')) {
    case 'aceptada':
    case 'approved':
      return 'APROBADA';
    case 'rechazada':
    case 'declined':
      return 'RECHAZADA';
    case 'pendiente':
    case 'pending':
      return 'PENDIENTE_BANCO';
    case 'fallida':
    case 'failed':
    case 'error':
    default:
      return 'FALLIDA';
  }
}
