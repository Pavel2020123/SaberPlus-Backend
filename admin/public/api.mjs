import { lessonFields } from "./lesson-fields.mjs";

export class PanelError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export function validateName(value) {
  const name = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (
    !name ||
    name.length > 120 ||
    /[\p{Cc}\p{Cf}]/u.test(name) ||
    name.toLocaleLowerCase("es") === "banco general"
  ) {
    throw new PanelError(
      "Escribe un nombre específico de 1 a 120 caracteres. No uses Banco General.",
    );
  }
  return name;
}

export class CatalogApi {
  #token = null;
  #generation = 0;
  #requests = new Set();
  constructor(
    base,
    {
      fetcher = globalThis.fetch,
      onSessionExpired = () => {},
      timeoutMs = 60000,
    } = {},
  ) {
    this.base = base;
    this.fetcher = fetcher;
    this.onSessionExpired = onSessionExpired;
    this.timeoutMs = timeoutMs;
  }
  get authenticated() {
    return this.#token !== null;
  }
  logout() {
    this.#generation++;
    this.#token = null;
    for (const request of this.#requests) request.abort();
    this.#requests.clear();
  }

  async login(correo, contrasena) {
    this.logout();
    const generation = this.#generation;
    const result = await this.#request("/auth/login", {
      method: "POST",
      body: { correo: correo.trim(), contrasena },
      token: null,
    });
    if (typeof result?.accessToken !== "string" || !result.accessToken)
      throw new PanelError("La respuesta de acceso no es válida.");
    const profile = await this.#request("/auth/perfil", {
      token: result.accessToken,
    });
    if (generation !== this.#generation)
      throw new PanelError("Acceso cancelado.");
    if (profile?.rol !== "ADMIN")
      throw new PanelError(
        "Este panel requiere una cuenta editorial ADMIN. Una cuenta de profesor no tiene este permiso.",
        403,
      );
    if (profile.debeCambiarContrasena !== false)
      throw new PanelError(
        "Primero actualiza tu contraseña mediante el flujo de recuperación autorizado.",
      );
    this.#token = result.accessToken;
    return {
      nombre:
        typeof profile.nombre === "string" ? profile.nombre : "Administrador",
    };
  }

  async areas() {
    const rows = await this.#protected("/admin/catalogo/areas");
    const ids = [
      "LECTURA_CRITICA",
      "MATEMATICAS",
      "SOCIALES_CIUDADANAS",
      "CIENCIAS_NATURALES",
      "INGLES",
    ];
    if (
      !Array.isArray(rows) ||
      rows.length !== 5 ||
      new Set(rows.map((row) => row?.id)).size !== 5 ||
      rows.some(
        (row) =>
          !row || !ids.includes(row.id) || typeof row.nombre !== "string",
      )
    )
      throw new PanelError(
        "El catálogo de áreas no tiene el formato esperado.",
      );
    return rows;
  }
  async page(kind, parent, page = 1) {
    if (
      !["temas", "subtemas"].includes(kind) ||
      !parent ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000
    )
      throw new PanelError("Selección de catálogo inválida.");
    const query = new URLSearchParams({
      [kind === "temas" ? "area" : "temaId"]: parent,
      pagina: String(page),
      limite: "20",
    });
    const data = await this.#protected(`/admin/catalogo/${kind}?${query}`);
    if (
      !data ||
      data.pagina !== page ||
      data.limite !== 20 ||
      typeof data.hayMas !== "boolean" ||
      !Array.isArray(data.items) ||
      data.items.length > 20 ||
      new Set(data.items.map((row) => row?.id)).size !== data.items.length ||
      (kind === "subtemas" &&
        (data.tema?.id !== parent ||
          !["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"].includes(
            data.tema.estadoContenido,
          ))) ||
      data.items.some(
        (row) =>
          !row ||
          typeof row.id !== "string" ||
          !row.id ||
          typeof row.nombre !== "string" ||
          !row.nombre.trim() ||
          !["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"].includes(
            row.estadoContenido,
          ) ||
          typeof row.requiereClasificacion !== "boolean" ||
          (kind === "temas" ? row.area !== parent : row.temaId !== parent),
      )
    )
      throw new PanelError("No pudimos validar esta página del catálogo.");
    return data;
  }
  create(kind, parent, name) {
    if (!["temas", "subtemas"].includes(kind) || !parent)
      throw new PanelError("Selecciona primero el área o tema.");
    return this.#protected(`/admin/${kind}`, {
      method: "POST",
      body: {
        nombre: validateName(name),
        [kind === "temas" ? "area" : "temaId"]: parent,
      },
    });
  }
  async editor(kind, id, parent, update) {
    if (
      !["temas", "subtemas"].includes(kind) ||
      typeof id !== "string" ||
      !id ||
      !parent
    )
      throw new PanelError("Selección de editor inválida.");
    let options;
    let suffix = "";
    if (update) {
      if (!/^[a-f0-9]{64}$/.test(update.revision))
        throw new PanelError("Recarga el registro antes de guardar.");
      const rename = update.nombre !== undefined;
      if (!rename && kind !== "subtemas")
        throw new PanelError("Selecciona una lección.");
      suffix = rename ? "/nombre" : "/leccion";
      options = {
        method: "PATCH",
        body: {
          revision: update.revision,
          ...(rename
            ? { nombre: validateName(update.nombre) }
            : lessonFields(update)),
        },
      };
    }
    const data = await this.#protected(
      `/admin/editor/${kind}/${encodeURIComponent(id)}${suffix}`,
      options,
    );
    if (
      !data ||
      data.id !== id ||
      data[kind === "temas" ? "area" : "temaId"] !== parent ||
      typeof data.nombre !== "string" ||
      !data.nombre.trim() ||
      !/^[a-f0-9]{64}$/.test(data.revision) ||
      !["BORRADOR", "EN_REVISION", "PUBLICADO", "ARCHIVADO"].includes(
        data.estadoContenido,
      ) ||
      ["editable", "renombrable"].some(
        (key) => typeof data[key] !== "boolean",
      ) ||
      ["contenido", "videoUrl", "imagenUrl", "motivo"].some(
        (key) => typeof data[key] !== "string",
      )
    )
      throw new PanelError(
        "No pudimos validar el registro. Consulta de nuevo antes de reenviar cambios.",
      );
    return data;
  }
  #protected(path, options) {
    if (!this.#token)
      throw new PanelError("Inicia sesión para continuar.", 401);
    return this.#request(path, options);
  }
  async #request(path, { method = "GET", body, token = this.#token } = {}) {
    const generation = this.#generation;
    const controller = new AbortController();
    this.#requests.add(controller);
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(`${this.base}${path}`, {
        method,
        signal: controller.signal,
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (generation !== this.#generation)
        throw new PanelError("Solicitud cancelada.");
      if (!response.ok) {
        if ([401, 403].includes(response.status) && this.#token) {
          this.logout();
          this.onSessionExpired();
        }
        throw new PanelError(
          {
            400: "Revisa los datos y la clasificación. El nombre o el estado del contenido no son válidos.",
            401: "Credenciales incorrectas o sesión vencida. Inicia sesión nuevamente.",
            403: "No tienes permiso editorial para esta operación.",
            404: "Este recurso o la versión del catálogo no está disponible en el servidor.",
            409: "El registro cambió o ese nombre ya existe. Conserva tu texto y recarga para revisar antes de guardar de nuevo.",
            429: "Demasiados intentos. Espera un momento antes de volver a intentar.",
          }[response.status] || "El servidor no pudo completar la solicitud.",
          response.status,
        );
      }
      const data = await response.json();
      if (generation !== this.#generation)
        throw new PanelError("Solicitud cancelada.");
      return data;
    } catch (error) {
      if (error instanceof PanelError) throw error;
      throw new PanelError(
        method === "GET"
          ? "No pudimos conectar o validar la respuesta. Revisa la conexión y CORS."
          : "No se pudo confirmar la operación. Consulta el catálogo antes de reenviarla; podría haberse guardado.",
      );
    } finally {
      clearTimeout(timer);
      this.#requests.delete(controller);
    }
  }
}
