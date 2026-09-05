import { randomBytes } from 'crypto';

// ─── VERIFICACIÓN DE CORREO ──────────────────────────────────
// Las cuentas creadas por una institución ya tienen una relación de confianza.
// Las cuentas individuales, tanto estudiantes como profesores, deben demostrar
// que controlan el correo antes de usar operaciones sensibles.
export const HORAS_VALIDEZ_TOKEN_VERIFICACION = 24;

export function generarTokenVerificacion(): string {
  return randomBytes(32).toString('hex');
}

export function calcularExpiracionToken(desde: Date = new Date()): Date {
  const expira = new Date(desde);
  expira.setHours(expira.getHours() + HORAS_VALIDEZ_TOKEN_VERIFICACION);
  return expira;
}

export interface UsuarioParaVerificacion {
  institucionId: string | null;
  rol: string | null;
  correoVerificado: boolean | null;
}

export function requiereVerificacionCorreo(
  usuario: UsuarioParaVerificacion,
): boolean {
  // Cuenta de institución: fue creada o vinculada por un responsable.
  if (usuario.institucionId) return false;
  return usuario.correoVerificado !== true;
}
