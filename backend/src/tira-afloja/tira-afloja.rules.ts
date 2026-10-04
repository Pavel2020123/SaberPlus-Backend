export const POSICION_META_TIRA_AFLOJA = 4;
export const EMPATE_RAPIDEZ_MS = 200;

/** Authoritative timestamp(6) path. Historical Date rules remain unchanged. */
export function resolverRondaExacta(
  a?: { esCorrecta: boolean; atUs: string },
  b?: { esCorrecta: boolean; atUs: string },
): ResultadoRonda {
  if (a?.esCorrecta && !b?.esCorrecta)
    return { movimiento: 2, motivo: 'SOLO_A_CORRECTA' };
  if (b?.esCorrecta && !a?.esCorrecta)
    return { movimiento: -2, motivo: 'SOLO_B_CORRECTA' };
  if (!a?.esCorrecta || !b?.esCorrecta)
    return { movimiento: 0, motivo: 'NINGUNA_CORRECTA' };
  const delta = BigInt(a.atUs) - BigInt(b.atUs);
  if (delta >= -200000n && delta <= 200000n)
    return { movimiento: 0, motivo: 'EMPATE_RAPIDEZ' };
  return {
    movimiento: delta < 0n ? 1 : -1,
    motivo: delta < 0n ? 'A_MAS_RAPIDO' : 'B_MAS_RAPIDO',
  };
}

export interface RespuestaRonda {
  esCorrecta: boolean;
  recibidaEnMs: number;
}

export interface ResultadoRonda {
  movimiento: number;
  motivo:
    | 'SOLO_A_CORRECTA'
    | 'SOLO_B_CORRECTA'
    | 'A_MAS_RAPIDO'
    | 'B_MAS_RAPIDO'
    | 'EMPATE_RAPIDEZ'
    | 'NINGUNA_CORRECTA';
}

export function resolverRonda(
  respuestaA?: RespuestaRonda,
  respuestaB?: RespuestaRonda,
): ResultadoRonda {
  const correctaA = respuestaA?.esCorrecta === true;
  const correctaB = respuestaB?.esCorrecta === true;

  if (correctaA && !correctaB) {
    return { movimiento: 2, motivo: 'SOLO_A_CORRECTA' };
  }
  if (!correctaA && correctaB) {
    return { movimiento: -2, motivo: 'SOLO_B_CORRECTA' };
  }
  if (!correctaA || !correctaB || !respuestaA || !respuestaB) {
    return { movimiento: 0, motivo: 'NINGUNA_CORRECTA' };
  }

  const diferenciaMs = respuestaA.recibidaEnMs - respuestaB.recibidaEnMs;
  if (Math.abs(diferenciaMs) <= EMPATE_RAPIDEZ_MS) {
    return { movimiento: 0, motivo: 'EMPATE_RAPIDEZ' };
  }
  return diferenciaMs < 0
    ? { movimiento: 1, motivo: 'A_MAS_RAPIDO' }
    : { movimiento: -1, motivo: 'B_MAS_RAPIDO' };
}

export function moverCuerda(
  posicionActual: number,
  movimiento: number,
): number {
  return Math.max(
    -POSICION_META_TIRA_AFLOJA,
    Math.min(POSICION_META_TIRA_AFLOJA, posicionActual + movimiento),
  );
}

export function ganadorPorPosicion(
  posicion: number,
): 'JUGADOR_A' | 'JUGADOR_B' | undefined {
  if (posicion >= POSICION_META_TIRA_AFLOJA) return 'JUGADOR_A';
  if (posicion <= -POSICION_META_TIRA_AFLOJA) return 'JUGADOR_B';
  return undefined;
}

export function resultadoPorPreguntasAgotadas(
  posicion: number,
): 'JUGADOR_A' | 'JUGADOR_B' | 'EMPATE' {
  if (posicion > 0) return 'JUGADOR_A';
  if (posicion < 0) return 'JUGADOR_B';
  return 'EMPATE';
}
