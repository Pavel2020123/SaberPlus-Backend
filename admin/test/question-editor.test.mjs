import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";
import {
  questionFields,
  caseFields,
  questionCanonical,
} from "../public/question-fields.mjs";
import { QuestionEditor } from "../public/question-editor.mjs";

const draft = () => ({
  subtemaId: "demo-s2",
  enunciado: "¿Cuánto es el 20 % de 50?",
  explicacion: "50 por 20 dividido entre 100 es 10.",
  dificultad: "BASICO",
  imagenUrl: "",
  casoId: "",
  respuestas: [
    { texto: "10", esCorrecta: true, explicacion: "" },
    {
      texto: "20",
      esCorrecta: false,
      explicacion: "Es el porcentaje, no el resultado.",
    },
  ],
});
async function serve(t) {
  const server = createAdminServer({ demo: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const api = new CatalogApi(`${base}/api`);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  return { api, base };
}

test("demo: crear, consultar y editar pregunta; duplicados y versión vieja no escriben", async (t) => {
  const { api } = await serve(t);
  const created = await api.bankRecord("preguntas", "demo-s2", null, draft());
  assert.equal(created.estadoContenido, "BORRADOR");
  assert.equal(created.editable, true);
  assert.equal((await api.bankPage("preguntas", "demo-s2")).items.length, 1);
  assert.deepEqual(
    await api.bankRecord("preguntas", "demo-s2", created.id),
    created,
  );
  const modified = await api.bankRecord("preguntas", "demo-s2", created.id, {
    ...draft(),
    revision: created.revision,
    explicacion: "Nueva explicación",
  });
  assert.equal(modified.explicacion, "Nueva explicación");
  await assert.rejects(
    api.bankRecord("preguntas", "demo-s2", created.id, {
      ...draft(),
      revision: created.revision,
    }),
    /registro cambió/,
  );
  const other = draft();
  other.respuestas.reverse();
  other.enunciado = "  ¿CUÁNTO ES EL 20 % DE 50? ";
  await assert.rejects(
    api.bankRecord("preguntas", "demo-s2", null, other),
    (error) => error.status === 409 && error.message.includes(created.id),
  );
  assert.equal((await api.bankPage("preguntas", "demo-s2")).items.length, 1);
});

test("demo: caso editable antes de asociar; misma área y orden exclusivo; se puede desvincular", async (t) => {
  const { api } = await serve(t);
  let caso = await api.bankRecord("casos", "MATEMATICAS", null, {
    area: "MATEMATICAS",
    titulo: "Descuentos",
    contexto: "Hay descuentos en una tienda.",
    imagenUrl: "https://example.com/a.png",
  });
  caso = await api.bankRecord("casos", caso.area, caso.id, {
    ...caso,
    titulo: "Descuentos de temporada",
  });
  const question = await api.bankRecord("preguntas", "demo-s2", null, {
    ...draft(),
    casoId: caso.id,
    ordenEnCaso: 1,
  });
  const used = await api.bankRecord("casos", caso.area, caso.id);
  assert.equal(used.editable, false);
  await assert.rejects(
    api.bankRecord("casos", caso.area, caso.id, {
      ...used,
      contexto: "No cambiar",
    }),
    (error) => error.status === 400,
  );
  await assert.rejects(
    api.bankRecord("preguntas", "demo-s2", null, {
      ...draft(),
      enunciado: "Pregunta distinta",
      casoId: caso.id,
      ordenEnCaso: 1,
    }),
    /orden ya está ocupado/,
  );
  const otherCase = await api.bankRecord("casos", "INGLES", null, {
    area: "INGLES",
    titulo: "Reading",
    contexto: "A short text",
    imagenUrl: "",
  });
  await assert.rejects(
    api.bankRecord("preguntas", "demo-s2", null, {
      ...draft(),
      casoId: otherCase.id,
      ordenEnCaso: 1,
    }),
    (error) => error.status === 400,
  );
  const unlinked = await api.bankRecord("preguntas", "demo-s2", question.id, {
    ...draft(),
    revision: question.revision,
  });
  assert.equal(unlinked.casoId, "");
  assert.equal(unlinked.ordenEnCaso, null);
});

test("casos paginados y detalles protegidos contra padres incorrectos y sesión ausente", async (t) => {
  const { api, base } = await serve(t);
  for (let i = 0; i < 21; i++)
    await api.bankRecord("casos", "INGLES", null, {
      area: "INGLES",
      titulo: `Caso ${i}`,
      contexto: "Texto autorizado.",
      imagenUrl: "",
    });
  const first = await api.bankPage("casos", "INGLES"),
    second = await api.bankPage("casos", "INGLES", 2);
  assert.equal(first.items.length, 20);
  assert.equal(first.hayMas, true);
  assert.equal(second.items.length, 1);
  await assert.rejects(
    api.bankRecord("casos", "MATEMATICAS", first.items[0].id),
    /validar/,
  );
  assert.equal((await fetch(`${base}/api/admin/editor/casos`)).status, 401);
  for (const asset of ["question-editor.mjs", "question-fields.mjs"])
    assert.equal((await fetch(`${base}/${asset}`)).status, 200);
  assert.equal((await fetch(`${base}/demo-question-bank.mjs`)).status, 404);
});

test("valida opciones, explicación, imagen y orden antes de enviar", () => {
  const good = draft();
  assert.deepEqual(questionFields(good), good);
  for (const bad of [
    { ...good, respuestas: [] },
    {
      ...good,
      respuestas: good.respuestas.map((row) => ({ ...row, esCorrecta: true })),
    },
    {
      ...good,
      respuestas: [
        good.respuestas[0],
        { ...good.respuestas[1], texto: " 10 " },
      ],
    },
    { ...good, explicacion: "" },
    { ...good, imagenUrl: "javascript:alert(1)" },
    { ...good, ordenEnCaso: 2 },
    { ...good, casoId: "c1", ordenEnCaso: 0 },
  ])
    assert.throws(() => questionFields(bad));
  assert.throws(() =>
    caseFields({ area: "OTRA", titulo: "t", contexto: "x", imagenUrl: "" }),
  );
  assert.equal(
    questionCanonical("MATEMATICAS", good),
    questionCanonical("MATEMATICAS", {
      ...good,
      respuestas: [...good.respuestas].reverse(),
    }),
  );
});

function harness(api, confirm = () => true) {
  const nodes = new Map();
  const node = () => ({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    children: [],
    focus() {},
    replaceChildren(...children) {
      this.children = children;
    },
    append(...children) {
      this.children.push(...children);
    },
  });
  const doc = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, node());
      return nodes.get(id);
    },
    createElement: node,
  };
  let busy = false;
  const editor = new QuestionEditor({
    api,
    doc,
    confirm,
    busy: () => busy,
    setBusy: (value) => (busy = value),
  });
  return { editor, $: (id) => doc.getElementById(id), busy: () => busy };
}
const parent = { id: "demo-s2", area: "MATEMATICAS", nombre: "Porcentajes" };
const page = (kind) => ({
  pagina: 1,
  limite: 20,
  hayMas: false,
  items: [],
  ...(kind === "preguntas"
    ? { subtema: { id: parent.id, area: parent.area, permiteCrear: true } }
    : {}),
});
const record = () => ({
  ...draft(),
  id: "q1",
  revision: "a".repeat(64),
  editable: true,
  caso: null,
  estadoContenido: "BORRADOR",
});

