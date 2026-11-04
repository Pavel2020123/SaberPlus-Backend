import assert from 'node:assert/strict';
import { fork, execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { verifyManagedBrowser } from './lic2_browser_assertions.mjs';
import { verifyInstitutionBrowser } from './lic3_browser_assertions.mjs';
import { verifyPrivacyBrowser } from './lic4_privacy_browser_assertions.mjs';

export async function verifyLicenseHttp(db, fixture) {
  const root = await realpath(tmpdir());
  const directory = await realpath(await mkdtemp(join(root, 'saberplus-lic1-http-')));
  const ownerPath = join(directory, 'owner.json');
  let child;
  let socket;
  const require = createRequire(join(fixture.cwd, 'package.json'));
  const secret = randomBytes(32).toString('hex');
  const password = randomBytes(24).toString('hex');
  try {
    await writeFile(ownerPath, JSON.stringify({ purpose: 'saberplus-competitive-disposable-v1', nonce: fixture.nonce, url: fixture.url }), { mode: 0o600 });
    const hash = await require('bcrypt').hash(password, 10);
    const institution = await db.institucion.create({ data: { nombre: 'HTTP license fixture', codigoUnico: `HTTP-${randomUUID()}`, estadoVerificacion: 'APROBADA' } });
    const account = (rol, institucionId) => db.usuario.create({ data: { nombre: 'Synthetic HTTP', correo: `${randomUUID()}@example.invalid`, contrasenaHash: hash, rol, correoVerificado: true, institucionId } });
    const [admin, owner, student, outsider] = await Promise.all([account('ADMIN'), account('PROFESOR', institution.id), account('ESTUDIANTE', institution.id), account('ESTUDIANTE')]);
    await db.miembroInstitucion.create({ data: { institucionId: institution.id, usuarioId: owner.id, rol: 'PROPIETARIO' } });
    const env = { ...fixture.env, NODE_ENV: 'test', DATABASE_URL: fixture.url, DIRECT_URL: fixture.url,
      COMPETITIVE_TEST_OWNER: ownerPath, JWT_SECRET: secret, RANKING_ALIAS_SECRET: randomBytes(32).toString('hex'),
      LIC2_PANEL_BROWSER_LOCAL: 'true', ACCOUNT_SUPPRESSION_ENABLED: 'true', SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', EDITORIAL_FILES_LOCAL_ENABLED: 'true', EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED: 'true',
      EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED: 'true', EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED: 'true' };
    // Store all uploaded bytes under this invocation's owned temp directory.
    child = fork(join(fixture.cwd, 'tool/pilot_capacity_worker.cjs'), [], { cwd: directory, env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    const base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Owned HTTP worker startup timed out')), 45000);
      child.on('message', m => {
        if (m.type === 'ready') { clearTimeout(timer); resolve(m.base); }
        if (m.type === 'failed') { clearTimeout(timer); reject(new Error('Owned HTTP worker failed')); }
      });
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Owned HTTP worker exited before readiness')); });
    });
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
    const inventory = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Runtime controller inventory timed out')), 10000);
      const receive = m => { if (m.type === 'lic1-routes') { clearTimeout(timer); child.off('message', receive); resolve(m.inventory); } };
      child.on('message', receive);
      child.send('lic1-route-inventory');
    });
    await writeFile(join(fixture.cwd, '.tmp/lic1-runtime-routes.json'), JSON.stringify(inventory, null, 2));
    const declared = JSON.parse(execFileSync(process.execPath, [join(fixture.cwd, 'tool/lic1_route_inventory.mjs')], {
      cwd: fixture.cwd, env: fixture.env, encoding: 'utf8', windowsHide: true,
    }));
    const contract = row => JSON.stringify({ controller: row.controller, method: row.method,
      auth: row.auth === 'REVIEW_PUBLIC' ? 'PUBLIC' : row.auth, license: row.license, guards: [...row.guards].sort() });
    assert.deepEqual(inventory.rows.map(contract).sort(), declared.rows.map(contract).sort(), 'Source/runtime handler and guard inventories must match');
    const allowedPublic = ['AppController.obtenerEstado', 'HealthController.live', 'HealthController.ready',
      'RetiredGamesController.retired', 'AuthController.registrar', 'AuthController.login', 'AuthController.verificarCorreo',
      'AuthController.reenviarVerificacion', 'AuthController.solicitarRecuperacion', 'AuthController.restablecerContrasena',
      'ReferidosController.validar', 'CalendarioIcfesController.activo', 'PagosController.crearOrden', 'PagosController.confirmacion',
      'PagosController.estado', 'VentasController.crearLead', 'CuponesController.promocionActiva', 'SoporteController.obtenerPublica'];
    assert.deepEqual(inventory.rows.filter(r => r.auth === 'PUBLIC').map(r => `${r.controller}.${r.method}`).sort(), allowedPublic.sort());
    console.log(JSON.stringify({ phase: 'lic1-registered-routes', total: inventory.total,
      public: inventory.rows.filter(r => r.auth === 'PUBLIC').map(r => `${r.controller}.${r.method}`) }));
    const jwt = new (require('@nestjs/jwt').JwtService)({ secret, signOptions: { algorithm: 'HS256' } });
    const token = u => jwt.sign({ sub: u.id });
    async function request(user, path, expected, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(`${base}${path}`, { method,
        headers: { Authorization: `Bearer ${token(user)}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, expected, `${path} expected ${expected}; received ${response.status}`);
      return response.json();
    }
    async function uploadPicture(color) {
      const bytes = await require('sharp')({ create: { width: 24, height: 16, channels: 3, background: color } }).png().toBuffer();
      const form = new FormData();
      for (const [key, value] of Object.entries({ operacionId: randomUUID(), titulo: 'Synthetic LIC1 image', textoAlternativo: 'Synthetic rectangle', fuente: 'Own test fixture', titular: 'Synthetic test', autorizacion: 'ORIGINAL' })) form.set(key, value);
      form.set('archivo', new Blob([bytes], { type: 'image/png' }), 'fixture.png');
      const response = await fetch(`${base}/admin/archivos`, { method: 'POST', headers: { Authorization: `Bearer ${token(admin)}` }, body: form, signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, 201);
      const picture = await response.json();
      return db.archivoEditorial.findUniqueOrThrow({ where: { id: picture.id } });
    }
    async function readPicture(user, picture, expected) {
      const response = await fetch(`${base}/recursos/editoriales/${picture.id}`, { headers: { Authorization: `Bearer ${token(user)}` }, signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, expected, `Image read expected ${expected}; received ${response.status}`);
      if (expected === 200) {
        assert.match(response.headers.get('content-type'), /^image\/webp/);
        assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'), picture.sha256);
      }
    }
    const route = `/instituciones/${institution.id}/licencia`;
    const command = { operacionId: randomUUID(), meses: 6, cuposEstudiantes: 1, cuposDocentes: 1, referenciaAcuerdo: 'HTTP synthetic no payment' };
    await request(owner, `${route}/activar`, 403, command);
    const active = await request(admin, `${route}/activar`, 201, command);
    assert.deepEqual(await request(admin, `${route}/activar`, 201, command), active);
    await request(outsider, route, 403);
    await db.origenGestionadoInstitucional.create({ data: { institucionId: institution.id, usuarioId: student.id } });
    await request(student, '/simulacros/generar?area=MATEMATICAS', 403);
    await request(student, '/simulacros/temas?area=MATEMATICAS', 403);
    await request(owner, `${route}/asignaciones`, 201, { operacionId: randomUUID(), usuarioId: student.id, tipo: 'ESTUDIANTE' });
    await request(student, '/auth/perfil', 200);
    const teacherContext = await request(owner, '/instituciones/profesor/contexto', 200);
    assert.equal(teacherContext.institucion.origenPlan, 'LICENCIA');
    assert.equal(teacherContext.institucion.estadoLicencia, 'ACTIVA');
    assert.equal(teacherContext.institucion.limiteEstudiantes, 1);
    assert.equal(teacherContext.institucion.limiteGrupos, null);
    for (const area of ['MATEMATICAS', 'LECTURA_CRITICA', 'CIENCIAS_NATURALES', 'SOCIALES_CIUDADANAS', 'INGLES']) {
      await db.tema.create({ data: { nombre: `HTTP fixture ${area}`, area, estadoContenido: 'PUBLICADO',
        subtemas: { create: { nombre: 'Synthetic lesson', contenido: 'Synthetic licensed lesson', estadoContenido: 'PUBLICADO',
          preguntas: { create: Array.from({ length: 3 }, (_, i) => ({ enunciado: `Synthetic ${area} ${i}`, estadoContenido: 'PUBLICADO',
            respuestas: { create: [{ texto: 'Correct synthetic option', esCorrecta: true }, { texto: 'Wrong synthetic option', esCorrecta: false }] } })) } } } } });
    }
    const lesson = await db.subtema.findFirstOrThrow({ where: { tema: { area: 'MATEMATICAS' } } });
    const shortenedEnd = new Date(Date.now() + 1800000);
    await db.periodoContratoInstitucional.updateMany({ where: { institucionId: institution.id }, data: { fin: shortenedEnd } });
    const offline = await request(student, `/recursos/editoriales/lecciones/${lesson.id}/offline`, 201, { requestNonce: 'a'.repeat(64) });
    assert.equal(offline.expiresAt, shortenedEnd.toISOString());
    assert.ok(Date.parse(offline.expiresAt) - Date.parse(offline.validatedAt) <= 72 * 3600000);
    const [gracePicture, historyPicture, unrelatedPicture] = await Promise.all(['blue', 'green', 'red'].map(uploadPicture));
    const mathQuestions = await db.pregunta.findMany({ where: { subtemaId: lesson.id }, orderBy: { id: 'asc' } });
    await db.pregunta.update({ where: { id: mathQuestions[0].id }, data: { imagenUrl: `/recursos/editoriales/${gracePicture.id}`, archivoImagenId: gracePicture.id } });
    const correctOption = await db.respuesta.findFirstOrThrow({ where: { preguntaId: mathQuestions[1].id, esCorrecta: true } });
    await db.respuesta.update({ where: { id: correctOption.id }, data: { imagenUrl: `/recursos/editoriales/${historyPicture.id}`, archivoImagenId: historyPicture.id } });
    await db.subtema.update({ where: { id: lesson.id }, data: { imagenUrl: `/recursos/editoriales/${unrelatedPicture.id}`, archivoImagenId: unrelatedPicture.id } });
    for (const picture of [gracePicture, historyPicture, unrelatedPicture]) await readPicture(student, picture, 200);
    const diagnostic = await request(student, '/diagnostico-inicial/iniciar', 201, {});
    const mock = await request(student, '/simulacros/generar?area=MATEMATICAS', 200);
    const answers = async questions => {
      const correct = await db.respuesta.findMany({ where: { preguntaId: { in: questions.map(q => q.id) }, esCorrecta: true } });
      return correct.map(r => ({ preguntaId: r.preguntaId, respuestaId: r.id }));
    };
    const io = require('socket.io-client').io;
    socket = io(`${base}/tira-afloja`, { transports: ['websocket'], auth: { token: token(student) }, forceNew: true, reconnection: false });
    const event = name => new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Socket event timeout: ${name}`)), 10000);
      socket.once(name, value => { clearTimeout(timer); resolve(value); });
    });
    await event('tira:conectado');
    // No bank is needed to prove the expired gate: history stays available.
    await db.periodoContratoInstitucional.updateMany({ where: { institucionId: institution.id }, data: {
      inicio: new Date(Date.now() - 86400000), fin: new Date(Date.now() - 3600000),
    } });
    // Synthetic persisted state represents attempts begun before that expiration.
    await db.asignacionLicenciaInstitucional.updateMany({ where: { usuarioId: student.id }, data: { aceptadaEn: new Date(Date.now() - 86400000) } });
    await db.diagnosticoInicial.update({ where: { usuarioId: student.id }, data: { iniciadoEn: new Date(Date.now() - 7200000) } });
    await db.intentoSimulacro.update({ where: { id: mock.intentoId }, data: { fechaCreacion: new Date(Date.now() - 7200000), expira: new Date(Date.now() + 3600000) } });
    const deniedEvent = event('tira:error');
    socket.emit('tira:emparejar', { area: 'MATEMATICAS' });
    assert.equal((await deniedEvent).codigo, 'HTTP_403');
    assert.equal(await db.partidaTiraAfloja.count({ where: { jugadorAId: student.id } }), 0);
    await readPicture(student, gracePicture, 200);
    await readPicture(student, unrelatedPicture, 404);
    await request(admin, `${route}/suspension`, 201, { operacionId: randomUUID(), suspendida: true });
    await readPicture(student, gracePicture, 404);
    await request(student, '/diagnostico-inicial/finalizar', 403, { respuestas: await answers(diagnostic.preguntas) });
    await request(admin, `${route}/suspension`, 201, { operacionId: randomUUID(), suspendida: false });
    await request(student, '/auth/perfil', 200);
    await request(student, '/simulacros/historial', 200);
    await request(owner, '/instituciones/me/analiticas', 200);
    const expiredContext = await request(owner, '/instituciones/profesor/contexto', 200);
    assert.equal(expiredContext.institucion.origenPlan, 'LICENCIA');
    assert.equal(expiredContext.institucion.estadoLicencia, 'VENCIDA');
    assert.equal(expiredContext.institucion.nivelAnalitica, 'DETALLADA');
    await request(student, `/recursos/editoriales/lecciones/${lesson.id}/offline`, 403, { requestNonce: 'b'.repeat(64) });
    await request(student, '/simulacros/temas?area=MATEMATICAS', 403);
    await request(student, '/simulacros/generar?area=MATEMATICAS', 403);
    await request(student, '/diagnostico-inicial/iniciar', 403, {});
    await request(student, '/diagnostico-inicial', 200);
    await request(student, '/diagnostico-inicial/finalizar', 201, { respuestas: await answers(diagnostic.preguntas) });
    await request(student, '/simulacros/calificar', 201, { intentoId: mock.intentoId, area: 'MATEMATICAS', respuestas: await answers(mock.preguntas) });
    assert.equal(await db.historialRespuesta.count({ where: { usuarioId: student.id } }), 18);
    await db.pregunta.update({ where: { id: mathQuestions[1].id }, data: { estadoContenido: 'ARCHIVADO' } });
    assert.ok(await db.imagenHistorialRespuesta.count({ where: { usuarioId: student.id, archivoId: historyPicture.id, sha256: historyPicture.sha256 } }));
    await readPicture(student, historyPicture, 200);
    await readPicture(outsider, historyPicture, 404);
    await request(student, '/diagnostico-inicial', 200);
    await request(owner, route, 200);
    await request(owner, `${route}/suspension`, 403, { operacionId: randomUUID(), suspendida: true });
    await request(admin, `${route}/suspension`, 201, { operacionId: randomUUID(), suspendida: true });
    await readPicture(student, historyPicture, 200);
    await readPicture(student, unrelatedPicture, 404);
    await request(admin, `/admin/archivos/${historyPicture.id}/revocaciones`, 201, { operacionId: randomUUID(), motivo: 'DERECHOS', detalle: 'Synthetic license HTTP revocation fixture' });
    await readPicture(student, historyPicture, 404);
    // Real login remains available even while institutional entitlement is suspended.
    await request(student, '/auth/login', 201, { correo: student.correo, contrasena: password });
    const management = await db.institucion.create({ data: { nombre: 'HTTP management synthetic', codigoUnico: `MG-${randomUUID()}`.toUpperCase(), estadoVerificacion: 'APROBADA' } });
    const priorOwner = await account('PROFESOR', management.id);
    const nextOwner = await account('PROFESOR', management.id);
    const priorMember = await db.miembroInstitucion.create({ data: { usuarioId: priorOwner.id, institucionId: management.id, rol: 'PROPIETARIO' } });
    const nextMember = await db.miembroInstitucion.create({ data: { usuarioId: nextOwner.id, institucionId: management.id, rol: 'PROFESOR' } });
    const managementRoute = `/instituciones/${management.id}/licencia`;
    await request(admin, `${managementRoute}/activar`, 201, { ...command, cuposEstudiantes: 2, operacionId: randomUUID() });
    await request(priorOwner, `${managementRoute}/asignaciones`, 201, { operacionId: randomUUID(), usuarioId: nextOwner.id, tipo: 'DOCENTE' });
    await request(nextOwner, `${managementRoute}/aceptar`, 201, { operacionId: randomUUID() });
    await request(priorOwner, '/instituciones/me/transferir-propiedad', 201, { miembroId: nextMember.id, codigoConfirmacion: management.codigoUnico });
    assert.equal((await db.miembroInstitucion.findUniqueOrThrow({ where: { id: nextMember.id } })).rol, 'PROPIETARIO');
    await request(priorOwner, `${managementRoute}/asignaciones`, 403, { operacionId: randomUUID(), usuarioId: priorOwner.id, tipo: 'DOCENTE' });
    await request(nextOwner, `${managementRoute}/asignaciones`, 201, { operacionId: randomUUID(), usuarioId: priorOwner.id, tipo: 'DOCENTE' });
    await request(priorOwner, `${managementRoute}/aceptar`, 201, { operacionId: randomUUID() });
    await request(nextOwner, `/instituciones/me/miembros/${priorMember.id}`, 200, undefined, 'DELETE');
    assert.equal((await db.asignacionLicenciaInstitucional.findUniqueOrThrow({ where: { institucionId_usuarioId: { institucionId: management.id, usuarioId: priorOwner.id } } })).estado, 'RETIRADA');
    assert.equal(await db.miembroInstitucion.count({ where: { id: priorMember.id } }), 1);
    assert.equal(await db.usuario.count({ where: { id: priorOwner.id } }), 1);
    const personal = await account('ESTUDIANTE');
    await db.usuario.update({ where: { id: personal.id }, data: { fechaVencimientoPlan: new Date(Date.now() + 86400000) } });
    await request(nextOwner, `${managementRoute}/asignaciones`, 201, { operacionId: randomUUID(), usuarioId: personal.id, tipo: 'ESTUDIANTE' });
    assert.equal(await db.saldoPersonalInstitucional.count({ where: { usuarioId: personal.id } }), 0);
    const personalAcceptance = { operacionId: randomUUID() };
    await request(personal, `${managementRoute}/aceptar`, 201, personalAcceptance);
    await request(personal, `${managementRoute}/aceptar`, 201, personalAcceptance);
    await request(personal, '/auth/perfil', 200);
    const frozen = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { usuarioId: personal.id } });
    assert.equal(frozen.reanudadoEn, null);
    await request(nextOwner, `${managementRoute}/retirar`, 201, { operacionId: randomUUID(), usuarioId: personal.id });
    // Only synthetic setup of a future legitimate return to personal mode.
    await db.usuario.update({ where: { id: personal.id }, data: { institucionId: null } });
    await Promise.all([0, 1, 2].map(() => request(personal, '/auth/perfil', 200)));
    const restored = await db.saldoPersonalInstitucional.findUniqueOrThrow({ where: { id: frozen.id } });
    assert.equal(restored.venceReanudadoEn.getTime() - restored.reanudadoEn.getTime(), Number(frozen.milisegundos));
    assert.equal(await db.saldoPersonalInstitucional.count({ where: { usuarioId: personal.id } }), 1);
    console.log(JSON.stringify({ phase: 'lic1-http-management-passed', transferAndRetirementThroughExistingRoutes: true, accountsAndMembershipRetained: true }));
    const managedRoute = `/instituciones/${management.id}/cuentas-gestionadas`;
    const suffix = `http-${randomUUID()}.example`;
    const suffixRequest = await request(nextOwner, `${managedRoute}/sufijo/solicitar`, 201, { operacionId: randomUUID(), sufijo: suffix });
    await request(priorOwner, `${managedRoute}/sufijo/aprobar`, 403, { operacionId: randomUUID(), sufijo: suffix, version: suffixRequest.version });
    await request(admin, `${managedRoute}/sufijo/aprobar`, 201, { operacionId: randomUUID(), sufijo: suffix, version: suffixRequest.version });
    const managedGroup = await db.clase.create({ data: { nombre: 'HTTP managed group', codigoIngreso: randomUUID(), grado: 'ONCE', institucionId: management.id } });
    const csv = 'nombre,usuario\nHTTP Alumno,alumno';
    const previewManaged = await request(nextOwner, `${managedRoute}/previsualizar`, 201, { csv, claseId: managedGroup.id });
    const importCommand = { operacionId: randomUUID(), csv, claseId: managedGroup.id, huella: previewManaged.huella };
    const managedImport = await request(nextOwner, `${managedRoute}/confirmar`, 201, importCommand);
    assert.equal(managedImport.credenciales.length, 1);
    assert.deepEqual((await request(nextOwner, `${managedRoute}/confirmar`, 201, importCommand)).credenciales, []);
    const managedCredential = managedImport.credenciales[0];
    const temporaryLogins = await Promise.all([0, 1].map(() => fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: managedCredential.usuarioInstitucional, contrasena: managedCredential.contrasenaTemporal }), signal: AbortSignal.timeout(15000) })));
    assert.equal(temporaryLogins.filter(r => r.status === 201).length, 1);
    assert.equal(temporaryLogins.filter(r => r.status === 401).length, 1);
    const managedLogin = await temporaryLogins.find(r => r.status === 201).json();
    assert((await db.usuario.findUniqueOrThrow({ where: { id: managedCredential.usuarioId } })).temporalConsumidaEn);
    assert.equal(managedLogin.usuario.correo, null);
    assert.equal(managedLogin.usuario.identificadorInstitucional, managedCredential.usuarioInstitucional);
    async function managedRequest(accessToken, path, expected, body, method = body ? 'POST' : 'GET') {
      const response = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${accessToken}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      assert.equal(response.status, expected, `Managed auth probe ${path} expected ${expected}; received ${response.status}`);
      return response.json();
    }
    await managedRequest(managedLogin.accessToken, '/auth/perfil', 200);
    await managedRequest(managedLogin.accessToken, '/simulacros/generar?area=MATEMATICAS', 403);
    const permanent = `Changed-${randomUUID()}a1`;
    const changed = await managedRequest(managedLogin.accessToken, '/auth/cambiar-contrasena-inicial', 200, { nuevaContrasena: permanent }, 'PATCH');
    assert.equal(typeof changed.accessToken, 'string');
    await managedRequest(managedLogin.accessToken, '/auth/perfil', 401);
    const managedProfile = await managedRequest(changed.accessToken, '/auth/perfil', 200);
    assert.equal(managedProfile.accesoInstitucional.estadoLicencia, 'ACTIVA');
    assert.equal(managedProfile.accesoInstitucional.origenCuenta, 'GESTIONADA');
    assert.equal(managedProfile.accesoInstitucional.permitePractica, true);
    assert.equal(managedProfile.accesoInstitucional.permiteHistorial, true);
    assert.equal(managedProfile.correo, null);
    assert.equal(managedProfile.correoVerificado, false);
    assert.equal('asignaciones' in managedProfile.accesoInstitucional, false);
    const managedOffline = await managedRequest(changed.accessToken, `/recursos/editoriales/lecciones/${lesson.id}/offline`, 201, { requestNonce: 'b'.repeat(64) });
    assert(Date.parse(managedOffline.expiresAt) - Date.parse(managedOffline.validatedAt) <= 72 * 3600000);
    const managedMock = await managedRequest(changed.accessToken, '/simulacros/generar?area=MATEMATICAS', 200);
    await managedRequest(changed.accessToken, '/simulacros/calificar', 201, { intentoId: managedMock.intentoId, area: 'MATEMATICAS', respuestas: await answers(managedMock.preguntas) });
    const reportCommand = { operacionId: randomUUID(), preguntaId: managedMock.preguntas[0].id, motivo: 'ENUNCIADO_CONFUSO', detalle: 'Synthetic managed report, no email claim' };
    await managedRequest(changed.accessToken, '/preguntas/reportes', 201, reportCommand);
    await managedRequest(changed.accessToken, '/preguntas/reportes/operaciones/' + reportCommand.operacionId, 200);
    assert.equal((await db.usuario.findUniqueOrThrow({ where: { id: managedCredential.usuarioId } })).correoVerificado, false);
    const resetManaged = await request(nextOwner, `${managedRoute}/restablecer`, 201, { operacionId: randomUUID(), usuarioId: managedCredential.usuarioId });
    await managedRequest(changed.accessToken, '/auth/perfil', 401);
    await request(outsider, '/auth/login', 401, { correo: managedCredential.usuarioInstitucional, contrasena: permanent });
    const restoredLogin = await request(outsider, '/auth/login', 201, { correo: managedCredential.usuarioInstitucional, contrasena: resetManaged.credenciales[0].contrasenaTemporal });
    await managedRequest(restoredLogin.accessToken, '/auth/perfil', 200);
    console.log(JSON.stringify({ phase: 'lic2-managed-http-passed', realAppModule: true, aliasLoginNoFakeEmail: true, previewAndSingleDelivery: true, initialChangeRevokesTemporarySession: true, resetRevokesPreviousSessions: true }));
    await verifyManagedBrowser(db, { base, directory, admin, owner: nextOwner, password, institutionId: management.id, cwd: fixture.cwd });
    await verifyInstitutionBrowser(db, { base, directory, owner: nextOwner, password, institutionId: management.id, cwd: fixture.cwd });
    await verifyPrivacyBrowser(db, { base, directory, admin, owner, password, institutionId: institution.id, cwd: fixture.cwd });
    console.log(JSON.stringify({ phase: 'lic1-http-passed', realAppModule: true, legacyPolicyUnchanged: true,
      activationAuthorizationAndReplay: true, expiredNewPracticeDenied: true, suspendedLoginAllowed: true,
      historicalAndProfileAccessPreserved: true, assignedSeatRequired: true, connectedSocketCannotStartAfterExpiry: true,
      existingDiagnosticAndMockDeliveredDuringGrace: true, eighteenAnswersPersisted: true,
      teacherCapabilitiesNoFreeFallback: true, expiredHistoricalAnalytics: true,
      realOfflineGrantClippedAndExpiredDenied: true, ownedGraceMediaOnly: true,
      suspendedGraceMediaDenied: true, historicalMediaPreservedAndIsolated: true,
      editorialRevocationOverridesHistory: true }));
  } finally {
    socket?.disconnect();
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      if (child.connected) child.send('stop'); else child.kill();
      const timer = setTimeout(() => child.kill(), 15000);
      await exited;
      clearTimeout(timer);
    }
    if (dirname(directory) !== root || !basename(directory).startsWith('saberplus-lic1-http-') || await realpath(directory) !== directory)
      throw new Error('Refusing fixture marker cleanup: path mismatch');
    await rm(directory, { recursive: true });
  }
}
