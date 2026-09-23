import test from "node:test";
import assert from "node:assert/strict";
import { createAdminServer } from "../server.mjs";
import { CatalogApi } from "../public/api.mjs";

async function serve(t) {
  const server = createAdminServer({ demo: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const api = new CatalogApi(`http://127.0.0.1:${server.address().port}/api`, { simple: true });
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  return api;
}
const question = (subtemaId) => ({
  subtemaId, enunciado: "¿Cuánto es 3 + 3?", explicacion: "Tres más tres es seis.",
  dificultad: "BASICO", imagenUrl: "", casoId: "",
  respuestas: [{ texto: "6", esCorrecta: true, explicacion: "" }, { texto: "9", esCorrecta: false, explicacion: "" }],
});

test("guardar publica directamente y editar conserva la versión anterior", async (t) => {
  const api = await serve(t);
  const theme = await api.create("temas", "MATEMATICAS", "Operaciones");
  const sub = await api.create("subtemas", theme.id, "Sumas");
  assert.equal(theme.estadoContenido, "PUBLICADO");
  assert.equal(sub.estadoContenido, "PUBLICADO");
  let lesson = await api.editor("subtemas", sub.id, theme.id);
  lesson = await api.editor("subtemas", sub.id, theme.id, { revision: lesson.revision, contenido: "Explicación y ejemplo", videoUrl: "", imagenUrl: "" });
  assert.equal(lesson.estadoContenido, "PUBLICADO");
  const first = await api.bankRecord("preguntas", sub.id, null, question(sub.id));
  assert.equal(first.estadoContenido, "PUBLICADO");
  const edited = await api.bankRecord("preguntas", sub.id, first.id, { ...question(sub.id), revision: first.revision, explicacion: "Una explicación corregida." });
  assert.notEqual(edited.id, first.id);
  assert.equal(edited.reemplazaId, first.id);
  assert.equal(edited.estadoContenido, "PUBLICADO");
  const previous = await api.bankRecord("preguntas", sub.id, first.id);
  assert.equal(previous.estadoContenido, "ARCHIVADO");
  assert.equal(previous.explicacion, first.explicacion);
  assert.equal(previous.editable, false);
  assert.deepEqual((await api.bankPage("preguntas", sub.id)).items.map((r) => r.id), [edited.id]);
  await assert.rejects(api.bankRecord("preguntas", sub.id, first.id, { ...question(sub.id), revision: first.revision }), (e) => e.status === 409);
  await assert.rejects(api.bankRecord("preguntas", sub.id, null, question(sub.id)), (e) => e.status === 409 && e.message.includes("ya está registrada"));
  assert.equal((await api.bankPage("preguntas", sub.id)).items.length, 1);
  api.logout();
  assert.throws(() => api.create("temas", "INGLES", "Grammar"), (e) => e.status === 401);
});

test("eliminación vacía, textos compartidos publicados y respuestas inválidas", async (t) => {
  const api = await serve(t);
  const theme = await api.create("temas", "MATEMATICAS", "Temporal");
  const detail = await api.editor("temas", theme.id, "MATEMATICAS");
  assert.equal(detail.eliminable, true);
  await api.removeDraft("temas", theme.id, "MATEMATICAS", detail.revision, true);
  const shared = await api.bankRecord("casos", "MATEMATICAS", null, { area: "MATEMATICAS", titulo: "Sumas", contexto: "Tres objetos y otros tres.", imagenUrl: "" });
  assert.equal(shared.estadoContenido, "PUBLICADO");
  const created = await api.bankRecord("preguntas", "demo-s2", null, { ...question("demo-s2"), casoId: shared.id, ordenEnCaso: 1 });
  const edited = await api.bankRecord("preguntas", "demo-s2", created.id, { ...question("demo-s2"), casoId: shared.id, ordenEnCaso: 1, revision: created.revision });
  assert.equal(edited.estadoContenido, "PUBLICADO");
  assert.equal((await api.bankRecord("casos", "MATEMATICAS", shared.id)).editable, false);
  await assert.rejects(api.bankRecord("preguntas", "demo-s2", null, { ...question("demo-s2"), respuestas: [] }));
});
