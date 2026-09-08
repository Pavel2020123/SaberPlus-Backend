import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAdminServer, validateApiBase } from "../server.mjs";
import { CatalogApi, PanelError, validateName } from "../public/api.mjs";

async function serve(t, options) {
  const server = createAdminServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}
const response = (body, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("fetch nativo conserva el receptor global al acceder y consultar la demo", async (t) => {
  const origin = await serve(t, { demo: true });
  const nativeFetch = globalThis.fetch;
  let calls = 0;
  t.mock.method(globalThis, "fetch", function (...args) {
    if (this !== globalThis) throw new TypeError("Illegal invocation");
    calls++;
    return Reflect.apply(nativeFetch, globalThis, args);
  });
  const api = new CatalogApi(`${origin}/api`);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  assert.equal(api.authenticated, true);
  assert.equal((await api.areas()).length, 5);
  assert.equal(calls, 3);
});

test("fallos de red o JSON durante el acceso no sugieren contenido guardado ni reintentan", async () => {
  for (const phase of ["login", "perfil"]) {
    for (const failure of ["network", "json"]) {
      let calls = 0;
      const api = new CatalogApi("/api", {
        fetcher: async (url) => {
          calls++;
          if (url.endsWith(`/${phase}`)) {
            if (failure === "network") throw new TypeError("Failed to fetch");
            return new Response("not JSON", { status: 200 });
          }
          return response({ accessToken: "fixture-token" });
        },
      });
      await assert.rejects(
        api.login("demo@saberplus.invalid", "fixture"),
        (error) => {
          assert.ok(error instanceof PanelError);
          assert.match(error.message, /confirmar el acceso/);
          assert.doesNotMatch(error.message, /guardado|catálogo|fixture-token/);
          return true;
        },
      );
      assert.equal(api.authenticated, false);
      assert.equal(calls, phase === "login" ? 1 : 2);
    }
  }
});

test("timeout de acceso no se presenta como una escritura editorial", async () => {
  let calls = 0;
  const api = new CatalogApi("/api", {
    timeoutMs: 10,
    fetcher: async (_url, options) => {
      calls++;
      return new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      );
    },
  });
  await assert.rejects(
    api.login("demo@saberplus.invalid", "fixture"),
    /confirmar el acceso/,
  );
  assert.equal(api.authenticated, false);
  assert.equal(calls, 1);
});

test("acepta HTTPS y HTTP únicamente en loopback, sin credenciales", () => {
  assert.equal(validateApiBase("https://example.com/"), "https://example.com");
  assert.equal(
    validateApiBase("http://localhost:3000"),
    "http://localhost:3000",
  );
  for (const value of [
    "http://example.com",
    "https://user:pass@example.com",
    "https://example.com?token=x",
    "https://example.com/path",
    "file:///secret",
    "https://example.com/#secret",
  ])
    assert.throws(() => validateApiBase(value));
});

test("solo sirve archivos permitidos, con CSP y sin caché de sesión", async (t) => {
  const origin = await serve(t, { apiBase: "https://api.example.com" });
  const page = await fetch(origin);
  assert.equal(page.status, 200);
  assert.match(
    page.headers.get("content-security-policy"),
    /connect-src 'self' https:\/\/api.example.com/,
  );
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("x-frame-options"), "DENY");
  assert.match(await page.text(), /Catálogo académico/);
  for (const path of [
    "/.env.local",
    "/server.mjs",
    "/package.json",
    "/api/auth/perfil",
    "/%2e%2e/backend/.env.local",
  ])
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  assert.equal((await fetch(origin, { method: "POST" })).status, 405);
  const config = await (await fetch(`${origin}/config.js`)).text();
  assert.match(config, /"demo":false/);
  assert.doesNotMatch(config, /DATABASE_URL|JWT_SECRET/);
});

