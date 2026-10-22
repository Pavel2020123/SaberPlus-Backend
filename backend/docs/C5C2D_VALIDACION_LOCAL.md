# C5-C2-D — Ensayo local de imágenes en opciones

## Continuación en otro PC — 21 de octubre de 2026, America/Bogota

Responsable: asistente de C5-C2 en sustitución de Pavel, con confirmación visual
del compañero humano. **0/8 bloques humanos aprobados en esta continuación.**
Rama en ambos repositorios: `fix/c5-c2-validacion`.
HEAD inicial actualizado: Flutter `3513b44`, backend `8444b9a`; `fetch` no encontró
commits posteriores en `origin/main`. `pull --ff-only` completado en ambos.
No se abrió ni modificó el frente OV-1 ni se retomaron los PR cerrados #4/#7.

### Auditoría inicial acotada y recursos

- Rutas: `C:\Users\modaf\saber_plus` y `C:\Users\modaf\SaberPlus-Backend`.
  No se encontraron AGENTS.md en los repositorios ni en sus directorios padres.
- Cambio previo ajeno en Flutter: cuatro exclusiones de plataformas en
  `analysis_options.yaml`. Se preservó con stash y se restauró después de crear
  la rama; el stash sigue como respaldo. Excluir ese archivo de los commits C2.
  Backend estaba limpio.
- Lectura: README de entrada, backend/README, admin/README, índice backend,
  arquitectura, funcionalidades, ruta vigente de etapas, trabajo paralelo y las
  guías C5_ARCHIVOS, C5B_PANEL, C5C_FLUTTER, C5C2_OPCIONES,
  C5C2C_CONSUMIDORES, RELEVO_C5_C2 y esta acta. Se conserva la evidencia anterior;
  no se declara una auditoría de todas las líneas del proyecto.
- Código inspeccionado: referencia/lector privado y AcademicImage/
  AcademicOptionContent; cliente Dio/tokens/salida de sesión; modelos de opciones
  y ubicación de sus consumidores; botones de práctica/Cima; proyección pública
  de opciones, asociación transaccional y lectura/retirada editorial, gate local,
  migración aditiva C2 y guardado/versionado del editor; selector por opción del
  panel y sus pruebas; puntos de snapshots Cima/Rescate/Trivia/Tira; ejecutores
  local_ranking_validation, local_ranking_api y prepare_editorial_options_local.
- Dependencias conservadas: sesión/Dio y Riverpod autoDispose para bytes privados;
  publicación y padres publicados para lectura; Prisma/locks y versiones para
  asociaciones; snapshots y proyección explícita para evitar soluciones previas.
  Autorización histórica y proveedor productivo mantienen sus límites documentados.
- Entorno detectado: Flutter 3.47.0/Dart 3.13.0, Node 24.21.0/npm 11.19.0.
  El manifiesto pide Node 24.14.1/npm 11.11.0; npm avisó EBADENGINE, sin cambiar
  manifests, locks ni SDK. Docker Linux y postgres:16 disponibles.
- Android USB autorizado: CPH2577, Android 15; escala inicial consultada 1.0.
  Se detectó pantalla sin bloqueo. Esto no acredita instalación ni vista de C2.
- El humano confirmó que solo dispone del teléfono conectado. **D8b Tira online
  pendiente por falta de segundo cliente**, sin exclusión de alcance aprobada.
  D8a/c/d/e y D1–D7 siguen pendientes de confirmaciones visuales.

### Comprobaciones automáticas de esta continuación

- `flutter pub get`: completado; sin cambios de pubspec/lock.
- `flutter analyze --no-pub`: aprobado, sin incidencias.
- `flutter test --no-pub --concurrency=2 --reporter=expanded test/academic_option_content_test.dart test/editorial_image_test.dart`:
  **49 aprobadas, cero fallidas/omitidas**. Incluye JSON antiguo, proporción,
  reintento sin selección, logout/demo y transporte privado.
- Desde admin/: `npm test`: **130 aprobadas, cero fallidas/omitidas**;
  `npm run check`: **28 módulos** correctos. No tiene dependencias ni lock;
  no se necesita ejecutar npm ci en esa carpeta.
