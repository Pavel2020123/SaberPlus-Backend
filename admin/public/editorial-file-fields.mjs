export const fileUuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    value,
  );
export const managedImageId = (value) =>
  /^\/recursos\/editoriales\/([a-f0-9-]{36})$/i.exec(value ?? "")?.[1] ?? null;
export const imagePath = (id) => `/recursos/editoriales/${id}`;
export function fileReference(value) {
  const text = typeof value === "string" ? value.trim() : "";
  const id = managedImageId(text) ?? text;
  if (!fileUuid(id)) throw new Error("Copia la referencia de una imagen cargada en SaberPlus o su identificador.");
  return id.toLowerCase();
}
export function revocationFields(value) {
  const detalle = value?.detalle?.trim();
  if (!["SEGURIDAD", "DERECHOS"].includes(value?.motivo) || !detalle || detalle.length > 500 || /[\p{Cc}\p{Cf}]/u.test(detalle))
    throw new Error("Selecciona el motivo y escribe un detalle interno de 1 a 500 caracteres, sin caracteres de control.");
  return { motivo: value.motivo, detalle };
}
export function revocationReceipt(row, id, operationId) {
  if (!fileUuid(row?.archivoId) || !fileUuid(row?.operacionId) || row.archivoId !== id || row.operacionId !== operationId ||
      typeof row.creadoEn !== "string" || !/^\d{4}-\d\d-\d\dT/.test(row.creadoEn) || !Number.isFinite(Date.parse(row.creadoEn)))
    throw new Error("No pudimos validar la revocación. Consulta el recibo antes de repetirla.");
  revocationFields(row);
  return row;
}
export function fileMetadata(value) {
  const result = {};
  for (const [key, limit] of [
    ["titulo", 120],
    ["textoAlternativo", 500],
    ["fuente", 500],
    ["titular", 255],
  ]) {
    const text = value[key]?.trim();
    if (!text || text.length > limit || /[\p{Cc}\p{Cf}]/u.test(text))
      throw new Error(
        `Completa ${{ titulo: "el título", textoAlternativo: "la descripción de la imagen", fuente: "la fuente", titular: "el autor o titular" }[key]} y respeta su límite de ${limit} caracteres.`,
      );
    result[key] = text;
  }
  if (
    ![
      "ORIGINAL",
      "LICENCIA",
      "DOMINIO_PUBLICO",
      "AUTORIZACION_ESCRITA",
    ].includes(value.autorizacion)
  )
    throw new Error("Indica el permiso de uso de la imagen.");
  result.autorizacion = value.autorizacion;
  const reference = value.referenciaAutorizacion?.trim();
  if (result.autorizacion !== "ORIGINAL" && !reference)
    throw new Error("Indica la referencia del permiso de uso.");
  if (reference) {
    if (reference.length > 2000 || /[\p{Cc}\p{Cf}]/u.test(reference))
      throw new Error("La referencia admite hasta 2000 caracteres.");
    result.referenciaAutorizacion = reference;
  }
  return result;
}
export function fileReceipt(row, expectedOperation, expectedId) {
  if (
    !fileUuid(row?.id) ||
    !fileUuid(row?.operacionId) ||
    (expectedOperation && row.operacionId !== expectedOperation) ||
    (expectedId && row.id !== expectedId) ||
    !["PREPARADO", "DISPONIBLE", "RETIRADO", "REVOCADO"].includes(row.estado) ||
    row.tipo !== "image/webp" ||
    !Number.isInteger(row.bytes) ||
    row.bytes <= 0 ||
    row.bytes > 2097152 ||
    !Number.isInteger(row.ancho) ||
    !Number.isInteger(row.alto) ||
    row.ancho <= 0 ||
    row.alto <= 0 ||
    row.ancho > 2560 ||
    row.alto > 2560 ||
    row.contenidoUrl !==
      (row.estado === "DISPONIBLE"
        ? `/admin/archivos/${row.id}/contenido`
        : null) ||
    row.puedeReintentar !== (row.estado === "PREPARADO")
  )
    throw new Error(
      "No pudimos validar el recibo de la imagen. Consulta la carga antes de repetirla.",
    );
  fileMetadata(row);
  return row;
}
