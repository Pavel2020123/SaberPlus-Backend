import { CatalogApi } from "./api.mjs";
import { ManagedAccounts } from "./managed-accounts.mjs";
import { InstitutionLearning } from "./institution-learning.mjs";
import { InstitutionGroups } from "./institution-groups.mjs";
import { InstitutionLifecycle } from "./institution-lifecycle.mjs";

const $ = (id) => document.getElementById(id);
const config = globalThis.SABERPLUS_CONFIG ?? {};
let generation = 0,
  context = null,
  profile = null,
  accounts = null,
  currentView = "inicio";
let learning = null;
let groups = null;
let lifecycle = null;
const api = new CatalogApi(config.apiBase, {
  demo: config.demo,
  onSessionExpired: () =>
    logout("Tu sesión terminó. Vuelve a entrar para continuar."),
});
const node = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const count = (value) =>
  Number.isInteger(value) && value >= 0
    ? new Intl.NumberFormat("es-CO").format(value)
    : "—";
function message(text, error = false) {
  const host = $("portal-status");
  host.replaceChildren();
  host.setAttribute("role", error ? "alert" : "status");
  if (text) host.append(node("span", text));
}
function logout(text = "") {
  lifecycle?.close();
  lifecycle = null;
  generation++;
  accounts?.close();
  accounts = null;
  learning?.close();
  learning = null;
  groups?.close();
  groups = null;
  api.logout();
  context = null;
  profile = null;
  $("portal-content").replaceChildren();
  $("portal-view").hidden = true;
  $("login-view").hidden = false;
  document.querySelector(".skip").href = "#main";
  $("institution-name").textContent = "";
  $("member-role").textContent = "";
  $("profile-name").textContent = "";
  $("portal-password").value = "";
  $("portal-password").type = "password";
  $("password-toggle").textContent = "Mostrar contraseña";
  $("password-toggle").setAttribute("aria-pressed", "false");
  $("login-status").textContent = text;
  message("");
}
function title(text, detail) {
  const header = node("div", undefined, "section-heading");
  header.append(node("h2", text));
  if (detail) header.append(node("p", detail));
  return header;
}
function groupsView(rows) {
  if (!Array.isArray(rows))
    throw new Error("No pudimos interpretar los grupos. Actualiza la vista.");
  if (!rows.length)
    return node(
      "div",
      "Todavía no tienes grupos asignados. Si eres docente, solicita la asignación a tu coordinador.",
      "empty",
    );
  const grid = node("div", undefined, "group-grid");
  for (const group of rows) {
    const card = node("article", undefined, "group-card");
    card.append(
      node(
        "p",
        group.grado === "ONCE"
          ? "Grado 11"
          : group.grado === "DECIMO"
            ? "Grado 10"
            : "Grupo",
        "eyebrow",
      ),
    );
    card.append(
      node(
        "h3",
        typeof group.nombre === "string" ? group.nombre : "Grupo sin nombre",
      ),
    );
    card.append(
      node(
        "p",
        `${count(group._count?.ClaseEstudiante)} estudiantes en el grupo`,
      ),
    );
    const names = group.profesores
      ?.map((item) => item.miembro?.usuario?.nombre)
      .filter((item) => typeof item === "string");
    card.append(
      node(
        "p",
        names?.length
          ? `Acompaña: ${names.join(", ")}`
          : "Sin docente responsable informado",
      ),
    );
    grid.append(card);
  }
  return grid;
}
async function navigate(view, { focus = true } = {}) {
  if (!context?.institucion) return;
  if (
    ![
      "inicio",
      "grupos",
      "docentes",
      "cuentas",
      "seguimiento",
      "prioridades",
      "bajas",
    ].includes(view)
  )
    view = "inicio";
  if (lifecycle?.isBusy) {
    message("Espera a que se confirme la gestión antes de cambiar de sección.");
    return;
  }
  if (
    lifecycle?.hasDraft &&
    !globalThis.confirm(
      "Salir descartará el borrador de privacidad sin enviar. ¿Continuar?",
    )
  )
    return;
  if (
    groups?.hasDraft &&
    !globalThis.confirm(
      "Salir descartará los datos de administración sin guardar. ¿Continuar?",
    )
  )
    return;
  if (
    learning?.hasDraft &&
    !globalThis.confirm(
      "Salir de esta sección descartará el borrador de prioridad. ¿Continuar?",
    )
  )
    return;
  if (
    accounts?.secretHost?.children.length &&
    !globalThis.confirm(
      "Al salir se ocultarán las claves visibles. ¿Ya las entregaste de forma segura?",
    )
  )
    return;
  const current = ++generation;
  lifecycle?.close();
  lifecycle = null;
  currentView = view;
  accounts?.close();
  accounts = null;
  learning?.close();
  learning = null;
  groups?.close();
  groups = null;
  const host = $("portal-content");
  host.replaceChildren();
  host.setAttribute("aria-busy", "true");
  message("Cargando información de tu institución…");
  const labels = {
    inicio: "Vista general",
    grupos: "Mis grupos",
    docentes: "Docentes",
    cuentas: "Cuentas y accesos",
    seguimiento: "Seguimiento",
    prioridades: "Prioridades",
    bajas: "Bajas y continuidad",
  };
  for (const button of document.querySelectorAll("[data-view]")) {
    if (button.dataset.view === view)
      button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  $("portal-breadcrumb").textContent = `Institución / ${labels[view]}`;
  history.replaceState(null, "", `#${view}`);
  try {
    if (view === "bajas") {
      const work = node("div");
      host.append(work);
      lifecycle = new InstitutionLifecycle({
        api,
        host: work,
        institutionId: context.institucion.id,
      });
      await lifecycle.open();
    } else if (view === "grupos" || view === "docentes") {
      const work = node("div");
      host.append(work);
      groups = new InstitutionGroups({
        api,
        host: work,
        canManage: ["PROPIETARIO", "ADMINISTRADOR"].includes(
          context.membresia?.rol,
        ),
        canWrite:
          !context.institucion.estadoLicencia ||
          context.institucion.estadoLicencia === "ACTIVA",
      });
      await groups.open(view);
    } else if (view === "seguimiento" || view === "prioridades") {
      const work = node("div");
      host.append(work);
      learning = new InstitutionLearning({
        api,
        host: work,
        canAssign:
          !context.institucion.estadoLicencia ||
          context.institucion.estadoLicencia === "ACTIVA",
      });
      await (view === "seguimiento"
        ? learning.tracking()
        : learning.priorities());
    } else if (view === "cuentas") {
      host.append(
        title(
          "Cuentas y accesos",
          "Credenciales seguras, acompañamiento cercano.",
        ),
      );
      const work = node("div");
      host.append(work);
      accounts = new ManagedAccounts({ api, host: work });
      await accounts.open(context.institucion.id);
    } else {
      const rows = await api.institutionRead("grupos");
      if (current !== generation) return;
      if (view === "inicio") {
        const institution = context.institucion;
        const hero = node("section", undefined, "hero");
        const copy = node("div");
        copy.append(
          node("p", "El aprendizaje empieza con una buena decisión", "eyebrow"),
        );
        copy.append(node("h1", "Acompaña el próximo paso de tus estudiantes."));
        copy.append(
          node(
            "p",
            "Organiza tus grupos, revisa su avance y convierte la información en oportunidades para aprender.",
          ),
        );
        const open = node("button", "Ver mis grupos", "secondary");
        open.onclick = () => navigate("grupos");
        copy.append(open);
        hero.append(
          copy,
          node(
            "span",
            institution.estadoLicencia
              ? `Licencia ${String(institution.estadoLicencia).toLocaleLowerCase("es")}`
              : "Plan institucional",
            "status-pill",
          ),
        );
        host.append(hero);
        const metrics = node("div", undefined, "metrics");
        for (const [label, value] of [
          ["Grupos en tu ámbito", Array.isArray(rows) ? rows.length : null],
          ["Cupos de estudiantes contratados", institution.limiteEstudiantes],
          ["Cupos de docentes contratados", institution.cuposDocentes],
        ]) {
          const card = node("div", undefined, "metric");
          card.append(node("strong", count(value)), node("span", label));
          metrics.append(card);
        }
        host.append(metrics);
        if (
          institution.estadoLicencia &&
          institution.estadoLicencia !== "ACTIVA"
        ) {
          const note = node("div", undefined, "panel");
          note.append(
            node("h2", "Tu información sigue contigo"),
            node(
              "p",
              "Puedes consultar el historial permitido. El backend verifica qué acciones están disponibles según la licencia y tu asignación.",
            ),
          );
          host.append(note);
        }
      }
      host.append(
        title(
          view === "inicio" ? "Tu comunidad, más cerca" : "Mis grupos",
          "Solo el ámbito autorizado para tu cuenta.",
        ),
        groupsView(rows),
      );
    }
    if (current !== generation) return;
    message("");
    if (focus) $("portal-main").focus();
  } catch (error) {
    if (current !== generation) return;
    host.replaceChildren();
    message(
      error.message || "No pudimos cargar la información. Intenta de nuevo.",
      true,
    );
    const retry = node("button", "Reintentar", "secondary");
    retry.onclick = () => navigate(currentView);
    $("portal-status").append(retry);
  } finally {
    if (current === generation) host.setAttribute("aria-busy", "false");
  }
}
$("portal-login").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const current = ++generation;
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  $("login-status").setAttribute("role", "status");
  $("login-status").textContent = "Verificando tu acceso…";
  try {
    const user = await api.loginCuentas(
      $("portal-user").value,
      $("portal-password").value,
    );
    if (current !== generation) return;
    const result = await api.institutionRead("contexto");
    if (current !== generation) return;
    if (!result?.institucion?.id || result.estado !== "VINCULADO")
      throw new Error(
        "Esta cuenta todavía no tiene una institución habilitada. Consulta con tu coordinador o SaberPlus.",
      );
    profile = user;
    context = result;
    $("institution-name").textContent = result.institucion.nombre;
    $("member-role").textContent =
      result.membresia?.rol === "PROPIETARIO"
        ? "Propietario · Vista institucional"
        : result.membresia?.rol === "ADMINISTRADOR"
          ? "Administración institucional"
          : "Docente · Grupos asignados";
    $("portal-teachers-nav").hidden = ![
      "PROPIETARIO",
      "ADMINISTRADOR",
    ].includes(result.membresia?.rol);
    $("profile-name").textContent = user.nombre;
    $("portal-lifecycle-nav").hidden = result.membresia?.rol !== "PROPIETARIO";
    $("login-view").hidden = true;
    $("portal-view").hidden = false;
    document.querySelector(".skip").href = "#portal-main";
    await navigate(location.hash.slice(1) || "inicio");
  } catch (error) {
    if (current !== generation) return;
    api.logout();
    $("login-status").setAttribute("role", "alert");
    $("login-status").textContent = error.message;
    $("login-status").focus();
  } finally {
    $("portal-password").value = "";
    button.disabled = false;
  }
};
$("password-toggle").onclick = () => {
  const show = $("portal-password").type === "password";
  $("portal-password").type = show ? "text" : "password";
  $("password-toggle").textContent = show
    ? "Ocultar contraseña"
    : "Mostrar contraseña";
  $("password-toggle").setAttribute("aria-pressed", String(show));
};
$("portal-refresh").onclick = async () => {
  if (
    (learning?.hasDraft || groups?.hasDraft || lifecycle?.hasDraft) &&
    !globalThis.confirm(
      "Actualizar la vista descartará el borrador. ¿Continuar?",
    )
  )
    return;
  if (
    accounts?.secretHost?.children.length &&
    !globalThis.confirm(
      "Actualizar ocultará las claves visibles. ¿Ya las entregaste de forma segura?",
    )
  )
    return;
  const current = generation;
  const button = $("portal-refresh");
  button.disabled = true;
  message("Revalidando estado y permisos…");
  try {
    const result = await api.institutionRead("contexto");
    if (current !== generation) return;
    if (
      !result?.institucion?.id ||
      result.institucion.id !== context?.institucion?.id
    ) {
      logout(
        "Tu vinculación cambió. Ingresa de nuevo para consultar el estado actual.",
      );
      return;
    }
    context = result;
    $("portal-lifecycle-nav").hidden = result.membresia?.rol !== "PROPIETARIO";
    $("institution-name").textContent = result.institucion.nombre;
    $("member-role").textContent =
      result.membresia?.rol === "PROPIETARIO"
        ? "Propietario · Vista institucional"
        : result.membresia?.rol === "ADMINISTRADOR"
          ? "Administración institucional"
          : "Docente · Grupos asignados";
    $("portal-teachers-nav").hidden = ![
      "PROPIETARIO",
      "ADMINISTRADOR",
    ].includes(result.membresia?.rol);
    if (groups) groups.dirtyForms.clear();
    if (learning) learning.draftDirty = false;
    accounts?.close();
    accounts = null;
    await navigate(currentView);
  } catch (error) {
    if (current === generation) message(error.message, true);
  } finally {
    button.disabled = false;
  }
};
for (const button of document.querySelectorAll("[data-view]"))
  button.onclick = () => navigate(button.dataset.view);
$("portal-logout").onclick = () => {
  if (
    (learning?.hasDraft || groups?.hasDraft) &&
    !globalThis.confirm("Cerrar sesión descartará el borrador. ¿Continuar?")
  )
    return;
  logout("Sesión cerrada.");
  $("portal-user").focus();
};
globalThis.addEventListener("beforeunload", (event) => {
  if (
    learning?.hasDraft ||
    lifecycle?.hasDraft ||
    groups?.hasDraft ||
    accounts?.secretHost?.children.length
  ) {
    event.preventDefault();
    event.returnValue = "";
  }
});
globalThis.addEventListener("pagehide", () => logout());
globalThis.addEventListener("hashchange", () => {
  if (profile) void navigate(location.hash.slice(1));
});
if (config.demo) {
  $("login-status").textContent =
    "El portal necesita la API real; no muestra resultados ficticios.";
  $("portal-login").querySelector("[type=submit]").disabled = true;
}
