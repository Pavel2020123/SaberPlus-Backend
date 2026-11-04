// Explicit opt-in against a verified runner-owned disposable database only.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

const directory = resolve(process.argv[2] ?? '');
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
const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
try {
  const response = await fetch(`${config.API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: config.AUTH_E2E_EMAIL, contrasena: config.AUTH_E2E_PASSWORD }) });
  assert.equal(response.status, 201);
  const session = await response.json();
  const profile = await fetch(`${config.API_BASE_URL}/auth/perfil`, { headers: { Authorization: `Bearer ${session.accessToken}` } });
  assert.equal(profile.status, 200);
  const current = await profile.json();
  assert(await db.usuario.findUnique({ where: { id: current.id } }), 'API must use this owned database');
  const password = `Demo-${randomBytes(7).toString('hex')}!`;
  const email = `propietario-${randomBytes(3).toString('hex')}@example.invalid`;
  const institution = await db.$transaction(async tx => {
    const school = await tx.institucion.create({ data: { nombre: 'Colegio demostración SaberPlus', codigoUnico: `DEMO-${randomBytes(5).toString('hex').toUpperCase()}`, estadoVerificacion: 'APROBADA' } });
    const owner = await tx.usuario.create({ data: { nombre: 'Propietario de demostración', correo: email, contrasenaHash: await bcrypt.hash(password, 10), rol: 'PROFESOR', correoVerificado: true, institucionId: school.id } });
    await tx.miembroInstitucion.create({ data: { usuarioId: owner.id, institucionId: school.id, rol: 'PROPIETARIO' } });
    await tx.controlLicenciaInstitucional.create({ data: { institucionId: school.id } });
    const [{ now }] = await tx.$queryRaw`SELECT clock_timestamp() AS now`;
    const start = new Date(now.getTime() - 60000), end = new Date(start);
    end.setUTCMonth(end.getUTCMonth() + 6);
    await tx.periodoContratoInstitucional.create({ data: { id: randomUUID(), institucionId: school.id, inicio: start, fin: end, meses: 6, cuposEstudiantes: 75, cuposDocentes: 3, referenciaAcuerdo: 'DEMO LOCAL SINTETICA - NO CONTRATO COMERCIAL' } });
    await tx.clase.create({ data: { institucionId: school.id, codigoIngreso: randomUUID(), nombre: '11 A · Demostración', grado: 'ONCE' } });
    return school.id;
  });
  const login = await fetch(`${config.API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: email, contrasena: password }) });
  assert.equal(login.status, 201);
  const { accessToken } = await login.json();
  const context = await fetch(`${config.API_BASE_URL}/instituciones/profesor/contexto`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(context.status, 200);
  console.log(JSON.stringify({ localOnly: true, institution, email, password, portal: 'http://127.0.0.1:4173/institucion' }));
} finally { await db.$disconnect(); }
