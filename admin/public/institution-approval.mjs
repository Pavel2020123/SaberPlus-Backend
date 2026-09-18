const labels = {
  PENDIENTE: "Pendiente",
  REQUIERE_INFORMACION: "Requiere información",
  APROBADA: "Aprobada",
  RECHAZADA: "Rechazada",
  SUSPENDIDA: "Suspendida",
  LEGADO_EN_REVISION: "Existente · requiere verificación",
};
const actions = {
  PENDIENTE: ["APROBADA", "REQUIERE_INFORMACION", "RECHAZADA"],
  REQUIERE_INFORMACION: ["APROBADA", "RECHAZADA"],
  LEGADO_EN_REVISION: ["APROBADA", "REQUIERE_INFORMACION", "RECHAZADA"],
  APROBADA: ["SUSPENDIDA"],
  SUSPENDIDA: ["APROBADA"],
  RECHAZADA: [],
};
function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}
function button(text, action) {
  const el = node("button", text);
  el.type = "button";
  el.className = "secondary";
  el.onclick = action;
  return el;
}

// Uses the existing in-memory ADMIN session. Never render evidence as HTML.
export class InstitutionApproval {
  constructor({ api, host, demo }) {
    this.api = api;
    this.host = host;
    this.demo = demo;
    this.version = 0;
    this.page = 1;
    this.state = "PENDIENTE";
  }
  close() {
    this.version++;
    this.host.hidden = true;
    this.host.replaceChildren();
  }
  async open() {
    this.close();
    this.host.hidden = false;
    const heading = node("h2", "Aprobación de instituciones");
    heading.tabIndex = -1;
    this.host.append(heading);
    heading.focus();
    this.host.append(
      node(
        "p",
        this.demo
          ? "DEMO: instituciones ficticias. Las decisiones no llegan a Supabase."
          : "Acceso exclusivo ADMIN. Comprueba la existencia de la institución y la autorización del solicitante por un canal independiente.",
      ),
    );
    const filter = node("select");
    filter.setAttribute("aria-label", "Estado de las solicitudes");
    for (const [value, text] of [
      ["", "Todos los estados"],
      ...Object.entries(labels),
    ]) {
      const option = node("option", text);
      option.value = value;
      filter.append(option);
    }
    filter.value = this.state;
    filter.onchange = () => {
      this.state = filter.value;
      this.page = 1;
      void this.load();
    };
    this.status = node("p");
    this.status.setAttribute("role", "status");
    this.list = node("div");
    this.detail = node("section");
    this.host.append(
      filter,
      button("Actualizar solicitudes", () => void this.load()),
      button("Cerrar verificación", () => this.close()),
      this.status,
      this.list,
      this.detail,
    );
    await this.load();
  }
  async load() {
    const version = ++this.version;
    this.detail.replaceChildren();
    this.list.replaceChildren();
    this.status.textContent = "Consultando solicitudes…";
    try {
      const data = await this.api.institutionApplications(
        this.state,
        this.page,
      );
      if (version !== this.version) return;
      if (!Array.isArray(data?.items) || typeof data.hayMas !== "boolean")
        throw new Error("Respuesta de solicitudes no válida.");
      this.status.textContent = data.items.length
        ? `Página ${this.page}`
        : "No hay solicitudes en este estado.";
      for (const item of data.items) {
        this.list.append(
          button(
            `${item.nombre} · ${item.ciudad || "Ciudad sin informar"} · ${labels[item.estado] ?? item.estado}`,
            () => void this.inspect(item.id),
          ),
        );
      }
      if (this.page > 1)
        this.list.append(
          button("Página anterior", () => {
            this.page--;
            void this.load();
          }),
        );
      if (data.hayMas)
        this.list.append(
          button("Página siguiente", () => {
            this.page++;
            void this.load();
          }),
        );
    } catch (error) {
      if (version === this.version) this.status.textContent = error.message;
    }
  }
  async inspect(id) {
    const version = ++this.version;
    this.detail.replaceChildren();
    this.status.textContent = "Consultando evidencia…";
    try {
      const row = await this.api.institutionApplication(id);
      if (version !== this.version) return;
      if (!actions[row.estado] || !Number.isInteger(row.revision))
        throw new Error("Respuesta de solicitud no válida.");
      this.status.textContent = "";
      const heading = node("h3", `${row.nombre} · ${labels[row.estado]}`);
      heading.tabIndex = -1;
      this.detail.append(heading);
      const fields = {
        Ciudad: row.ciudad,
        Solicitante: row.solicitante?.nombre,
        "Correo de la cuenta": row.solicitante?.correo,
        "Correo institucional": row.correoInstitucional,
        "Contacto institucional": row.contacto,
        "Referencia HTTPS (comprueba el dominio antes de visitarlo)":
          row.referenciaUrl,
        "Autorización declarada": row.evidencia,
        "Respuesta visible para el profesor": row.mensaje,
        "Fin de transición": row.transicionHasta,
      };
      for (const [label, value] of Object.entries(fields)) {
        this.detail.append(
          node("h4", label),
          node("p", value || "Sin informar"),
        );
      }
      const history = node("details");
      history.append(node("summary", "Historial privado de revisión"));
      for (const event of row.historial ?? []) {
        history.append(
          node(
            "p",
            `${event.fecha ?? ""} · ${event.accion ?? ""} · ${event.actorId ?? ""}`,
          ),
        );
        if (event.mensaje)
          history.append(node("p", `Respuesta: ${event.mensaje}`));
        if (event.notaInterna)
          history.append(node("p", `Nota interna: ${event.notaInterna}`));
        if (event.datos)
          history.append(node("pre", JSON.stringify(event.datos, null, 2)));
      }
      this.detail.append(history);
      if (actions[row.estado].length) this.reviewForm(row, version);
      heading.focus();
    } catch (error) {
      if (version === this.version) this.status.textContent = error.message;
    }
  }
  reviewForm(row, version) {
    const form = node("form"),
      choice = node("select");
    const placeholder = node("option", "Selecciona una decisión");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    choice.append(placeholder);
    choice.required = true;
    for (const value of actions[row.estado]) {
      const option = node("option", labels[value]);
      option.value = value;
      choice.append(option);
    }
    const message = node("textarea"),
      note = node("textarea"),
      confirmation = node("input");
    for (const field of [message, note]) {
      field.required = true;
      field.minLength = 10;
      field.maxLength = 1000;
      field.rows = 3;
    }
    confirmation.type = "checkbox";
    confirmation.required = true;
    for (const [text, input] of [
      ["Decisión", choice],
      ["Respuesta para el profesor (sin datos privados)", message],
      ["Nota interna: comprobaciones realizadas y motivo", note],
      [
        "Confirmo que revisé la evidencia y la autorización. Aprobar habilita el acceso; suspender lo bloquea.",
        confirmation,
      ],
    ]) {
      const label = node("label", text);
      label.append(input);
      form.append(label);
    }
    const submit = node("button", "Guardar decisión");
    submit.type = "submit";
    submit.className = "primary";
    form.append(submit);
    this.detail.append(form);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.reportValidity() || submit.disabled) return;
      for (const field of form.elements) field.disabled = true;
      this.status.textContent = "Guardando revisión…";
      try {
        await this.api.reviewInstitution(row.id, {
          revision: row.revision,
          estado: choice.value,
          mensaje: message.value.trim(),
          notaInterna: note.value.trim(),
          confirmado: confirmation.checked,
        });
        if (version !== this.version) return;
        await this.inspect(row.id);
        this.status.textContent =
          "Decisión guardada. El profesor la verá al actualizar su estado.";
      } catch (error) {
        if (version !== this.version) return;
        // Do not offer blind retries after an uncertain write or version conflict.
        this.status.textContent = `${error.message} Consulta de nuevo esta solicitud antes de tomar otra decisión.`;
        this.detail.append(
          button("Consultar estado actual", () => void this.inspect(row.id)),
        );
      }
    };
  }
}
