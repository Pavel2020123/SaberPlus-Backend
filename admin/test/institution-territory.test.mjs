import test from "node:test";
import assert from "node:assert/strict";
import {
  territoryPage,
  InstitutionTerritoryEditor,
} from "../public/institution-territory.mjs";
const departments = {
  version: "v1",
  departamentos: [
    { codigo: "05", nombre: "Antioquia" },
    { codigo: "11", nombre: "Bogotá" },
  ],
};
const municipalities = (code) => ({
  version: "v1",
  departamentoCodigo: code,
  municipios: [
    {
      codigo: `${code}001`,
      nombre: "Sede de prueba",
      departamentoCodigo: code,
      tipo: "MUNICIPIO",
    },
  ],
});
class Element {
  constructor() {
    this.children = [];
    this.value = "";
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  setAttribute() {}
}
function editor(t, api, row = {}, current = () => true) {
  const old = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  t.after(() => {
    if (old === undefined) delete globalThis.document;
    else globalThis.document = old;
  });
  return new InstitutionTerritoryEditor({
    api,
    row,
    current,
    host: new Element(),
  });
}
test("catalog preserves zeros and rejects malformed or duplicate records", () => {
  assert.equal(
    territoryPage(municipalities("05"), "05").rows[0].codigo,
    "05001",
  );
  assert.throws(() => territoryPage(municipalities("05"), "11"));
  assert.throws(() =>
    territoryPage({
      ...departments,
      departamentos: [
        ...departments.departamentos,
        departments.departamentos[0],
      ],
    }),
  );
  assert.throws(() =>
    territoryPage({
      version: "v1",
      departamentos: [{ codigo: 5, nombre: "A" }],
    }),
  );
});
test("restores saved pair and discards late municipality response", async (t) => {
  let resolve;
  const e = editor(
    t,
    {
      territoryDepartments: async () => departments,
      territoryMunicipalities: async (code) => municipalities(code),
    },
    { departamentoCodigo: "05", municipioCodigo: "05001" },
  );
  await e.load();
  assert.deepEqual(e.value(), {
    departamentoCodigo: "05",
    municipioCodigo: "05001",
  });
  e.api.territoryMunicipalities = (code) =>
    code === "05"
      ? new Promise((r) => (resolve = r))
      : Promise.resolve(municipalities(code));
  const pending = e.loadMunicipalities("05");
  assert.throws(() => e.value());
  e.department.value = "11";
  await e.loadMunicipalities("11");
  e.municipality.value = "11001";
  resolve(municipalities("05"));
  await pending;
  assert.equal(e.value().municipioCodigo, "11001");
});
test("network retry and version mismatch never grant approval", async (t) => {
  let fail = true;
  const e = editor(t, {
    territoryDepartments: async () => {
      if (fail) throw Error("offline");
      return departments;
    },
    territoryMunicipalities: async (code) => ({
      ...municipalities(code),
      version: "other",
    }),
  });
  await e.load();
  assert.equal(e.retry.hidden, false);
  assert.throws(() => e.value());
  fail = false;
  await e.load();
  e.department.value = "05";
  await e.loadMunicipalities("05");
  assert.equal(e.ready, false);
  assert.throws(() => e.value());
});
test("closing or submitting prevents late load from enabling controls", async (t) => {
  let resolve,
    active = true;
  const e = editor(
    t,
    { territoryDepartments: () => new Promise((r) => (resolve = r)) },
    {},
    () => active,
  );
  const pending = e.load();
  active = false;
  resolve(departments);
  await pending;
  assert.equal(e.department.disabled, true);
  assert.equal(e.ready, false);
});
