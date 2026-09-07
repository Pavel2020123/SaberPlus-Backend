export function referenceUrl(value) {
  if (typeof value !== "string" || value.length > 2000)
    throw new Error("La referencia admite hasta 2000 caracteres.");
  const result = value.trim();
  if (!result) return "";
  let url;
  try {
    url = new URL(result);
  } catch {
    throw new Error("Escribe una URL HTTPS completa.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    /[\s\p{Cc}\p{Cf}]/u.test(result)
  )
    throw new Error("Usa HTTPS, sin credenciales ni espacios en la URL.");
  return url.href;
}

export function lessonFields(fields) {
  if (
    typeof fields.contenido !== "string" ||
    fields.contenido.length > 30000 ||
    fields.contenido.includes("\u0000")
  )
    throw new Error(
      "La lección admite hasta 30000 caracteres, sin caracteres nulos.",
    );
  return {
    contenido: fields.contenido,
    videoUrl: referenceUrl(fields.videoUrl),
    imagenUrl: referenceUrl(fields.imagenUrl),
  };
}

// Intentionally limited Markdown preview. All text is rendered as text nodes;
// HTML, inline images and links are never interpreted or fetched here.
export function previewBlocks(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading)
        return { tag: `h${heading[1].length + 1}`, text: heading[2] };
      const bullet = /^[-*]\s+(.+)$/.exec(line);
      return { tag: "p", text: bullet ? `• ${bullet[1]}` : line };
    });
}
