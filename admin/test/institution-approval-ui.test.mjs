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
test('evidencia como texto, decisión explícita y limpieza privada al cerrar', async t => {
  const { panel, host } = setup(t, { institutionApplications: async () => ({ items: [], hayMas: false }), institutionApplication: async () => row });
  await panel.open(); await panel.inspect('fixture');
  assert.ok(flatten(host).some(n => n.textContent === row.evidencia));
  const form = flatten(host).find(n => n.tag === 'form');
  assert.equal(form.elements.find(n => n.tag === 'select').required, true);
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
  await form.onsubmit({ preventDefault() {} });
  assert.ok(form.elements.every(n => n.disabled));
  assert.ok(flatten(host).some(n => n.textContent === 'Consultar estado actual'));
});
