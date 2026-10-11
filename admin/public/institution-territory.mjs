function node(tag, text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  return el;
}

export function territoryPage(data, department) {
  const rows = data?.[department ? "municipios" : "departamentos"];
  if (
    typeof data?.version !== "string" ||
    !data.version ||
    !Array.isArray(rows) ||
    !rows.length ||
    rows.length > 1300 ||
    (department && data.departamentoCodigo !== department)
  )
    throw new Error("Catálogo territorial inválido.");
  const codes = new Set();
  for (const row of rows) {
    if (
      typeof row?.codigo !== "string" ||
      !(department ? /^\d{5}$/ : /^\d{2}$/).test(row.codigo) ||
      codes.has(row.codigo) ||
      typeof row.nombre !== "string" ||
      !row.nombre.trim() ||
      (department &&
        (row.departamentoCodigo !== department ||
          !row.codigo.startsWith(department) ||
          typeof row.tipo !== "string"))
    )
      throw new Error("Unidad territorial inválida.");
    codes.add(row.codigo);
  }
  return {
    version: data.version,
    rows: [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

export class InstitutionTerritoryEditor {
  constructor({ api, host, row, current }) {
    Object.assign(this, { api, host, row, current });
    this.sequence = 0;
    this.ready = false;
    this.department = node("select");
    this.municipality = node("select");
    this.status = node("p");
    this.status.setAttribute("role", "status");
    for (const [text, input] of [
      ["Departamento / Bogotá D.C.", this.department],
      ["Municipio / distrito / unidad territorial", this.municipality],
    ]) {
      const label = node("label", text);
      label.append(input);
      host.append(label);
    }
    this.retry = node("button", "Reintentar ubicación");
    this.retry.type = "button";
    this.retry.hidden = true;
    this.retry.onclick = () =>
      this.department.value
        ? this.loadMunicipalities(
            this.department.value,
            this.row.municipioCodigo,
          )
        : this.load();
    host.append(this.status, this.retry);
    this.department.onchange = () =>
      this.loadMunicipalities(this.department.value);
    this.municipality.onchange = () => {
      this.status.textContent = "";
    };
  }
  options(select, rows, placeholder, initial) {
    select.replaceChildren();
    const blank = node("option", placeholder);
    blank.value = "";
    select.append(blank);
    for (const row of rows) {
      const option = node("option", row.nombre);
      option.value = row.codigo;
      select.append(option);
    }
    select.value = rows.some((row) => row.codigo === initial) ? initial : "";
  }
  async load() {
    const seq = ++this.sequence;
    this.ready = false;
    this.department.disabled = true;
    this.municipality.disabled = true;
    this.options(this.department, [], "Selecciona departamento");
    this.options(this.municipality, [], "Selecciona municipio");
    this.retry.hidden = true;
    this.status.textContent = "Cargando departamentos…";
    try {
      const page = territoryPage(await this.api.territoryDepartments());
      if (!this.current() || seq !== this.sequence) return;
      this.version = page.version;
      this.departments = page.rows;
      this.options(
        this.department,
        page.rows,
        "Selecciona departamento",
        this.row.departamentoCodigo,
      );
      this.department.disabled = false;
      this.status.textContent =
        "La ubicación es obligatoria para aprobar o corregir la aprobación.";
      if (this.department.value)
        await this.loadMunicipalities(
          this.department.value,
          this.row.municipioCodigo,
        );
    } catch (_) {
      if (!this.current() || seq !== this.sequence) return;
      this.status.textContent = "No pudimos cargar los departamentos.";
      this.retry.hidden = false;
    }
  }
  async loadMunicipalities(department, restore) {
    const seq = ++this.sequence;
    this.ready = false;
    this.municipality.disabled = true;
    this.options(this.municipality, [], "Selecciona municipio");
    this.retry.hidden = true;
    this.status.textContent = "";
    if (!department) return;
    this.status.textContent = "Cargando municipios…";
    try {
      const page = territoryPage(
        await this.api.territoryMunicipalities(department),
        department,
      );
      if (!this.current() || seq !== this.sequence) return;
      if (page.version !== this.version)
        throw new Error("Catálogo actualizado; vuelve a abrir la solicitud.");
      this.rows = page.rows;
      this.options(
        this.municipality,
        page.rows,
        "Selecciona municipio",
        restore,
      );
      this.municipality.disabled = false;
      this.ready = true;
      this.status.textContent = "";
    } catch (_) {
      if (!this.current() || seq !== this.sequence) return;
      this.status.textContent =
        "No pudimos cargar los municipios. Reintenta o vuelve a abrir la solicitud.";
      this.retry.hidden = false;
    }
  }
  value() {
    if (
      !this.ready ||
      !this.departments?.some((row) => row.codigo === this.department.value) ||
      !this.rows?.some(
        (row) =>
          row.codigo === this.municipality.value &&
          row.departamentoCodigo === this.department.value,
      )
    )
      throw new Error(
        "Selecciona departamento y municipio de la sede antes de aprobar.",
      );
    return {
      departamentoCodigo: this.department.value,
      municipioCodigo: this.municipality.value,
    };
  }
}
