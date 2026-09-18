import { CatalogApi, PanelError } from "./api.mjs";
import { LessonEditor } from "./lesson-editor.mjs";
import { QuestionEditor } from "./question-editor.mjs";
import { EditorialReview } from "./editorial-review.mjs";
import { EditorialTools } from "./editorial-tools.mjs";
import { InstitutionApproval } from "./institution-approval.mjs";

const $ = (id) => document.getElementById(id);
const config = globalThis.SABERPLUS_CONFIG;
const state = {
  areas: [],
  area: null,
  theme: null,
  themePage: 1,
  subPage: 1,
  themes: null,
  subs: null,
  busy: false,
};
let themesVersion = 0,
  subsVersion = 0,
  sessionVersion = 0;
const api = new CatalogApi(config.apiBase, {
  onSessionExpired: () =>
    showLogin("La sesión terminó o tus permisos cambiaron. Ingresa de nuevo."),
});
const editor = new LessonEditor({
  api,
  busy: () => state.busy,
  setBusy: (value) => {
    state.busy = value;
    updateControls();
  },
  onSaved: (kind, record) => {
    const page = kind === "temas" ? state.themes : state.subs;
    const row = page?.items.find((item) => item.id === record.id);
    if (row) {
      row.nombre = record.nombre;
      row.estadoContenido = record.estadoContenido;
    }
    if (kind === "temas" && state.theme?.id === record.id)
      state.theme.nombre = record.nombre;
    renderList(kind, page);
    notice(
      "Cambio guardado en borrador. Actualizar catálogo reordena la lista.",
    );
  },
  onDeleted: () => {
    state.themePage = 1;
    notice("Borrador vacío eliminado definitivamente. Actualizando catálogo…");
    void loadThemes();
  },
});
const approvals = new InstitutionApproval({ api, host: $("institution-approval-panel"), demo: config.demo });
$("institution-approvals").onclick = () => { if (closeEditors()) void approvals.open(); };
const bank = new QuestionEditor({
  api,
  busy: () => state.busy,
  setBusy: (value) => {
    state.busy = value;
    updateControls();
  },
});
function closeEditors() {
  return editor.close() && bank.close() && review.close() && tools.close();
}
const review = new EditorialReview({
  api,
  busy: () => state.busy,
  setBusy: (value) => {
    state.busy = value;
    updateControls();
  },
});
function openLesson(kind, id, parent) {
  if (bank.close() && review.close() && tools.close())
    void editor.open(kind, id, parent);
}
const tools = new EditorialTools({
  api,
  busy: () => state.busy,
  setBusy: (value) => {
    state.busy = value;
    updateControls();
  },
  onLesson: (row) => openLesson("subtemas", row.id, row.temaId),
  onReview: (row) => {
    if (closeEditors()) void review.open("subtemas", row.id);
  },
});
const stateLabels = {
  BORRADOR: "Borrador",
  EN_REVISION: "En revisión",
  PUBLICADO: "Publicado",
  ARCHIVADO: "Archivado",
};

$("environment").textContent = config.demo
  ? "DEMOSTRACIÓN LOCAL"
  : "API REAL · Acceso privado";
$("environment").title = config.demo
  ? "Sin conexión a Supabase"
  : config.apiBase;
$("login-form").hidden = config.demo;
$("demo-entry").hidden = !config.demo;
$("demo-banner").hidden = !config.demo;
$("api-destination").textContent = config.demo
  ? "Servidor de demostración local; sin conexión a la base."
  : `Servidor de acceso: ${config.apiBase}`;
