import {
  esDuracionTriviaRushValida,
  intentoTriviaRushVencido,
  milisegundosRespuestaTriviaRush,
  multiplicadorTriviaRush,
  registrarSaltoTriviaRush,
  resolverRespuestaTriviaRush,
} from './trivia-rush.rules';

const marcador = {
  puntaje: 200,
  comboActual: 2,
  mejorCombo: 2,
  respuestasCorrectas: 2,
  respuestasIncorrectas: 0,
  preguntasSaltadas: 0,
};

describe('reglas autoritativas de Trivia Rush', () => {
  it('solo admite las tres duraciones publicadas', () => {
    expect([60, 90, 120].every(esDuracionTriviaRushValida)).toBe(true);
    expect(esDuracionTriviaRushValida(30)).toBe(false);
    expect(esDuracionTriviaRushValida(9999)).toBe(false);
  });

  it('calcula multiplicadores y puntos desde el combo del servidor', () => {
    expect([0, 2, 3, 6, 10].map(multiplicadorTriviaRush)).toEqual([
      1, 1, 2, 3, 4,
    ]);
    const resultado = resolverRespuestaTriviaRush(marcador, true, {
      escudoComboActivo: false,
      segundaOportunidadActiva: false,
    });
    expect(resultado).toEqual(
      expect.objectContaining({
        puntaje: 400,
        comboActual: 3,
        mejorCombo: 3,
        puntosOtorgados: 200,
        respuestasCorrectas: 3,
      }),
    );
  });

  it('la segunda oportunidad no revela ni finaliza el primer error', () => {
    const resultado = resolverRespuestaTriviaRush(marcador, false, {
      escudoComboActivo: false,
      segundaOportunidadActiva: true,
    });
    expect(resultado).toEqual(
      expect.objectContaining({
        esFinal: false,
        puedeReintentar: true,
        comboActual: 2,
        respuestasIncorrectas: 0,
      }),
    );
  });

  it('el escudo conserva el combo solo durante un error final', () => {
    const protegida = resolverRespuestaTriviaRush(marcador, false, {
      escudoComboActivo: true,
      segundaOportunidadActiva: false,
    });
    const normal = resolverRespuestaTriviaRush(marcador, false, {
      escudoComboActivo: false,
      segundaOportunidadActiva: false,
    });
    expect(protegida.comboActual).toBe(2);
    expect(protegida.consumioEscudo).toBe(true);
    expect(normal.comboActual).toBe(0);
  });

  it('saltar no altera puntos ni combo', () => {
    expect(registrarSaltoTriviaRush(marcador)).toEqual({
      ...marcador,
      preguntasSaltadas: 1,
    });
  });

  it('mide el tiempo exclusivamente con fechas del servidor y lo limita', () => {
    const inicio = new Date('2026-08-31T10:00:00.000Z');
    expect(
      milisegundosRespuestaTriviaRush(
        inicio,
        new Date('2026-08-31T10:00:03.450Z'),
      ),
    ).toBe(3450);
    expect(
      milisegundosRespuestaTriviaRush(
        inicio,
        new Date('2026-08-31T09:59:00.000Z'),
      ),
    ).toBe(0);
  });

  it('considera vencido el intento en el instante exacto del limite', () => {
    const limite = new Date('2026-08-31T10:01:00.000Z');
    expect(
      intentoTriviaRushVencido(limite, new Date('2026-08-31T10:00:59.999Z')),
    ).toBe(false);
    expect(intentoTriviaRushVencido(limite, limite)).toBe(true);
  });
});
