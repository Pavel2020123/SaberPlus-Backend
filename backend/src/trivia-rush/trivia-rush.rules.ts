export const VERSION_REGLAS_TRIVIA_RUSH = 1;
export const PUNTOS_BASE_TRIVIA_RUSH = 100;
export const SEGUNDOS_TIEMPO_EXTRA = 10;
export const DURACIONES_TRIVIA_RUSH = [60, 90, 120] as const;

export interface MarcadorTriviaRush {
  puntaje: number;
  comboActual: number;
  mejorCombo: number;
  respuestasCorrectas: number;
  respuestasIncorrectas: number;
  preguntasSaltadas: number;
}

export interface ResolucionRespuestaTriviaRush extends MarcadorTriviaRush {
  esFinal: boolean;
  puntosOtorgados: number;
  puedeReintentar: boolean;
  consumioEscudo: boolean;
}

export function esDuracionTriviaRushValida(segundos: number): boolean {
  return DURACIONES_TRIVIA_RUSH.includes(
    segundos as (typeof DURACIONES_TRIVIA_RUSH)[number],
  );
}

export function multiplicadorTriviaRush(combo: number): number {
  if (combo >= 10) return 4;
  if (combo >= 6) return 3;
  if (combo >= 3) return 2;
  return 1;
}

export function resolverRespuestaTriviaRush(
  marcador: MarcadorTriviaRush,
  esCorrecta: boolean,
  opciones: {
    escudoComboActivo: boolean;
    segundaOportunidadActiva: boolean;
  },
): ResolucionRespuestaTriviaRush {
  if (!esCorrecta && opciones.segundaOportunidadActiva) {
    return {
      ...marcador,
      esFinal: false,
      puntosOtorgados: 0,
      puedeReintentar: true,
      consumioEscudo: false,
    };
  }

  if (esCorrecta) {
    const combo = marcador.comboActual + 1;
    const puntos = PUNTOS_BASE_TRIVIA_RUSH * multiplicadorTriviaRush(combo);
    return {
      ...marcador,
      puntaje: marcador.puntaje + puntos,
      comboActual: combo,
      mejorCombo: Math.max(marcador.mejorCombo, combo),
      respuestasCorrectas: marcador.respuestasCorrectas + 1,
      esFinal: true,
      puntosOtorgados: puntos,
      puedeReintentar: false,
      consumioEscudo: false,
    };
  }

  return {
    ...marcador,
    comboActual: opciones.escudoComboActivo ? marcador.comboActual : 0,
    respuestasIncorrectas: marcador.respuestasIncorrectas + 1,
    esFinal: true,
    puntosOtorgados: 0,
    puedeReintentar: false,
    consumioEscudo: opciones.escudoComboActivo,
  };
}

export function registrarSaltoTriviaRush(
  marcador: MarcadorTriviaRush,
): MarcadorTriviaRush {
  return {
    ...marcador,
    preguntasSaltadas: marcador.preguntasSaltadas + 1,
  };
}

export function milisegundosRespuestaTriviaRush(
  preguntaIniciaEn: Date,
  respondidaEn: Date,
): number {
  return Math.max(
    0,
    Math.min(3_600_000, respondidaEn.getTime() - preguntaIniciaEn.getTime()),
  );
}

export function intentoTriviaRushVencido(
  venceEn: Date,
  servidorAhora: Date,
): boolean {
  return servidorAhora.getTime() >= venceEn.getTime();
}
