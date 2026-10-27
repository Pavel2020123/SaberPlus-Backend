import {
  fileMetadata,
  fileUuid,
  imagePath,
  managedImageId,
} from "./editorial-file-fields.mjs";

// Comparte el editor existente. La carga prepara una imagen; Guardar contenido la asocia.
export class EditorialImageUpload {
  constructor({
    api,
    host,
    input,
    doc = document,
    setBusy,
    onChange,
    confirm = (text) => window.confirm(text),
    urls = URL,
    uuid = () => crypto.randomUUID(),
  }) {
    Object.assign(this, {
      api,
      host,
      input,
      doc,
      setBusy,
      onChange,
      confirm,
      urls,
      uuid,
    });
    this.version = 0;
    this.locked = true;
    this.nodes = {};
    const node = (tag, text, parent = host) => {
      const element = doc.createElement(tag);
      if (text) element.textContent = text;
      parent.append(element);
      return element;
    };
    host.className = "editorial-image-upload";
    node(
      "p",
      api.demo
        ? "La demo no carga archivos. Usa el panel conectado para probar imágenes."
        : "Puedes subir una imagen o conservar un enlace HTTPS. Se incorpora al guardar este contenido.",
    );
    this.picker = node("input");
    this.picker.type = "file";
    this.picker.accept = "image/png,image/jpeg,image/webp";
    this.picker.id = `${host.id}-file`;
    const label = node("label", "Seleccionar imagen desde el equipo");
    label.htmlFor = this.picker.id;
    this.picker.onchange = () => void this.select(this.picker.files?.[0]);
    this.fields = node("fieldset");
    node("legend", "Datos y permiso de uso", this.fields);
    for (const [key, title, length] of [
      ["titulo", "Título de la imagen", 120],
      ["textoAlternativo", "Descripción para lectores de pantalla", 500],
      ["fuente", "Fuente", 500],
      ["titular", "Autor o titular", 255],
      [
        "referenciaAutorizacion",
        "Referencia del permiso (si corresponde)",
        2000,
      ],
    ]) {
      const label = node("label", title, this.fields);
      const input = node("input", "", this.fields);
      input.type = "text";
      input.maxLength = length;
      input.id = `${host.id}-${key}`;
      label.htmlFor = input.id;
      input.required = key !== "referenciaAutorizacion";
      input.oninput = () => this.onChange();
      this.nodes[key] = input;
    }
    const authorizationLabel = node("label", "Permiso de uso", this.fields);
    const authorization = node("select", "", this.fields);
    authorization.id = `${host.id}-autorizacion`;
    authorizationLabel.htmlFor = authorization.id;
    for (const [value, title] of [
      ["ORIGINAL", "Creación propia"],
      ["LICENCIA", "Con licencia"],
      ["DOMINIO_PUBLICO", "Dominio público"],
      ["AUTORIZACION_ESCRITA", "Autorización escrita"],
    ]) {
      const option = node("option", title, authorization);
      option.value = value;
    }
    authorization.value = "ORIGINAL";
    authorization.onchange = () => this.onChange();
    this.nodes.autorizacion = authorization;
    node(
      "p",
      "PNG, JPG o WEBP estático. Hasta 5 MiB y 20 megapíxeles. Conservaremos la proporción; revisa que el texto sea legible.",
    );
    this.preview = node("img");
    this.preview.className = "editorial-image-preview";
    this.preview.alt = "Vista previa de la imagen seleccionada";
    this.preview.onerror = () =>
      this.message(
        "No pudimos mostrar esta imagen. Comprueba el archivo antes de subirlo.",
      );
    this.status = node("p");
    this.status.role = "status";
    this.status.ariaLive = "polite";
    const buttons = node("div");
    buttons.className = "editorial-image-actions";
    const button = (text, action) => {
      const b = node("button", text, buttons);
      b.type = "button";
      b.className = "secondary";
      b.onclick = () => void action();
      return b;
    };
    this.uploadButton = button("Subir y usar imagen", () => this.upload());
    this.receiptButton = button("Consultar carga", () => this.receipt());
    this.retryButton = button("Reintentar la misma carga", () =>
      this.upload(true),
    );
    this.viewButton = button("Ver imagen cargada", () => this.view());
    this.clearButton = button("Quitar imagen de este contenido", () =>
      this.clear(),
    );
    this.setValue(input.value ?? "");
  }
  message(text) {
    this.status.textContent = text;
  }
  releasePreview() {
    if (this.objectUrl) this.urls.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    if (this.preview.removeAttribute) this.preview.removeAttribute("src");
    else this.preview.src = "";
    this.preview.hidden = true;
  }
  showPreview(blob, alt) {
    this.releasePreview();
    this.objectUrl = this.urls.createObjectURL(blob);
    this.preview.alt = alt;
    this.preview.src = this.objectUrl;
    this.preview.hidden = false;
  }
  setValue(value) {
    this.version++;
    this.file = null;
    this.request = null;
    this.running = false;
    this.value = value;
    this.input.value = value;
    this.picker.value = "";
    this.releasePreview();
    for (const [key, input] of Object.entries(this.nodes))
      input.value = key === "autorizacion" ? "ORIGINAL" : "";
    this.message(
      fileUuid(managedImageId(value))
        ? "Imagen cargada seleccionada para este contenido."
        : "",
    );
    this.controls();
  }
  externalChanged() {
    if (this.input.value !== this.value) this.setValue(this.input.value);
  }
  lock(locked) {
    this.locked = locked;
    this.controls();
  }
  controls() {
    const blocked = this.locked || this.running || this.api.demo;
    const managed = fileUuid(managedImageId(this.input.value));
    this.input.hidden = managed;
    for (const label of this.input.labels ?? []) label.hidden = managed;
    this.input.disabled =
      this.locked || this.running || Boolean(this.file || this.request);
    this.picker.disabled = blocked || Boolean(this.request);
    this.fields.hidden = !this.file;
    for (const input of Object.values(this.nodes))
      input.disabled = blocked || !this.file || Boolean(this.request);
    this.uploadButton.hidden = !this.file || Boolean(this.request);
    this.uploadButton.disabled = blocked || !this.file;
    this.receiptButton.hidden = !this.request;
    this.retryButton.hidden = !this.request;
    this.receiptButton.disabled = this.retryButton.disabled = blocked;
    this.viewButton.hidden = !managed;
    this.viewButton.disabled = blocked;
    this.clearButton.disabled =
      blocked || (!this.input.value && !this.file && !this.request);
  }
  async select(file) {
    if (!file || this.locked || this.running || this.request || this.api.demo)
      return;
    const version = ++this.version;
    try {
      if (!file.size || file.size > 5242880)
        throw new Error("Elige una imagen de hasta 5 MiB.");
      const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      const ascii = (start, end) =>
        String.fromCharCode(...head.slice(start, end));
      const valid =
        [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => head[i] === b) ||
        (head[0] === 255 && head[1] === 216 && head[2] === 255) ||
        (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP");
      if (!valid)
        throw new Error(
          "El archivo debe ser PNG, JPG o WEBP. Su extensión por sí sola no es suficiente.",
        );
      if (version !== this.version) return;
      this.file = file;
      this.request = null;
      this.showPreview(file, "Vista previa antes de subir la imagen");
      this.message(
        "Completa los datos de la imagen y pulsa Subir y usar imagen.",
      );
      this.onChange();
      this.controls();
    } catch (error) {
      if (version === this.version) this.message(error.message);
    }
  }
  async perform(action) {
    if (this.locked || this.running || this.api.demo) return;
    const version = this.version;
    this.running = true;
    this.setBusy(true);
    this.controls();
    try {
      await action(version);
    } catch (error) {
      if (version === this.version) this.message(error.message);
    } finally {
      if (version === this.version) {
        this.running = false;
        this.setBusy(false);
        this.controls();
      }
    }
  }
  async upload(retry = false) {
    if (!this.file || (this.request && !retry)) return;
    await this.perform(async (version) => {
      if (!this.request)
        this.request = {
          file: this.file,
          metadata: fileMetadata(
            Object.fromEntries(
              Object.entries(this.nodes).map(([key, node]) => [
                key,
                node.value,
              ]),
            ),
          ),
          operationId: this.uuid(),
        };
      const request = this.request;
      this.controls();
      this.message("Subiendo imagen…");
      try {
        const row = await this.api.uploadEditorialFile(
          request.file,
          request.metadata,
          request.operationId,
        );
        if (version !== this.version) return;
        this.accept(row);
      } catch (error) {
        if (version === this.version && [400, 413].includes(error.status))
          this.request = null;
        throw error;
      }
    });
  }
  accept(row) {
    if (row.estado !== "DISPONIBLE") {
      this.message(
        row.estado === "RETIRADO"
          ? "Esta imagen fue retirada. Quita la selección y elige otra."
          : "La carga sigue pendiente. Puedes reintentar la misma carga.",
      );
      return;
    }
    this.value = imagePath(row.id);
    this.input.value = this.value;
    this.file = null;
    this.request = null;
    this.picker.value = "";
    this.preview.alt = row.textoAlternativo;
    this.message(
      `Imagen lista: ${row.titulo}. Guarda el contenido para incorporarla.`,
    );
    this.onChange();
  }
  async receipt() {
    if (!this.request) return;
    await this.perform(async (version) => {
      const row = await this.api.editorialFileReceipt(this.request.operationId);
      if (version === this.version) this.accept(row);
    });
  }
  async view() {
    const id = managedImageId(this.input.value);
    if (!fileUuid(id)) return;
    await this.perform(async (version) => {
      const row = await this.api.editorialFile(id);
      const blob = await this.api.editorialFileContent(id);
      if (version !== this.version) return;
      this.showPreview(blob, row.textoAlternativo);
      this.message(`Imagen cargada: ${row.titulo}.`);
    });
  }
  ensureReady() {
    if (this.file || this.request)
      throw new Error(
        "Sube la imagen seleccionada o quítala de este formulario antes de guardar.",
      );
  }
  clear() {
    if (this.locked || this.running) return;
    if (
      this.request &&
      !this.confirm(
        "La carga podría haberse guardado. La quitaremos del formulario sin borrar el archivo. ¿Continuar?",
      )
    )
      return;
    this.setValue("");
    this.onChange();
    this.message(
      "Imagen quitada del formulario. Guarda el contenido para confirmar el cambio.",
    );
  }
  reset() {
    this.setValue("");
    this.lock(true);
  }
}
