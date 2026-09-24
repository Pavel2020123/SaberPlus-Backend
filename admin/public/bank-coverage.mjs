const areas = [
  ["LECTURA_CRITICA", "Lectura crítica"], ["MATEMATICAS", "Matemáticas"],
  ["SOCIALES_CIUDADANAS", "Sociales y ciudadanas"], ["CIENCIAS_NATURALES", "Ciencias naturales"], ["INGLES", "Inglés"],
];
const levels = { BASICO: "Básico", MEDIO: "Medio", AVANZADO: "Avanzado" };
const states = ["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"];
const integer = n => Number.isSafeInteger(n) && n >= 0;
export function validateCoverage(data, area, page) {
  if (!data || data.area !== area || data.pagina !== page || data.limite !== 20 ||
      !integer(data.totalSubtemas) || typeof data.hayMas !== "boolean" ||
      data.hayMas !== (page * 20 < data.totalSubtemas) || data.reportesDisponibles !== false ||
      !Array.isArray(data.items) || data.items.length > 20 ||
      data.items.length !== Math.min(20, Math.max(0, data.totalSubtemas - (page - 1) * 20)) ||
      new Set(data.items.map(r => r?.id)).size !== data.items.length) throw new Error("Cobertura inválida.");
  for (const row of data.items) {
    if (!row || typeof row.id !== "string" || !row.id || typeof row.nombre !== "string" ||
        !states.includes(row.estadoContenido) || !row.tema || typeof row.tema.id !== "string" ||
        typeof row.tema.nombre !== "string" || !states.includes(row.tema.estadoContenido) ||
        !["total","publicadas","noDisponibles","sinExplicacion"].every(k => integer(row[k])) ||
        row.total !== row.publicadas + row.noDisponibles || row.sinExplicacion > row.publicadas ||
        !row.dificultades || !Object.keys(levels).every(k => integer(row.dificultades[k])) ||
        Object.keys(levels).reduce((n,k) => n + row.dificultades[k], 0) !== row.publicadas ||
        !Array.isArray(row.dificultadesFaltantes) ||
        JSON.stringify(row.dificultadesFaltantes) !== JSON.stringify(Object.keys(levels).filter(k => row.dificultades[k] === 0)) ||
        row.reportes !== null) throw new Error("Conteos de cobertura inconsistentes.");
  }
  return data;
}
const node = (tag, text = "") => { const n = document.createElement(tag); n.textContent = text; return n; };
const button = (text, action) => { const b = node("button", text); b.type = "button"; b.onclick = action; return b; };
export class BankCoverage {
  constructor({ api, host }) { this.api = api; this.host = host; this.version = 0; this.area = "MATEMATICAS"; this.page = 1; }
  close() { this.version++; this.host.hidden = true; this.host.replaceChildren(); }
  async open() {
    this.close(); this.host.hidden = false;
    const label = node("label", "Área del informe");
    const select = node("select"); select.id = "coverage-area"; label.htmlFor = select.id;
    for (const [value, title] of areas) { const o = node("option", title); o.value = value; select.append(o); }
    select.value = this.area;
    select.onchange = () => { this.area = select.value; this.page = 1; void this.load(); };
    this.status = node("p"); this.status.setAttribute("role", "status");
    this.list = node("div"); this.list.className = "coverage-grid";
    this.previous = button("← Anterior", () => { if (this.page > 1) { this.page--; void this.load(); } });
    this.next = button("Siguiente →", () => { this.page++; void this.load(); });
    this.host.append(node("h2", "Cobertura del banco"),
      node("p", "Informe de solo lectura. Publicadas = preguntas visibles con tema, subtema y contexto publicados. Los conteos no certifican calidad ni suficiencia para un juego."),
      node("p", "Sin explicación: preguntas publicadas sin explicación general. Reportes de preguntas: función pendiente, no se muestra un cero ficticio."),
      label, select, button("Actualizar cobertura", () => void this.load()), this.status, this.list, this.previous, this.next);
    await this.load();
  }
  async load() {
    const version = ++this.version, area = this.area, page = this.page;
    this.previous.disabled = this.next.disabled = true;
    this.list.replaceChildren(); this.status.textContent = "Consultando cobertura…";
    try {
      const data = validateCoverage(await this.api.coverage(area, page), area, page);
      if (version !== this.version) return;
      this.status.textContent = data.items.length ? `Página ${page} · ${data.totalSubtemas} subtemas en esta área` : "No hay subtemas en esta página.";
      for (const row of data.items) {
        const card = node("article"); card.className = "catalog-panel";
        card.append(node("h3", `${row.tema.nombre} / ${row.nombre}`),
          node("p", `Tema: ${row.tema.estadoContenido} · Subtema: ${row.estadoContenido}`),
          node("p", `Publicadas: ${row.publicadas} · No disponibles: ${row.noDisponibles} · Total almacenadas: ${row.total}`),
          node("p", Object.entries(levels).map(([key, title]) => `${title}: ${row.dificultades[key]}`).join(" · ")),
          node("p", row.dificultadesFaltantes.length ? `Sin preguntas publicadas: ${row.dificultadesFaltantes.map(k => levels[k]).join(", ")}` : "Hay preguntas publicadas de las tres dificultades."),
          node("p", `Publicadas sin explicación general: ${row.sinExplicacion}`));
        this.list.append(card);
      }
      this.previous.disabled = page <= 1; this.next.disabled = !data.hayMas || page >= 10000;
    } catch {
      if (version !== this.version) return;
      this.status.textContent = "No se pudo consultar la cobertura. Pulsa Actualizar cobertura para reintentar.";
      this.previous.disabled = page <= 1;
    }
  }
}
