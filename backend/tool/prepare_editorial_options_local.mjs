// C2-D: fixtures only in the owned disposable API. No external DB/arguments.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { validateCompetitiveDatabase } from './test_competitive_postgres.mjs';
import { CatalogApi } from '../../admin/public/api.mjs';

async function main() {
  assert.equal(process.argv.length, 2);
  const directory = await realpath(
    process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session',
  );
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const owner = JSON.parse(
    await readFile(join(directory, 'owner.json'), 'utf8'),
  );
  validateCompetitiveDatabase(owner.url, owner);
  assert.match(owner.nonce, /^[0-9a-f]{16}$/);
  const run = promisify(execFile);
  const context = (
    await run('docker', ['context', 'show'], { windowsHide: true })
  ).stdout.trim();
  const endpoint = (
    await run(
      'docker',
      ['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'],
      { windowsHide: true },
    )
  ).stdout.trim();
  assert.ok(
    endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'),
  );
  const labels = JSON.parse(
    (
      await run(
        'docker',
        [
          '--context',
          context,
          'inspect',
          '--format',
          '{{json .Config.Labels}}',
          `saberplus-i2-local-${owner.nonce}`,
        ],
        { windowsHide: true },
      )
    ).stdout,
  );
  assert.equal(labels['saberplus-competitive-disposable-v1'], owner.nonce);
  const config = JSON.parse(
    await readFile(join(directory, 'flutter-private.json'), 'utf8'),
  );
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  // Android needs endpoints, never the fixture login/password used by tests.
  await writeFile(
    join(directory, 'flutter-app.json'),
    JSON.stringify({
      APP_ENV: 'dev',
      DEMO_MODE: 'false',
      API_BASE_URL: config.API_BASE_URL,
      CONTENT_BASE_URL: config.API_BASE_URL,
      LOCAL_RANKING_SEASON: config.LOCAL_RANKING_SEASON,
      LOCAL_RANKING_ENABLED: 'true',
    }),
    { mode: 0o600 },
  );
  const manifestPath = join(directory, 'editorial-options-fixture.json');
  try {
    const existing = JSON.parse(await readFile(manifestPath, 'utf8'));
    assert.equal(existing.nonce, owner.nonce);
    console.log(
      JSON.stringify({
        phase: 'c2d-fixture-existing',
        theme: existing.themeName,
      }),
    );
    return;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const api = new CatalogApi(config.API_BASE_URL, { simple: true });
  try {
    await api.login('admin@example.invalid', config.AUTH_E2E_PASSWORD);
    const images = [];
    for (const figure of [
      {
        name: 'Rectángulo azul horizontal',
        width: 160,
        height: 80,
        color: '#236fe8',
      },
      {
        name: 'Rectángulo naranja vertical',
        width: 80,
        height: 160,
        color: '#ed8b24',
      },
    ]) {
      const bytes = await sharp({
        create: {
          width: figure.width,
          height: figure.height,
          channels: 3,
          background: figure.color,
        },
      })
        .png()
        .toBuffer();
      const file = await api.uploadEditorialFile(
        new Blob([bytes], { type: 'image/png' }),
        {
          titulo: figure.name,
          textoAlternativo: figure.name,
          fuente: 'Figura sintética de ensayo C2-D',
          titular: 'Equipo SaberPlus',
          autorizacion: 'ORIGINAL',
        },
        randomUUID(),
      );
      images.push(`/recursos/editoriales/${file.id}`);
      await writeFile(
        join(
          directory,
          images.length === 1 ? 'opcion-azul.png' : 'opcion-naranja.png',
        ),
        bytes,
      );
    }
    const themeName = `Opciones C2-D - ensayo ${owner.nonce.slice(0, 8)}`;
    const theme = await api.create('temas', 'MATEMATICAS', themeName);
    const subtheme = await api.create(
      'subtemas',
      theme.id,
      'Opciones con imágenes',
    );
    const lesson = await api.editor('subtemas', subtheme.id, theme.id);
    await api.editor('subtemas', subtheme.id, theme.id, {
      revision: lesson.revision,
      contenido:
        '# Ensayo de opciones\n\nLa figura azul tiene ancho doble que altura. La naranja tiene altura doble que ancho.',
      imagenUrl: '',
      videoUrl: '',
    });
    const questions = [];
    for (let n = 1; n <= 12; n++) {
      const question = await api.bankRecord('preguntas', subtheme.id, null, {
        subtemaId: subtheme.id,
        enunciado: `Ensayo C2-D ${n}: ¿qué figura tiene el ancho doble de su altura?`,
        explicacion:
          'La azul mide 160 de ancho y 80 de alto: 160 ÷ 80 = 2. La naranja mide 80 de ancho y 160 de alto.',
        dificultad: 'BASICO',
        imagenUrl: '',
        casoId: '',
        respuestas: [
          {
            texto: 'Rectángulo azul horizontal',
            imagenUrl: images[0],
            esCorrecta: true,
            explicacion: '',
          },
          {
            texto: 'Rectángulo naranja vertical',
            imagenUrl: images[1],
            esCorrecta: false,
            explicacion: '',
          },
          {
            texto: 'Ambas figuras tienen ancho doble',
            imagenUrl: '',
            esCorrecta: false,
            explicacion: '',
          },
          {
            texto: 'Ninguna de las dos figuras',
            imagenUrl: '',
            esCorrecta: false,
            explicacion: '',
          },
        ],
      });
      questions.push(question.id);
    }
    const saved = await api.bankRecord('preguntas', subtheme.id, questions[0]);
    assert.equal(saved.respuestas.length, 4);
    assert.equal(
      saved.respuestas.filter((answer) => images.includes(answer.imagenUrl))
        .length,
      2,
    );
    await writeFile(
      manifestPath,
      JSON.stringify({
        version: 1,
        nonce: owner.nonce,
        themeName,
        themeId: theme.id,
        subthemeId: subtheme.id,
        questionIds: questions,
        images,
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        phase: 'c2d-fixture-ready',
        directory,
        theme: themeName,
        questions: questions.length,
        options: 4,
        illustratedOptions: 2,
        savedAndReloaded: true,
        androidTested: false,
      }),
    );
  } finally {
    api.logout();
  }
}
main().catch(() => {
  console.error(
    'No se pudo preparar C2-D. Revisar la sesión propia y su opt-in; detalles privados omitidos.',
  );
  process.exitCode = 1;
});
