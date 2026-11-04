// Physical Android validation against a nonce-owned local runner only.
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

const directory = resolve(process.argv[2] ?? '');
const mode = process.argv[3] ?? 'prepare';
assert(['prepare', 'prepare-new', 'verify'].includes(mode));
assert(/^saberplus-i2-local-[a-zA-Z0-9]+$/.test(directory.split(/[\\/]/).at(-1)));
const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
validateCompetitiveDatabase(marker.url, marker);
assert(/^[a-f0-9]{16}$/.test(marker.nonce));
const labels = JSON.parse(execFileSync('docker', ['inspect', `saberplus-i2-local-${marker.nonce}`, '--format', '{{json .Config.Labels}}'], { encoding: 'utf8', windowsHide: true }));
assert.equal(labels[marker.purpose], marker.nonce);
const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const { LicenciaInstitucionalService } = require('../dist/institucion/licencia-institucional.service');
const { ManagedAccountService } = require('../dist/institucion/managed-account.service');
const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
const file = join(directory, 'lic-android-private.json');
const api = async (path, token, body) => {
  const response = await fetch(config.API_BASE_URL + path, { method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  assert(response.ok, `Owned API ${path}: ${response.status}`);
  return response.json();
};
try {
  const seed = await api('/auth/login', null, { correo: config.AUTH_E2E_EMAIL, contrasena: config.AUTH_E2E_PASSWORD });
  const profile = await api('/auth/perfil', seed.accessToken);
  assert(await db.usuario.findUnique({ where: { id: profile.id } }), 'API and owned database must match');
  if (mode === 'verify') {
    const fixture = JSON.parse(await readFile(file, 'utf8'));
    const managed = await db.usuario.findUniqueOrThrow({ where: { id: fixture.LIC_MANAGED_ID } });
    assert.equal(managed.debeCambiarContrasena, false);
    assert(managed.temporalConsumidaEn);
    assert(await bcrypt.compare(fixture.LIC_NEW_PASSWORD, managed.contrasenaHash));
    const personal = await db.usuario.findUniqueOrThrow({ where: { id: fixture.LIC_PERSONAL_ID } });
    assert.equal(personal.institucionId, null);
    const balance = await db.saldoPersonalInstitucional.findFirstOrThrow({ where: { usuarioId: personal.id } });
    assert.equal(balance.venceReanudadoEn.getTime() - balance.reanudadoEn.getTime(), Number(balance.milisegundos));
    assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: personal.id } }), 1);
    assert.equal(await db.solicitudSupresionCuenta.count({ where: { usuarioId: managed.id, estado: 'PENDIENTE' } }), 1);
    assert.equal(managed.suprimidaEn, null);
    console.log(JSON.stringify({ phase: 'lic-android-sql-verified', nativePasswordChange: true, exactBalanceOnce: true, historyPreserved: true, requestDoesNotDelete: true, ownDisposableOnly: true }));
  } else {
    if (mode === 'prepare-new') {
      // Preserve the previous owned manifest; a new run never reuses consumed keys.
      await rename(file, join(directory, `lic-android-previous-${randomUUID()}.json`));
    }
    try { await readFile(file); throw new Error('Fixture already prepared; never overwrite a consumed temporary credential'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const password = `Local-${randomBytes(9).toString('hex')}!`;
    const newPassword = `Changed-${randomBytes(9).toString('hex')}!`;
    const hash = await bcrypt.hash(password, 10);
    const makeUser = (name, role, institutionId = null) => db.usuario.create({ data: {
      nombre: name, rol: role, institucionId: institutionId,
      correo: `${randomUUID()}@example.invalid`, correoVerificado: true,
      contrasenaHash: hash, tutorialEstudianteVersion: 100, tutorialProfesorVersion: 100,
    } });
    const admin = await makeUser('ADMIN Android propio', 'ADMIN');
    const license = new LicenciaInstitucionalService(db), managedService = new ManagedAccountService(db);
    async function school(name) {
      const institution = await db.institucion.create({ data: { nombre: name, codigoUnico: randomUUID(), estadoVerificacion: 'APROBADA' } });
      const owner = await makeUser('Docente Android LIC', 'PROFESOR', institution.id);
      await db.miembroInstitucion.create({ data: { institucionId: institution.id, usuarioId: owner.id, rol: 'PROPIETARIO' } });
      await license.acordar(admin.id, institution.id, { operacionId: randomUUID(), meses: 6, cuposEstudiantes: 5, cuposDocentes: 1, referenciaAcuerdo: 'ANDROID SYNTHETIC LOCAL ONLY' }, false);
      return { institution, owner };
    }
    const active = await school('Colegio Android activo LIC');
    const group = await db.clase.create({ data: { nombre: '11 Android LIC', codigoIngreso: randomUUID(), grado: 'ONCE', institucionId: active.institution.id } });
    const suffix = `android-${randomUUID()}.example`;
    const suffixRequest = await managedService.solicitarSufijo(active.owner.id, active.institution.id, randomUUID(), suffix);
    await managedService.aprobarSufijo(admin.id, active.institution.id, randomUUID(), suffix, suffixRequest.version);
    const csv = 'nombre,usuario\nAlumno Android LIC,alumno';
    const preview = await managedService.previsualizar(active.owner.id, active.institution.id, { csv, claseId: group.id });
    const created = await managedService.importar(active.owner.id, active.institution.id, randomUUID(), { csv, claseId: group.id, huella: preview.huella });
    const credential = created.credenciales[0];
    await db.usuario.update({ where: { id: credential.usuarioId }, data: { tutorialEstudianteVersion: 100 } });
    const topic = await db.tema.create({ data: { nombre: 'Matemáticas Android LIC', area: 'MATEMATICAS', estadoContenido: 'PUBLICADO' } });
    const subtopic = await db.subtema.create({ data: { nombre: 'Prioridad Android LIC', temaId: topic.id, estadoContenido: 'PUBLICADO' } });
    for (let i = 0; i < 5; i++) await db.pregunta.create({ data: {
      enunciado: `Validación local Android ${i + 1}: ¿cuánto es 1 + 1?`, subtemaId: subtopic.id,
      estadoContenido: 'PUBLICADO', respuestas: { create: [{ texto: '2', esCorrecta: true }, { texto: '3', esCorrecta: false }] },
    } });
    const ownerLogin = await api('/auth/login', null, { correo: active.owner.correo, contrasena: password });
    await api(`/instituciones/me/grupos/${group.id}/prioridades`, ownerLogin.accessToken,
      { id: randomUUID(), temaId: topic.id, subtemaId: subtopic.id, venceEn: new Date(Date.now() + 86400000).toISOString() });
    const expired = await school('Colegio Android vencido LIC');
    const personal = await makeUser('Personal Android LIC', 'ESTUDIANTE');
    await db.usuario.update({ where: { id: personal.id }, data: { fechaVencimientoPlan: new Date(Date.now() + 5 * 86400000) } });
    await license.asignar(expired.owner.id, expired.institution.id, randomUUID(), personal.id, 'ESTUDIANTE');
    await license.aceptar(personal.id, expired.institution.id, randomUUID());
    await db.diagnosticoInicial.create({ data: { usuarioId: personal.id, preguntaIds: [], totalPreguntas: 0 } });
    await db.periodoContratoInstitucional.updateMany({ where: { institucionId: expired.institution.id }, data: { inicio: new Date(Date.now() - 2 * 86400000), fin: new Date(Date.now() - 86400000) } });
    const suspended = await school('Colegio Android suspendido LIC');
    const suspendedStudent = await makeUser('Suspendido Android LIC', 'ESTUDIANTE');
    await license.asignar(suspended.owner.id, suspended.institution.id, randomUUID(), suspendedStudent.id, 'ESTUDIANTE');
    await license.aceptar(suspendedStudent.id, suspended.institution.id, randomUUID());
    await license.suspender(admin.id, suspended.institution.id, randomUUID(), true);
    await writeFile(file, JSON.stringify({ APP_ENV: 'dev', DEMO_MODE: 'false', API_BASE_URL: config.API_BASE_URL,
      CONTENT_BASE_URL: config.API_BASE_URL, LIC_ANDROID_LOCAL: 'true', LIC_PASSWORD: password, LIC_NEW_PASSWORD: newPassword,
      LIC_MANAGED_USER: credential.usuarioInstitucional, LIC_TEMP_PASSWORD: credential.contrasenaTemporal,
      LIC_MANAGED_ID: credential.usuarioId, LIC_OWNER_USER: active.owner.correo,
      LIC_PERSONAL_USER: personal.correo, LIC_PERSONAL_ID: personal.id,
      LIC_SUSPENDED_USER: suspendedStudent.correo, LIC_GROUP: group.id,
    }), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'lic-android-fixture-ready', configFile: file, ownDisposableOnly: true, noCredentialsPrinted: true }));
  }
} finally { await db.$disconnect(); }
