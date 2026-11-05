# LIC-4 — Inventario de dependencias y rutas de baja

**Registro técnico de respaldo C5, 4/nov:**
El trabajador de borrado local ya se integró bajo opt-in técnico, con copia y
clave reales verificadas tras supresión. No confirma borrado si falla el disco
o no coincide `vaultId`; conserva el recibo pendiente. Esta actualización
prevalece sobre el pendiente del párrafo siguiente; sigue recuperación/operador.
`RespaldoArchivoPrivado.archivo` añade Restrict sobre el archivo ya revisado;
no contiene clave, bytes ni identidad adicional. La retirada del archivo,
incluida la supresión LIC-4, marca transaccionalmente la obligación de borrar
la copia. El recibo no puede eliminarse ni volver a estado inicial. No añade
permisos para ADMIN sobre fotos en la app. El trabajador de borrado de esa
copia y el servicio de operador todavía deben conectarse; `eliminadoEn=NULL`
significa pendiente, no borrado físico confirmado. Migración ensayada solo
en PostgreSQL temporal propio, no en instalaciones existentes/remotas.

**Extensión C5 privada, 3/nov:** `ArchivoPrivado.propietario` y
`FotoPrivadaPerfil.usuario` añaden relaciones Restrict. La revisión cuenta archivos,
copias aún no retiradas físicamente y revisión de foto dentro de su huella. El
trigger de la migración `20261103200000_private_files` retira lógicamente los
archivos y elimina el puntero al suprimir la cuenta; rechaza recreación posterior.
Los bytes quedan como obligación durable de limpieza hasta confirmar su retirada.
No confundir retirada lógica con borrado físico: el cierre operativo C5 de esa
cola sigue pendiente. Prueba local por el flujo real solicitar/revisar/ejecutar,
incluido rechazo de una revisión obsoleta tras cambiar la foto.

Inspección de código y `prisma/schema.prisma`, 3/nov/2026, con implementación y
verificaciones locales posteriores. Las decisiones aprobadas y evidencias están
en [LIC-4](LIC_4_BAJAS_Y_RETENCION.md). Solo fixtures propios desechables;
ninguna baja, migración ni supresión sobre datos reales o servicios remotos.

## Relaciones directas a Usuario

Inventario obtenido recorriendo bloques `model` y campos de tipo `Usuario` con
`@relation`. Las acciones son las declaradas en Prisma; antes de una implementación
de supresión se contrastaron con constraints/triggers en PostgreSQL temporal.

| Acción declarada | Modelos/campos afectados |
| --- | --- |
| Restrict | AsignacionLicenciaInstitucional.usuario, SaldoPersonalInstitucional.usuario, OrigenGestionadoInstitucional.usuario, OperacionLicenciaInstitucional.actor, ArchivoEditorial.creadoPor, BalanceCompetitivo.usuario, EventoXpCompetitivo.usuario, TugPresence.user, TugPresenceEvent.user |
| SetNull institucional/editorial | SolicitudAltaInstitucion.solicitante; SolicitudIngresoInstitucion.revisadoPor; SolicitudIngresoEstudiante.revisadoPor; InvitacionInstitucion.aceptadoPor; AuditoriaInstitucion.actor y afectado; Anuncio.creadoPor; ReportePregunta.autor; OperacionReportePregunta.actor; AuditoriaReportePregunta.actor |
| SetNull multijugador | Batalla.rival y ganador; PartidaTiraAfloja.jugadorB y ganador |
| Cascade de identidad/pertenencia | IdentificadorLogin.usuario; ClaseEstudiante.Usuario; IngresoInstitucionCodigo.estudiante; MiembroInstitucion.usuario; SolicitudIngresoInstitucion.solicitante; SolicitudIngresoEstudiante.estudiante; InvitacionInstitucion.creadoPor |
| Cascade de estudio/evaluación | DiagnosticoInicial, PlanEstudioSemanal, ResultadoSimulacro, IntentoSimulacro, PomodoroRegistrado, HistorialRespuesta, CuadernoError, RepasoDiferido, EventoRepasoDiferido, ProgresoTema (campo usuario) |
| Cascade de juegos | Batalla.retador; BatallaParticipante.usuario; BatallaRespuesta.usuario; BatallaEstadistica.usuario; BatallaBloqueo.bloqueador y bloqueado; BatallaReporte.reportante y reportado; PartidaTiraAfloja.jugadorA; TiraAflojaRespuesta.usuario; IntentoTriviaRush.usuario; ConcesionRecompensaJuego.usuario; IntentoGuardian.usuario; IntentoCima.usuario; IntentoRescateEstrellas.usuario; IntentoEscudoConocimiento.usuario |
| Cascade comercial/otros | PagoOrden.Usuario; Referido.referidor y referido; AnuncioLectura.usuario; TasaReportePregunta.usuario |

