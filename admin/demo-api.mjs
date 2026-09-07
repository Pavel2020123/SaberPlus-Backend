import { randomUUID } from "node:crypto";

// Local-only fixtures. This module has no network or database dependencies.
const areas = [
  { id: "LECTURA_CRITICA", nombre: "Lectura crítica" },
  { id: "MATEMATICAS", nombre: "Matemáticas" },
  { id: "SOCIALES_CIUDADANAS", nombre: "Sociales y ciudadanas" },
  { id: "CIENCIAS_NATURALES", nombre: "Ciencias naturales" },
  { id: "INGLES", nombre: "Inglés" },
];
const key = (value) =>
  value
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[\u0301\u0308]/g, "");

export function createDemoApi() {
  const sessions = new Set();
  const themes = [
    {
      id: "demo-t1",
      nombre: "Proporcionalidad",
      area: "MATEMATICAS",
      estadoContenido: "PUBLICADO",
    },
    {
      id: "demo-t2",
      nombre: "Álgebra",
      area: "MATEMATICAS",
      estadoContenido: "BORRADOR",
    },
    {
      id: "demo-t3",
      nombre: "Participación ciudadana",
      area: "SOCIALES_CIUDADANAS",
      estadoContenido: "EN_REVISION",
    },
    {
      id: "demo-t4",
      nombre: "Gramática",
      area: "INGLES",
      estadoContenido: "PUBLICADO",
    },
  ];
  const subthemes = [
    {
      id: "demo-s1",
      nombre: "Regla de tres directa",
      temaId: "demo-t1",
      estadoContenido: "PUBLICADO",
      _count: { preguntas: 24 },
    },
    {
      id: "demo-s2",
      nombre: "Porcentajes",
      temaId: "demo-t1",
      estadoContenido: "BORRADOR",
      _count: { preguntas: 0 },
    },
    {
      id: "demo-s3",
      nombre: "Verbo to be",
      temaId: "demo-t4",
      estadoContenido: "PUBLICADO",
      _count: { preguntas: 18 },
    },
  ];
  const send = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
    });
    res.end(JSON.stringify(body));
  };
  return async (req, res, url) => {
    let body = {};
    if (req.method === "POST") {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 8192) {
          send(res, 413, {});
          return;
        }
      }
      try {
        body = JSON.parse(raw);
      } catch {
        send(res, 400, {});
        return;
      }
    }
    const path = url.pathname.slice(4);
    if (path === "/auth/login" && req.method === "POST") {
      if (
        body.correo !== "demo@saberplus.invalid" ||
        body.contrasena !== "solo-demostracion"
      ) {
        send(res, 401, {});
        return;
      }
      const accessToken = randomUUID();
      sessions.add(accessToken);
      send(res, 200, { accessToken });
      return;
    }
    if (!sessions.has(req.headers.authorization?.replace(/^Bearer /, ""))) {
      send(res, 401, {});
      return;
    }
    if (path === "/auth/perfil" && req.method === "GET") {
      send(res, 200, {
        id: "demo-admin",
        nombre: "Equipo editorial",
        rol: "ADMIN",
        debeCambiarContrasena: false,
      });
      return;
    }
    if (path === "/admin/catalogo/areas" && req.method === "GET") {
      send(res, 200, areas);
      return;
    }
    if (
      req.method === "GET" &&
      ["/admin/catalogo/temas", "/admin/catalogo/subtemas"].includes(path)
    ) {
      const page = Number(url.searchParams.get("pagina") || 1);
      const limit = Number(url.searchParams.get("limite") || 20);
      if (
        !Number.isInteger(page) ||
        page < 1 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100
      ) {
        send(res, 400, {});
        return;
      }
      const parent = themes.find(
        (theme) => theme.id === url.searchParams.get("temaId"),
      );
      if (path.endsWith("/subtemas") && !parent) {
        send(res, 404, {});
        return;
      }
      const rows = path.endsWith("/temas")
        ? themes
            .filter((theme) => theme.area === url.searchParams.get("area"))
            .map((theme) => ({
              ...theme,
              _count: {
                subtemas: subthemes.filter((s) => s.temaId === theme.id).length,
              },
            }))
        : subthemes.filter((s) => s.temaId === parent.id);
      rows.sort(
        (a, b) =>
          a.nombre.localeCompare(b.nombre, "es") || a.id.localeCompare(b.id),
      );
      send(res, 200, {
        pagina: page,
        limite: limit,
        hayMas: rows.length > page * limit,
        ...(parent ? { tema: parent } : {}),
        items: rows
          .slice((page - 1) * limit, page * limit)
          .map((row) => ({
            ...row,
            requiereClasificacion: key(row.nombre) === "banco general",
          })),
      });
      return;
    }
    if (
      req.method === "POST" &&
      ["/admin/temas", "/admin/subtemas"].includes(path)
    ) {
      const nombre =
        typeof body.nombre === "string"
          ? body.nombre.normalize("NFKC").trim().replace(/\s+/gu, " ")
          : "";
      const themeMode = path === "/admin/temas";
      const parent = themes.find((row) => row.id === body.temaId);
      if (
        !nombre ||
        nombre.length > 120 ||
        /[\p{Cc}\p{Cf}]/u.test(nombre) ||
        key(nombre) === "banco general" ||
        (themeMode
          ? !areas.some((row) => row.id === body.area)
          : !parent || parent.estadoContenido === "ARCHIVADO")
      ) {
        send(res, 400, {});
        return;
      }
      const collection = themeMode ? themes : subthemes;
      if (
        collection.some(
          (row) =>
            key(row.nombre) === key(nombre) &&
            (themeMode ? row.area === body.area : row.temaId === body.temaId),
        )
      ) {
        send(res, 409, {});
        return;
      }
      const row = {
        id: randomUUID(),
        nombre,
        estadoContenido: "BORRADOR",
        ...(themeMode
          ? { area: body.area }
          : { temaId: body.temaId, _count: { preguntas: 0 } }),
      };
      collection.push(row);
      send(res, 201, row);
      return;
    }
    send(res, 404, {});
  };
}