test("demo permite catálogo y borradores; duplicados devuelven 409 y nunca publica", async (t) => {
  const origin = await serve(t, { demo: true });
  const api = new CatalogApi(`${origin}/api`);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  assert.equal(api.authenticated, true);
  assert.equal((await api.areas()).length, 5);
  const created = await api.create("temas", "MATEMATICAS", "  Probabilidad  ");
  assert.equal(created.estadoContenido, "BORRADOR");
  assert.equal(created.nombre, "Probabilidad");
  await assert.rejects(
    api.create("temas", "MATEMATICAS", "PROBABILIDAD"),
    (error) => error.status === 409,
  );
  const sub = await api.create(
    "subtemas",
    created.id,
    "Eventos independientes",
  );
  assert.equal(sub.estadoContenido, "BORRADOR");
  const page = await api.page("subtemas", created.id);
  assert.equal(page.items[0].temaId, created.id);
  api.logout();
  assert.equal(api.authenticated, false);
  assert.throws(() => api.create("temas", "INGLES", "Nuevo"), /Inicia sesión/);
});

test("la demo pagina más de 20 temas sin perder el ámbito", async (t) => {
  const origin = await serve(t, { demo: true });
  const api = new CatalogApi(`${origin}/api`);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  for (let i = 0; i < 21; i++)
    await api.create(
      "temas",
      "LECTURA_CRITICA",
      `Tema ${String(i).padStart(2, "0")}`,
    );
  const first = await api.page("temas", "LECTURA_CRITICA", 1);
  const second = await api.page("temas", "LECTURA_CRITICA", 2);
  assert.equal(first.items.length, 20);
  assert.equal(first.hayMas, true);
  assert.equal(second.items.length, 1);
  assert.equal(second.hayMas, false);
  assert.equal(
    new Set([...first.items, ...second.items].map((row) => row.id)).size,
    21,
  );
});

test("demo elimina solo temas/subtemas vacíos con revisión; protege hijos y contenido", async (t) => {
  const origin = await serve(t, { demo: true });
  const api = new CatalogApi(`${origin}/api`);
  const unauth = await fetch(`${origin}/api/admin/editor/temas/missing`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revision: "a".repeat(64), confirmado: true }),
  });
  assert.equal(unauth.status, 401);
  await api.login("demo@saberplus.invalid", "solo-demostracion");
  const theme = await api.create("temas", "INGLES", "Eliminar ensayo");
  const before = await api.editor("temas", theme.id, "INGLES");
  assert.equal(before.eliminable, true);
  const sub = await api.create("subtemas", theme.id, "Subtema vacío");
  await assert.rejects(
    api.removeDraft("temas", theme.id, "INGLES", before.revision, true),
    (e) => e.status === 409,
  );
  const parent = await api.editor("temas", theme.id, "INGLES");
  assert.equal(parent.eliminable, false);
  await assert.rejects(
    api.removeDraft("temas", theme.id, "INGLES", parent.revision, true),
    (e) => e.status === 400,
  );
  let detail = await api.editor("subtemas", sub.id, theme.id);
  await assert.rejects(
    api.removeDraft("subtemas", sub.id, theme.id, detail.revision, "true"),
  );
  detail = await api.editor("subtemas", sub.id, theme.id, {
    revision: detail.revision,
    contenido: "Contenido propio",
    videoUrl: "",
    imagenUrl: "",
  });
  assert.equal(detail.eliminable, false);
  await assert.rejects(
    api.removeDraft("subtemas", sub.id, theme.id, detail.revision, true),
    (e) => e.status === 400,
  );
  detail = await api.editor("subtemas", sub.id, theme.id, {
    revision: detail.revision,
    contenido: "",
    videoUrl: "",
    imagenUrl: "",
  });
  await api.removeDraft("subtemas", sub.id, theme.id, detail.revision, true);
  await assert.rejects(
    api.editor("subtemas", sub.id, theme.id),
    (e) => e.status === 404,
  );
  const empty = await api.editor("temas", theme.id, "INGLES");
  assert.equal(empty.eliminable, true);
  await api.removeDraft("temas", theme.id, "INGLES", empty.revision, true);
  assert.equal(
    (await api.page("temas", "INGLES")).items.some((r) => r.id === theme.id),
    false,
  );
});