test("editor conserva texto y opciones ante error, confirma descarte y limpia al salir", async () => {
  const h = harness(
    {
      bankPage: async (kind) => page(kind),
      bankRecord: async (kind, parent, id, input) => {
        if (input) throw new Error("Duplicada");
        return record();
      },
    },
    () => false,
  );
  await h.editor.open("preguntas", parent);
  await h.editor.select("q1");
  h.$("bank-text").value = "Mi texto pendiente";
  h.$("bank-text").oninput();
  h.editor.options[0].texto.value = "Mi opción";
  h.editor.options[0].texto.oninput();
  await h.editor.save();
  assert.equal(h.$("bank-text").value, "Mi texto pendiente");
  assert.equal(h.editor.readOptions()[0].texto, "Mi opción");
  assert.match(h.$("bank-message").textContent, /Duplicada/);
  assert.equal(h.editor.close(), false);
  assert.equal(h.busy(), false);
  h.editor.close(true);
  assert.equal(h.editor.dirty, false);
  assert.equal(h.$("bank-text").value, "");
});

test("editor guarda sin publicar, límites de opciones y solo lectura", async () => {
  let saved;
  const h = harness({
    bankPage: async (kind) => page(kind),
    bankRecord: async (kind, parent, id, input) => {
      if (input) saved = input;
      return { ...record(), ...input };
    },
  });
  await h.editor.open("preguntas", parent);
  await h.editor.select("q1");
  h.$("option-add").onclick();
  assert.equal(h.editor.options.length, 3);
  h.$("option-remove").onclick();
  assert.equal(h.editor.options.length, 2);
  await h.editor.save();
  assert.equal(saved.respuestas.length, 2);
  assert.equal(h.editor.dirty, false);
  h.editor.fill({ ...record(), editable: false });
  assert.equal(h.$("bank-save").disabled, true);
  assert.equal(h.editor.options[0].texto.disabled, true);
});

