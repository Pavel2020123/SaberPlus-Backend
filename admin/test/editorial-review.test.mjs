import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";
import { EditorialReview } from "../public/editorial-review.mjs";

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
  const base = `http://127.0.0.1:${server.address().port}`,
    api = new CatalogApi(`${base}/api`);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  return { api, base };
}
async function transition(api, tipo, id, destino) {
  const snapshot = await api.review(tipo, id);
  return api.review(tipo, id, {
    revision: snapshot.revision,
    destino,
    confirmado: true,
  });
}
async function publish(api, tipo, id) {
  await transition(api, tipo, id, "EN_REVISION");
  return transition(api, tipo, id, "PUBLICADO");
}
test("flujo demo completo: tema > subtema > caso > pregunta; revisión, publicación y archivo sin cascada", async (t) => {
  const { api } = await serve(t);
  const tema = await api.create("temas", "MATEMATICAS", "Probabilidad");
  const sub = await api.create("subtemas", tema.id, "Eventos simples");
  let snapshot = await api.review("subtemas", sub.id);
  assert.ok(snapshot.bloqueos.some((text) => text.includes("tema")));
  await assert.rejects(
    api.review("temas", tema.id, {
      revision: (await api.review("temas", tema.id)).revision,
      destino: "PUBLICADO",
      confirmado: true,
    }),
    (error) => error.status === 400,
  );
  await publish(api, "temas", tema.id);
  await publish(api, "subtemas", sub.id);
  const caso = await api.bankRecord("casos", "MATEMATICAS", null, {
    area: "MATEMATICAS",
    titulo: "Lanzamiento de un dado",
    contexto: "El dado tiene seis caras equiprobables.",
    imagenUrl: "",
  });
  const pregunta = await api.bankRecord("preguntas", sub.id, null, {
    subtemaId: sub.id,
    enunciado: "¿Probabilidad de obtener un seis?",
    explicacion: "Un caso favorable de seis posibles.",
    imagenUrl: "",
    dificultad: "BASICO",
    casoId: caso.id,
    ordenEnCaso: 1,
    respuestas: [
      { texto: "1/6", esCorrecta: true, explicacion: "" },
      { texto: "1/2", esCorrecta: false, explicacion: "" },
    ],
  });
  snapshot = await api.review("preguntas", pregunta.id);
  assert.ok(snapshot.bloqueos.some((text) => text.includes("caso")));
  await publish(api, "casos", caso.id);
  await publish(api, "preguntas", pregunta.id);
  assert.equal(
    (await api.bankRecord("preguntas", sub.id, pregunta.id)).editable,
    false,
  );
  assert.equal(
    (await api.review("temas", tema.id)).destinos.includes("ARCHIVADO"),
    false,
  );
  assert.equal(
    (await api.review("casos", caso.id)).destinos.includes("ARCHIVADO"),
    false,
  );
  await transition(api, "preguntas", pregunta.id, "ARCHIVADO");
  await transition(api, "subtemas", sub.id, "ARCHIVADO");
  await transition(api, "casos", caso.id, "ARCHIVADO");
  await transition(api, "temas", tema.id, "ARCHIVADO");
  await transition(api, "preguntas", pregunta.id, "BORRADOR");
  assert.equal(
    (await api.bankRecord("preguntas", sub.id, pregunta.id)).editable,
    false,
  );
  assert.equal((await api.bankPage("preguntas", sub.id)).items.length, 1);
});

test("revisión exige confirmación y versión vigente; no hay escrituras sin sesión", async (t) => {
  const { api, base } = await serve(t);
  const original = await api.review("subtemas", "demo-s2");
  await assert.rejects(
    api.review("subtemas", original.id, {
      revision: original.revision,
      destino: "EN_REVISION",
      confirmado: false,
    }),
    /confirmación/,
  );
  await transition(api, "subtemas", original.id, "EN_REVISION");
  await assert.rejects(
    api.review("subtemas", original.id, {
      revision: original.revision,
      destino: "EN_REVISION",
      confirmado: true,
    }),
    (error) => error.status === 409,
  );
  assert.equal(
    (await fetch(`${base}/api/admin/editor/revision/temas/demo-t1`)).status,
    401,
  );
  assert.equal((await fetch(`${base}/editorial-review.mjs`)).status, 200);
  assert.equal((await fetch(`${base}/demo-editorial-review.mjs`)).status, 404);
});

