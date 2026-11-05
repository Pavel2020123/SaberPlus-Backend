# C5 — continuación global, 3/nov/2026

## Resultado final local — 4/nov/2026

Alcance autorizado cerrado localmente según la
[matriz requisito/evidencia](C5_MATRIZ_CIERRE_LOCAL.md):150/150 integradas con
Storage tras corregir escritura tardía y2/2 seleccionadas Storage posteriores,
incluido HTTP privado foto/PDF y recuperación exacta. Sin fallos ni omisiones
en esas ejecuciones; recursos propios retirados. Banderas apagadas por defecto.
Prisma regenerado, Nest compila,11 JVM,83 Flutter,187 panel y301 unitarias
editorial/privadas en sus alcances registrados;no sumar suites entre sí.
Al cerrar pruebas no hubo despliegue, migración remota, contratación ni merge.
Después el propietario autorizó commits/push:implementación backend `11bbaa3`
y Flutter `b98d65e`, documentación separada, rama `feat/c5-cierre-pendientes`.
La publicación se verifica contra origin; no implica merge ni despliegue.
Los párrafos inferiores conservan la historia y no reabren pendientes resueltos
en la matriz. La implantación real y sus autorizaciones quedan separadas.

Rama de ambos repositorios: `feat/c5-cierre-pendientes`, creada sobre la entrega
LIC subida a GitHub. Objetivo activo: completar los pendientes autorizados de C5,
con pruebas locales y documentación; no contratar, desplegar ni migrar proyectos
remotos sin autorización. No se declara C5 global terminado.

## Recuperación privada: verificación incremental, 4/nov

Auditoría posterior de timeout:se reprodujo una escritura tardía después de
vencer la transacción y de confirmarse un borrado previo. Al fallar también la
limpieza compensatoria, el trabajador excluía para siempre ese ID por tener
`bytesRetiradosEn`. El nuevo caso falló por rechazo esperado ausente al leer
los bytes residuales (47 aprobados,1 fallo). No era reapertura de permisos,
pero sí un fallo de reconciliación física.

Corrección incremental:la limpieza vuelve a recorrer IDs respaldados y
RETIRADO aunque tengan primera confirmación física, con el mismo cursor/tandas
acotadas. No toca activos ni enumera objetos desconocidos, y no reescribe el
tiempo histórico de primera confirmación. Repetición:48/48 privadas aprobadas,
incluido el caso que antes fallaba;recursos propios retirados. Lint dirigido
y compilación Nest aprobados. La comprobación adicional de conservar la fecha
se añadió después de cargar esa ejecución y debe verificarse en la siguiente.
Los149 aprobados anteriores no acreditan esta modificación posterior.
Regresión conjunta posterior con Storage real local:150/150 aprobadas,0 fallos,
0 omisiones,247 segundos. Incluye la fecha original de confirmación conservada
y el caso de IO tardío con fallo compensatorio. Recursos propios retirados.
Lint de todos los privados y servicios Auth/aprobación/supresión aprobado;
CLI9/9 aprobadas. El escenario HTTP de foto/PDF con bucket privado se añadió
después de cargar esa suite:su ejecución separada sigue pendiente.

`PrivateFileRecoveryService` incorporado al módulo, sin endpoint público.
Reserva el registro de respaldo antes del IO, exige ADMIN global verificado
sin cambio de clave pendiente y vuelve a comprobar vigencia y almacén tras IO.
La restauración verifica hash/tamaño y no sobrescribe un objeto distinto.
No cambia identidad, revisión del perfil ni metadatos de retención.

