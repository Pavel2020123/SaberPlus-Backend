import {
  EMPATE_RAPIDEZ_MS,
  ganadorPorPosicion,
  moverCuerda,
  resolverRonda,
  resultadoPorPreguntasAgotadas,
} from './tira-afloja.rules';

describe('reglas de tira y afloja', () => {
  it('mueve dos espacios cuando solo A acierta', () => {
    expect(
      resolverRonda(
        { esCorrecta: true, recibidaEnMs: 1000 },
        { esCorrecta: false, recibidaEnMs: 900 },
      ),
    ).toEqual({ movimiento: 2, motivo: 'SOLO_A_CORRECTA' });
  });

  it('mueve dos espacios hacia B cuando solo B acierta', () => {
    expect(
      resolverRonda(undefined, { esCorrecta: true, recibidaEnMs: 1000 }),
    ).toEqual({ movimiento: -2, motivo: 'SOLO_B_CORRECTA' });
  });

  it('premia con un espacio al jugador correcto mas rapido', () => {
    expect(
      resolverRonda(
        { esCorrecta: true, recibidaEnMs: 1000 },
        { esCorrecta: true, recibidaEnMs: 1400 },
      ).movimiento,
    ).toBe(1);
  });

  it('considera empate una diferencia de hasta 200 ms', () => {
    expect(
      resolverRonda(
        { esCorrecta: true, recibidaEnMs: 1000 },
        {
          esCorrecta: true,
          recibidaEnMs: 1000 + EMPATE_RAPIDEZ_MS,
        },
      ),
    ).toEqual({ movimiento: 0, motivo: 'EMPATE_RAPIDEZ' });
  });

  it('no mueve la cuerda si ninguno acierta o ambos agotan el tiempo', () => {
    expect(resolverRonda()).toEqual({
      movimiento: 0,
      motivo: 'NINGUNA_CORRECTA',
    });
    expect(
      resolverRonda(
        { esCorrecta: false, recibidaEnMs: 1000 },
        { esCorrecta: false, recibidaEnMs: 1200 },
      ).movimiento,
    ).toBe(0);
  });

  it('limita la cuerda entre -4 y 4 y detecta al ganador', () => {
    expect(moverCuerda(3, 2)).toBe(4);
    expect(moverCuerda(-3, -2)).toBe(-4);
    expect(ganadorPorPosicion(4)).toBe('JUGADOR_A');
    expect(ganadorPorPosicion(-4)).toBe('JUGADOR_B');
    expect(ganadorPorPosicion(3)).toBeUndefined();
  });

  it('desempata por posicion cuando se agota el banco', () => {
    expect(resultadoPorPreguntasAgotadas(2)).toBe('JUGADOR_A');
    expect(resultadoPorPreguntasAgotadas(-1)).toBe('JUGADOR_B');
    expect(resultadoPorPreguntasAgotadas(0)).toBe('EMPATE');
  });
});
