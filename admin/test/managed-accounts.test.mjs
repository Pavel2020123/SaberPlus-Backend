import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogApi, PanelError } from '../public/api.mjs';
const institutionId = '6f6b2070-45a8-41ee-a27a-6da3380e8dc4';
const response = (value, status = 200) => new Response(JSON.stringify(value), { status });

test('sufijo ausente admite 200 vacío sin ocultar errores de otros recursos', async () => {
  let body = '', status = 200;
  const api = new CatalogApi('/api', { fetcher: async url => {
    if (url.endsWith('/login')) return response({ accessToken: 'synthetic' });
    if (url.endsWith('/perfil')) return response({ rol: 'PROFESOR', debeCambiarContrasena: false });
    return new Response(body, { status });
  } });
  await api.loginCuentas('owner@example.invalid', 'synthetic');
  assert.equal(await api.managedAccounts(institutionId, 'sufijo'), null);
  body = 'null';
  assert.equal(await api.managedAccounts(institutionId, 'sufijo'), null);
  body = JSON.stringify({ solicitado: 'colegio.example', version: 1 });
  assert.equal((await api.managedAccounts(institutionId, 'sufijo')).version, 1);
  body = '';
  await assert.rejects(api.managedAccounts(institutionId, 'grupos'), PanelError);
  body = '{invalido';
  await assert.rejects(api.managedAccounts(institutionId, 'sufijo'), PanelError);
  status = 503; body = '';
  await assert.rejects(api.managedAccounts(institutionId, 'sufijo'), e => e.status === 503);
});

test('login de cuentas admite profesor sin abrir el acceso editorial normal', async () => {
  const fetcher = async url => url.endsWith('/login') ? response({ accessToken: 'synthetic' }) : response({ nombre: 'Owner', rol: 'PROFESOR', institucionId: institutionId, debeCambiarContrasena: false });
  const api = new CatalogApi('/api', { fetcher });
  await assert.rejects(api.login('owner@example.invalid', 'synthetic'), e => e.status === 403);
  assert.equal(api.authenticated, false);
  const profile = await api.loginCuentas('owner@example.invalid', 'synthetic');
  assert.equal(profile.institucionId, institutionId);
  assert.equal(profile.rol, 'PROFESOR');
  assert.equal(api.authenticated, true);
});

test('un alumno o contraseña inicial pendiente no obtiene sesión de gestión', async () => {
  for (const profile of [{ rol: 'ESTUDIANTE', debeCambiarContrasena: false }, { rol: 'PROFESOR', debeCambiarContrasena: true }]) {
    const api = new CatalogApi('/api', { fetcher: async url => url.endsWith('/login') ? response({ accessToken: 'synthetic' }) : response(profile) });
    await assert.rejects(api.loginCuentas('user@example.invalid', 'synthetic'), PanelError);
    assert.equal(api.authenticated, false);
  }
});

test('API de cuentas usa sesión en memoria y no reintenta entrega de secretos', async () => {
  const calls = [];
  const api = new CatalogApi('/api', { fetcher: async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/login')) return response({ accessToken: 'synthetic' });
    if (url.endsWith('/perfil')) return response({ nombre: 'Admin', rol: 'ADMIN', debeCambiarContrasena: false });
    return response({ items: [] });
  } });
  await api.loginCuentas('admin@example.invalid', 'synthetic');
  await api.managedAccounts(institutionId, 'alumnos?pagina=1');
  await api.managedAccounts(institutionId, 'restablecer', { operacionId: institutionId, usuarioId: institutionId });
  assert.equal(calls.length, 4);
  assert.equal(calls.at(-1).options.method, 'POST');
  assert.equal(new Headers(calls.at(-1).options.headers).get('Authorization'), 'Bearer synthetic');
  assert.throws(() => api.managedAccounts(institutionId, '../otra'), PanelError);
  assert.throws(() => api.managedAccounts('no-uuid', 'contexto'), PanelError);
  api.logout();
  assert.throws(() => api.managedAccounts(institutionId, 'contexto'), PanelError);
});
