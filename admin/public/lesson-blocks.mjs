export const blockTypes = {
  lectura: "Lectura",
  ejemplo: "Ejemplo",
  consejo: "Consejo",
  resumen: "Resumen",
};

function normalizeHeadings(text) {
  let fenced = false;
  return text
    .split("\n")
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
      return fenced
        ? line
        : line.replace(/^(\s{0,3}#{1,6})\s*((?!#)\S.*)$/, "$1 $2");
    })
    .join("\n");
}

// Standard Markdown, not the legacy web-only [[BLOQUE]] envelope: Flutter reads this directly.
export function readBlocks(text) {
  if (!text.trim()) return [];
  const blocks = [];
  let current = null;
  let fenced = false;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = !fenced && /^\s{0,3}#{1,6}\s*((?!#)\S.*)$/.exec(line);
    if (heading) {
      const typed = /^(Ejemplo|Consejo|Resumen)(?:\s*:\s*(.*))?$/i.exec(
        heading[1],
      );
      current = {
        tipo: typed ? typed[1].toLowerCase() : "lectura",
        titulo: typed ? (typed[2] ?? "") : heading[1],
        contenido: "",
      };
      blocks.push(current);
    } else {
      if (!current) {
        current = { tipo: "lectura", titulo: "", contenido: "" };
        blocks.push(current);
      }
      current.contenido += `${line}\n`;
    }
  }
  return blocks.map((block) => ({
    ...block,
    contenido: block.contenido.trimEnd(),
  }));
}

export function writeBlocks(blocks) {
  return blocks
    .map((block) => {
      const title = block.titulo
        .replace(/^\s*#+\s*/, "")
        .replace(/[\r\n]+/g, " ")
        .trim();
      const heading =
        block.tipo === "lectura"
          ? title
          : `${blockTypes[block.tipo]}${title ? `: ${title}` : ""}`;
      return `${heading ? `## ${heading}\n\n` : ""}${normalizeHeadings(block.contenido.trim())}`.trim();
    })
    .filter(Boolean)
    .join("\n\n");
}

export class LessonBlocks {
  constructor({ doc, host, add, onChange, confirm }) {
    Object.assign(this, { doc, host, add, onChange, confirm });
    this.blocks = [];
    this.locked = true;
    add.onclick = () => {
      if (this.locked) return;
      this.blocks.push({ tipo: "lectura", titulo: "", contenido: "" });
      this.render();
      this.changed();
    };
  }
  load(text) {
    this.blocks = readBlocks(text);
    this.render();
  }
  changed() {
    this.onChange(writeBlocks(this.blocks));
  }
  lock(value) {
    this.locked = value;
    this.add.disabled = value;
    for (const control of this.controls ?? []) control.disabled = value;
  }
  render() {
    this.controls = [];
    const nodes = this.blocks.map((block, index) => {
      const card = this.doc.createElement("article");
      card.className = "lesson-block-card";
      const title = this.doc.createElement("h3");
      title.textContent = `Bloque ${index + 1}`;
      card.append(title);
      const field = (tag, label, key) => {
        const wrap = this.doc.createElement("label");
        wrap.textContent = label;
        const control = this.doc.createElement(tag);
        if (tag === "select")
          for (const [value, name] of Object.entries(blockTypes)) {
            const option = this.doc.createElement("option");
            option.value = value;
            option.textContent = name;
            control.append(option);
          }
        control.value = block[key];
        if (tag !== "select")
          control.maxLength = key === "titulo" ? 500 : 30000;
        control.oninput = () => {
          if (!this.locked) {
            block[key] = control.value;
            this.changed();
          }
        };
        wrap.append(control);
        card.append(wrap);
        this.controls.push(control);
      };
      field("select", "Tipo de bloque", "tipo");
      field("input", "Título (sin símbolos #)", "titulo");
      field("textarea", "Contenido", "contenido");
      const remove = this.doc.createElement("button");
      remove.type = "button";
      remove.className = "secondary";
      remove.textContent = "Eliminar bloque";
      remove.onclick = () => {
        if (
          this.locked ||
          !this.confirm(
            `¿Quitar el bloque ${index + 1}? El cambio solo se aplicará al guardar la lección.`,
          )
        )
          return;
        this.blocks.splice(index, 1);
        this.render();
        this.changed();
      };
      card.append(remove);
      this.controls.push(remove);
      return card;
    });
    if (!nodes.length) {
      const empty = this.doc.createElement("p");
      empty.textContent = "Pulsa Agregar bloque para comenzar la lección.";
      nodes.push(empty);
    }
    this.host.replaceChildren(...nodes);
    this.lock(this.locked);
  }
}
