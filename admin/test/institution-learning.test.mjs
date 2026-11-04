import test from "node:test";
import assert from "node:assert/strict";
import { InstitutionLearning } from "../public/institution-learning.mjs";
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
  remove() {
    if (this.parent)
      this.parent.children = this.parent.children.filter(
        (node) => node !== this,
      );
  }
  set innerHTML(_) {
    throw new Error("Never interpolate private HTML");
  }
}
const flatten = (host) => [host, ...host.children.flatMap(flatten)];
function setup(t, api) {
  const previous = globalThis.document;
  globalThis.document = { createElement: (tag) => new Element(tag) };
  t.after(() => {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  });
  const host = new Element("div");
  return { host, view: new InstitutionLearning({ api, host }) };
}

test("seguimiento representa nombres como texto y no inventa promedio sin simulacros", async (t) => {
  const name = "<img src=x onerror=alert(1)>";
  const { host, view } = setup(t, {
    institutionRead: async () => ({
      estudiantes: [
        {
          id: "student",
          nombre: name,
          totalSimulacros: 0,
          promedioPuntaje: 0,
          estadoAcademico: "SIN_DATOS",
          correo: null,
        },
      ],
    }),
  });
  await view.tracking();
  const texts = flatten(host).map((node) => node.textContent);
  assert(texts.includes(name));
  assert(texts.includes("Sin datos suficientes"));
  assert(texts.includes("Aún no hay un promedio de simulacros."));
  assert(!texts.some((value) => value.startsWith("Promedio de simulacros:")));
});

test("evidencia pendiente no regresa después de cerrar la vista", async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { host, view } = setup(t, { institutionEvidence: () => pending });
  const task = view.evidence("student");
  view.close();
  release({
    estudiante: { nombre: "Private late name" },
    evidencia: { temas: [] },
  });
  await task;
  assert.equal(host.children.length, 0);
});
test("diagnóstico inicial se muestra separado aunque no haya simulacros", async (t) => {
  const { host, view } = setup(t, {
    institutionRead: async () => ({
      estudiantes: [
        {
          id: "student",
          nombre: "Ana",
          totalSimulacros: 0,
          estadoAcademico: "SIN_DATOS",
          diagnosticoInicial: {
            porcentaje: 60,
            totalPreguntas: 15,
            porArea: [{ area: "MATEMATICAS", porcentaje: 40 }],
          },
        },
      ],
    }),
  });
  await view.tracking();
  const texts = flatten(host).map((node) => node.textContent);
  assert(texts.includes("Diagnóstico inicial"));
  assert(texts.includes("Matemáticas: 40%"));
  assert(texts.includes("Aún no hay un promedio de simulacros."));
});

test("prioridad conserva campos y UUID al reintentar una respuesta perdida", async (t) => {
  const commands = [];
  let fail = true;
  const { host, view } = setup(t, {
    institutionPriorities: async (_group, action, body) => {
      if (action.startsWith("catalogo"))
        return {
          subtemas: [
            {
              id: "sub",
              nombre: "Razones",
              asignable: true,
              preguntasPublicadas: 5,
              tema: { id: "topic", nombre: "Proporciones" },
            },
          ],
          hayMas: false,
        };
      commands.push(body);
      if (fail) {
        fail = false;
        throw new Error("Respuesta perdida");
      }
      return { reutilizada: true };
    },
  });
  await view.priorityForm("group", host);
  const form = flatten(host).find((node) => node.tag === "form");
  const select = flatten(host).find((node) => node.id === "priority-topic");
  select.value = "sub";
  const deadline = flatten(host).find(
    (node) => node.id === "priority-deadline",
  );
  deadline.value = "2026-11-10T10:00";
  form.oninput();
  assert.equal(view.hasDraft, true);
  await form.onsubmit({ preventDefault() {} });
  assert.equal(view.hasDraft, true);
  assert.equal(deadline.value, "2026-11-10T10:00");
  assert.equal(commands.length, 1);
  await form.onsubmit({ preventDefault() {} });
  assert.equal(commands.length, 2);
  assert.deepEqual(commands[0], commands[1]);
  assert.equal(commands[0].venceEn, "2026-11-10T15:00:00.000Z");
  assert.equal(view.hasDraft, false);
});

test("catálogo tardío de página anterior no reemplaza la nueva", async (t) => {
  let release;
  const first = new Promise((resolve) => {
    release = resolve;
  });
  const { host, view } = setup(t, {
    institutionPriorities: (_group, action) =>
      action.endsWith("=1")
        ? first
        : Promise.resolve({ subtemas: [], hayMas: false }),
  });
  const old = view.priorityForm("group", host, 1);
  await view.priorityForm("group", host, 2);
  release({
    subtemas: [
      { id: "stale", nombre: "Old private topic", tema: { nombre: "old" } },
    ],
  });
  await old;
  assert(
    !flatten(host).some((node) =>
      node.textContent.includes("Old private topic"),
    ),
  );
});
