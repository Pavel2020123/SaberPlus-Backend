// ADMIN read-only view. No PDF embedding, remote image URLs or automatic download.
export class InstitutionEvidence {
  constructor({ api, host, request, current = () => true, doc = document,
    urls = URL, confirm = text => window.confirm(text) }) {
    Object.assign(this, { api, host, request, current, doc, urls, confirm });
    this.generation = 0;
    this.objectUrls = new Set();
  }
  close() {
    this.generation++;
    for (const url of this.objectUrls) this.urls.revokeObjectURL(url);
    this.objectUrls.clear();
    this.host.replaceChildren();
  }
  node(tag, text, parent = this.host) {
    const el = this.doc.createElement(tag);
    if (text !== undefined) el.textContent = text;
    parent.append(el);
    return el;
  }
  button(text, action, parent) {
    const el = this.node('button', text, parent);
    el.type = 'button'; el.className = 'secondary'; el.onclick = action;
    return el;
  }
  async open() {
    this.close();
    const generation = this.generation;
    const live = () => generation === this.generation && this.current();
    this.host.className = 'private-evidence';
    const header = this.node('div'); header.className = 'private-evidence-header';
    this.node('h4', 'Documentos privados de verificación', header);
    const badge = this.node('span', 'Solo solicitante y ADMIN', header);
    badge.className = 'private-evidence-badge';
    this.node('p', 'Adjuntos aportados para comprobar la representación de la institución. No son trabajos ni documentos personales de estudiantes.');
    const warning = this.node('p', 'PDF no analizado por antivirus: descárgalo solo si conoces su procedencia. No lo abrimos dentro del panel. Una copia descargada no puede retirarse a distancia.');
    warning.className = 'private-evidence-notice';
    const status = this.node('p', 'Consultando adjuntos privados…');
    status.setAttribute('role', 'status');
    const list = this.node('div'); list.className = 'private-evidence-list';
    const refresh = this.button('Actualizar adjuntos', () => void this.open());
    refresh.disabled = true;
    try {
      const data = await this.api.institutionVerificationFiles(this.request.id);
      if (!live()) return;
      status.textContent = data.adjuntos.length === 1 ? '1 adjunto disponible.' : data.adjuntos.length
        ? `${data.adjuntos.length} adjuntos disponibles.` : 'No hay adjuntos disponibles. La declaración escrita se conserva arriba.';
      if (data.revision !== this.request.revision) {
        status.textContent = 'La solicitud cambió. Consulta de nuevo su detalle antes de decidir; esta vista no actualiza la revisión de aprobación.';
      }
      for (const [index, file] of data.adjuntos.entries()) {
        const card = this.node('article', undefined, list); card.className = 'private-evidence-file';
        const type = file.mime === 'application/pdf' ? 'PDF' : 'Imagen WEBP';
        const title = `Documento ${index + 1} · ${type}`;
        this.node('h5', title, card);
        this.node('p', `${Math.ceil(file.bytes / 1024)} KiB · ${file.venceEn
          ? `Disponible hasta ${new Date(file.venceEn).toLocaleString('es-CO')}`
          : 'Se conservará durante 90 días desde la resolución de esta revisión.'}`, card);
        const message = this.node('p', '', card); message.setAttribute('role', 'status');
        let working = false;
        const prepare = this.button(`Preparar descarga del documento ${index + 1}`, async () => {
          if (!live() || working) return;
          if (!this.confirm('Vas a descargar un adjunto privado no analizado por antivirus. La copia quedará en tu equipo y no podrá revocarse a distancia. ¿Continuar?')) return;
          working = true; prepare.disabled = true;
          message.textContent = 'Validando acceso y preparando descarga…';
          try {
            const blob = await this.api.institutionVerificationFileContent(this.request.id, file);
            if (!live()) return;
            const url = this.urls.createObjectURL(blob);
            this.objectUrls.add(url);
            const link = this.node('a', `Descargar documento ${index + 1}`, card);
            link.href = url; link.download = `documento-${index + 1}.${file.mime === 'application/pdf' ? 'pdf' : 'webp'}`;
            link.rel = 'noopener noreferrer'; link.className = 'private-evidence-download';
            message.textContent = 'Descarga preparada. El enlace se elimina al cerrar o actualizar esta vista.';
            prepare.hidden = true;
            link.focus();
          } catch (error) {
            if (!live()) return;
            message.textContent = `${error.message} Actualiza los adjuntos para comprobar su disponibilidad.`;
            prepare.disabled = false;
          } finally { working = false; }
        }, card);
      }
    } catch (error) {
      if (live()) status.textContent = `${error.message} La carga privada puede no estar habilitada en este entorno.`;
    } finally { if (live()) refresh.disabled = false; }
  }
}
