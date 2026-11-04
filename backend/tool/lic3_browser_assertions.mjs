import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { verifyPortalGroups } from './lic3_groups_browser_assertions.mjs';
const require = createRequire(new URL('../package.json', import.meta.url));
const luminance = value => {
  const rgb = value.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
};
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);

// Called only by the owned PostgreSQL/HTTP runner; never accepts external login data.
export async function verifyInstitutionBrowser(db, { base, directory, owner, password, institutionId, cwd }) {
  assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.equal((await db.miembroInstitucion.findUniqueOrThrow({ where: { usuarioId: owner.id } })).institucionId, institutionId);
  const topic = await db.tema.create({ data: { nombre: 'Tema propio navegador LIC3', area: 'MATEMATICAS', estadoContenido: 'PUBLICADO' } });
  const subtopic = await db.subtema.create({ data: { nombre: 'Subtema propio navegador LIC3', temaId: topic.id, estadoContenido: 'PUBLICADO' } });
  for (let i = 0; i < 5; i++) await db.pregunta.create({ data: { subtemaId: subtopic.id, enunciado: `Pregunta propia de navegador LIC3 ${i}`, estadoContenido: 'PUBLICADO', respuestas: { create: [{ texto: 'Correcta', esCorrecta: true }, { texto: 'Otra', esCorrecta: false }] } } });
  const { createAdminServer } = await import('../../admin/server.mjs');
  const server = createAdminServer({ apiBase: base });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    const puppeteer = require('puppeteer');
    browser = await puppeteer.launch({ executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', headless: true, protocolTimeout: 30000, userDataDir: join(directory, 'lic3-browser-profile'), args: ['--no-first-run', '--disable-background-networking', '--disable-sync'] });
    const page = await browser.newPage(); const errors = [];
    page.on('dialog', dialog => dialog.accept());
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:${server.address().port}/institucion`, { waitUntil: 'networkidle0' });
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Ir al contenido');
    const palette = await page.evaluate(() => {
      const primary = getComputedStyle(document.querySelector('#portal-login .primary'));
      return { text: getComputedStyle(document.body).color, canvas: getComputedStyle(document.documentElement).backgroundColor,
        primaryText: primary.color, primaryBackground: primary.backgroundColor,
        inputBorder: getComputedStyle(document.getElementById('portal-user')).borderTopColor,
        inputBackground: getComputedStyle(document.getElementById('portal-user')).backgroundColor,
        focusWidth: parseFloat(getComputedStyle(document.activeElement).outlineWidth) };
    });
    assert(contrast(palette.text, palette.canvas) >= 4.5);
    assert(contrast(palette.primaryText, palette.primaryBackground) >= 4.5);
    assert(contrast(palette.inputBorder, palette.inputBackground) >= 3);
    assert(palette.focusWidth >= 2);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
    await mkdir(join(cwd, '.tmp'), { recursive: true });
    await page.screenshot({ path: join(cwd, '.tmp/lic3-login-desktop.png'), fullPage: true });
    await page.type('#portal-user', owner.correo); await page.type('#portal-password', password);
    await page.click('#portal-login [type=submit]');
    await page.waitForFunction(() => !document.getElementById('portal-view').hidden && document.querySelector('.group-card'));
    assert.equal(await page.$eval('#member-role', el => el.textContent), 'Propietario · Vista institucional');
    assert.equal(await page.$eval('#portal-password', el => el.value), '');
    await page.screenshot({ path: join(cwd, '.tmp/lic3-overview-desktop.png'), fullPage: true });
    for (const width of [390, 375]) {
      await page.setViewport({ width, height: 844, deviceScaleFactor: 1 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.screenshot({ path: join(cwd, '.tmp/lic3-overview-mobile.png'), fullPage: true });
    await page.click('[data-view=grupos]');
    await page.waitForFunction(() => location.hash === '#grupos' && document.querySelector('.group-card') && document.getElementById('portal-content').getAttribute('aria-busy') === 'false');
    await page.click('[data-view=seguimiento]');
    await page.waitForSelector('#tracking-search');
    assert(await page.$$eval('.group-card p', nodes => nodes.some(node => node.textContent === 'Aún no hay un promedio de simulacros.')));
    await page.screenshot({ path: join(cwd, '.tmp/lic3-tracking-mobile.png'), fullPage: true });
    await page.click('[data-view=prioridades]');
    await page.waitForSelector('#priority-group');
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content button')].some(button => button.textContent === 'Asignar una prioridad'));
    await page.evaluate(() => [...document.querySelectorAll('#portal-content button')].find(button => button.textContent === 'Asignar una prioridad').click());
    await page.waitForSelector('#priority-topic');
    await page.select('#priority-topic', subtopic.id);
    const deadline = new Date(Date.now() + 2 * 86400000 - 5 * 3600000).toISOString().slice(0, 16);
    await page.$eval('#priority-deadline', (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, deadline);
    await page.evaluate(() => [...document.querySelectorAll('#portal-content button')].find(button => button.textContent === 'Confirmar prioridad').click());
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(node => node.textContent.includes('Prioridad guardada.')));
    assert.equal(await db.prioridadDocente.count({ where: { temaId: topic.id, creadoPorId: owner.id } }), 1);
    await page.evaluate(() => [...document.querySelectorAll('#portal-content button')].find(button => button.textContent === 'Volver a la lista de prioridades').click());
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content button')].some(button => button.textContent === 'Ver cumplimiento'));
    await page.evaluate(() => [...document.querySelectorAll('#portal-content button')].find(button => button.textContent === 'Ver cumplimiento').click());
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content h3')].some(node => node.textContent === 'Cumplimiento del grupo'));
    assert(await page.$$eval('#portal-content p', nodes => nodes.some(node => node.textContent.includes('0/5'))));
    await page.screenshot({ path: join(cwd, '.tmp/lic3-priority-mobile.png'), fullPage: true });
    await verifyPortalGroups(db, { page, base, owner, password, institutionId });
    await page.click('[data-view=bajas]');
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content h2')].some(el => el.textContent === 'Bajas y continuidad'));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: join(cwd, '.tmp/lic4-bajas-mobile.png'), fullPage: true });
    const managedSeat = await db.asignacionLicenciaInstitucional.findFirstOrThrow({ where: { institucionId: institutionId, tipo: 'ESTUDIANTE', estado: 'ACTIVA' }, include: { usuario: true } });
    await page.evaluate(name => {
      const card = [...document.querySelectorAll('#portal-content article')].find(el => el.querySelector('h3')?.textContent === name);
      [...card.querySelectorAll('button')].find(el => el.textContent.startsWith('Retirar cupo')).click();
    }, managedSeat.usuario.nombre);
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(el => el.textContent.includes('Cambio confirmado.')));
    assert.equal((await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { id: managedSeat.id } })).estado, 'RETIRADA');
    assert.equal(await db.usuario.count({ where: { id: managedSeat.usuarioId } }), 1);
    console.log(JSON.stringify({ phase: 'lic4-bajas-browser-passed', managedSeatRetiredWithoutDeletingAccount: true, responsive375: true }));
    await page.click('[data-view=cuentas]'); await page.waitForSelector('#managed-csv');
    assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
    await page.waitForSelector('#portal-logout', { visible: true });
    await page.focus('#portal-logout'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => !document.getElementById('login-view').hidden && document.getElementById('portal-content').children.length === 0);
    assert.equal(await page.$eval('#portal-content', el => el.children.length), 0);
    assert.equal(await page.$eval('#login-view', el => el.hidden), false);
    await page.reload({ waitUntil: 'networkidle0' });
    assert.equal(await page.$eval('#portal-view', el => el.hidden), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ phase: 'lic3-shell-browser-passed', realHttpAndPostgres: true, ownerOverviewAndGroups: true, realTrackingNoFakeAverage: true, priorityCreatedAndReported: true, reusedManagedAccounts: true, logoutClearsData: true, desktop1440: true, responsive375and390: true, reducedMotion: true, android: false, fullLic3Complete: false }));
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
}