test("editor ignora detalles tardíos y la vista previa no ejecuta HTML", async () => {
  let finish;
  const h = harness({
    bankPage: async (kind) => page(kind),
    bankRecord: () => new Promise((resolve) => (finish = resolve)),
  });
  await h.editor.open("preguntas", parent);
  const pending = h.editor.select("q1");
  h.editor.close(true);
  finish(record());
  await pending;
  assert.equal(h.editor.record, null);
  assert.equal(h.$("bank-editor").hidden, true);
  h.editor.kind = "preguntas";
  h.editor.fill({
    ...record(),
    enunciado: "<img src=x onerror=alert(1)>",
    imagenUrl: "https://example.com/a.png",
  });
  assert.ok(
    h
      .$("bank-preview")
      .children.some(
        (node) => node.textContent === "<img src=x onerror=alert(1)>",
      ),
  );
  const link = h.$("bank-preview").children.find((node) => node.href);
  assert.equal(link.rel, "noopener noreferrer");
});

test("IDs del editor están en HTML y no hay inserción de HTML ni almacenamiento persistente", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../public/question-editor.mjs", import.meta.url),
    "utf8",
  );
  for (const [, id] of source.matchAll(/\$\(["']([^"']+)["']\)/g))
    assert.ok(html.includes(`id="${id}"`), id);
  assert.doesNotMatch(
    source,
    /innerHTML|insertAdjacentHTML|localStorage|sessionStorage/,
  );
});

test("opciones conservan referencias y las huellas distinguen imagen sin alterar texto antiguo", () => {
  const original = draft();
  const illustrated = draft();
  illustrated.respuestas[0].imagenUrl = 'https://example.com/a.png';
  assert.equal(questionFields(illustrated).respuestas[0].imagenUrl, illustrated.respuestas[0].imagenUrl);
  assert.notEqual(questionCanonical('MATEMATICAS', illustrated), questionCanonical('MATEMATICAS', original));
  const reversed = { ...illustrated, respuestas: [...illustrated.respuestas].reverse() };
  assert.equal(questionCanonical('MATEMATICAS', reversed), questionCanonical('MATEMATICAS', illustrated));
  illustrated.respuestas[0].imagenUrl = '';
  assert.equal(questionCanonical('MATEMATICAS', illustrated), questionCanonical('MATEMATICAS', original));
  for (const bad of [null, 'javascript:alert(1)', 'https://user:pass@example.com/a.png']) {
    illustrated.respuestas[0].imagenUrl = bad;
    assert.throws(() => questionFields(illustrated));
  }
});

