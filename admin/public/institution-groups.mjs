const element = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
const button = (label, callback, className = "secondary") => {
  const el = element("button", label, className);
  el.type = "button";
  el.onclick = callback;
  return el;
};

export class InstitutionGroups {
  constructor({ api, host, canManage = false, canWrite = true }) {
    this.api = api;
    this.host = host;
    this.canManage = canManage;
    this.canWrite = canWrite;
    this.generation = 0;
    this.dirtyForms = new Set();
  }
  get hasDraft() {
    return this.dirtyForms.size > 0;
  }
  close() {
    this.generation++;
    this.dirtyForms.clear();
    this.host.replaceChildren();
  }
  async open(section = "grupos") {
    const generation = ++this.generation;
    const current = () => generation === this.generation;
    this.host.replaceChildren(element("p", "Cargando tu comunidad…"));
    this.host.setAttribute("aria-busy", "true");
    try {
      if (section === "docentes" && !this.canManage)
        throw new Error(
          "La administración docente corresponde al propietario de tu institución.",
        );
      const groups = await this.api.institutionRead("grupos");
      const admin = this.canManage
        ? await this.api.institutionRead("administracion")
        : null;
      if (!current()) return;
      if (
        !Array.isArray(groups) ||
        (this.canManage && !Array.isArray(admin?.miembros))
      )
        throw new Error(
          "La información de administración no tiene el formato esperado.",
        );
      this.host.replaceChildren(
        element(
          "h1",
          section === "docentes"
            ? "Un equipo para acompañar"
            : "Grupos con propósito",
        ),
      );
      this.host.append(
        element(
          "p",
          section === "docentes"
            ? "Invita cuentas docentes personales y asígnalas a los grupos de tu institución. Nunca compartas sus contraseñas."
            : "Organiza los espacios de aprendizaje. Los docentes solo consultan los grupos que tienen asignados.",
        ),
      );
      if (!this.canWrite)
        this.host.append(
          element(
            "p",
            "La licencia no habilita nuevas gestiones. Se mantiene la consulta histórica autorizada. Actualiza el estado después de una renovación.",
            "empty",
          ),
        );
      const refresh = button("Actualizar lista", () => {
        if (
          this.hasDraft &&
          !globalThis.confirm(
            "Actualizar descartará los campos sin guardar. ¿Continuar?",
          )
        )
          return;
        this.dirtyForms.clear();
        this.open(section);
      });
      this.host.append(refresh);
      if (section === "docentes") {
        this.teachers(admin, current);
        return;
      }
      if (this.canManage && this.canWrite) this.createGroup(current);
      if (!groups.length)
        this.host.append(
          element(
            "p",
            this.canManage
              ? "Todavía no hay grupos. Crea el primero para organizar a tus estudiantes."
              : "Todavía no tienes grupos asignados. Consulta con tu coordinador.",
            "empty",
          ),
        );
      for (const group of groups) {
        const card = element("article", undefined, "group-card");
        card.append(
          element(
            "p",
            group.grado === "ONCE" ? "Grado 11" : "Grado 10",
            "eyebrow",
          ),
          element("h2", group.nombre),
        );
        card.append(
          element("p", `${group._count?.ClaseEstudiante ?? "—"} estudiantes`),
        );
        const names =
          group.profesores
            ?.map((row) => row.miembro?.usuario?.nombre)
            .filter((name) => typeof name === "string") ?? [];
        card.append(
          element(
            "p",
            names.length
              ? `Docentes: ${names.join(", ")}`
              : "Sin responsable asignado",
          ),
        );
        if (this.canManage && this.canWrite) {
          const details = element("details");
          details.append(element("summary", "Administrar este grupo"));
          const rename = this.form(
            details,
            "Guardar nombre",
            async (form) =>
              this.api.institutionGroup(
                "editar",
                { nombre: form._nameInput.value },
                group.id,
              ),
            current,
          );
          rename._nameInput = this.field(
            rename,
            `group-name-${group.id}`,
            "Nombre del grupo",
            "text",
            group.nombre,
          );
          rename._nameInput.maxLength = 120;
          const assign = this.form(
            details,
            "Asignar docente al grupo",
            async (form) =>
              this.api.institutionGroup(
                "asignar",
                { miembroId: form._memberInput.value },
                group.id,
              ),
            current,
          );
          const label = element("label", "Docente de la institución");
          label.htmlFor = `group-teacher-${group.id}`;
          const select = element("select");
          select.id = label.htmlFor;
          select.required = true;
          const placeholder = element("option", "Selecciona un docente");
          placeholder.value = "";
          select.append(placeholder);
          for (const member of admin.miembros) {
            const option = element(
              "option",
              member.usuario?.nombre ?? "Docente",
            );
            option.value = member.id;
            select.append(option);
          }
          assign._memberInput = select;
          assign.prepend(select);
          assign.prepend(label);
          details.append(
            element(
              "p",
              "Asignar no retira a otros responsables ni consume otro cupo. El backend exige cupo docente activo, excepto al propietario.",
              "fine",
            ),
          );
          card.append(details);
        }
        this.host.append(card);
      }
    } catch (error) {
      if (current()) {
        this.host.replaceChildren(
          element("p", error.message),
          button("Reintentar", () => this.open(section)),
        );
        this.host.setAttribute("role", "alert");
      }
    } finally {
      if (current()) this.host.setAttribute("aria-busy", "false");
    }
  }
  field(form, id, labelText, type = "text", value = "") {
    const label = element("label", labelText);
    label.htmlFor = id;
    const input = element("input");
    input.id = id;
    input.type = type;
    input.value = value;
    input.required = true;
    form.prepend(input);
    form.prepend(label);
    return input;
  }
  form(host, actionLabel, command, current) {
    const form = element("form");
    const submit = element("button", actionLabel, "primary");
    submit.type = "submit";
    const status = element("p");
    status.setAttribute("role", "status");
    status.tabIndex = -1;
    let busy = false,
      uncertain = false,
      completed = false;
    form.oninput = () => {
      this.dirtyForms.add(form);
      if (!busy && !uncertain) {
        completed = false;
        submit.disabled = false;
      }
    };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (busy || uncertain || completed || !form.reportValidity()) return;
      busy = true;
      submit.disabled = true;
      status.setAttribute("role", "status");
      status.textContent = "Guardando…";
      try {
        await command(form);
        if (!current()) return;
        completed = true;
        this.dirtyForms.delete(form);
        status.textContent =
          "Cambio guardado. Actualiza la lista para ver el estado actual.";
      } catch (error) {
        if (!current()) return;
        uncertain = !error.status || error.status >= 500;
        status.setAttribute("role", "alert");
        status.textContent = `${error.message}${uncertain ? " El resultado puede ser incierto. Revisa la lista antes de volver a crear o asignar; no se reenvía automáticamente." : ""}`;
        status.focus?.();
      } finally {
        busy = false;
        if (current()) submit.disabled = uncertain || completed;
      }
    };
    form.append(submit, status);
    host.append(form);
    return form;
  }
  createGroup(current) {
    const panel = element("details", undefined, "panel");
    panel.append(element("summary", "Crear un grupo"));
    const form = this.form(
      panel,
      "Crear grupo",
      async (form) =>
        this.api.institutionGroup("crear", {
          nombre: form._nameInput.value,
          grado: form._gradeInput.value,
        }),
      current,
    );
    const label = element("label", "Grado");
    label.htmlFor = "new-group-grade";
    const select = element("select");
    select.id = label.htmlFor;
    for (const [value, text] of [
      ["DECIMO", "Grado 10"],
      ["ONCE", "Grado 11"],
    ]) {
      const option = element("option", text);
      option.value = value;
      select.append(option);
    }
    form._gradeInput = select;
    form.prepend(select);
    form.prepend(label);
    form._nameInput = this.field(form, "new-group-name", "Nombre del grupo");
    form._nameInput.maxLength = 120;
    this.host.append(panel);
  }
  teachers(admin, current) {
    if (this.canWrite) {
      const panel = element("section", undefined, "panel");
      panel.append(
        element("h2", "Invitar docente"),
        element(
          "p",
          "La persona acepta la invitación desde su cuenta de SaberPlus. Crear la invitación no significa enviar un correo ni crear un buzón.",
        ),
      );
      const form = this.form(
        panel,
        "Crear invitación",
        async (form) =>
          this.api.institutionTeacherInvitation(form._emailInput.value),
        current,
      );
      form._emailInput = this.field(
        form,
        "invite-teacher-email",
        "Correo real del docente",
        "email",
      );
      form._emailInput.autocomplete = "off";
      this.host.append(panel);
    }
    this.host.append(element("h2", "Equipo institucional"));
    for (const member of admin.miembros) {
      const card = element("article", undefined, "group-card");
      card.append(
        element("h3", member.usuario?.nombre ?? "Docente"),
        element("p", member.rol),
        element("p", member.usuario?.correo ?? "Sin correo real informado"),
      );
      this.host.append(card);
    }
    this.host.append(element("h2", "Invitaciones pendientes"));
    if (!admin.invitaciones?.length)
      this.host.append(
        element("p", "No hay invitaciones pendientes.", "empty"),
      );
    for (const invite of admin.invitaciones ?? [])
      this.host.append(element("p", `${invite.correo} · ${invite.rol}`));
  }
}
