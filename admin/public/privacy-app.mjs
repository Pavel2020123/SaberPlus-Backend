import { CatalogApi } from "./api.mjs";
import { PrivacyRequests } from "./privacy-requests.mjs";
const $ = (id) => document.getElementById(id);
const config = globalThis.SABERPLUS_CONFIG;
let generation = 0,
  panel = null;
const api = new CatalogApi(config.apiBase, {
  demo: config.demo,
  onSessionExpired: () => logout("La sesión terminó. Ingresa de nuevo."),
});
function logout(message = "") {
  generation++;
  panel?.close();
  panel = null;
  api.logout();
  $("privacy-login").hidden = false;
  $("privacy-logout").hidden = true;
  $("privacy-password").value = "";
  $("privacy-work").replaceChildren();
  $("privacy-status").textContent = message;
}
$("privacy-login-form").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const current = generation;
  const button = form.querySelector("button");
  button.disabled = true;
  $("privacy-status").textContent = "Verificando acceso…";
  try {
    const profile = await api.loginCuentas(
      $("privacy-user").value,
      $("privacy-password").value,
    );
    if (current !== generation) return;
    if (profile.rol !== "ADMIN") {
      logout(
        "Esta entrada de revisión es exclusiva de SaberPlus ADMIN. El colegio solicita desde Bajas y continuidad.",
      );
      return;
    }
    $("privacy-login").hidden = true;
    $("privacy-logout").hidden = false;
    $("privacy-status").textContent =
      `ADMIN: ${profile.nombre}. Las acciones se autorizan también en el servidor.`;
    panel = new PrivacyRequests({
      api,
      host: $("privacy-work"),
      canReview: true,
    });
    await panel.open();
    $("main").focus();
  } catch (error) {
    if (current === generation) {
      $("privacy-status").setAttribute("role", "alert");
      $("privacy-status").textContent = error.message;
    }
  } finally {
    $("privacy-password").value = "";
    button.disabled = false;
  }
};
$("privacy-logout").onclick = () => {
  if (
    panel?.hasDraft &&
    !globalThis.confirm("Cerrar sesión descartará el borrador. ¿Continuar?")
  )
    return;
  logout("Sesión cerrada.");
};
globalThis.addEventListener("pagehide", () => logout());
globalThis.addEventListener("beforeunload", (event) => {
  if (panel?.hasDraft) {
    event.preventDefault();
    event.returnValue = "";
  }
});
if (config.demo) {
  $("privacy-status").textContent =
    "La revisión requiere API real con datos locales de prueba.";
  $("privacy-login-form").querySelector("button").disabled = true;
}