test("eliminación verifica comprobante y diferencia pérdida de respuesta sin reintentar", async () => {
  for (const invalid of [true, false]) {
    let deletes = 0;
    const api = new CatalogApi("/api", {
      fetcher: async (url, options) => {
        if (url.endsWith("/login"))
          return response({ accessToken: "fixture-token" });
        if (url.endsWith("/perfil"))
          return response({ rol: "ADMIN", debeCambiarContrasena: false });
        assert.equal(options.method, "DELETE");
        assert.deepEqual(JSON.parse(options.body), {
          revision: "a".repeat(64),
          confirmado: true,
        });
        deletes++;
        if (invalid)
          return response({
            id: "otro",
            tipo: "temas",
            area: "INGLES",
            eliminado: true,
          });
        throw new Error("network");
      },
    });
    await api.login("demo@saberplus.invalid", "fixture");
    await assert.rejects(
      api.removeDraft("temas", "t1", "INGLES", "a".repeat(64), true),
      /eliminación/,
    );
    assert.equal(deletes, 1);
  }
});

test("un nuevo servidor demo no conserva datos del anterior", async (t) => {
  const first = await serve(t, { demo: true });
  const second = await serve(t, { demo: true });
  const api1 = new CatalogApi(`${first}/api`),
    api2 = new CatalogApi(`${second}/api`);
  for (const api of [api1, api2])
    await api.login("demo@saberplus.invalid", "solo-demostracion");
  await api1.create("temas", "CIENCIAS_NATURALES", "Solo en primera instancia");
  assert.equal(
    (await api2.page("temas", "CIENCIAS_NATURALES")).items.length,
    0,
  );
});

test("el perfil del servidor debe confirmar ADMIN antes de conservar sesión", async () => {
  const api = new CatalogApi("https://api.example.com", {
    fetcher: async (url) =>
      response(
        url.endsWith("/login")
          ? { accessToken: "fixture-token" }
          : { rol: "PROFESOR", debeCambiarContrasena: false },
      ),
  });
  await assert.rejects(api.login("profesor@example.com", "fixture"), /ADMIN/);
  assert.equal(api.authenticated, false);
});

test("el panel no acepta contraseñas temporales pendientes de cambio", async () => {
  const api = new CatalogApi("/api", {
    fetcher: async (url) =>
      response(
        url.endsWith("/login")
          ? { accessToken: "fixture-token" }
          : { rol: "ADMIN", debeCambiarContrasena: true },
      ),
  });
  await assert.rejects(api.login("admin@example.com", "fixture"), /contraseña/);
  assert.equal(api.authenticated, false);
});

test("401 protegido borra sesión y notifica, sin reintentar escrituras", async () => {
  let expired = 0,
    calls = 0;
  const api = new CatalogApi("/api", {
    onSessionExpired: () => expired++,
    fetcher: async (url) => {
      calls++;
      return url.endsWith("/login")
        ? response({ accessToken: "fixture-token" })
        : url.endsWith("/perfil")
          ? response({
              rol: "ADMIN",
              nombre: "Editor",
              debeCambiarContrasena: false,
            })
          : response({}, 401);
    },
  });
  await api.login("admin@example.com", "fixture");
  await assert.rejects(
    api.create("temas", "INGLES", "Gramática"),
    (error) => error.status === 401,
  );
  assert.equal(api.authenticated, false);
  assert.equal(expired, 1);
  assert.equal(calls, 3);
});

