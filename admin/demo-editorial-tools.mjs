import { createHash, randomUUID } from "node:crypto";
import {
  clozeFields,
  areas,
  hash as isHash,
  id as isId,
} from "./public/editorial-tool-fields.mjs";
import { questionCanonical } from "./public/question-fields.mjs";
import { validateName } from "./public/api.mjs";

// In-memory rehearsal only. Not a replacement for Prisma usage checks or locks.
export function createDemoEditorialTools({
  themes,
  subthemes,
  questions,
  cases,
  editorView,
  send,
}) {
  const hash = (v) =>
    createHash("sha256").update(JSON.stringify(v)).digest("hex");
  const parent = (sub) => themes.find((t) => t.id === sub.temaId);
  const sub = (q) => subthemes.find((s) => s.id === q.subtemaId);
  const area = (q) => parent(sub(q)).area;
  const generic = (s) =>
    [s.nombre, parent(s).nombre].some(
      (v) => v.toLowerCase() === "banco general",
    );
  const editable = (row) =>
    row.estadoContenido === "BORRADOR" &&
    !row.fechaPublicacion &&
    !row.usoDemo &&
    !generic(row) &&
    parent(row).estadoContenido !== "ARCHIVADO";
  const clozeView = (row) => {
    const errores = [];
    let datosInteractivo = null;
    if (row.tipoInteractivo === "CLOZE") {
      try {
        datosInteractivo = clozeFields(row.datosInteractivo);
      } catch (e) {
        errores.push(e.message);
      }
    } else if (row.datosInteractivo != null || row.tipoInteractivo)
      errores.push("Interactivo no compatible o datos sin tipo.");
    return {
      ...editorView("subtemas", row),
      editable:
        editable(row) &&
        (!row.tipoInteractivo || row.tipoInteractivo === "CLOZE"),
      motivo: editable(row)
        ? ""
        : "Solo lectura: publicado, sin clasificación específica o con uso académico.",
      tipoInteractivo: row.tipoInteractivo ?? null,
      datosInteractivo,
      errores,
    };
  };
  const fingerprint = (q) =>
    createHash("sha256")
      .update(questionCanonical(area(q), q))
      .digest("hex");
  const metadata = (q) => ({
    id: q.id,
    subtemaId: q.subtemaId,
    temaId: sub(q).temaId,
    estadoContenido: q.estadoContenido,
    requiereClasificacion: generic(sub(q)),
  });
  const pending = (a) =>
    questions
      .filter((q) => area(q) === a && !q.huellaContenido)
      .sort((a, b) => a.id.localeCompare(b.id));
  const batch = (a, limite) => {
    const all = pending(a),
      rows = all.slice(0, limite);
    return {
      area: a,
      limite,
      habilitado: true,
      revision: hash([a, limite, rows]),
      pendientesEnArea: all.length,
      hayMas: all.length > limite,
      items: rows.map((q) => ({
        ...metadata(q),
        huella: fingerprint(q),
        coincidenciasIndexadas: questions.filter(
          (o) => area(o) === a && o.huellaContenido === fingerprint(q),
        ).length,
        coincidenciasEnLote:
          rows.filter((o) => fingerprint(o) === fingerprint(q)).length - 1,
      })),
      advertencia:
        "DEMO: solo completa huellas. No borra, publica ni reclasifica. Coincidencias fuera del lote pueden aparecer después.",
    };
  };
  const location = (s) => ({
    area: parent(s).area,
    temaId: s.temaId,
    tema: parent(s).nombre,
    subtemaId: s.id,
    subtema: s.nombre,
  });
  const move = (q, dest) => {
    const bloqueos = [];
    if (
      !["BORRADOR", "ARCHIVADO"].includes(q.estadoContenido) ||
      q.fechaPublicacion ||
      q.usoDemo
    )
      bloqueos.push(
        "Contenido publicado o con uso: requiere versiones, no se mueve.",
      );
    if (q.subtemaId === dest.id) bloqueos.push("El destino debe ser distinto.");
    if (area(q) !== parent(dest).area)
      bloqueos.push("El destino debe pertenecer a la misma área.");
    if (
      generic(dest) ||
      dest.estadoContenido === "ARCHIVADO" ||
      parent(dest).estadoContenido === "ARCHIVADO"
    )
      bloqueos.push("Selecciona un destino específico y no archivado.");
    const caso = cases.find((c) => c.id === q.casoId) ?? null;
    return {
      id: q.id,
      revision: hash([q, sub(q), parent(sub(q)), dest, parent(dest), caso]),
      habilitado: true,
      puedeReclasificar: !bloqueos.length,
      bloqueos,
      advertencias: [
        "Demo con uso simulado, no comprueba el historial real. No cambia contenido, estado ni resultados.",
      ],
      pregunta: {
        enunciado: q.enunciado,
        imagenUrl: q.imagenUrl ?? null,
        explicacion: q.explicacion ?? null,
        estadoContenido: q.estadoContenido,
        respuestas: q.respuestas.map(({ texto, esCorrecta }) => ({
          texto,
          esCorrecta,
        })),
        casoId: q.casoId ?? null,
        ordenEnCaso: q.ordenEnCaso ?? null,
        caso,
      },
      origen: { ...location(sub(q)), generico: generic(sub(q)) },
      destino: location(dest),
    };
  };
  return (req, res, url, body) => {
    const path = url.pathname.slice(4);
    const cloze =
      /^\/admin\/editor\/subtemas\/([^/]+)\/cloze(\/retirar)?$/.exec(path);
    const index =
      /^\/admin\/editor\/legado\/indice\/(lote|duplicados|coincidencias\/([a-f0-9]{64}))$/.exec(
        path,
      );
    const reclass =
      /^\/admin\/editor\/reclasificacion\/preguntas\/([^/]+)$/.exec(path);
    if (!cloze && !index && !reclass) return false;
    const fail = (status = 400) => {
      send(res, status, {});
      return true;
    };
    try {
      if (cloze) {
        const row = subthemes.find(
          (s) => s.id === decodeURIComponent(cloze[1]),
        );
        if (!row) return fail(404);
        if (req.method === "GET" && !cloze[2]) {
          send(res, 200, clozeView(row));
          return true;
        }
        if (req.method !== "PATCH") return fail(405);
        if (body.revision !== clozeView(row).revision) return fail(409);
        if (!clozeView(row).editable) return fail();
        if (cloze[2]) {
          if (body.confirmado !== true) return fail();
          row.tipoInteractivo = null;
          row.datosInteractivo = null;
        } else {
          row.datosInteractivo = clozeFields(body.datosInteractivo);
          row.tipoInteractivo = "CLOZE";
        }
        row.editorVersion = randomUUID();
        send(res, 200, clozeView(row));
        return true;
      }
      if (index) {
        const a =
          req.method === "POST" ? body.area : url.searchParams.get("area");
        const limit = Number(
          req.method === "POST"
            ? body.limite
            : url.searchParams.get("limite") ||
                (index[1] === "duplicados" ? 10 : 25),
        );
        const after = url.searchParams.get("despues");
        if (
          !areas.includes(a) ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > (index[1] === "duplicados" ? 20 : 100)
        )
          return fail();
        if (index[1] === "lote") {
          const preview = batch(a, limit);
          if (req.method === "GET") {
            send(res, 200, preview);
            return true;
          }
          if (req.method !== "POST") return fail(405);
          if (body.confirmado !== true || !isHash(body.revision)) return fail();
          if (body.revision !== preview.revision) return fail(409);
          preview.items.forEach((r) => {
            questions.find((q) => q.id === r.id).huellaContenido = r.huella;
          });
          send(res, 200, {
            area: a,
            indexadas: preview.items.length,
            ids: preview.items.map((r) => r.id),
            pendientesEnArea: pending(a).length,
            advertencia:
              "DEMO: indexación completada en memoria; revisa los duplicados.",
          });
          return true;
        }
        if (req.method !== "GET") return fail(405);
        const indexed = questions.filter(
          (q) => area(q) === a && q.huellaContenido,
        );
        if (index[1] === "duplicados") {
          if (after && !isHash(after)) return fail();
          const groups = [...new Set(indexed.map((q) => q.huellaContenido))]
            .sort()
            .map((huella) => ({
              huella,
              cantidad: indexed.filter((q) => q.huellaContenido === huella)
                .length,
            }))
            .filter((g) => g.cantidad > 1 && (!after || g.huella > after));
          const items = groups.slice(0, limit),
            hayMas = groups.length > limit;
          send(res, 200, {
            area: a,
            items,
            hayMas,
            siguiente: hayMas ? items.at(-1).huella : null,
            pendientesEnArea: pending(a).length,
            advertencia:
              "Incluye archivadas; reinicia el informe al indexar otro lote.",
          });
          return true;
        }
        if (after && !isId(after)) return fail();
        const rows = indexed
          .filter(
            (q) => q.huellaContenido === index[2] && (!after || q.id > after),
          )
          .sort((a, b) => a.id.localeCompare(b.id));
        const items = rows.slice(0, limit).map(metadata),
          hayMas = rows.length > limit;
        send(res, 200, {
          area: a,
          huella: index[2],
          items,
          hayMas,
          siguiente: hayMas ? items.at(-1).id : null,
        });
        return true;
      }
      const q = questions.find((q) => q.id === decodeURIComponent(reclass[1]));
      const dest = subthemes.find(
        (s) =>
          s.id ===
          (req.method === "PATCH"
            ? body.destinoSubtemaId
            : url.searchParams.get("destinoSubtemaId")),
      );
      if (!q || !dest) return fail(404);
      const preview = move(q, dest);
      if (req.method === "GET") {
        send(res, 200, preview);
        return true;
      }
      if (req.method !== "PATCH") return fail(405);
      if (body.confirmado !== true) return fail();
      if (body.revision !== preview.revision) return fail(409);
      if (!preview.puedeReclasificar) return fail(409);
      validateName(dest.nombre);
      validateName(parent(dest).nombre);
      const origenSubtemaId = q.subtemaId;
      sub(q)._count.preguntas--;
      dest._count.preguntas++;
      q.subtemaId = dest.id;
      q.editorVersion = randomUUID();
      send(res, 200, {
        pregunta: {
          id: q.id,
          subtemaId: q.subtemaId,
          estadoContenido: q.estadoContenido,
          fechaActualizacion: new Date().toISOString(),
        },
        origenSubtemaId,
        mensaje:
          "DEMO: clasificación actualizada sin publicar ni modificar contenido.",
      });
      return true;
    } catch {
      return fail();
    }
  };
}
