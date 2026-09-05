import { randomBytes } from 'crypto';

// ─── RECUPERACIÓN DE CONTRASEÑA ──────────────────────────────
// Punto 8: token de un solo uso que se envía por correo cuando el
// estudiante olvida su contraseña. Vida corta (1 hora) a propósito:
// a diferencia del token de verificación, este permite cambiar la
// contraseña de la cuenta.
export const HORAS_VALIDEZ_TOKEN_RECUPERACION = 1;

export function generarTokenRecuperacion(): string {
  return randomBytes(32).toString('hex');
}

export function calcularExpiracionTokenRecuperacion(
  desde: Date = new Date(),
): Date {
  const expira = new Date(desde);
  expira.setHours(expira.getHours() + HORAS_VALIDEZ_TOKEN_RECUPERACION);
  return expira;
}
