import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";
import {
  lessonFields,
  previewBlocks,
  referenceUrl,
} from "../public/lesson-fields.mjs";
import { LessonEditor } from "../public/lesson-editor.mjs";

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

test("demo: guardar y recargar lección, sin publicar; segundo editor recibe conflicto", async (t) => {
  const { api } = await serve(t);
  const first = await api.editor("subtemas", "demo-s2", "demo-t1");
  const saved = await api.editor("subtemas", first.id, first.temaId, {
    revision: first.revision,
    contenido: "# Porcentajes\n- Ejemplo de 20 %",
    imagenUrl: "https://example.com/imagen.png",
    videoUrl: "",
  });
  assert.equal(saved.estadoContenido, "BORRADOR");
  assert.notEqual(saved.revision, first.revision);
  assert.deepEqual(await api.editor("subtemas", first.id, first.temaId), saved);
  await assert.rejects(
    api.editor("subtemas", first.id, first.temaId, {
      ...first,
      contenido: "No reemplazar",
    }),
    (error) => error.status === 409,
  );
  assert.equal(
    (await api.editor("subtemas", first.id, first.temaId)).contenido,
    saved.contenido,
  );
  const cleared = await api.editor("subtemas", first.id, first.temaId, {
    revision: saved.revision,
    contenido: "",
    videoUrl: "",
    imagenUrl: "",
  });
  assert.equal(cleared.imagenUrl, "");
});

test("demo: nombres duplicados, tema con subtemas y lección publicada protegidos", async (t) => {
  const { api } = await serve(t);
  let theme = await api.editor("temas", "demo-t2", "MATEMATICAS");
  await assert.rejects(
    api.editor("temas", theme.id, theme.area, {
      revision: theme.revision,
      nombre: "PROPORCIONALIDAD",
    }),
    (error) => error.status === 409,
  );
  theme = await api.editor("temas", theme.id, theme.area, {
    revision: theme.revision,
    nombre: "Álgebra básica",
  });
  assert.equal(theme.nombre, "Álgebra básica");
  await api.create("subtemas", theme.id, "Ecuaciones");
  theme = await api.editor("temas", theme.id, theme.area);
  assert.equal(theme.renombrable, false);
  await assert.rejects(
    api.editor("temas", theme.id, theme.area, {
      revision: theme.revision,
      nombre: "Otro",
    }),
    (error) => error.status === 400,
  );
  const published = await api.editor("subtemas", "demo-s1", "demo-t1");
  assert.equal(published.editable, false);
  await assert.rejects(
    api.editor("subtemas", published.id, published.temaId, {
      revision: published.revision,
      contenido: "Cambio",
      imagenUrl: "",
      videoUrl: "",
    }),
    (error) => error.status === 400,
  );
});

test("editor requiere sesión y verifica que el detalle pertenece al padre seleccionado", async (t) => {
  const { api, base } = await serve(t);
  assert.equal(
    (await fetch(`${base}/api/admin/editor/subtemas/demo-s2`)).status,
    401,
  );
  await assert.rejects(api.editor("subtemas", "demo-s2", "demo-t4"), /validar/);
  await assert.rejects(api.editor("temas", "demo-t2", "INGLES"), /validar/);
  for (const asset of ["lesson-editor.mjs", "lesson-fields.mjs"])
    assert.equal((await fetch(`${base}/${asset}`)).status, 200);
});

test("valida contenido y referencias sin interpretar HTML, links ni imágenes Markdown", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,x",
    "http://example.com/a",
    "https://user:secret@example.com/a",
    "https://example.com/a b",
    "x".repeat(2001),
  ])
    assert.throws(() => referenceUrl(bad));
  assert.equal(referenceUrl(""), "");
  assert.equal(
    referenceUrl("https://example.com/a.png"),
    "https://example.com/a.png",
  );
  assert.throws(() =>
    lessonFields({ contenido: "x".repeat(30001), imagenUrl: "", videoUrl: "" }),
  );
  assert.throws(() =>
    lessonFields({ contenido: "\u0000", imagenUrl: "", videoUrl: "" }),
  );
  const attack = '<img src=x onerror="alert(1)">';
  assert.deepEqual(
    previewBlocks(
      `# Título\n- Ejemplo\n${attack}\n![imagen](https://example.com/a)`,
    ),
    [
      { tag: "h2", text: "Título" },
      { tag: "p", text: "• Ejemplo" },
      { tag: "p", text: attack },
      { tag: "p", text: "![imagen](https://example.com/a)" },
    ],
  );
});