- Primer `npm ci --include=dev --no-audit --no-fund` backend: falló con
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` al descargar sharp; aviso adicional EPERM
  durante limpieza de dependencias. Reintento con `NODE_OPTIONS=--use-system-ca`
  solo en el proceso de instalación, sin desactivar TLS ni cambiar configuración
  global. Reintento aprobado: 795 paquetes instalados. `npm run build` aprobado,
  con Prisma 5.22.0 generado explícitamente. Npm 11.19 avisó sobre scripts de
  instalación no autorizados por su política; no se cambió esa política global.
- APK debug compilada con los cuatro defines públicos del relevo, sin credenciales;
  persiste aviso KGP/flutter_timezone y aviso de acceso nativo de Java/Gradle.
  `adb install -r`: Success; `am start` ejecutado para
  `com.example.saber_plus/.MainActivity`, sin desinstalar ni limpiar datos.
- Túnel USB propio `tcp:43187` activo. API `/health/live` y `/health/ready`: OK,
  database UP; panel 200/no-store y `/config.js` con demo:false/API loopback43187.
- Sesión nueva `saberplus-i2-local-1gDJO0`, nonce `5548e14c…`: 70 migraciones
  aplicadas solo a PostgreSQL16 tmpfs propio. Fixture preparado y releído por API:
  «Opciones C2-D - ensayo 5548e14c», subtema «Opciones con imágenes», 12 preguntas,
  cuatro opciones/dos ilustradas. SQL confirma esos conteos y una única correcta.
  Saldo inicial student: Trivia100 XP y un evento sintético del runner; zero:0 XP.
  No atribuir ese evento a una partida humana. Baseline privado de ensayo guardado
  en su directorio temporal; su archivo no se publica.
- Intento de abrir navegador/Bloc de notas automáticamente bloqueado por política
  de ejecución. Se indicó apertura manual de panel/archivo privado al humano;
  no se imprimió ni envió la contraseña y no se intentó evadir el bloqueo.
- D1 paso1 **confirmado por el humano**: «Sí, entré y es API real», acceso
  admin@example.invalid. Acredita login/panel real; todavía no acredita imágenes,
  cancelación ni guardado. D1 permanece parcial, el total sigue 0/8.
  Siguiente comprobación: abrir la pregunta «Ensayo C2-D 1» del tema sintético,
  desplegar sus dos selectores y usar Ver imagen cargada para observar ambas figuras.

### Incidencia automática y corrección localizada

Primera ejecución `npm run test:editorial-files:postgres`: **43/44 aprobadas,
una fallida, cero omitidas**, 70 migraciones; recursos propios limpiados.
Falló Chromium en `questionButton.click()` porque `#bank-list button` era null.
La inspección de QuestionEditor.save confirma que muestra «Guardado y publicado»
antes de esperar loadPage/loadCases. La prueba esperaba solo ese aviso y SQL,
sin esperar la lista ni el desbloqueo; su recarga podía adelantarse a la UI.
Corrección en `backend/test/editorial-files-postgres.test.cjs`: esperar la presencia
y habilitación del botón antes de recargar. No cambia runtime, permisos o XP.
`node --check test/editorial-files-postgres.test.cjs`: aprobado.
Repetición completa `npm run test:editorial-files:postgres`: **44/44 aprobadas,
cero fallidas/omitidas**, 70 migraciones temporales. Chromium real completó
escritorio1280 y viewport390; sus capturas sintéticas están en la carpeta ignorada
`backend/.tmp/c5b-qa/run-la30ZQ`. Esto sigue siendo evidencia automática,
no una confirmación humana ni Android. El runner confirmó limpieza de su propio
contenedor/directorio; la base humana independiente permanece activa.

Regresiones de esta continuación, completadas después de la preparación:

- `npm test -- --runInBand`, backend/: **128 suites /1.675 aprobadas**, cero fallidas.
- `flutter test --no-pub --concurrency=2 --reporter=expanded`: **969 aprobadas,
  16 opt-in omitidas, cero fallidas**. Las omitidas exigen sus entornos/defines
  de integración particulares; no se habilitaron ni se cuentan como aprobadas.
- Logs automáticos locales ignorados: `output/c5-c2-regresion-flutter-local.log`
  en Flutter; `backend/output/c5-c2-regresion-backend-local.log`,
  `c5-c2-postgres-local.log` y `c5-c2-postgres-local-reintento.log` en backend.
  No incorporarlos a Git ni confundir rutas temporales con evidencia permanente.
- No se ejecutó `npm run lint` (incluye --fix) ni se acredita ESLint global limpio;
  permanece la deuda previa documentada de 27 incidencias.

### Registro humano de esta sesión

