// C5-C1: synthetic content only in the running, owned local Docker session.
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
  assert.equal(
    process.argv.length,
    2,
    'No se admiten URLs ni contraseñas por argumento.',
  );
  const directory = await realpath(
    process.env.SABERPLUS_LOCAL_SESSION || 'missing-owned-session',
  );
  assert.equal(dirname(directory), await realpath(tmpdir()));
  assert.ok(basename(directory).startsWith('saberplus-i2-local-'));
  const marker = JSON.parse(
    await readFile(join(directory, 'owner.json'), 'utf8'),
  );
  validateCompetitiveDatabase(marker.url, marker);
  assert.match(marker.nonce, /^[0-9a-f]{16}$/);
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
          `saberplus-i2-local-${marker.nonce}`,
        ],
        { windowsHide: true },
      )
    ).stdout,
  );
  assert.equal(labels['saberplus-competitive-disposable-v1'], marker.nonce);
  const config = JSON.parse(
    await readFile(join(directory, 'flutter-private.json'), 'utf8'),
  );
  assert.equal(config.API_BASE_URL, 'http://127.0.0.1:43187');
  const manifest = join(directory, 'editorial-images-fixture.json');
  // Do not accidentally create duplicate content when resuming the same session.
  try {
    const existing = JSON.parse(await readFile(manifest, 'utf8'));
    assert.equal(existing.nonce, marker.nonce);
    console.log(
      JSON.stringify({
        phase: 'c5c-fixture-existing',
        directory,
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
    const image = await sharp({
      create: { width: 120, height: 60, channels: 3, background: '#236fe8' },
    })
      .png()
      .toBuffer();
    const metadata = {
      titulo: 'Rectángulo azul C5',
      textoAlternativo: 'Rectángulo azul horizontal de proporción dos a uno',
      fuente: 'Figura sintética de ensayo C5',
      titular: 'Equipo SaberPlus',
      autorizacion: 'ORIGINAL',
    };
    const uploaded = await api.uploadEditorialFile(
      new Blob([image], { type: 'image/png' }),
      metadata,
      randomUUID(),
    );
    const unlinked = await api.uploadEditorialFile(
      new Blob([image], { type: 'image/png' }),
      metadata,
      randomUUID(),
    );
    const path = `/recursos/editoriales/${uploaded.id}`;
    const themeName = `Imágenes C5 - ensayo ${marker.nonce.slice(0, 8)}`;
    const theme = await api.create('temas', 'MATEMATICAS', themeName);
    const subtheme = await api.create(
      'subtemas',
      theme.id,
      'Rectángulos y proporciones',
    );
    const lesson = await api.editor('subtemas', subtheme.id, theme.id);
    await api.editor('subtemas', subtheme.id, theme.id, {
      revision: lesson.revision,
      contenido:
        '# Figura de ensayo C5\n\nEl ancho del rectángulo azul es el doble de su altura. Esta imagen debe mantenerse horizontal sin estirarse.',
      imagenUrl: path,
      videoUrl: '',
    });
    const question = await api.bankRecord('preguntas', subtheme.id, null, {
      subtemaId: subtheme.id,
      enunciado:
        'Observa el rectángulo azul. ¿Cuántas veces cabe su altura en su ancho?',
      explicacion:
        'La figura mide 120 por 60, por lo tanto el ancho es dos veces la altura.',
      dificultad: 'BASICO',
      imagenUrl: path,
      casoId: '',
      respuestas: [
        { texto: '2 veces', esCorrecta: true, explicacion: '' },
        { texto: '3 veces', esCorrecta: false, explicacion: '' },
      ],
    });
    await writeFile(
      manifest,
      JSON.stringify({
        version: 1,
        nonce: marker.nonce,
        api: config.API_BASE_URL,
        themeId: theme.id,
        themeName,
        subthemeId: subtheme.id,
        questionId: question.id,
        imagePath: path,
        unpublishedPath: `/recursos/editoriales/${unlinked.id}`,
        width: 120,
        height: 60,
      }),
      { mode: 0o600 },
    );
    console.log(
      JSON.stringify({
        phase: 'c5c-fixture-ready',
        directory,
        theme: themeName,
        published: true,
        androidTested: false,
      }),
    );
  } finally {
    api.logout();
  }
}

main().catch(() => {
  console.error(
    'No se pudo preparar C5-C1. Detalles privados omitidos; comprobar sesión local propia.',
  );
  process.exitCode = 1;
});