Ensayo dirigido PostgreSQL local:44/44 aprobadas,88 migraciones en base
desechable, incluidos restauración exacta de foto ausente, conservación de
identidad/revisión, rechazo tras retirada, rechazo de no operadores sin IO de
bóveda y conservación de un objeto distinto. Incluye el ensayo real del panel
ADMIN en Chromium. Recursos desechables retirados por el ejecutor.
Build Nest, lint del servicio y sintaxis de los archivos de prueba aprobados.
Repetición posterior:45/45 aprobadas sin omisiones, incluido PDF activo que se
restaura exactamente y que, tras vencer, no admite respaldo ni restauración ni
extensión de su reloj. También se comprobó rechazo de una bóveda distinta antes
de escribir el original. Recursos desechables retirados por el ejecutor.
Repetición con herramienta real:46/46 aprobadas. La CLI separada
`tool/private_file_operations.mjs` valida marcador y propiedad Docker locales,
rechaza al estudiante y respalda/restaura exactamente para ADMIN verificado.
Sus2 pruebas de argumentos también aprobaron. Operación y límites en
[C5_OPERACION_PRIVADA_LOCAL.md](C5_OPERACION_PRIVADA_LOCAL.md).
Ensayo posterior de carrera:47/47 pruebas privadas aprobadas. El reloj de
retención vence durante el IO de restauración: la comprobación posterior
rechaza la operación, retira la fuente y elimina bytes recuperados y claves
del respaldo. No acredita terminación abrupta del proceso ni IO remoto tardío
fuera del límite transaccional; esos extremos requieren auditoría adicional.
Última repetición privada:47/47 aprobadas con comprobaciones adicionales de
operaciones apagadas (503 sin IO de bóveda) y rechazo de respaldo/restauración
tras supresión LIC-4 antes del borrado físico del respaldo. Recursos propios
retirados. La regresión conjunta Storage y el ensayo JVM nativo siguen en curso.
Regresión integrada completa posterior:148 casos,147 aprobados,1 omitido
(Storage real opt-in),0 fallos,187 segundos. Incluye editorial, PDF, manifiesto
offline, juegos/historial, LIC solo-historial, privados y panel Chromium.
El caso de vencimiento durante restauración se verificó aparte en47/47;
se añadió después de iniciarse la carga de módulos de esta ejecución completa.
El ejecutor confirmó retirada de sus recursos propios. Esto no sustituye la
repetición opt-in con Storage real local ni pruebas de un proveedor remoto.
Análisis Dart dirigido a10 archivos de implementación C5:sin incidencias.
Storage real local, ensayo aislado posterior:1/1 aprobado,0 omisiones,
55 segundos de escenario. Verifica API panel/lectura estudiantil/PDF con imagen,
manifiesto privado, revocación, copia exportada conservada, respaldo/restauración
exactos, CLI, limpieza interrumpida recuperada y copia legada con misma identidad.
PostgreSQL y Storage propios retirados por el ejecutor. La primera ejecución
conjunta terminó1 sin resumen final: no se cuenta como aprobada. Su límite era
240s frente a187s del conjunto sin Storage más55s de ese escenario aislado.
Se amplió a360s únicamente al usar Storage real; nueva repetición conjunta
pendiente. La selección aislada exige opt-in real y rechaza filtros en conflicto.
Resultado posterior conjunto con Storage local:149/149 aprobadas,0 fallos,
0 omisiones,260 segundos. Incluye el caso de vencimiento durante restauración.
PostgreSQL/Storage propios retirados por sus ejecutores. El límite previo de
240s era inferior al tiempo observado;360s permitió completar sin omitir casos.
Las comprobaciones adicionales de bandera apagada/supresión se repitieron en
47/47 privados tras iniciarse esa suite; no atribuirlas retrospectivamente.
Cliente Prisma regenerado finalmente sin EPERM:se cerraron por su control
los2 ejecutores propios (confirmaron retirada de API/PostgreSQL y salida0),
después `prisma generate` emitió Prisma Client5.22.0 correctamente. URL
sintética loopback sin conexión; ninguna migración ni limpieza remota.
Puente Android repetido con Gradle offline:BUILD SUCCESSFUL, reporte
`PrivateDocumentBytesTest` con11 pruebas,0 omitidas/fallos/errores. Advertencias
de compatibilidad futura Kotlin/Gradle permanecen fuera de este cambio; no se
modificaron versiones ni dependencias. No es un nuevo ensayo físico.
Contrato de adaptadores Storage repetido también con éxito: editorial y privado
en buckets separados, bytes opacos exactos, replay concurrente sin sobrescritura,
acceso público/anónimo denegado, persistencia tras reinicio con cambio de puerto
y borrado repetido. Recursos propios retirados. No valida Supabase remoto.
Revisión visual posterior con UI/UX Pro Max:8 escenarios renderizados,
12 imágenes inspeccionadas (foto/adjuntos, claro/oscuro, teléfono pequeño y
horizontal, texto250%). El título de verificación se fragmentaba en palabras:
se ajustó la jerarquía tipográfica a escalas grandes sin limitar TextScaler.
Repetición de4 renders de adjuntos y6 pruebas de widget:10 aprobadas; imagen
pequeña revisada otra vez y análisis del archivo sin incidencias. No sustituye
TalkBack, teclado ni nuevas pruebas Android. Hot reload intentado tras conectar
al DTD del proyecto:sin app activa, por lo que no se cuenta como realizado.
El buscador de la skill no pudo ejecutarse por falta de Python; se utilizó su
checklist general de accesibilidad/legibilidad, no resultados inventados.
Regresión dirigida Flutter:83 pruebas aprobadas (repositorios, controladores,
widgets y fachada nativa); unitarias privadas backend:53/53 aprobadas.
No equivalen a regresión global ni cierre de C5; siguen la auditoría de fallos
y concurrencia de recuperación, regresión global y consolidación documental.
No se desplegaron cambios ni migraciones remotas.

## Incremento Flutter de adjuntos, 4/nov

Ensayo posterior de foto propia:
`integration_test/private_photo_android_test.dart`, un flujo Android real
aprobado en1m34s con el mismo AppModule/PostgreSQL temporal43188. Dos cuentas
sintéticas: el propietario selecciona WEBP por DocumentsUI solo imágenes,
guarda desde el componente real, lee su foto y la retira con confirmación;
el docente distinto no puede leerla. El perfil no expone `fotoPerfil` público.
Tras retirar, referencia nula y contenido denegado. APK de pruebas verificado
por AAPT, instalación aceptada por propietario, sin reemplazar app normal.
El puente evita copia de `image_picker` a caché en Android; otros entornos
conservan su fallback y no se validan aquí. No acredita recuperación privada.