| Entrada | Evidencia humana | Evidencia automática | Resultado |
| --- | --- | --- | --- |
| D1 paso1, acceso | Confirmó entrada ADMIN y API real. | Panel200/config demo:false y API/SQL disponibles. | Paso aprobado; bloque parcial. |
| D1 paso2, figuras | Tras orientar hacia los desplegables de B/D, el humano confirma: «Si se ven los rectangulos». Acredita ambas vistas previas en el panel. | Detalle ADMIN releído: misma revisión, editable y capacidad activa. Orden real: A «Ninguna…» sin imagen; B naranja con imagen; C «Ambas…» sin imagen; D azul con imagen. | Paso aprobado; D1 todavía parcial. |
| D1 paso3a, carga azul | Tras seleccionar opcion-azul.png, completar metadatos y Subir y usar imagen, confirma: «Listo, se sigue viendo el rectangulo correctamente». | Nuevo archivo fe6e3f16-ee39-4eeb-93c5-1929b6cd8d74 DISPONIBLE,160×80; tres archivos en total. La pregunta original sigue PUBLICADO y conserva su FK azul anterior: cargar no publica la asociación. | Carga/vista aprobadas; falta Guardar pregunta y recargar. |
| D1 paso3b, guardar | Humano informa que no aparece el aviso; precisa «El botón se puede pulsar, pero no veo cambios» y, al subir, «No aparece ningún aviso». Se indica no repetir Guardar ni recargar mientras se comprueba. | SQL confirma guardado: original e08e947b… ARCHIVADO, intermedia 2ad3b450… ARCHIVADO y actual 3e64af95-d6c7-472a-a474-2bff033ddeae PUBLICADO. Ambas nuevas enlazan azul fe6e3f16… y naranja original; cuatro textos y correcta azul conservados. Dos versiones nuevas compatibles con dos pulsaciones, no con pérdida del archivo. | Persistencia comprobada automáticamente; fallo de visibilidad del feedback en corrección, falta repetir visualmente. |
| D1 paso3c, panel corregido | Tras recargar/reingresar y reabrir, confirma el estado junto a Guardar: «Puedes editar y guardar los cambios directamente.». | Corrección backend53b88fb; acta espejo Flutter13101c5. Regresiones130 panel/44 integradas aprobadas. | Ubicación del estado confirmada; falta confirmar aviso tras una pulsación de Guardar. |
| D1 paso3d, aviso de guardado | Tras una pulsación, confirma: «Guardado y publicado. En demostración, el cambio es solo local.». | SQL: cuatro versiones en total, solo c3250713-6d74-4332-8fb0-f779606ceba5 PUBLICADO; azul nuevo fe6e3f16… y naranja d0128fce… conservados, correcta azul. Config del panel demo:false. La coletilla demo era texto incondicional del editor, no un cambio de entorno. | Guardado y visibilidad del aviso aprobados; corregir frase demo y falta recarga visual de figuras. |
| D1 resto | Cancelación, texto obligatorio, quitar/restaurar y confirmación visual de guardado/recarga de figuras no completados todavía. | Guardado SQL y regresión integrada separados de la confirmación humana. | Pendiente. |
| D2–D7 | Sin confirmaciones nuevas. | Regresiones anteriores no sustituyen pantallas físicas. | Pendientes. |
| D8a, Tira local | Sin ejecución humana. | No atribuirle una prueba online. | Pendiente. |
| D8b, Tira online | Humano confirma un único teléfono disponible. | No se simula segundo cliente ni presencia. | Pendiente: falta segundo cliente. |
| D8c, Batallas | Sin ejecución humana; evaluar alternancia de cuentas en el único teléfono. | No sustituir por HTTP/mock. | Pendiente. |
| D8d, Trivia Rush | Sin ejecución humana. | Contrato automatizado no acredita esta pantalla. | Pendiente. |
| D8e, Fantasma | Sin ejecución humana. | Compartir código con Trivia no acredita su pantalla. | Pendiente. |

**Estado operativo:** API/panel/base humana y reverse43187 activos, sin solo-on,
sin corte de red, sin cambio de escala y sin credenciales dentro de la APK.
La sesión humana caduca dos horas después de local-ranking-ready; si caduca,
crear otra sesión y volver a entrar con su clave propia. No reutilizar la anterior.

Consultas auxiliares de solo lectura: se corrigió el nombre del campo temporal
a creadoEn y se cotejaron referencias por UUID en vez de texto con tildes al pasar
JavaScript por PowerShell. Los intentos iniciales no escribieron datos ni implican
un fallo de la app. La comprobación final de archivo/FK quedó aprobada.

### Corrección de feedback del panel durante D1

Reproducción automática de solo lectura en Chromium1280×900, con el banco humano
de12 preguntas: al desplazar hasta Guardar, el mensaje superior quedó entre
y=−2101 e y=−2077, mientras el botón quedó en y=428. No se escribió en el formulario
humano ni se declaró observación visual humana a partir de esta medida.
La posición explica que el aviso no acompañe a la acción; no acredita por sí sola
por qué el humano tampoco lo identificó al subir.

