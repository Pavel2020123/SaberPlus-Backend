import { randomUUID, createHash } from "node:crypto";
import { lessonFields } from "./public/lesson-fields.mjs";
import { validateName } from "./public/api.mjs";
import { createDemoQuestionBank } from "./demo-question-bank.mjs";
import { createDemoEditorialReview } from "./demo-editorial-review.mjs";

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
  const questionBank = createDemoQuestionBank({ themes, subthemes, send });
  for (const row of [...themes, ...subthemes])
    if (row.estadoContenido === "PUBLICADO")
      row.fechaPublicacion = "2026-09-01T00:00:00Z";
  const reviewApi = createDemoEditorialReview({
    themes,
    subthemes,
    ...questionBank.records,
    send,
  });
  const editorView = (kind, row) => {
    const sub = kind === "subtemas";
    const parent = sub ? themes.find((theme) => theme.id === row.temaId) : null;
    const count = subthemes.filter((item) => item.temaId === row.id).length;
    const draft = row.estadoContenido === "BORRADOR" && !row.fechaPublicacion;
    const editable = sub && draft && parent.estadoContenido !== "ARCHIVADO";
    const renombrable = sub
      ? editable && !row._count.preguntas
      : draft && count === 0;
    return {
      id: row.id,
      nombre: row.nombre,
      estadoContenido: row.estadoContenido,
      area: sub ? parent.area : row.area,
      temaId: sub ? row.temaId : null,
      contenido: row.contenido ?? "",
      videoUrl: row.videoUrl ?? "",
      imagenUrl: row.imagenUrl ?? "",
      revision: createHash("sha256")
        .update(JSON.stringify([row, parent, count]))
        .digest("hex"),
      editable,
      renombrable,
      motivo:
        editable || renombrable
          ? ""
          : "Solo lectura: no es un borrador vacío sin uso académico.",
    };
  };
  return async (req, res, url) => {
    let body = {};
    if (["POST", "PATCH"].includes(req.method)) {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 200000) {
          send(res, 413, {});
          return;
        }
      }
      try {
        body = JSON.parse(raw);
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Error();
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
    if (questionBank(req, res, url, body)) return;
    if (reviewApi(req, res, url, body)) return;
    const editorMatch =
      /^\/admin\/editor\/(temas|subtemas)\/([^/]+)(?:\/(nombre|leccion))?$/.exec(
        path,
      );
    if (editorMatch) {
      const [, kind, id, action] = editorMatch;
      const collection = kind === "temas" ? themes : subthemes;
      const row = collection.find((item) => item.id === decodeURIComponent(id));
      if (!row) {
        send(res, 404, {});
        return;
      }
      const current = editorView(kind, row);
      if (req.method === "GET" && !action) {
        send(res, 200, current);
        return;
      }
      if (req.method !== "PATCH" || !action) {
        send(res, 405, {});
        return;
      }
      if (body.revision !== current.revision) {
        send(res, 409, {});
        return;
      }
      try {
        if (action === "nombre") {
          if (!current.renombrable) throw new Error();
          const nombre = validateName(body.nombre);
          if (
            collection.some(
              (item) =>
                item.id !== row.id &&
                key(item.nombre) === key(nombre) &&
                (kind === "temas"
                  ? item.area === row.area
                  : item.temaId === row.temaId),
            )
          ) {
            send(res, 409, {});
            return;
          }
          row.nombre = nombre;
        } else {
          if (!current.editable) throw new Error();
          Object.assign(row, lessonFields(body));
        }
        row.editorVersion = randomUUID();
        send(res, 200, editorView(kind, row));
      } catch {
        send(res, 400, {});
      }
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
        items: rows.slice((page - 1) * limit, page * limit).map((row) => ({
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