Ensayo posterior de extremo a extremo del componente:
`integration_test/private_evidence_android_test.dart`, dispositivo24117RN76L,
AppModule real/87migraciones/PostgreSQL temporal en43188, cliente Dio desde
Android y selectores DocumentsUI reales. `flutter drive` salida0,1m44s.
Creación de copia sintética, selección, subida explícita por la pantalla,
descarga exacta, consentimiento, exportación y retirada; tras retirar, el
recibo quedó RETIRADO y la descarga privada fue denegada. Las copias exportadas
persistieron con SHA-256 idéntico; solo las dos copias sintéticas se eliminaron
después de verificar ruta/hash. No es mecanismo de revocación de copias.
APK `.i2validation`/etiqueta de pruebas verificados antes de instalar y app
normal comprobada tras finalizar. Aceptación de instalación por el usuario.
No extiende la cobertura a login/rutas UI, fotos,72h, Supabase ni recuperación.

Actualización posterior Android: un flujo nativo aprobado en dispositivo
24117RN76L, con APK debug separado `.i2validation` y etiqueta SaberPlus Pruebas
comprobados por AAPT antes de instalar. Abrir/cancelar selector, guardar/cancelar
destino y volver a abrir/cancelar selector; `flutter drive` salida0,44s.
No mocks de MethodChannel; BACK del host únicamente tras observar DocumentsUI.
Esto reemplaza la ausencia de USB indicada abajo, no acredita aún lectura o
escritura efectiva, API móvil ni recuperación privada. No se tocó la app normal.

Pantalla de solicitante integrada en la solicitud institucional bajo
`PRIVATE_INSTITUTION_EVIDENCE_ENABLED` (apagado por defecto). Selección nativa
Android y exportación mediante puente debug, sin permisos generales; PDF nunca
embebido/ejecutado por la UI. Envío explícito, recibos por operación, consulta
antes de cancelar reserva y retirada confirmada. Limpieza física pendiente
con aviso/reintento durante la pantalla actual, sin prometer borrar copias
exportadas. El backend continúa siendo la autoridad de permisos/revisión/plazos.

Evidencia local:82 pruebas Flutter dirigidas aprobadas; análisis dirigido sin
avisos. El reporte JVM del puente registra11 aprobadas. Son contratos/pruebas
de componentes: no sustituyen Android físico, instalación APK, inspección visual
ni recuperación operativa privada. Hot reload intentado sin app conectada; ADB
sin dispositivo. C5 global sigue abierto. No migración ni despliegue remoto.

## Historial de construcción de la operación privada, 4/nov

Los párrafos siguientes conservan checkpoints intermedios. Sus expresiones
«falta», «sigue» o «pendiente» describen aquel momento; para trabajo actual
prevalecen la sección de recuperación al inicio y el estado vigente del equipo.
No usar estos contadores como nuevas pruebas ni sumarlos entre sí.

**Estado posterior del borrado de respaldos:** `PrivateBackupCleanupService`
registrado en el módulo, solo con runtime privado dev/test y
`PRIVATE_FILE_OPERATIONS_LOCAL_ENABLED=true` (apagado por defecto). Arranca al
iniciar el módulo, repite cada60s, evita solapamiento y espera la tanda al cerrar.
Procesa hasta20 recibos por tanda, con cursor circular, bloqueo de propietario y
confirmación de `eliminadoEn` únicamente tras retirar clave/copia. Error físico,
timeout o cambio de flag conserva la obligación pendiente. No hay endpoint nuevo.

Cada recibo queda vinculado de forma inmutable a `vaultId`, identidad persistente
del almacén publicada atómicamente. El trabajador la verifica antes y después
del borrado: una carpeta equivocada no confirma borrado ni cambia el vínculo.
La migración pendiente88 se ensayó de nuevo en bases propias nuevas; no se
reescribió historial de instancias existentes.42/42 SQL/HTTP/Chromium privados
aprobados con copia cifrada real, fallo/reintento, namespace erróneo, supresión
LIC-4 y vencimiento de evidencias sin afectar respaldo de foto activa.
53/53 unitarios privados aprobados, incluidos3 de temporizador/cierre con
dobles; Nest compila y Prisma valida. Sigue el servicio de operador con
autorización y recuperación conservadora; no se declara C5 terminado.

Registro durable preparado en `20261104200000_private_backup_registry`:
`RespaldoArchivoPrivado` contiene únicamente ID y tiempos técnicos; RLS/ACL
sin acceso de clientes. Solo registra archivos activos/no vencidos, no admite
confirmar borrado antes de retirada ni borrar/reasignar/revivir el recibo.
Un trigger de retirada del archivo marca la obligación en la misma transacción,
también por supresión LIC-4 y limpieza por vencimiento. Las pruebas mantienen
separados `retiradoEn` y `eliminadoEn`; todavía no ejecutan el borrado de la copia.
40/40 SQL/HTTP/Chromium privados aprobados con88 migraciones en PostgreSQL16
temporal propio, sin omitidas; recursos retirados. Incluye rechazo al registrar
evidencia ya vencida aunque sus bytes originales sigan presentes y cola por90d
sin afectar foto activa. Prisma valida; scripts locales pasan `node --check`.
No migración remota ni sobre instancias existentes. Sigue servicio de operador
y trabajador que elimina clave/copia antes de confirmar `eliminadoEn`.

