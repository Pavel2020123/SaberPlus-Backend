// Real panel client + real login/AppModule/PostgreSQL, no browser or mocks.
import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, realpath } from 'node:fs/promises';
import { dirname, basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { CatalogApi } from '../../admin/public/api.mjs';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';

let config;
before(async () => {
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
  const labels = JSON.parse((await exec('docker', ['--context', context, 'inspect', '--format',
    '{{json .Config.Labels}}', `saberplus-i2-local-${marker.nonce}`], { windowsHide: true })).stdout);
  assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
  config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  assert.equal(config.LOCAL_RANKING_ENABLED, 'true');
});

test('panel real: profesor no obtiene sesión ADMIN', async () => {
  const api = new CatalogApi(config.API_BASE_URL, { simple: true });
  await assert.rejects(api.login('teacher@example.invalid', config.AUTH_E2E_PASSWORD), error => error.status === 403);
  assert.equal(api.authenticated, false);
});

test('panel real: jerarquía, publicación, versiones, duplicados, revisión, mapa y borrado seguro', async () => {
  const api = new CatalogApi(config.API_BASE_URL, { simple: true });
  try {
    await api.login('admin@example.invalid', config.AUTH_E2E_PASSWORD);
    assert.equal((await api.areas()).length, 5);
    const fixtureId = randomUUID();
    const theme = await api.create('temas', 'MATEMATICAS', `Ensayo ${fixtureId}`);
    const sub = await api.create('subtemas', theme.id, 'Sumas de ensayo');
    assert.equal(theme.estadoContenido, 'PUBLICADO');
    assert.equal(sub.estadoContenido, 'PUBLICADO');
    let lesson = await api.editor('subtemas', sub.id, theme.id);
    const oldRevision = lesson.revision;
    lesson = await api.editor('subtemas', sub.id, theme.id, { revision: oldRevision,
      contenido: 'Explicación sintética de ensayo: tres más tres es seis.', videoUrl: '', imagenUrl: '' });
    assert.equal(lesson.estadoContenido, 'PUBLICADO');
    await assert.rejects(api.editor('subtemas', sub.id, theme.id, { revision: oldRevision,
      contenido: 'Escritura obsoleta', videoUrl: '', imagenUrl: '' }), error => error.status === 409);
    const question = { subtemaId: sub.id, enunciado: `¿Cuánto es 3 + 3? Ensayo ${fixtureId}`,
      explicacion: 'Tres más tres es seis.', dificultad: 'BASICO', imagenUrl: '', casoId: '',
      respuestas: [{ texto: '6', esCorrecta: true, explicacion: '' }, { texto: '9', esCorrecta: false, explicacion: '' }] };
    const first = await api.bankRecord('preguntas', sub.id, null, question);
    const edited = await api.bankRecord('preguntas', sub.id, first.id,
      { ...question, revision: first.revision, explicacion: 'Explicación corregida de ensayo.' });
    assert.notEqual(edited.id, first.id);
    assert.equal(edited.reemplazaId, first.id);
    const previous = await api.bankRecord('preguntas', sub.id, first.id);
    assert.equal(previous.estadoContenido, 'ARCHIVADO');
    assert.equal(previous.explicacion, first.explicacion);
    await assert.rejects(api.bankRecord('preguntas', sub.id, null, question), error => error.status === 409);
    assert.deepEqual((await api.bankPage('preguntas', sub.id)).items.map(row => row.id), [edited.id]);
    const nonempty = await api.editor('temas', theme.id, 'MATEMATICAS');
    assert.equal(nonempty.eliminable, false);
    await assert.rejects(api.removeDraft('temas', theme.id, 'MATEMATICAS', nonempty.revision, true),
      error => [400, 409].includes(error.status));
    const base = await api.create('subtemas', theme.id, 'Base orientativa de ensayo');
    let map = await api.learningMap(sub.id, 'MATEMATICAS');
    map = await api.learningMap(sub.id, 'MATEMATICAS', { revision: map.revision, previos: [base.id] });
    assert.equal(map.previos.length, 1);
    assert.equal(map.previos[0].id, base.id);
    const empty = await api.create('temas', 'INGLES', `Vacío ${randomUUID()}`);
    const detail = await api.editor('temas', empty.id, 'INGLES');
    assert.equal(detail.eliminable, true);
    assert.equal((await api.removeDraft('temas', empty.id, 'INGLES', detail.revision, true)).eliminado, true);
    assert.ok(await api.coverage('MATEMATICAS'));
  } finally { api.logout(); }
});
