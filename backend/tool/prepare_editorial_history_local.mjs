// H3 human fixture: edit only the owned synthetic bank through the real ADMIN API.
// Never creates answers, changes XP, deletes history or accepts an external DB.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';
import { CatalogApi } from '../../admin/public/api.mjs';

let stage = 'ownership';

async function main() {
  assert.equal(process.argv.length, 2);
  const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const read = async (name) => JSON.parse(await readFile(join(directory, name), 'utf8'));
  const owner = await read('owner.json');
  validateCompetitiveDatabase(owner.url, owner);
  assert.match(owner.nonce, /^[0-9a-f]{16}$/);
  const run = promisify(execFile);
  const docker = async (...args) => (await run('docker', args, { windowsHide: true, timeout: 15000 })).stdout.trim();
  const context = await docker('context', 'show');
  const endpoint = await docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}');
  assert.ok(endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'));
  const labels = JSON.parse(await docker('--context', context, 'inspect', '--format', '{{json .Config.Labels}}', `saberplus-i2-local-${owner.nonce}`));
  assert.equal(labels['saberplus-competitive-disposable-v1'], owner.nonce);
  const config = await read('flutter-private.json');
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const fixture = await read('editorial-options-fixture.json');
  assert.equal(fixture.nonce, owner.nonce);
  assert.equal(fixture.themeName, `Opciones C2-D - ensayo ${owner.nonce.slice(0, 8)}`);
  assert.equal(fixture.questionIds.length, 12);
  assert.equal(new Set(fixture.questionIds).size, 12);
  assert.equal(fixture.images.length, 2);
  for (const path of fixture.images) assert.match(path, /^\/recursos\/editoriales\/[0-9a-f-]{36}$/);
  const db = new PrismaClient({ datasources: { db: { url: owner.url } } });
  const api = new CatalogApi(config.API_BASE_URL, { simple: true });
  const request = async (path, token, body) => fetch(`${config.API_BASE_URL}${path}`, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const login = async (correo) => {
    const response = await request('/auth/login', null, { correo, contrasena: config.AUTH_E2E_PASSWORD });
    assert.equal(response.status, 201);
    const { accessToken } = await response.json();
    assert.equal(typeof accessToken, 'string');
    return accessToken;
  };
  try {
    await db.$connect();
    const theme = await db.tema.findUniqueOrThrow({ where: { id: fixture.themeId } });
    assert.equal(theme.nombre, fixture.themeName);
    const subtheme = await db.subtema.findUniqueOrThrow({ where: { id: fixture.subthemeId } });
    assert.equal(subtheme.temaId, theme.id);
    const student = await db.usuario.findUniqueOrThrow({ where: { correo: config.AUTH_E2E_EMAIL } });
    assert.equal(student.rol, 'ESTUDIANTE');
    const token = await login(config.AUTH_E2E_EMAIL);
    const profile = await request('/auth/perfil', token);
    assert.equal(profile.status, 200);
    assert.equal((await profile.json()).id, student.id);
    const snapshot = async () => ({
      xp: (await db.usuario.findUniqueOrThrow({ where: { id: student.id }, select: { xpTotal: true } })).xpTotal,
      history: await db.historialRespuesta.findMany({ where: { usuarioId: student.id }, orderBy: { id: 'asc' } }),
      images: await db.imagenHistorialRespuesta.findMany({ where: { usuarioId: student.id }, orderBy: [{ historialId: 'asc' }, { rol: 'asc' }] }),
      notebook: await db.cuadernoError.findMany({ where: { usuarioId: student.id }, orderBy: { id: 'asc' } }),
    });
    let journal;
    try { journal = await read('editorial-history-fixture.json'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const baseline = await snapshot();
      assert.ok(baseline.history.some((row) => fixture.questionIds.includes(row.preguntaId) && !row.esCorrecta), 'Human incorrect answer required before editing.');
      assert.ok(baseline.images.length >= 2, 'Historical image evidence required.');
      journal = { version: 1, nonce: owner.nonce, baseline, replacements: [], completed: false };
      await writeFile(join(directory, 'editorial-history-fixture.json'), JSON.stringify(journal), { mode: 0o600 });
    }
    assert.equal(journal.nonce, owner.nonce);
    assert.ok(Array.isArray(journal.replacements));
    for (const replacement of journal.replacements) assert.ok(fixture.questionIds.includes(replacement.originalId));
    await api.login('admin@example.invalid', config.AUTH_E2E_PASSWORD);
    for (const originalId of fixture.questionIds) {
      if (journal.replacements.some((row) => row.originalId === originalId)) continue;
      const original = await api.bankRecord('preguntas', fixture.subthemeId, originalId);
      assert.equal(original.estadoContenido, 'PUBLICADO');
      assert.ok(original.enunciado.startsWith('Ensayo C2-D '));
      const replacement = await api.bankRecord('preguntas', fixture.subthemeId, originalId, {
        revision: original.revision, subtemaId: fixture.subthemeId,
        enunciado: `Versión actual H3 ${fixture.questionIds.indexOf(originalId) + 1}: ¿cuánto es 2 + 2?`,
        explicacion: 'Explicación nueva H3: dos más dos es cuatro. Esta versión ya no usa figuras.',
        dificultad: 'BASICO', imagenUrl: '', casoId: '',
        respuestas: ['4', '5', '6', '7'].map((texto, index) => ({ texto, imagenUrl: '', esCorrecta: index === 0, explicacion: '' })),
      });
      assert.notEqual(replacement.id, originalId);
      journal.replacements.push({ originalId, currentId: replacement.id });
      await writeFile(join(directory, 'editorial-history-fixture.json'), JSON.stringify(journal), { mode: 0o600 });
    }
    assert.equal(await db.pregunta.count({ where: { id: { in: fixture.questionIds }, estadoContenido: 'ARCHIVADO' } }), 12);
    stage = 'history-invariant';
    assert.deepEqual(JSON.parse(JSON.stringify(await snapshot())), journal.baseline);
    stage = 'other-login';
    const other = await login('zero@example.invalid');
    for (const path of fixture.images) {
      stage = 'owner-original-access';
      assert.equal((await request(path, token)).status, 200, 'Original image must remain accessible to its historical owner.');
      stage = 'other-original-denied';
      assert.equal((await request(path, other)).status, 404, 'Other account must not inherit historical access.');
    }
    journal.completed = true;
    await writeFile(join(directory, 'editorial-history-fixture.json'), JSON.stringify(journal), { mode: 0o600 });
    console.log(JSON.stringify({ phase: 'h3-originals-after-edit-ready', archivedOriginals: 12,
      currentVersions: journal.replacements.length, xp: journal.baseline.xp,
      historicalAnswers: journal.baseline.history.length, historicalImages: journal.baseline.images.length,
      historyAndNotebookUnchanged: true, otherAccountDenied: true, androidAfterEditVerified: false }));
  } finally {
    api.logout();
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(JSON.stringify({ phase: 'h3-fixture-failed', stage, errorType: error.name,
    ...(typeof error.actual === 'number' ? { actual: error.actual } : {}),
    ...(typeof error.expected === 'number' ? { expected: error.expected } : {}) }));
  console.error('No se pudo preparar H3 histórico; revisar sesión propia y diario temporal. No se afirma ensayo aprobado.');
  process.exitCode = 1;
});
