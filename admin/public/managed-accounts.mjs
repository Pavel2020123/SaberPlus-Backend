function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(text, action, className = 'secondary') {
  const el = node('button', text, className); el.type = 'button'; el.onclick = action; return el;
}
function field(form, title, type, id, value = '') {
  const label = node('label', title); label.htmlFor = id;
  const el = node(type === 'textarea' || type === 'select' ? type : 'input');
  if (el.tagName === 'INPUT' || !['textarea', 'select'].includes(type)) el.type = type;
  el.id = id; el.value = value; el.required = true;
  form.append(label, el); return el;
}

export class ManagedAccounts {
  constructor({ api, host, confirm = message => globalThis.confirm(message) }) {
    this.api = api; this.host = host; this.confirm = confirm; this.version = 0; this.busy = false;
  }
  close() {
    this.version++; this.secretHost?.replaceChildren(); this.host.replaceChildren(); this.institution = null; this.preview = null; this.pending = new Map();
    this.secretHost = null; this.content = null; this.studentBox = null; this.confirmButton = null;
    this.busy = false;
  }
  async open(institution) {
    this.close(); this.institution = institution;
    const version = this.version;
    const context = await this.api.managedAccounts(institution, 'contexto');
    if (version !== this.version) return;
    this.context = context;
    this.message = node('p', '', 'message'); this.message.setAttribute('role', 'status'); this.message.tabIndex = -1;
    this.secretHost = node('section'); this.content = node('div'); this.host.append(this.message, this.secretHost, this.content);
    if (context.puedeImportar) await this.importTools(version);
    if (version === this.version) await this.students(1);
  }
  async run(action) {
    if (this.busy || !this.institution) return;
    const version = this.version; this.busy = true;
    const controls = [...this.host.querySelectorAll('button,input,select,textarea')];
    const states = controls.map(c => c.disabled); controls.forEach(c => { c.disabled = true; });
    this.message.setAttribute('role', 'status'); this.message.textContent = 'Procesando…'; this.host.setAttribute('aria-busy', 'true');
    try { await action(version); }
    catch (error) { if (version === this.version) { this.message.setAttribute('role', 'alert'); this.message.textContent = `${error.message} Revisa el estado antes de repetir. Las claves ya entregadas no se recuperan.`; this.message.focus(); } }
    finally { if (version === this.version) { this.busy = false; this.host.setAttribute('aria-busy', 'false'); controls.forEach((c, i) => { c.disabled = states[i]; }); if (this.confirmButton) this.confirmButton.disabled = !this.preview?.data.puedeConfirmar; } }
  }
  card(title) {
    const el = node('section', undefined, 'accounts-card'); el.append(node('h2', title)); this.content.append(el); return el;
  }
  operation(key, payload) {
    const fingerprint = JSON.stringify({ key, payload });
    if (!this.pending.has(fingerprint)) this.pending.set(fingerprint, crypto.randomUUID());
    return this.pending.get(fingerprint);
  }
  async command(action, payload, version) {
    const operationId = this.operation(action, payload);
    const result = await this.api.managedAccounts(this.institution, action, { ...payload, operacionId: operationId });
    if (version !== this.version) return null;
    this.pending.delete(JSON.stringify({ key: action, payload }));
    return result;
  }
  deliver(result) {
    this.secretHost.replaceChildren();
    if (!result?.credenciales?.length) {
      this.message.textContent = result?.repetida ? 'Operación ya registrada. Por seguridad no se vuelve a entregar la clave. Si no la conservaste, solicita un nuevo restablecimiento.' : 'Operación confirmada.';
      return;
    }
    const box = node('div', undefined, 'accounts-card accounts-secrets');
    box.append(node('h2', 'Entrega única de accesos'), node('p', 'Entrega cada clave solo a su titular por un medio seguro. La temporal se consume al primer inicio correcto: debe cambiarla antes de salir; si sale antes, necesitará otra. Estas claves no se guardan en este navegador y desaparecerán al cerrar la sesión o esta vista.', 'accounts-note'));
    for (const credential of result.credenciales) {
      const row = node('div', undefined, 'accounts-row'); row.append(node('strong', credential.usuarioInstitucional), node('p', credential.contrasenaTemporal, 'accounts-secret')); box.append(row);
    }
    box.append(button('Ya entregué las claves · ocultar', () => this.secretHost.replaceChildren()));
    this.secretHost.append(box); this.message.textContent = 'Accesos generados. La respuesta contiene las únicas copias de las claves temporales.';
  }
  async importTools(version) {
    const suffix = await this.api.managedAccounts(this.institution, 'sufijo');
    if (version !== this.version) return;
    const box = this.card('1. Usuario institucional');
    box.append(node('p', 'El sufijo identifica al colegio, pero no crea un correo electrónico. SaberPlus ADMIN debe revisarlo y aprobarlo.', 'accounts-note'));
    const status = node('p', suffix?.aprobado ? `Sufijo aprobado: @${suffix.aprobado}` : suffix ? `Pendiente: @${suffix.solicitado} · versión ${suffix.version}` : 'Todavía no hay una solicitud de sufijo.'); box.append(status);
    if (!suffix?.aprobado) {
      const form = node('form', undefined, 'accounts-stack'); const input = field(form, 'Sufijo solicitado, sin @', 'text', 'managed-suffix', suffix?.solicitado ?? ''); input.maxLength = 189;
      const submit = node('button', 'Solicitar revisión', 'primary'); submit.type = 'submit'; form.append(submit); box.append(form);
      form.onsubmit = event => { event.preventDefault(); if (!form.reportValidity()) return; void this.run(async current => {
        const result = await this.command('sufijo/solicitar', { sufijo: input.value.trim() }, current);
        if (!result) return; this.message.textContent = 'Solicitud enviada. Actualiza la vista para consultar la revisión.'; status.textContent = `Pendiente: @${result.solicitado} · versión ${result.version}`;
      }); };
      if (suffix && this.context.puedeAprobar) box.append(button('Aprobar sufijo revisado', () => void this.run(async current => {
        if (!this.confirm(`¿Apruebas @${suffix.solicitado}? Confirma que no duplica ni confunde a otra institución. Esto no verifica la propiedad del dominio.`)) return;
        const result = await this.command('sufijo/aprobar', { sufijo: suffix.solicitado, version: suffix.version }, current);
        if (result) { this.message.textContent = 'Sufijo aprobado. Actualiza la vista para cargar alumnos.'; status.textContent = `Aprobado: @${result.aprobado}`; }
      })));
      box.append(button('Actualizar estado', () => void this.refresh()));
      return;
    }
    const groups = await this.api.managedAccounts(this.institution, 'grupos');
    if (version !== this.version) return;
    const imports = this.card('2. Previsualiza y crea las cuentas');
    imports.append(node('p', 'Puedes agregar un solo alumno o pegar varios. Usa un CSV con las columnas nombre,usuario. No incluyas correos ni contraseñas. Los nombres de usuario no llevan @; el sufijo se agrega automáticamente.'));
    const form = node('form', undefined, 'accounts-stack');
    const group = field(form, 'Grupo de destino', 'select', 'managed-group');
    const empty = node('option', 'Selecciona un grupo'); empty.value = ''; group.append(empty);
    for (const item of groups) { const option = node('option', `${item.nombre} · ${item.grado}`); option.value = item.id; group.append(option); }
    group.value = '';
    const csv = field(form, 'Contenido CSV', 'textarea', 'managed-csv', 'nombre,usuario\n'); csv.maxLength = 1048576;
    const fileLabel = node('label', 'O selecciona un archivo CSV del equipo'); fileLabel.htmlFor = 'managed-file';
    const file = node('input'); file.type = 'file'; file.id = 'managed-file'; file.accept = '.csv,text/csv'; form.append(fileLabel, file);
    file.onchange = () => void this.run(async current => {
      const selected = file.files?.[0]; if (!selected) return;
      if (!/\.csv$/i.test(selected.name) || selected.size > 1048576) throw new Error('Selecciona un CSV de hasta 1 MiB.');
      const text = await selected.text(); if (current !== this.version) return; csv.value = text; invalidate(); this.message.textContent = 'Archivo cargado en el formulario. Aún no se ha creado ninguna cuenta.';
    });
    const previewBox = node('div'); const previewButton = node('button', 'Previsualizar · no crea cuentas', 'primary'); previewButton.type = 'submit';
    const confirm = button('Confirmar creación de cuentas', () => void this.run(async current => {
      if (!this.preview || this.preview.source !== JSON.stringify({ csv: csv.value, claseId: group.value })) throw new Error('El contenido cambió. Vuelve a previsualizar.');
      if (!this.confirm(`¿Crear ${this.preview.data.filas.length} cuentas gestionadas? Se ocuparán cupos y se entregarán claves de una sola vez.`)) return;
      const result = await this.command('confirmar', { csv: csv.value, claseId: group.value, huella: this.preview.data.huella }, current);
      if (!result) return; this.deliver(result); this.preview = null; confirm.disabled = true; await this.students(1);
    }), 'primary'); confirm.disabled = true;
    this.confirmButton = confirm;
    const invalidate = () => { this.preview = null; confirm.disabled = true; previewBox.replaceChildren(); };
    csv.oninput = invalidate; group.onchange = invalidate;
    const single = node('details'); single.append(node('summary', 'Agregar un alumno sin preparar un archivo CSV'));
    const singleForm = node('form', undefined, 'accounts-stack');
    const singleName = field(singleForm, 'Nombre del alumno', 'text', 'managed-single-name'); singleName.maxLength = 120;
    const singleUser = field(singleForm, 'Usuario sin @', 'text', 'managed-single-user'); singleUser.maxLength = 64;
    const singleButton = node('button', 'Pasar alumno a previsualización', 'secondary'); singleButton.type = 'submit'; singleForm.append(singleButton); single.append(singleForm);
    singleForm.onsubmit = event => { event.preventDefault(); if (this.busy || !singleForm.reportValidity()) return;
      const quote = value => `"${value.replaceAll('"', '""')}"`;
      csv.value = `nombre,usuario\n${quote(singleName.value.trim())},${quote(singleUser.value.trim())}`;
      invalidate(); form.requestSubmit();
    };
    form.append(previewButton); imports.append(single, form, previewBox, confirm);
    form.onsubmit = event => { event.preventDefault(); if (!form.reportValidity()) return; void this.run(async current => {
      const source = { csv: csv.value, claseId: group.value };
      const result = await this.api.managedAccounts(this.institution, 'previsualizar', source);
      if (current !== this.version) return;
      this.preview = { source: JSON.stringify(source), data: result };
      previewBox.replaceChildren(node('h3', 'Revisa antes de confirmar'), node('p', `${result.filas.length} cuentas · ${result.disponibles} cupos disponibles`));
      const list = node('ul', undefined, 'accounts-list'); for (const row of result.filas) list.append(node('li', `${row.nombre} · ${row.alias}`, 'accounts-row')); previewBox.append(list);
      if (result.conflictos.length) previewBox.append(node('p', 'Hay usuarios ocupados. Cambia esos usuarios y vuelve a previsualizar.'));
      confirm.disabled = !result.puedeConfirmar; this.message.textContent = result.puedeConfirmar ? 'Previsualización lista. No se ha creado ninguna cuenta.' : 'No puedes confirmar: revisa usuarios ocupados y cupos disponibles.';
    }); };
  }
  async refresh() {
    if (this.busy) return;
    if (this.secretHost?.children.length && !this.confirm('Actualizar ocultará las claves entregadas. ¿Ya las conservaste de forma segura?')) return;
    const institution = this.institution;
    try { await this.open(institution); }
    catch (error) { const message = node('p', error.message, 'message'); message.setAttribute('role', 'alert'); this.host.append(message); }
  }
  async students(page) {
    const version = this.version;
    const result = await this.api.managedAccounts(this.institution, `alumnos?pagina=${page}`);
    if (version !== this.version) return;
    this.studentBox?.remove(); this.studentBox = this.card('Estudiantes gestionados');
    this.studentBox.append(node('p', this.context.puedeImportar ? 'Restablece solo cuando el estudiante necesite recuperar su acceso.' : 'Solo aparecen estudiantes de tus grupos asignados. No puedes crear cuentas ni recuperar claves personales.'));
    if (!result.items.length) this.studentBox.append(node('p', 'No hay estudiantes gestionados disponibles en esta página.'));
    const list = node('ul', undefined, 'accounts-list'); this.studentBox.append(list);
    for (const student of result.items) {
      const row = node('li', undefined, 'accounts-row'); row.append(node('strong', student.nombre), node('p', student.identificadorInstitucional ?? 'Sin usuario institucional'));
      row.append(button(`Restablecer acceso de ${student.nombre}`, () => void this.run(async current => {
        if (!this.confirm(`¿Restablecer el acceso de ${student.nombre}? Se invalidarán sus sesiones y su clave anterior. La nueva temporal se entrega una sola vez.`)) return;
        const result = await this.command('restablecer', { usuarioId: student.id }, current);
        if (result) this.deliver(result);
      }))); list.append(row);
    }
    const nav = node('div', undefined, 'accounts-actions'); const previous = button('Anterior', () => void this.run(() => this.students(page - 1))); previous.disabled = page <= 1;
    const next = button('Siguiente', () => void this.run(() => this.students(page + 1))); next.disabled = !result.tieneSiguiente;
    nav.append(previous, node('span', `Página ${page}`), next); this.studentBox.append(nav);
  }
}
