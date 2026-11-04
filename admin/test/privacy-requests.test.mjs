import test from 'node:test';
import assert from 'node:assert/strict';
import { PrivacyRequests } from '../public/privacy-requests.mjs';
import { CatalogApi, PanelError } from '../public/api.mjs';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.value = ''; this.disabled = false; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  setAttribute() {}
  focus() {}
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(node => node !== this); }
  querySelectorAll(tag) { return flat(this).filter(node => node.tag === tag); }
  reportValidity() { return true; }
  set innerHTML(_) { assert.fail('Never interpret supplied HTML'); }
}
const flat = node => [node, ...node.children.flatMap(flat)];
const id = '6f6b2070-45a8-41ee-a27a-6da3380e8dc4';
const review = name => ({ id, estado: 'PENDIENTE', version: 1, cuenta: { nombre: name }, registros: { diagnosticos: 1 }, bloqueos: [], huellaRevision: 'a'.repeat(64) });
function setup(t, api, canReview = false) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const host = new Element('div');
  return { host, panel: new PrivacyRequests({ api, host, canReview, confirm: () => true }) };
}
test('propietario solicita sin ver revisión o ejecución; texto de cuenta no se interpreta', async t => {
  const calls = [];
  const { panel, host } = setup(t, { privacyRequests: async action => { calls.push(action); return { items: [{ id, estado: 'PENDIENTE', version: 1 }] }; } });
  await panel.open(); panel.startRequest(id, '<img src=x onerror=alert(1)>');
  assert(flat(host).some(el => el.id === 'privacy-target' && el.readOnly));
  assert(!flat(host).some(el => el.textContent === 'Revisar impacto'));
  await panel.review(id); assert.equal(calls.length, 1);
});
test('revisión con bloqueos explica el motivo y no ofrece ejecución', async t => {
  const api = { privacyRequests: async action => action.startsWith('?') ? { items: [] } : { ...review('Alumno'), bloqueos: ['Hay partidas pendientes.'] } };
  const { panel, host } = setup(t, api, true); await panel.open(); await panel.review(id);
  assert(flat(host).some(el => el.textContent === 'Hay partidas pendientes.'));
  assert(!flat(host).some(el => el.id === 'privacy-confirm'));
});
test('revisión tardía no reemplaza la seleccionada ni vuelve tras cerrar', async t => {
  let resolve;
  const { panel, host } = setup(t, { privacyRequests: async action => action.startsWith('?') ? { items: [] } : action.startsWith('primera') ? new Promise(r => resolve = r) : review('Segunda') }, true);
  await panel.open(); const pending = panel.review('primera'); await panel.review('segunda'); resolve(review('Primera')); await pending;
  assert(flat(host).some(el => el.textContent === 'Revisión: Segunda'));
  assert(!flat(host).some(el => el.textContent === 'Revisión: Primera'));
  const pending2 = panel.review('primera'); panel.close(); resolve(review('Primera')); await pending2;
  assert.equal(host.children.length, 0);
});
test('error de ejecución conserva confirmación sin reenviar automáticamente', async t => {
  const posts = [];
  const { panel, host } = setup(t, { privacyRequests: async (action, body) => {
    if (body) { posts.push({ action, body }); throw new Error('No se confirmó el resultado'); }
    return action.startsWith('?') ? { items: [] } : review('Alumno');
  } }, true);
  await panel.open(); await panel.review(id);
  const input = flat(host).find(el => el.id === 'privacy-confirm'); input.value = 'SUPRIMIR CUENTA'; input.oninput();
  await panel.command(`${id}/ejecutar`, { version: 1, huellaRevision: 'a'.repeat(64), confirmacion: input.value }, 'OK');
  assert.equal(posts.length, 1); assert.equal(input.value, 'SUPRIMIR CUENTA'); assert.equal(panel.hasDraft, true);
  assert(flat(host).some(el => el.textContent === 'Consultar estado actual'));
});
test('privacidad usa rutas cerradas; 403 conserva sesión y no reintenta', async () => {
  let expired = 0; const calls = [];
  const api = new CatalogApi('/api', { onSessionExpired: () => expired++, fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) return new Response(JSON.stringify({ accessToken: 'synthetic' }));
    if (url.endsWith('/perfil')) return new Response(JSON.stringify({ rol: 'ADMIN', debeCambiarContrasena: false }));
    return new Response(JSON.stringify({ message: 'Solo ADMIN revisa supresiones.' }), { status: 403 });
  } });
  await api.loginCuentas('admin@example.invalid', 'synthetic');
  await assert.rejects(api.privacyRequests(`${id}/ejecutar`, { confirmacion: 'SUPRIMIR CUENTA' }), error => error.status === 403);
  assert.equal(api.authenticated, true); assert.equal(expired, 0); assert.equal(calls.length, 3);
  for (const action of ['../otra', '?pagina=0', '?pagina=1&usuarioId=otro', `${id}/eliminar`]) assert.throws(() => api.privacyRequests(action), PanelError);
});
