export const OV1_RULES_VERSION = 1;
export const FAMILIAS = [
  'TECNOLOGIA_INGENIERIA', 'SALUD_CIENCIAS_VIDA',
  'SOCIEDAD_DERECHO_COMUNICACION', 'NEGOCIOS_ORGANIZACION_EMPRENDIMIENTO',
  'EDUCACION_HUMANIDADES_IDIOMAS', 'CREATIVIDAD_DISENO_ENTORNO',
] as const;
export type RespuestaOV = 0 | 1 | 2 | 3 | 4 | 'NO_SE';
export interface Respuesta { preguntaId: string; valor: RespuestaOV }
export const PREFIJOS = ['T', 'S', 'C', 'N', 'H', 'D'];
export const PREGUNTA_IDS = PREFIJOS.flatMap(p => [1, 2, 3, 4, 5].map(n => `${p}${n}`));

export function evaluar(respuestas: Respuesta[]) {
  const ids = new Set<string>();
  for (const r of respuestas) {
    if (!PREGUNTA_IDS.includes(r.preguntaId) || ids.has(r.preguntaId) ||
        ![0, 1, 2, 3, 4, 'NO_SE'].includes(r.valor)) throw new Error('RESPUESTA_INVALIDA');
    ids.add(r.preguntaId);
  }
  const familias = FAMILIAS.map((familia, i) => {
    const validas = respuestas.filter(r => r.preguntaId.startsWith(PREFIJOS[i]) && r.valor !== 'NO_SE');
    const suma = validas.reduce((s, r) => s + (r.valor as number), 0);
    const cantidadValidas = validas.length;
    const denominador = cantidadValidas * 4;
    return { familia, suma, denominador, cantidadValidas, totalPreguntas: 5,
      puntaje: denominador ? suma * 100 / denominador : null };
  });
  const cantidadValidas = familias.reduce((s, f) => s + f.cantidadValidas, 0);
  const finalizable = cantidadValidas >= 24 && familias.every(f => f.cantidadValidas >= 3);
  // Compare exact fractions, never rounded presentation values. Equal scores share priority.
  const ordenadas = finalizable ? [...familias].sort((a, b) => b.suma * a.denominador - a.suma * b.denominador) : [];
  const tercera = ordenadas[2];
  const principales = tercera ? ordenadas.filter(f => f.suma * tercera.denominador >= tercera.suma * f.denominador).map(f => f.familia) : [];
  return { ov1RulesVersion: OV1_RULES_VERSION, finalizable, cantidadValidas, totalPreguntas: 30, familias, principales };
}
