import { fileReference, revocationFields } from "./editorial-file-fields.mjs";

// Operación ADMIN aislada del editor y sin persistir motivos/recibos en storage.
export class EditorialFileAccess {
  constructor({ api, host, doc = document, setBusy = () => {}, confirm = text => window.confirm(text), uuid = () => crypto.randomUUID() }) {
    Object.assign(this, { api, host, doc, setBusy, confirm, uuid });
    this.version = 0; this.running = false; this.pending = null; this.record = null; this.dirty = false;
  }
  node(tag, text, parent = this.host) {
    const element = this.doc.createElement(tag);
    if (text !== undefined) element.textContent = text;
    parent.append(element); return element;
  }
  button(text, action, parent = this.host) {
    const button = this.node("button", text, parent); button.type = "button"; button.className = "secondary";
    button.onclick = () => { if (!this.running) void action(); }; return button;
  }
  close(force = false) {
    if (!force && (this.running || this.pending)) {
      this.message("Consulta el recibo o reintenta la misma revocación antes de salir."); return false;
    }
    if (!force && this.dirty && !this.confirm("Hay un motivo interno sin enviar. ¿Salir y descartarlo?")) return false;
    const wasRunning = this.running;
    this.version++; this.running = false; this.pending = null; this.record = null; this.dirty = false;
    for (const field of [this.reference,this.reason,this.description]) if (field) field.value = "";
    this.reference = this.reason = this.description = this.status = this.detail = this.result = null;
    this.host.hidden = true; this.host.replaceChildren();
    if (wasRunning) this.setBusy(false);
    return true;
  }
  open() {
    if (!this.close()) return;
    this.host.hidden = false;
    this.node("h2", "Control de imágenes");
    this.node("p", this.api.demo ? "La demo no consulta ni revoca archivos reales." :
      "Consulta una imagen cargada en SaberPlus. Revocar bloquea su acceso en el contenido y el historial; conserva preguntas y resultados.");
    const label = this.node("label", "Referencia de la imagen o identificador");
    this.reference = this.node("input", undefined, label); this.reference.type = "text"; this.reference.maxLength = 100;
    this.reference.placeholder = "/recursos/editoriales/…";
    this.reference.oninput = () => this.controls();
    this.lookupButton = this.button("Consultar estado de la imagen", () => this.lookup());
    this.status = this.node("p", ""); this.status.setAttribute("role", "status"); this.status.setAttribute("aria-live", "polite");
    this.detail = this.node("section"); this.detail.className = "catalog-panel file-access-detail";
    this.result = this.node("section"); this.result.setAttribute("aria-label", "Recibo de revocación");
    this.render();
  }
  message(text) { if (this.status) this.status.textContent = text; }
  controls() {
    if (!this.reference) return;
    const disabled = this.running || this.api.demo;
    this.reference.disabled = disabled || Boolean(this.pending);
    this.lookupButton.disabled = disabled;
    let same = false;
    try { same = fileReference(this.reference.value) === this.record?.id; } catch { /* Entrada incompleta. */ }
    if (this.reason) this.reason.disabled = disabled || Boolean(this.pending);
    if (this.description) this.description.disabled = disabled || Boolean(this.pending);
    if (this.revokeButton) this.revokeButton.disabled = disabled || Boolean(this.pending) || !same || this.record?.estado !== "DISPONIBLE";
    if (this.receiptButton) this.receiptButton.disabled = disabled;
    if (this.retryButton) this.retryButton.disabled = disabled;
    if (this.finishButton) this.finishButton.disabled = disabled || this.record?.estado === "DISPONIBLE";
  }
  render() {
    if (!this.detail) return;
    const draft = this.reason ? { motivo: this.reason.value, detalle: this.description.value } : { motivo: "SEGURIDAD", detalle: "" };
    if (this.description) this.description.value = "";
    this.detail.replaceChildren();
    this.reason = this.description = this.revokeButton = this.receiptButton = this.retryButton = this.finishButton = null;
    if (!this.record) { this.controls(); return; }
    this.node("h3", this.record.titulo, this.detail);
    this.node("p", this.record.textoAlternativo, this.detail);
    const states = { DISPONIBLE: "Disponible", REVOCADO: "Revocada", RETIRADO: "Retirada", PREPARADO: "Carga pendiente" };
    this.node("p", `Estado: ${states[this.record.estado]}.`, this.detail);
    this.node("p", `Referencia: /recursos/editoriales/${this.record.id}`, this.detail);
    if (this.record.estado === "DISPONIBLE") {
      this.node("p", "El motivo es interno. Los estudiantes verán que la imagen no está disponible; sus resultados se conservarán.", this.detail);
      const label = this.node("label", "Motivo de la revocación", this.detail);
      this.reason = this.node("select", undefined, label);
      for (const [value, text] of [["SEGURIDAD", "Seguridad"], ["DERECHOS", "Derechos de uso"]]) {
        const option = this.node("option", text, this.reason); option.value = value;
      }
      this.reason.value = draft.motivo;
      const detailLabel = this.node("label", "Detalle interno (1 a 500 caracteres)", this.detail);
      this.description = this.node("textarea", undefined, detailLabel); this.description.maxLength = 500; this.description.rows = 4;
      this.description.value = draft.detalle;
      this.reason.onchange = this.description.oninput = () => { this.dirty = true; };
      this.revokeButton = this.button("Revocar acceso a esta imagen", () => this.revoke(), this.detail);
      this.revokeButton.className = "danger";
    }
    if (this.pending) {
      this.receiptButton = this.button("Consultar recibo de revocación", () => this.receipt(), this.detail);
      this.retryButton = this.button("Reintentar la misma revocación", () => this.revoke(true), this.detail);
      if (this.record.estado !== "DISPONIBLE") this.finishButton = this.button("Cerrar comprobación", () => {
        if (!this.confirm("La imagen ya no está disponible. Cerrar la comprobación no deshace la revocación ni confirma quién la realizó. ¿Continuar?")) return;
        this.pending = null; this.dirty = false; this.render(); this.message("Comprobación cerrada. Se conserva el estado actual de la imagen.");
      }, this.detail);
    }
    this.controls();
  }
  async perform(action) {
    if (this.running || this.api.demo) return;
    const version = this.version; this.running = true; this.setBusy(true); this.controls();
    try { await action(version); }
    catch (error) { if (version === this.version) this.message(error.message || "No pudimos completar la consulta."); }
    finally { if (version === this.version) { this.running = false; this.setBusy(false); this.controls(); } }
  }
  async lookup() {
    if (this.running || this.api.demo) return;
    let id;
    try { id = this.pending?.id ?? fileReference(this.reference.value); }
    catch (error) { this.message(error.message); return; }
    if (id !== this.record?.id && this.dirty && !this.confirm("Hay un motivo interno sin enviar. ¿Consultar otra imagen y descartarlo?")) return;
    await this.perform(async version => {
      const row = await this.api.editorialFile(id);
      if (version !== this.version) return;
      if (id !== this.record?.id) { this.reason = this.description = null; this.dirty = false; this.result.replaceChildren(); }
      this.record = row; this.reference.value = `/recursos/editoriales/${id}`; this.render();
      this.message(this.pending ? "Estado consultado. Recupera el recibo para confirmar tu operación." : "Estado de la imagen actualizado.");
    });
  }
  accept(receipt) {
    if (receipt.archivoId !== this.pending?.id || receipt.operacionId !== this.pending.operationId ||
        receipt.motivo !== this.pending.body.motivo || receipt.detalle !== this.pending.body.detalle)
      throw new Error("El recibo no coincide con este envío. Consulta antes de repetirlo.");
    this.record = { ...this.record, estado: "REVOCADO", contenidoUrl: null, puedeReintentar: false }; this.pending = null; this.dirty = false;
    this.reason = this.description = null; this.render(); this.result.replaceChildren();
    this.node("h3", "Revocación confirmada", this.result);
    this.node("p", `Fecha: ${new Date(receipt.creadoEn).toLocaleString("es-CO")}`, this.result);
    this.node("p", `Motivo interno: ${receipt.motivo === "SEGURIDAD" ? "Seguridad" : "Derechos de uso"}. ${receipt.detalle}`, this.result);
    this.message("Acceso revocado. Las preguntas y los resultados se conservan.");
  }
  async revoke(retry = false) {
    if (this.running || this.api.demo) return;
    if (!retry) {
      if (this.pending || this.record?.estado !== "DISPONIBLE") return;
      try {
        if (fileReference(this.reference.value) !== this.record.id) throw new Error("Consulta primero la imagen indicada.");
        const body = revocationFields({ motivo: this.reason.value, detalle: this.description.value });
        if (!this.confirm(`Revocar «${this.record.titulo}» bloqueará esta imagen también en el historial. No se puede deshacer desde este panel. ¿Confirmar?`)) return;
        this.pending = { id: this.record.id, operationId: this.uuid(), body: Object.freeze(body) };
      } catch (error) { this.message(error.message); return; }
    }
    if (!this.pending) return;
    const request = this.pending; this.render();
    await this.perform(async version => {
      try {
        const receipt = await this.api.revokeEditorialFile(request.id, request.operationId, request.body);
        if (version === this.version) this.accept(receipt);
      } catch (error) {
        if (version !== this.version) return;
        if (error.status === 400) { this.pending = null; this.render(); }
        this.message(error.status === 400 ? error.message : "No se pudo confirmar la revocación. Consulta el recibo o reintenta el mismo envío; podría haberse guardado.");
      }
    });
  }
  async receipt() {
    if (!this.pending) return;
    const request = this.pending;
    await this.perform(async version => {
      try {
        const row = await this.api.editorialRevocationReceipt(request.id, request.operationId);
        if (version === this.version) this.accept(row);
      } catch (error) {
        if (version !== this.version) return;
        this.message(error.status === 404 ? "No hay un recibo confirmado para este envío. Puedes reintentar la misma revocación." : "No pudimos consultar el recibo. Conservamos el mismo envío para reintentar.");
      }
    });
  }
}
