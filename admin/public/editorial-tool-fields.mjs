export const areas = [
  "LECTURA_CRITICA",
  "MATEMATICAS",
  "SOCIALES_CIUDADANAS",
  "CIENCIAS_NATURALES",
  "INGLES",
];
export const states = ["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"];
export const hash = (value) =>
  typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export const id = (value) =>
  typeof value === "string" && value.length > 0 && value.length <= 120;
export const strings = (value) =>
  Array.isArray(value) && value.every((v) => typeof v === "string");
export const count = (value) => Number.isSafeInteger(value) && value >= 0;
export function requireValid(
  valid,
  message = "No pudimos validar la respuesta. Consulta de nuevo antes de reenviar.",
) {
  if (!valid) throw new Error(message);
}
function object(value, keys) {
  requireValid(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === keys.length &&
      keys.every((key) => Object.hasOwn(value, key)),
    "CLOZE: estructura incompleta o campos desconocidos.",
  );
  return value;
}
function text(value, max) {
  requireValid(
    typeof value === "string" &&
      value.trim() &&
      value.length <= max &&
      !/[\p{Cc}\p{Cf}]/u.test(value.replace(/[\t\r\n]/g, "")),
    `CLOZE: escribe texto visible de hasta ${max} caracteres.`,
  );
  return value.trim();
}
export function clozeFields(value) {
  const data = object(value, ["textoConEspacios", "espacios"]);
  const textoConEspacios = text(data.textoConEspacios, 12000);
  requireValid(
    Array.isArray(data.espacios) &&
      data.espacios.length >= 1 &&
      data.espacios.length <= 20,
    "Incluye entre 1 y 20 espacios.",
  );
  const markers = textoConEspacios.match(/_{3,}/g) ?? [];
  requireValid(
    markers.length === data.espacios.length &&
      markers.every((m) => m === "___"),
    "Usa exactamente un marcador ___ por espacio, de izquierda a derecha.",
  );
  const espacios = data.espacios.map((value, i) => {
    const blank = object(value, ["opciones", "correctaIndex"]);
    requireValid(
      Array.isArray(blank.opciones) &&
        blank.opciones.length >= 2 &&
        blank.opciones.length <= 6,
      `Espacio ${i + 1}: incluye 2–6 opciones.`,
    );
    const opciones = blank.opciones.map((v) => text(v, 500));
    const keys = opciones.map((v) =>
      v.normalize("NFKC").toLocaleLowerCase("es-CO").replace(/\s+/g, " "),
    );
    requireValid(
      new Set(keys).size === keys.length,
      `Espacio ${i + 1}: las opciones se repiten.`,
    );
    requireValid(
      Number.isInteger(blank.correctaIndex) &&
        blank.correctaIndex >= 0 &&
        blank.correctaIndex < opciones.length,
      `Espacio ${i + 1}: selecciona la respuesta correcta.`,
    );
    return { opciones, correctaIndex: blank.correctaIndex };
  });
  return { textoConEspacios, espacios };
}
export function clozeDetail(row, selected, parent) {
  requireValid(
    row?.id === selected &&
      row.temaId === parent &&
      areas.includes(row.area) &&
      hash(row.revision) &&
      typeof row.editable === "boolean" &&
      states.includes(row.estadoContenido) &&
      ["nombre", "motivo", "contenido", "videoUrl", "imagenUrl"].every(
        (key) => typeof row[key] === "string",
      ) &&
      strings(row.errores) &&
      (row.tipoInteractivo === null || typeof row.tipoInteractivo === "string"),
  );
  if (row.datosInteractivo !== null) {
    requireValid(row.tipoInteractivo === "CLOZE");
    clozeFields(row.datosInteractivo);
  }
  return row;
}
export function metadata(row) {
  return (
    id(row?.id) &&
    id(row.subtemaId) &&
    id(row.temaId) &&
    states.includes(row.estadoContenido) &&
    typeof row.requiereClasificacion === "boolean"
  );
}
export function batchDetail(row, area, limit) {
  requireValid(
    row?.area === area &&
      row.limite === limit &&
      hash(row.revision) &&
      typeof row.habilitado === "boolean" &&
      typeof row.hayMas === "boolean" &&
      count(row.pendientesEnArea) &&
      typeof row.advertencia === "string" &&
      Array.isArray(row.items) &&
      row.items.length <= limit &&
      new Set(row.items.map((v) => v.id)).size === row.items.length &&
      row.items.every(
        (v) =>
          metadata(v) &&
          hash(v.huella) &&
          count(v.coincidenciasIndexadas) &&
          count(v.coincidenciasEnLote),
      ),
  );
  return row;
}
export function cursorPage(row, area, fingerprint, after) {
  const matches = fingerprint !== undefined;
  requireValid(
    row?.area === area &&
      (!matches || row.huella === fingerprint) &&
      typeof row.hayMas === "boolean" &&
      Array.isArray(row.items) &&
      row.items.length <= (matches ? 25 : 10) &&
      row.items.every((v) =>
        matches
          ? metadata(v)
          : hash(v.huella) && count(v.cantidad) && v.cantidad > 1,
      ) &&
      (matches ||
        (count(row.pendientesEnArea) && typeof row.advertencia === "string")),
  );
  const keys = row.items.map((v) => (matches ? v.id : v.huella));
  requireValid(
    new Set(keys).size === keys.length &&
      (row.hayMas
        ? keys.length > 0 &&
          row.siguiente === keys.at(-1) &&
          row.siguiente !== after
        : row.siguiente === null),
  );
  return row;
}
export function reclassificationDetail(row, selected, destination) {
  const location = (v) =>
    v &&
    areas.includes(v.area) &&
    id(v.temaId) &&
    id(v.subtemaId) &&
    typeof v.tema === "string" &&
    typeof v.subtema === "string";
  requireValid(
    row?.id === selected &&
      row.destino?.subtemaId === destination &&
      hash(row.revision) &&
      typeof row.habilitado === "boolean" &&
      typeof row.puedeReclasificar === "boolean" &&
      strings(row.bloqueos) &&
      strings(row.advertencias) &&
      location(row.origen) &&
      location(row.destino) &&
      row.origen.area === row.destino.area &&
      (!row.puedeReclasificar || (row.habilitado && row.bloqueos.length === 0)),
  );
  const q = row.pregunta;
  requireValid(
    q &&
      typeof q.enunciado === "string" &&
      states.includes(q.estadoContenido) &&
      (q.explicacion === null || typeof q.explicacion === "string") &&
      (q.imagenUrl === null || typeof q.imagenUrl === "string") &&
      Array.isArray(q.respuestas) &&
      q.respuestas.every(
        (v) => typeof v.texto === "string" && typeof v.esCorrecta === "boolean",
      ),
  );
  if (q.caso)
    requireValid(
      typeof q.caso.contexto === "string" &&
        (q.caso.titulo === null || typeof q.caso.titulo === "string") &&
        (q.caso.imagenUrl === null || typeof q.caso.imagenUrl === "string"),
    );
  return row;
}
