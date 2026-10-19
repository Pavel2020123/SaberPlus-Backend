// R4 setup/smoke, not the full PostgreSQL/concurrency/Android validation suite.
import assert from 'node:assert/strict';
import { readFile, writeFile, realpath } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';
import { CatalogApi } from '../../admin/public/api.mjs';

const resumeCase7 = process.argv.length === 3 && process.argv[2] === '--resume-case7';
assert.ok(process.argv.length === 2 || resumeCase7, 'Only --resume-case7 is supported; no external URL/password arguments.');
const directory = await realpath(process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session');
assert.equal(dirname(directory), await realpath(tmpdir()));
assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
const marker = JSON.parse(await readFile(join(directory, 'owner.json'), 'utf8'));
validateCompetitiveDatabase(marker.url, marker);
const exec = promisify(execFile);
const context = (await exec('docker', ['context', 'show'], { windowsHide: true })).stdout.trim();
const endpoint = (await exec('docker', ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'], { windowsHide: true })).stdout.trim();
assert.ok(endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'));
const labels = JSON.parse((await exec('docker', ['--context', context, 'inspect', '--format',
  '{{json .Config.Labels}}', `saberplus-i2-local-${marker.nonce}`], { windowsHide: true })).stdout);
assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
const config = JSON.parse(await readFile(join(directory, 'flutter-private.json'), 'utf8'));
assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
async function request(path, token, body) {
  const response = await fetch(config.API_BASE_URL + path, {
    method: body === undefined ? 'GET' : 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, data: await response.json() };
}
const api = new CatalogApi(config.API_BASE_URL, { simple: true });
try {
  await api.login('admin@example.invalid', config.AUTH_E2E_PASSWORD);
  const theme = await api.create('temas', 'MATEMATICAS', `Reportes R4 - ensayo ${randomUUID().slice(0, 8)}`);
  const subtheme = await api.create('subtemas', theme.id, 'Preguntas para probar reportes');
  const lesson = await api.editor('subtemas', subtheme.id, theme.id);
  await api.editor('subtemas', subtheme.id, theme.id, { revision: lesson.revision,
    contenido: 'Contenido ficticio para probar reportes. Practica las dos sumas y revisa el resultado antes de reportar.',
    videoUrl: '', imagenUrl: '' });
  const questions = [];
  for (const n of [2, 4]) {
    questions.push(await api.bankRecord('preguntas', subtheme.id, null, {
      subtemaId: subtheme.id, enunciado: `Ensayo de reportes R4: ¿cuánto es ${n} + 1?`,
      explicacion: `Sumar uno a ${n} da ${n + 1}. Explicación de prueba, no contenido del curso.`,
      dificultad: 'BASICO', imagenUrl: '', casoId: '',
      respuestas: [{texto: String(n + 1), esCorrecta: true, explicacion: ''},
        {texto: String(n + 3), esCorrecta: false, explicacion: ''}],
    }));
  }
  const student = await request('/auth/login', null, { correo: 'student@example.invalid', contrasena: config.AUTH_E2E_PASSWORD });
  assert.equal(student.status, 201);
  const own = await request('/preguntas/reportes/mios?pagina=1&limite=20', student.data.accessToken);
  assert.equal(own.status, 200); assert.deepEqual(own.data.items, []);
  const inbox = await api.questionReports({area:'MATEMATICAS',subtemaId:subtheme.id});
  assert.deepEqual(inbox.items, []);
  const coverage = await api.coverage('MATEMATICAS', 1, true);
  assert.equal(coverage.reportesDisponibles, true);
  const row = coverage.items.find(item => item.id === subtheme.id);
  assert.ok(row); assert.equal(row.publicadas, 2); assert.equal(row.reportes, 0);
  if (resumeCase7) {
    // New disposable session only: exercise real practice/report APIs to prepare
    // a list for case 7. These actions are AUTOMATIC, never replayed human evidence.
    const token = student.data.accessToken;
    const practice = await request(`/simulacros/preguntas/${subtheme.id}`, token);
    assert.equal(practice.status, 200); assert.equal(practice.data.preguntas.length, 2);
    const grade = await request('/simulacros/calificar', token, {
      intentoId: practice.data.intentoId, area: 'MATEMATICAS', origen: 'PRACTICA',
      respuestas: practice.data.preguntas.map(question => ({
        preguntaId: question.id, respuestaId: question.respuestas[0].id, tiempoRespuestaSegundos: 1,
      })),
    });
    assert.equal(grade.status, 201);
    const questionId = practice.data.preguntas[0].id;
    for (const [motivo, detalle] of [
      ['ENUNCIADO_CONFUSO', 'Preparación automática R4 para retomar el listado, no envío humano.'],
      ['OTRO', '1234567890'.repeat(50)],
      ['EXPLICACION_INCORRECTA', 'Preparación automática para reanudar el caso 7 de reportes.'],
    ]) {
      const result = await request('/preguntas/reportes', token, {
        operacionId: randomUUID(), preguntaId: questionId, motivo, detalle,
      });
      assert.equal(result.status, 201); assert.equal(result.data.duplicado, false);
    }
    const duplicate = await request('/preguntas/reportes', token, {
      operacionId: randomUUID(), preguntaId: questionId, motivo: 'ENUNCIADO_CONFUSO',
      detalle: 'Duplicado automático de preparación, no un cuarto reporte.',
    });
    assert.equal(duplicate.status, 201); assert.equal(duplicate.data.duplicado, true);
    const current = await request('/preguntas/reportes/mios?pagina=1&limite=20', token);
    assert.equal(current.status, 200); assert.equal(current.data.items.length, 3);
    assert.ok(current.data.items.every(report => report.estado === 'PENDIENTE'));
    const currentCoverage = await api.coverage('MATEMATICAS', 1, true);
    const currentRow = currentCoverage.items.find(item => item.id === subtheme.id);
    assert.equal(currentRow.reportes, 3); assert.equal(currentRow.preguntasConReportes, 1);
  }
  await writeFile(join(directory, 'reports-fixtures.json'), JSON.stringify({
    themeId: theme.id, themeName: theme.nombre, subthemeId: subtheme.id, subthemeName: subtheme.nombre,
    questionIds: questions.map(question => question.id), student: 'student@example.invalid',
    admin: 'admin@example.invalid', smokeOnly: !resumeCase7, manualCasesCompleted: 0,
    automaticResumeCase7: resumeCase7, preparedReports: resumeCase7 ? 3 : 0,
  }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({phase:'question-reports-fixtures-ready',theme:theme.nombre,
    subtheme:subtheme.nombre,questions:questions.length,smokeChecks:3,manualCasesCompleted:0,
    automaticResumeCase7:resumeCase7,preparedReports:resumeCase7 ? 3 : 0}));
} catch {
  console.error('R4 local fixture setup failed. No credentials or response bodies logged.');
  process.exitCode = 1;
} finally { api.logout(); }