Avance del transporte local de copias: `private-backup-vault.ts` guarda un
sobre cifrado y una clave individual en carpetas separadas del directorio
propio del ensayo. Lecturas acotadas, publicación exclusiva/replay exacto,
retirada duradera mediante marcador sin contenido y eliminación de clave/copia,
incluido fallo parcial/reintento y carrera con escritura. Seis pruebas reales
de filesystem, más siete del sobre: subconjunto completo56/56 en siete suites
aprobado; Nest compila. Temporales de pruebas retirados, sin datos personales.
Esto no está registrado en Nest ni expuesto por HTTP/CLI: falta el servicio de
operador, autorización SaberPlus, coordinación con PostgreSQL/vencimiento y
enganchar borrado a retirada/supresión/retención. La clave separada del sobre
no equivale a custodia externa ni a ACL Windows verificada. No declarar
recuperación operativa o ante desastre por este transporte.

Decisión confirmada por el propietario el4/nov: ambas reglas de respaldo
aprobadas. La operación queda exclusivamente en SaberPlus, sin acceso de
docentes ni propietarios institucionales. Las copias también deben eliminarse
al retirar el archivo, suprimir la cuenta o vencer la retención de90d de la
evidencia. No es autorización de acceso ADMIN a fotos desde la aplicación ni
de infraestructura remota. Implementación y pruebas de esa política pendientes.

Preparación posterior: `private-backup-envelope.ts` implementa un sobre de bytes
cifrado AES-256-GCM, nonce aleatorio y autenticación de ID/hash/tamaño/MIME.
Clave de32bytes suministrada separadamente por el llamador, nunca incluida en
el sobre. Validación estricta y Base64 canónico acotado antes de decodificar.
Siete pruebas de memoria aprobadas (incluido límite exacto5MiB, alteración y
clave incorrecta). No hay IO de respaldos, claves persistidas, endpoints ni
registro en el módulo. Es una primitiva pendiente de integrar, no un ensayo de
recuperación/retención. No usarla directamente como permiso de restaurar.

Endurecimiento local: `PrivateLocalFileStore` limita entrada y lectura a5MiB,
comprueba tamaño antes de asignar buffer y detecta truncado/crecimiento. El
replay inmutable compartido usa la lectura especializada, sin cambiar el
proveedor editorial por defecto.43 pruebas Jest dirigidas aprobadas, cinco
suites (privados y transporte local editorial); compilación Nest salida0.
Incluye archivos temporales reales y límite exacto. No acredita recuperación.

Inspección de `private-file.store.ts`, `private-file-cleanup.service.ts` y
`editorial-file-recovery.service.ts`: el transporte inmutable se comparte, pero
la recuperación existente consulta `ArchivoEditorial` y su límite editorial.
No debe aplicarse a `ArchivoPrivado` suponiendo que restaura fotos o PDF.
El worker privado retira por vencimiento y reintenta bytes retirados; no es un
respaldo. La lista de adjuntos solo enumera activos, no es inventario operativo.

Para acreditar recuperación privada falta ensayar una copia restringida a
operación local propia, integridad exacta (ID/tamaño/hash), no sobrescribir
contenido distinto, no restaurar retirados/vencidos/supresión LIC, no modificar
permisos/recibos/plazos ni convertir un respaldo en acceso ADMIN a fotos.
Se requiere también coordinación con PostgreSQL y política de eliminación de
las copias de respaldo; los JSON editoriales no prueban esos requisitos.
No habilitar CLI genérica, exponer endpoints de recuperación ni contratar
infraestructura para suplir este pendiente sin su revisión correspondiente.

## Estado conciliado

- A/B/C1/C2, históricos H1/H2/H3 y PDF/offline P1/P2/P3 tienen cierres locales
  documentados. No rehacerlos por instrucciones históricas del índice.
- El adaptador Supabase, recuperación, respaldo, auditoría paginada y limpieza
  conservadora ya existen: leer `C5_D_ENTREGA_PR.md` y `C5_D_OPERACION_LOCAL.md`.
  Las pruebas de Storage real de ese acta fueron locales, no en la nube.
- LIC-0..4 se entregó después de ese cierre editorial; conserva su alcance.
- Lo pendiente global incluye fotos propias, adjuntos de verificación institucional,
  controles operativos y preparación de la instalación remota. Un almacenamiento
  local probado no acredita recuperación ante desastre ni políticas de un bucket
  comercial. No crear otro proveedor ni rediseñar la arquitectura.

## Decisiones confirmadas por el propietario en esta continuación

1. Estudiantes/docentes gestionan únicamente su propia foto. Privada por defecto;
   sin publicación en rankings, directorios, juegos ni perfiles de otros usuarios.
2. Incluir evidencias de verificación institucional: solo solicitante y ADMIN.
   No incluir trabajos, evidencias académicas ni documentos personales de alumnos.
