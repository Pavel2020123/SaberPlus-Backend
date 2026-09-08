import { clozeFields } from "./editorial-tool-fields.mjs";

// Isolated workspace: no credentials, drafts or confirmations in browser storage.
export class EditorialTools {
  constructor({
    api,
    busy,
    setBusy,
    onLesson,
    onReview,
    doc = document,
    confirm = (message) => window.confirm(message),
  }) {
    Object.assign(this, {
      api,
      busy,
      setBusy,
      onLesson,
      onReview,
      doc,
      confirm,
    });
    this.$ = (id) => doc.getElementById(id);
    this.version = 0;
    this.dirty = false;
    this.controlsList = [];
    this.$("tools-close").onclick = () => this.close();
  }
  node(tag, text) {
    const node = this.doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  paragraph(root, text) {
    root.append(this.node("p", text));
  }
  button(root, text, action, blocked = () => false) {
    const button = this.node("button", text);
    button.type = "button";
    button.className = "secondary";
    button.onclick = () => {
      if (!this.busy() && !blocked()) void action();
    };
    root.append(button);
    this.controlsList.push([button, blocked]);
    this.controls();
    return button;
  }
  field(root, label, tag = "input", blocked = () => false) {
    const wrapper = this.node("label", label);
    const input = this.node(tag);
    wrapper.append(input);
    root.append(wrapper);
    this.controlsList.push([input, blocked]);
    return input;
  }
  controls() {
    for (const [node, blocked] of this.controlsList)
      node.disabled = this.busy() || blocked();
  }
  clearSection(root) {
    this.controlsList = this.controlsList.filter(
      ([node]) => !root.contains(node),
    );
    root.replaceChildren();
  }
  message(text, error = false) {
    this.$("tools-message").textContent = text;
    this.$("tools-message").className = error ? "notice error" : "notice";
  }
  close(force = false) {
    if (
      !force &&
      (this.busy() ||
        (this.dirty &&
          !this.confirm("Hay cambios CLOZE sin guardar. ¿Descartarlos?")))
    )
      return false;
    this.version++;
    this.record = null;
    this.batch = null;
    this.move = null;
    this.preview = null;
    this.dirty = false;
    this.activity = null;
    this.controlsList = [];
    this.$("tools-panel").hidden = true;
    this.$("tools-content").replaceChildren();
    this.message("");
    return true;
  }
  begin(title) {
    if (!this.close()) return false;
    this.$("tools-panel").hidden = false;
    this.$("tools-heading").textContent = title;
    this.$("tools-heading").focus();
    return true;
  }
  async run(action) {
    if (this.busy()) return;
    const version = this.version;
    this.setBusy(true);
    this.controls();
    this.message("Procesando…");
    try {
      await action(() => version === this.version);
    } catch (error) {
      if (version === this.version)
        this.message(
          `${error.message} Conserva tus datos; consulta la versión actual antes de reenviar.`,
          true,
        );
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
  async openCloze(selected) {
    if (!this.begin(`Completar espacios: ${selected.nombre}`)) return;
    this.selected = selected;
    await this.run(async (current) => {
      const record = await this.api.cloze(selected.id, selected.temaId);
      if (!current()) return;
      this.fillCloze(record);
      this.message("Ejercicio cargado. Guardar no publica.");
    });
  }
  fillCloze(record) {
    this.record = record;
    this.dirty = false;
    this.activity = structuredClone(
      record.datosInteractivo ?? {
        textoConEspacios: "",
        espacios: [{ opciones: ["", ""], correctaIndex: -1 }],
      },
    );
    this.renderCloze();
  }
  renderCloze() {
    const root = this.$("tools-content");
    root.replaceChildren();
    this.controlsList = [];
    const readonly = () => !this.record?.editable;
    this.paragraph(
      root,
      this.record.motivo ||
        "Borrador editable. Práctica de autocorrección, no una nota del diagnóstico.",
    );
    this.paragraph(root, this.record.errores.join(" "));
    this.paragraph(
      root,
      "Escribe ___ en cada hueco y configura los espacios en orden de lectura. De 1 a 20 espacios, con 2 a 6 opciones cada uno.",
    );
    const text = this.field(
      root,
      "Enunciado con espacios ___",
      "textarea",
      readonly,
    );
    text.maxLength = 12000;
    text.value = this.activity.textoConEspacios;
    text.oninput = () => {
      this.activity.textoConEspacios = text.value;
      this.changedCloze();
    };
    this.activity.espacios.forEach((blank, i) => {
      const box = this.node("fieldset");
      box.append(this.node("legend", `Espacio ${i + 1}`));
      root.append(box);
      blank.opciones.forEach((value, j) => {
        const input = this.field(
          box,
          `Opción ${j + 1} del espacio ${i + 1}`,
          "textarea",
          readonly,
        );
        input.rows = 2;
        input.maxLength = 500;
        input.value = value;
        input.oninput = () => {
          blank.opciones[j] = input.value;
          this.changedCloze();
        };
        this.button(
          box,
          `Quitar opción ${j + 1} del espacio ${i + 1}`,
          () => {
            blank.opciones.splice(j, 1);
            blank.correctaIndex =
              blank.correctaIndex === j
                ? -1
                : blank.correctaIndex > j
                  ? blank.correctaIndex - 1
                  : blank.correctaIndex;
            this.changedCloze();
            this.renderCloze();
          },
          () => readonly() || blank.opciones.length <= 2,
        );
      });
      const correct = this.field(
        box,
        `Respuesta correcta del espacio ${i + 1}`,
        "select",
        readonly,
      );
      const empty = this.node("option", "Selecciona la correcta");
      empty.value = "-1";
      correct.append(empty);
      blank.opciones.forEach((_, j) => {
        const option = this.node("option", `Opción ${j + 1}`);
        option.value = String(j);
        correct.append(option);
      });
      correct.value = String(blank.correctaIndex);
      correct.onchange = () => {
        blank.correctaIndex = Number(correct.value);
        this.changedCloze();
      };
      this.button(
        box,
        `Añadir opción al espacio ${i + 1}`,
        () => {
          blank.opciones.push("");
          this.changedCloze();
          this.renderCloze();
        },
        () => readonly() || blank.opciones.length >= 6,
      );
      this.button(
        box,
        `Quitar espacio ${i + 1}`,
        () => {
          if (
            !this.confirm(
              "¿Quitar este espacio? Revisa también su marcador ___ en el texto.",
            )
          )
            return;
          this.activity.espacios.splice(i, 1);
          this.changedCloze();
          this.renderCloze();
        },
        () => readonly() || this.activity.espacios.length <= 1,
      );
    });
    this.button(
      root,
      "Añadir espacio",
      () => {
        this.activity.espacios.push({ opciones: ["", ""], correctaIndex: -1 });
        this.changedCloze();
        this.renderCloze();
      },
      () => readonly() || this.activity.espacios.length >= 20,
    );
    this.button(
      root,
      "Guardar CLOZE en borrador",
      () => this.saveCloze(),
      readonly,
    );
    this.button(
      root,
      "Retirar ejercicio guardado",
      () => this.saveCloze(true),
      () =>
        readonly() ||
        (!this.record.tipoInteractivo && !this.record.errores.length),
    );
    this.button(root, "Recargar CLOZE", () => this.openCloze(this.selected));
    this.button(root, "Volver a la lección", () => {
      const selected = this.selected;
      if (this.close()) this.onLesson(selected);
    });
    this.button(root, "Revisar publicación de CLOZE", () => {
      if (this.dirty) {
        this.message(
          "Guarda primero los cambios para revisar el contenido real.",
          true,
        );
        return;
      }
      const selected = this.selected;
      if (this.close()) this.onReview(selected);
    });
    this.paragraph(
      root,
      "La prosa de una lección con CLOZE sigue protegida. Para cambiarla, copia el ejercicio, retíralo explícitamente, edita la lección y vuelve a añadirlo. No hay restauración automática.",
    );
    root.append(
      this.node("h3", "Vista previa (incluye las respuestas para ADMIN)"),
    );
    this.preview = this.node("div");
    this.preview.className = "lesson-preview";
    root.append(this.preview);
    this.previewCloze();
    this.controls();
  }
  changedCloze() {
    this.dirty = true;
    this.message("Cambios sin guardar.");
    this.previewCloze();
  }
  previewCloze() {
    if (!this.preview) return;
    this.preview.replaceChildren();
    try {
      const data = clozeFields(this.activity);
      this.paragraph(this.preview, data.textoConEspacios);
      data.espacios.forEach((b, i) =>
        this.paragraph(
          this.preview,
          `Espacio ${i + 1}:\n${b.opciones.map((v, j) => `${j + 1}. ${v}${j === b.correctaIndex ? " [CORRECTA]" : ""}`).join("\n")}`,
        ),
      );
    } catch (error) {
      this.paragraph(this.preview, error.message);
    }
  }
  async saveCloze(retirar = false) {
    if (!this.record?.editable || this.busy()) return;
    if (
      retirar &&
      !this.confirm(
        "¿Retirar el ejercicio guardado y descartar los cambios CLOZE locales? La prosa se conserva; no hay restauración automática.",
      )
    )
      return;
    await this.run(async (current) => {
      const change = retirar
        ? { retirar: true, confirmado: true }
        : { datosInteractivo: clozeFields(this.activity) };
      const record = await this.api.cloze(this.record.id, this.record.temaId, {
        revision: this.record.revision,
        ...change,
      });
      if (!current()) return;
      this.fillCloze(record);
      this.message(
        retirar
          ? "Ejercicio retirado. La lección se conserva."
          : "CLOZE guardado en borrador. No se publicó.",
      );
    });
  }
  openLegacy(area, questionId = "") {
    if (!this.begin(`Banco antiguo · ${area.nombre ?? area.id}`)) return;
    this.area = area.id;
    this.groupPage = null;
    this.matchPage = null;
    this.fingerprint = undefined;
    const root = this.$("tools-content");
    this.paragraph(
      root,
      "Revisión manual por área. No borra, fusiona ni publica duplicados. Las operaciones reales requieren habilitación y autorización del entorno; la demo solo cambia datos ficticios.",
    );
    root.append(this.node("h3", "1. Completar huellas por lotes"));
    this.limit = this.field(root, "Preguntas por lote (1–100)");
    this.limit.type = "number";
    this.limit.min = "1";
    this.limit.max = "100";
    this.limit.value = "25";
    this.limit.oninput = () => {
      this.batch = null;
      this.batchOutput.replaceChildren();
      this.controls();
    };
    this.button(root, "Consultar lote", () => this.loadBatch());
    this.button(
      root,
      "Confirmar indexación del lote revisado",
      () => this.applyBatch(),
      () => !this.batch?.habilitado || !this.batch.items.length,
    );
    this.batchOutput = this.node("div");
    root.append(this.batchOutput);
    root.append(
      this.node("h3", "2. Revisar coincidencias (no elimina preguntas)"),
    );
    this.button(root, "Consultar duplicados desde el inicio", () =>
      this.loadGroups(),
    );
    this.button(
      root,
      "Siguientes grupos",
      () => this.loadGroups(this.groupPage.siguiente),
      () => !this.groupPage?.hayMas,
    );
    this.groupsOutput = this.node("div");
    root.append(this.groupsOutput);
    this.button(
      root,
      "Siguientes coincidencias",
      () => this.loadMatches(this.fingerprint, this.matchPage.siguiente),
      () => !this.matchPage?.hayMas,
    );
    this.matchesOutput = this.node("div");
    root.append(this.matchesOutput);
    root.append(this.node("h3", "3. Reclasificar una pregunta sin uso"));
    this.paragraph(
      root,
      "Abre una pregunta desde su editor o copia un ID de coincidencia. Elige el tema y subtema de destino de esta misma área. Contenido usado requiere versiones, no se mueve.",
    );
    this.question = this.field(root, "ID de la pregunta");
    this.question.maxLength = 120;
    this.question.value = questionId;
    this.question.oninput = () => this.clearMove();
    this.themeSelect = this.field(root, "Tema de destino", "select");
    this.themeSelect.onchange = () => {
      this.clearMove();
      void this.loadDestinationSubs(1);
    };
    this.button(root, "Cargar temas de destino", () =>
      this.loadDestinationThemes(1),
    );
    this.button(
      root,
      "Temas anteriores",
      () => this.loadDestinationThemes(this.themePage.pagina - 1),
      () => !this.themePage || this.themePage.pagina <= 1,
    );
    this.button(
      root,
      "Más temas",
      () => this.loadDestinationThemes(this.themePage.pagina + 1),
      () => !this.themePage?.hayMas,
    );
    this.subSelect = this.field(root, "Subtema de destino", "select");
    this.subSelect.onchange = () => this.clearMove();
    this.button(
      root,
      "Subtemas anteriores",
      () => this.loadDestinationSubs(this.subPage.pagina - 1),
      () => !this.subPage || this.subPage.pagina <= 1,
    );
    this.button(
      root,
      "Más subtemas",
      () => this.loadDestinationSubs(this.subPage.pagina + 1),
      () => !this.subPage?.hayMas,
    );
    this.destinationInfo = this.node("p");
    root.append(this.destinationInfo);
    this.button(
      root,
      "Revisar reclasificación",
      () => this.loadMove(),
      () => !this.question.value.trim() || !this.subSelect.value,
    );
    this.button(
      root,
      "Confirmar destino revisado",
      () => this.applyMove(),
      () => !this.move?.puedeReclasificar,
    );
    this.moveOutput = this.node("div");
    this.moveOutput.className = "lesson-preview";
    root.append(this.moveOutput);
    this.themePage = null;
    this.subPage = null;
    this.controls();
  }
  clearMove() {
    this.move = null;
    this.moveOutput?.replaceChildren();
    this.controls();
  }
  async loadBatch() {
    this.batch = null;
    await this.run(async (current) => {
      const result = await this.api.legacyBatch(
        this.area,
        Number(this.limit.value),
      );
      if (!current()) return;
      this.batch = result;
      this.batchOutput.replaceChildren();
      this.paragraph(
        this.batchOutput,
        `${result.pendientesEnArea} preguntas pendientes. ${result.items.length} en este lote. ${result.habilitado ? "Operación habilitada." : "Solo consulta: indexación deshabilitada en el entorno."}`,
      );
      this.paragraph(this.batchOutput, result.advertencia);
      result.items.forEach((row) =>
        this.paragraph(
          this.batchOutput,
          `${row.id} · ${row.estadoContenido} · coincidencias indexadas: ${row.coincidenciasIndexadas}; en lote: ${row.coincidenciasEnLote}${row.requiereClasificacion ? " · Clasificación pendiente" : ""}`,
        ),
      );
      this.message("Revisa el lote antes de confirmarlo.");
    });
  }
  async applyBatch() {
    if (
      !this.batch?.habilitado ||
      !this.batch.items.length ||
      this.busy() ||
      !this.confirm(
        `¿Indexar únicamente estas ${this.batch.items.length} preguntas de ${this.area}? No se publica ni elimina contenido.`,
      )
    )
      return;
    const reviewed = this.batch;
    this.batch = null; // Consumed even on timeout: require a fresh GET.
    await this.run(async (current) => {
      const result = await this.api.legacyBatch(
        reviewed.area,
        reviewed.limite,
        { revision: reviewed.revision, confirmado: true },
      );
      if (!current()) return;
      this.groupPage = null;
      this.matchPage = null;
      this.clearSection(this.groupsOutput);
      this.clearSection(this.matchesOutput);
      this.batchOutput.replaceChildren();
      this.paragraph(
        this.batchOutput,
        `Indexadas: ${result.indexadas}. Pendientes: ${result.pendientesEnArea}. ${result.advertencia}`,
      );
      this.paragraph(this.batchOutput, `IDs: ${result.ids.join(", ")}`);
      this.message(
        "Lote confirmado. Consulta otro lote o reinicia el informe de duplicados.",
      );
    });
  }
  async loadGroups(after) {
    this.groupPage = null;
    this.matchPage = null;
    await this.run(async (current) => {
      const page = await this.api.legacyReport(this.area, undefined, after);
      if (!current()) return;
      this.groupPage = page;
      this.clearSection(this.groupsOutput);
      this.clearSection(this.matchesOutput);
      this.paragraph(
        this.groupsOutput,
        `${page.items.length} grupos en esta página. Pendientes de indexar: ${page.pendientesEnArea}. ${page.advertencia}`,
      );
      page.items.forEach((row) =>
        this.button(
          this.groupsOutput,
          `Ver ${row.cantidad} coincidencias · ${row.huella}`,
          () => this.loadMatches(row.huella),
        ),
      );
      this.message(
        "Coincidencias para revisión humana. No son una prueba de duplicidad semántica.",
      );
    });
  }
  async loadMatches(fingerprint, after) {
    this.matchPage = null;
    await this.run(async (current) => {
      const page = await this.api.legacyReport(this.area, fingerprint, after);
      if (!current()) return;
      this.fingerprint = fingerprint;
      this.matchPage = page;
      this.clearSection(this.matchesOutput);
      this.paragraph(this.matchesOutput, `Coincidencias de ${fingerprint}`);
      page.items.forEach((row) =>
        this.button(
          this.matchesOutput,
          `Seleccionar ${row.id} · ${row.estadoContenido}${row.requiereClasificacion ? " · Clasificación pendiente" : ""}`,
          () => {
            this.question.value = row.id;
            this.clearMove();
            this.question.focus();
            this.message(
              "Selecciona un destino y revisa el contenido antes de confirmar.",
            );
          },
        ),
      );
      this.message(`${page.items.length} coincidencias en esta página.`);
    });
  }
  options(select, rows, placeholder) {
    select.replaceChildren();
    const empty = this.node("option", placeholder);
    empty.value = "";
    select.append(empty);
    for (const row of rows) {
      const option = this.node(
        "option",
        `${row.nombre} · ${row.estadoContenido}`,
      );
      option.value = row.id;
      option.disabled =
        row.estadoContenido === "ARCHIVADO" || row.requiereClasificacion;
      select.append(option);
    }
    select.value = "";
  }
  async loadDestinationThemes(page) {
    this.clearMove();
    this.themePage = null;
    this.subPage = null;
    this.options(this.themeSelect, [], "Selecciona un tema");
    this.options(this.subSelect, [], "Selecciona primero un tema");
    await this.run(async (current) => {
      const data = await this.api.page("temas", this.area, page);
      if (!current()) return;
      this.themePage = data;
      this.options(this.themeSelect, data.items, "Selecciona un tema");
      this.destinationInfo.textContent = `Temas: página ${data.pagina}.`;
      this.message("Selecciona un tema específico, no archivado.");
    });
  }
  async loadDestinationSubs(page) {
    this.clearMove();
    this.subPage = null;
    this.options(this.subSelect, [], "Selecciona un subtema");
    if (!this.themeSelect.value) return;
    const theme = this.themeSelect.value;
    await this.run(async (current) => {
      const data = await this.api.page("subtemas", theme, page);
      if (!current()) return;
      this.subPage = data;
      this.options(this.subSelect, data.items, "Selecciona un subtema");
      this.destinationInfo.textContent = `Temas: página ${this.themePage.pagina}. Subtemas: página ${data.pagina}.`;
      this.message("Selecciona el subtema de destino.");
    });
  }
  async loadMove() {
    this.clearMove();
    const question = this.question.value.trim(),
      destination = this.subSelect.value;
    await this.run(async (current) => {
      const result = await this.api.reclassify(question, destination);
      if (!current()) return;
      if (result.origen.area !== this.area)
        throw new Error("La pregunta no pertenece al área seleccionada.");
      this.move = result;
      for (const [label, place] of [
        ["Origen", result.origen],
        ["Destino", result.destino],
      ])
        this.paragraph(
          this.moveOutput,
          `${label}: ${place.area} / ${place.tema} / ${place.subtema}`,
        );
      this.paragraph(
        this.moveOutput,
        `Estado: ${result.pregunta.estadoContenido}. ${result.habilitado ? "Operación habilitada." : "Solo consulta: reclasificación deshabilitada."}`,
      );
      for (const line of [...result.bloqueos, ...result.advertencias])
        this.paragraph(this.moveOutput, line);
      const q = result.pregunta;
      if (q.caso)
        this.paragraph(
          this.moveOutput,
          `Caso: ${q.caso.titulo ?? ""}\n${q.caso.contexto}\nReferencia: ${q.caso.imagenUrl ?? ""}`,
        );
      this.paragraph(
        this.moveOutput,
        `${q.enunciado}\nReferencia: ${q.imagenUrl ?? ""}`,
      );
      q.respuestas.forEach((r, i) =>
        this.paragraph(
          this.moveOutput,
          `${i + 1}. ${r.texto}${r.esCorrecta ? " [CORRECTA]" : ""}`,
        ),
      );
      this.paragraph(this.moveOutput, `Explicación: ${q.explicacion ?? ""}`);
      this.message(
        result.puedeReclasificar
          ? "Revisa contenido y destino; confirma solo si corresponde."
          : "La operación está bloqueada. Revisa los avisos.",
      );
    });
  }
  async applyMove() {
    const reviewed = this.move;
    if (
      !reviewed?.puedeReclasificar ||
      this.busy() ||
      !this.confirm(
        `¿Mover ${reviewed.id} a ${reviewed.destino.tema} / ${reviewed.destino.subtema}? No se publica ni cambia el contenido.`,
      )
    )
      return;
    this.move = null;
    await this.run(async (current) => {
      const result = await this.api.reclassify(
        reviewed.id,
        reviewed.destino.subtemaId,
        { revision: reviewed.revision, confirmado: true },
      );
      if (!current()) return;
      if (result.origenSubtemaId !== reviewed.origen.subtemaId)
        throw new Error(
          "No se pudo validar el comprobante del origen. Consulta antes de reenviar.",
        );
      this.moveOutput.replaceChildren();
      this.paragraph(this.moveOutput, result.mensaje);
      this.paragraph(
        this.moveOutput,
        `Pregunta ${result.pregunta.id}: ${result.origenSubtemaId} → ${result.pregunta.subtemaId}. Estado: ${result.pregunta.estadoContenido}.`,
      );
      this.batch = null;
      this.groupPage = null;
      this.matchPage = null;
      this.message(
        "Destino confirmado. Actualiza el catálogo antes de seguir editando. No hay restauración automática.",
      );
    });
  }
}
