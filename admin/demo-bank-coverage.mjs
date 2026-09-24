// Count the actual in-memory demo records, not the illustrative legacy _count.
export function demoCoverage({ themes, subthemes, questions, cases }, area, pagina, limite) {
  const rows = subthemes.filter(s => themes.some(t => t.id === s.temaId && t.area === area))
    .sort((a,b) => {
      const ta = themes.find(t => t.id === a.temaId), tb = themes.find(t => t.id === b.temaId);
      return ta.nombre.localeCompare(tb.nombre) || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id);
    });
  return { area, pagina, limite, totalSubtemas: rows.length, hayMas: pagina * limite < rows.length,
    reportesDisponibles: false,
    items: rows.slice((pagina - 1) * limite, pagina * limite).map(s => {
      const t = themes.find(t => t.id === s.temaId);
      const all = questions.filter(q => q.subtemaId === s.id);
      const visible = all.filter(q => q.estadoContenido === "PUBLICADO" && s.estadoContenido === "PUBLICADO" &&
        t.estadoContenido === "PUBLICADO" && (!q.casoId || cases.some(c => c.id === q.casoId && c.estadoContenido === "PUBLICADO")));
      const dificultades = Object.fromEntries(["BASICO","MEDIO","AVANZADO"].map(d => [d, visible.filter(q => q.dificultad === d).length]));
      return { id: s.id, nombre: s.nombre, estadoContenido: s.estadoContenido,
        tema: { id: t.id, nombre: t.nombre, estadoContenido: t.estadoContenido },
        total: all.length, publicadas: visible.length, noDisponibles: all.length - visible.length,
        sinExplicacion: visible.filter(q => !q.explicacion?.trim()).length,
        dificultades, dificultadesFaltantes: Object.keys(dificultades).filter(d => dificultades[d] === 0), reportes: null };
    }) };
}
