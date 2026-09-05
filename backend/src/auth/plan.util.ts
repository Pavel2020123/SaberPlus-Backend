// ─── PLAN DEL ESTUDIANTE INDIVIDUAL ──────────────────────────
// El muro de pago SOLO aplica a estudiantes que NO pertenecen a una
// institución (los institucionales se rigen por el cupo/vigencia que
// define el colegio — puntos 2, 6 y 12 del roadmap).
export const DIAS_PRUEBA_GRATIS = 3;

export interface UsuarioParaPlan {
  institucionId: string | null;
  rol: string | null;
  fechaVencimientoPlan: Date | null;
}

export function calcularFechaVencimientoPrueba(desde: Date = new Date()): Date {
  const vencimiento = new Date(desde);
  vencimiento.setDate(vencimiento.getDate() + DIAS_PRUEBA_GRATIS);
  return vencimiento;
}

// true = el estudiante ya no puede seguir estudiando (muro de pago activo)
export function planEstudianteVencido(usuario: UsuarioParaPlan): boolean {
  // Estudiante de una institución: no aplica este muro.
  if (usuario.institucionId) return false;

  // Este muro solo bloquea a estudiantes; profesores/admins individuales
  // (dueños de su propia institución) no se ven afectados.
  if (usuario.rol !== 'ESTUDIANTE') return false;

  // Sin fecha de vencimiento registrada (cuentas antiguas): no bloquear.
  if (!usuario.fechaVencimientoPlan) return false;

  return usuario.fechaVencimientoPlan.getTime() < Date.now();
}
