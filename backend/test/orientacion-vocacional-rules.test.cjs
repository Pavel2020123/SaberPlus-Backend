// Dependency-free contract smoke checks for Node 24 (native TypeScript stripping).
// Complements, but does not replace, the Nest/Jest and PostgreSQL suites.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evaluar, PREGUNTA_IDS, FAMILIAS } = require('../src/orientacion-vocacional/ov1.rules.ts');
const all = (valor = 4) => PREGUNTA_IDS.map(preguntaId => ({ preguntaId, valor }));
const set = (r, prefix, values) => values.forEach((valor, i) => { r.find(a => a.preguntaId === `${prefix}${i + 1}`).valor = valor; });
test('A: technology 90, health 40', () => {
  const r = all(); set(r, 'T', [4,4,3,4,3]); set(r, 'S', [2,1,2,1,2]);
  assert.deepEqual(evaluar(r).familias.slice(0, 2).map(f => f.puntaje), [90,40]);
});
test('B: NO_SE excluded; sum 10 / maximum 12, coverage 3/5', () => {
  const r = all(); set(r, 'S', [4,'NO_SE',3,'NO_SE',3]); const f = evaluar(r).familias[1];
  assert.equal(f.suma, 10); assert.equal(f.denominador, 12); assert.equal(f.cantidadValidas, 3); assert.equal(f.puntaje, 1000/12);
});
test('C: equal 80 scores all survive a tie at third place', () => {
  const r = all(); for (const p of ['C','H','N']) set(r,p,[4,4,4,4,0]); set(r,'D',[0,0,0,0,0]);
  assert.deepEqual(evaluar(r).principales,[FAMILIAS[0],FAMILIAS[1],FAMILIAS[2],FAMILIAS[3],FAMILIAS[4]]);
});
test('D: 23 numeric responses cannot finalize', () => {
  const r = all().slice(0,23); assert.equal(evaluar(r).finalizable,false); assert.deepEqual(evaluar(r).principales,[]);
});
test('24 numeric responses with four in each family can finalize', () => {
  const r=all(); r.filter(a=>a.preguntaId.endsWith('5')).forEach(a=>a.valor='NO_SE');
  assert.equal(evaluar(r).finalizable,true); assert.equal(evaluar(r).cantidadValidas,24);
});
test('27 total cannot compensate a family with fewer than three', () => {
  const r=all();set(r,'S',[4,4,'NO_SE','NO_SE','NO_SE']);assert.equal(evaluar(r).finalizable,false);
});
test('zero is evidence, absence is not; all zero scores tie', () => {
  assert.deepEqual(evaluar(all(0)).principales,[...FAMILIAS]);
  assert.equal(evaluar(all('NO_SE')).cantidadValidas,0);
  assert.ok(evaluar([]).familias.every(f=>f.puntaje===null));
});
test('invalid values, identifiers and duplicate questions are rejected', () => {
  for (const valor of [-1,5,0.5,'4',null,true,undefined]) assert.throws(()=>evaluar([{preguntaId:'T1',valor}]));
  assert.throws(()=>evaluar([{preguntaId:'X1',valor:4}]));
  assert.throws(()=>evaluar([{preguntaId:'T1',valor:0},{preguntaId:'T1',valor:4}]));
});
