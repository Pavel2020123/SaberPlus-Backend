export const LIMITE_GRUPOS_GRATIS = 1;
export const LIMITE_ESTUDIANTES_GRATIS = 40;
export const LIMITE_GRUPOS_SIN_ANUNCIOS = 5;
export const LIMITE_ESTUDIANTES_SIN_ANUNCIOS = 200;

export type PlanInstitucional = 'GRATIS' | 'SIN_ANUNCIOS';
export type NivelAnaliticaInstitucional = 'BASICA' | 'DETALLADA';

export interface ConfiguracionPlanInstitucional {
  planActual: string | null;
  limiteGrupos: number | null;
  limiteEstudiantes: number | null;
  fechaVencimientoPlan?: Date | null;
}

export interface CapacidadesPlanInstitucional {
  plan: PlanInstitucional;
  esGratuito: boolean;
  publicidadHabilitada: boolean;
  nivelAnalitica: NivelAnaliticaInstitucional;
  alertasHabilitadas: boolean;
  prioridadesHabilitadas: boolean;
  exportacionesHabilitadas: boolean;
  planVencido: boolean;
  venceEn: Date | null;
  limiteGrupos: number | null;
  limiteEstudiantes: number | null;
}

export function normalizarPlanInstitucional(
  valor: string | null | undefined,
): PlanInstitucional {
  return valor?.trim().toUpperCase() === 'SIN_ANUNCIOS'
    ? 'SIN_ANUNCIOS'
    : 'GRATIS';
}

export function capacidadesPlanInstitucional(
  configuracion: ConfiguracionPlanInstitucional,
  ahora: Date = new Date(),
): CapacidadesPlanInstitucional {
  const planConfigurado = normalizarPlanInstitucional(configuracion.planActual);
  const venceEn = configuracion.fechaVencimientoPlan ?? null;
  const planVencido =
    planConfigurado === 'SIN_ANUNCIOS' &&
    venceEn !== null &&
    venceEn.getTime() <= ahora.getTime();
  const plan = planVencido ? 'GRATIS' : planConfigurado;
  const esGratuito = plan === 'GRATIS';
  return {
    plan,
    esGratuito,
    publicidadHabilitada: esGratuito,
    nivelAnalitica: esGratuito ? 'BASICA' : 'DETALLADA',
    alertasHabilitadas: !esGratuito,
    prioridadesHabilitadas: !esGratuito,
    exportacionesHabilitadas: !esGratuito,
    planVencido,
    venceEn,
    limiteGrupos: esGratuito
      ? Math.min(
          configuracion.limiteGrupos ?? LIMITE_GRUPOS_GRATIS,
          LIMITE_GRUPOS_GRATIS,
        )
      : (configuracion.limiteGrupos ?? LIMITE_GRUPOS_SIN_ANUNCIOS),
    limiteEstudiantes: esGratuito
      ? Math.min(
          configuracion.limiteEstudiantes ?? LIMITE_ESTUDIANTES_GRATIS,
          LIMITE_ESTUDIANTES_GRATIS,
        )
      : (configuracion.limiteEstudiantes ?? LIMITE_ESTUDIANTES_SIN_ANUNCIOS),
  };
}
