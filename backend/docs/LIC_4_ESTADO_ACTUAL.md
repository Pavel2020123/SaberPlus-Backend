# LIC-4 — Estado y verificación local

3/nov/2026. LIC-4 implementada y verificada localmente; auditoría de alcance aprobada. Rama de ambos
repositorios: `feat/lic4-institution-lifecycle`, conservando cambios anteriores.
Esta es la fuente vigente: los incrementos en `LIC_4_BAJAS_Y_RETENCION.md` son
antecedentes, no pendientes actuales.

Entrega Git autorizada el 3/nov: código backend `421b10d` y Flutter `885b4de`.
Se prepara la entrega de documentación y el push de ambas ramas; esto no implica
merge, despliegue ni migraciones remotas.

Validación Android posterior aprobada el 3/nov: acta en el repo Flutter
`docs/LIC_ANDROID_VALIDACION.md`. Recorrido real, diez capturas inspeccionadas y
`tool/lic_android_fixture.mjs ... verify` aprobado con SQL propio. Las notas de
ausencia de Android inferiores son el límite del checkpoint previo a este ensayo.

## Contrato confirmado

| Operación | Autoridad y efecto |
| --- | --- |
| Suspender licencia | ADMIN; restringe práctica, no borra identidad ni historial |
| Retirar cupo | Propietario/ADMIN; libera cupo y conserva cuenta/resultados; gestionada con consulta histórica, sin práctica nueva |
| Desvincular personal | Propietario/ADMIN durante vigencia; titular después de vencer un periodo y sin cobertura activa; conserva identidad y progreso |
| Suprimir cuenta | Solo ADMIN tras solicitud y revisión; borra identidad, credenciales y progreso individual, conserva compartido sin nombre/correo/alias |

La institución no posee cuentas personales. Una gestionada no se convierte sola
en personal ni se desvincula por sí misma. El propietario debe transferir su
responsabilidad antes de salir. Sin traslado de progreso entre identidades,
purga programada o plazo de retención inventado. Decisiones del usuario:
«1si,2si,3si» y borrar lo individual/anonimizar lo compartido. No autorizan borrar
datos reales. Una solicitud no desactiva ni elimina nada por sí sola.

Saldo personal reanudado al retorno legítimo, una sola vez y con milisegundos y
reloj SQL; no al mero vencimiento institucional. No pausa cobros Google Play ni
crea compras. Una renovación futura no cubre un intervalo descubierto.

## Implementación

- Retorno transaccional con bloqueos institución/usuario, versión de asignación y
  recibo idempotente. Revalida propietario vigente, origen y otras vinculaciones.
  Replay antiguo no desvincula un episodio posterior ni duplica saldo. El intervalo
  institucional persistido impide revivir intentos retirados al limpiar la FK.
- Titular solicita para sí; propietario solo para gestionadas de su institución;
  docente ordinario no solicita sobre terceros. Una pendiente por titular,
  paginación y ámbitos validados en backend. Revisar/rechazar no borra.
- ADMIN revisa recuentos/bloqueos y ejecuta con versión, huella del impacto y frase
  exacta `SUPRIMIR CUENTA`. `ACCOUNT_SUPPRESSION_ENABLED=false` por defecto.
  Solo runners propios habilitan ejecución sobre sus fixtures.
- Bloqueos: ADMIN/propietario en ejercicio; responsabilidad editorial por transferir;
  canal institucional personal por sustituir; partidas activas o sin liquidar.
- Una transacción actualiza solicitud, elimina progreso individual y redacta
  identidad. Ante fallo se revierte completa. Dos ejecuciones simultáneas realizan
  una mutación; la otra puede devolver replay o 409. Tras consultar el estado
  confirmado, el mismo comando es de solo lectura.
- Delete genérico de usuario/institución deshabilitado: no `usuario.delete` ni
  desvinculación masiva. Se amplió la arquitectura existente, sin reconstrucción.

## Datos y seguridad

[Mapa de dependencias](LIC_4_MAPA_DEPENDENCIAS.md). Migraciones aditivas
`20261103170000_account_lifecycle_review` y
`20261103180000_reviewed_privacy_scope`, solo en PostgreSQL propio desechable,
85 migraciones totales. Prisma generado y validado localmente.

Se eliminan estudio/evaluación individual, borradores, repasos, errores, Pomodoro,
planes y juegos individuales; se retiran pertenencias/login. Una referencia
técnica anónima sin rol, correo, alias, foto, descripción, tokens o clave utilizable
conserva FKs compartidas. Incremento de versión invalida sesiones. SQL impide
reactivación y escrituras privadas tardías; el servicio de acceso también rechaza
cuentas suprimidas, sin tratarlas como acceso personal libre. No se muestran como
bajas accionables.

