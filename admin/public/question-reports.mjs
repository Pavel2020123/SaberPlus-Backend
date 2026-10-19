import { reportReasons, reportStates, reportAreas, reportTransitions, reportDecision } from './question-report-fields.mjs';

const node = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
const button = (text, action) => { const n = node('button', text); n.type = 'button'; n.onclick = action; return n; };
function select(label, values, value) {
  const field = node('label', label), input = node('select');
  for (const [id, title] of Object.entries(values)) { const option = node('option', title); option.value = id; input.append(option); }
  input.value = value; field.append(input); return { field, input };
}

/** Private ADMIN incident inbox, independent of the simple publication workflow. */
export class QuestionReports {
  constructor({ api, host, confirm = message => window.confirm(message), uuid = () => globalThis.crypto.randomUUID() }) {
    Object.assign(this, { api, host, confirm, uuid });
    this.version = 0; this.detailVersion = 0; this.filters = {}; this.page = 1;
    this.busy = false; this.pending = null; this.dirty = false;
  }
  close(force = false) {
    if (!force && (this.busy || this.pending)) {
      this.status.textContent = 'Consulta o reintenta la misma decisión antes de salir de Reportes.';
      return false;
    }
    if (!force && this.dirty && !this.confirm('Hay un motivo sin guardar. ¿Salir y descartarlo?')) return false;
    this.version++; this.detailVersion++; this.busy = false; this.pending = null;
    this.record = null; this.dirty = false; this.draftText = ''; this.host.hidden = true; this.host.replaceChildren();
    return true;
  }
  async open(filters = {}) {
    if (!this.close()) return;
    this.filters = { ...filters }; this.page = 1; this.host.hidden = false;
    this.status = node('p'); this.status.setAttribute('role', 'status');
    this.list = node('div'); this.detailHost = node('section'); this.detailHost.className = 'catalog-panel';
    this.controls = [];
    const form = node('div');
    const specs = [
      ['area', 'Área', Object.fromEntries(reportAreas.map(a => [a, a.replaceAll('_', ' ')]))],
      ['estado', 'Estado', reportStates], ['motivo', 'Motivo', reportReasons],
    ];
    for (const [key, label, values] of specs) {
      const field = select(label, { '': 'Todos', ...values }, this.filters[key] ?? '');
      field.input.onchange = () => {
        if (this.busy || this.pending || !this.discard()) { field.input.value = this.filters[key] ?? ''; return; }
        this.filters[key] = field.input.value;
        if (key === 'area') { delete this.filters.subtemaId; this.subtheme.value = ''; }
        this.page = 1; void this.load();
      };
      this.controls.push(field.input); form.append(field.field);
    }
    const subLabel = node('label', 'Subtema (ID, opcional)');
    this.subtheme = node('input'); this.subtheme.maxLength = 120; this.subtheme.value = this.filters.subtemaId ?? '';
    subLabel.append(this.subtheme); form.append(subLabel);
    const apply = button('Aplicar subtema', () => {
      if (this.busy || this.pending || !this.discard()) return;
      this.filters.subtemaId = this.subtheme.value.trim(); this.page = 1; void this.load();
    });
    const refresh = button('Actualizar bandeja', () => { if (this.discard()) void this.load(); });
    this.previous = button('Anterior', () => { if (this.page > 1 && this.discard()) { this.page--; void this.load(); } });
    this.next = button('Siguiente', () => { if (this.discard()) { this.page++; void this.load(); } });
    this.controls.push(this.subtheme, apply, refresh, this.previous, this.next); form.append(apply, refresh);
    this.host.append(node('h2', 'Reportes de preguntas'),
      node('p', 'Solo ADMIN. Revisar un reporte no publica, retira ni recalifica preguntas y no cambia XP. El detalle es texto privado: no descargues medios automáticamente.'),
      form, this.status, this.list, this.previous, this.next, this.detailHost);
    await this.load();
  }
  discard() {
    if (this.busy || this.pending) return false;
    if (this.dirty && !this.confirm('Hay un motivo sin guardar. ¿Descartarlo?')) return false;
    this.dirty = false; return true;
  }
  lock() {
    for (const control of this.controls) control.disabled = this.busy || Boolean(this.pending);
    this.previous.disabled ||= this.page <= 1;
    this.next.disabled ||= !this.hasMore || this.page >= 10000;
    for (const b of this.rowButtons ?? []) b.disabled = this.busy || Boolean(this.pending);
  }
  async load() {
    if (this.busy || this.pending) return;
    const version = ++this.version; this.detailVersion++; this.record = null;
    this.busy = true; this.lock(); this.list.replaceChildren(); this.detailHost.replaceChildren();
    this.status.textContent = 'Consultando reportes…';
    try {
      const data = await this.api.questionReports({ ...this.filters }, this.page);
      if (version !== this.version) return;
      this.hasMore = data.hayMas; this.rowButtons = [];
      this.status.textContent = data.items.length ? `Página ${this.page} · ${data.items.length} reportes` : 'No hay reportes en esta página.';
      for (const row of data.items) {
        const b = button(`${reportReasons[row.motivo]} · ${reportStates[row.estado]} · ${row.preguntaId}`, () => {
          if (this.discard()) void this.show(row.id);
        });
        this.rowButtons.push(b); this.list.append(b);
      }
    } catch (error) {
      if (version === this.version) this.status.textContent = error.message || 'No pudimos consultar los reportes.';
    } finally {
      if (version === this.version) { this.busy = false; this.lock(); }
    }
  }
  async show(id, keepAttempt = false) {
    const version = ++this.detailVersion, session = this.version;
    this.busy = true; this.lock(); this.status.textContent = 'Consultando estado actual…';
    try {
      const row = await this.api.questionReport(id);
      if (session !== this.version || version !== this.detailVersion) return;
      this.record = row;
      if (!keepAttempt) { this.dirty = false; this.draftText = ''; }
      this.render(); this.status.textContent = 'Estado actual consultado.';
    } catch (error) {
      if (session === this.version && version === this.detailVersion) this.status.textContent = error.message;
    } finally {
      if (session === this.version && version === this.detailVersion) {
        this.busy = false; this.lock();
        if (this.record) this.render();
      }
    }
  }
  render() {
    const row = this.record;
    this.detailHost.replaceChildren();
    this.detailHost.append(node('h3', `${reportReasons[row.motivo]} · ${reportStates[row.estado]}`),
      node('p', `Pregunta original: ${row.preguntaId} · Revisión ${row.revision}`),
      node('p', row.detalle ?? 'Sin detalle del estudiante.'),
      node('p', 'Captura del servidor al recibir el reporte: no es una reproducción exacta de la pantalla del estudiante. Puede corresponder a un ID archivado.'),
      node('pre', JSON.stringify(row.snapshot, null, 2)),
      node('h4', 'Auditoría interna'), node('pre', JSON.stringify(row.auditoria, null, 2)));
    if (this.pending) {
      this.detailHost.append(node('p', 'Decisión pendiente de confirmar. Consultar no prueba quién realizó un cambio: conserva el mismo UUID y motivo hasta recibir el recibo.'),
        node('p', `Destino: ${reportStates[this.pending.body.destino]} · Motivo: ${this.pending.body.motivoRevision}`));
      const retry = button('Reintentar misma decisión', () => void this.decide());
      const refresh = button('Consultar estado actual', () => void this.show(row.id, true));
      retry.disabled = refresh.disabled = this.busy; this.detailHost.append(refresh, retry); return;
    }
    const choice = select('Nuevo estado', Object.fromEntries(reportTransitions[row.estado].map(k => [k, reportStates[k]])), reportTransitions[row.estado][0]);
    const label = node('label', 'Motivo interno de la decisión (1 a 500 caracteres)');
    const text = node('textarea'); text.rows = 4;
    text.value = this.draftText ?? ''; text.oninput = () => { this.draftText = text.value; this.dirty = true; };
    label.append(text);
    const save = button('Confirmar decisión', () => {
      if (this.busy) return;
      try {
        const body = reportDecision({ operacionId: this.uuid(), revision: row.revision, destino: choice.input.value, motivoRevision: text.value });
        if (!this.confirm(`¿Confirmar ${reportStates[body.destino]}? Esta acción no cambia la pregunta.`)) return;
        this.pending = { id: row.id, body: Object.freeze(body), uncertain: false }; void this.decide();
      } catch (error) { this.status.textContent = error.message; }
    });
    save.disabled = choice.input.disabled = text.disabled = this.busy;
    this.detailHost.append(choice.field, label, save,
      button('Recargar detalle (descartar motivo)', () => { if (this.discard()) { this.draftText = ''; void this.show(row.id); } }));
  }
  async decide() {
    if (!this.pending || this.busy) return;
    const session = this.version, attempt = this.pending;
    this.busy = true; this.lock(); this.render();
    try {
      await this.api.decideQuestionReport(attempt.id, attempt.body);
      if (session !== this.version) return;
      this.pending = null; this.dirty = false; this.draftText = '';
      this.status.textContent = 'Decisión confirmada. Consulta el detalle para ver el estado actual.';
    } catch (error) {
      if (session !== this.version) return;
      // 409 from replay proves this payload did not apply. Keep text, require fresh detail.
      if (!attempt.uncertain && [400, 404, 409, 422, 429].includes(error.status)) {
        this.pending = null; this.draftText = attempt.body.motivoRevision; this.dirty = true;
        this.record = null;
        this.detailHost.replaceChildren(node('p', this.draftText),
          button('Consultar versión actual antes de decidir', () => void this.show(attempt.id, true)));
      } else attempt.uncertain = true;
      this.status.textContent = error.message || 'No se pudo confirmar. Consulta o reintenta la misma decisión.';
    } finally {
      if (session === this.version) {
        this.busy = false; this.lock();
        if (this.pending) this.render();
      }
    }
    if (session === this.version && !this.pending && !this.dirty && this.record) await this.show(attempt.id);
  }
}