3. Admitir PNG/JPG/WEBP estático y PDF privado descargable. No ejecutar PDF en
   servidor ni usar su contenido como HTML de confianza.
4. El solicitante puede retirar adjuntos mientras la solicitud esté pendiente.
   Tras resolverse: acceso privado durante 90 días y retirada posterior, dejando
   solo constancia de revisión. Política confirmada; todavía no implementada.

## Secuencia incremental

1. Preparación de bytes y transporte separado; pruebas de límites y aislamiento.
2. Metadatos, reservas idempotentes y cuotas; cambios de foto concurrentes con
   versión, autorización antes/después de IO y retirada lógica inmediata.
3. Foto propia en app; evidencia ligada a solicitud de alta y revisión ADMIN.
4. Integración con baja/supresión LIC-4: no restaurar permisos al recuperar bytes,
   impedir escrituras tardías y mantener trazabilidad de borrado físico pendiente.
5. Pruebas SQL/HTTP con bases y Storage temporales propios, app/panel y Android
   cuando el flujo esté disponible. Operación, respaldo coordinado y límites.

Las fotografías/evidencias no se vinculan como recursos editoriales publicados.
Se reutiliza exclusivamente el transporte inmutable, con directorio, bucket y
namespace privados independientes. No URLs públicas ni tokens en el catálogo.

## Incremento actual (backend de foto, solo opt-in local)

`src/private-files/private-file-content.ts`: perfiles cuadrados de hasta 512px,
sin ampliar imágenes pequeñas, WEBP de hasta 200KiB; elimina metadata al
recodificar. Evidencias de imagen conservan proporción y límite editorial de 2MiB
normalizado. Entrada máxima 5MiB. PDF preserva bytes como adjunto no confiable:
solo se comprueba envoltura de versión/cierre y tamaño, **no estructura completa,
ausencia de JavaScript ni malware**. Ese chequeo no debe publicitarse como antivirus.

`private-file.store.ts`: proveedor local separado por defecto y Supabase explícito,
sin fallback, con bucket independiente del editorial. El transporte mantiene
no-upsert, comprobación de bucket privado, timeout, lectura limitada y contraste
de bytes. El namespace privado conserva objetos opacos `.bin`; MIME de descarga
deberá derivarse de metadatos comprobados y usar attachment/nosniff.

El módulo de fotos expone consulta propia, carga, contenido, recibo, retirada y
reintento de borrado físico, con JWT y `PRIVATE_FILES_LOCAL_ENABLED=true` solo en
desarrollo/test. Multipart de un archivo, campos acotados, sin URLs ni propietario
declarado por el cliente. Revisión de foto impide actualizaciones obsoletas;
recibos son propios, no reactivan fotos retiradas y conservan reservas tras fallo.
Cuota transaccional: hasta 10 operaciones nuevas por hora y 10 objetos pendientes
de retirada física por cuenta. No hay cuota comercial ni interfaz de cuota todavía.

Migración nueva `20261103200000_private_files`: metadatos, puntero/revisión de foto,
unicidad, identidad inmutable, estados monotónicos, ACL/RLS sin acceso anon/authenticated,
interbloqueo por usuario con privacidad LIC-4 y retirada tras supresión revisada.
La IO de subida se serializa con el cambio/retirada; así un reintento tardío no
recrea bytes después de borrarlos. Se conserva obligación de limpieza física si
falla el proveedor. La huella ADMIN de LIC-4 incorpora los archivos y revisión.

La UI de foto ya existe en Flutter, detrás de `PRIVATE_PROFILE_PHOTO_ENABLED`
(false por defecto). Incluye selección sin subida automática, confirmación de
retirada, recibo de operación incierta, reintento con identidad estable y
cancelación confirmada. Cambiar de cuenta descarta selecciones/lecturas tardías;
los bytes se mantienen en memoria, sin añadirse a la biblioteca offline. El
backend requiere además `PRIVATE_FILES_LOCAL_ENABLED=true` y entorno local.
Ya existe backend de evidencias y limpieza local (detalle del incremento abajo).
Falta su interfaz y validación móvil/integrada final. El flag sigue apagado por
defecto; no activar en una instalación
real hasta completar esta secuencia. La migración solo se aplicó en bases
temporales propias mediante el runner C5; no en un servicio de uso cotidiano.

## Continuación del 4/nov/2026

- Flutter: 31/31 pruebas de repositorio y pantalla repetidas con éxito. Incluyen
  identidad, respuesta perdida, cancelación, retirada y texto al250% en anchos
  320/375 y orientación horizontal, claro/oscuro. Cuatro renderizados QA opt-in
  generados; se inspeccionaron teléfono claro, oscuro y texto ampliado. El
  generador QA carga Roboto y MaterialIcons del SDK, sin cambiar dependencias.
  No equivalen a galería nativa, integración con API ni prueba Android.
