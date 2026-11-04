const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const button = (text, action, className = "secondary") => {
  const el = node("button", text, className);
  el.type = "button";
  el.onclick = action;
  return el;
};
function field(form, label, id, type = "text") {
  const text = node("label", label);
  text.htmlFor = id;
  const input = node(type === "textarea" ? "textarea" : "input");
  input.id = id;
  input.required = true;
  if (type !== "textarea") input.type = type;
  form.append(text, input);
  return input;
}

export class PrivacyRequests {
  constructor({
    api,
    host,
    canReview = false,
    confirm = (text) => globalThis.confirm(text),
  }) {
    Object.assign(this, { api, host, canReview, confirm });
    this.generation = 0;
    this.busy = false;
    this.dirty = false;
    this.operations = new Map();
  }
  get hasDraft() {
    return this.dirty;
  }
  close() {
    this.generation++;
    this.host.replaceChildren();
    this.dirty = false;
    this.busy = false;
    this.operations.clear();
  }
  message(text, error = false) {
    this.status.setAttribute("role", error ? "alert" : "status");
    this.status.textContent = text;
  }
  async open(page = 1, notice = "") {
    if (
      this.busy ||
      (this.dirty &&
        !this.confirm(
          "Esta consulta descartará el borrador sin enviar. ¿Continuar?",
        ))
    )
      return;
    const generation = ++this.generation;
    this.dirty = false;
    this.host.replaceChildren(
      node("h2", "Solicitudes de supresión"),
      node(
        "p",
        "Solicitar no borra ni desactiva la cuenta. La baja normal conserva el historial; la supresión revisada es irreversible y borra identidad, acceso y progreso propio, conservando registros compartidos sin la identidad del titular.",
        "accounts-note",
      ),
    );
    this.status = node("p", "Cargando solicitudes…");
    this.status.setAttribute("role", "status");
    this.status.tabIndex = -1;
    this.host.append(this.status);
    try {
      const result = await this.api.privacyRequests(`?pagina=${page}`);
      if (generation !== this.generation) return;
      if (!Array.isArray(result?.items))
        throw new Error("La respuesta de solicitudes no es válida.");
      this.message(notice);
      if (this.canReview)
        this.host.append(
          button("Registrar solicitud autorizada", () =>
            this.startRequest("", "cuenta indicada por su identificador"),
          ),
        );
      if (!result.items.length)
        this.host.append(
          node("p", "No hay solicitudes en esta página.", "empty"),
        );
      for (const row of result.items) {
        const card = node("article", undefined, "accounts-card");
        card.append(
          node("h3", `Solicitud ${row.id}`),
          node("p", `Estado: ${row.estado} · versión ${row.version}`),
        );
        if (this.canReview)
          card.append(button("Revisar impacto", () => this.review(row.id)));
        this.host.append(card);
      }
      const pager = node("div", undefined, "accounts-actions");
      const previous = button("Anterior", () => this.open(page - 1));
      previous.disabled = page === 1;
      const next = button("Siguiente", () => this.open(page + 1));
      next.disabled = !result.tieneSiguiente;
      pager.append(
        previous,
        node("span", `Página ${page}`),
        next,
        button("Actualizar solicitudes", () => this.open(page)),
      );
      this.host.append(pager);
    } catch (error) {
      if (generation === this.generation) {
        this.message(error.message, true);
        this.status.append(
          button("Reintentar consulta", () => this.open(page)),
        );
      }
    }
  }
  startRequest(usuarioId, name) {
    if (this.busy) return;
    if (
      this.dirty &&
      !this.confirm("Cambiar de solicitud descartará el borrador. ¿Continuar?")
    )
      return;
    this.generation++;
    this.dirty = false;
    this.formHost?.remove();
    const form = node("form", undefined, "accounts-card accounts-stack");
    this.formHost = form;
    form.append(
      node("h3", `Solicitar revisión de ${name}`),
      node(
        "p",
        "No escribas contraseñas, datos de otros alumnos ni documentos sensibles. SaberPlus debe revisar la autoridad de esta solicitud antes de ejecutarla.",
      ),
    );
    const target = field(form, "Identificador de la cuenta", "privacy-target");
    target.value = usuarioId;
    target.readOnly = !this.canReview;
    target.pattern = "[0-9a-fA-F-]{36}";
    target.maxLength = 36;
    const reason = field(
      form,
      "Motivo de la solicitud",
      "privacy-reason",
      "textarea",
    );
    reason.maxLength = 500;
    const submit = node("button", "Enviar solicitud a revisión", "primary");
    submit.type = "submit";
    form.append(
      submit,
      button("Cancelar solicitud sin enviar", () => {
        form.remove();
        this.dirty = false;
      }),
    );
    reason.oninput = target.oninput = () => (this.dirty = true);
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const key = `${target.value.trim()}:${reason.value.trim()}`;
      if (!this.operations.has(key))
        this.operations.set(key, crypto.randomUUID());
      void this.command(
        "",
        {
          usuarioId: target.value.trim(),
          motivo: reason.value.trim(),
          operacionId: this.operations.get(key),
        },
        "Solicitud enviada. No se borraron datos.",
      );
    };
    this.host.append(form);
    reason.focus();
  }
  async review(id) {
    if (!this.canReview) return;
    if (this.busy) return;
    if (
      this.dirty &&
      !this.confirm("Cambiar de revisión descartará el borrador. ¿Continuar?")
    )
      return;
    const generation = ++this.generation;
    this.dirty = false;
    this.message("Consultando impacto actual…");
    try {
      const result = await this.api.privacyRequests(`${id}/revision`);
      if (generation !== this.generation) return;
      this.reviewHost?.remove();
      const card = node("section", undefined, "accounts-card");
      this.reviewHost = card;
      card.append(
        node("h3", `Revisión: ${result.cuenta.nombre}`),
        node(
          "p",
          `Estado: ${result.estado}. Los recuentos pertenecen a esta revisión del servidor.`,
        ),
      );
      const counts = node("dl", undefined, "privacy-counts");
      for (const [label, count] of Object.entries(result.registros))
        counts.append(
          node("dt", label.replace(/([A-Z])/g, " $1")),
          node("dd", String(count)),
        );
      card.append(counts);
      for (const text of result.bloqueos ?? [])
        card.append(node("p", text, "accounts-note"));
      if (result.estado === "PENDIENTE") {
        card.append(
          button("Rechazar solicitud · conservar datos", () =>
            this.command(
              `${id}/rechazar`,
              { version: result.version },
              "Solicitud rechazada. Se conservaron los datos.",
            ),
          ),
        );
        if (!result.bloqueos?.length) {
          const form = node("form", undefined, "accounts-stack privacy-danger");
          form.append(
            node("h4", "Ejecución irreversible · solo ADMIN"),
            node(
              "p",
              "Verifica la autorización del titular o responsable. Se borran identidad, credenciales y progreso individual. No hay recuperación ni traslado. Los resultados compartidos y auditorías conservan únicamente la referencia anónima.",
            ),
          );
          const confirm = field(
            form,
            "Escribe SUPRIMIR CUENTA para confirmar",
            "privacy-confirm",
          );
          confirm.autocomplete = "off";
          confirm.pattern = "SUPRIMIR CUENTA";
          confirm.oninput = () => (this.dirty = true);
          const execute = node(
            "button",
            "Ejecutar supresión revisada",
            "privacy-execute",
          );
          execute.type = "submit";
          form.append(execute);
          form.onsubmit = (event) => {
            event.preventDefault();
            if (form.reportValidity())
              void this.command(
                `${id}/ejecutar`,
                {
                  version: result.version,
                  huellaRevision: result.huellaRevision,
                  confirmacion: confirm.value,
                },
                "Supresión confirmada. Los datos propios se borraron y los registros compartidos se conservaron sin identidad.",
              );
          };
          card.append(form);
        }
      }
      this.host.append(card);
      this.message(
        "Revisión cargada. Ningún dato fue borrado por consultarla.",
      );
    } catch (error) {
      if (generation === this.generation) this.message(error.message, true);
    }
  }
  async command(action, payload, notice) {
    if (this.busy) return;
    const generation = this.generation;
    this.busy = true;
    this.host.querySelectorAll("button").forEach((el) => (el.disabled = true));
    this.message("Confirmando operación…");
    try {
      await this.api.privacyRequests(action, payload);
      if (generation === this.generation) {
        this.busy = false;
        this.dirty = false;
        await this.open(1, notice);
      }
    } catch (error) {
      if (generation === this.generation) {
        this.busy = false;
        this.message(
          `${error.message} Consulta el estado antes de reenviar.`,
          true,
        );
        this.status.append(
          button("Consultar estado actual", () => this.open()),
        );
      }
    }
  }
}