if (config.demo)
  $("login-description").textContent =
    "Explora el catálogo sin una cuenta ni credenciales reales.";

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function notice(message = "", error = false) {
  $("notice").textContent = message;
  $("notice").className = `notice ${error ? "error" : "success"}`;
}
function catalogDraftPending(subthemeOnly = false) {
  return Boolean($("subtheme-name").value.trim() ||
    (!subthemeOnly && $("theme-name").value.trim()));
}
function confirmCatalogDiscard(subthemeOnly = false) {
  return !catalogDraftPending(subthemeOnly) || window.confirm(
    "Hay nombres de temas o subtemas sin guardar. ¿Cambiar de selección y descartarlos?",
  );
}
function showLogin(message = "") {
  approvals.close();
  $("institution-approvals").hidden = true;
  editor.close(true);
  bank.close(true);
  review.close(true);
  tools.close(true);
  sessionVersion++;
  api.logout();
  themesVersion++;
  subsVersion++;
  Object.assign(state, {
    areas: [],
    area: null,
    theme: null,
    themes: null,
    subs: null,
    busy: false,
    themePage: 1,
    subPage: 1,
  });
  $("workspace").hidden = true;
  $("login-view").hidden = false;
  $("logout").hidden = true;
  $("login-message").textContent = message;
  $("password").value = "";
  $("theme-name").value = "";
  $("subtheme-name").value = "";
  $("themes-list").replaceChildren();
  $("subthemes-list").replaceChildren();
  $("area-list").replaceChildren();
  notice();
}
function updateControls() {
  const canSub =
    state.theme &&
    state.theme.estadoContenido !== "ARCHIVADO" &&
    !state.theme.requiereClasificacion;
  $("theme-name").disabled = $("theme-submit").disabled =
    state.busy || !state.area || !state.themes;
  $("subtheme-name").disabled = $("subtheme-submit").disabled =
    state.busy || !canSub || !state.subs;
  $("theme-submit").textContent = state.busy ? "Guardando…" : "+ Crear tema";
  $("subtheme-submit").textContent = state.busy
    ? "Guardando…"
    : "+ Crear subtema";
  $("refresh").disabled = state.busy;
  $("lesson-review").disabled = state.busy || !editor.record;
  $("bank-review").disabled = state.busy || !bank.record;
  $("area-cases").disabled = state.busy || !state.area;
  $("area-legacy").disabled = state.busy || !state.area;
  $("editor-cloze").disabled =
    state.busy || !editor.record || editor.kind !== "subtemas";
  $("bank-reclassify").disabled =
    state.busy || !bank.record || bank.kind !== "preguntas";
  $("editor-questions").disabled =
    state.busy || !editor.record || editor.kind !== "subtemas";
  $("theme-edit").disabled = state.busy || !state.theme;
  for (const [prefix, page, data] of [
    ["themes", state.themePage, state.themes],
    ["subthemes", state.subPage, state.subs],
  ]) {
    $(`${prefix}-prev`).disabled = state.busy || !data || page === 1;
    $(`${prefix}-next`).disabled = state.busy || !data?.hayMas || page >= 10000;
    $(`${prefix}-page`).textContent = `Página ${page}`;
    $(`${prefix}-count`).textContent = data
      ? `${data.items.length} en esta página`
      : "—";
  }
  for (const button of document.querySelectorAll(".area-button, button.item"))
    button.disabled = state.busy;
  $("subtheme-context").textContent = !state.theme
    ? "Selecciona primero un tema."
    : canSub
      ? `Se guardará como borrador en ${state.theme.nombre}.`
      : "Este tema está archivado o requiere reclasificación. No admite contenido nuevo.";
  $("breadcrumb").textContent =
    [state.area?.nombre, state.theme?.nombre].filter(Boolean).join("  /  ") ||
    "Selecciona un área";
}
function renderAreas() {
  $("area-list").replaceChildren(
    ...state.areas.map((area) => {
      const button = element("button", area.nombre, "area-button");
      button.setAttribute("aria-current", String(area.id === state.area?.id));
      button.onclick = () => selectArea(area);
      return button;
    }),
  );
}
function renderList(kind, data, message) {
  const target = $(kind === "temas" ? "themes-list" : "subthemes-list");
  if (!data?.items.length) {
    target.replaceChildren(
      element(
        "div",
        message ||
          "Todavía no hay registros. Crea el primero con el formulario de abajo.",
        "empty",
      ),
    );
    updateControls();
    return;
  }
  target.replaceChildren(
    ...data.items.map((row) => {
      const item = element("button", undefined, "item");
      if (kind === "temas") {
        item.setAttribute("aria-pressed", String(row.id === state.theme?.id));
        item.onclick = () => selectTheme(row);
      } else item.onclick = () => openLesson("subtemas", row.id, row.temaId);
      item.append(element("span", row.nombre, "item-name"));
      const details = element("span", undefined, "item-details");
      const count = row._count?.[kind === "temas" ? "subtemas" : "preguntas"];
      details.append(
        element(
          "span",
          stateLabels[row.estadoContenido],
          `state ${row.estadoContenido}`,
        ),
        element(
          "span",
          `${Number.isInteger(count) && count >= 0 ? count : "—"} ${kind === "temas" ? "subtemas" : "preguntas"}`,
        ),
      );
      item.append(details);
      if (row.requiereClasificacion)
        item.append(
          element(
            "span",
            "Clasificación heredada: requiere revisión",
            "warning",
          ),
        );
      return item;
    }),
  );
  updateControls();
}
async function selectArea(area) {
  if (state.busy) return;
  if (!confirmCatalogDiscard()) return;
  if (!closeEditors()) return;
  state.area = area;
  state.theme = null;
  state.themePage = 1;
  state.subPage = 1;
  state.subs = null;
  subsVersion++;
  $("theme-name").value = "";
  $("subtheme-name").value = "";
  notice();
  renderAreas();
  renderList(
    "subtemas",
    null,
    "Selecciona un tema para explorar sus subtemas.",
  );
  await loadThemes();
}
async function loadThemes() {
  if (!state.area || !api.authenticated) return;
  if (!closeEditors()) return;
  const version = ++themesVersion;
  state.themes = null;
  state.theme = null;
  state.subs = null;
  subsVersion++;
  renderList("temas", null, "Cargando temas…");
  renderList("subtemas", null, "Selecciona un tema.");
  try {
    const data = await api.page("temas", state.area.id, state.themePage);
    if (version !== themesVersion || !api.authenticated) return;
    state.themes = data;
    renderList("temas", data);
  } catch (error) {
    if (version !== themesVersion || !api.authenticated) return;
    renderList(
      "temas",
      null,
      "No se pudo cargar esta página. Usa Actualizar catálogo para reintentar.",
    );
    notice(error.message, true);
  }
}
async function selectTheme(theme) {
  if (state.busy) return;
  if (!confirmCatalogDiscard(true)) return;
  if (!closeEditors()) return;
  state.theme = theme;
  state.subPage = 1;
  $("subtheme-name").value = "";
  notice();
  renderList("temas", state.themes);
  await loadSubs();
}
async function loadSubs() {
  if (!state.theme || !api.authenticated) return;
  if (!closeEditors()) return;
  const version = ++subsVersion;
  state.subs = null;
  renderList("subtemas", null, "Cargando subtemas…");
  try {
    const data = await api.page("subtemas", state.theme.id, state.subPage);
    if (version !== subsVersion || !api.authenticated) return;
    state.theme = {
      ...state.theme,
      estadoContenido: data.tema.estadoContenido,
    };
    state.subs = data;
    renderList("subtemas", data);
  } catch (error) {
    if (version !== subsVersion || !api.authenticated) return;
    renderList(
      "subtemas",
      null,
      "No se pudo cargar esta página. Selecciona de nuevo el tema para reintentar.",
    );
    notice(error.message, true);
  }
}
async function enter(correo, contrasena) {
  if ($("login-submit").disabled) return;
  $("login-submit").disabled = $("demo-login").disabled = true;
  $("login-message").textContent = "Verificando acceso editorial…";
  try {
    const profile = await api.login(correo, contrasena);
    $("institution-approvals").hidden = false;
    $("password").value = "";
    $("login-view").hidden = true;
    $("workspace").hidden = false;
    $("logout").hidden = false;
    $("welcome").textContent = `HOLA, ${profile.nombre}`;
    try { state.areas = await api.areas(); }
    catch (error) {
      if (api.authenticated) notice(`Catálogo no disponible: ${error.message} Puedes abrir Instituciones.`, true);
      return;
    }
    await selectArea(
      state.areas.find((area) => area.id === "MATEMATICAS") || state.areas[0],
    );
  } catch (error) {
    showLogin(error.message);
  } finally {
    $("password").value = "";
    $("login-submit").disabled = $("demo-login").disabled = false;
  }
}
async function create(kind, input) {
  if (state.busy || !api.authenticated) return;
  if (!closeEditors()) return;
  const parent = kind === "temas" ? state.area : state.theme;
  if (!parent) return;
  const session = sessionVersion;
  state.busy = true;
  updateControls();
  notice("Guardando borrador…");
  try {
    const created = await api.create(kind, parent.id, $(input).value);
    if (session !== sessionVersion || !api.authenticated) return;
    if (
      typeof created?.id !== "string" ||
      !created.id ||
      typeof created?.nombre !== "string" ||
      created.estadoContenido !== "BORRADOR" ||
      created[kind === "temas" ? "area" : "temaId"] !== parent.id
    )
      throw new PanelError(
        "No se pudo validar la confirmación del borrador. Consulta el catálogo antes de reenviar.",
      );
    $(input).value = "";
    state.busy = false;
    if (kind === "temas") {
      state.themePage = 1;
      await loadThemes();
    } else {
      state.subPage = 1;
      await loadSubs();
    }
    if (session === sessionVersion && api.authenticated)
      notice(
        `Borrador creado: ${created.nombre}. No está publicado. La lista vuelve a la primera página en orden alfabético.${(kind === "temas" ? state.themes : state.subs) ? "" : " No pudimos recargar la lista; usa Actualizar catálogo."}`,
      );
  } catch (error) {
    if (session === sessionVersion && api.authenticated)
      notice(error.message, true);
  } finally {
    if (session === sessionVersion) {
      state.busy = false;
      updateControls();
    }
  }
}
$("login-form").onsubmit = (event) => {
  event.preventDefault();
  void enter($("email").value, $("password").value);
};
$("demo-login").onclick = () => {
  void enter("demo@saberplus.invalid", "solo-demostracion");
};
$("logout").onclick = () => {
  if (
    (!editor.dirty && !bank.dirty && !tools.dirty && !catalogDraftPending()) ||
    window.confirm("Hay cambios sin guardar. ¿Cerrar sesión y descartarlos?")
  )
    showLogin("Sesión cerrada en esta pestaña.");
};
$("theme-edit").onclick = () => {
  if (state.theme) openLesson("temas", state.theme.id, state.area.id);
};
$("area-cases").onclick = () => {
  if (state.area && editor.close() && review.close() && tools.close())
    void bank.open("casos", { ...state.area, area: state.area.id });
};
$("editor-questions").onclick = () => {
  const row = editor.record;
  if (row && editor.kind === "subtemas" && editor.close())
    void bank.open("preguntas", {
      id: row.id,
      area: row.area,
      nombre: row.nombre,
    });
};
function openReview(source) {
  if (state.busy || !source.record) return;
  if (source.dirty) {
    source.message("Guarda los cambios antes de abrir la revisión.", true);
    notice(
      "Guarda los cambios antes de abrir la revisión. No se publica texto sin guardar.",
      true,
    );
    return;
  }
  const tipo = source.kind,
    id = source.record.id;
  if (closeEditors()) void review.open(tipo, id);
}
$("lesson-review").onclick = () => openReview(editor);
$("bank-review").onclick = () => openReview(bank);
$("editor-cloze").onclick = () => {
  const row = editor.record;
  if (row && editor.kind === "subtemas" && closeEditors())
    void tools.openCloze(row);
};
$("area-legacy").onclick = () => {
  if (state.area && closeEditors()) tools.openLegacy(state.area);
};
$("bank-reclassify").onclick = () => {
  const row = bank.record;
  if (row && bank.kind === "preguntas" && state.area && closeEditors())
    tools.openLegacy(state.area, row.id);
};
$("theme-form").onsubmit = (event) => {
  event.preventDefault();
  void create("temas", "theme-name");
};
$("subtheme-form").onsubmit = (event) => {
  event.preventDefault();
  void create("subtemas", "subtheme-name");
};
$("refresh").onclick = () => {
  notice();
  void loadThemes();
};
for (const [id, key, delta, load] of [
  ["themes-prev", "themePage", -1, loadThemes],
  ["themes-next", "themePage", 1, loadThemes],
  ["subthemes-prev", "subPage", -1, loadSubs],
  ["subthemes-next", "subPage", 1, loadSubs],
])
  $(id).onclick = () => {
    if (!closeEditors()) return;
    state[key] += delta;
    notice();
    void load();
  };
window.addEventListener("pagehide", () => showLogin());
window.addEventListener("beforeunload", (event) => {
  if (editor.dirty || bank.dirty || tools.dirty || catalogDraftPending() || state.busy) {
    event.preventDefault();
    event.returnValue = "";
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) showLogin();
});
