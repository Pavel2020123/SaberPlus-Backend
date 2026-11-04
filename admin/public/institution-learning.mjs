const areaNames = {
  MATEMATICAS: "Matemáticas",
  LECTURA_CRITICA: "Lectura crítica",
  CIENCIAS_NATURALES: "Ciencias naturales",
  SOCIALES_CIUDADANAS: "Sociales y ciudadanas",
  INGLES: "Inglés",
};
const labels = {
  SIN_DATOS: "Sin datos suficientes",
  REFUERZO: "Por reforzar",
  ATENCION: "En proceso",
  ESTABLE: "Estable",
  EVIDENCIA_INSUFICIENTE: "Evidencia insuficiente",
  POR_REFORZAR: "Por reforzar",
  FORTALEZA: "Fortaleza",
  EN_PROCESO: "En proceso",
};
const text = (tag, value, className) => {
  const el = document.createElement(tag);
  if (value !== undefined) el.textContent = value;
  if (className) el.className = className;
  return el;
};
const button = (label, action, className = "secondary") => {
  const el = text("button", label, className);
  el.type = "button";
  el.onclick = action;
  return el;
};
const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Sin fecha informada"
    : new Intl.DateTimeFormat("es-CO", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Bogota",
      }).format(date);
};

export class InstitutionLearning {
  constructor({ api, host, canAssign = true }) {
    this.api = api;
    this.host = host;
    this.canAssign = canAssign;
    this.generation = 0;
    this.operations = new Map();
  }
  get hasDraft() {
    return Boolean(this.draftDirty);
  }
  close() {
    this.generation++;
    this.operations.clear();
    this.host.replaceChildren();
  }
  async run(task, { replace = true } = {}) {
    const generation = ++this.generation;
    if (replace) this.host.replaceChildren();
    this.host.setAttribute("aria-busy", "true");
    const status = text("p", "Cargando…");
    status.setAttribute("role", "status");
    this.host.prepend(status);
    try {
      await task(() => generation === this.generation);
    } catch (error) {
      if (generation === this.generation) {
        status.setAttribute("role", "alert");
        status.textContent =
          error.message ||
          "No se pudo completar la solicitud. Intenta de nuevo.";
        status.append(button("Reintentar", () => this.run(task)));
        return;
      }
    } finally {
      if (generation === this.generation)
        this.host.setAttribute("aria-busy", "false");
    }
    status.remove();
  }
  tracking() {
    return this.run(async (current) => {
      const result = await this.api.institutionRead("seguimiento");
      if (!current()) return;
      if (!Array.isArray(result.estudiantes))
        throw new Error("El seguimiento no tiene el formato esperado.");
      this.host.append(
        text("h1", "Cada avance cuenta"),
        text(
          "p",
          "Simulacros, actividad y evidencia por estudiante. Sin datos no significa bajo rendimiento.",
        ),
      );
      const filter = text("input");
      filter.type = "search";
      filter.id = "tracking-search";
      filter.placeholder = "Nombre del estudiante";
      const label = text("label", "Buscar estudiante");
      label.htmlFor = filter.id;
      const list = text("div", undefined, "group-grid");
      let page = 1;
      const controls = text("div", undefined, "section-heading");
      const render = () => {
        const rows = result.estudiantes.filter((row) =>
          String(row.nombre)
            .toLocaleLowerCase("es")
            .includes(filter.value.toLocaleLowerCase("es")),
        );
        const pages = Math.max(1, Math.ceil(rows.length / 20));
        page = Math.min(page, pages);
        list.replaceChildren();
        controls.replaceChildren();
        if (!rows.length)
          list.append(
            text(
              "p",
              "No hay estudiantes para esta búsqueda o todavía no tienes alumnos en tu ámbito.",
              "empty",
            ),
          );
        for (const student of rows.slice((page - 1) * 20, page * 20)) {
          const card = text("article", undefined, "group-card");
          card.append(text("h2", student.nombre));
          card.append(
            text("p", labels[student.estadoAcademico] ?? "Sin clasificación"),
            text("p", `${student.totalSimulacros ?? 0} simulacros registrados`),
          );
          card.append(
            text(
              "p",
              student.totalSimulacros > 0
                ? `Promedio de simulacros: ${student.promedioPuntaje}`
                : "Aún no hay un promedio de simulacros.",
            ),
          );
          card.append(
            text(
              "p",
              student.identificadorInstitucional ??
                student.correo ??
                "Sin correo real informado",
            ),
          );
          if (student.diagnosticoInicial) {
            const diagnostic = student.diagnosticoInicial;
            card.append(
              text("h3", "Diagnóstico inicial"),
              text(
                "p",
                `${diagnostic.porcentaje}% de respuestas correctas · ${diagnostic.totalPreguntas} preguntas`,
              ),
            );
            for (const row of diagnostic.porArea ?? [])
              card.append(
                text(
                  "p",
                  `${areaNames[row.area] ?? row.area}: ${row.porcentaje}%`,
                ),
              );
          } else {
            card.append(
              text("p", "Diagnóstico inicial pendiente o no disponible."),
            );
          }
          card.append(
            button(`Ver evidencia de ${student.nombre}`, () =>
              this.evidence(student.id),
            ),
          );
          list.append(card);
        }
        const previous = button("Anterior", () => {
          page--;
          render();
        });
        previous.disabled = page <= 1;
        const next = button("Siguiente", () => {
          page++;
          render();
        });
        next.disabled = page >= pages;
        controls.append(
          previous,
          text("span", `Página ${page} de ${pages}`),
          next,
        );
      };
      filter.oninput = () => {
        page = 1;
        render();
      };
      this.host.append(label, filter, list, controls);
      render();
    });
  }
  evidence(studentId) {
    return this.run(async (current) => {
      const result = await this.api.institutionEvidence(studentId);
      if (!current()) return;
      this.host.append(
        button("← Volver al seguimiento", () => this.tracking()),
        text("h1", result.estudiante?.nombre ?? "Evidencia del estudiante"),
      );
      this.host.append(
        text(
          "p",
          "La evidencia reúne respuestas de varias sesiones; no equivale a una calificación oficial.",
        ),
      );
      const themes = result.evidencia?.temas;
      if (!Array.isArray(themes))
        throw new Error("No se pudo interpretar la evidencia.");
      if (result.evidencia.parcial)
        this.host.append(
          text(
            "p",
            "La ventana de evidencia está incompleta; interpreta estos resultados con cautela.",
            "empty",
          ),
        );
      if (!themes.length)
        this.host.append(
          text(
            "p",
            "Todavía no hay evidencia disponible. El estudiante necesita practicar para construir su seguimiento.",
            "empty",
          ),
        );
      for (const theme of themes) {
        const card = text("article", undefined, "panel");
        card.append(
          text("p", areaNames[theme.area] ?? theme.area, "eyebrow"),
          text("h2", theme.nombre),
          text("p", labels[theme.estado] ?? theme.estado),
        );
        card.append(
          text(
            "p",
            `${theme.preguntasUnicas} preguntas únicas · ${theme.sesiones} sesiones · ${theme.dias} días`,
          ),
        );
        if (theme.estado !== "EVIDENCIA_INSUFICIENTE")
          card.append(
            text(
              "p",
              `${theme.porcentaje}% de respuestas correctas en esta ventana`,
            ),
          );
        this.host.append(card);
      }
    });
  }
  priorities() {
    return this.run(async (current) => {
      const groups = await this.api.institutionRead("grupos");
      if (!current()) return;
      this.host.append(
        text("h1", "Una prioridad, un siguiente paso"),
        text(
          "p",
          "Asigna al grupo una meta de cinco preguntas distintas. Cumplir la práctica no acredita dominio.",
        ),
      );
      if (!Array.isArray(groups) || !groups.length) {
        this.host.append(
          text(
            "p",
            "Necesitas un grupo autorizado para consultar o asignar prioridades.",
            "empty",
          ),
        );
        return;
      }
      const label = text("label", "Grupo");
      label.htmlFor = "priority-group";
      const select = text("select");
      select.id = label.htmlFor;
      for (const group of groups) {
        const option = text("option", group.nombre);
        option.value = group.id;
        select.append(option);
      }
      const work = text("div");
      this.host.append(label, select, work);
      let selected = select.value;
      select.onchange = () => {
        if (
          this.hasDraft &&
          !globalThis.confirm(
            "Cambiar de grupo descartará el borrador de prioridad. ¿Continuar?",
          )
        ) {
          select.value = selected;
          return;
        }
        this.draftDirty = false;
        selected = select.value;
        this.groupPriorities(select.value, work);
      };
      await this.groupPriorities(select.value, work);
    });
  }
  async groupPriorities(groupId, work, page = 1) {
    // Nested view owns its generation. Changing groups discards late responses.
    this.groupGeneration = (this.groupGeneration ?? 0) + 1;
    const generation = this.groupGeneration,
      parentGeneration = this.generation;
    const current = () =>
      generation === this.groupGeneration &&
      parentGeneration === this.generation;
    work.replaceChildren(text("p", "Cargando prioridades…"));
    try {
      const result = await this.api.institutionPriorities(
        groupId,
        `?pagina=${page}`,
      );
      if (!current()) return;
      if (!Array.isArray(result.prioridades))
        throw new Error("No se pudo interpretar la lista de prioridades.");
      work.replaceChildren();
      const formHost = text("div", undefined, "panel");
      const assignButton = button(
        "Asignar una prioridad",
        () => this.priorityForm(groupId, formHost),
        "primary",
      );
      assignButton.disabled = !this.canAssign;
      formHost.append(assignButton);
      if (!this.canAssign)
        formHost.append(
          text(
            "p",
            "No se pueden asignar prioridades nuevas con este estado de licencia. La consulta histórica sigue sujeta a autorización.",
          ),
        );
      work.append(formHost);
      if (!result.prioridades.length)
        work.append(
          text(
            "p",
            "Este grupo todavía no tiene prioridades. Puedes asignar una para orientar su próxima práctica.",
            "empty",
          ),
        );
      for (const priority of result.prioridades) {
        const card = text("article", undefined, "group-card");
        card.append(
          text("p", priority.estado, "eyebrow"),
          text("h2", priority.subtema?.nombre ?? priority.tema?.nombre),
          text(
            "p",
            `${priority.metaPreguntas} preguntas distintas · Hasta ${formatDate(priority.venceEn)} (Colombia)`,
          ),
        );
        const report = text("div");
        card.append(
          button("Ver cumplimiento", () =>
            this.priorityReport(groupId, priority.id, report, 1, current),
          ),
          report,
        );
        if (priority.estado === "ACTIVA" && this.canAssign) {
          const withdraw = button("Retirar prioridad", async () => {
            if (
              !globalThis.confirm(
                "Retirar detiene la prioridad sin borrar el historial de práctica. ¿Continuar?",
              )
            )
              return;
            withdraw.disabled = true;
            try {
              await this.api.institutionPriorities(
                groupId,
                `${priority.id}/retirar`,
              );
              if (current()) {
                this.draftDirty = false;
                await this.groupPriorities(groupId, work, page);
              }
            } catch (error) {
              if (current()) {
                report.replaceChildren(text("p", error.message));
                report.setAttribute("role", "alert");
                withdraw.disabled = false;
              }
            }
          });
          card.append(withdraw);
        }
        work.append(card);
      }
      const controls = text("div", undefined, "section-heading");
      const previous = button("Anterior", () =>
        this.groupPriorities(groupId, work, page - 1),
      );
      previous.disabled = page <= 1;
      const next = button("Siguiente", () =>
        this.groupPriorities(groupId, work, page + 1),
      );
      next.disabled = !result.hayMas;
      controls.append(previous, text("span", `Página ${page}`), next);
      work.append(controls);
    } catch (error) {
      if (current()) {
        work.replaceChildren(
          text("p", error.message),
          button("Reintentar", () => this.groupPriorities(groupId, work, page)),
        );
        work.setAttribute("role", "alert");
      }
    }
  }
  async priorityReport(groupId, priorityId, host, page, current) {
    host.replaceChildren(text("p", "Consultando cumplimiento…"));
    host.setAttribute("role", "status");
    try {
      const result = await this.api.institutionPriorities(
        groupId,
        `${priorityId}/cumplimiento?pagina=${page}`,
      );
      if (!current()) return;
      host.replaceChildren(text("h3", "Cumplimiento del grupo"));
      for (const student of result.estudiantes ?? [])
        host.append(
          text(
            "p",
            `${student.nombre}: ${student.preguntasPracticadas}/${student.metaPreguntas} · ${student.estadoCumplimiento}`,
          ),
        );
      if (!result.estudiantes?.length)
        host.append(text("p", "No hay alumnos elegibles en esta página."));
      if (result.contenidoPublicadoSuficiente === false)
        host.append(
          text(
            "p",
            "El contenido publicado ya no es suficiente para completar esta prioridad.",
          ),
        );
      const controls = text("div", undefined, "section-heading");
      const previous = button("Alumnos anteriores", () =>
        this.priorityReport(groupId, priorityId, host, page - 1, current),
      );
      previous.disabled = page <= 1;
      const next = button("Más alumnos", () =>
        this.priorityReport(groupId, priorityId, host, page + 1, current),
      );
      next.disabled = !result.hayMas;
      controls.append(previous, text("span", `Página ${page}`), next);
      host.append(controls);
    } catch (error) {
      if (current()) {
        host.replaceChildren(
          text("p", error.message),
          button("Reintentar", () =>
            this.priorityReport(groupId, priorityId, host, page, current),
          ),
        );
        host.setAttribute("role", "alert");
      }
    }
  }
  async priorityForm(groupId, host, page = 1, area = "") {
    if (!this.canAssign) return;
    this.formGeneration = (this.formGeneration ?? 0) + 1;
    const formGeneration = this.formGeneration;
    const generation = this.generation,
      groupGeneration = this.groupGeneration;
    const current = () =>
      generation === this.generation &&
      groupGeneration === this.groupGeneration &&
      formGeneration === this.formGeneration;
    host.replaceChildren(text("p", "Cargando temas publicados…"));
    try {
      const result = await this.api.institutionPriorities(
        groupId,
        `catalogo?pagina=${page}${area ? `&area=${area}` : ""}`,
      );
      if (!current()) return;
      host.replaceChildren(text("h2", "Nueva prioridad"));
      const areaLabel = text("label", "Área");
      areaLabel.htmlFor = "priority-area";
      const areaSelect = text("select");
      areaSelect.id = areaLabel.htmlFor;
      for (const [value, label] of [
        ["", "Todas las áreas"],
        ...Object.entries(areaNames),
      ]) {
        const option = text("option", label);
        option.value = value;
        areaSelect.append(option);
      }
      areaSelect.value = area;
      areaSelect.onchange = () => {
        if (
          this.hasDraft &&
          !globalThis.confirm(
            "Cambiar de área descartará el borrador. ¿Continuar?",
          )
        ) {
          areaSelect.value = area;
          return;
        }
        this.draftDirty = false;
        this.priorityForm(groupId, host, 1, areaSelect.value);
      };
      host.append(areaLabel, areaSelect);
      const form = text("form");
      const select = text("select");
      select.id = "priority-topic";
      select.required = true;
      const options = Array.isArray(result.subtemas) ? result.subtemas : [];
      for (const row of options) {
        const option = text(
          "option",
          `${row.tema.nombre} / ${row.nombre} · ${row.preguntasPublicadas} preguntas${row.asignable ? "" : " · No asignable como subtema"}`,
        );
        option.value = row.id;
        select.append(option);
      }
      const topicLabel = text("label", "Subtema publicado");
      topicLabel.htmlFor = select.id;
      const full = text("input");
      full.type = "checkbox";
      full.id = "priority-full-topic";
      const fullLabel = text(
        "label",
        "Asignar el tema completo en lugar del subtema",
      );
      fullLabel.htmlFor = full.id;
      const deadline = text("input");
      deadline.id = "priority-deadline";
      deadline.type = "datetime-local";
      deadline.required = true;
      const deadlineLabel = text(
        "label",
        "Fecha y hora límite (Colombia, UTC−5; máximo 30 días)",
      );
      deadlineLabel.htmlFor = deadline.id;
      const status = text("p");
      status.setAttribute("role", "status");
      const submit = text("button", "Confirmar prioridad", "primary");
      submit.type = "submit";
      form.append(
        topicLabel,
        select,
        full,
        fullLabel,
        deadlineLabel,
        deadline,
        submit,
        status,
      );
      form.oninput = () => {
        this.draftDirty = true;
      };
      form.onsubmit = async (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const row = options.find((option) => option.id === select.value);
        if (!row) {
          status.textContent = "Selecciona un subtema de esta página.";
          return;
        }
        if (!full.checked && !row.asignable) {
          status.textContent =
            "Este subtema no tiene entre cinco y 2000 preguntas. Elige otro o revisa el tema completo.";
          return;
        }
        const date = new Date(`${deadline.value}-05:00`);
        if (Number.isNaN(date.getTime())) {
          status.textContent = "Revisa la fecha y hora.";
          return;
        }
        const fields = {
          temaId: row.tema.id,
          ...(full.checked ? {} : { subtemaId: row.id }),
          venceEn: date.toISOString(),
        };
        const key = JSON.stringify([groupId, fields]);
        let id = this.operations.get(key);
        if (!id) {
          id = crypto.randomUUID();
          this.operations.set(key, id);
        }
        submit.disabled = true;
        status.textContent = "Guardando prioridad…";
        try {
          const result = await this.api.institutionPriorities(groupId, "", {
            id,
            ...fields,
          });
          if (!current()) return;
          this.draftDirty = false;
          status.setAttribute("role", "status");
          status.textContent = result.reutilizada
            ? "La prioridad ya estaba guardada. No se duplicó."
            : "Prioridad guardada.";
          status.append(
            button("Volver a la lista de prioridades", () => this.priorities()),
          );
        } catch (error) {
          if (current()) {
            status.setAttribute("role", "alert");
            status.textContent = `${error.message} Puedes reintentar sin duplicar el envío.`;
          }
        } finally {
          if (current()) submit.disabled = false;
        }
      };
      host.append(form);
      const changePage = (nextPage) => {
        if (
          this.hasDraft &&
          !globalThis.confirm(
            "Cambiar de página descartará el borrador. ¿Continuar?",
          )
        )
          return;
        this.draftDirty = false;
        this.priorityForm(groupId, host, nextPage, area);
      };
      const controls = text("div", undefined, "section-heading");
      const previous = button("Temas anteriores", () => changePage(page - 1));
      previous.disabled = page <= 1;
      const next = button("Más temas", () => changePage(page + 1));
      next.disabled = !result.hayMas;
      controls.append(previous, text("span", `Página ${page}`), next);
      host.append(controls);
    } catch (error) {
      if (current()) {
        host.replaceChildren(
          text("p", error.message),
          button("Reintentar", () =>
            this.priorityForm(groupId, host, page, area),
          ),
        );
        host.setAttribute("role", "alert");
      }
    }
  }
}
