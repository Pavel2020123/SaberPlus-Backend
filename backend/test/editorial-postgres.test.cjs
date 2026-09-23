const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');

let db, peer, catalog, lessons, index, reclassify, review, lockEditorialArea;
before(async () => {
  if (!process.env.EDITORIAL_TEST_OWNER || !process.env.EDITORIAL_TEST_URL)
    throw new Error(
      'Ejecuta npm run test:editorial:postgres; no acepta una base externa.',
    );
  const { validateOwnedConnection } =
    await import('../tool/test_editorial_postgres.mjs');
  validateOwnedConnection(
    process.env.EDITORIAL_TEST_URL,
    JSON.parse(await readFile(process.env.EDITORIAL_TEST_OWNER, 'utf8')),
  );
  require('ts-node').register({
    transpileOnly: true,
    project: 'tsconfig.json',
  });
  const { PrismaService } = require('../src/prisma/prisma.service.ts');
  db = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  peer = new PrismaService({
    datasources: { db: { url: process.env.EDITORIAL_TEST_URL } },
  });
  await Promise.all([db.$connect(), peer.$connect()]);
  const {
    AcademicCatalogService,
  } = require('../src/admin/academic-catalog.service.ts');
  const {
    LessonEditorService,
  } = require('../src/admin/lesson-editor.service.ts');
  const {
    LegacyQuestionIndexService,
  } = require('../src/admin/legacy-question-index.service.ts');
  const {
    QuestionReclassificationService,
  } = require('../src/admin/question-reclassification.service.ts');
  const {
    EditorialReviewService,
  } = require('../src/admin/editorial-review.service.ts');
  ({ lockEditorialArea } = require('../src/admin/editorial-lock.ts'));
  catalog = new AcademicCatalogService(db);
  lessons = new LessonEditorService(db);
  index = new LegacyQuestionIndexService(db);
  reclassify = new QuestionReclassificationService(db);
  review = new EditorialReviewService(db);
  for (const key of [
    'EDITORIAL_LEGACY_INDEX_ENABLED',
    'EDITORIAL_RECLASSIFICATION_ENABLED',
    'EDITORIAL_PUBLICATION_ENABLED',
  ])
    process.env[key] = 'true';
});
after(async () => {
  await Promise.all([db?.$disconnect(), peer?.$disconnect()]);
});
async function structure(area = 'MATEMATICAS') {
  const theme = await catalog.crearTema(`Tema de ensayo ${randomUUID()}`, area);
  const source = await catalog.crearSubtema('Subtema origen', theme.id);
  const destination = await catalog.crearSubtema('Subtema destino', theme.id);
  return { theme, source, destination };
}
async function question(
  subtemaId,
  enunciado = '¿Cuánto es dos más dos?',
  extra = {},
) {
  return db.pregunta.create({
    data: {
      subtemaId,
      enunciado,
      explicacion: 'La suma es cuatro.',
      ...extra,
      respuestas: {
        create: [
          { texto: '4', esCorrecta: true },
          { texto: '5', esCorrecta: false },
        ],
      },
    },
  });
}
const cloze = {
  textoConEspacios: 'Dos más dos es ___.',
  espacios: [{ opciones: ['4', '5'], correctaIndex: 0 }],
};