test("una respuesta tardía no revive una sesión cerrada", async () => {
  let finish;
  const api = new CatalogApi("/api", {
    fetcher: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  const pending = api.login("admin@example.com", "fixture");
  api.logout();
  finish(response({ accessToken: "late-fixture" }));
  await assert.rejects(pending, /cancelada/);
  assert.equal(api.authenticated, false);
});

test("timeout de escritura se informa como resultado no confirmado", async () => {
  const api = new CatalogApi("/api", {
    timeoutMs: 10,
    fetcher: async (url, options) => {
      if (url.endsWith("/login"))
        return response({ accessToken: "fixture-token" });
      if (url.endsWith("/perfil"))
        return response({ rol: "ADMIN", debeCambiarContrasena: false });
      return new Promise((resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new Error("timeout")),
        ),
      );
    },
  });
  await api.login("admin@example.com", "fixture");
  await assert.rejects(
    api.create("temas", "INGLES", "Gramática"),
    /podría haberse guardado/,
  );
});

test("valida nombres y no guarda token o contraseña en almacenamiento del navegador", async () => {
  assert.equal(validateName("  Regla   de tres "), "Regla de tres");
  for (const name of ["", "Banco General", "x".repeat(121), "a\u200bb"])
    assert.throws(() => validateName(name), PanelError);
  const app = await readFile(
    new URL("../public/app.mjs", import.meta.url),
    "utf8",
  );
  const client = await readFile(
    new URL("../public/api.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    app + client,
    /localStorage|sessionStorage|document\.cookie|innerHTML|insertAdjacentHTML/,
  );
  assert.match(app, /textContent/);
});

test("todos los IDs utilizados por la interfaz existen en el HTML", async () => {
  const html = await readFile(
    new URL("../public/index.html", import.meta.url),
    "utf8",
  );
  const app = await readFile(
    new URL("../public/app.mjs", import.meta.url),
    "utf8",
  );
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of app.matchAll(/\$\(["']([^"']+)["']\)/g))
    assert.ok(ids.includes(id), `ID ausente: ${id}`);
  assert.doesNotMatch(html, /\sonclick=|<script[^>]*>\s*[^<\s]/);
});

test("no acepta páginas de otra área ni datos duplicados o incompletos", async () => {
  let body;
  const api = new CatalogApi("/api", {
    fetcher: async (url) =>
      url.endsWith("/login")
        ? response({ accessToken: "fixture-token" })
        : url.endsWith("/perfil")
          ? response({ rol: "ADMIN", debeCambiarContrasena: false })
          : response(body),
  });
  await api.login("admin@example.com", "fixture");
  const row = {
    id: "t1",
    nombre: "Gramática",
    area: "INGLES",
    estadoContenido: "BORRADOR",
    requiereClasificacion: false,
  };
  for (const items of [
    [row],
    [{ ...row, area: "MATEMATICAS", nombre: "" }],
    [
      { ...row, area: "MATEMATICAS" },
      { ...row, area: "MATEMATICAS" },
    ],
  ]) {
    body = { pagina: 1, limite: 20, hayMas: false, items };
    await assert.rejects(api.page("temas", "MATEMATICAS"), /validar/);
  }
});

test("envía Bearer solo después del login y no usa cookies ni redirecciones", async () => {
  const calls = [];
  const api = new CatalogApi("/api", {
    fetcher: async (url, options) => {
      calls.push(options);
      if (url.endsWith("/login"))
        return response({ accessToken: "fixture-token" });
      if (url.endsWith("/perfil"))
        return response({ rol: "ADMIN", debeCambiarContrasena: false });
      return response({
        id: "t1",
        nombre: "Gramática",
        estadoContenido: "BORRADOR",
      });
    },
  });
  await api.login("admin@example.com", "fixture");
  await api.create("temas", "INGLES", "Gramática");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.equal(calls[2].headers.Authorization, "Bearer fixture-token");
  assert.deepEqual(JSON.parse(calls[2].body), {
    nombre: "Gramática",
    area: "INGLES",
  });
  for (const options of calls) {
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
  }
  assert.doesNotMatch(JSON.stringify(api), /fixture-token|fixture/);
});
