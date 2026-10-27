import { evaluar, FAMILIAS, PREGUNTA_IDS, Respuesta, RespuestaOV } from './ov1.rules';
import { CUESTIONARIO_V1 } from './ov1.catalog';

const completas = (valor: RespuestaOV = 4): Respuesta[] => PREGUNTA_IDS.map(preguntaId => ({ preguntaId, valor }));
function familia(respuestas: Respuesta[], prefijo: string, valores: RespuestaOV[]) {
  valores.forEach((valor, i) => { respuestas.find(r => r.preguntaId === `${prefijo}${i + 1}`)!.valor = valor; });
}
describe('OV1: declared interests, exact fractions and coverage', () => {
  it('contains exactly 30 stable unique questions and five per family', () => {
    expect(CUESTIONARIO_V1.map(p => p.id)).toEqual(PREGUNTA_IDS);
    for (const f of FAMILIAS) expect(CUESTIONARIO_V1.filter(p => p.familia === f)).toHaveLength(5);
    expect(Object.isFrozen(CUESTIONARIO_V1)).toBe(true);
  });
  it('example A: technology 90 exceeds health 40', () => {
    const r = completas(); familia(r, 'T', [4,4,3,4,3]); familia(r, 'S', [2,1,2,1,2]);
    expect(evaluar(r).familias.slice(0,2).map(f => f.puntaje)).toEqual([90,40]);
  });
  it('example B: NO_SE is excluded from the denominator, not converted to zero', () => {
    const r = completas(); familia(r, 'S', [4,'NO_SE',3,'NO_SE',3]);
    expect(evaluar(r).familias[1]).toMatchObject({ suma:10, denominador:12, cantidadValidas:3, puntaje:1000/12 });
  });
  it('example C and third-boundary ties retain all families at equal priority', () => {
    const r = completas(); familia(r,'C',[4,4,4,4,0]); familia(r,'H',[4,4,4,4,0]);
    familia(r,'N',[4,4,4,4,0]); familia(r,'D',[0,0,0,0,0]);
    expect(evaluar(r).principales).toEqual([FAMILIAS[0], FAMILIAS[1], FAMILIAS[2], FAMILIAS[3], FAMILIAS[4]]);
  });
  it('equal fractions with different denominators have the same priority', () => {
    const r = completas(); familia(r,'T',[3,3,3,'NO_SE','NO_SE']); familia(r,'S',[3,3,3,3,3]);
    familia(r,'C',[4,4,4,4,4]); familia(r,'N',[4,4,4,4,4]); familia(r,'H',[0,0,0,0,0]); familia(r,'D',[0,0,0,0,0]);
    expect(evaluar(r).principales).toEqual([FAMILIAS[2],FAMILIAS[3],FAMILIAS[0],FAMILIAS[1]]);
  });
  it('example D: 23 numeric answers produce no final result', () => {
    const r=completas(); r.slice(0,7).forEach(a=>a.valor='NO_SE');
    expect(evaluar(r)).toMatchObject({finalizable:false,cantidadValidas:23,principales:[]});
  });
  it('24 answers with at least three per family can finalize', () => {
    const r=completas(); r.filter(a=>a.preguntaId.endsWith('5')).forEach(a=>a.valor='NO_SE');
    expect(evaluar(r)).toMatchObject({finalizable:true,cantidadValidas:24});
  });
  it('27 numeric answers still fail if one family has only two', () => {
    const r=completas(); familia(r,'S',[4,4,'NO_SE','NO_SE','NO_SE']);
    expect(evaluar(r).finalizable).toBe(false);
  });
  it('zero is valid evidence; all-zero scores tie across all six families', () => {
    expect(evaluar(completas(0))).toMatchObject({finalizable:true,cantidadValidas:30,principales:[...FAMILIAS]});
  });
  it('missing answers and NO_SE never create a score without evidence', () => {
    for (const r of [[],completas('NO_SE')]) {
      const e=evaluar(r);expect(e.finalizable).toBe(false);expect(e.familias.every(f=>f.puntaje===null)).toBe(true);
    }
  });
  it.each([-1,5,1.5,'4',null,true,undefined])('rejects noncontract value %p', valor => {
    expect(()=>evaluar([{preguntaId:'T1',valor:valor as RespuestaOV}])).toThrow('RESPUESTA_INVALIDA');
  });
  it('rejects duplicate and unknown question identifiers', () => {
    expect(()=>evaluar([{preguntaId:'T1',valor:1},{preguntaId:'T1',valor:2}])).toThrow();
    expect(()=>evaluar([{preguntaId:'X1',valor:1}])).toThrow();
  });
});
