import { CapacidadesPlanInstitucional } from './institucion-plan.util';
import {
  EstadoLicenciaInstitucional,
  evaluarLicenciaInstitucional,
  PeriodoLicenciaInstitucional,
} from './licencia-institucional.policy';

export interface CapacidadesLicenciaInstitucional extends CapacidadesPlanInstitucional {
  origen: 'LICENCIA';
  estadoLicencia: EstadoLicenciaInstitucional;
  cuposDocentes: number;
}

export function esCapacidadLicenciada(
  valor: CapacidadesPlanInstitucional,
): valor is CapacidadesLicenciaInstitucional {
  return 'origen' in valor && valor.origen === 'LICENCIA';
}

/** Compatibility fields describe historical features, not permission to practice.
 * Jwt/service entitlement checks remain mandatory for every new activity.
 */
export function capacidadesLicenciaInstitucional(
  institucionId: string,
  periodo: PeriodoLicenciaInstitucional | null,
  suspendida: boolean,
  limiteGrupos: number | null,
  ahora: Date,
): CapacidadesLicenciaInstitucional {
  const estado = suspendida
    ? 'SUSPENDIDA'
    : evaluarLicenciaInstitucional(institucionId, periodo, ahora).estado;
  return {
    // Existing clients know this wire value. The origin/state disambiguate LIC-1.
    plan: 'SIN_ANUNCIOS',
    origen: 'LICENCIA',
    estadoLicencia: estado,
    esGratuito: false,
    publicidadHabilitada: false,
    nivelAnalitica: 'DETALLADA',
    alertasHabilitadas: true,
    prioridadesHabilitadas: true,
    exportacionesHabilitadas: true,
    planVencido: estado === 'VENCIDA',
    venceEn: periodo?.fin ?? null,
    // No inherited free-plan cap. Honor only an explicit institutional group cap.
    limiteGrupos,
    limiteEstudiantes: periodo?.cuposEstudiantes ?? 0,
    cuposDocentes: periodo?.cuposDocentes ?? 0,
  };
}
