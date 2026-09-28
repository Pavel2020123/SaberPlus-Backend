const el = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
const button = (text, action) => { const n = el('button', text); n.type = 'button'; n.onclick = action; return n; };
const ids = rows => rows.map(r => r.id).sort().join(',');

export class LearningMapEditor {
  constructor({api, host, setBusy = () => {}, confirm = message => globalThis.confirm(message)}) {
    Object.assign(this, {api, host, setBusy, confirm}); this.epoch = 0; this.search = 0;
    this.selected = []; this.snapshot = null; this.saving = false; this.blocked = false;
  }
  get dirty() { return Boolean(this.snapshot && ids(this.selected) !== ids(this.snapshot.previos)); }
  get pending() { return this.dirty || this.saving || this.blocked; }
  close(force = false) {
    if (!force && (this.saving || (this.pending && !this.confirm('¿Salir del mapa sin guardar los cambios pendientes?')))) return false;
    this.epoch++; this.search++; this.snapshot = null; this.selected = []; this.blocked = false;
    if (this.saving) this.setBusy(false);
    this.saving = false; this.host.hidden = true; this.host.replaceChildren(); return true;
  }
  async open(target) {
    this.target = target; this.host.hidden = false; this.themePage = 1; this.subPage = 1;
    this.status = el('p'); this.status.setAttribute('role', 'status');
    this.bases = el('ul'); this.route = el('ol'); this.candidates = el('div');
    this.saveButton = button('Guardar mapa', () => void this.save());
    this.reloadButton = button('Recargar mapa guardado', () => void this.reload());
    this.host.replaceChildren(el('h2', `Mapa de aprendizaje · ${target.nombre}`),
      el('p', 'Selecciona hasta 8 subtemas que conviene estudiar antes. Es una recomendación: no bloquea lecciones ni cambia el progreso.'),
      this.status, el('h3', 'Bases recomendadas'), this.bases, this.saveButton, this.reloadButton,
      el('h3', 'Buscar bases en esta misma área'), this.candidates,
      el('h3', 'Recorrido guardado'), el('p', 'Este recorrido se actualiza después de guardar e incluye las bases de las bases.'), this.route);
    const epoch = this.epoch + 1;
    await this.reload(false);
    if (!this.host.hidden && epoch === this.epoch) await this.loadThemes();
  }
  render() {
    this.bases.replaceChildren();
    if (!this.selected.length) this.bases.append(el('li', 'Sin bases recomendadas.'));
    for (const row of this.selected) {
      const item = el('li', `${row.tema} / ${row.nombre}${row.disponible === false ? ' · No disponible' : ''} `);
      const remove = button('Quitar', () => { if (this.saving) return; this.selected = this.selected.filter(r => r.id !== row.id); this.render(); });
      remove.disabled = this.saving; item.append(remove); this.bases.append(item);
    }
    this.saveButton.disabled = !this.snapshot || !this.dirty || this.saving || this.blocked;
    this.reloadButton.disabled = this.saving;
    this.route.replaceChildren(...(this.snapshot?.recorrido ?? []).map(r => el('li', `${r.tema} / ${r.nombre}${r.disponible ? '' : ' · No disponible'}`)));
  }
  async reload(ask = true) {
    if (this.saving || (ask && this.pending && !this.confirm('¿Descartar la selección local y recargar el mapa guardado?'))) return;
    const epoch = ++this.epoch; this.snapshot = null; this.render(); this.status.textContent = 'Consultando mapa…';
    try {
      const result = await this.api.learningMap(this.target.id, this.target.area);
      if (epoch !== this.epoch) return;
      this.snapshot = result; this.selected = [...result.previos]; this.blocked = false;
      this.status.textContent = `Mapa guardado · revisión ${result.revision}.`;
    } catch { if (epoch === this.epoch) this.status.textContent = 'No se pudo consultar el mapa. Recarga para volver a intentarlo.'; }
    if (epoch === this.epoch) this.render();
  }
  async save() {
    if (!this.snapshot || !this.dirty || this.saving || this.blocked) return;
    const epoch = this.epoch; this.saving = true; this.setBusy(true); this.render();
    try {
      const result = await this.api.learningMap(this.target.id, this.target.area,
        {revision:this.snapshot.revision, previos:this.selected.map(r => r.id)});
      if (epoch !== this.epoch) return;
      this.snapshot = result; this.selected = [...result.previos]; this.status.textContent = 'Mapa guardado. No se ha bloqueado ningún contenido.';
    } catch (error) {
      if (epoch !== this.epoch) return;
      this.blocked = error.status !== 400;
      this.status.textContent = error.status === 400
        ? 'No se pudo guardar: verifica que las bases estén publicadas y que no formen un ciclo de recomendaciones.'
        : 'No se pudo confirmar el guardado o el mapa cambió. Recarga el mapa antes de volver a guardar; se conserva tu selección mientras tanto.';
    } finally { if (epoch === this.epoch) { this.saving = false; this.setBusy(false); this.render(); } }
  }
  async loadThemes() { await this.loadCandidates('temas', this.target.area, this.themePage); }
  async loadCandidates(kind, parent, page) {
    const search = ++this.search, epoch = this.epoch;
    this.candidates.replaceChildren(el('p', 'Consultando catálogo…'));
    try {
      const data = await this.api.page(kind, parent, page);
      if (search !== this.search || epoch !== this.epoch) return;
      this.candidates.replaceChildren(el('p', `${kind === 'temas' ? 'Temas' : 'Subtemas'} · página ${page}`));
      if (kind === 'subtemas') this.candidates.append(button('Volver a temas', () => void this.loadThemes()));
      if (!data.items.length) this.candidates.append(el('p', 'No hay registros en esta página.'));
      for (const row of data.items) {
        const available = row.estadoContenido === 'PUBLICADO' && !row.requiereClasificacion;
        const b = button(`${kind === 'subtemas' ? 'Agregar: ' : ''}${row.nombre}${available ? '' : ' · No publicado'}`, () => {
          if (this.saving) return;
          if (kind === 'temas') { this.candidateTheme = row; void this.loadCandidates('subtemas', row.id, 1); return; }
          if (!this.snapshot || this.selected.some(r => r.id === row.id)) return;
          if (this.selected.length >= 8) { this.status.textContent = 'Puedes recomendar como máximo 8 bases directas.'; return; }
          this.selected.push({...row, tema:this.candidateTheme.nombre, disponible:true}); this.render();
        });
        b.disabled = !available || row.id === this.target.id || (kind === 'subtemas' && data.tema?.estadoContenido !== 'PUBLICADO');
        this.candidates.append(b);
      }
      for (const [label, next, disabled] of [['Anterior', page-1, page<=1], ['Siguiente', page+1, !data.hayMas || page>=10000]]) {
        const b = button(label, () => { if (kind === 'temas') this.themePage = next; void this.loadCandidates(kind, parent, next); });
        b.disabled = disabled; this.candidates.append(b);
      }
    } catch { if (search === this.search && epoch === this.epoch) this.candidates.replaceChildren(el('p', 'No se pudo consultar el catálogo.'), button('Reintentar', () => void this.loadCandidates(kind, parent, page))); }
  }
}
