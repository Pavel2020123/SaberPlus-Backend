import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogApi, PanelError } from '../public/api.mjs';
import { InstitutionLifecycle } from '../public/institution-lifecycle.mjs';

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.disabled = false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  querySelectorAll(tag) { return flatten(this).filter(el => el.tag === tag); }
  set innerHTML(_) { assert.fail('Never render received HTML'); }
}
const flatten = el => [el, ...el.children.flatMap(flatten)];
const institution = '6f6b2070-45a8-41ee-a27a-6da3380e8dc4';
const row = { id: institution, usuarioId: institution, nombre: '<img src=x onerror=alert(1)>', tipo: 'ESTUDIANTE', estado: 'ACTIVA', gestionada: false, vinculada: true, actualizadoEn: '2026-11-03T15:00:00.000Z' };
function setup(t, api, confirm = () => true) {
  const previous = globalThis.document;
  globalThis.document = { createElement: tag => new Element(tag) };
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; });
  const host = new Element('div');
  return { host, panel: new InstitutionLifecycle({ api: { privacyRequests: async () => ({ items: [] }), ...api }, host, institutionId: institution, confirm }) };
}
test('bajas presenta acciones separadas, no HTML ni eliminación definitiva', async t => {
  const api = { institutionLifecycle: async () => ({ items: [row], pagina: 1, tieneSiguiente: false }) };
  const { panel, host } = setup(t, api);
  await panel.open();
  assert(flatten(host).some(el => el.textContent === row.nombre));
  assert(flatten(host).some(el => el.textContent === 'Retirar cupo · conservar historial'));
  assert(flatten(host).some(el => el.textContent === 'Desvincular y volver a personal'));
  assert(!flatten(host).some(el => el.tag === 'button' && el.textContent.includes('Eliminar')));
});
test('cuenta gestionada nunca ofrece conversión personal y propietario no ofrece baja', async t => {
  const api = { institutionLifecycle: async () => ({ items: [{ ...row, gestionada: true }, { ...row, propietario: true }] }) };
  const { panel, host } = setup(t, api); await panel.open();
  assert.equal(flatten(host).filter(el => el.textContent === 'Desvincular y volver a personal').length, 0);
  assert.equal(flatten(host).filter(el => el.textContent === 'Retirar cupo · conservar historial').length, 1);
});
test('cancelar confirmación no escribe; resultado incierto conserva operación para reintento explícito', async t => {
  let allowed = false; const calls = [];
  const api = { institutionLifecycle: async (_, action, body) => {
    if (body) { calls.push({ action, body }); throw new Error('Resultado incierto: revisa el estado'); }
    return { items: [row] };
  } };
  const { panel, host } = setup(t, api, () => allowed); await panel.open();
  await panel.command('retirar', row, panel.generation); assert.equal(calls.length, 0);
  allowed = true;
  await panel.command('retirar', row, panel.generation);
  await panel.command('retirar', row, panel.generation);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.operacionId, calls[1].body.operacionId);
  assert.equal(calls[0].body.versionAsignacion, row.actualizadoEn);
  assert(flatten(host).some(el => el.textContent === 'Revisar estado actual'));
});
test('respuesta tardía no vuelve a pintar datos al cerrar', async t => {
  let resolve;
  const { panel, host } = setup(t, { institutionLifecycle: () => new Promise(r => resolve = r) });
  const load = panel.open(); panel.close(); resolve({ items: [row] }); await load;
  assert.equal(host.children.length, 0);
});
test('contrato de bajas solo usa rutas acotadas y no reintenta escrituras', async () => {
  const calls = [];
  const api = new CatalogApi('/api', { fetcher: async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(url.endsWith('/login') ? { accessToken: 'synthetic' } : url.endsWith('/perfil') ? { rol: 'PROFESOR', debeCambiarContrasena: false } : {}));
  } });
  await api.loginCuentas('owner@example.invalid', 'synthetic');
  await api.institutionLifecycle(institution, 'bajas?pagina=1');
  await api.institutionLifecycle(institution, 'retirar', { operacionId: institution, usuarioId: institution, versionAsignacion: row.actualizadoEn });
  assert.equal(calls.at(-1).options.method, 'POST'); assert.equal(calls.length, 4);
  for (const invalid of ['../otra', 'bajas?pagina=0', 'bajas?pagina=1&institucionId=otra', 'eliminar']) assert.throws(() => api.institutionLifecycle(institution, invalid), PanelError);
  api.logout(); assert.throws(() => api.institutionLifecycle(institution, 'mi-salida'), PanelError);
});
