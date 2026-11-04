import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const require = createRequire(new URL('../package.json', import.meta.url));

export async function verifyManagedBrowser(db, { base, directory, admin, owner, password, institutionId, cwd }) {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  const { createAdminServer } = await import('../../admin/server.mjs');
  const server = createAdminServer({ apiBase: base });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  const errors = [];
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, userDataDir: join(directory, 'lic2-browser-profile'), args: ['--no-first-run', '--disable-background-networking', '--disable-sync'] });
    const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => dialog.accept());
    await page.setViewport({ width: 1280, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`${origin}/cuentas`, { waitUntil: 'networkidle0' });
    await page.type('#accounts-user', owner.correo); await page.type('#accounts-password', password);
    await page.click('#accounts-login-form button');
    await page.waitForFunction(() => !document.getElementById('accounts-selection').hidden);
    assert.equal(await page.$eval('#accounts-institution', el => el.value), institutionId);
    await page.click('#accounts-institution-form button');
    await page.waitForSelector('#managed-csv');
    await page.waitForFunction(() => [...document.querySelectorAll('#accounts-work button')].some(b => b.textContent.startsWith('Restablecer acceso de ')));
    assert.equal(await page.$$eval('#accounts-work button', buttons => buttons.some(b => b.textContent === 'Aprobar sufijo revisado')), false);
    assert.equal(await page.$eval('#accounts-session-message', el => getComputedStyle(el).color), 'rgb(89, 107, 116)');
    await mkdir(join(cwd, '.tmp'), { recursive: true });
    await page.screenshot({ path: join(cwd, '.tmp/lic2-cuentas-owner-desktop.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(cwd, '.tmp/lic2-cuentas-owner-mobile.png'), fullPage: true });
    const browserUser = `alumno${randomUUID().replaceAll('-', '')}`;
    const groupId = await page.$eval('#managed-group', el => el.options[1].value);
    await page.select('#managed-group', groupId);
    await page.$eval('#managed-csv', (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, `nombre,usuario\nAlumno navegador,${browserUser}`);
    await page.evaluate(() => [...document.querySelectorAll('#accounts-work button')].find(b => b.textContent === 'Previsualizar · no crea cuentas').click());
    await page.waitForFunction(() => [...document.querySelectorAll('#accounts-work button')].some(b => b.textContent === 'Confirmar creación de cuentas' && !b.disabled));
    await page.evaluate(() => [...document.querySelectorAll('#accounts-work button')].find(b => b.textContent === 'Confirmar creación de cuentas').click());
    await page.waitForSelector('.accounts-secret');
    await page.waitForFunction(() => document.getElementById('accounts-work').getAttribute('aria-busy') === 'false');
    const suffix = await db.sufijoInstitucional.findUniqueOrThrow({ where: { institucionId: institutionId } });
    const created = await db.usuario.findUniqueOrThrow({ where: { identificadorInstitucional: `${browserUser}@${suffix.aprobado}` } });
    assert.equal(created.correo, null); assert.equal(created.debeCambiarContrasena, true);
    await page.evaluate(() => [...document.querySelectorAll('#accounts-work button')].find(b => b.textContent === 'Ya entregué las claves · ocultar').click());
    assert.equal(await page.$('.accounts-secret'), null);
    // Existing managed student: reset must show exactly one secret, not persist it.
    const reset = await page.$('button');
    assert(reset);
    await page.evaluate(() => [...document.querySelectorAll('#accounts-work button')].find(b => b.textContent.startsWith('Restablecer acceso de ')).click());
    await page.waitForSelector('.accounts-secret');
    assert(await page.evaluate(() => document.querySelector('.accounts-secret').textContent.length > 20));
    assert(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0));
    await page.click('#accounts-logout');
    assert.equal(await page.$('.accounts-secret'), null);
    // A fresh page must not recover an earlier session or secret.
    await page.reload({ waitUntil: 'networkidle0' });
    assert(await page.$eval('#accounts-selection', el => el.hidden));
    await page.type('#accounts-user', admin.correo); await page.type('#accounts-password', password);
    await page.click('#accounts-login-form button');
    await page.waitForFunction(() => !document.getElementById('accounts-selection').hidden);
    const pending = await db.institucion.create({ data: { nombre: 'Browser suffix review synthetic', codigoUnico: `BR-${randomUUID()}`, estadoVerificacion: 'APROBADA' } });
    await db.controlLicenciaInstitucional.create({ data: { institucionId: pending.id } });
    await db.sufijoInstitucional.create({ data: { institucionId: pending.id, solicitado: `browser-${randomUUID()}.example`, solicitadoEn: new Date() } });
    await page.type('#accounts-institution', pending.id); await page.click('#accounts-institution-form button');
    await page.waitForFunction(() => [...document.querySelectorAll('#accounts-work button')].some(b => b.textContent === 'Aprobar sufijo revisado'));
    await page.evaluate(() => [...document.querySelectorAll('#accounts-work button')].find(b => b.textContent === 'Aprobar sufijo revisado').click());
    await page.waitForFunction(() => document.getElementById('accounts-work').textContent.includes('Sufijo aprobado.'));
    assert((await db.sufijoInstitucional.findUniqueOrThrow({ where: { institucionId: pending.id } })).aprobado);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ phase: 'lic2-browser-passed', realHttpAndPostgres: true, ownerNoApprovalButton: true, adminSuffixApproval: true, previewAndConfirmCreatesRealManagedAccount: true, resetSingleDelivery: true, logoutAndReloadClearSecrets: true, desktop1280: true, responsive390: true, noAndroidClaim: true }));
  } finally {
    await browser?.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
  }
}