Una eliminación física podría destruir evaluaciones y partidas compartidas por
cascada o fallar por Restrict. No se deben cambiar esas restricciones para hacer
que un delete genérico «funcione». La institución no posee las cuentas personales.

## Datos fuera de las relaciones directas

- `Usuario`: identidad real, alias, hash, versión de sesión, tokens de recuperación/
  verificación, foto/descripción, fechas de acceso y preferencias.
- Snapshots y JSON de intentos/resultados/reportes/auditoría pueden conservar
  referencias o datos personales sin FK. Requieren inspección de productores y
  lectores, no basta con borrar la relación del esquema.
- Imágenes históricas enlazan historial; archivos editoriales pueden ser compartidos.
  No borrar material común al retirar a su autor o a un estudiante.
- Tokens emitidos, sockets, caché privada y permisos offline deben revalidarse con
  la política existente. No prometer revocación de PDFs ya exportados.
- Backups, logs o almacenamiento externo no se consideran eliminados por un cambio
  SQL. No se han inspeccionado ni operado servicios remotos para este inventario.

## Rutas y operaciones inspeccionadas

| Operación actual | Hallazgo |
| --- | --- |
| `LicenciaInstitucionalService.retirar` | Bloquea institución, autoriza actor, crea/recupera recibo RETIRAR y cambia asignación a RETIRADA con reloj SQL. Conserva Usuario, institución, membresía y resultados; no es retorno personal |
| `SaldoPersonalInstitucionalService.reanudarSiPersonal` | Requiere ausencia de institución, membresía, origen gestionado y asignación activa. El retorno LIC-4 produce ese estado y comparte la reanudación bajo bloqueo del usuario y reloj SQL |
| `AdministracionInstitucionService.retirarMiembro` | No permite retirar propietario; delega LIC-1 si hay control de licencia. Rama legacy elimina membresía y FK institucional, no cuenta |
| `GrupoService.quitarEstudianteDeGrupo` | Elimina solo ClaseEstudiante tras autorización de grupo. No libera cupo ni elimina cuenta; no presentarlo como baja institucional |
| `DELETE /instituciones/me` | Eliminación institucional directa deshabilitada; no desvincula masivamente ni borra la institución |
| `DELETE /admin/usuarios/:id` | Eliminación genérica deshabilitada: exige el flujo de solicitud revisada LIC-4, no llama a `usuario.delete` |
| `/cuentas/supresion` | Solicitud/listado por ámbito; revisión, rechazo y ejecución solo ADMIN. Referencia anónima conserva FKs compartidas y auditoría. SQL impide reactivación y escrituras privadas tardías |

La clasificación HTTP de LIC-1 permite lectura histórica de rutas expresas y
autoriza comandos de licencia en su servicio; no añadir una salida a allowlist
sin autorización transaccional y prueba de aislamiento.

## Gates antes de implementar y cerrar

1. Decisiones confirmadas: historial tras retirada, supresión revisada solo ADMIN y sin purga automática.
2. Matriz separada por cuenta personal/gestionada y estudiante/docente/propietario.
3. Mapa de datos indirectos y verificación SQL real de dependencias en fixture propio.
4. Retorno atómico con reanudación una vez, sin replays que desvinculen una vinculación
   nueva y sin carreras con aceptación/renovación/retirada de cupo.
5. Confirmaciones claras, sin llamar «eliminar cuenta» a retirar cupo o grupo.
6. Preservación de intentos/resultados propios y de terceros, aislamiento y errores.

El inventario por sí solo no declara LIC-4 terminado. El estado de los gates y
las evidencias posteriores prevalecen en [el estado vigente LIC-4](LIC_4_ESTADO_ACTUAL.md),
que registra el cierre local y sus límites sin afirmar despliegue ni Android nativo.
