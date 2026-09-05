import {
  capacidadesPlanInstitucional,
  LIMITE_ESTUDIANTES_GRATIS,
  LIMITE_GRUPOS_GRATIS,
} from './institucion-plan.util';

describe('capacidadesPlanInstitucional', () => {
  it('mantiene un grupo, 40 estudiantes y publicidad en el plan gratis', () => {
    expect(
      capacidadesPlanInstitucional({
        planActual: 'GRATIS',
        limiteGrupos: null,
        limiteEstudiantes: null,
      }),
    ).toEqual({
      plan: 'GRATIS',
      esGratuito: true,
      publicidadHabilitada: true,
      nivelAnalitica: 'BASICA',
      alertasHabilitadas: false,
      prioridadesHabilitadas: false,
      exportacionesHabilitadas: false,
      planVencido: false,
      venceEn: null,
      limiteGrupos: LIMITE_GRUPOS_GRATIS,
      limiteEstudiantes: LIMITE_ESTUDIANTES_GRATIS,
    });
  });

  it('respeta límites explícitos configurados por el backend', () => {
    expect(
      capacidadesPlanInstitucional({
        planActual: 'SIN_ANUNCIOS',
        limiteGrupos: 3,
        limiteEstudiantes: 120,
      }),
    ).toMatchObject({
      plan: 'SIN_ANUNCIOS',
      esGratuito: false,
      publicidadHabilitada: false,
      nivelAnalitica: 'DETALLADA',
      alertasHabilitadas: true,
      prioridadesHabilitadas: true,
      exportacionesHabilitadas: true,
      planVencido: false,
      venceEn: null,
      limiteGrupos: 3,
      limiteEstudiantes: 120,
    });
  });

  it('revierte capacidades al vencer el plan sin anuncios', () => {
    expect(
      capacidadesPlanInstitucional(
        {
          planActual: 'SIN_ANUNCIOS',
          limiteGrupos: 5,
          limiteEstudiantes: 200,
          fechaVencimientoPlan: new Date('2026-08-31T23:59:59Z'),
        },
        new Date('2026-09-01T00:00:00Z'),
      ),
    ).toMatchObject({
      plan: 'GRATIS',
      planVencido: true,
      publicidadHabilitada: true,
      nivelAnalitica: 'BASICA',
      limiteGrupos: LIMITE_GRUPOS_GRATIS,
      limiteEstudiantes: LIMITE_ESTUDIANTES_GRATIS,
    });
  });

  it('trata cualquier plan desconocido como gratuito', () => {
    expect(
      capacidadesPlanInstitucional({
        planActual: 'premium-inventado',
        limiteGrupos: null,
        limiteEstudiantes: null,
      }),
    ).toMatchObject({
      plan: 'GRATIS',
      esGratuito: true,
      nivelAnalitica: 'BASICA',
      exportacionesHabilitadas: false,
    });
  });
});
