import test from "node:test";
import assert from "node:assert/strict";
import { readBlocks, writeBlocks } from "../public/lesson-blocks.mjs";
import { previewBlocks } from "../public/lesson-fields.mjs";

test("bloques de lectura, ejemplo, consejo y resumen conservan tipo y título al reabrir", () => {
  const blocks = ["lectura", "ejemplo", "consejo", "resumen"].map((tipo) => ({
    tipo,
    titulo: "Regla de tres",
    contenido: "Texto de prueba.",
  }));
  const saved = writeBlocks(blocks);
  assert.deepEqual(
    readBlocks(saved).map((b) => ({ ...b, contenido: b.contenido.trim() })),
    blocks,
  );
  assert.ok(!saved.includes("[[BLOQUE"));
  assert.equal(writeBlocks([]), "");
});
test("acepta títulos pegados con # y genera Markdown válido para Flutter", () => {
  assert.deepEqual(previewBlocks("#Título\n##Ejemplo\n###Resumen"), [
    { tag: "h2", text: "Título" },
    { tag: "h3", text: "Ejemplo" },
    { tag: "h4", text: "Resumen" },
  ]);
  assert.equal(readBlocks("#Título\nTexto")[0].titulo, "Título");
  assert.equal(
    writeBlocks([
      { tipo: "lectura", titulo: "#Título", contenido: "###Ejemplo\nTexto" },
    ]),
    "## Título\n\n### Ejemplo\nTexto",
  );
});
test("textos heredados y código no se descartan al dividir en bloques", () => {
  const blocks = readBlocks("Texto inicial\n\n## Título\nTexto final");
  assert.equal(blocks[0].contenido.trim(), "Texto inicial");
  assert.equal(blocks[1].contenido.trim(), "Texto final");
  assert.equal(readBlocks("```\n#no es título\n```").length, 1);
  const malicious = '<img src=x onerror="alert(1)">';
  assert.deepEqual(previewBlocks(malicious), [{ tag: "p", text: malicious }]);
});