test('guardado simple publica, versiona preguntas y revierte errores sin alterar historial', async () => {
  const { QuestionEditorService } = require('../src/admin/question-editor.service.ts');
  const questions = new QuestionEditorService(db);
  const theme = await catalog.crearTema(`Directo ${randomUUID()}`, 'MATEMATICAS', true);
  const sub = await catalog.crearSubtema('Sumas directas', theme.id, true);
  assert.equal(theme.estadoContenido, 'PUBLICADO');
  assert.equal(sub.estadoContenido, 'PUBLICADO');
  const detail = await lessons.detalle('subtemas', sub.id, true);
  const saved = await lessons.guardar(sub.id, detail.revision, 'Explicación con ejemplo.', '', '', true);
  assert.equal(saved.estadoContenido, 'PUBLICADO');
  const body = { subtemaId: sub.id, enunciado: `Suma ${randomUUID()}`, explicacion: 'Tres más tres es seis.', dificultad: 'BASICO', imagenUrl: '', casoId: '', respuestas: [
    { texto: '6', esCorrecta: true, explicacion: '' }, { texto: '9', esCorrecta: false, explicacion: '' },
  ] };
  const first = await questions.guardarPregunta(body, undefined, true);
  const oldOptions = await db.respuesta.findMany({ where: { preguntaId: first.id }, orderBy: { id: 'asc' } });
  const result = await questions.guardarPregunta({ ...body, revision: first.revision, explicacion: 'Corregida.' }, first.id, true);
  assert.notEqual(result.id, first.id);
  assert.equal(result.reemplazaId, first.id);
  assert.equal(result.estadoContenido, 'PUBLICADO');
  assert.equal((await questions.detallePregunta(first.id, true)).estadoContenido, 'ARCHIVADO');
  assert.deepEqual(await db.respuesta.findMany({ where: { preguntaId: first.id }, orderBy: { id: 'asc' } }), oldOptions);
  assert.deepEqual((await questions.preguntas(sub.id, 1, 20, true)).items.map((r) => r.id), [result.id]);
  await assert.rejects(questions.guardarPregunta({ ...body, revision: first.revision }, first.id, true));
  await assert.rejects(questions.guardarPregunta(body, undefined, true), (e) => e.getStatus() === 409);
  assert.equal((await questions.detallePregunta(result.id, true)).estadoContenido, 'PUBLICADO');
  const empty = await catalog.crearSubtema('Vacío eliminable', theme.id, true);
  const emptyDetail = await lessons.detalle('subtemas', empty.id, true);
  await lessons.eliminar('subtemas', empty.id, emptyDetail.revision, true, true);
  assert.equal(await db.subtema.findUnique({ where: { id: empty.id } }), null);
  const pending = await catalog.crearSubtema('Pendiente inválido', theme.id);
  await db.subtema.update({ where: { id: pending.id }, data: { imagenUrl: 'javascript:alert(1)' } });
  await assert.rejects(questions.guardarPregunta({ ...body, subtemaId: pending.id, enunciado: randomUUID() }, undefined, true));
  assert.equal((await db.subtema.findUnique({ where: { id: pending.id } })).estadoContenido, 'BORRADOR');
  assert.equal(await db.pregunta.count({ where: { subtemaId: pending.id } }), 0);
  const flag = process.env.EDITORIAL_PUBLICATION_ENABLED;
  try {
    process.env.EDITORIAL_PUBLICATION_ENABLED = 'false';
    await assert.rejects(questions.guardarPregunta(body, undefined, true), (e) => e.getStatus() === 503);
  } finally { process.env.EDITORIAL_PUBLICATION_ENABLED = flag; }
});

