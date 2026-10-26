import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CatalogApi } from "../public/api.mjs";
import {
  fileMetadata,
  fileReceipt,
  imagePath,
} from "../public/editorial-file-fields.mjs";
import { imageReference, referenceUrl } from "../public/lesson-fields.mjs";
import { EditorialImageUpload } from "../public/editorial-image-upload.mjs";

const id = "2df4f385-fec2-4cb1-89af-91f67a476b52";
const operation = "f2c743aa-7ba2-454b-9319-b6e234f7d206";
const metadata = {
  titulo: "Fracciones",
  textoAlternativo: "Cuatro sectores iguales",
  fuente: "Creación propia",
  titular: "SaberPlus",
  autorizacion: "ORIGINAL",
};
const receipt = (changes = {}) => ({
  ...metadata,
  id,
  operacionId: operation,
  estado: "DISPONIBLE",
  tipo: "image/webp",
  bytes: 20,
  ancho: 100,
  alto: 50,
  contenidoUrl: `/admin/archivos/${id}/contenido`,
  puedeReintentar: false,
  ...changes,
});
const png = () =>
  new File(
    [
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+yG9sAAAAASUVORK5CYII=",
        "base64",
      ),
    ],
    "privado.png",
    { type: "image/png" },
  );
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
const later = () => {
  let resolve;
  const promise = new Promise((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
};

function harness(api = {}) {
  const element = () => ({
    value: "",
    textContent: "",
    hidden: false,
    disabled: false,
    children: [],
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
    removeAttribute(key) {
      delete this[key];
    },
  });
  const host = element();
  host.id = "fixture-image";
  const input = element(),
    revoked = [];
  let busy = false,
    changes = 0,
    objectId = 0,
    widget;
  widget = new EditorialImageUpload({
    api: { uploadEditorialFile: async () => receipt(), ...api },
    host,
    input,
    doc: { createElement: element },
    confirm: () => true,
    uuid: () => operation,
    urls: {
      createObjectURL: () => `blob:local-${++objectId}`,
      revokeObjectURL: (url) => revoked.push(url),
    },
    setBusy: (value) => {
      busy = value;
      widget.lock(value);
    },
    onChange: () => {
      changes++;
    },
  });
  widget.lock(false);
  return {
    widget,
    input,
    host,
    revoked,
    busy: () => busy,
    changes: () => changes,
  };
}
async function selected(h) {
  await h.widget.select(png());
  for (const [key, value] of Object.entries(metadata))
    h.widget.nodes[key].value = value;
}

test("referencias administradas solo admiten la ruta estable y UUID; video mantiene HTTPS", () => {
  assert.equal(imageReference(imagePath(id)), imagePath(id));
  for (const value of [
    `${imagePath(id)}?token=secreto`,
    `/admin/archivos/${id}/contenido`,
    "/recursos/editoriales/../x",
    "javascript:alert(1)",
  ])
    assert.throws(() => imageReference(value));
  assert.throws(() => referenceUrl(imagePath(id)));
  assert.equal(
    imageReference("https://example.com/x.png"),
    "https://example.com/x.png",
  );
});
test("autoría obligatoria y permisos distintos de ORIGINAL requieren referencia", () => {
  assert.deepEqual(fileMetadata(metadata), metadata);
  for (const changes of [
    { titular: "" },
    { fuente: "\u0000x" },
    { autorizacion: "LICENCIA" },
    { titulo: "x".repeat(121) },
  ])
    assert.throws(() => fileMetadata({ ...metadata, ...changes }));
  assert.equal(
    fileMetadata({
      ...metadata,
      autorizacion: "LICENCIA",
      referenciaAutorizacion: "REF-14",
    }).referenciaAutorizacion,
    "REF-14",
  );
});
test("recibo no permite URL externa, identificador equivocado ni tamaño inválido", () => {
  assert.equal(fileReceipt(receipt(), operation).id, id);
  for (const changes of [
    { contenidoUrl: "https://attacker.invalid/foto" },
    { operacionId: id },
    { bytes: 0 },
    { ancho: 3000 },
    { estado: "PREPARADO" },
  ])
    assert.throws(() => fileReceipt(receipt(changes), operation));
});

test("un recibo REVOCADO no incluye URL ni permite reintentar la carga", () => {
  const revoked = receipt({ estado: "REVOCADO", contenidoUrl: null, puedeReintentar: false });
  assert.equal(fileReceipt(revoked, operation).estado, "REVOCADO");
  assert.throws(() => fileReceipt({ ...revoked, contenidoUrl: receipt().contenidoUrl }, operation));
  assert.throws(() => fileReceipt({ ...revoked, puedeReintentar: true }, operation));
});

test("consultar una carga revocada no la vincula al contenido", () => {
  const h = harness({});
  h.widget.accept(receipt({ estado: "REVOCADO", contenidoUrl: null, puedeReintentar: false }));
  assert.equal(h.input.value, "");
  assert.equal(h.changes(), 0);
});
test("seleccionar y cancelar no carga; guardar exige resolver la selección", async () => {
  let writes = 0;
  const h = harness({
    uploadEditorialFile: async () => {
      writes++;
      return receipt();
    },
  });
  await h.widget.select(undefined);
  assert.equal(h.changes(), 0);
  await selected(h);
  assert.equal(writes, 0);
  assert.equal(h.input.value, "");
  assert.equal(h.widget.preview.hidden, false);
  assert.throws(() => h.widget.ensureReady());
  await h.widget.upload();
  assert.equal(writes, 1);
  assert.equal(h.input.value, imagePath(id));
  assert.equal(h.input.hidden, true);
  assert.doesNotThrow(() => h.widget.ensureReady());
});
test("rechaza archivos falsos y demasiado grandes antes de enviarlos", async () => {
  const h = harness();
  await h.widget.select(new File(["falso"], "x.png"));
  assert.equal(h.widget.file, null);
  assert.match(h.widget.status.textContent, /PNG/);
  await h.widget.select(new File([new Uint8Array(5242881)], "x.png"));
  assert.match(h.widget.status.textContent, /5 MiB/);
  assert.equal(h.changes(), 0);
});
test("pérdida de respuesta conserva imagen y datos; reintento envía la misma operación", async () => {
  const sent = [];
  const h = harness({
    uploadEditorialFile: async (...args) => {
      sent.push(args);
      if (sent.length === 1) throw new Error("No se pudo confirmar");
      return receipt();
    },
  });
  await selected(h);
  await h.widget.upload();
  assert.ok(h.widget.file);
  assert.equal(h.widget.nodes.titulo.disabled, true);
  assert.equal(h.widget.receiptButton.hidden, false);
  assert.equal(h.widget.retryButton.hidden, false);
  h.widget.nodes.titulo.value = "Cambio forzado del DOM";
  await h.widget.upload(true);
  assert.equal(sent.length, 2);
  assert.equal(sent[0][0], sent[1][0]);
  assert.equal(sent[0][1], sent[1][1]);
  assert.equal(sent[1][1].titulo, metadata.titulo);
  assert.equal(sent[1][2], operation);
  assert.equal(h.input.value, imagePath(id));
});
test("consultar carga recupera un guardado sin reenviar bytes", async () => {
  let writes = 0;
  const h = harness({
    uploadEditorialFile: async () => {
      writes++;
      throw new Error("Acuse perdido");
    },
    editorialFileReceipt: async () => receipt(),
  });
  await selected(h);
  await h.widget.upload();
  await h.widget.receipt();
  assert.equal(writes, 1);
  assert.equal(h.input.value, imagePath(id));
  assert.equal(h.widget.request, null);
});
test("recibo PREPARADO o consulta fallida conservan el envío original", async () => {
  const h = harness({
    uploadEditorialFile: async () => {
      throw new Error("Incierto");
    },
    editorialFileReceipt: async () =>
      receipt({
        estado: "PREPARADO",
        contenidoUrl: null,
        puedeReintentar: true,
      }),
  });
  await selected(h);
  await h.widget.upload();
  const original = h.widget.request;
  await h.widget.receipt();
  assert.equal(h.widget.request, original);
  assert.match(h.widget.status.textContent, /pendiente/);
});
test("doble clic no crea otra operación y cierre forzado ignora la respuesta tardía", async () => {
  const response = later();
  let writes = 0;
  const h = harness({
    uploadEditorialFile: async () => {
      writes++;
      return response.promise;
    },
  });
  await selected(h);
  const pending = h.widget.upload();
  assert.equal(h.busy(), true);
  await h.widget.upload(true);
  h.widget.reset();
  response.resolve(receipt());
  await pending;
  assert.equal(writes, 1);
  assert.equal(h.input.value, "");
  assert.equal(h.widget.preview.hidden, true);
  assert.equal(h.revoked.length, 1);
});
test("quitar imagen cambia el formulario y libera la vista previa sin borrar archivos", async () => {
  const h = harness();
  await selected(h);
  await h.widget.upload();
  h.widget.clear();
  assert.equal(h.input.value, "");
  assert.equal(h.revoked.length, 1);
  assert.equal(h.input.hidden, false);
});
test("solo lectura y demo no permiten elegir ni enviar imágenes", async () => {
  for (const demo of [true, false]) {
    const h = harness({ demo });
    if (!demo) h.widget.lock(true);
    await h.widget.select(png());
    await h.widget.upload();
    assert.equal(h.widget.file, null);
    assert.equal(h.widget.picker.disabled, true);
    assert.equal(h.changes(), 0);
  }
});
test("vista privada usa Blob autenticado y conserva descripción accesible", async () => {
  const h = harness({
    editorialFile: async () => receipt(),
    editorialFileContent: async () =>
      new Blob(["fixture"], { type: "image/webp" }),
  });
  h.widget.setValue(imagePath(id));
  await h.widget.view();
  assert.equal(h.widget.preview.alt, metadata.textoAlternativo);
  assert.match(h.widget.preview.src, /^blob:local-/);
  h.widget.reset();
  assert.equal(h.revoked.length, 1);
});

async function apiHarness(callback) {
  const calls = [];
  const api = new CatalogApi("https://api.example", {
    fetcher: async (url, options) => {
      if (url.endsWith("/auth/login"))
        return json({ accessToken: "fixture-token" });
      if (url.endsWith("/auth/perfil"))
        return json({ rol: "ADMIN", debeCambiarContrasena: false });
      calls.push({ url, options });
      return callback(url, options);
    },
  });
  await api.login("admin@example.invalid", "fixture-no-real");
  return { api, calls };
}
test("API envía multipart sin Content-Type manual, cookies ni token en URL", async () => {
  const { api, calls } = await apiHarness(async () => json(receipt()));
  await api.uploadEditorialFile(png(), metadata, operation);
  const { url, options } = calls[0];
  assert.equal(url, "https://api.example/admin/archivos");
  assert.equal(options.headers.Authorization, "Bearer fixture-token");
  assert.equal(options.headers["Content-Type"], undefined);
  assert.equal(options.credentials, "omit");
  assert.equal(options.body.get("operacionId"), operation);
  assert.equal(options.body.get("archivo").name, "imagen");
});
test("API rechaza imagen HTTP no WEBP y no conserva respuesta de una sesión cerrada", async () => {
  const wrong = await apiHarness(
    async () =>
      new Response("<html>", { headers: { "Content-Type": "text/html" } }),
  );
  await assert.rejects(wrong.api.editorialFileContent(id), /imagen válida/);
  const wait = later();
  const { api } = await apiHarness(() => wait.promise);
  const pending = api.editorialFileContent(id);
  api.logout();
  wait.resolve(
    new Response("fixture", { headers: { "Content-Type": "image/webp" } }),
  );
  await assert.rejects(pending, /cancelada/);
});
test("los editores se enlazan al selector y la CSP solo amplía imágenes a blob locales", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  for (const id of ["bank-image-upload", "lesson-image-upload"])
    assert.ok(html.includes(`id="${id}"`));
  const server = await readFile(
    new URL("../server.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(server.includes("img-src 'self' blob:"));
  assert.ok(!server.includes("img-src *"));
});
