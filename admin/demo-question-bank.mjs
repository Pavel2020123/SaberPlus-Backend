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
  const caseView = (row) => {
    const count = questions.filter((q) => q.casoId === row.id).length;
    return {
      ...row,
      preguntas: count,
      editable: row.estadoContenido === "BORRADOR" && count === 0,
      revision: hash([row, count]),
    };
  };
  const questionView = (row) => {
    const sub = subthemes.find((s) => s.id === row.subtemaId),
      theme = themes.find((t) => t.id === sub.temaId);
    const caso = cases.find((c) => c.id === row.casoId) ?? null;
    return {
      ...row,
      area: theme.area,
      caso,
      editable:
        row.estadoContenido === "BORRADOR" &&
        sub.estadoContenido !== "ARCHIVADO" &&
        theme.estadoContenido !== "ARCHIVADO",
      revision: hash([row, sub, theme, caso]),
    };
  };
  return (req, res, url, body) => {
    const match =
      /^\/api\/admin\/editor\/(preguntas|casos)(?:\/([^/]+))?$/.exec(
        url.pathname,
      );
    if (!match) return false;
    const [, kind, id] = match;
    const collection = kind === "preguntas" ? questions : cases;
    const view = kind === "preguntas" ? questionView : caseView;
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
        items: rows
          .slice((pagina - 1) * limite, pagina * limite)
          .map((item) =>
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
          sub.estadoContenido === "ARCHIVADO" ||
          theme.estadoContenido === "ARCHIVADO"
        )
          throw new Error();
        if (fields.casoId) {
          const caso = cases.find((c) => c.id === fields.casoId);
          if (
            !caso ||
            caso.area !== theme.area ||
            caso.estadoContenido === "ARCHIVADO"
          )
            throw new Error();
          if (
            questions.some(
              (q) =>
                q.id !== id &&
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
        if (!id) sub._count.preguntas++;
      }
      if (kind === "preguntas" && !fields.casoId) fields.ordenEnCaso = null;
      if (row) Object.assign(row, fields, { editorVersion: randomUUID() });
      else
        collection.push({
          ...fields,
          id: randomUUID(),
          estadoContenido: "BORRADOR",
        });
      send(res, id ? 200 : 201, view(row ?? collection.at(-1)));
    } catch {
      send(res, 400, {});
    }
    return true;
  };
}
