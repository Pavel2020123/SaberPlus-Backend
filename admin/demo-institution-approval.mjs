// Explicitly fictional, local-only state. No real institution is created here.
export function createDemoInstitutionApproval(send) {
  const departments = [
    { codigo: "91", nombre: "Amazonas" },
    { codigo: "11", nombre: "Bogotá D.C." },
    { codigo: "20", nombre: "Cesar" },
  ];
  const names = { 91: "Leticia", 11: "Bogotá D.C.", 20: "Valledupar" };
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
    APROBADA: ["APROBADA", "SUSPENDIDA"],
    SUSPENDIDA: ["APROBADA"],
    RECHAZADA: [],
  };
  return (req, res, url, body) => {
    const path = url.pathname.slice(4),
      root = "/admin/instituciones/solicitudes";
    const territoryRoot = "/instituciones/territorio/departamentos";
    if (req.method === "GET" && path === territoryRoot) {
      send(res, 200, { version: "demo", departamentos: departments });
      return true;
    }
    if (req.method === "GET" && path.startsWith(`${territoryRoot}/`)) {
      const department = path.match(
        /\/departamentos\/(\d{2})\/municipios$/,
      )?.[1];
      if (!names[department]) send(res, 404, {});
      else
        send(res, 200, {
          version: "demo",
          departamentoCodigo: department,
          municipios: [
            {
              codigo: `${department}001`,
              nombre: names[department],
              departamentoCodigo: department,
              tipo: "MUNICIPIO",
            },
          ],
        });
      return true;
    }
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
      const supplied =
        body.departamentoCodigo !== undefined ||
        body.municipioCodigo !== undefined;
      const validLocation =
        typeof body.departamentoCodigo === "string" &&
        names[body.departamentoCodigo] &&
        body.municipioCodigo === `${body.departamentoCodigo}001`;
      if (
        (supplied && (body.estado !== "APROBADA" || !validLocation)) ||
        (row.estado === "APROBADA" &&
          body.estado === "APROBADA" &&
          (!supplied || body.municipioCodigo === row.municipioCodigo))
      ) {
        send(res, 400, {});
        return true;
      }
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
        const previousState = row.estado;
        const previousLocation = {
          departamentoCodigo: row.departamentoCodigo ?? null,
          municipioCodigo: row.municipioCodigo ?? null,
          territorioVersion: row.territorioVersion ?? null,
        };
        if (supplied)
          Object.assign(row, {
            departamentoCodigo: body.departamentoCodigo,
            municipioCodigo: body.municipioCodigo,
            territorioVersion: "demo",
          });
        row.estado = body.estado;
        row.revision++;
        row.mensaje = body.mensaje;
        row.historial.push({
          accion:
            previousState === "APROBADA" && body.estado === "APROBADA"
              ? "UBICACION_CORREGIDA"
              : body.estado,
          ...(body.estado === "APROBADA"
            ? {
                ubicacionAnterior: previousLocation,
                ubicacionNueva: {
                  departamentoCodigo: row.departamentoCodigo ?? null,
                  municipioCodigo: row.municipioCodigo ?? null,
                  territorioVersion: row.territorioVersion ?? null,
                },
              }
            : {}),
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
