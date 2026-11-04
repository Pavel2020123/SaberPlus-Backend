import { CatalogApi } from './api.mjs';
import { ManagedAccounts } from './managed-accounts.mjs';
const $ = id => document.getElementById(id);
const config = globalThis.SABERPLUS_CONFIG;
let generation = 0;
const message = $('accounts-session-message');
const api = new CatalogApi(config.apiBase, { demo: config.demo, onSessionExpired: () => logout('La sesión terminó o cambió. Ingresa de nuevo.') });
const panel = new ManagedAccounts({ api, host: $('accounts-work') });
function logout(text = '') {
  generation++; panel.close(); api.logout();
  $('accounts-login').hidden = false; $('accounts-selection').hidden = true; $('accounts-logout').hidden = true;
  $('accounts-password').value = ''; $('accounts-institution').value = ''; $('accounts-welcome').textContent = '';
  message.setAttribute('role', 'status'); message.textContent = text;
}
$('accounts-logout').onclick = () => logout('Sesión cerrada. Las claves visibles se han borrado de esta vista.');
$('accounts-login-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const current = generation; const submit = form.querySelector('button'); submit.disabled = true; message.setAttribute('role', 'status'); message.textContent = 'Verificando acceso…';
  try {
    const profile = await api.loginCuentas($('accounts-user').value, $('accounts-password').value);
    if (current !== generation) return;
    $('accounts-password').value = ''; $('accounts-login').hidden = true; $('accounts-selection').hidden = false; $('accounts-logout').hidden = false;
    $('accounts-welcome').textContent = `Hola, ${profile.nombre}. Los permisos se comprueban en cada operación.`;
    $('accounts-institution').value = profile.institucionId ?? ''; $('accounts-institution').readOnly = profile.rol !== 'ADMIN';
    message.textContent = profile.institucionId ? 'Abre la gestión de tu institución.' : 'Selecciona la institución autorizada por su identificador.';
  } catch (error) { if (current === generation) { message.setAttribute('role', 'alert'); message.textContent = error.message; message.focus(); } }
  finally { $('accounts-password').value = ''; submit.disabled = false; }
};
$('accounts-institution-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget; if (!form.reportValidity()) return;
  if (panel.busy) { message.textContent = 'Espera a que termine la operación en curso.'; return; }
  if (panel.secretHost?.children.length && !globalThis.confirm('Cambiar de vista ocultará las claves entregadas. ¿Ya las conservaste de forma segura?')) return;
  const current = generation; const submit = form.querySelector('button'); submit.disabled = true; message.setAttribute('role', 'status'); message.textContent = 'Cargando permisos y cuentas…';
  try { await panel.open($('accounts-institution').value.trim()); if (current === generation) message.textContent = 'Gestiona únicamente las cuentas y grupos autorizados.'; }
  catch (error) { if (current === generation) { message.setAttribute('role', 'alert'); message.textContent = error.message; message.focus(); } }
  finally { submit.disabled = false; }
};
globalThis.addEventListener('pagehide', () => logout());
if (config.demo) { message.textContent = 'Esta utilidad requiere la API local real; no crea cuentas en modo demo.'; $('accounts-login-form').querySelector('button').disabled = true; }
