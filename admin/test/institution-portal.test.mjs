import test from "node:test";
import assert from "node:assert/strict";
import { CatalogApi, PanelError } from "../public/api.mjs";
const response = (value) => new Response(JSON.stringify(value));

test("lecturas del portal usan solo rutas de ámbito propio y sesión existente", async () => {
  const calls = [];
  const api = new CatalogApi("/api", {
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/login")) return response({ accessToken: "synthetic" });
      if (url.endsWith("/perfil"))
        return response({
          rol: "PROFESOR",
          nombre: "Profe",
          debeCambiarContrasena: false,
        });
      return response([]);
    },
  });
  assert.throws(() => api.institutionRead("grupos"), PanelError);
  await api.loginCuentas("profe@example.invalid", "synthetic");
  for (const section of ["contexto", "grupos", "resumen"])
    await api.institutionRead(section);
  assert.deepEqual(
    calls.slice(2).map((item) => item.url),
    [
      "/api/instituciones/profesor/contexto",
      "/api/instituciones/me/grupos",
      "/api/instituciones/me/analiticas-basicas",
    ],
  );
  for (const { options } of calls.slice(2))
    assert.equal(
      new Headers(options.headers).get("Authorization"),
      "Bearer synthetic",
    );
  for (const invalid of [
    "../otro",
    "constructor",
    "__proto__",
    "grupos?institucionId=otra",
  ])
    assert.throws(() => api.institutionRead(invalid), PanelError);
  api.logout();
  assert.throws(() => api.institutionRead("contexto"), PanelError);
});

test("portal no consulta datos institucionales en modo demo", () => {
  const api = new CatalogApi("/api", {
    demo: true,
    fetcher: () => assert.fail("No debe enviar red"),
  });
  assert.throws(() => api.institutionRead("contexto"), PanelError);
});

test("403 institucional conserva sesión e historial; 401 sí cierra sesión", async () => {
  let expired = 0,
    status = 403;
  const api = new CatalogApi("/api", {
    onSessionExpired: () => expired++,
    fetcher: async (url) => {
      if (url.endsWith("/login")) return response({ accessToken: "synthetic" });
      if (url.endsWith("/perfil"))
        return response({ rol: "PROFESOR", debeCambiarContrasena: false });
      return new Response(
        JSON.stringify({ message: "Acción restringida por institución" }),
        { status },
      );
    },
  });
  await api.loginCuentas("profe@example.invalid", "synthetic");
  await assert.rejects(
    api.institutionRead("grupos"),
    (error) => error.status === 403,
  );
  assert.equal(api.authenticated, true);
  assert.equal(expired, 0);
  status = 401;
  await assert.rejects(
    api.institutionRead("grupos"),
    (error) => error.status === 401,
  );
  assert.equal(api.authenticated, false);
  assert.equal(expired, 1);
});

test("prioridades y evidencia tienen rutas acotadas y POST explícito sin reintento", async () => {
  const calls = [];
  const api = new CatalogApi("/api", {
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith("/login")) return response({ accessToken: "synthetic" });
      if (url.endsWith("/perfil"))
        return response({
          rol: "PROFESOR",
          nombre: "Profe",
          debeCambiarContrasena: false,
        });
      return response({});
    },
  });
  await api.loginCuentas("profe@example.invalid", "synthetic");
  const id = "6f6b2070-45a8-41ee-a27a-6da3380e8dc4";
  await api.institutionEvidence(id);
  await api.institutionPriorities(id, "catalogo?pagina=1&area=MATEMATICAS");
  await api.institutionPriorities(id, "", {
    id,
    temaId: "tema",
    venceEn: "2026-11-05T18:00:00Z",
  });
  assert.equal(calls.at(-1).options.method, "POST");
  await api.institutionPriorities(id, `${id}/retirar`);
  assert.equal(calls.at(-1).options.method, "POST");
  assert.equal(calls.length, 6);
  for (const action of [
    "../otro",
    "?pagina=0",
    "?pagina=1&institucionId=otra",
    "catalogo?pagina=1&area=OTRA",
  ])
    assert.throws(() => api.institutionPriorities(id, action), PanelError);
  assert.throws(() => api.institutionEvidence("../otro"), PanelError);
  api.logout();
  assert.throws(() => api.institutionPriorities(id), PanelError);
});
