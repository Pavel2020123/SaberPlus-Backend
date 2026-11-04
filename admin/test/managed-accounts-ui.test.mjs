import test from 'node:test';
import assert from 'node:assert/strict';
import { ManagedAccounts } from '../public/managed-accounts.mjs';
class Element {
  constructor(tag) { this.tag = tag; this.tagName = tag.toUpperCase(); this.children = []; this.textContent = ''; this.disabled = false; this.value = ''; }
  append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute() {}
  focus() {}
  reportValidity() { return true; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(n => n !== this); }
  querySelectorAll() { return flatten(this).filter(n => ['input','select','button','textarea'].includes(n.tag)); }
  set innerHTML(_) { throw new Error('No ejecutar HTML recibido.'); }
}
const flatten = el => [el, ...el.children.flatMap(flatten)];
function setup(t, api) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const host = new Element('div');
  return { host, panel: new ManagedAccounts({ api, host, confirm: () => true }) };
}
const institution = 'ed393b50-642d-4fb3-9b84-c1921f40952b';

test('propietario sin sufijo ve solicitud y alumnos vacíos, no error de conexión', async t => {
  const { panel, host } = setup(t, { managedAccounts: async (_, action) => {
    if (action === 'contexto') return { puedeImportar: true, puedeAprobar: false };
    if (action === 'sufijo') return null;
    if (action === 'alumnos?pagina=1') return { items: [], pagina: 1, tieneSiguiente: false };
    throw new Error(`Unexpected action ${action}`);
  } });
  await panel.open(institution);
  assert(flatten(host).some(n => n.textContent === 'Todavía no hay una solicitud de sufijo.'));
  assert(flatten(host).some(n => n.id === 'managed-suffix'));
  assert.equal(panel.message.textContent, '');
});
const student = { id: 'student', nombre: '<img src=x onerror=alert(1)>', identificadorInstitucional: 'ana@colegio.example' };
function fixture(handler) {
  return { managedAccounts: async (id, action, body) => {
    if (handler) { const custom = await handler(id, action, body); if (custom !== undefined) return custom; }
    if (action === 'contexto') return { puedeImportar: false, puedeAprobar: false };
    if (action.startsWith('alumnos')) return { items: [student], pagina: 1, tieneSiguiente: false };
    throw new Error(`Unexpected action ${action}`);
  } };
}

test('docente solo ve restablecimiento y renderiza nombres como texto, nunca HTML', async t => {
  const { panel, host } = setup(t, fixture()); await panel.open(institution);
  assert(flatten(host).some(n => n.textContent === student.nombre));
  assert(!flatten(host).some(n => n.tag === 'form'));
  assert(flatten(host).some(n => n.textContent === `Restablecer acceso de ${student.nombre}`));
});

test('claves visibles y referencias DOM se vacían al cerrar', async t => {
  const { panel, host } = setup(t, fixture()); await panel.open(institution);
  panel.deliver({ credenciales: [{ usuarioInstitucional: student.identificadorInstitucional, contrasenaTemporal: 'synthetic-secret' }] });
  const secretHost = panel.secretHost;
  assert(flatten(host).some(n => n.textContent === 'synthetic-secret'));
  panel.close();
  assert.equal(host.children.length, 0); assert.equal(secretHost.children.length, 0);
  assert.equal(panel.secretHost, null); assert.equal(panel.pending.size, 0);
});

test('respuesta tardía de un reset no reabre claves tras logout', async t => {
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  const { panel, host } = setup(t, fixture(async (_id, action) => action === 'restablecer' ? waiting : undefined));
  await panel.open(institution);
  const task = panel.run(async version => {
    const result = await panel.command('restablecer', { usuarioId: student.id }, version);
    if (result) panel.deliver(result);
  });
  panel.close(); release({ credenciales: [{ usuarioInstitucional: 'user', contrasenaTemporal: 'late-secret' }] });
  await task; assert.equal(host.children.length, 0);
});

test('reintentar un envío incierto conserva UUID y nunca auto-reintenta', async t => {
  const ids = []; let fail = true;
  const { panel } = setup(t, fixture(async (_id, action, body) => {
    if (action !== 'restablecer') return;
    ids.push(body.operacionId);
    if (fail) { fail = false; throw new Error('Respuesta perdida'); }
    return { repetida: true, credenciales: [] };
  }));
  await panel.open(institution);
  await panel.run(version => panel.command('restablecer', { usuarioId: student.id }, version));
  assert.equal(ids.length, 1);
  await panel.run(async version => panel.deliver(await panel.command('restablecer', { usuarioId: student.id }, version)));
  assert.equal(ids.length, 2); assert.equal(ids[0], ids[1]);
  assert.match(panel.message.textContent, /no se vuelve a entregar/);
});

test('previsualización habilita Confirmar y editar invalida esa confirmación', async t => {
  const { panel, host } = setup(t, fixture(async (_id, action) => {
    if (action === 'contexto') return { puedeImportar: true, puedeAprobar: false };
    if (action === 'sufijo') return { aprobado: 'colegio.example' };
    if (action === 'grupos') return [{ id: 'group', nombre: 'Once', grado: 'ONCE' }];
    if (action === 'previsualizar') return { filas: [{ nombre: 'Ana', alias: 'ana@colegio.example' }], disponibles: 1, conflictos: [], puedeConfirmar: true, huella: 'a'.repeat(64) };
  }));
  await panel.open(institution);
  const form = flatten(host).find(n => n.tag === 'form' && flatten(n).some(el => el.id === 'managed-csv'));
  const csv = flatten(host).find(n => n.id === 'managed-csv'); csv.value = 'nombre,usuario\nAna,ana';
  flatten(host).find(n => n.id === 'managed-group').value = 'group';
  form.onsubmit({ preventDefault() {} }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(panel.confirmButton.disabled, false);
  csv.value += '2'; csv.oninput(); assert.equal(panel.confirmButton.disabled, true);
});
