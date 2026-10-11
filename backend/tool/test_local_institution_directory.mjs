// PR-I5: HTTP real y fixtures sintéticas, únicamente en una sesión local propia.
import assert from 'node:assert/strict';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

const suspend = process.argv[2] === '--suspend';
const territory = process.argv[2] === '--territory';
const reviewTeacher = process.argv[2] === '--review-teacher';
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && (suspend || territory || reviewTeacher)));
const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION ?? '');
assert.equal(dirname(directory), await realpath(tmpdir()));
assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
validateCompetitiveDatabase(marker.url, marker);
assert.match(marker.nonce, /^[a-f0-9]{16}$/);
const exec = promisify(execFile);
const context = (await exec('docker', ['context', 'show'], { windowsHide: true })).stdout.trim();
const endpoint = (await exec('docker', ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'], { windowsHide: true })).stdout.trim();
assert.ok(endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'));
const labels = JSON.parse((await exec('docker', ['--context', context, 'inspect', '--format', '{{json .Config.Labels}}', `saberplus-i2-local-${marker.nonce}`], { windowsHide: true })).stdout);
assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
assert.equal(config.LOCAL_RANKING_ENABLED, 'true');
const require = createRequire(new URL('../package.json', import.meta.url));
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: marker.url } } });
const prefix = `directory-${marker.nonce}-`;
let token;
async function get(path, status = 200, authenticated = true) {
  const response = await fetch(`${config.API_BASE_URL}${path}`, {
    headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, status, `HTTP esperado para ${path}`);
  return response.json();
}
try {
  if (reviewTeacher) {
    const correo = 'teacher-review@example.invalid';
    const nombre = 'Ensayo territorial revisión';
    const existing = await db.usuario.findUnique({ where: { correo } });
    if (existing) {
      assert.equal(existing.rol, 'PROFESOR');
      assert.equal(existing.nombre, nombre);
    } else {
      const bcrypt = require('bcrypt');
      await db.usuario.create({ data: {
        nombre, correo, rol: 'PROFESOR',
        contrasenaHash: await bcrypt.hash(config.AUTH_E2E_PASSWORD, 10),
        correoVerificado: true, tutorialProfesorVersion: 1,
      } });
    }
    console.log(JSON.stringify({ phase: 'local-territory-review-teacher-ready', email: correo, created: !existing, physical: 'pending' }));
  } else if (suspend) {
    const target = await db.institucion.findUniqueOrThrow({ where: { codigoUnico: `${prefix}01` } });
    await db.institucion.update({ where: { id: target.id }, data: { estadoVerificacion: 'SUSPENDIDA' } });
    // ADMIN de ensayo para comprobar HTTP sin reemplazar la sesión del celular.
    const login = await fetch(`${config.API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'admin@example.invalid', contrasena: config.AUTH_E2E_PASSWORD }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(login.status, 201);
    token = (await login.json()).accessToken;
    assert.ok(token);
    await get(`/instituciones/directorio/${target.id}`, 404);
    const search = await get('/instituciones/directorio?q=ensayo%2001');
    assert.equal(search.instituciones.length, 0);
    const second = await get('/instituciones/directorio?pagina=2');
    assert.equal(second.instituciones.length, 4);
    console.log(JSON.stringify({ phase: 'local-directory-suspended', id: target.id, name: target.nombre, detailStatus: 404, searchResults: 0, remaining: 24, httpChecks: 'passed', physical: 'pending' }));
  } else {
    const catalog = territory ? JSON.parse(await readFile(new URL('../src/institucion/catalogs/divipola-2025.json', import.meta.url), 'utf8')) : null;
    for (let n = 1; n <= 25; n++) {
      const number = String(n).padStart(2, '0');
      const department = n <= 21 ? '91' : n <= 23 ? '20' : n === 24 ? '11' : null;
      const location = territory ? { departamentoCodigo: department,
        municipioCodigo: department ? `${department}001` : null,
        territorioVersion: department ? catalog.version : null } : {};
      await db.institucion.upsert({
        where: { codigoUnico: `${prefix}${number}` }, update: location,
        create: { nombre: `Institucion de ensayo ${number}`, codigoUnico: `${prefix}${number}`, estadoVerificacion: 'APROBADA', ...location },
      });
    }
    const hidden = [];
    for (const state of ['PENDIENTE', 'RECHAZADA', 'SUSPENDIDA', 'LEGADO_EN_REVISION']) {
      const location = territory ? { departamentoCodigo: '91', municipioCodigo: '91001', territorioVersion: catalog.version } : {};
      hidden.push(await db.institucion.upsert({ where: { codigoUnico: `${prefix}${state}` }, update: location,
        create: { nombre: `Institucion oculta ${state}`, codigoUnico: `${prefix}${state}`, estadoVerificacion: state, ...location } }));
    }
    const login = await fetch(`${config.API_BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ correo: 'student@example.invalid', contrasena: config.AUTH_E2E_PASSWORD }),
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(login.status, 201);
    token = (await login.json()).accessToken;
    assert.ok(token);
    const first = await get('/instituciones/directorio');
    const second = await get('/instituciones/directorio?pagina=2');
    assert.equal(first.instituciones.length, 20);
    assert.equal(first.hayMas, true);
    assert.equal(second.instituciones.length, 5);
    assert.equal(second.hayMas, false);
    const ids = [...first.instituciones, ...second.instituciones].map(row => row.id);
    assert.equal(new Set(ids).size, 25);
    for (const row of [...first.instituciones, ...second.instituciones]) {
      assert.deepEqual(Object.keys(row).sort(), ['id', 'nombre', 'ubicacion']);
    }
    const target = first.instituciones[0];
    assert.deepEqual(await get(`/instituciones/directorio/${target.id}`), target);
    const found = await get('/instituciones/directorio?q=ENSAYO%2001');
    assert.equal(found.instituciones.length, 1);
    const empty = await get('/instituciones/directorio?q=inexistente');
    assert.equal(empty.instituciones.length, 0);
    for (const row of hidden) await get(`/instituciones/directorio/${row.id}`, 404);
    if (territory) {
      const departments = await get('/instituciones/territorio/departamentos');
      assert.equal(departments.version, catalog.version);
      const amazonas = await get('/instituciones/directorio?departamentoCodigo=91');
      const amazonas2 = await get('/instituciones/directorio?departamentoCodigo=91&municipioCodigo=91001&pagina=2');
      assert.equal(amazonas.instituciones.length, 20); assert.equal(amazonas.hayMas, true);
      assert.equal(amazonas2.instituciones.length, 1); assert.equal(amazonas2.hayMas, false);
      for (const row of [...amazonas.instituciones, ...amazonas2.instituciones]) assert.equal(row.ubicacion.municipioCodigo, '91001');
      assert.equal((await get('/instituciones/directorio?departamentoCodigo=20')).instituciones.length, 2);
      assert.equal((await get('/instituciones/directorio?departamentoCodigo=11&municipioCodigo=11001')).instituciones.length, 1);
      assert.equal((await get('/instituciones/directorio?departamentoCodigo=05')).instituciones.length, 0);
      assert.equal((await get('/instituciones/directorio?departamentoCodigo=20&q=ensayo%2022')).instituciones.length, 1);
      assert.equal([...first.instituciones, ...second.instituciones].filter(row => row.ubicacion === null).length, 1);
      await get('/instituciones/directorio?municipioCodigo=91001', 400);
      await get('/instituciones/directorio?departamentoCodigo=91&municipioCodigo=20001', 400);
    }
    await get('/instituciones/directorio?pagina=0', 400);
    await get('/instituciones/directorio', 401, false);
    await writeFile(join(directory, territory ? 'directory-territory-evidence.json' : 'directory-evidence.json'), JSON.stringify({
      capturedAt: new Date().toISOString(), approved: 25, hidden: 4,
      targetId: target.id, targetName: target.nombre,
      automated: ['list', 'pagination', 'search', 'empty', 'private-fields', 'hidden-detail', 'invalid-page', 'anonymous',
        ...(territory ? ['territory-pagination', 'territory-name', 'territory-legacy', 'territory-invalid-pair'] : [])],
      physical: 'pending',
    }), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'local-directory-ready', approved: 25, hidden: 4, pages: [20, 5], httpChecks: 'passed', physical: 'pending' }));
  }
} catch (error) {
  console.error(`Directory validation failed: ${error.name}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
