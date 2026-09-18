// Explicitly fictional, local-only state. No real institution is created here.
export function createDemoInstitutionApproval(send) {
  const row = {
    id: "a1111111-1111-4111-8111-111111111111",
    nombre: "Colegio de demostración",
    ciudad: "Ciudad de ejemplo",
    correoInstitucional: "contacto@colegio.invalid",
    contacto: "Representante ficticio, teléfono de ejemplo",
    referenciaUrl: "https://colegio.invalid",
    evidencia:
      "Soy la representante autorizada. Esta evidencia es ficticia y sirve solo para probar el panel.",
    solicitante: {
      nombre: "Docente de ejemplo",
      correo: "profesor@example.invalid",
    },
    estado: "PENDIENTE",
    revision: 1,
    mensaje: "Solicitud pendiente de revisión.",
    historial: [],
    institucionId: null,
    transicionHasta: null,
    actualizadoEn: new Date().toISOString(),
  };
  const transitions = {
    PENDIENTE: ["APROBADA", "RECHAZADA", "REQUIERE_INFORMACION"],
    REQUIERE_INFORMACION: ["APROBADA", "RECHAZADA"],
    APROBADA: ["SUSPENDIDA"],
    SUSPENDIDA: ["APROBADA"],
    RECHAZADA: [],
  };
  return (req, res, url, body) => {
    const path = url.pathname.slice(4),
      root = "/admin/instituciones/solicitudes";
    if (!path.startsWith(root)) return false;
    if (path === root && req.method === "GET") {
      const pagina = Number(url.searchParams.get("pagina") || "1"),
        estado = url.searchParams.get("estado");
      send(res, 200, {
        items:
          pagina === 1 && (!estado || estado === row.estado)
            ? [
                {
                  id: row.id,
                  nombre: row.nombre,
                  ciudad: row.ciudad,
                  estado: row.estado,
                  revision: row.revision,
                },
              ]
            : [],
        pagina,
        hayMas: false,
      });
    } else if (path === `${root}/${row.id}` && req.method === "GET")
      send(res, 200, row);
    else if (path === `${root}/${row.id}/revision` && req.method === "POST") {
      if (
        body.confirmado !== true ||
        typeof body.mensaje !== "string" ||
        body.mensaje.trim().length < 10 ||
        body.mensaje.length > 1000 ||
        typeof body.notaInterna !== "string" ||
        body.notaInterna.trim().length < 10 ||
        body.notaInterna.length > 1000
      )
        send(res, 400, {});
      else if (
        body.revision !== row.revision ||
        !transitions[row.estado].includes(body.estado)
      )
        send(res, 409, {});
      else {
        row.estado = body.estado;
        row.revision++;
        row.mensaje = body.mensaje;
        row.historial.push({
          accion: body.estado,
          actorId: "demo-admin",
          mensaje: body.mensaje,
          notaInterna: body.notaInterna,
          fecha: new Date().toISOString(),
        });
        row.actualizadoEn = new Date().toISOString();
        send(res, 200, { solicitud: row });
      }
    } else send(res, 404, {});
    return true;
  };
}
