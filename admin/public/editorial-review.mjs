export class EditorialReview {
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
    this.record = null;
    this.$("review-close").onclick = () => this.close();
    this.$("review-refresh").onclick = () => {
      if (this.target) void this.open(this.target.tipo, this.target.id);
    };
  }
  close(force = false) {
    if (!force && this.busy()) return false;
    this.version++;
    this.record = null;
    this.target = null;
    this.$("review-panel").hidden = true;
    for (const id of [
      "review-blocks",
      "review-warnings",
      "review-actions",
      "review-content",
    ])
      this.$(id).replaceChildren();
    this.$("review-message").textContent = "";
    return true;
  }
  async open(tipo, id) {
    if (!this.close()) return;
    this.target = { tipo, id };
    this.$("review-panel").hidden = false;
    this.$("review-heading").textContent = "Cargando revisión…";
    await this.run(async (version) => {
      const row = await this.api.review(tipo, id);
      if (version !== this.version) return;
      this.fill(row);
      this.$("review-heading").focus();
    });
  }
  async run(task) {
    if (this.busy()) return;
    const version = this.version;
    this.setBusy(true);
    this.controls();
    try {
      await task(version);
    } catch (error) {
      if (version === this.version) {
        this.record = null;
        this.$("review-actions").replaceChildren();
        this.$("review-message").textContent =
          `${error.message} Recarga la revisión antes de volver a actuar. No se reintenta automáticamente.`;
      }
    } finally {
      if (version === this.version) {
        this.setBusy(false);
        this.controls();
      }
    }
  }
  fill(row) {
    this.record = row;
    this.$("review-heading").textContent =
      `Revisión de ${row.tipo} · ${row.estadoContenido}`;
    this.$("review-id").textContent = `ID: ${row.id} · Área: ${row.area}`;
    this.$("review-message").textContent = row.habilitado
      ? "Estás revisando la versión guardada en el servidor. Comprueba el contenido antes de confirmar."
      : "Consulta disponible. Los cambios de estado reales están desactivados hasta completar C3-D2 y preparar el entorno.";
    const nodes = (values, tag) =>
      values.map((text) => {
        const node = this.doc.createElement(tag);
        node.textContent = text;
        return node;
      });
    this.$("review-blocks").replaceChildren(
      ...nodes(
        row.bloqueos.length
          ? row.bloqueos
          : [
              "Sin bloqueos automáticos de publicación. La revisión humana sigue siendo necesaria.",
            ],
        "li",
      ),
    );
    this.$("review-warnings").replaceChildren(...nodes(row.advertencias, "li"));
    this.$("review-content").replaceChildren(...nodes(row.contenido, "p"));
    const labels = {
      EN_REVISION: "Enviar a revisión",
      BORRADOR: "Volver a borrador",
      PUBLICADO: "Publicar",
      ARCHIVADO: "Archivar",
    };
    this.$("review-actions").replaceChildren(
      ...row.destinos.map((destino) => {
        const button = this.doc.createElement("button");
        button.type = "button";
        button.className = destino === "PUBLICADO" ? "primary" : "secondary";
        button.textContent = labels[destino];
        button.onclick = () => this.change(destino);
        return button;
      }),
    );
    this.controls();
  }
  controls() {
    this.$("review-close").disabled = this.busy();
    this.$("review-refresh").disabled = this.busy() || !this.target;
    for (const button of this.$("review-actions").children)
      button.disabled = this.busy() || !this.record?.habilitado;
  }
  async change(destino) {
    const row = this.record;
    if (this.busy() || !row?.habilitado || !row.destinos.includes(destino))
      return;
    const warning =
      destino === "PUBLICADO"
        ? "Confirmo que revisé el contenido, su exactitud y autorización de uso. Podrá estar disponible para estudiantes cuando toda su jerarquía esté publicada."
        : destino === "ARCHIVADO"
          ? "Se retirará de actividades nuevas sin borrar el historial. No se archivarán dependientes automáticamente."
          : "Solo se cambia el estado de este registro; no se publican sus dependientes.";
    if (
      !this.confirm(
        `${warning}\n\n${row.tipo}: ${row.id}\n${row.estadoContenido} → ${destino}\n¿Confirmar?`,
      )
    )
      return;
    await this.run(async (version) => {
      const result = await this.api.review(row.tipo, row.id, {
        revision: row.revision,
        destino,
        confirmado: true,
      });
      if (version !== this.version) return;
      this.fill(result);
      this.$("review-message").textContent =
        `Estado confirmado: ${result.estadoContenido}. Actualiza el catálogo para ver sus etiquetas al regresar.`;
    });
  }
}
