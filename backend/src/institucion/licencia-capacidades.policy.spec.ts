import { capacidadesLicenciaInstitucional } from './licencia-capacidades.policy';
import { PeriodoLicenciaInstitucional } from './licencia-institucional.policy';

describe('licensed capabilities do not fall back to legacy free limits', () => {
  const periodo: PeriodoLicenciaInstitucional = {
    institucionId: 'school',
    inicio: new Date('2026-01-01Z'),
    fin: new Date('2026-07-01Z'),
    suspendida: false,
    cuposEstudiantes: 75,
    cuposDocentes: 3,
  };
  it.each([
    ['2025-12-01Z', false, 'PROGRAMADA'],
    ['2026-02-01Z', false, 'ACTIVA'],
    ['2026-07-01Z', false, 'VENCIDA'],
    ['2026-02-01Z', true, 'SUSPENDIDA'],
  ])(
    'keeps historical capabilities at %s with suspended=%s',
    (now, suspended, state) => {
      const cap = capacidadesLicenciaInstitucional(
        'school',
        periodo,
        suspended,
        null,
        new Date(now),
      );
      expect(cap).toMatchObject({
        origen: 'LICENCIA',
        estadoLicencia: state,
        plan: 'SIN_ANUNCIOS',
        esGratuito: false,
        publicidadHabilitada: false,
        nivelAnalitica: 'DETALLADA',
        exportacionesHabilitadas: true,
        limiteEstudiantes: 75,
        cuposDocentes: 3,
        limiteGrupos: null,
      });
    },
  );
  it('honors an explicit institution group limit instead of a free default', () => {
    expect(
      capacidadesLicenciaInstitucional(
        'school',
        periodo,
        false,
        8,
        new Date('2026-02-01Z'),
      ).limiteGrupos,
    ).toBe(8);
  });
  it('does not infer unlimited seats when no contract exists', () => {
    expect(
      capacidadesLicenciaInstitucional('school', null, false, null, new Date()),
    ).toMatchObject({
      estadoLicencia: 'SIN_LICENCIA',
      limiteEstudiantes: 0,
      cuposDocentes: 0,
      esGratuito: false,
    });
  });
});
