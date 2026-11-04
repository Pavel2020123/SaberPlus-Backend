import { PrivacyRequests } from "./privacy-requests.mjs";

const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const button = (text, action) => {
  const el = node("button", text, "secondary");
  el.type = "button";
  el.onclick = action;
  return el;
};

export class InstitutionLifecycle {
  constructor({
    api,
    host,
    institutionId,
    confirm = (text) => globalThis.confirm(text),
  }) {
    Object.assign(this, { api, host, institutionId, confirm });
    this.generation = 0;
    this.busy = false;
    this.operations = new Map();
  }
  close() {
    this.privacy?.close();
    this.privacy = null;
    this.generation++;
    this.busy = false;
    this.host.replaceChildren();
    this.operations.clear();
  }
  async open(page = 1) {
    if (
      this.privacy?.hasDraft &&
      !this.confirm(
        "Actualizar descartará el borrador de solicitud sin enviar. ¿Continuar?",
      )
    )
      return;
    this.privacy?.close();
    this.privacy = null;
    const generation = ++this.generation;
    this.status = node("p", "Consultando cuentas y cupos…");
    this.status.setAttribute("role", "status");
    this.host.replaceChildren(this.status);
    const result = await this.api.institutionLifecycle(
      this.institutionId,
      `bajas?pagina=${page}`,
    );
    if (generation !== this.generation) return;
    if (!Array.isArray(result?.items))
      throw new Error(
        "No pudimos interpretar las cuentas. Actualiza la lista.",
      );
    this.host.replaceChildren(
      node("h2", "Bajas y continuidad"),
      node(
        "p",
        "Retirar un cupo no elimina la cuenta. Se conserva el historial; el cupo queda disponible y no habilita nuevas prácticas institucionales.",
      ),
      node(
        "p",
        "Volver a personal solo corresponde a cuentas personales vinculadas. Conserva el progreso y reanuda sus días guardados; no pausa ni cancela cobros externos.",
      ),
      node(
        "p",
        "La eliminación definitiva requiere una solicitud revisada por SaberPlus ADMIN. No se realiza desde estas acciones. No hay borrado automático tras la baja.",
        "accounts-note",
      ),
    );
    this.status = node("p");
    this.status.setAttribute("role", "status");
    this.status.tabIndex = -1;
    this.host.append(this.status);
    if (!result.items.length)
      this.host.append(
        node(
          "p",
          "Todavía no hay cuentas con cupo o invitación para gestionar.",
          "empty",
        ),
      );
    for (const row of result.items) {
      const card = node("article", undefined, "group-card");
      card.append(
        node("h3", row.nombre),
        node(
          "p",
          `${row.gestionada ? "Cuenta institucional gestionada" : row.vinculada ? "Cuenta personal vinculada" : "Cuenta personal desvinculada"} · ${row.tipo} · ${row.estado}`,
        ),
      );
      if (row.usuarioInstitucional)
        card.append(
          node("p", `Usuario institucional: ${row.usuarioInstitucional}`),
        );
      const actions = node("div", undefined, "lifecycle-actions");
      if (!row.propietario && row.estado !== "RETIRADA")
        actions.append(
          button("Retirar cupo · conservar historial", () =>
            this.command("retirar", row, generation),
          ),
        );
      if (!row.propietario && !row.gestionada && row.vinculada)
        actions.append(
          button("Desvincular y volver a personal", () =>
            this.command("volver-personal", row, generation),
          ),
        );
      if (row.propietario)
        card.append(
          node(
            "p",
            "El propietario debe transferir la propiedad antes de salir.",
          ),
        );
      if (row.gestionada)
        actions.append(
          button("Solicitar supresión a SaberPlus", () =>
            this.privacy?.startRequest(row.usuarioId, row.nombre),
          ),
        );
      card.append(actions);
      this.host.append(card);
    }
    const pager = node("div", undefined, "lifecycle-actions");
    const previous = button("Anterior", () =>
      this.open(page - 1).catch((error) => this.error(error)),
    );
    previous.disabled = page === 1;
    const next = button("Siguiente", () =>
      this.open(page + 1).catch((error) => this.error(error)),
    );
    next.disabled = !result.tieneSiguiente;
    pager.append(
      previous,
      node("span", `Página ${page}`),
      next,
      button("Actualizar lista", () =>
        this.open(page).catch((error) => this.error(error)),
      ),
    );
    this.host.append(pager);
    const privacyHost = node("section");
    this.host.append(privacyHost);
    this.privacy = new PrivacyRequests({
      api: this.api,
      host: privacyHost,
      confirm: this.confirm,
    });
    await this.privacy.open();
  }
  get hasDraft() {
    return Boolean(this.privacy?.hasDraft);
  }
  get isBusy() {
    return this.busy || Boolean(this.privacy?.busy);
  }
  error(error) {
    if (!this.status) {
      this.host.replaceChildren();
      this.status = node("p");
      this.host.append(this.status);
    }
    this.status.setAttribute("role", "alert");
    this.status.textContent =
      error.message ||
      "No pudimos confirmar la acción. Actualiza la lista antes de repetirla.";
  }
  async command(action, row, generation) {
    if (this.busy || generation !== this.generation) return;
    const text =
      action === "retirar"
        ? `¿Retirar el cupo de ${row.nombre}? Se conservará su historial y no podrá iniciar prácticas institucionales nuevas. Esto no elimina la cuenta.`
        : `¿Desvincular a ${row.nombre} y devolver su cuenta personal? Conserva su progreso y reanuda sus días guardados. Los intentos de esta vinculación no se reactivan. El colegio deja de tener acceso por esa vinculación.`;
    if (!this.confirm(text)) return;
    const key = `${action}:${row.id}:${row.actualizadoEn}`;
    if (!this.operations.has(key))
      this.operations.set(key, crypto.randomUUID());
    this.busy = true;
    const controls = [...this.host.querySelectorAll("button")];
    controls.forEach((el) => (el.disabled = true));
    this.status.setAttribute("role", "status");
    this.status.textContent = "Confirmando cambio…";
    try {
      await this.api.institutionLifecycle(this.institutionId, action, {
        operacionId: this.operations.get(key),
        usuarioId: row.usuarioId,
        versionAsignacion: row.actualizadoEn,
        ...(action === "volver-personal" ? { asignacionId: row.id } : {}),
      });
      if (generation !== this.generation) return;
      this.status.textContent =
        "Cambio confirmado. El historial se conservó. Actualiza la lista para revisar el estado antes de otra gestión.";
    } catch (error) {
      if (generation !== this.generation) return;
      this.error(error);
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        // Unknown results are not retried automatically or through a stale card.
        const reload = button("Revisar estado actual", () =>
          this.open().catch((error) => this.error(error)),
        );
        this.status.append(reload);
      }
    }
  }
}