- `20261104100000_private_evidence_resolution` añade únicamente el reloj de
  resolución inmutable: aprobación/rechazo tras revisión pendiente inicia2160h.
  Corregir ubicación, suspender o reactivar no lo extiende. Un nuevo ciclo tras
  rechazo crea otro registro; cada adjunto deberá usar la primera resolución
  posterior a su revisión de reserva. No se inventa una fecha histórica para
  solicitudes ya finalizadas: antes del primer endpoint de evidencias, deberá
  impedirse adjuntar a ellas mientras no se abra un nuevo ciclo válido.
- La tabla no contiene nombres/contactos/bytes y deniega roles cliente SQL.
  El trigger no toca usuarios ni archivos, evitando añadir orden inverso de
  bloqueo al proceso de aprobación. Se conserva solo constancia de revisión.
- Subconjunto privado PostgreSQL/HTTP:23/23, con87 migraciones y retirada
  verificada de recursos temporales. Incluye cuatro pruebas nuevas de relojes,
  ciclos, inmutabilidad y ACL/RLS. El reloj aún NO bloquea descargas ni elimina
  bytes por sí solo: faltan servicio/endpoint de evidencias y operador.
- Regresión completa C5 repetida el4/nov:124 aprobadas,1 omitida (Storage
  opt-in),0 fallidas,87 migraciones. Incluye SQL/HTTP, contratos editoriales,
  históricos/juegos, PDF/manifiesto privado y Chromium escritorio/390px.
  Recursos propios retirados por el ejecutor; no es una regresión global de
  todas las etapas LIC ni una prueba Android. Análisis dirigido de los ocho
  archivos Flutter nuevos/pruebas sin incidencias; Prisma schema válido.
- Próximo incremento: acceso solicitante/ADMIN, carga/retirada transaccional,
  cuotas, reautorización tras IO y comprobación del plazo con reloj del backend;
  después UI del panel, limpieza física y regresión completa LIC/C5.
- Servicios de demostración iniciados antes de esa migración siguen con86
  migraciones; no se modificó su base en caliente. Los ensayos de87 usan otra
  base desechable propia. Sin despliegue ni migraciones remotas.

## Incremento posterior del 4/nov: API de evidencias y limpieza local

Prevalece sobre los pendientes de API/operador del primer ensayo del día.
`InstitutionEvidenceService/Controller` expone, bajo JWT y el flag local:

- `GET/POST /cuenta/archivos/evidencias/:solicitudId`: lista/carga;
- `GET .../operaciones/:operacionId`: recibo propio, también tras respuesta perdida;
- `GET/DELETE .../:id`: descargar o retirar/cancelar/reintentar retirada.

Solo el solicitante PROFESOR con correo verificado aporta/retira. Solicitante y
ADMIN consultan; otros profesores, propietarios posteriores y estudiantes no
heredan permiso. Se comprueban rol, supresión, clave temporal y versión de sesión
desde SQL; se repite la autorización y el plazo tras leer bytes. No URL pública,
nombre proporcionado por cliente ni caché offline. ADMIN no sube ni retira.
Las descargas, incluidas imágenes, son attachment/nosniff con CSP sandbox.
Un PDF admitido sigue siendo no confiable y no analizado por antivirus.
La retirada revoca nuevas descargas del servicio, no las copias que alguien ya
haya descargado a su equipo; la interfaz debe avisarlo antes de descargar.

Hasta3 adjuntos no retirados por solicitud y cuotas compartidas10 operaciones/hora
y10 objetos pendientes por cuenta. Reservas idempotentes por propietario/UUID,
contenido normalizado/huella y revisión. Subir o retirar un adjunto activo aumenta
la revisión de la solicitud: una aprobación obsoleta falla. La revisión conserva
orden de bloqueo solicitante→solicitud, también usado por carga/supresión LIC-4.
La IO inmutable queda dentro del bloqueo; un reintento no revive una retirada.
Una reserva nunca confirmada se puede cancelar; retirado conserva recibo mínimo.

Solo se sube en PENDIENTE/REQUIERE_INFORMACION/LEGADO_EN_REVISION. Adjuntos de un
ciclo ya resuelto no se retiran manualmente al reenviar la solicitud. La primera
resolución posterior a la reserva fija los90d; el backend consulta reloj SQL, no
hora del dispositivo. Al vencer no entrega bytes aunque el proveedor o el
operador fallen. Solicitudes históricas finalizadas sin reloj no admiten nuevas
cargas ni descargas privadas hasta un ciclo nuevo válido.

`PrivateFileCleanupService` se inicia automáticamente solo si el flag local ya
está activo al iniciar Nest. Ejecuta al arranque y cada60s, máximo20 expiraciones
y20 retiradas físicas por pasada, sin pasadas superpuestas en una instancia.
Retira lógicamente las evidencias vencidas antes de borrar; reintenta también
archivos ya retirados por cambio de foto, cancelación o supresión LIC-4. Cursor
circular evita que un proveedor que falla para un archivo bloquee siempre a los
demás. No enumera bucket, no borra huérfanos desconocidos ni fotos activas. Tras
fallo persiste `bytesRetiradosEn=null`; al confirmar borrado conserva recibo y
constancia de revisión, no contenido. Detener la tarea no amplía autorizaciones.
Falta acreditar operación/respaldo en una instalación remota: no está habilitada.

