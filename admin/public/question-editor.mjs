import { previewBlocks, referenceUrl } from "./lesson-fields.mjs";

export class QuestionEditor {
  constructor({
    api,
    busy,
    setBusy,
    doc = document,
    confirm = (message) => window.confirm(message),
  }) {
    Object.assign(this, { api, busy, setBusy, doc, confirm });
    this.$ = (id) => doc.getElementById(id);
    this.version = 0;
    this.dirty = false;
    this.record = null;
    this.options = [];
    this.caseRows = [];
    this.$("bank-form").onsubmit = (event) => {
      event.preventDefault();
      void this.save();
    };
    this.$("bank-close").onclick = () => this.close();
    this.$("bank-new").onclick = () => {
      if (this.discard())
        void this.run(async () => {
          this.fill(null);
          if (this.kind === "preguntas") await this.loadCases(1);
        });
    };
    this.$("bank-reload").onclick = () => {
      if (this.record) void this.select(this.record.id);
    };
    for (const id of [
      "bank-title",
      "bank-text",
      "bank-explanation",
      "bank-image",
      "bank-difficulty",
      "bank-order",
    ])
      this.$(id).oninput = () => this.changed();
    for (const [id, delta] of [
      ["bank-prev", -1],
      ["bank-next", 1],
    ])
      this.$(id).onclick = () =>
        this.run(() => this.loadPage(this.page + delta));
    for (const [id, delta] of [
      ["case-prev", -1],
      ["case-next", 1],
    ])
      this.$(id).onclick = () =>
        this.run(() => this.loadCases(this.casePage + delta));
    this.$("bank-case").onchange = () =>
      this.run(async (version) => {
        const id = this.$("bank-case").value;
        try {
          const selected = id
            ? await this.api.bankRecord("casos", this.parent.area, id)
            : null;
          if (version !== this.version) return;
          this.selectedCase = selected;
        } catch (error) {
          if (version === this.version)
            this.$("bank-case").value = this.selectedCase?.id ?? "";
          throw error;
        }
        if (!id) this.$("bank-order").value = "";
        this.changed();
      });
    this.$("option-add").onclick = () => {
      if (this.options.length < 6) {
        const rows = this.readOptions();
        rows.push({ texto: "", explicacion: "", esCorrecta: false });
        this.renderOptions(rows);
        this.changed();
      }
    };
    this.$("option-remove").onclick = () => {
      if (this.options.length > 2) {
        this.renderOptions(this.readOptions().slice(0, -1));
        this.changed();
      }
    };
  }
  message(text, error = false) {
    this.$("bank-message").textContent = text;
    this.$("bank-message").className = error ? "notice error" : "notice";
  }
  discard() {
    return (
      !this.busy() &&
      (!this.dirty ||
        this.confirm(
          "Hay cambios sin guardar en preguntas/casos. ¿Descartarlos?",
        ))
    );
  }
  close(force = false) {
    if (!force && !this.discard()) return false;
    this.version++;
    this.record = null;
    this.dirty = false;
    this.parent = null;
    this.selectedCase = null;
    this.options = [];
    this.caseRows = [];
    this.caseData = null;
    this.data = null;
    this.hasForm = false;
    this.$("bank-editor").hidden = true;
    this.$("bank-form").hidden = true;
    for (const id of [
      "bank-title",
      "bank-text",
      "bank-explanation",
      "bank-image",
      "bank-order",
    ])
      this.$(id).value = "";
    for (const id of ["bank-list", "bank-options", "bank-case", "bank-preview"])
      this.$(id).replaceChildren();
    this.message("");
    return true;
  }
  async run(task) {
    if (this.busy()) return;
    const version = this.version;
    this.setBusy(true);
    this.controls();
    try {
      await task(version);
    } catch (error) {
      if (version === this.version)
        this.message(
          `${error.message} Si tienes texto pendiente, cópialo antes de recargar.`,
          true,
        );
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
  async open(kind, parent) {
    if (!this.close()) return;
    this.kind = kind;
    this.parent = parent;
    this.page = 1;
    this.casePage = 1;
    this.$("bank-editor").hidden = false;
    this.$("bank-heading").textContent =
      `${kind === "preguntas" ? "Preguntas" : "Casos compartidos"} · ${parent.nombre}`;
    this.$("bank-heading").focus();
    await this.run(() => this.loadPage(1));
  }
  async loadPage(page) {
    const version = this.version;
    const data = await this.api.bankPage(this.kind, this.parent.id, page);
    if (version !== this.version) return;
    if (this.kind === "preguntas" && data.subtema.area !== this.parent.area)
      throw new Error("El subtema cambió de área. Vuelve al catálogo.");
    this.page = page;
    this.data = data;
    this.$("bank-list").replaceChildren(
      ...data.items.map((row) => {
        const button = this.doc.createElement("button");
        button.type = "button";
        button.className = "item";
        button.textContent = `${this.kind === "preguntas" ? row.enunciado.slice(0, 130) : row.titulo || "Caso sin título"} · ${row.estadoContenido} · ${row.id}`;
        button.onclick = () => this.select(row.id);
        return button;
      }),
    );
    if (!data.items.length)
      this.$("bank-list").textContent =
        "Todavía no hay registros en esta página.";
    this.$("bank-page").textContent = `Página ${page}`;
  }
  async select(id) {
    if (!this.discard()) return;
    await this.run(async (version) => {
      const row = await this.api.bankRecord(this.kind, this.parent.id, id);
      if (version !== this.version) return;
      this.fill(row);
      if (this.kind === "preguntas") await this.loadCases(1);
    });
  }
  fill(row) {
    this.record = row;
    this.dirty = false;
    this.hasForm = true;
    this.$("bank-form").hidden = false;
    const question = this.kind === "preguntas";
    this.$("case-title-field").hidden = question;
    this.$("question-fields").hidden = !question;
    this.$("bank-text-label").textContent = question
      ? "Enunciado (máximo 12000 caracteres)"
      : "Contexto compartido (máximo 20000 caracteres)";
    this.$("bank-text").maxLength = question ? 12000 : 20000;
    this.$("bank-title").value = row?.titulo ?? "";
    this.$("bank-title").required = !question;
    this.$("bank-text").value =
      row?.[question ? "enunciado" : "contexto"] ?? "";
    this.$("bank-explanation").value = row?.explicacion ?? "";
    this.$("bank-explanation").required = question;
    this.$("bank-image").value = row?.imagenUrl ?? "";
    this.$("bank-difficulty").value = row?.dificultad ?? "MEDIO";
    this.$("bank-order").value = row?.ordenEnCaso ?? "";
    this.selectedCase = row?.caso ?? null;
    this.renderOptions(
      question
        ? (row?.respuestas ??
            Array.from({ length: 4 }, () => ({
              texto: "",
              explicacion: "",
              esCorrecta: false,
            })))
        : [],
    );
    this.message(
      row
        ? `${row.estadoContenido} · ${row.editable ? "Editable" : "Solo lectura: no es un borrador sin uso académico"}. ID: ${row.id}`
        : "Nuevo borrador. Guardar no publica en la app.",
    );
    this.preview();
    this.controls();
  }
  changed() {
    this.dirty = true;
    this.message("Cambios sin guardar.");
    this.preview();
    this.controls();
  }
  renderOptions(rows) {
    this.options = rows.map((row, index) => {
      const group = this.doc.createElement("fieldset");
      const legend = this.doc.createElement("legend");
      legend.textContent = `Opción ${index + 1}`;
      group.append(legend);
      const input = (tag, label, value, type) => {
        const wrap = this.doc.createElement("label");
        wrap.textContent = label;
        const control = this.doc.createElement(tag);
        if (type) control.type = type;
        if (type === "radio") {
          control.name = "correct-answer";
          control.checked = value;
        } else {
          control.value = value;
          control.maxLength = 4000;
        }
        control.oninput = () => this.changed();
        wrap.append(control);
        group.append(wrap);
        return control;
      };
      return {
        group,
        texto: input("textarea", "Respuesta", row.texto),
        correcta: input("input", "Es la correcta", row.esCorrecta, "radio"),
        explicacion: input(
          "textarea",
          "Explicación de esta opción (opcional)",
          row.explicacion,
        ),
      };
    });
    this.$("bank-options").replaceChildren(
      ...this.options.map((row) => row.group),
    );
  }
  readOptions() {
    return this.options.map((row) => ({
      texto: row.texto.value,
      esCorrecta: row.correcta.checked,
      explicacion: row.explicacion.value,
    }));
  }
  async loadCases(page) {
    const version = this.version;
    const data = await this.api.bankPage("casos", this.parent.area, page);
    if (version !== this.version) return;
    this.casePage = page;
    this.caseData = data;
    this.caseRows = data.items;
    const select = this.$("bank-case");
    const rows = [
      { id: "", titulo: "Sin caso: pregunta independiente" },
      ...(this.selectedCase ? [this.selectedCase] : []),
      ...data.items.filter((row) => row.id !== this.selectedCase?.id),
    ];
    select.replaceChildren(
      ...rows.map((row) => {
        const option = this.doc.createElement("option");
        option.value = row.id;
        option.textContent = `${row.titulo || row.id}${row.estadoContenido ? ` · ${row.estadoContenido}` : ""}`;
        option.disabled = row.estadoContenido === "ARCHIVADO";
        return option;
      }),
    );
    select.value = this.selectedCase?.id ?? "";
    this.$("case-page").textContent = `Casos: página ${page}`;
  }
  draft() {
    const common = { imagenUrl: this.$("bank-image").value };
    return this.kind === "casos"
      ? {
          ...common,
          area: this.parent.id,
          titulo: this.$("bank-title").value,
          contexto: this.$("bank-text").value,
        }
      : {
          ...common,
          subtemaId: this.parent.id,
          enunciado: this.$("bank-text").value,
          explicacion: this.$("bank-explanation").value,
          dificultad: this.$("bank-difficulty").value,
          respuestas: this.readOptions(),
          casoId: this.selectedCase?.id ?? "",
          ...(this.selectedCase
            ? { ordenEnCaso: Number(this.$("bank-order").value) }
            : {}),
        };
  }
  async save() {
    if (!this.hasForm || (this.record && !this.record.editable)) return;
    await this.run(async (version) => {
      const row = await this.api.bankRecord(
        this.kind,
        this.parent.id,
        this.record?.id,
        {
          ...this.draft(),
          ...(this.record ? { revision: this.record.revision } : {}),
        },
      );
      if (version !== this.version) return;
      this.fill(row);
      this.message("Guardado en BORRADOR. No está publicado.");
      try {
        await this.loadPage(this.page);
      } catch {
        if (version === this.version)
          this.message(
            "Guardado, pero no se actualizó la lista. Conserva el ID y vuelve a abrir esta sección.",
            true,
          );
      }
    });
  }
  controls() {
    const busy = this.busy();
    const editable =
      this.hasForm &&
      (this.record
        ? this.record.editable
        : this.kind === "casos" || this.data?.subtema?.permiteCrear);
    const locked = busy || !editable;
    for (const id of [
      "bank-title",
      "bank-text",
      "bank-explanation",
      "bank-image",
      "bank-difficulty",
      "bank-save",
      "bank-case",
    ])
      this.$(id).disabled = locked;
    this.$("bank-order").disabled = locked || !this.selectedCase;
    for (const row of this.options)
      for (const key of ["texto", "correcta", "explicacion"])
        row[key].disabled = locked;
    this.$("option-add").disabled = locked || this.options.length >= 6;
    this.$("option-remove").disabled = locked || this.options.length <= 2;
    this.$("bank-close").disabled = busy;
    this.$("bank-new").disabled =
      busy ||
      !this.data ||
      (this.kind === "preguntas" && !this.data.subtema.permiteCrear);
    this.$("bank-reload").disabled = busy || !this.record;
    this.$("bank-prev").disabled = busy || !this.data || this.page <= 1;
    this.$("bank-next").disabled =
      busy || !this.data?.hayMas || this.page >= 10000;
    this.$("case-prev").disabled =
      locked || this.casePage <= 1 || !this.caseData;
    this.$("case-next").disabled =
      locked || !this.caseData?.hayMas || this.casePage >= 10000;
    for (const child of this.$("bank-list").children) child.disabled = busy;
  }
  preview() {
    const nodes = [];
    const append = (text) => {
      for (const block of previewBlocks(text)) {
        const node = this.doc.createElement(block.tag);
        node.textContent = block.text;
        nodes.push(node);
      }
    };
    if (this.selectedCase)
      append(
        `## Caso: ${this.selectedCase.titulo ?? ""}\n${this.selectedCase.contexto ?? ""}`,
      );
    append(this.$("bank-title").value);
    append(this.$("bank-text").value);
    if (this.kind === "preguntas") {
      this.readOptions().forEach((row, i) =>
        append(
          `${i + 1}. ${row.texto}${row.esCorrecta ? " [Correcta · solo editor]" : ""}${row.explicacion ? `\n${row.explicacion}` : ""}`,
        ),
      );
      append(`## Explicación\n${this.$("bank-explanation").value}`);
    }
    for (const value of [
      this.selectedCase?.imagenUrl ?? "",
      this.$("bank-image").value,
    ]) {
      try {
        const url = referenceUrl(value);
        if (url) {
          const link = this.doc.createElement("a");
          link.href = url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = "Abrir referencia de imagen";
          nodes.push(link);
        }
      } catch {
        append("Referencia de imagen no válida: usa HTTPS.");
      }
    }
    this.$("bank-preview").replaceChildren(...nodes);
  }
}