Partidas, resultados de terceros y auditorías se conservan sin identidad del
titular. Redacción compartida no altera puntajes/secuencias/resultados. Excepciones
SQL de evidencia inmutable exigen solicitud ejecutada por ADMIN, transacción y
titular exactos: no se deshabilitan triggers ni se crea un bypass general.

Backups, logs, almacenamiento externo y PDF exportados no se consideran borrados
por SQL. Offline privado conserva su contrato de 72 horas y revalidación;
confirmar revocación bloquea acceso, pero no una copia PDF exportada.

## Interfaces

- `/institucion`: Bajas propietario/ADMIN; retirada separada de retorno, versión,
  confirmación, paginación y solicitud gestionada a ADMIN.
- `/privacidad`: entrada ADMIN, impacto y sección irreversible con frase escrita.
  Tokens en memoria, limpieza al salir, estados de carga/error/vacío; sin reintentos
  automáticos de comandos.
- Flutter: retorno desde aviso institucional; privacidad propia desde Más y
  cabecera docente. Dio y sesión existentes, sin dependencias nuevas ni ejecución
  ADMIN móvil. Error conserva motivo; envío incierto exige consultar estado.
- UI/UX Pro Max: web 375/390 px, teclado y reduced-motion; Flutter claro/oscuro,
  375 px/horizontal, texto 250 %. Previews sin peticiones reales.

## Matriz de evidencia

| Requisito | Evidencia |
| --- | --- |
| Permisos, aislamiento y retirada sin borrar | `node tool/lic1_postgres_local.mjs`; servicios LIC-1/2 y AppModule HTTP real |
| Retorno, saldo exacto, historial, replay/episodio nuevo | `tool/lic4_lifecycle_assertions.mjs`; `licencia-retorno-personal.spec.ts` |
| Solicitud/revisión sin borrado y ámbitos | `tool/lic4_suppression_assertions.mjs`; API y navegador privacidad |
| Supresión y conservación compartida | Evento/puntaje y contraparte conservados; token/login anteriores 401 |
| Concurrencia, rollback y terceros | Dos ejecuciones; fallo SQL inyectado solo en fixture; progreso de otra cuenta intacto |
| Rutas heredadas y denegación suprimidas | `account-deletion-safety.spec.ts`; `licencia-suppressed-access.spec.ts` |
| Portal | 177 pruebas; sintaxis de 37 módulos |
| Flutter | 1215 aprobadas/16 omitidas en regresión completa; 25 dirigidas actuales aprobadas; análisis global sin incidencias |
| Backend completo | 155 suites y 2084 pruebas aprobadas; compilación Nest vigente |
| Esquema y calidad | `prisma validate` aprobado sin conexión remota; ESLint de los servicios/controladores LIC-4 y protección de acceso sin incidencias |

Logs backend: `.tmp/lic4-backend-final-regression.log`,
`.tmp/lic4-final-sql-http-browser.log`, `.tmp/lic4-panel-final-tests.log`.
Logs Flutter: `.tmp/lic4-flutter-full-regression.log`,
`.tmp/lic4-flutter-focused-final.log`, `.tmp/lic4-flutter-analysis-final.log`.
La corrida anterior de concurrencia terminó aprobada. La de rollback aprobó SQL
y se interrumpió por timeout al arrancar HTTP: no cuenta como aprobación integral.
Después del reinicio el recorrido completo terminó aprobado, exit code 0 y
`lic1-owned-resources-removed`. Incluye revisión/supresión, carrera, rollback,
aislamiento, retorno/saldo exacto y regresiones LIC-1/2/3.

## Auditoría de cierre local

Se contrastaron contrato/decisiones, mapa de dependencias, implementación,
matriz de permisos, invariantes transaccionales y pruebas de la tabla anterior.
Las corridas finales terminaron sin fallos. No se usa la corrida interrumpida
como prueba integral. Cambios ajenos conservados; sin nuevos borrados genéricos
en `src`; comprobación de whitespace dirigida sin errores. El estado local queda
cerrado, no publicado. DTD conectado y hot reload intentado sin app activa: sin
validación Android nativa, APK nuevo ni instalación/publicación por esta etapa.
Sin migración remota, billing, gasto, supresión de datos reales, transferencia de
progreso, push o merge. Habilitar producción requiere una operación posterior
explícita y no forma parte automática de esta entrega local.