Verificación de este incremento:37/37 SQL/HTTP privados con87 migraciones,
incluidos14 escenarios de evidencias, carrera contra revisión, vencimiento
durante IO, sesión cambiada, cuotas, cabeceras PDF y caída/reintento del proveedor.
Recursos temporales retirados. Jest dirigido67/67 (5 suites), build Nest y lint
dirigido aprobados; no equivalen a la regresión global LIC ni Android.
La primera pasada falló en un fixture que consultaba dos veces clock_timestamp
y difería1ms: se fijó CURRENT_TIMESTAMP estable y se repitió todo el subconjunto.
Regresión completa posterior:137 aprobadas,1 omitida (Storage opt-in),0 fallidas,
87 migraciones. Incluye Chromium escritorio/390px y contratos históricos/PDF;
no incluye una validación móvil de las pantallas privadas nuevas.
Después se añadió y aprobó el caso LIC-4 de supresión del solicitante dentro de
37/37 privados: ADMIN pierde descarga, el archivo queda retirado con obligación
física pendiente y el usuario conserva solo su identidad técnica suprimida.
Se corrigió una expectativa del test: LIC-4 mantiene FK seudónima de auditoría,
no exige que `solicitanteId` se vuelva null. No se modificó esa política previa.

Sigue interfaz solicitante/ADMIN, integración foto/API y Android, recuperación y
auditoría operativa del namespace privado, más conciliación final de documentos.

## Panel ADMIN, 4/nov: adjuntos de verificación

La interfaz ADMIN ya existe dentro del detalle de solicitud; no abre otra zona
de administración ni rediseña los paneles previos. Usa tarjetas, etiquetas,
mensajes de estado y colores del panel. La guía ui-ux-pro-max orientó etiquetas,
confirmación, claridad de permisos, foco, tamaños táctiles y reflujo. Su buscador
Python no estaba disponible: se aplicaron reglas generales sobre el diseño real,
sin instalar herramientas, dependencias ni una paleta nueva.

Flag del panel `PRIVATE_FILES_PANEL_LOCAL_ENABLED=true`, solo API loopback real,
apagado en demo/remoto y por defecto. Requiere por separado el flag y migraciones
del backend. El panel cotidiano se reinició para servir módulos nuevos, pero no
se activó el flag contra su base anterior de86 migraciones.

`private-evidence-fields.mjs` verifica UUID/revisión/estado/MIME/tamaño, descarta
campos extra y solo acepta rutas canónicas. La descarga recibe chunks con límite
5MiB, verifica tipo y tamaño contra metadatos, usa JWT en cabecera, no cookies ni
URLs públicas. La vista es solo lectura: advierte PDF no analizado y copias no
revocables; pide confirmación, prepara bytes y ofrece otro clic explícito para
descargar. Nunca incrusta PDF/HTML ni inicia descarga al entrar. Blob URLs solo
en memoria, revocadas al cerrar/cambiar/actualizar, también por logout/pagehide.
Un resultado tardío no reconstruye la vista. Si cambia revisión, exige consultar
detalle antes de decidir y conserva el control optimista del backend.

187/187 pruebas del panel y sintaxis de39 módulos aprobadas. El subconjunto
privado de SQL/HTTP y Chromium pasó38/38: login ADMIN real con cuenta sintética,
lista real de solicitud/adjunto, descarga a carpeta temporal propia, cotejo de
bytes PDF y limpieza tras logout; capturas1280/390 inspeccionadas. No Android.
Repetido con texto200% a390px y orientación844×390, sin desbordamiento del
apartado; ambas capturas inspeccionadas. Respeta la preferencia de movimiento
reducido y no añade animaciones. No se acredita modo oscuro del panel existente,
que declara color-scheme claro, ni se cambia su diseño global.
Regresión completa tras integrar panel y caso LIC-4:139 aprobadas,1 omitida
(Storage opt-in),0 fallidas;87 migraciones en base temporal propia. Incluye los
38 privados y ambos recorridos Chromium (adjuntos y editorial/históricos).
El ejecutor confirmó retirada de recursos propios. Sin migración remota.
La primera prueba real descubrió una colisión con `institutionEvidence`, método
previo de evidencia académica: se separó como `institutionVerificationFiles` y
`institutionVerificationFileContent`, conservando la ruta académica. Se reforzó
la prueba de API para exigir rutas exactas, no solo una respuesta compatible.

Sigue el solicitante Flutter (selección/carga, recibo incierto, retirada), ensayos
foto/API y Android, recuperación operativa privada y auditoría global del cierre.

## Cliente Flutter y contrato HTTP real, 4/nov

Implementados `private_institution_evidence.dart` y
`private_institution_evidence_repository.dart` (dominio/data de institutions).
UUID, revisión, MIME, tamaño, estado y rutas canónicas verificados; listas y
selección de reintento inmutables. La selección comprueba5MiB antes de copiar.
No envía nombre/ruta local ni propietario declarado; solo archivo, revisión y
operación. Carga/consulta/retirada usan el Dio autenticado y cancelación propia,
sin cerrar el cliente compartido. La descarga es por stream, acotada al tamaño
de metadatos y5MiB, comprobando identidad durante la lectura y al terminar.
Las fechas se muestran, no conceden acceso usando hora del dispositivo.

