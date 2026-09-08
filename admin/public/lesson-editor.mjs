import { previewBlocks, referenceUrl } from "./lesson-fields.mjs";

export class LessonEditor {
  constructor({
    api,
    busy,
    setBusy,
    onSaved,
    onDeleted = () => {},
    confirm = (message) => window.confirm(message),
    doc = document,
  }) {
    Object.assign(this, {
      api,
      busy,
      setBusy,
      onSaved,
      onDeleted,
      confirm,
      doc,
    });
    this.$ = (id) => doc.getElementById(id);
    this.version = 0;
    this.record = null;
    this.dirty = false;
    this.$("lesson-form").onsubmit = (event) => {
      event.preventDefault();
      void this.save(false);
    };
    this.$("rename-form").onsubmit = (event) => {
      event.preventDefault();
      void this.save(true);
    };
    for (const id of [
      "editor-name",
      "lesson-text",
      "lesson-video",
      "lesson-image",
    ])
      this.$(id).oninput = () => {
        this.dirty = true;
        this.preview();
        this.message("Cambios sin guardar.");
        this.controls();
      };
    this.$("editor-delete").onclick = () => {
      void this.remove();
    };
    this.$("editor-close").onclick = () => this.close();
    this.$("editor-reload").onclick = () => {
      if (this.record) void this.open(this.kind, this.record.id, this.parent);
    };
  }
  message(text, error = false) {
    this.$("editor-message").textContent = text;
    this.$("editor-message").className = error ? "notice error" : "notice";
  }
  close(force = false) {
    if (
      !force &&
      (this.busy() ||
        (this.dirty &&
          !this.confirm("Hay cambios sin guardar. ¿Quieres descartarlos?")))
    )
      return false;
    this.version++;
    this.record = null;
    this.dirty = false;
    this.$("lesson-editor").hidden = true;
    for (const id of [
      "editor-name",
      "lesson-text",
      "lesson-video",
      "lesson-image",
    ])
      this.$(id).value = "";
    this.$("lesson-preview").replaceChildren();
    this.$("lesson-references").replaceChildren();
    this.message("");
    return true;
  }
  async open(kind, id, parent) {
    if (!this.close()) return;
    this.kind = kind;
    this.parent = parent;
    const version = this.version;
    this.$("lesson-editor").hidden = false;
    this.$("editor-title").textContent = "Cargando registro…";
    this.setBusy(true);
    this.controls();
    try {
      const record = await this.api.editor(kind, id, parent);
      if (version !== this.version) return;
      this.fill(record);
      this.$("editor-title").focus();
    } catch (error) {
      if (version === this.version) {
        this.$("editor-title").textContent = "No se pudo cargar el registro";
        this.message(
          `${error.message} Cierra y selecciona el registro de nuevo.`,
          true,
        );
      }
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
  fill(record) {
    this.record = record;
    this.dirty = false;
    this.$("editor-title").textContent =
      `${this.kind === "temas" ? "Tema" : "Lección"}: ${record.nombre}`;
    this.$("editor-name").value = record.nombre;
    this.$("lesson-text").value = record.contenido;
    this.$("lesson-video").value = record.videoUrl;
    this.$("lesson-image").value = record.imagenUrl;
    this.$("lesson-form").hidden = this.kind === "temas";
    this.$("preview-section").hidden = this.kind === "temas";
    this.$("editor-policy").textContent =
      record.motivo ||
      "Borrador: guardar no publica en la app. Los nombres solo se corrigen antes de tener uso académico.";
    this.message(`Estado: ${record.estadoContenido}.`);
    this.preview();
    this.controls();
  }
  controls() {
    const locked = this.busy();
    for (const id of [
      "lesson-text",
      "lesson-video",
      "lesson-image",
      "lesson-save",
    ])
      this.$(id).disabled = locked || !this.record?.editable;
    for (const id of ["editor-name", "editor-rename"])
      this.$(id).disabled = locked || !this.record?.renombrable;
    this.$("editor-reload").disabled = locked || !this.record;
    this.$("editor-close").disabled = locked;
    this.$("editor-delete").disabled =
      locked || this.dirty || this.record?.eliminable !== true;
    this.$("editor-delete-policy").textContent = this.dirty
      ? "Guarda o descarta tus cambios antes de eliminar."
      : this.record?.motivoEliminacion ||
        (this.record?.eliminable === true
          ? "Eliminación definitiva de este borrador vacío. No se borrarán otros registros."
          : "El servidor no ha autorizado eliminar este registro. Recarga para consultar.");
  }
  async remove() {
    const row = this.record;
    if (this.busy() || this.dirty || row?.eliminable !== true) return;
    if (
      !this.confirm(
        `Eliminar definitivamente ${this.kind === "temas" ? "tema" : "subtema"}: ${row.nombre}\nID: ${row.id}\nClasificación: ${this.parent}\nNo se puede deshacer. Solo se eliminará este borrador vacío. ¿Confirmar?`,
      )
    )
      return;
    const version = this.version;
    const kind = this.kind;
    this.setBusy(true);
    this.controls();
    this.message("Eliminando borrador vacío…");
    try {
      const receipt = await this.api.removeDraft(
        kind,
        row.id,
        this.parent,
        row.revision,
        true,
      );
      if (version !== this.version) return;
      this.setBusy(false);
      this.close(true);
      this.onDeleted(kind, receipt);
    } catch (error) {
      if (version === this.version) {
        this.record = {
          ...row,
          eliminable: false,
          motivoEliminacion:
            "Consulta el catálogo o recarga el registro antes de volver a eliminar.",
        };
        this.message(`${error.message} No se reintenta automáticamente.`, true);
      }
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
  preview() {
    const target = this.$("lesson-preview");
    target.replaceChildren(
      ...previewBlocks(this.$("lesson-text").value).map((block) => {
        const node = this.doc.createElement(block.tag);
        node.textContent = block.text;
        return node;
      }),
    );
    this.$("lesson-length").textContent =
      `${this.$("lesson-text").value.length} / 30000 caracteres`;
    const refs = this.$("lesson-references");
    refs.replaceChildren();
    for (const [id, label] of [
      ["lesson-video", "Video"],
      ["lesson-image", "Imagen"],
    ]) {
      try {
        const url = referenceUrl(this.$(id).value);
        if (!url) continue;
        const link = this.doc.createElement("a");
        link.href = url;
        link.textContent = `Abrir ${label.toLowerCase()} en otra pestaña`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        refs.append(link);
      } catch {
        const error = this.doc.createElement("p");
        error.textContent = `${label}: referencia HTTPS no válida.`;
        refs.append(error);
      }
    }
  }
  async save(rename) {
    if (
      this.busy() ||
      !this.record ||
      !(rename ? this.record.renombrable : this.record.editable)
    )
      return;
    // Saving either form sends only its fields; keep the other unsaved fields intact.
    const nameDraft = this.$("editor-name").value;
    const lessonDraft = {
      contenido: this.$("lesson-text").value,
      videoUrl: this.$("lesson-video").value,
      imagenUrl: this.$("lesson-image").value,
    };
    const otherDirty = rename
      ? Object.keys(lessonDraft).some(
          (key) => lessonDraft[key] !== this.record[key],
        )
      : nameDraft !== this.record.nombre;
    const version = this.version;
    this.setBusy(true);
    this.controls();
    this.message("Guardando borrador…");
    try {
      const record = await this.api.editor(
        this.kind,
        this.record.id,
        this.parent,
        {
          revision: this.record.revision,
          ...(rename ? { nombre: nameDraft } : lessonDraft),
        },
      );
      if (version !== this.version) return;
      this.fill(record);
      if (otherDirty) {
        if (rename) {
          this.$("lesson-text").value = lessonDraft.contenido;
          this.$("lesson-video").value = lessonDraft.videoUrl;
          this.$("lesson-image").value = lessonDraft.imagenUrl;
        } else this.$("editor-name").value = nameDraft;
        this.dirty = true;
        this.preview();
      }
      this.onSaved(this.kind, record);
      this.message(
        `${rename ? "Nombre" : "Lección"} guardado. No se publicó.${otherDirty ? " Hay otros cambios sin guardar." : ""}`,
      );
    } catch (error) {
      if (version === this.version)
        this.message(
          `${error.message} Tu texto sigue aquí; cópialo antes de recargar.`,
          true,
        );
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
}