test('catálogo concurrente: solo un tema equivalente queda guardado', async () => {
  const name = `Álgebra de ensayo ${randomUUID()}`;
  const results = await Promise.allSettled([
    catalog.crearTema(name, 'MATEMATICAS'),
    catalog.crearTema(name.toUpperCase(), 'MATEMATICAS'),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
});
test('CLOZE: dos escrituras con igual revisión no se sobrescriben; retiro usa SQL NULL', async () => {
  const { source } = await structure();
  const before = await lessons.detalleCloze(source.id);
  const writes = await Promise.allSettled([
    lessons.guardarCloze(source.id, before.revision, cloze),
    lessons.guardarCloze(source.id, before.revision, {
      ...cloze,
      textoConEspacios: 'Completa la suma ___.',
    }),
  ]);
  assert.equal(writes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    writes.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  const saved = await lessons.detalleCloze(source.id);
  await lessons.quitarCloze(source.id, saved.revision, true);
  const rows =
    await db.$queryRaw`SELECT "datosInteractivo" IS NULL AS cleared FROM "Subtema" WHERE id = ${source.id}`;
  assert.equal(rows[0].cleared, true);
});
test('bloqueo por área espera otra transacción y relee el padre después del bloqueo', async () => {
  const { source, theme } = await structure();
  const before = await lessons.detalleCloze(source.id);
  let release, acquired;
  const ready = new Promise((resolve) => {
    acquired = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const holding = peer.$transaction(
    async (tx) => {
      await lockEditorialArea(tx, 'MATEMATICAS');
      await tx.tema.update({
        where: { id: theme.id },
        data: { estadoContenido: 'ARCHIVADO' },
      });
      acquired();
      await gate;
    },
    { timeout: 15000 },
  );
  await ready;
  const writing = lessons.guardarCloze(source.id, before.revision, cloze);
  // Observe the actual PostgreSQL wait, not an assumed delay or mocked lock.
  let waiting = false;
  try {
    for (let n = 0; n < 100; n++) {
      const rows =
        await peer.$queryRaw`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE wait_event = 'advisory' AND datname = current_database()`;
      if (rows[0].count > 0) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    release();
  }
  await holding;
  await assert.rejects(writing, (e) => e.getStatus() === 409);
  assert.equal(waiting, true);
  assert.equal(
    (await db.subtema.findUnique({ where: { id: source.id } })).tipoInteractivo,
    null,
  );
});
test('indexación SQL conserva microsegundos y solo procesa el lote revisado una vez', async () => {
  const { source } = await structure('INGLES');
  const first = await question(source.id),
    second = await question(source.id);
  await db.$executeRaw`UPDATE "Pregunta" SET "fechaActualizacion" = TIMESTAMP '2026-09-08 10:20:30.123456' WHERE id = ${first.id}`;
  const before = await index.preview({ area: 'INGLES', limite: 100 });
  const results = await Promise.allSettled([
    index.apply({ ...before, confirmado: true }),
    index.apply({ ...before, confirmado: true }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  const dates =
    await db.$queryRaw`SELECT to_char("fechaActualizacion", 'YYYY-MM-DD HH24:MI:SS.US') AS stamp FROM "Pregunta" WHERE id = ${first.id}`;
  assert.equal(dates[0].stamp, '2026-09-08 10:20:30.123456');
  const groups = await index.duplicates({ area: 'INGLES', limite: 1 });
  assert.equal(groups.items[0].cantidad, 2);
  const matches = await index.matches(groups.items[0].huella, {
    area: 'INGLES',
    limite: 1,
  });
  assert.equal(matches.hayMas, true);
  const next = await index.matches(groups.items[0].huella, {
    area: 'INGLES',
    limite: 1,
    despues: matches.siguiente,
  });
  assert.deepEqual(
    new Set([matches.items[0].id, next.items[0].id]),
    new Set([first.id, second.id]),
  );
});
test('fallo SQL en mitad de indexación revierte también la primera huella del lote', async () => {
  const { source } = await structure('CIENCIAS_NATURALES');
  await question(source.id, 'Pregunta uno', { id: 'rollback-a' });
  await question(source.id, 'Pregunta dos', { id: 'rollback-b' });
  const batch = await index.preview({
    area: 'CIENCIAS_NATURALES',
    limite: 100,
  });
  await db.$executeRawUnsafe(
    `CREATE FUNCTION editorial_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = 'rollback-b' THEN RAISE EXCEPTION 'Fallo controlado de ensayo'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    `CREATE TRIGGER editorial_test_fail BEFORE UPDATE OF "huellaContenido" ON "Pregunta" FOR EACH ROW EXECUTE FUNCTION editorial_test_fail()`,
  );
  try {
    await assert.rejects(index.apply({ ...batch, confirmado: true }));
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER editorial_test_fail ON "Pregunta"',
    );
    await db.$executeRawUnsafe('DROP FUNCTION editorial_test_fail()');
  }
  assert.equal(
    await db.pregunta.count({
      where: { subtemaId: source.id, huellaContenido: null },
    }),
    2,
  );
});
test('reclasificación ejecuta consultas de uso y conserva opciones y publicación', async () => {
  const { source, destination } = await structure();
  const q = await question(source.id);
  const options = await db.respuesta.findMany({
    where: { preguntaId: q.id },
    orderBy: { id: 'asc' },
  });
  const before = await reclassify.preview(q.id, destination.id);
  assert.equal(before.puedeReclasificar, true);
  const results = await Promise.allSettled([
    reclassify.apply(q.id, {
      destinoSubtemaId: destination.id,
      revision: before.revision,
      confirmado: true,
    }),
    reclassify.apply(q.id, {
      destinoSubtemaId: destination.id,
      revision: before.revision,
      confirmado: true,
    }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    409,
  );
  assert.deepEqual(
    await db.respuesta.findMany({
      where: { preguntaId: q.id },
      orderBy: { id: 'asc' },
    }),
    options,
  );
  assert.equal(
    (await db.pregunta.findUnique({ where: { id: q.id } })).estadoContenido,
    'BORRADOR',
  );
});
test('referencias JSON de diagnóstico y simulacro impiden mover preguntas', async () => {
  const { source, destination } = await structure();
  const student = await db.usuario.create({
    data: {
      nombre: 'Ensayo temporal',
      correo: `${randomUUID()}@example.invalid`,
      contrasenaHash: 'no-es-una-cuenta-real',
    },
  });
  for (const tipo of ['diagnostico', 'simulacro']) {
    const q = await question(source.id);
    if (tipo === 'diagnostico')
      await db.diagnosticoInicial.create({
        data: {
          usuarioId: student.id,
          preguntaIds: [q.id],
          completadoEn: new Date(),
        },
      });
    else
      await db.intentoSimulacro.create({
        data: {
          usuarioId: student.id,
          preguntaIds: [q.id],
          origen: 'SIMULACRO',
          expira: new Date('2020-01-01'),
        },
      });
    const preview = await reclassify.preview(q.id, destination.id);
    assert.equal(preview.puedeReclasificar, false);
    assert.ok(preview.bloqueos.some((v) => v.includes('uso académico')));
    await assert.rejects(
      reclassify.apply(q.id, {
        destinoSubtemaId: destination.id,
        revision: preview.revision,
        confirmado: true,
      }),
    );
  }
});
test('publicación revisa CLOZE persistido; archivado no habilita editar historial', async () => {
  const { source, theme } = await structure();
  let parent = await review.detalle('temas', theme.id);
  parent = await review.cambiar(
    'temas',
    theme.id,
    parent.revision,
    'EN_REVISION',
  );
  await review.cambiar('temas', theme.id, parent.revision, 'PUBLICADO');
  const row = await lessons.detalleCloze(source.id);
  await lessons.guardarCloze(source.id, row.revision, cloze);
  let detail = await review.detalle('subtemas', source.id);
  detail = await review.cambiar(
    'subtemas',
    source.id,
    detail.revision,
    'EN_REVISION',
  );
  detail = await review.cambiar(
    'subtemas',
    source.id,
    detail.revision,
    'PUBLICADO',
  );
  const published = (await db.subtema.findUnique({ where: { id: source.id } }))
    .fechaPublicacion;
  detail = await review.cambiar(
    'subtemas',
    source.id,
    detail.revision,
    'ARCHIVADO',
  );
  await review.cambiar('subtemas', source.id, detail.revision, 'BORRADOR');
  assert.equal((await lessons.detalleCloze(source.id)).editable, false);
  assert.deepEqual(
    (await db.subtema.findUnique({ where: { id: source.id } }))
      .fechaPublicacion,
    published,
  );
});
test('gates apagados impiden escribir también con conexión PostgreSQL real', async () => {
  const { source, destination, theme } = await structure('SOCIALES_CIUDADANAS');
  const q = await question(source.id);
  const batch = await index.preview({
    area: 'SOCIALES_CIUDADANAS',
    limite: 25,
  });
  const move = await reclassify.preview(q.id, destination.id);
  const detail = await review.detalle('temas', theme.id);
  const keys = [
    'EDITORIAL_LEGACY_INDEX_ENABLED',
    'EDITORIAL_RECLASSIFICATION_ENABLED',
    'EDITORIAL_PUBLICATION_ENABLED',
  ];
  keys.forEach((key) => {
    process.env[key] = 'false';
  });
  try {
    await assert.rejects(
      index.apply({ ...batch, confirmado: true }),
      (e) => e.getStatus() === 503,
    );
    await assert.rejects(
      reclassify.apply(q.id, {
        destinoSubtemaId: destination.id,
        revision: move.revision,
        confirmado: true,
      }),
      (e) => e.getStatus() === 503,
    );
    await assert.rejects(
      review.cambiar('temas', theme.id, detail.revision, 'EN_REVISION'),
      (e) => e.getStatus() === 503,
    );
    const unchanged = await db.pregunta.findUnique({ where: { id: q.id } });
    assert.equal(unchanged.huellaContenido, null);
    assert.equal(unchanged.subtemaId, source.id);
    assert.equal(
      (await db.tema.findUnique({ where: { id: theme.id } })).estadoContenido,
      'BORRADOR',
    );
  } finally {
    keys.forEach((key) => {
      process.env[key] = 'true';
    });
  }
});
test('eliminación real protege hijos, contenido y revisiones; no borra en cascada', async () => {
  const { theme, source, destination } = await structure();
  let detail = await lessons.detalle('temas', theme.id);
  assert.equal(detail.eliminable, false);
  await assert.rejects(
    lessons.eliminar('temas', theme.id, detail.revision, true),
    (e) => e.getStatus() === 400,
  );
  assert.equal(await db.subtema.count({ where: { temaId: theme.id } }), 2);
  const before = await lessons.detalle('subtemas', source.id);
  await lessons.guardar(source.id, before.revision, 'Lección nueva', '', '');
  await assert.rejects(
    lessons.eliminar('subtemas', source.id, before.revision, true),
    (e) => e.getStatus() === 409,
  );
  detail = await lessons.detalle('subtemas', source.id);
  await assert.rejects(
    lessons.eliminar('subtemas', source.id, detail.revision, true),
    (e) => e.getStatus() === 400,
  );
  // Remove only newly created empty fixtures; never the nonempty sibling.
  const empty = await lessons.detalle('subtemas', destination.id);
  const results = await Promise.allSettled([
    lessons.eliminar('subtemas', destination.id, empty.revision, true),
    lessons.eliminar('subtemas', destination.id, empty.revision, true),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.getStatus(),
    404,
  );
  assert.equal(await db.subtema.count({ where: { temaId: theme.id } }), 1);
  assert.equal(
    (await db.subtema.findUnique({ where: { id: source.id } })).contenido,
    'Lección nueva',
  );
  const emptyTheme = await catalog.crearTema(`Vacío ${randomUUID()}`, 'INGLES');
  const preview = await lessons.detalle('temas', emptyTheme.id);
  await lessons.eliminar('temas', emptyTheme.id, preview.revision, true);
  assert.equal(
    await db.tema.findUnique({ where: { id: emptyTheme.id } }),
    null,
  );
});

test('eliminación relee hijos creados mientras esperaba el bloqueo de área', async () => {
  const theme = await catalog.crearTema(
    `Concurrencia ${randomUUID()}`,
    'INGLES',
  );
  const preview = await lessons.detalle('temas', theme.id);
  let release, signal;
  const ready = new Promise((resolve) => {
    signal = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const holding = peer.$transaction(
    async (tx) => {
      await lockEditorialArea(tx, 'INGLES');
      await tx.subtema.create({
        data: { nombre: 'Hijo concurrente', temaId: theme.id },
      });
      signal();
      await gate;
    },
    { timeout: 10000 },
  );
  await ready;
  const deleting = lessons.eliminar('temas', theme.id, preview.revision, true);
  // Attach the rejection handler immediately while observing the lock.
  const rejected = assert.rejects(deleting, (e) => e.getStatus() === 409);
  let waiting = false;
  try {
    for (let n = 0; n < 100; n++) {
      const rows =
        await peer.$queryRaw`SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE wait_event = 'advisory' AND datname = current_database()`;
      if (rows[0].count > 0) {
        waiting = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  } finally {
    release();
  }
  await holding;
  await rejected;
  assert.equal(waiting, true);
  assert.equal(await db.subtema.count({ where: { temaId: theme.id } }), 1);
  assert.ok(await db.tema.findUnique({ where: { id: theme.id } }));
});

test('consulta JSON de Guardián bloquea el uso en su tabla versionada', async () => {
  const { source, destination } = await structure();
  const q = await question(source.id);
  const user = await db.usuario.create({ data: {
    nombre: 'Ensayo Guardián', correo: `guardian-${randomUUID()}@example.invalid`, contrasenaHash: 'fixture-no-login',
  } });
  try {
    await db.intentoGuardian.create({ data: {
      usuarioId: user.id, area: 'MATEMATICAS', dificultad: 'BASICO',
      preguntas: [{ question: { id: q.id } }], venceEn: new Date(Date.now() + 60000),
    } });
    const preview = await reclassify.preview(q.id, destination.id);
    assert.equal(preview.puedeReclasificar, false);
    assert.ok(preview.bloqueos.some((v) => v.includes('uso académico')));
  } finally {
    await db.usuario.delete({ where: { id: user.id } });
  }
});
