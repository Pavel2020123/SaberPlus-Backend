# LIC-1: persistencia aditiva

Solo la presencia de `ControlLicenciaInstitucional` opta una institución al nuevo contrato. No inferirlo de planActual, fechaVencimientoPlan o de una membresía legada. Una vez incorporada, no borrar el control ni volver al plan gratuito al vencer.

Periodos independientes de las asignaciones: renovar no duplica alumnos ni resucita asignaciones retiradas. El propietario se excluye del consumo docente por su membresía verificada en la transacción. La procedencia gestionada es explícita, no se infiere de institucionId; persiste tras desvincular para impedir una conversión gratuita accidental. Vincular una cuenta personal requiere aceptación.

Todas las mutaciones deben bloquear la misma fila de control, comprobar al actor dentro de la transacción y registrar recibo idempotente con huella del comando. Mismo identificador con otra huella se rechaza. Alta de control inicial requiere serialización por institución antes de insertar. Restricciones SQL defienden fechas, cupos no negativos, estados de asignación y una sola asignación activa por persona. La exclusión de periodos superpuestos y el límite agregado de cupos requieren el servicio transaccional pendiente: no están garantizados aún por estas tablas. No se activará acceso hasta implementar servicios y revisar rutas HTTP/socket.

Las relaciones RESTRICT preservan trazabilidad y no autorizan borrar usuarios/instituciones con registros de licencias. LIC-4 deberá diseñar retención y anonimización; no implementar borrado en cascada aquí. No contiene contraseñas ni datos de pago. La referencia administrativa solo acredita el acuerdo registrado, no valida un pago ni contrata una pasarela.
