import { randomUUID, createHash } from "node:crypto";
import { lessonFields } from "./public/lesson-fields.mjs";
import { validateName } from "./public/api.mjs";
import { createDemoQuestionBank } from "./demo-question-bank.mjs";
import { createDemoEditorialReview } from "./demo-editorial-review.mjs";
import { createDemoEditorialTools } from "./demo-editorial-tools.mjs";
import { createDemoInstitutionApproval } from "./demo-institution-approval.mjs";
import { demoCoverage } from "./demo-bank-coverage.mjs";
import { createDemoLearningMap } from "./demo-learning-map.mjs";

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
  const learningMap = createDemoLearningMap({ themes, subthemes, send });
  // Dedicated legacy fixtures do not mix with the empty draft lesson used by editors.
  themes.push({
    id: "demo-legacy-theme",
    nombre: "Banco General",
    area: "MATEMATICAS",
    estadoContenido: "BORRADOR",
  });
  subthemes.push({
    id: "demo-legacy-sub",
    nombre: "Banco General",
    temaId: "demo-legacy-theme",
    estadoContenido: "BORRADOR",
    _count: { preguntas: 2 },
  });
  for (const [id, estadoContenido] of [
    ["demo-legacy-q1", "BORRADOR"],
    ["demo-legacy-q2", "ARCHIVADO"],
  ]) {
    questionBank.records.questions.push({
      id,
      subtemaId: "demo-legacy-sub",
      estadoContenido,
      dificultad: "BASICO",
      enunciado: "¿Cuál es el 10 % de 200?",
      explicacion: "Diez de cada cien: el resultado es 20.",
      imagenUrl: "",
      casoId: "",
      ordenEnCaso: null,
      huellaContenido: null,
      respuestas: [
        { texto: "20", esCorrecta: true, explicacion: "" },
        { texto: "10", esCorrecta: false, explicacion: "" },
      ],
    });
  }
  for (const row of [...themes, ...subthemes])
    if (row.estadoContenido === "PUBLICADO")
      row.fechaPublicacion = "2026-09-01T00:00:00Z";
  const reviewApi = createDemoEditorialReview({
    themes,
    subthemes,
    ...questionBank.records,
    send,
  });
  const editorView = (kind, row, direct = false) => {
    const sub = kind === "subtemas";
    const parent = sub ? themes.find((theme) => theme.id === row.temaId) : null;
    const count = subthemes.filter((item) => item.temaId === row.id).length;
    const draft = row.estadoContenido === "BORRADOR" && !row.fechaPublicacion;
    const writable = direct ? row.estadoContenido !== "ARCHIVADO" : draft;
    const editable =
      sub &&
      writable &&
      parent.estadoContenido !== "ARCHIVADO" &&
      !row.tipoInteractivo &&
      row.datosInteractivo == null &&
      !row.usoDemo &&
      key(row.nombre) !== "banco general" &&
      key(parent.nombre) !== "banco general";
    const renombrable = sub
      ? editable && !row._count.preguntas
      : writable && count === 0;
    const motivoEliminacion = !writable
      ? "Solo se eliminan borradores nunca publicados. Usa Archivar."
      : key(row.nombre) === "banco general" ||
          (sub && key(parent.nombre) === "banco general")
        ? "La clasificación genérica requiere revisión del banco antiguo."
        : sub
          ? !editable ||
            row._count.preguntas ||
            row.contenido ||
            row.videoUrl ||
            row.imagenUrl
            ? "Contiene preguntas, lección, recursos, ejercicio o uso; o su tema está archivado. Solo se eliminan borradores vacíos."
            : ""
          : count
            ? "Contiene subtemas; no se eliminan en cascada."
            : "";
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
      eliminable: motivoEliminacion === "",
      motivoEliminacion,
      motivo:
        editable || renombrable
          ? ""
          : "Solo lectura: no es un borrador vacío sin uso académico.",
    };
  };
  const toolsApi = createDemoEditorialTools({
    themes,
    subthemes,
    ...questionBank.records,
    editorView,
    send,
  });
  const institutionApprovals = createDemoInstitutionApproval(send);
  return async (req, res, url) => {
    let body = {};
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
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
    const direct = url.pathname.startsWith("/api/admin/simple/");
    if (direct) {
      url = new URL(url);
      url.pathname = url.pathname.replace("/admin/simple/", "/admin/");
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
    if (path === "/admin/cobertura" && req.method === "GET") {
      const area = url.searchParams.get("area");
      const pagina = Number(url.searchParams.get("pagina") ?? 1);
      const limite = Number(url.searchParams.get("limite") ?? 50);
      if (!areas.some(a => a.id === area) || !Number.isInteger(pagina) || pagina < 1 || pagina > 10000 ||
          !Number.isInteger(limite) || limite < 1 || limite > 100 ||
          [...url.searchParams.keys()].some(k => !["area","pagina","limite"].includes(k))) {
        send(res, 400, {}); return;
      }
      send(res, 200, demoCoverage({ themes, subthemes, ...questionBank.records }, area, pagina, limite));
      return;
    }
    if (institutionApprovals(req, res, url, body)) return;
    if (learningMap(req, res, url, body)) return;
    if (questionBank(req, res, url, body, direct)) return;
    if (reviewApi(req, res, url, body)) return;
    if (toolsApi(req, res, url, body)) return;
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
      const current = editorView(kind, row, direct);
      if (req.method === "GET" && !action) {
        send(res, 200, current);
        return;
      }
      if (req.method === "DELETE" && !action) {
        if (
          body.confirmado !== true ||
          !/^[a-f0-9]{64}$/.test(body.revision ?? "")
        ) {
          send(res, 400, {});
        } else if (body.revision !== current.revision) {
          send(res, 409, {});
        } else if (!current.eliminable) {
          send(res, 400, {});
        } else {
          collection.splice(collection.indexOf(row), 1);
          send(res, 200, {
            id: row.id,
            tipo: kind,
            area: current.area,
            temaId: current.temaId,
            eliminado: true,
          });
        }
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
        if (direct) {
          row.estadoContenido = "PUBLICADO";
          row.fechaPublicacion ??= new Date().toISOString();
          if (kind === "subtemas") {
            const parent = themes.find((t) => t.id === row.temaId);
            parent.estadoContenido = "PUBLICADO";
            parent.fechaPublicacion ??= new Date().toISOString();
          }
        }
        send(res, 200, editorView(kind, row, direct));
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
          : !parent || parent.estadoContenido === "ARCHIVADO" || key(parent.nombre) === "banco general")
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
        estadoContenido: direct ? "PUBLICADO" : "BORRADOR",
        ...(direct ? { fechaPublicacion: new Date().toISOString() } : {}),
        ...(themeMode
          ? { area: body.area }
          : { temaId: body.temaId, _count: { preguntas: 0 } }),
      };
      collection.push(row);
      if (direct && parent && !themeMode) {
        parent.estadoContenido = "PUBLICADO";
        parent.fechaPublicacion ??= new Date().toISOString();
      }
      send(res, 201, row);
      return;
    }
    send(res, 404, {});
  };
}