Corrección localizada en `admin/public/question-editor.mjs` e `index.html`:
copia visual del estado junto a Guardar, sincronizada también para errores,
cambio de registro y cierre. La copia es aria-hidden; el role=status/aria-live
superior sigue anunciando una sola vez. Se corrigió además la ayuda antigua que
afirmaba que las imágenes en opciones no estaban implementadas: conserva texto
obligatorio y explica la imagen opcional cuando aparece el selector.
No se cambian permisos, guardado/versionado, API, XP, migraciones o dependencias.

Regresión de `admin/test/question-editor.test.mjs` ampliada: confirmación y error
junto al botón, limpieza al cerrar y ausencia de éxito obsoleto al cambiar registro.
Antes del arreglo:12/14 aprobadas y2 fallidas por ausencia del estado cercano.
Después del arreglo: panel completo130/130 aprobado; sintaxis28 módulos correcta.
Chromium/PostgreSQL ampliado para exigir confirmación visible en viewport390 y
evitar anuncios accesibles duplicados:44/44 aprobadas, cero fallidas/omitidas,
70 migraciones temporales; limpieza de recursos propios confirmada.
Capturas sintéticas ignoradas: `backend/.tmp/c5b-qa/run-10Bipk`; log ignorado
`backend/output/c5-c2-postgres-feedback.log`. No hay confirmación humana del arreglo
todavía ni nueva instalación Android necesaria por estos cambios del panel.
No se repiten las regresiones Flutter/backend sin cambios de esos componentes.

El humano confirmó posteriormente el aviso de éxito junto a Guardar. Detectó
también la coletilla «En demostración…» en una sesión real. Se verificó
`/config.js` con demo:false y persistencia PostgreSQL de la nueva versión.
La causa es texto incondicional en las dos ramas del guardado directo (crear/editar),
no una conexión accidental a demo. Corrección: la coletilla se añade solo si api.demo
es true. Dos casos de regresión del editor distinguen aviso real y demo; antes del
arreglo15/16 aprobadas y1 fallida en modo real. Regresión panel posterior:
132/132 aprobadas, cero fallidas/omitidas; sintaxis28 módulos correcta. Log ignorado:
`backend/output/c5-c2-panel-modo-feedback.log`.
No requiere repetir el bloque de carga/guardado ya observado ni las pruebas API/SQL
por una corrección exclusiva de texto; el aviso exacto nuevo queda pendiente de
observar cuando el panel cargue esa versión.

**Siguiente paso:** D1 paso3e: Recargar registro seleccionado (sin otro Guardar),
desplegar las dos respuestas ilustradas y Ver imagen cargada; confirmar azul y
naranja conservados. Identificar por texto: el orden actual es C naranja/D azul.
Corregir la coletilla demo para que aparezca solo en modo demo; después continuar
cancelación, texto obligatorio y quitar/restaurar. D1 sigue parcial, total0/8.
Sin push, merge, despliegue o SQL remoto. C2 continúa abierta; no preparar cierre8/8.

## Checkpoint — 21 de octubre de 2026

**Nuevo responsable de C2:** otro compañero sustituye al propietario, sin tocar
el frente OV-1. Seguir [relevo completo](RELEVO_C5_C2.md): usuarios/clave temporal,
Docker/USB, auditoría, pruebas paso a paso y cambios permitidos Flutter/API/panel.
La tabla inferior conserva0/8; D8 se desglosa en D8a–e, todos pendientes.

**Preparación lista; 0/8 bloques humanos confirmados.** La evidencia automática
de [C2-C](C5C2C_CONSUMIDORES.md) no sustituye este recorrido Android.
Se inició PostgreSQL16 propio en Docker,70 migraciones, API AppModule en
127.0.0.1:43187 y panel real local en127.0.0.1:4173. Son servicios temporales:
verificar disponibilidad al retomar, no asumir que siguen activos.

Se compiló una APK debug nueva con los cuatro defines públicos de desarrollo,
sin contraseñas integradas. Al preparar este checkpoint, adb no detectaba
ningún dispositivo; no se afirma instalación ni ejecución física de esta APK.
La compilación advierte compatibilidad futura de KGP/flutter_timezone;
no se cambiaron dependencias para silenciarla.

### Preparación del relevo (no cuenta como prueba humana)

El propietario delegó C2 a otro compañero, distinto del responsable de OV-1.
Se preparó la guía operativa completa y se repitió análisis Flutter sin incidencias,
49 tests dirigidos Flutter,12 Jest de proyección/publicación y12 controles locales:
todos aprobados. Se comprobaron84 enlaces locales de seis documentos de entrada
en Flutter, sin destinos ausentes; guía espejo idéntica en ambos repos.
No se ejecutó de nuevo la regresión global ni PostgreSQL en este relevo documental;
su evidencia anterior permanece en C2-C. No hay confirmación humana nueva.

