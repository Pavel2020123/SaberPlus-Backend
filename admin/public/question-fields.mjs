import { referenceUrl } from "./lesson-fields.mjs";
const key = (text) =>
  text.normalize("NFKC").trim().toLocaleLowerCase("es-CO").replace(/\s+/g, " ");
function field(value, limit, required = true) {
  if (
    typeof value !== "string" ||
    value.length > limit ||
    value.includes("\u0000") ||
    (required && !value.trim())
  )
    throw new Error(
      `Completa los textos requeridos y respeta el límite de ${limit} caracteres.`,
    );
  return value.trim();
}
export function caseFields(value) {
  if (
    ![
      "LECTURA_CRITICA",
      "MATEMATICAS",
      "SOCIALES_CIUDADANAS",
      "CIENCIAS_NATURALES",
      "INGLES",
    ].includes(value.area)
  )
    throw new Error("Selecciona un área.");
  return {
    area: value.area,
    titulo: field(value.titulo, 200),
    contexto: field(value.contexto, 20000),
    imagenUrl: referenceUrl(value.imagenUrl),
  };
}
export function questionFields(value) {
  if (
    !Array.isArray(value.respuestas) ||
    value.respuestas.length < 2 ||
    value.respuestas.length > 6 ||
    value.respuestas.some((row) => typeof row.esCorrecta !== "boolean") ||
    value.respuestas.filter((row) => row.esCorrecta).length !== 1
  )
    throw new Error(
      "Escribe de 2 a 6 opciones y marca exactamente una correcta.",
    );
  const respuestas = value.respuestas.map((row) => ({
    texto: field(row.texto, 4000),
    esCorrecta: row.esCorrecta,
    explicacion: field(row.explicacion, 4000, false),
  }));
  if (
    new Set(respuestas.map((row) => key(row.texto))).size !== respuestas.length
  )
    throw new Error("Las opciones no pueden repetirse.");
  if (!["BASICO", "MEDIO", "AVANZADO"].includes(value.dificultad))
    throw new Error("Selecciona una dificultad.");
  const casoId = field(value.casoId, 120, false);
  if (
    (casoId &&
      (!Number.isInteger(value.ordenEnCaso) ||
        value.ordenEnCaso < 1 ||
        value.ordenEnCaso > 10000)) ||
    (!casoId && value.ordenEnCaso != null)
  )
    throw new Error(
      "El orden debe ser un entero de 1 a 10000 solo cuando hay un caso.",
    );
  return {
    subtemaId: field(value.subtemaId, 120),
    enunciado: field(value.enunciado, 12000),
    explicacion: field(value.explicacion, 12000),
    imagenUrl: referenceUrl(value.imagenUrl),
    dificultad: value.dificultad,
    respuestas,
    casoId,
    ...(casoId ? { ordenEnCaso: value.ordenEnCaso } : {}),
  };
}
// Mirrors question-fingerprint-v1 for the isolated demo only. Backend is authority.
export function questionCanonical(area, value) {
  return [
    "saberplus-question-v1",
    key(area),
    key(value.enunciado),
    key(value.imagenUrl || ""),
    ...value.respuestas
      .map((row) => [key(row.texto), ""].join("\u001e"))
      .sort(),
  ].join("\u001f");
}
