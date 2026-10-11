import test from 'node:test';
import assert from 'node:assert/strict';
import { InstitutionApproval } from '../public/institution-approval.mjs';
class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.disabled = false; this.value = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  focus() {}
  reportValidity() { return true; }
  get elements() { return flatten(this).filter(n => ['input', 'textarea', 'select', 'button'].includes(n.tag)); }
  set innerHTML(_) { throw new Error('No ejecutar HTML de evidencia.'); }
}
const flatten = (el) => [el, ...el.children.flatMap(flatten)];
function setup(t, api) {
  const original = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { if (original === undefined) delete globalThis.document; else globalThis.document = original; });
  const host = new Element('section');
  const panel = new InstitutionApproval({ api, host, demo: true });
  return { host, panel };
}
const row = { id: 'fixture', nombre: 'Colegio', estado: 'PENDIENTE', revision: 1, evidencia: '<img src=x onerror=alert(1)>', historial: [], mensaje: '' };
for (const decision of ['REQUIERE_INFORMACION', 'APROBADA']) {
test(`guardar ${decision} actualiza filtro, lista y detalle sin conservar estado anterior`, async t => {
  let current = { ...row, departamentoCodigo: '05', municipioCodigo: '05001' };
  const queries = [];
  const { panel, host } = setup(t, {
    institutionApplications: async (state, page) => {
      queries.push({ state, page });
      return { items: current.estado === state ? [current] : [], hayMas: false };
    },
    institutionApplication: async () => current,
    territoryDepartments: async () => ({ version: 'v1', departamentos: [{ codigo: '05', nombre: 'Antioquia' }] }),
    territoryMunicipalities: async () => ({ version: 'v1', departamentoCodigo: '05', municipios: [{ codigo: '05001', nombre: 'Medellín', departamentoCodigo: '05', tipo: 'MUNICIPIO' }] }),
    reviewInstitution: async (_, payload) => {
      current = { ...current, estado: payload.estado, revision: current.revision + 1 };
    },
  });
  await panel.open();
  await panel.inspect('fixture');
  const form = flatten(host).find(n => n.tag === 'form');
  await new Promise(resolve => setImmediate(resolve));
  form.elements.find(n => n.tag === 'select' && n.required).value = decision;
  await form.onsubmit({ preventDefault() {} });
  assert.equal(panel.state, decision);
  assert.equal(panel.filter.value, decision);
  assert.deepEqual(queries.at(-1), { state: decision, page: 1 });
  const label = decision === 'APROBADA' ? 'Aprobada' : 'Requiere información';
  assert.ok(flatten(panel.list).some(n => n.textContent.endsWith(label)));
  assert.ok(flatten(panel.detail).some(n => n.textContent === `Colegio · ${label}`));
  assert.ok(!flatten(panel.list).some(n => n.textContent.endsWith('Pendiente')));
});
}
test('aprobar exige pareja territorial y envía códigos, nunca versión del cliente', async t => {
  const writes = [];
  const { panel, host } = setup(t, {
    institutionApplications: async () => ({ items: [], hayMas: false }),
    institutionApplication: async () => row,
    territoryDepartments: async () => ({ version: 'v1', departamentos: [{ codigo: '05', nombre: 'Antioquia' }] }),
    territoryMunicipalities: async () => ({ version: 'v1', departamentoCodigo: '05', municipios: [{ codigo: '05001', nombre: 'Medellín', departamentoCodigo: '05', tipo: 'MUNICIPIO' }] }),
    reviewInstitution: async (_, payload) => { writes.push(payload); },
  });
  await panel.open(); await panel.inspect('fixture');
  const form = flatten(host).find(n => n.tag === 'form');
  const selects = form.elements.filter(n => n.tag === 'select');
  selects.find(n => n.required).value = 'APROBADA';
  await form.onsubmit({ preventDefault() {} }); assert.equal(writes.length, 0);
  selects[0].value = '05'; await selects[0].onchange(); selects[1].value = '05001';
  await form.onsubmit({ preventDefault() {} });
  assert.equal(writes.length, 1); assert.equal(writes[0].municipioCodigo, '05001');
  assert.equal(writes[0].territorioVersion, undefined);
});
test('evidencia como texto, decisión explícita y limpieza privada al cerrar', async t => {
  const { panel, host } = setup(t, { institutionApplications: async () => ({ items: [], hayMas: false }), institutionApplication: async () => row });
  await panel.open(); await panel.inspect('fixture');
  assert.ok(flatten(host).some(n => n.textContent === row.evidencia));
  const form = flatten(host).find(n => n.tag === 'form');
  assert.ok(form.elements.some(n => n.tag === 'select' && n.required));
  panel.close(); assert.equal(host.hidden, true); assert.equal(host.children.length, 0);
});
test('una respuesta tardía tras cerrar sesión no repone datos', async t => {
  let resolve;
  const { panel, host } = setup(t, { institutionApplications: () => new Promise(r => { resolve = r; }) });
  const pending = panel.open(); panel.close(); resolve({ items: [row], hayMas: false }); await pending;
  assert.equal(host.children.length, 0); assert.equal(host.hidden, true);
});
test('fallo al guardar exige consultar estado; no ofrece repetir decisión a ciegas', async t => {
  const { panel, host } = setup(t, { institutionApplications: async () => ({ items: [], hayMas: false }), institutionApplication: async () => row, reviewInstitution: async () => { throw new Error('Conexión perdida.'); } });
  await panel.open(); await panel.inspect('fixture');
  const form = flatten(host).find(n => n.tag === 'form');
  form.elements.find(n => n.tag === 'select' && n.required).value = 'REQUIERE_INFORMACION';
  await form.onsubmit({ preventDefault() {} });
  assert.ok(form.elements.every(n => n.disabled));
  assert.ok(flatten(host).some(n => n.textContent === 'Consultar estado actual'));
});