26 pruebas nuevas del cliente, incluidas cuenta cambiada antes/después/durante
IO, cancelación de stream, descarga corta/excesiva, recibo ajeno y404 incierto.
Repetición combinada con fotos:57 unitarias/widgets aprobadas,2 HTTP omitidas
por opt-in. La pantalla/selector/exportador de evidencias todavía NO existen;
estos contratos no son una funcionalidad nativa completa.

`test/private_files_http_test.dart`:2 escenarios opt-in con Flutter VM, Dio real,
AppModule y PostgreSQL temporal propio con87 migraciones. Perfil docente y
estudiante sintéticos autenticados, aislamiento, carga/descarga/retiro de PDF,
replay sin duplicar y confirmación recuperada tras ocultar una respuesta ya
confirmada en un interceptor del cliente. Foto privada normalizada WEBP,
aislamiento, replay y retirada real; `fotoPerfil` público permanece vacío.
No se afirma pérdida real de TCP ni selector, galería, widget integrado o Android.

Ejecutor existente ampliado de forma opt-in:
`SABERPLUS_C5_PRIVATE_FILES_LOCAL=true` y `SABERPLUS_LOCAL_API_PORT=43188`,
`node tool/local_ranking_validation.mjs`. Por defecto conserva43187 y flag privado
apagado. Valida flags/puerto, no hereda proveedores remotos ni lee .env; crea
`private-files-http.json` solo en su directorio temporal propio (no imprimir ni
versionar). Ese archivo contiene acceso sintético efímero, nunca credenciales de
un servicio remoto; usar solo con `flutter test ... --dart-define-from-file=...`,
no compilarlo en una APK de distribución. El test rechaza host no loopback,
identidad distinta de example.invalid y marcador incorrecto.
Los2 escenarios HTTP se repitieron con éxito tras la revisión final. Análisis
dirigido de los4 archivos Flutter nuevos sin incidencias; sintaxis de los2
ejecutores Node y diff check correctos. Se verificó el marcador propio y se pidió
stop por su control local: API43188, PostgreSQL y directorio temporal retirados
por el ejecutor (proceso terminó0 y directorio ausente). API43187 y panel4173
continuaban respondiendo200. No quedaron credenciales nuevas versionadas.

No se instalaron plugins nuevos. Para la siguiente interfaz nativa, el límite
debe aplicarse ANTES de leer por completo el documento seleccionado. Se revisó
[file_selector oficial](https://pub.dev/packages/file_selector): abre archivos en
Android, pero no ofrece selección de destino para guardar allí. Su
[adaptador Android](https://raw.githubusercontent.com/flutter/packages/main/packages/file_selector/file_selector_android/lib/src/file_selector_android.dart)
recibe bytes en el resultado; no asumir que consultar longitud después de abrir
limite la lectura nativa previa. Falta resolver selección/exportación acotadas,
con permisos del selector del sistema, sin borrar/copiar originales del usuario,
y comprobarlas físicamente. No se presenta un chequeo posterior como protección
del proveedor nativo.

## Verificación de esta continuación

- Base editorial antes del incremento: 15 suites, 248 pruebas aprobadas.
- CLI operativa existente: 7/7 aprobadas.
- Tras el incremento: 19 suites, 296 pruebas unitarias/dirigidas aprobadas; build
  Nest y lint dirigido aprobados. No equivalen a análisis global ni pruebas móviles.
- Regresión integrada con 86 migraciones temporales:118 aprobadas,1 omitida
  (Storage opt-in). Incluye17 escenarios privados SQL/HTTP. Tras integrar la
  revisión/supresión LIC-4 se repitió el subconjunto privado:18/18 aprobadas.
- Storage oficial local: contrato editorial y contrato privado aprobados,
  bucket/namespace distintos, replay concurrente, sin overwrite, denegación
  pública/anónima, persistencia tras reinicio y borrado repetido. Recursos propios
  retirados por el ejecutor. No acredita permisos de Supabase remoto.
- Prisma valida con URL sintética loopback sin conexión. `prisma generate` encontró
  EPERM por DLL cargada en procesos Node: no se cuenta como regeneración exitosa.
  Tipos/modelos del cliente se emitieron y el runtime del incremento se comprobó
  con PostgreSQL; completar regeneración limpia tras liberar procesos propios.

Incidencias corregidas durante el incremento: Sharp no garantizaba cuadrado al
combinar cover/no-ampliación con imágenes pequeñas (ahora calcula lado mínimo);
decoradores de cabecera trasladados de clase a métodos; formato/lint corregidos.
El primer bucket privado local rechazó el límite5MiB porque el harness imponía2MiB
globales: se amplió solo el harness a5MiB, conservando el bucket editorial en2MiB,
y se repitió el contrato real con éxito.

Docker disponible, sin nuevas instalaciones ni gastos. No se utilizaron claves de
un proyecto remoto. Temporales, configuraciones privadas y PDFs independientes
del frontend permanecen fuera del alcance.