const optionPng = () => new File([
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yG9sAAAAASUVORK5CYII=', 'base64'),
], 'opcion.png', { type: 'image/png' });
async function imageEditor(extra = {}, confirm = () => true) {
  const h = harness({
    bankPage: async (kind) => ({ ...page(kind), imagenesEnOpcionesHabilitadas: true }),
    bankRecord: async () => ({ ...record(), imagenesEnOpcionesHabilitadas: true }),
    ...extra,
  }, confirm);
  await h.editor.open('preguntas', parent);
  await h.editor.select('q1');
  return h;
}

test("no ofrece selector por opción cuando el backend no lo habilita o se usa demo", async () => {
  const h = harness({ bankPage: async (kind) => page(kind), bankRecord: async () => record() });
  await h.editor.open('preguntas', parent);
  await h.editor.select('q1');
  assert.ok(h.editor.options.every((option) => !option.imageUpload));
  const demo = await imageEditor({ demo: true });
  assert.ok(demo.editor.options.every((option) => !option.imageUpload));
});

test("agregar/quitar otras opciones conserva el archivo elegido y guardar exige subirlo primero", async () => {
  let saves = 0;
  const h = await imageEditor();
  const widget = h.editor.options[0].imageUpload;
  const file = optionPng();
  await widget.select(file);
  assert.equal(h.editor.dirty, true);
  h.$('option-add').onclick();
  assert.equal(h.editor.options[0].imageUpload, widget);
  assert.equal(widget.file, file);
  h.$('option-remove').onclick();
  assert.equal(widget.file, file);
  h.editor.api.bankRecord = async () => { saves++; return record(); };
  await h.editor.save();
  assert.equal(saves, 0);
  assert.match(h.$('bank-message').textContent, /Sube la imagen/);
  h.editor.close(true);
});

test("quitar una opción con carga incierta requiere confirmación y conserva el resto", async () => {
  let accepted = false;
  const h = await imageEditor({}, () => accepted);
  h.$('option-add').onclick();
  const widget = h.editor.options[2].imageUpload;
  await widget.select(optionPng());
  widget.request = { operationId: 'operacion-incierta' };
  h.$('option-remove').onclick();
  assert.equal(h.editor.options.length, 3);
  assert.ok(widget.request);
  accepted = true;
  h.$('option-remove').onclick();
  assert.equal(h.editor.options.length, 2);
  assert.equal(widget.file, null);
  assert.equal(widget.request, null);
  h.editor.close(true);
});

test("editor conserva o quita explícitamente la imagen al guardar sin borrar bytes", async () => {
  let payload;
  const h = await imageEditor({
    bankRecord: async (_kind, _parent, _id, input) => {
      if (input) payload = input;
      const row = { ...record(), imagenesEnOpcionesHabilitadas: true };
      if (!input) row.respuestas[0].imagenUrl = 'https://example.com/a.png';
      return { ...row, ...input };
    },
  });
  assert.equal(h.editor.readOptions()[0].imagenUrl, 'https://example.com/a.png');
  await h.editor.save();
  assert.equal(payload.respuestas[0].imagenUrl, 'https://example.com/a.png');
  h.editor.options[0].imageUpload.clear();
  await h.editor.save();
  assert.equal(payload.respuestas[0].imagenUrl, '');
  assert.equal(payload.respuestas[1].imagenUrl, '');
  h.editor.close(true);
});

test("cerrar o cambiar registro invalida una carga tardía de una opción", async () => {
  let finish;
  const h = await imageEditor({ uploadEditorialFile: () => new Promise((resolve) => { finish = resolve; }) });
  const widget = h.editor.options[0].imageUpload;
  await widget.select(optionPng());
  for (const key of ['titulo','textoAlternativo','fuente','titular']) widget.nodes[key].value = 'Texto autorizado';
  const loading = widget.upload();
  h.editor.close(true);
  finish({ estado: 'DISPONIBLE', id: '2df4f385-fec2-4cb1-89af-91f67a476b52', textoAlternativo: 'Rectángulo' });
  await loading;
  assert.equal(h.editor.options.length, 0);
  assert.equal(h.editor.dirty, false);
  assert.equal(widget.input.value, '');
});