Cierre posterior: código integrado en main local mediante los merges registrados
en RELEVO_C5_C2.md, sin diferencias funcionales respecto a los commits probados.
Verificación documental final:354 enlaces locales en diez documentos Flutter y
129 en ocho documentos backend, sin destinos ausentes; siete documentos espejo
idénticos. Sin push nuevo, CI remoto, instalación USB nueva ni despliegue.

## Datos de ensayo y seguridad

- Sesión creada por local_ranking_validation.mjs, nunca una base existente.
- Opt-in explícito SABERPLUS_C5_OPTION_IMAGES_LOCAL=true solo para esa API
  desechable; ausencia/false mantiene la carga por opción apagada. Otros valores
  se rechazan antes de crear recursos. No se heredan flags productivos.
- prepare_editorial_options_local.mjs comprueba dueño, directorio temporal,
  contexto Docker local y etiqueta antes de autenticarse con la cuenta ficticia.
- Banco sintético: tema «Opciones C2-D - ensayo …», Matemáticas; subtema
  «Opciones con imágenes»;12 preguntas básicas, cuatro opciones cada una.
- Azul horizontal160×80 y naranja vertical80×160; dos opciones adicionales
  solo de texto. La correcta es «Rectángulo azul horizontal».
- Preparador ejecutado correctamente: guardado y recarga por API comprobados,
  dos referencias de imagen conservadas. Esto no confirma la vista física del panel.
- Credenciales únicamente en flutter-private.json del directorio temporal.
  No imprimirlas, copiarlas a documentación, Git o defines del APK.
- Preparador sin cambios en producción, Supabase/Render, OV-1 o permisos históricos.
  La integración posterior del código en main local se registra en el relevo.

## Guion humano

| Bloque | Comprobación | Estado |
| --- | --- | --- |
| 1 | Panel: editar/guardar/recargar las imágenes; cancelar selección no publica. | Pendiente |
| 2 | Práctica: figuras distintas y proporcionales, texto legible y selección correcta. | Pendiente |
| 3 | Finalizar/revisar y reabrir: opción, explicación, figura y resultado conservados. | Pendiente |
| 4 | Corte/recuperación: aviso completo y reintento sin seleccionar ni duplicar respuesta. | Pendiente |
| 5 | Logout/reingreso: no acceder a contenido privado con la sesión anterior; demo aislada. | Pendiente |
| 6 | Texto grande/pantalla estrecha: controles legibles sin recortes ni estiramiento. | Pendiente |
| 7 | Cima o Rescate: recuperar intento/snapshot con figuras; sin XP duplicado. | Pendiente |
| 8 | Tira/Batallas y Trivia/Fantasma: registrar cada subcaso y sus límites. | Pendiente |

Son ocho bloques con varios pasos, no ocho toques. Registrar confirmaciones reales
y subcasos pendientes; no cerrar8/8 por probar un solo juego. Antes de juegos,
comprobar banco y reglas de admisión: el preparador no fuerza victorias ni XP.
No retirar/archivar recursos para fingir autorización histórica; sigue pendiente.

## Reanudar en otro momento

Desde backend/, tras compilar el backend y con Docker local:

```powershell
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL = 'true'
node tool/local_ranking_validation.mjs
```

En otra terminal, copiar solo la ruta que devuelve local-ranking-ready:

```powershell
$env:SABERPLUS_LOCAL_SESSION = '<directorio temporal de esta sesión>'
node tool/prepare_editorial_options_local.mjs
```

El preparador reconoce su manifiesto al repetirse. Si una preparación falla
antes de escribirlo, revisar el banco sintético o abrir una sesión nueva;
no afirmar que hubo rollback de cargas HTTP parciales.
La API tiene límite de dos horas y limpieza de sus recursos propios al terminar.
El panel se inicia desde admin/ con API_BASE_URL=http://127.0.0.1:43187.
Conectar Android por USB, depuración/instalación permitidas y pantalla desbloqueada;
comprobar adb devices y configurar adb reverse tcp:43187 tcp:43187.
Instalar la APK nueva conservando los datos, sin dar por válido un binario anterior.

**Siguiente acción:** detectar el celular, instalar y comenzar por el bloque1.
No hay confirmaciones humanas nuevas; código y relevo integrados en main local
según [guía](RELEVO_C5_C2.md), sin push nuevo ni despliegue.
