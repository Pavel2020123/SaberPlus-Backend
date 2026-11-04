import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

export async function verifyPrivacyBrowser(db, { cwd, directory, base, admin, owner, institutionId, password }) {
  const require = createRequire(join(cwd, 'package.json'));
  const original = await db.usuario.findUniqueOrThrow({ where: { id: owner.id }, select: { contrasenaHash: true } });
  const alias = `privacidad-${randomUUID()}@fixture.example`;
  const target = await db.usuario.create({ data: { nombre: 'Alumno de privacidad local', identificadorInstitucional: alias,
    correo: null, contrasenaHash: original.contrasenaHash, rol: 'ESTUDIANTE', institucionId: institutionId } });
  await db.origenGestionadoInstitucional.create({ data: { usuarioId: target.id, institucionId: institutionId } });
  await db.asignacionLicenciaInstitucional.create({ data: { id: randomUUID(), usuarioId: target.id, institucionId: institutionId,
    tipo: 'ESTUDIANTE', estado: 'RETIRADA', aceptadaEn: new Date(), retiradaEn: new Date() } });
  await db.diagnosticoInicial.create({ data: { usuarioId: target.id, preguntaIds: [] } });
  const login = async identifier => {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: identifier, contrasena: password }), signal: AbortSignal.timeout(15000) });
    assert.equal(r.status, 201); return (await r.json()).accessToken;
  };
  const targetToken = await login(alias), ownerToken = await login(owner.correo);
  const { createAdminServer } = await import('../../admin/server.mjs');
  const server = createAdminServer({ apiBase: base });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await require('puppeteer').launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true,
      protocolTimeout: 30000, userDataDir: join(directory, 'lic4-privacy-browser-profile'), args: ['--no-first-run', '--disable-background-networking', '--disable-sync'] });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept());
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    const web = `http://127.0.0.1:${server.address().port}`;
    await page.goto(`${web}/institucion`, { waitUntil: 'networkidle0' });
    await page.type('#portal-user', owner.correo); await page.type('#portal-password', password); await page.click('#portal-login [type=submit]');
    await page.waitForFunction(() => !document.getElementById('portal-view').hidden);
    await page.click('[data-view=bajas]');
    await page.waitForFunction(name => [...document.querySelectorAll('#portal-content article h3')].some(el => el.textContent === name), {}, target.nombre);
    await page.evaluate(name => {
      const card = [...document.querySelectorAll('#portal-content article')].find(el => el.querySelector('h3')?.textContent === name);
      [...card.querySelectorAll('button')].find(el => el.textContent === 'Solicitar supresión a SaberPlus').click();
    }, target.nombre);
    await page.waitForSelector('#privacy-reason'); await page.type('#privacy-reason', 'Solicitud sintética de cuenta gestionada para QA local');
    await page.$eval('#privacy-reason', el => el.closest('form').querySelector('[type=submit]').click());
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(el => el.textContent.includes('Solicitud enviada.')));
    const request = await db.solicitudSupresionCuenta.findFirstOrThrow({ where: { usuarioId: target.id } });
    assert.equal(request.estado, 'PENDIENTE'); assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: target.id } })).suprimidaEn, null);
    assert.equal((await fetch(`${base}/cuentas/supresion/${request.id}/revision`, { headers: { Authorization: `Bearer ${ownerToken}` } })).status, 403);
    await page.goto(`${web}/privacidad`, { waitUntil: 'networkidle0' });
    await page.type('#privacy-user', admin.correo); await page.type('#privacy-password', password); await page.click('#privacy-login-form [type=submit]');
    await page.waitForFunction(id => [...document.querySelectorAll('#privacy-work article')].some(el => el.textContent.includes(id)), {}, request.id);
    await page.evaluate(id => {
      const card = [...document.querySelectorAll('#privacy-work article')].find(el => el.textContent.includes(id));
      [...card.querySelectorAll('button')].find(el => el.textContent === 'Revisar impacto').click();
    }, request.id);
    await page.waitForSelector('#privacy-confirm'); await page.setViewport({ width: 375, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(cwd, '.tmp/lic4-privacy-review-mobile.png'), fullPage: true });
    await page.type('#privacy-confirm', 'NO'); await page.$eval('#privacy-confirm', el => el.closest('form').querySelector('[type=submit]').click());
    assert.equal((await db.solicitudSupresionCuenta.findUniqueOrThrow({ where: { id: request.id } })).estado, 'PENDIENTE');
    await page.$eval('#privacy-confirm', el => { el.value = 'SUPRIMIR CUENTA'; el.dispatchEvent(new Event('input', { bubbles: true })); el.closest('form').querySelector('[type=submit]').click(); });
    await page.waitForFunction(() => [...document.querySelectorAll('#privacy-work [role=status]')].some(el => el.textContent.includes('Supresión confirmada.')));
    assert.equal((await db.solicitudSupresionCuenta.findUniqueOrThrow({ where: { id: request.id } })).estado, 'EJECUTADA');
    assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: target.id } }), 0);
    assert.equal((await fetch(`${base}/auth/perfil`, { headers: { Authorization: `Bearer ${targetToken}` } })).status, 401);
    const relogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: alias, contrasena: password }) });
    assert.equal(relogin.status, 401);
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.focus('#privacy-logout'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.getElementById('privacy-work').children.length === 0 && !document.getElementById('privacy-login').hidden);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ phase: 'lic4-privacy-browser-passed', ownDisposableOnly: true, ownerRequestsWithoutDeleting: true,
      adminReviewAndTypedExecution: true, invalidConfirmationDoesNotExecute: true, oldSessionAndLoginDenied: true, storageEmpty: true, logoutClearsData: true, responsive375and390: true }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