// Lightweight DOM test doubles, not a browser or a visual-layout assertion.
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
    append(child) {
      this.children.push(child);
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
  const editor = new LessonEditor({
    api,
    doc,
    confirm,
    busy: () => busy,
    setBusy: (value) => (busy = value),
    onSaved() {},
  });
  return { editor, $: (id) => doc.getElementById(id), isBusy: () => busy };
}
const record = {
  id: "s1",
  nombre: "Nombre",
  revision: "a".repeat(64),
  contenido: "Texto inicial",
  imagenUrl: "",
  videoUrl: "",
  editable: true,
  renombrable: true,
  estadoContenido: "BORRADOR",
  motivo: "",
};

test("editor por bloques actualiza vista previa, guarda y conserva contenido tras conflicto", async () => {
  const h = harness({ editor: async (...args) => {
    if (args[3]) throw new Error("Conflicto de versión");
    return { ...record, contenido: "" };
  } });
  await h.editor.open("subtemas", "s1", "t1");
  h.$("lesson-add-block").onclick();
  const card = h.$("lesson-blocks").children[0];
  const title = card.children[2].children[0];
  const content = card.children[3].children[0];
  title.value = "Regla de tres"; title.oninput();
  content.value = "Un ejemplo explicado."; content.oninput();
  assert.equal(h.editor.dirty, true);
  assert.match(h.$("lesson-text").value, /## Regla de tres/);
  assert.equal(h.$("lesson-preview").children[0].textContent, "Regla de tres");
  await h.editor.save(false);
  assert.match(h.$("editor-message").textContent, /Conflicto/);
  assert.equal(title.value, "Regla de tres");
  h.editor.close(true);
  assert.equal(h.$("lesson-add-block").disabled, true);
  assert.equal(h.editor.blocks.blocks.length, 0);
});

test("eliminar exige borrador autorizado, sin cambios y confirmación; invalida reintentos", async () => {
  let calls = 0,
    confirm = false;
  const h = harness(
    {
      editor: async () => ({
        ...record,
        contenido: "",
        eliminable: true,
        motivoEliminacion: "",
      }),
      removeDraft: async (...args) => {
        calls++;
        assert.deepEqual(args, ["subtemas", "s1", "t1", record.revision, true]);
        throw new Error("Respuesta perdida");
      },
    },
    () => confirm,
  );
  await h.editor.open("subtemas", "s1", "t1");
  await h.editor.remove();
  assert.equal(calls, 0);
  confirm = true;
  h.$("lesson-text").oninput();
  await h.editor.remove();
  assert.equal(calls, 0);
  assert.equal(h.$("editor-delete").disabled, true);
  await h.editor.open("subtemas", "s1", "t1");
  await h.editor.remove();
  assert.equal(calls, 1);
  assert.match(h.$("editor-message").textContent, /Respuesta perdida/);
  assert.equal(h.$("editor-delete").disabled, true);
  await h.editor.remove();
  assert.equal(calls, 1);
});

test("eliminación confirmada cierra el editor y notifica; respuesta tardía no revive sesión", async () => {
  let finish,
    notices = 0;
  const h = harness({
    editor: async () => ({ ...record, eliminable: true }),
    removeDraft: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  h.editor.onDeleted = () => {
    notices++;
  };
  await h.editor.open("subtemas", "s1", "t1");
  const first = h.editor.remove();
  finish({ eliminado: true });
  await first;
  assert.equal(h.editor.record, null);
  assert.equal(h.$("lesson-editor").hidden, true);
  assert.equal(h.isBusy(), false);
  assert.equal(notices, 1);
  await h.editor.open("subtemas", "s1", "t1");
  const late = h.editor.remove();
  h.editor.close(true);
  finish({ eliminado: true });
  await late;
  assert.equal(notices, 1);
  assert.equal(h.editor.record, null);
});

test("interfaz conserva texto ante conflicto y avisa antes de descartarlo", async () => {
  const h = harness(
    {
      editor: async (kind, id, parent, update) => {
        if (update) throw new Error("El registro cambió");
        return record;
      },
    },
    () => false,
  );
  await h.editor.open("subtemas", "s1", "t1");
  h.$("lesson-text").value = "Mi texto sin guardar";
  h.$("lesson-text").oninput();
  await h.editor.save(false);
  assert.equal(h.$("lesson-text").value, "Mi texto sin guardar");
  assert.match(h.$("editor-message").textContent, /sigue aquí/);
  assert.equal(h.editor.close(), false);
  assert.equal(h.editor.dirty, true);
  assert.equal(h.isBusy(), false);
  h.editor.close(true);
  assert.equal(h.$("lesson-text").value, "");
  assert.equal(h.$("lesson-editor").hidden, true);
});

test("guardar nombre no descarta texto pendiente y guardar texto conserva nombre pendiente", async () => {
  const h = harness({
    editor: async (kind, id, parent, update) =>
      update ? { ...record, ...update } : record,
  });
  await h.editor.open("subtemas", "s1", "t1");
  h.$("lesson-text").value = "Texto pendiente";
  h.$("lesson-text").oninput();
  h.$("editor-name").value = "Nuevo nombre";
  h.$("editor-name").oninput();
  await h.editor.save(true);
  assert.equal(h.$("lesson-text").value, "Texto pendiente");
  assert.equal(h.editor.dirty, true);
  h.$("editor-name").value = "Otro nombre pendiente";
  h.$("editor-name").oninput();
  await h.editor.save(false);
  assert.equal(h.$("editor-name").value, "Otro nombre pendiente");
  assert.equal(h.editor.dirty, true);
});

test("respuesta tardía no reabre editor después de cerrar sesión", async () => {
  let finish;
  const h = harness({
    editor: () => new Promise((resolve) => (finish = resolve)),
  });
  const pending = h.editor.open("subtemas", "s1", "t1");
  h.editor.close(true);
  finish(record);
  await pending;
  assert.equal(h.editor.record, null);
  assert.equal(h.$("lesson-editor").hidden, true);
  assert.equal(h.$("lesson-text").value, "");
});

test("solo lectura bloquea guardado; vista previa usa texto y vínculos explícitos seguros", async () => {
  let calls = 0;
  const h = harness({
    editor: async () => {
      calls++;
      return {
        ...record,
        editable: false,
        renombrable: false,
        contenido: "<script>alert(1)</script>",
        imagenUrl: "https://example.com/a.png",
      };
    },
  });
  await h.editor.open("subtemas", "s1", "t1");
  assert.equal(h.$("lesson-save").disabled, true);
  assert.equal(h.$("editor-rename").disabled, true);
  await h.editor.save(false);
  assert.equal(calls, 1);
  assert.equal(
    h.$("lesson-preview").children[0].textContent,
    "<script>alert(1)</script>",
  );
  const link = h.$("lesson-references").children[0];
  assert.equal(link.rel, "noopener noreferrer");
  assert.equal(link.target, "_blank");
});

test("todos los IDs del editor existen; no utiliza sinks HTML ni almacenamiento de sesión", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../public/lesson-editor.mjs", import.meta.url),
    "utf8",
  );
  for (const [, id] of source.matchAll(/\$\(["']([^"']+)["']\)/g))
    assert.ok(html.includes(`id="${id}"`), id);
  assert.doesNotMatch(
    source,
    /innerHTML|insertAdjacentHTML|localStorage|sessionStorage/,
  );
});
