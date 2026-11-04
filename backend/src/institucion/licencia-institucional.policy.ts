/** Domain policy only. Not wired into existing plans, guards or persistence. */
export interface PeriodoLicenciaInstitucional {
  institucionId: string;
  inicio: Date;
  fin: Date;
  suspendida: boolean;
  cuposEstudiantes: number;
  cuposDocentes: number;
}

export type EstadoLicenciaInstitucional =
  | 'SIN_LICENCIA'
  | 'PROGRAMADA'
  | 'ACTIVA'
  | 'VENCIDA'
  | 'SUSPENDIDA';

function instante(valor: Date): number {
  if (!(valor instanceof Date) || !Number.isFinite(valor.getTime()))
    throw new RangeError('Instante de licencia no válido.');
  return valor.getTime();
}

function cantidad(valor: number): number {
  if (!Number.isSafeInteger(valor) || valor < 0)
    throw new RangeError('Cantidad de cupos no válida.');
  return valor;
}

function validar(periodo: PeriodoLicenciaInstitucional): void {
  if (!periodo.institucionId.trim() || typeof periodo.suspendida !== 'boolean')
    throw new RangeError('Contrato institucional no válido.');
  if (instante(periodo.inicio) >= instante(periodo.fin))
    throw new RangeError('El fin debe ser posterior al inicio.');
  cantidad(periodo.cuposEstudiantes);
  cantidad(periodo.cuposDocentes);
}

/** Uses explicit server time and [start, end); never falls back to a free plan. */
export function evaluarLicenciaInstitucional(
  institucionId: string,
  periodo: PeriodoLicenciaInstitucional | null,
  ahora: Date,
): { estado: EstadoLicenciaInstitucional; habilitaPractica: boolean } {
  const tiempo = instante(ahora);
  if (!institucionId.trim()) throw new RangeError('Institución no válida.');
  if (!periodo) return { estado: 'SIN_LICENCIA', habilitaPractica: false };
  validar(periodo);
  if (periodo.institucionId !== institucionId)
    throw new RangeError('La licencia pertenece a otra institución.');
  const estado: EstadoLicenciaInstitucional = periodo.suspendida
    ? 'SUSPENDIDA'
    : tiempo < instante(periodo.inicio)
      ? 'PROGRAMADA'
      : tiempo >= instante(periodo.fin)
        ? 'VENCIDA'
        : 'ACTIVA';
  return { estado, habilitaPractica: estado === 'ACTIVA' };
}

/** Preview, not an atomic reservation: persistence must enforce concurrency. */
export function evaluarCupoInstitucional(
  limite: number,
  ocupados: number,
  solicitados: number,
): { permite: boolean; disponibles: number } {
  cantidad(limite);
  cantidad(ocupados);
  cantidad(solicitados);
  const disponibles = Math.max(0, limite - ocupados);
  return {
    permite: ocupados <= limite && solicitados <= disponibles,
    disponibles,
  };
}

/** Agreed dates only: no calendar-month arithmetic or retroactive coverage. */
export function inicioRenovacionInstitucional(
  finActual: Date,
  acordadaEn: Date,
  nuevaFechaAcordada: Date,
): Date {
  const fin = instante(finActual);
  const acuerdo = instante(acordadaEn);
  const nueva = instante(nuevaFechaAcordada);
  if (acuerdo < fin) return new Date(fin);
  if (nueva < acuerdo)
    throw new RangeError('La renovación vencida no comienza retroactivamente.');
  return new Date(nueva);
}

/** The offline deadline can never exceed either validation TTL or license end. */
export function limiteOfflineInstitucional(
  periodo: PeriodoLicenciaInstitucional,
  validadoEn: Date,
  finVentanaPrivada: Date,
): Date {
  const validacion = instante(validadoEn);
  const ventana = instante(finVentanaPrivada);
  if (
    !evaluarLicenciaInstitucional(periodo.institucionId, periodo, validadoEn)
      .habilitaPractica ||
    ventana <= validacion ||
    ventana - validacion > 72 * 60 * 60 * 1000
  )
    throw new RangeError('No existe una ventana privada válida.');
  return new Date(Math.min(instante(periodo.fin), ventana));
}

/** Calendar months in Colombia (UTC-05), clamped to the target month's last day. */
export function finPeriodoInstitucional(inicio: Date, meses: number): Date {
  const tiempo = instante(inicio);
  if (![6, 12, 18, 24].includes(meses))
    throw new RangeError('Duración institucional no válida.');
  const desplazamiento = 5 * 60 * 60 * 1000;
  const local = new Date(tiempo - desplazamiento);
  const destino = new Date(local.getTime());
  destino.setUTCDate(1);
  destino.setUTCMonth(destino.getUTCMonth() + meses);
  const ultimo = new Date(destino.getTime());
  ultimo.setUTCMonth(ultimo.getUTCMonth() + 1);
  ultimo.setUTCDate(0);
  destino.setUTCDate(Math.min(local.getUTCDate(), ultimo.getUTCDate()));
  const fin = new Date(destino.getTime() + desplazamiento);
  instante(fin);
  return fin;
}

/** Only a previously authorized owned diagnostic/mock attempt can use this cap.
 * Callers must verify ownership, assignment, attempt kind and persisted start.
 * Suspension/revocation never grants grace; this does not authorize new content.
 */
export function limiteEntregaInstitucional(
  periodo: PeriodoLicenciaInstitucional,
  iniciadoEn: Date,
  vencimientoOriginal: Date | null,
): Date {
  validar(periodo);
  const inicio = instante(iniciadoEn);
  if (
    !evaluarLicenciaInstitucional(periodo.institucionId, periodo, iniciadoEn)
      .habilitaPractica
  )
    throw new RangeError('El intento no comenzó con cobertura activa.');
  const tope = instante(periodo.fin) + 24 * 60 * 60 * 1000;
  const original = vencimientoOriginal ? instante(vencimientoOriginal) : tope;
  if (original <= inicio)
    throw new RangeError('El plazo original del intento no es válido.');
  const limite = new Date(Math.min(tope, original));
  instante(limite);
  return limite;
}
