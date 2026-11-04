import test from "node:test";
import assert from "node:assert/strict";
import { InstitutionGroups } from "../public/institution-groups.mjs";
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.value = "";
    this.textContent = "";
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
  }
  prepend(node) {
    node.parent = this;
    this.children.unshift(node);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  setAttribute() {}
  reportValidity() {
    return true;
  }
  set innerHTML(_) {
    throw new Error("No interpolar HTML institucional");
  }
}
const flatten = (host) => [host, ...host.children.flatMap(flatten)];
function setup(t, api, canManage) {
  const old = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (old === undefined) delete globalThis.document;
    else globalThis.document = old;
  });
  const host = new Element("div");
  return { host, view: new InstitutionGroups({ api, host, canManage }) };
}
const rows = [
  {
    id: "group",
    nombre: "<img onerror=alert(1)>",
    grado: "ONCE",
    _count: { ClaseEstudiante: 0 },
    profesores: [],
  },
];

test("docente solo consulta sus grupos y no solicita administración ni crea formularios", async (t) => {
  const calls = [];
  const { host, view } = setup(
    t,
    {
      institutionRead: async (section) => {
        calls.push(section);
        return rows;
      },
    },
    false,
  );
  await view.open();
  assert.deepEqual(calls, ["grupos"]);
  assert(flatten(host).some((node) => node.textContent === rows[0].nombre));
  assert(!flatten(host).some((node) => node.tag === "form"));
  await view.open("docentes");
  assert.deepEqual(calls, ["grupos"]);
});
test("respuesta tardía no repone datos después de cerrar", async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { host, view } = setup(t, { institutionRead: () => pending }, false);
  const task = view.open();
  view.close();
  release(rows);
  await task;
  assert.equal(host.children.length, 0);
});
test("creación incierta conserva borrador y bloquea reenvío automático o doble clic", async (t) => {
  const commands = [];
  const { host, view } = setup(
    t,
    {
      institutionRead: async (section) =>
        section === "grupos" ? [] : { miembros: [] },
      institutionGroup: async (...command) => {
        commands.push(command);
        throw new Error("Respuesta perdida");
      },
    },
    true,
  );
  await view.open();
  const form = flatten(host).find((node) => node.tag === "form");
  form._nameInput.value = "Once A";
  form._gradeInput.value = "ONCE";
  form.oninput();
  await form.onsubmit({ preventDefault() {} });
  await form.onsubmit({ preventDefault() {} });
  assert.equal(commands.length, 1);
  assert.equal(view.hasDraft, true);
  assert.equal(form._nameInput.value, "Once A");
  assert(
    flatten(form).some((node) =>
      node.textContent.includes("Revisa la lista antes"),
    ),
  );
  view.close();
  assert.equal(view.hasDraft, false);
});

test("creación confirmada no se duplica al pulsar otra vez sin editar", async (t) => {
  let commands = 0;
  const { host, view } = setup(
    t,
    {
      institutionRead: async (section) =>
        section === "grupos" ? [] : { miembros: [] },
      institutionGroup: async () => {
        commands++;
        return {};
      },
    },
    true,
  );
  await view.open();
  const form = flatten(host).find((node) => node.tag === "form");
  form._nameInput.value = "Once A";
  form._gradeInput.value = "ONCE";
  form.oninput();
  await form.onsubmit({ preventDefault() {} });
  await form.onsubmit({ preventDefault() {} });
  assert.equal(commands, 1);
  assert.equal(view.hasDraft, false);
});
