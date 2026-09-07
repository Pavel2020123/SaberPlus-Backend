import { createHash, randomUUID } from "node:crypto";
import {
  questionFields,
  caseFields,
  questionCanonical,
} from "./public/question-fields.mjs";
import { referenceUrl } from "./public/lesson-fields.mjs";
import { validateName } from "./public/api.mjs";

export function createDemoEditorialReview({
  themes,
  subthemes,
  cases,
  questions,
  send,
}) {
  const transitions = {
    BORRADOR: ["EN_REVISION", "ARCHIVADO"],
    EN_REVISION: ["BORRADOR", "PUBLICADO", "ARCHIVADO"],
    PUBLICADO: ["ARCHIVADO"],
    ARCHIVADO: ["BORRADOR"],
  };
  const review = (tipo, row) => {
    const sub =
      tipo === "preguntas"
        ? subthemes.find((s) => s.id === row.subtemaId)
        : tipo === "subtemas"
          ? row
          : null;
    const theme = sub
      ? themes.find((t) => t.id === sub.temaId)
      : tipo === "temas"
        ? row
        : null;
    const area = theme?.area ?? row.area,
      caso =
        tipo === "preguntas" ? cases.find((c) => c.id === row.casoId) : null;
    const bloqueos = [],
      advertencias = [
        "Demo local: nada se publica en Supabase. Revisa exactitud, derechos y accesibilidad.",
      ],
      contenido = [];
    let dependientes = 0;
    const check = (value, message) => {
      if (!value) bloqueos.push(message);
    };
    if (tipo === "temas" || tipo === "subtemas") {
      try {
        validateName(row.nombre);
        if (theme) validateName(theme.nombre);
      } catch {
        bloqueos.push("Clasificación académica pendiente.");
      }
      contenido.push(row.nombre, row.contenido ?? "");
      if (tipo === "subtemas") {
        check(
          theme.estadoContenido === "PUBLICADO",
          "Publica primero el tema padre.",
        );
        if (!row.contenido)
          advertencias.push(
            "El subtema no tiene lección; se publicará su estructura.",
          );
      }
      dependientes =
        tipo === "temas"
          ? subthemes.filter(
              (s) => s.temaId === row.id && s.estadoContenido === "PUBLICADO",
            ).length
          : questions.filter(
              (q) =>
                q.subtemaId === row.id && q.estadoContenido === "PUBLICADO",
            ).length;
    }
    if (tipo === "casos") {
      try {
        caseFields(row);
      } catch {
        bloqueos.push(
          "El caso necesita título, contexto y referencias válidas.",
        );
      }
      contenido.push(row.titulo, row.contexto);
      dependientes = questions.filter(
        (q) => q.casoId === row.id && q.estadoContenido === "PUBLICADO",
      ).length;
    }
    if (tipo === "preguntas") {
      try {
        questionFields(row);
      } catch {
        bloqueos.push(
          "Revisa enunciado, explicación, opciones, correcta y referencias.",
        );
      }
      check(
        sub.estadoContenido === "PUBLICADO" &&
          theme.estadoContenido === "PUBLICADO",
        "Publica primero el tema y el subtema.",
      );
      if (caso) {
        check(
          caso.estadoContenido === "PUBLICADO" && caso.area === area,
          "Publica primero un caso de la misma área.",
        );
        contenido.push(caso.titulo, caso.contexto);
      }
      if (row.casoId)
        check(
          !!caso &&
            !questions.some(
              (q) =>
                q.id !== row.id &&
                q.casoId === row.casoId &&
                q.ordenEnCaso === row.ordenEnCaso,
            ),
          "Caso u orden inválidos.",
        );
      const canonical = questionCanonical(area, row);
      const duplicate = questions.find(
        (q) =>
          q.id !== row.id &&
          q.estadoContenido !== "ARCHIVADO" &&
          questionCanonical(
            themes.find(
              (t) =>
                t.id === subthemes.find((s) => s.id === q.subtemaId).temaId,
            ).area,
            q,
          ) === canonical,
      );
      if (duplicate) bloqueos.push(`Pregunta coincidente: ${duplicate.id}.`);
      contenido.push(
        row.enunciado,
        ...row.respuestas.map(
          (option, i) =>
            `${i + 1}. ${option.texto}${option.esCorrecta ? " [CORRECTA]" : ""}\n${option.explicacion}`,
        ),
        `Explicación: ${row.explicacion}`,
      );
    }
    for (const value of [row.imagenUrl, row.videoUrl, caso?.imagenUrl].filter(
      Boolean,
    )) {
      try {
        referenceUrl(value);
      } catch {
        bloqueos.push("Recurso inválido: usa HTTPS.");
      }
      contenido.push(`Recurso: ${value}`);
    }
    if (row.fechaPublicacion && row.estadoContenido !== "PUBLICADO")
      advertencias.push(
        "Ya estuvo publicado; volver a borrador no habilita editarlo como nuevo.",
      );
    if (dependientes)
      advertencias.push(
        `Archiva primero sus ${dependientes} dependiente(s) publicado(s). No hay cascada.`,
      );
    return {
      tipo,
      id: row.id,
      area,
      estadoContenido: row.estadoContenido,
      habilitado: true,
      revision: createHash("sha256")
        .update(JSON.stringify([tipo, row, sub, theme, caso, dependientes]))
        .digest("hex"),
      destinos: transitions[row.estadoContenido].filter(
        (state) =>
          (state !== "PUBLICADO" || !bloqueos.length) &&
          (state !== "ARCHIVADO" || !dependientes),
      ),
      bloqueos,
      advertencias,
      contenido: contenido.filter((text) => typeof text === "string"),
    };
  };
  return (req, res, url, body) => {
    const match =
      /^\/api\/admin\/editor\/revision\/(temas|subtemas|preguntas|casos)\/([^/]+)$/.exec(
        url.pathname,
      );
    if (!match) return false;
    const [, tipo, id] = match;
    const row = {
      temas: themes,
      subtemas: subthemes,
      preguntas: questions,
      casos: cases,
    }[tipo].find((item) => item.id === decodeURIComponent(id));
    if (!row) {
      send(res, 404, {});
      return true;
    }
    const detail = review(tipo, row);
    if (req.method === "GET") {
      send(res, 200, detail);
      return true;
    }
    if (req.method !== "PATCH") {
      send(res, 405, {});
      return true;
    }
    if (body.confirmado !== true || !transitions[body.destino]) {
      send(res, 400, {});
      return true;
    }
    if (body.revision !== detail.revision) {
      send(res, 409, { code: "EDITOR_STALE" });
      return true;
    }
    if (!detail.destinos.includes(body.destino)) {
      send(res, 400, {});
      return true;
    }
    row.estadoContenido = body.destino;
    row.editorVersion = randomUUID();
    if (body.destino === "PUBLICADO")
      row.fechaPublicacion ??= new Date().toISOString();
    send(res, 200, review(tipo, row));
    return true;
  };
}
