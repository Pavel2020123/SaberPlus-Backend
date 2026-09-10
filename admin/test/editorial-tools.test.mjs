import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";
import { EditorialTools } from "../public/editorial-tools.mjs";
import {
  clozeFields,
  clozeDetail,
  batchDetail,
  cursorPage,
  reclassificationDetail,
} from "../public/editorial-tool-fields.mjs";

const activity = () => ({
  textoConEspacios: "Dos más dos es ___ y tres más tres es ___.",
  espacios: [
    { opciones: ["4", "5"], correctaIndex: 0 },
    { opciones: ["5", "6"], correctaIndex: 1 },
  ],
});
const selected = { id: "demo-s2", temaId: "demo-t1", nombre: "Porcentajes" };
const area = { id: "MATEMATICAS", nombre: "Matemáticas" };
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
  return { base, api };
}
// DOM logic only: this is deliberately not a browser/layout test.
class Element {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.value = "";
    this.disabled = false;
    this.hidden = false;
    this.ownText = "";
  }
  set textContent(value) {
    this.ownText = String(value);
    this.children = [];
  }
  get textContent() {
    return this.ownText + this.children.map((c) => c.textContent).join("");
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
    this.ownText = "";
  }
  contains(node) {
    return node === this || this.children.some((c) => c.contains(node));
  }
  focus() {
    this.focused = true;
  }
  setAttribute(key, value) {
    this[key] = value;
  }
}
function harness(api, confirm = () => true) {
  const nodes = new Map();
  const doc = {
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, new Element("div"));
      return nodes.get(id);
    },
    createElement: (tag) => new Element(tag),
  };
  let busy = false;
  const tools = new EditorialTools({
    api,
    busy: () => busy,
    setBusy: (v) => {
      busy = v;
    },
    doc,
    confirm,
    onLesson() {},
    onReview() {},
  });
  const all = (root = doc.getElementById("tools-content")) => [
    root,
    ...root.children.flatMap((n) => all(n)),
  ];
  const button = (name) =>
    all().find((n) => n.tagName === "button" && n.textContent === name);
  const field = (label) =>
    all().find((n) => n.tagName === "label" && n.ownText === label)
      ?.children[0];
  return {
    tools,
    doc,
    all,
    button,
    field,
    setBusy: (v) => {
      busy = v;
    },
  };
}

