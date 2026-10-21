// Proyección explícita: nunca propagar esCorrecta, explicación, FK o metadatos.
// La imagen es opcional para conservar contratos/snapshots anteriores sin cambios.
export function publicAnswerOption(option: {
  id: string;
  texto: string;
  imagenUrl?: string | null;
}) {
  return {
    id: option.id,
    texto: option.texto,
    ...(option.imagenUrl ? { imagenUrl: option.imagenUrl } : {}),
  };
}
