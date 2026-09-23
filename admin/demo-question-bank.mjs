import { createHash, randomUUID } from "node:crypto";
import {
  caseFields,
  questionFields,
  questionCanonical,
} from "./public/question-fields.mjs";

export function createDemoQuestionBank({ themes, subthemes, send }) {
  const cases = [
    {
      id: "demo-case1",
      area: "MATEMATICAS",
      titulo: "Compras en la papelería",
      contexto:
        "Tres cuadernos cuestan 12000 pesos. Todos tienen el mismo precio.",
      imagenUrl: "",
      estadoContenido: "BORRADOR",
    },
  ];
  const questions = [];
  const hash = (row) =>
    createHash("sha256").update(JSON.stringify(row)).digest("hex");
  const caseView = (row, direct = false) => {
    const count = questions.filter((q) => q.casoId === row.id).length;
    return {
      ...row,
      preguntas: count,
      editable:
        (direct ? row.estadoContenido !== "ARCHIVADO" : row.estadoContenido === "BORRADOR" && !row.fechaPublicacion) &&
        count === 0,
      revision: hash([row, count]),
    };
  };
  const questionView = (row, direct = false) => {
    const sub = subthemes.find((s) => s.id === row.subtemaId),
      theme = themes.find((t) => t.id === sub.temaId);
    const caso = cases.find((c) => c.id === row.casoId) ?? null;
    return {
      ...row,
      area: theme.area,
      caso,
      editable:
        (direct ? row.estadoContenido !== "ARCHIVADO" : row.estadoContenido === "BORRADOR" && !row.fechaPublicacion && !row.usoDemo) &&
        sub.nombre.toLowerCase() !== "banco general" &&
        theme.nombre.toLowerCase() !== "banco general" &&
        sub.estadoContenido !== "ARCHIVADO" &&
        theme.estadoContenido !== "ARCHIVADO",
      revision: hash([row, sub, theme, caso]),
    };
  };
  const handler = (req, res, url, body, direct = false) => {
    const match =
      /^\/api\/admin\/editor\/(preguntas|casos)(?:\/([^/]+))?$/.exec(
        url.pathname,
      );
    if (!match) return false;
    const [, kind, id] = match;
    const collection = kind === "preguntas" ? questions : cases;
    const view = (value) => (kind === "preguntas" ? questionView : caseView)(value, direct);
    const row = id
      ? collection.find((item) => item.id === decodeURIComponent(id))
      : null;
    if (id && !row) {
      send(res, 404, {});
      return true;
    }
    if (req.method === "GET") {
      if (row) {
        send(res, 200, view(row));
        return true;
      }
      const pagina = Number(url.searchParams.get("pagina") || 1),
        limite = Number(url.searchParams.get("limite") || 20);
      const sub = subthemes.find(
        (s) => s.id === url.searchParams.get("subtemaId"),
      );
      if (
        !Number.isInteger(pagina) ||
        pagina < 1 ||
        pagina > 10000 ||
        !Number.isInteger(limite) ||
        limite < 1 ||
        limite > 100
      ) {
        send(res, 400, {});
        return true;
      }
      if (kind === "preguntas" && !sub) {
        send(res, 404, {});
        return true;
      }
      const theme = sub && themes.find((t) => t.id === sub.temaId);
      const rows = collection
        .filter((item) => !direct || item.estadoContenido !== "ARCHIVADO")
        .filter((item) =>
          kind === "preguntas"
            ? item.subtemaId === sub.id
            : item.area === url.searchParams.get("area"),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      send(res, 200, {
        pagina,
        limite,
        hayMas: rows.length > pagina * limite,
        items: rows.slice((pagina - 1) * limite, pagina * limite).map((item) =>
          kind === "preguntas"
            ? {
                id: item.id,
                subtemaId: item.subtemaId,
                enunciado: item.enunciado,
                estadoContenido: item.estadoContenido,
              }
            : {
                id: item.id,
                area: item.area,
                titulo: item.titulo,
                estadoContenido: item.estadoContenido,
              },
        ),
        ...(sub
          ? {
              subtema: {
                id: sub.id,
                nombre: sub.nombre,
                area: theme.area,
                permiteCrear:
                  sub.estadoContenido !== "ARCHIVADO" &&
                  theme.estadoContenido !== "ARCHIVADO",
              },
            }
          : {}),
      });
      return true;
    }
    if (!((req.method === "POST" && !id) || (req.method === "PATCH" && id))) {
      send(res, 405, {});
      return true;
    }
    if (row && body.revision !== view(row).revision) {
      send(res, 409, { code: "EDITOR_STALE" });
      return true;
    }
    if (row && !view(row).editable) {
      send(res, 400, {});
      return true;
    }
    try {
      const fields =
        kind === "preguntas" ? questionFields(body) : caseFields(body);
      if (
        row &&
        row[kind === "preguntas" ? "subtemaId" : "area"] !==
          fields[kind === "preguntas" ? "subtemaId" : "area"]
      )
        throw new Error();
      if (kind === "preguntas") {
        const sub = subthemes.find((s) => s.id === fields.subtemaId),
          theme = sub && themes.find((t) => t.id === sub.temaId);
        if (
          !theme ||
          sub.nombre.toLowerCase() === "banco general" ||
          theme.nombre.toLowerCase() === "banco general" ||
          sub.estadoContenido === "ARCHIVADO" ||
          theme.estadoContenido === "ARCHIVADO"
        )
          throw new Error();
        if (fields.casoId) {
          const caso = cases.find((c) => c.id === fields.casoId);
          if (
            !caso ||
            caso.area !== theme.area ||
            (direct ? caso.estadoContenido !== "PUBLICADO" : caso.estadoContenido === "ARCHIVADO")
          )
            throw new Error();
          if (
            questions.some(
              (q) =>
                q.id !== id &&
                (!direct || q.estadoContenido !== "ARCHIVADO") &&
                q.casoId === fields.casoId &&
                q.ordenEnCaso === fields.ordenEnCaso,
            )
          ) {
            send(res, 409, { code: "CASE_ORDER_TAKEN" });
            return true;
          }
        }
        const canonical = questionCanonical(theme.area, fields);
        const duplicate = questions.find(
          (q) =>
            q.id !== id &&
            (!direct || q.estadoContenido !== "ARCHIVADO") &&
            questionCanonical(questionView(q).area, q) === canonical,
        );
        if (duplicate) {
          send(res, 409, {
            code: "DUPLICATE_QUESTION",
            duplicate: {
              id: duplicate.id,
              subtemaId: duplicate.subtemaId,
              estadoContenido: duplicate.estadoContenido,
            },
          });
          return true;
        }
        fields.huellaContenido = createHash("sha256")
          .update(canonical)
          .digest("hex");
        if (!id) sub._count.preguntas++;
        if (direct) {
          for (const parent of [sub, theme]) {
            parent.estadoContenido = "PUBLICADO";
            parent.fechaPublicacion ??= new Date().toISOString();
          }
        }
      }
      if (kind === "preguntas" && !fields.casoId) fields.ordenEnCaso = null;
      const replace = direct && row && kind === "preguntas";
      if (replace) row.estadoContenido = "ARCHIVADO";
      if (row && !replace) Object.assign(row, fields, { editorVersion: randomUUID() }, direct ? { estadoContenido: "PUBLICADO", fechaPublicacion: row.fechaPublicacion ?? new Date().toISOString() } : {});
      else
        collection.push({
          ...fields,
          id: randomUUID(),
          estadoContenido: direct ? "PUBLICADO" : "BORRADOR",
          ...(direct ? { fechaPublicacion: new Date().toISOString() } : {}),
        });
      send(res, id ? 200 : 201, { ...view(replace ? collection.at(-1) : row ?? collection.at(-1)), ...(replace ? { reemplazaId: id } : {}) });
    } catch {
      send(res, 400, {});
    }
    return true;
  };
  handler.records = { cases, questions };
  return handler;
}