test("demo CLOZE: guardar, revisión con claves, retiro y prosa conservada", async (t) => {
  const { api } = await serve(t);
  const lesson = await api.editor("subtemas", selected.id, selected.temaId);
  await api.editor("subtemas", selected.id, selected.temaId, {
    revision: lesson.revision,
    contenido: "Explicación conservada",
    imagenUrl: "",
    videoUrl: "",
  });
  const before = await api.cloze(selected.id, selected.temaId);
  const saved = await api.cloze(selected.id, selected.temaId, {
    revision: before.revision,
    datosInteractivo: activity(),
  });
  assert.deepEqual(saved.datosInteractivo, activity());
  assert.equal(saved.estadoContenido, "BORRADOR");
  assert.equal(
    (await api.editor("subtemas", selected.id, selected.temaId)).editable,
    false,
  );
  const review = await api.review("subtemas", selected.id);
  assert.ok(review.contenido.includes("1. 4 [CORRECTA]"));
  assert.ok(review.contenido.includes("2. 6 [CORRECTA]"));
  await assert.rejects(
    api.cloze(selected.id, selected.temaId, {
      revision: before.revision,
      datosInteractivo: activity(),
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    api.cloze(selected.id, selected.temaId, {
      revision: saved.revision,
      retirar: true,
      confirmado: "true",
    }),
  );
  const removed = await api.cloze(selected.id, selected.temaId, {
    revision: saved.revision,
    retirar: true,
    confirmado: true,
  });
  assert.equal(removed.datosInteractivo, null);
  assert.equal(removed.contenido, "Explicación conservada");
  assert.equal(
    (await api.editor("subtemas", selected.id, selected.temaId)).editable,
    true,
  );
});
test("demo no modifica CLOZE publicado o sin clasificación y exige sesión", async (t) => {
  const { api, base } = await serve(t);
  for (const [id, parent] of [
    ["demo-s1", "demo-t1"],
    ["demo-legacy-sub", "demo-legacy-theme"],
  ]) {
    const row = await api.cloze(id, parent);
    assert.equal(row.editable, false);
    await assert.rejects(
      api.cloze(id, parent, {
        revision: row.revision,
        datosInteractivo: activity(),
      }),
      (e) => e.status === 400,
    );
  }
  for (const path of [
    "/admin/editor/subtemas/demo-s2/cloze",
    "/admin/editor/legado/indice/lote?area=MATEMATICAS",
    "/admin/editor/reclasificacion/preguntas/demo-legacy-q1?destinoSubtemaId=demo-s2",
  ])
    assert.equal((await fetch(`${base}/api${path}`)).status, 401);
});
test("demo: indexa solo lote revisado, detecta duplicados y conserva preguntas", async (t) => {
  const { api } = await serve(t);
  const before = await api.bankRecord(
    "preguntas",
    "demo-legacy-sub",
    "demo-legacy-q1",
  );
  const first = await api.legacyBatch(area.id, 1);
  assert.equal(first.pendientesEnArea, 2);
  assert.equal(first.hayMas, true);
  const result = await api.legacyBatch(area.id, 1, {
    revision: first.revision,
    confirmado: true,
  });
  assert.equal(result.indexadas, 1);
  assert.equal(result.pendientesEnArea, 1);
  await assert.rejects(
    api.legacyBatch(area.id, 1, { revision: first.revision, confirmado: true }),
    (e) => e.status === 409,
  );
  const second = await api.legacyBatch(area.id, 1);
  assert.equal(second.items[0].coincidenciasIndexadas, 1);
  await api.legacyBatch(area.id, 1, {
    revision: second.revision,
    confirmado: true,
  });
  const groups = await api.legacyReport(area.id);
  assert.equal(groups.items[0].cantidad, 2);
  assert.equal(groups.hayMas, false);
  const matches = await api.legacyReport(area.id, groups.items[0].huella);
  assert.equal(matches.items.length, 2);
  assert.ok(matches.items.some((q) => q.estadoContenido === "ARCHIVADO"));
  const after = await api.bankRecord("preguntas", "demo-legacy-sub", before.id);
  for (const key of ["enunciado", "respuestas", "subtemaId", "estadoContenido"])
    assert.deepEqual(after[key], before[key]);
});
test("demo: reclasifica dentro del área conservando estado y evita revisión repetida", async (t) => {
  const { api } = await serve(t);
  const before = await api.reclassify("demo-legacy-q2", "demo-s2");
  assert.equal(before.origen.generico, true);
  assert.equal(before.puedeReclasificar, true);
  const result = await api.reclassify(before.id, before.destino.subtemaId, {
    revision: before.revision,
    confirmado: true,
  });
  assert.equal(result.origenSubtemaId, "demo-legacy-sub");
  assert.equal(result.pregunta.estadoContenido, "ARCHIVADO");
  await assert.rejects(
    api.reclassify(before.id, "demo-s2", {
      revision: before.revision,
      confirmado: true,
    }),
    (e) => e.status === 409,
  );
  const same = await api.reclassify(before.id, "demo-s2");
  assert.equal(same.puedeReclasificar, false);
  await assert.rejects(api.reclassify("demo-legacy-q1", "demo-s3")); // Cross-area preview rejected by client.
});
test("contrato CLOZE rechaza límites, duplicados, marcadores e índices convertidos", () => {
  assert.deepEqual(clozeFields(activity()), activity());
  for (const value of [
    null,
    {},
    { ...activity(), extra: 1 },
    { ...activity(), textoConEspacios: "___" },
    { ...activity(), textoConEspacios: "____ ___" },
    { ...activity(), espacios: [] },
  ])
    assert.throws(() => clozeFields(value));
  for (const correctaIndex of ["0", true, -1, 2, 1.5, null])
    assert.throws(() =>
      clozeFields({
        textoConEspacios: "___",
        espacios: [{ opciones: ["a", "b"], correctaIndex }],
      }),
    );
  for (const opciones of [
    ["a"],
    ["a", "A"],
    ["Ａ", "a"],
    ["x".repeat(501), "b"],
    [" ", "b"],
    [1, "b"],
  ])
    assert.throws(() =>
      clozeFields({
        textoConEspacios: "___",
        espacios: [{ opciones, correctaIndex: 0 }],
      }),
    );
});
test("contratos rechazan área/padre/destino incorrectos, banderas falsas y cursores incoherentes", async (t) => {
  const { api } = await serve(t);
  const cloze = await api.cloze(selected.id, selected.temaId);
  assert.throws(() => clozeDetail(cloze, selected.id, "other"));
  assert.throws(() =>
    clozeDetail({ ...cloze, editable: "false" }, selected.id, selected.temaId),
  );
  const batch = await api.legacyBatch(area.id);
  assert.throws(() => batchDetail({ ...batch, area: "INGLES" }, area.id, 25));
  assert.throws(() =>
    batchDetail({ ...batch, habilitado: "true" }, area.id, 25),
  );
  const move = await api.reclassify("demo-legacy-q1", "demo-s2");
  assert.throws(() => reclassificationDetail(move, move.id, "other"));
  assert.throws(() =>
    reclassificationDetail({ ...move, habilitado: false }, move.id, "demo-s2"),
  );
  const page = {
    area: area.id,
    items: [{ huella: "a".repeat(64), cantidad: 2 }],
    hayMas: true,
    siguiente: "a".repeat(64),
    pendientesEnArea: 0,
    advertencia: "",
  };
  assert.equal(cursorPage(page, area.id).siguiente, page.siguiente);
  assert.throws(() => cursorPage(page, area.id, undefined, page.siguiente));
  assert.throws(() =>
    cursorPage({ ...page, siguiente: "b".repeat(64) }, area.id),
  );
});
test("formulario CLOZE guarda, conserva el borrador ante error y confirma descarte", async (t) => {
  const { api } = await serve(t);
  const h = harness(api, () => false);
  await h.tools.openCloze(selected);
  const input = h.field("Enunciado con espacios ___");
  input.value = "Completa ___";
  input.oninput();
  const a = h.field("Opción 1 del espacio 1");
  a.value = "10";
  a.oninput();
  const b = h.field("Opción 2 del espacio 1");
  b.value = "20";
  b.oninput();
  const correct = h.field("Respuesta correcta del espacio 1");
  correct.value = "1";
  correct.onchange();
  assert.equal(h.tools.dirty, true);
  assert.equal(h.tools.close(), false);
  await h.tools.saveCloze();
  assert.equal(h.tools.dirty, false);
  const text = h.field("Enunciado con espacios ___");
  text.value = "Otra ___";
  text.oninput();
  api.cloze = async () => {
    throw new Error("Conflicto 409");
  };
  await h.tools.saveCloze();
  assert.equal(h.tools.activity.textoConEspacios, "Otra ___");
  assert.equal(h.tools.dirty, true);
  assert.match(h.doc.getElementById("tools-message").textContent, /409/);
  h.tools.close(true);
  assert.equal(h.tools.dirty, false);
  assert.equal(h.doc.getElementById("tools-content").children.length, 0);
});
test("formulario: retirar requiere confirmación, no reordena la clave al quitar opciones", async (t) => {
  const { api } = await serve(t);
  const h = harness(api, () => false);
  await h.tools.openCloze(selected);
  h.tools.activity = activity();
  await h.tools.saveCloze();
  const revision = h.tools.record.revision;
  await h.tools.saveCloze(true);
  assert.equal(h.tools.record.revision, revision);
  h.button("Añadir opción al espacio 1").onclick();
  h.tools.activity.espacios[0].correctaIndex = 2;
  h.button("Quitar opción 1 del espacio 1").onclick();
  assert.equal(h.tools.activity.espacios[0].correctaIndex, 1);
  assert.equal(h.tools.activity.espacios[0].opciones.length, 2);
  assert.equal(h.button("Quitar opción 1 del espacio 1").disabled, true);
});
test("formulario protege solo lectura y no interpreta HTML ni carga imágenes", async (t) => {
  const { api } = await serve(t);
  const h = harness(api);
  await h.tools.openCloze({
    id: "demo-s1",
    temaId: "demo-t1",
    nombre: "Publicada",
  });
  assert.equal(h.button("Guardar CLOZE en borrador").disabled, true);
  assert.equal(h.field("Enunciado con espacios ___").disabled, true);
  await h.tools.openCloze(selected);
  h.tools.activity = {
    textoConEspacios: "<img src=x onerror=alert(1)> ___",
    espacios: [{ opciones: ["a", "b"], correctaIndex: 0 }],
  };
  h.tools.previewCloze();
  assert.match(h.tools.preview.textContent, /<img/);
  assert.equal(
    h.all().filter((n) => ["img", "script"].includes(n.tagName)).length,
    0,
  );
});
test("respuesta tardía CLOZE no revive la sesión cerrada", async () => {
  let release;
  const h = harness({
    cloze: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const opened = h.tools.openCloze(selected);
  h.tools.close(true);
  h.setBusy(false);
  release({ id: selected.id });
  await opened;
  assert.equal(h.tools.record, null);
  assert.equal(h.doc.getElementById("tools-panel").hidden, true);
});
test("UI legado: confirmación cancelada no escribe y gate apagado deshabilita acciones", async (t) => {
  const { api } = await serve(t);
  const h = harness(api, () => false);
  h.tools.openLegacy(area);
  await h.tools.loadBatch();
  const before = h.tools.batch.revision;
  await h.tools.applyBatch();
  assert.equal(h.tools.batch.revision, before);
  h.tools.batch.habilitado = false;
  h.tools.controls();
  assert.equal(
    h.button("Confirmar indexación del lote revisado").disabled,
    true,
  );
  await h.tools.loadDestinationThemes(1);
  h.tools.themeSelect.value = "demo-t1";
  await h.tools.loadDestinationSubs(1);
  h.tools.question.value = "demo-legacy-q1";
  h.tools.subSelect.value = "demo-s2";
  await h.tools.loadMove();
  h.tools.move.habilitado = false;
  h.tools.move.puedeReclasificar = false;
  h.tools.controls();
  assert.equal(h.button("Confirmar destino revisado").disabled, true);
});
test("UI legado: edición de límite, pregunta o destino invalida la confirmación", async (t) => {
  const { api } = await serve(t);
  const h = harness(api);
  h.tools.openLegacy(area);
  await h.tools.loadBatch();
  h.tools.limit.value = "1";
  h.tools.limit.oninput();
  assert.equal(h.tools.batch, null);
  await h.tools.loadDestinationThemes(1);
  h.tools.themeSelect.value = "demo-t1";
  await h.tools.loadDestinationSubs(1);
  h.tools.question.value = "demo-legacy-q1";
  h.tools.subSelect.value = "demo-s2";
  await h.tools.loadMove();
  assert.ok(h.tools.move);
  h.tools.question.oninput();
  assert.equal(h.tools.move, null);
  assert.equal(h.button("Confirmar destino revisado").disabled, true);
  await h.tools.loadMove();
  h.tools.subSelect.onchange();
  assert.equal(h.tools.move, null);
});
test("UI: indexación y reclasificación consumen revisión y no reintentan tras timeout", async (t) => {
  const { api } = await serve(t);
  const h = harness(api);
  h.tools.openLegacy(area);
  await h.tools.loadBatch();
  let writes = 0;
  api.legacyBatch = async () => {
    writes++;
    throw new Error("Sin confirmación");
  };
  await h.tools.applyBatch();
  await h.tools.applyBatch();
  assert.equal(writes, 1);
  assert.equal(h.tools.batch, null);
  await h.tools.loadDestinationThemes(1);
  h.tools.themeSelect.value = "demo-t1";
  await h.tools.loadDestinationSubs(1);
  h.tools.question.value = "demo-legacy-q1";
  h.tools.subSelect.value = "demo-s2";
  await h.tools.loadMove();
  api.reclassify = async () => {
    writes++;
    throw new Error("Sin confirmación");
  };
  await h.tools.applyMove();
  await h.tools.applyMove();
  assert.equal(writes, 2);
  assert.equal(h.tools.move, null);
});
test("UI: recorrido de lotes, coincidencias y destino usa solo IDs y revisión elegidos", async (t) => {
  const { api } = await serve(t);
  const h = harness(api);
  h.tools.openLegacy(area);
  await h.tools.loadBatch();
  await h.tools.applyBatch();
  assert.equal(h.tools.batch, null);
  await h.tools.loadGroups();
  const fingerprint = h.tools.groupPage.items[0].huella;
  await h.tools.loadMatches(fingerprint);
  assert.equal(h.tools.matchPage.items.length, 2);
  await h.tools.loadDestinationThemes(1);
  h.tools.themeSelect.value = "demo-t1";
  await h.tools.loadDestinationSubs(1);
  h.tools.question.value = "demo-legacy-q1";
  h.tools.subSelect.value = "demo-s2";
  await h.tools.loadMove();
  await h.tools.applyMove();
  assert.match(h.tools.moveOutput.textContent, /demo-legacy-sub → demo-s2/);
  assert.equal(h.tools.move, null);
  assert.equal(
    (await api.bankRecord("preguntas", "demo-s2", "demo-legacy-q1"))
      .estadoContenido,
    "BORRADOR",
  );
});
test("UI paginada envía cursor devuelto y no conserva botones de páginas anteriores", async () => {
  const calls = [];
  const h = harness({
    legacyReport: async (area, fp, after) => {
      calls.push(after);
      return {
        items: [{ huella: (after ? "b" : "a").repeat(64), cantidad: 2 }],
        pendientesEnArea: 0,
        advertencia: "",
        hayMas: !after,
        siguiente: "a".repeat(64),
      };
    },
  });
  h.tools.openLegacy(area);
  await h.tools.loadGroups();
  const size = h.tools.controlsList.length;
  await h.tools.loadGroups(h.tools.groupPage.siguiente);
  assert.equal(calls[1], "a".repeat(64));
  assert.equal(h.tools.controlsList.length, size);
});
test("nuevos módulos se sirven sin secretos ni almacenamiento persistente", async (t) => {
  const { base } = await serve(t);
  for (const file of ["editorial-tools.mjs", "editorial-tool-fields.mjs"]) {
    assert.equal((await fetch(`${base}/${file}`)).status, 200);
    const source = await readFile(
      new URL(`../public/${file}`, import.meta.url),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage/,
    );
  }
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  for (const id of [
    "tools-panel",
    "tools-content",
    "tools-heading",
    "tools-message",
    "tools-close",
    "editor-cloze",
    "area-legacy",
    "bank-reclassify",
  ])
    assert.ok(html.includes(`id="${id}"`));
});

test("cableado del panel: catálogo → CLOZE → lección, banco antiguo y cierre de sesión", async (t) => {
  const { base } = await serve(t);
  const originals = {
    document: globalThis.document,
    window: globalThis.window,
    config: globalThis.SABERPLUS_CONFIG,
  };
  t.after(() => {
    globalThis.document = originals.document;
    globalThis.window = originals.window;
    globalThis.SABERPLUS_CONFIG = originals.config;
  });
  const nodes = new Map();
  const get = (id) => {
    if (!nodes.has(id)) nodes.set(id, new Element("div"));
    return nodes.get(id);
  };
  const tree = (node) => [node, ...node.children.flatMap(tree)];
  const all = () => [...nodes.values()].flatMap(tree);
  globalThis.document = {
    getElementById: get,
    createElement: (tag) => new Element(tag),
    querySelectorAll: () =>
      all().filter(
        (n) =>
          n.tagName === "button" &&
          ["area-button", "item"].includes(n.className),
      ),
  };
  globalThis.window = { confirm: () => true, addEventListener() {} };
  globalThis.SABERPLUS_CONFIG = { demo: true, apiBase: `${base}/api` };
  await import("../public/app.mjs");
  const waitFor = async (condition) => {
    const deadline = Date.now() + 5000;
    while (!condition()) {
      assert.ok(Date.now() < deadline, "La interfaz no terminó la operación");
      await new Promise((resolve) => setImmediate(resolve));
    }
  };
  get("demo-login").onclick();
  await waitFor(
    () =>
      !get("demo-login").disabled &&
      get("themes-list").children.some((n) =>
        n.textContent.includes("Proporcionalidad"),
      ),
  );
  get("themes-list")
    .children.find((n) => n.textContent.includes("Proporcionalidad"))
    .onclick();
  await waitFor(() =>
    get("subthemes-list").children.some((n) =>
      n.textContent.includes("Porcentajes"),
    ),
  );
  // New catalog forms must be protected just like the lesson/question editors.
  let confirmations = 0;
  globalThis.window.confirm = () => { confirmations++; return false; };
  get("theme-name").value = "Tema sin guardar";
  get("area-list").children.find((n) => n.textContent.includes("Inglés")).onclick();
  assert.equal(confirmations, 1);
  assert.equal(get("theme-name").value, "Tema sin guardar");
  assert.match(get("breadcrumb").textContent, /Matemáticas/);
  get("logout").onclick();
  assert.equal(confirmations, 2);
  assert.equal(get("workspace").hidden, false);
  get("subtheme-name").value = "Subtema sin guardar";
  get("themes-list").children.find((n) => n.textContent.includes("Álgebra")).onclick();
  assert.equal(confirmations, 3);
  assert.equal(get("subtheme-name").value, "Subtema sin guardar");
  assert.match(get("breadcrumb").textContent, /Proporcionalidad/);
  get("theme-name").value = "";
  get("subtheme-name").value = "";
  globalThis.window.confirm = () => true;
  get("subthemes-list")
    .children.find((n) => n.textContent.includes("Porcentajes"))
    .onclick();
  await waitFor(() => !get("editor-cloze").disabled);
  get("editor-cloze").onclick();
  await waitFor(() =>
    get("tools-content").children.some((n) => n.tagName === "label"),
  );
  assert.equal(get("lesson-editor").hidden, true);
  assert.equal(get("tools-panel").hidden, false);
  await waitFor(
    () => !all().find((n) => n.textContent === "Volver a la lección")?.disabled,
  );
  all()
    .find(
      (n) => n.tagName === "button" && n.textContent === "Volver a la lección",
    )
    .onclick();
  await waitFor(
    () => !get("editor-cloze").disabled && !get("lesson-editor").hidden,
  );
  assert.equal(get("tools-panel").hidden, true);
  get("area-legacy").onclick();
  assert.equal(get("tools-panel").hidden, false);
  const load = all().find(
    (n) => n.tagName === "button" && n.textContent === "Consultar lote",
  );
  load.onclick();
  await waitFor(() =>
    get("tools-message").textContent.includes("Revisa el lote"),
  );
  get("logout").onclick();
  assert.equal(get("tools-panel").hidden, true);
  assert.equal(get("tools-content").children.length, 0);
});