const snapshot = {
  tipo: "temas",
  id: "t1",
  area: "MATEMATICAS",
  estadoContenido: "EN_REVISION",
  revision: "a".repeat(64),
  habilitado: true,
  destinos: ["BORRADOR", "PUBLICADO", "ARCHIVADO"],
  bloqueos: [],
  advertencias: ["Revisar derechos."],
  contenido: ["<script>alert(1)</script>"],
};
function harness(api, confirm = () => true) {
  const nodes = new Map();
  const node = () => ({
    textContent: "",
    hidden: false,
    disabled: false,
    children: [],
    focus() {},
    replaceChildren(...children) {
      this.children = children;
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
  const review = new EditorialReview({
    api,
    doc,
    confirm,
    busy: () => busy,
    setBusy: (value) => (busy = value),
  });
  return { review, $: (id) => doc.getElementById(id), busy: () => busy };
}
test("cancelar confirmación no escribe; gate desactivado bloquea los botones", async () => {
  let calls = 0;
  const h = harness(
    {
      review: async () => {
        calls++;
        return snapshot;
      },
    },
    () => false,
  );
  await h.review.open("temas", "t1");
  await h.review.change("PUBLICADO");
  assert.equal(calls, 1);
  h.review.fill({ ...snapshot, habilitado: false });
  assert.ok(h.$("review-actions").children.every((button) => button.disabled));
  await h.review.change("PUBLICADO");
  assert.equal(calls, 1);
});
test("confirmación envía revisión exacta, no interpreta HTML y bloquea doble acción", async () => {
  let finish, sent;
  const h = harness({
    review: async (tipo, id, change) => {
      if (!change) return snapshot;
      sent = change;
      return new Promise((resolve) => (finish = resolve));
    },
  });
  await h.review.open("temas", "t1");
  assert.equal(
    h.$("review-content").children[0].textContent,
    "<script>alert(1)</script>",
  );
  const pending = h.review.change("PUBLICADO");
  assert.equal(h.busy(), true);
  assert.equal(h.review.close(), false);
  assert.deepEqual(sent, {
    revision: snapshot.revision,
    destino: "PUBLICADO",
    confirmado: true,
  });
  finish({
    ...snapshot,
    estadoContenido: "PUBLICADO",
    destinos: ["ARCHIVADO"],
  });
  await pending;
  assert.equal(h.review.record.estadoContenido, "PUBLICADO");
  assert.equal(h.busy(), false);
});
test("un error obliga a recargar; una respuesta tardía no revive la revisión cerrada", async () => {
  const h = harness({
    review: async (tipo, id, change) => {
      if (change) throw new Error("Conflicto");
      return snapshot;
    },
  });
  await h.review.open("temas", "t1");
  await h.review.change("PUBLICADO");
  assert.equal(h.review.record, null);
  assert.equal(h.$("review-actions").children.length, 0);
  assert.match(h.$("review-message").textContent, /Recarga/);
  let finish;
  const late = harness({
    review: () => new Promise((resolve) => (finish = resolve)),
  });
  const pending = late.review.open("temas", "t1");
  late.review.close(true);
  finish(snapshot);
  await pending;
  assert.equal(late.review.record, null);
  assert.equal(late.$("review-panel").hidden, true);
});
test("contrato inválido de revisión se rechaza; IDs existen y no se persisten credenciales", async () => {
  const api = new CatalogApi("/api", {
    fetcher: async (url) =>
      new Response(
        JSON.stringify(
          url.endsWith("/login")
            ? { accessToken: "fixture" }
            : url.endsWith("/perfil")
              ? { rol: "ADMIN", debeCambiarContrasena: false }
              : { ...snapshot, id: "otro" },
        ),
      ),
  });
  await api.login("admin@example.com", "fixture");
  await assert.rejects(api.review("temas", "t1"), /validar/);
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../public/editorial-review.mjs", import.meta.url),
    "utf8",
  );
  for (const [, id] of source.matchAll(/\$\(["']([^"']+)["']\)/g))
    assert.ok(html.includes(`id="${id}"`), id);
  assert.doesNotMatch(
    source,
    /innerHTML|insertAdjacentHTML|localStorage|sessionStorage/,
  );
});
