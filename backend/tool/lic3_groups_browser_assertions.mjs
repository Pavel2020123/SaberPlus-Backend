import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function verifyPortalGroups(db, { page, base, owner, password, institutionId }) {
  const originalOwner = await db.usuario.findUniqueOrThrow({ where: { id: owner.id }, select: { contrasenaHash: true } });
  const teacher = await db.usuario.create({ data: { nombre: 'Docente de prueba LIC3', correo: `${randomUUID()}@example.invalid`, contrasenaHash: originalOwner.contrasenaHash, rol: 'PROFESOR', institucionId: institutionId, correoVerificado: true } });
  const member = await db.miembroInstitucion.create({ data: { usuarioId: teacher.id, institucionId: institutionId, rol: 'PROFESOR' } });
  const login = async user => {
    const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: user.correo, contrasena: password }), signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 201); return (await response.json()).accessToken;
  };
  const ownerToken = await login(owner), teacherToken = await login(teacher);
  const request = async (token, path, expected, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, expected, `LIC3 group probe ${path}: expected ${expected}, received ${response.status}`); return response.json();
  };
  const license = `/instituciones/${institutionId}/licencia`;
  await request(ownerToken, `${license}/asignaciones`, 201, { operacionId: randomUUID(), usuarioId: teacher.id, tipo: 'DOCENTE' });
  await request(teacherToken, `${license}/aceptar`, 201, { operacionId: randomUUID() });
  const uniqueName = `Once QA ${randomUUID().slice(0, 8)}`;
  await page.click('[data-view=grupos]'); await page.waitForSelector('#new-group-name');
  await page.evaluate(() => document.getElementById('new-group-name').closest('details').querySelector('summary').click());
  await page.type('#new-group-name', uniqueName); await page.select('#new-group-grade', 'ONCE');
  await page.$eval('#new-group-name', el => el.closest('form').querySelector('[type=submit]').click());
  await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(el => el.textContent.startsWith('Cambio guardado.')));
  const group = await db.clase.findFirstOrThrow({ where: { institucionId: institutionId, nombre: uniqueName } });
  assert.equal(await db.clase.count({ where: { institucionId: institutionId, nombre: uniqueName } }), 1);
  await page.evaluate(() => [...document.querySelectorAll('#portal-content button')].find(el => el.textContent === 'Actualizar lista').click());
  const renameId = `group-name-${group.id}`, memberId = `group-teacher-${group.id}`;
  await page.waitForSelector(`#${renameId}`);
  await page.$eval(`#${renameId}`, el => el.closest('details').querySelector('summary').click());
  await page.$eval(`#${renameId}`, el => { el.value += ' B'; el.dispatchEvent(new Event('input', { bubbles: true })); el.closest('form').querySelector('[type=submit]').click(); });
  await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(el => el.textContent.startsWith('Cambio guardado.')));
  assert.equal((await db.clase.findUniqueOrThrow({ where: { id: group.id } })).nombre, `${uniqueName} B`);
  await page.select(`#${memberId}`, member.id);
  await page.$eval(`#${memberId}`, el => el.closest('form').querySelector('[type=submit]').click());
  await page.waitForFunction(id => document.getElementById(id).closest('form').querySelector('[role=status]').textContent.startsWith('Cambio guardado.'), {}, memberId);
  assert.equal(await db.claseProfesor.count({ where: { claseId: group.id, miembroId: member.id } }), 1);
  await page.click('[data-view=docentes]'); await page.waitForSelector('#invite-teacher-email');
  const invited = `${randomUUID()}@example.invalid`;
  await page.type('#invite-teacher-email', invited);
  await page.$eval('#invite-teacher-email', el => el.closest('form').querySelector('[type=submit]').click());
  await page.waitForFunction(() => [...document.querySelectorAll('#portal-content [role=status]')].some(el => el.textContent.startsWith('Cambio guardado.')));
  assert.equal(await db.invitacionInstitucion.count({ where: { institucionId: institutionId, correo: invited, rol: 'PROFESOR' } }), 1);
  const students = await db.usuario.findMany({ where: { institucionId: institutionId, rol: 'ESTUDIANTE', origenGestionadoLicencia: { institucionId: institutionId } }, select: { id: true } });
  assert(students.length >= 2);
  await db.claseEstudiante.create({ data: { claseId: group.id, usuarioId: students[0].id } });
  const allGroups = await request(teacherToken, '/instituciones/me/grupos', 200);
  assert.deepEqual(allGroups.map(row => row.id), [group.id]);
  await request(teacherToken, '/instituciones/me/administracion', 403);
  await request(teacherToken, '/instituciones/me/grupos', 403, { nombre: 'Forbidden create', grado: 'ONCE' });
  await request(teacherToken, `/instituciones/me/grupos/${group.id}`, 403, { nombre: 'Forbidden rename' }, 'PATCH');
  await request(teacherToken, `/instituciones/me/grupos/${group.id}/profesores`, 403, { miembroId: member.id });
  await request(teacherToken, `/instituciones/me/estudiantes/${students[1].id}/evidencia`, 404);
  const tracking = await request(teacherToken, '/instituciones/me/analiticas', 200);
  assert.deepEqual(tracking.estudiantes.map(row => row.id), [students[0].id]);
  const teacherPage = await page.browser().newPage();
  teacherPage.on('dialog', dialog => dialog.accept());
  try {
    await teacherPage.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await teacherPage.goto(page.url().split('#')[0], { waitUntil: 'networkidle0' });
    await teacherPage.type('#portal-user', teacher.correo); await teacherPage.type('#portal-password', password);
    await teacherPage.click('#portal-login [type=submit]');
    await teacherPage.waitForFunction(() => !document.getElementById('portal-view').hidden && document.querySelector('.group-card'));
    assert.equal(await teacherPage.$eval('#portal-teachers-nav', el => el.hidden), true);
    await teacherPage.click('[data-view=grupos]');
    await teacherPage.waitForFunction(() => location.hash === '#grupos' && document.querySelector('.group-card'));
    assert.equal(await teacherPage.$$('#portal-content form').then(rows => rows.length), 0);
    assert(await teacherPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const period = await db.periodoContratoInstitucional.findFirstOrThrow({ where: { institucionId: institutionId } });
    console.log(JSON.stringify({ phase: 'lic3-state-qa-expiring-owned-period' }));
    await db.periodoContratoInstitucional.update({ where: { id: period.id }, data: { inicio: new Date(Date.now() - 2 * 86400000), fin: new Date(Date.now() - 86400000) } });
    await request(teacherToken, '/instituciones/me/grupos', 200);
    await request(ownerToken, '/instituciones/me/grupos', 403, { nombre: 'Forbidden expired group', grado: 'ONCE' });
    console.log(JSON.stringify({ phase: 'lic3-state-qa-api-history-preserved' }));
    await page.bringToFront();
    await page.focus('#portal-refresh'); await page.keyboard.press('Enter');
    console.log(JSON.stringify({ phase: 'lic3-state-qa-refresh-requested' }));
    try {
      await page.waitForFunction(() => document.getElementById('portal-content').textContent.includes('La licencia no habilita nuevas gestiones.'));
    } catch (error) {
      console.log(JSON.stringify({ phase: 'lic3-state-qa-view-diagnostic', ...(await page.evaluate(() => ({ location: location.hash, refreshDisabled: document.getElementById('portal-refresh').disabled, status: document.getElementById('portal-status').textContent, loginHidden: document.getElementById('login-view').hidden }))) }));
      throw error;
    }
    await page.waitForFunction(() => !document.getElementById('portal-refresh').disabled && document.getElementById('portal-content').getAttribute('aria-busy') === 'false');
    console.log(JSON.stringify({ phase: 'lic3-state-qa-readonly-rendered' }));
    assert.equal(await page.$('#invite-teacher-email'), null);
    assert.equal(await page.$eval('#login-view', el => el.hidden), true);
    await page.click('[data-view=prioridades]');
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content button')].some(button => button.textContent === 'Asignar una prioridad' && button.disabled));
    await page.waitForFunction(() => !document.getElementById('portal-refresh').disabled && document.getElementById('portal-content').getAttribute('aria-busy') === 'false');
    await db.periodoContratoInstitucional.update({ where: { id: period.id }, data: { inicio: period.inicio, fin: period.fin } });
    await page.focus('#portal-refresh'); await page.keyboard.press('Enter');
    await page.waitForFunction(() => [...document.querySelectorAll('#portal-content button')].some(button => button.textContent === 'Asignar una prioridad' && !button.disabled));
    await teacherPage.bringToFront();
    await request(ownerToken, `${license}/retirar`, 201, { operacionId: randomUUID(), usuarioId: teacher.id });
    await request(teacherToken, '/instituciones/me/grupos', 403);
    await request(teacherToken, '/instituciones/me/analiticas', 403);
    await request(teacherToken, `/instituciones/me/estudiantes/${students[0].id}/evidencia`, 403);
    const profile = await request(teacherToken, '/auth/perfil', 200); assert.equal(profile.accesoInstitucional.asignacionActiva, false);
    await teacherPage.click('[data-view=grupos]');
    await teacherPage.waitForFunction(() => document.querySelector('#portal-content [role=alert]'));
    assert.equal(await teacherPage.$$('.group-card').then(rows => rows.length), 0);
  } finally { await teacherPage.close(); }
  await page.bringToFront();
  // Changing group responsibility never deletes accounts, answers or institutional seats.
  assert.equal(await db.usuario.count({ where: { id: teacher.id } }), 1);
  console.log(JSON.stringify({ phase: 'lic3-group-browser-passed', ownerCreateRenameAssignAndInvite: true, teacherOwnGroupsOnly: true, teacherCannotManage: true, privateStudentScope: true, expiredLicenseHistoricalReadOnly: true, refreshedRenewalReenablesForms: true, retiredTeacherDeniedDespiteResidualRows: true, mobile390: true, noAccountsDeleted: true }));
}
