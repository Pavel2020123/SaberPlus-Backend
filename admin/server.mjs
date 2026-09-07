import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { createDemoApi } from "./demo-api.mjs";

const assets = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.mjs", ["app.mjs", "text/javascript; charset=utf-8"]],
  ["/api.mjs", ["api.mjs", "text/javascript; charset=utf-8"]],
  [
    "/lesson-fields.mjs",
    ["lesson-fields.mjs", "text/javascript; charset=utf-8"],
  ],
  [
    "/lesson-editor.mjs",
    ["lesson-editor.mjs", "text/javascript; charset=utf-8"],
  ],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]],
]);

export function validateApiBase(value) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    !["https:", "http:"].includes(url.protocol) ||
    (url.protocol === "http:" &&
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
  ) {
    throw new Error(
      "API_BASE_URL debe ser un origen HTTPS, o HTTP solo en localhost, sin credenciales.",
    );
  }
  return url.origin;
}

export function createAdminServer({
  apiBase = "http://localhost:3000",
  demo = false,
} = {}) {
  const base = demo ? "/api" : validateApiBase(apiBase);
  const demoApi = demo ? createDemoApi() : null;
  const server = createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    res.setHeader(
      "Content-Security-Policy",
      `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self' ${demo ? "" : base}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    );
    try {
      const url = new URL(req.url, "http://localhost");
      if (demoApi && url.pathname.startsWith("/api/")) {
        await demoApi(req, res, url);
        return;
      }
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405, { Allow: "GET, HEAD" }).end();
        return;
      }
      if (url.pathname === "/config.js") {
        res.setHeader("Content-Type", "text/javascript; charset=utf-8");
        res.end(
          req.method === "HEAD"
            ? ""
            : `globalThis.SABERPLUS_CONFIG = Object.freeze(${JSON.stringify({ apiBase: base, demo })});`,
        );
        return;
      }
      const asset = assets.get(url.pathname);
      if (!asset) {
        res.writeHead(404).end("No encontrado");
        return;
      }
      const content = await readFile(
        new URL(`./public/${asset[0]}`, import.meta.url),
      );
      res.setHeader("Content-Type", asset[1]);
      res.end(req.method === "HEAD" ? "" : content);
    } catch {
      res.writeHead(500).end("No se pudo atender la solicitud.");
    }
  });
  return server;
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  const demo = process.argv.includes("--demo");
  const port = Number(process.env.ADMIN_PORT || 4173);
  const host = demo ? "127.0.0.1" : process.env.ADMIN_HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("ADMIN_PORT no es válido.");
  const server = createAdminServer({ apiBase: process.env.API_BASE_URL, demo });
  server.listen(port, host, () => {
    console.log(
      `SaberPlus editorial: http://${host}:${port} (${demo ? "DEMO aislada" : "API real; solo acceso ADMIN"})`,
    );
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => server.close());
}
