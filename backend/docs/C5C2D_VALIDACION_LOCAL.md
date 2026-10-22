# C5-C2-D — Ensayo local de imágenes en opciones

## Reanudación de servicios — 21 de octubre de 2026, 23:10–23:15 America/Bogota

**D1–D5 aprobados (5/8). Sigue D6: texto grande y accesibilidad.**
Antes de pedir remontar servicios, el humano confirmó la primera pregunta
«Ensayo red C2-D…» con ambas figuras y ninguna opción seleccionada. Esa preparación
corresponde a la sesión anterior; no acredita todavía desconexión o reintento.

- Repositorios conservados en `fix/c5-c2-validacion`, HEAD Flutter27afc9c y
  backendda2a2b0. Cambios documentales pendientes y analysis_options.yaml ajeno
  preservados. Sin cambios funcionales nuevos, fetch/push, merge o intervención OV-1.
- API/panel anteriores ya no escuchaban y no había procesos Node vivos.
  Quedaba el contenedor anterior5548e14cf1e3fcd9 y su directorio temporal.
  Se validaron marcador, URL loopback y etiqueta de propiedad; resumen SQL antes
  del cambio: XP académico190, historial10, resultados2, un evento sintético y
  un intento D4 no consumido4c7f272a-8d87-4b69-84f6-5ca117b7f80e (cinco preguntas).
  Resumen técnico ignorado: backend/output/c5-c2-sesion-anterior-resumen.json.
- Se solicitó parada mediante control.json. El control automático rechazó el
  comando de retirar ese contenedor y borrar su directorio: «blocked by policy».
  **Ambos recursos anteriores quedan conservados, limpieza pendiente**; no se
  eludió el rechazo ni se reutilizaron sus credenciales. La propiedad anterior
  está identificada; no operar contenedores ajenos.
- Nueva sesión propia: `saberplus-i2-local-Kb3AT3`, nonce5db53a0f07d51a09;
  PostgreSQL16 tmpfs propio y70 migraciones. local-ranking-ready con
  optionImagesLocal:true. Límite original de dos horas conservado.
- Contraseña nueva únicamente en el campo AUTH_E2E_PASSWORD de
  `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-Kb3AT3\flutter-private.json`.
  Ruta comunicada al humano, sin imprimir la clave, tokens o URL de base.
  Cuentas ficticias admin@example.invalid y student@example.invalid; cerrar
  sesiones anteriores e introducir manualmente la clave nueva. No recompilarla.
- API43187: health/live y health/ready OK/database UP; panel4173 real, demo:false.
  ADB reconoce CPH2577 autorizado y reverse tcp:43187 restaurado.
  Se conserva la APK ya instalada: mismo endpoint/código, sin reinstalación.
- Fixture estándar nuevo: «Opciones C2-D - ensayo 5db53a0f»,12 preguntas.
  Fixture D4 reconstruido por las APIs ADMIN reales: mismo tema, subtema
  «Recuperacion de imagenes C2-D»1aefae91…, cinco preguntas con cuatro opciones,
  dos figuras nuevas36f1a6b8…/5fdd5b48… y descripciones veraces. Guardado y recarga
  API comprobados. No se crearon intentos student ni respuestas para esta preparación.
  Los resultados anteriores permanecen como evidencia del ensayo anterior;
  esta base nueva no importa sus usuarios/IDs, historial o XP.

- D4, 23:18 America/Bogota: el humano confirma «Sí» a la primera pregunta
  de la sesión nueva con ambas figuras y ninguna opción seleccionada.
  SQL independiente: intento249ae115-c6a5-48d4-b191-3fdf65245ec2 PRACTICA,
  cinco preguntas, consumidoEn:null; XP académico0, historial0, resultados0,
  un evento competitivo sintético inicial. Evidencia automática ignorada:
  backend/output/c5-c2-d4-baseline-nueva-sesion.json. No acredita aún el corte.

- D4: el humano confirma que volvió a la lección con Atrás y dejó de verse
  la pregunta. Se retiró únicamente `adb reverse tcp:43187`; la lista de túneles
  ya no contiene ese puerto. API local sigue ready/database UP. No se cerró
  sesión ni se detuvo PostgreSQL/API/panel. Se prepara reabrir el borrador local;
  todavía no hay observación humana del fallo de descarga o de su recuperación.

- D4: tras reabrir Practicar sin túnel, el humano confirma que se conserva
  el texto y aparecen los avisos con «Reintentar imagen» para ambas figuras,
  sin opción seleccionada. Es observación humana del fallo de descarga.
  Se restauró únicamente reverse tcp:43187. Comparación SQL con el baseline:
  mismo intento249ae115… no consumido y mismas cinco preguntas; XP0,
  historial0, resultados0, evento competitivo sintético1, sin intentos nuevos.
  Evidencia automática ignorada: backend/output/c5-c2-d4-corte-sin-respuestas.json.
  La primera comparación auxiliar falló al comparar Date de Prisma con cadenas
  JSON del baseline; se normalizaron ambas representaciones y la repetición
  confirmó cero diferencias. Sin fallo de producto ni modificación de datos.
  El reintento y su ausencia de selección accidental aún requieren observación.

- D4 cierre: el humano confirma «Sí» tras pulsar únicamente los reintentos:
  vuelven ambas figuras con proporciones correctas y ninguna opción seleccionada.
  SQL posterior normalizado confirma el mismo intento no consumido, cinco
  preguntas, XP académico0, historial0, resultados0 y evento sintético1.
  Evidencia automática: backend/output/c5-c2-d4-recuperacion-d5-baseline.json.
  **D4 aprobado; total4/8.** Se ensayó fallo de descarga antes de enviar y
  recuperación del mismo borrador; no se simuló pérdida de confirmación de un
  POST ya persistido ni se afirma haber cubierto ese subcaso.
  Baseline D5 zero: sin intentos, historial, resultados, XP ni eventos competitivos.

- D5 paso1 humano: confirma «Sí» a que, tras Más → Cerrar sesión y Atrás,
  la pregunta y las imágenes privadas permanecen inaccesibles. Acredita la
  salida de la sesión anterior; no acredita aún el aislamiento de zero ni
  la reanudación de student. No se borraron datos de la app ni el borrador.

- D5 paso2 humano: tras entrar como zero@example.invalid, confirma en Practicar
  → Ver historial ambos avisos: «Aún no has completado simulacros» y «No hay
  respuestas que coincidan con estos filtros». Vista de historial vacío confirmada;
  no se atribuyen a esta base nueva los resultados de D3 de la sesión anterior.

- D5 paso3 humano: como zero confirma «Aparecen las imagenes bien, sin ninguna
  opcion seleccionada y no aparece el aviso de intento reanudado» al abrir
  Practicar del mismo subtema. SQL confirma intento propio9c460388-6402-405a-9602-dc9bc7d9db28,
  distinto del intento student249ae115…; ambos no consumidos y con cinco preguntas.
  Student conserva exactamente su intento/orden/fechas; ambas cuentas XP0,
  historial0 y resultados0, ledger student1 sintético y zero0. Evidencia ignorada:
  backend/output/c5-c2-d5-zero-intento-propio.json. No se enviaron respuestas.

- D5 cierre humano: tras volver a student y abrir la misma práctica confirma
  «Aparece intento reanudado sin ninguna opcion seleccionada». SQL conserva
  exactamente los intentos propios249ae115…/9c460388… y su orden/fechas,
  sin intentos adicionales, respuestas, resultados, cambios de XP o eventos.
  Evidencia ignorada: backend/output/c5-c2-d5-student-reanudado.json.
  **D5 aprobado; total5/8.** Aislamiento demo/ausencia de token/retiro de bytes
  privados: evidencia automática de editorial_image_test.dart ya ejecutada
  (incluida en las49 dirigidas aprobadas), no observación demo física.
- D6 preparación: CPH2577 Android15, resolución física1080×2400; escala inicial
  consultada1.0 y cambiada mediante ADB a2.0, valor releído2.0. Accesibilidad
  del sistema inicialmente desactivada (accessibility_enabled:0); no atribuir
  lectura TalkBack aún. Se conservará/restaurará escala1.0 al terminar D6.

**Siguiente paso exacto:** con texto grande, desplazar la pregunta actual por
todas las opciones y controles. Confirmar textos completos, figuras proporcionales
y controles alcanzables sin recortes/solapamientos. No responder todavía.
D6 revisión/error/accesibilidad y D7 pendientes; D8b requiere segundo cliente.

## Continuación en otro PC — 21 de octubre de 2026, America/Bogota

Responsable: asistente de C5-C2 en sustitución de Pavel, con confirmación visual
del compañero humano. **3/8 bloques humanos aprobados: D1 panel, D2 práctica y D3 corrección/persistencia.**
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
| D1 paso3e, recarga | Tras Recargar registro seleccionado y Ver imagen cargada confirma: «Sí, se conservan ambas figuras y sus textos». | ADMIN conserva id c3250713…, revisión243cfe6c…; dos imágenes, cuatro textos y una correcta. Baseline previo a cancelación guardado en la sesión temporal. | Guardado/recarga de imágenes aprobados; D1 aún parcial. |
| D1 paso4, cancelar selección | Tras abrir selector en «Ninguna de las dos figuras», Cancelar y recargar sin guardar, confirma que sigue sin imagen y la correcta sigue azul. | Detalle ADMIN cotejado contra c2d-before-cancel.json: misma revisión243cfe6c…, mismas cuatro opciones/asociaciones, dos imágenes y una correcta. | Cancelación aprobada. |
| D1 paso5, texto obligatorio | Con imagen azul y correcta conservadas, al vaciar solo el texto y Guardar confirma: «Completa los textos requeridos y respeta el límite de 4000 caracteres. Si tienes texto pendiente, cópialo antes de recargar.». | SQL sigue con cuatro versiones y solo c3250713… PUBLICADO. ADMIN conserva revisión243cfe6c…, textos e imágenes originales. No se publicó la respuesta vacía. | Rechazo aprobado; falta restaurar el borrador local deliberadamente inválido. |
| D1 paso5b, restaurar texto | Tras Recargar registro seleccionado confirma: «Vuelve y sigue marcado como respuesta», referido al texto azul y su marca de correcta. | La versión persistida no había sido alterada por el rechazo; se recuperó desde ella. | Restauración confirmada, sin nuevo Guardar. |
| D1 paso6a, quitar naranja | Confirma aviso de guardado y respuesta naranja solo de texto tras Quitar imagen de este contenido y Guardar una vez. | Actual2d05d400… PUBLICADO, naranja sin referencia/FK; azul nuevo correcta. Archivo naranja d0128fce… DISPONIBLE, cuatro referencias en versiones archivadas de esta pregunta; descarga ADMIN110 bytes con SHA-256 coincidente. | Desvinculación y conservación de bytes aprobadas; restauración pendiente. |
| D1 paso6b, carga naranja | Confirma vista vertical y aviso «Imagen lista: Rectángulo naranja vertical. Guarda el contenido para incorporarla.». Aclara que escribió guiones en Descripción para lectores, también en la carga azul anterior. | Nueva naranja28b7a50b… DISPONIBLE80×160, alt «-----»; azulfe6e3f16… alt «--». La versión publicada2d05d400… aún no asocia naranja. Los archivos originales del fixture sí tienen descripción veraz. | Vista/carga confirmadas; metadatos accesibles insuficientes, corregir antes del guardado final. |
| D1 paso6c, descripción naranja | Tras repetir la carga con descripción completa confirma: «Listo, termina y se ve bien». | Archivobd25a43e-67a6-408c-8e92-f407baaf5c3a DISPONIBLE80×160; textoAlternativo exacto «Rectángulo naranja vertical, de 80 píxeles de ancho y 160 de alto.». | Carga y metadatos naranja corregidos; pendiente asociar al guardar. |
| D1 paso6d, descripción azul | Tras cargar opcion-azul.png con descripción completa confirma: «Listo, se ve bien». | Nueva carga azul DISPONIBLE160×80 con descripción que incluye160 de ancho y80 de alto; naranja corregida sigue disponible y conserva su descripción. IDs definitivos registrados en los archivos privados de esta sesión. | Ambas cargas corregidas disponibles; falta guardar asociaciones y recargar. |
| D1 paso6e, guardado y recarga final | Informa primero naranja en una opción distinta y después confirma que, tras volver a subirla donde corresponde, guardar y recargar, «se ven bien y donde es». No se atribuye la causa al humano ni al software sin reproducción. | SQL confirma intermedia dcf4e128… con naranja asociada a «Ambas figuras…»; actual e2826d61-c150-4f91-aef9-533f3821aa26 PUBLICADO, naranja eee6dd70…80×160 en su texto y azul003f5a00…160×80 en el suyo, única correcta azul. Ambas descripciones completas, cuatro textos, dos imágenes y ADMIN coincide. | Restauración y recarga aprobadas; incidencia de asociación corregida en los datos, causa sin confirmar. |
| D1 cierre | Acceso, figuras, carga, guardado/recarga, cancelación, texto obligatorio, quitar/restaurar y feedback confirmados en pasos anteriores. | API/SQL, descripción/dimensiones, bytes conservados y regresiones documentadas. Baseline final privado c2d-final-d1.json; revisión e9ca3b45…. | **D1 aprobado. Total1/8.** |
| D2 paso1, ingreso Android | Tras indicar student@example.invalid y clave temporal confirma: «Listo, estoy en inicio». | API/SQL UP y reverse43187 restaurado antes del ingreso; APK de esta sesión instalada. | Acceso confirmado; imágenes/selección en práctica pendientes. |
| D2 paso2, sesión aleatoria | Configura Matemáticas/Básico/5 y confirma primera pregunta «Ensayo cima». | Intento07c66604-25c7-420d-a335-726282998055: posiciones1/2 sumas11+1 y8+1; posición3 «Ensayo C2-D 5» con dos imágenes; posiciones4/5 sumas9+1 y4+1. Solo una pregunta C2-D en esta muestra: no atribuir dos envíos ilustrados distintos a este intento. | Sesión identificada; falta observar la pregunta3 y su selección. |
| D2 paso3, imágenes Android | En pregunta3 «Ensayo C2-D 5», tras avanzar las dos sumas confirma: «Se ven bien», referido a azul horizontal/naranja vertical, textos, proporción y ausencia de recortes. | HTTP real con absent:5 preguntas/20 opciones; solo id/imagenUrl/texto, sin explicación/solución/FK/autoría. Descarga WEBP autenticada de ambas figuras:160×80 y80×160,110 bytes cada una. No se tocó el intento de student; se creó un intento de lectura separado para absent, sin enviar respuestas ni XP. | Vista y proyección aprobadas; falta toque/selección antes de cerrar D2. |
| D2 paso4 y cierre | Tras tocar directamente el rectángulo azul, confirma que solo «Rectángulo azul horizontal» queda seleccionada. | Proyección HTTP/bytes y pregunta asignada cotejados por separado; envío/resultado se comprobarán en D3. | **D2 aprobado. Total2/8.** |
| D3 preparación | Sin confirmación del resultado todavía. | Antes de enviar intento07c66604…: no consumido, XP académico0, historial0, resultados0; ledger competitivo1 evento sintético/Trivia100, sin eventos nuevos. | Baseline registrado; resultado humano pendiente. |
| D3 paso1, corrección azul | Tras completar sumas4/5 y Finalizar → Enviar, confirma azul correcta con su figura y explicación en «Ensayo C2-D 5». | Intento07c66604… consumido; cinco filas de historial, un resultado y XP académico100. Fila ilustrada correcta, seleccionada=correcta5efc3589… con imagen515c660d…. Sesión historialcb1b878c…. Ledger competitivo conserva un evento sintético y saldoTrivia100, sin liquidación nueva. | Corrección correcta aprobada; falta historial/reapertura y caso naranja incorrecta. |
| D3 paso2, historial | En Practicar → Ver historial → Historial de respuestas → Opciones con imágenes confirma «Si sale», referido a Ensayo C2-D 5, respuesta azul/figura y marca de correcta. | Fila persistida e IDs cotejados en el paso anterior. | Historial correcto confirmado; falta reapertura y caso incorrecto. |
| D3 paso3, reapertura | Tras reinicio COLD, volver a Historial y desplegar la entrada confirma: «Sí, ahí sigue», referido a pregunta5, respuesta azul/figura y correcta. | am force-stop/am start -W solo de com.example.saber_plus, PID13813→6428; sin borrar datos/reinstalar. Tras reapertura: mismas cinco respuestas/un resultado/XP académico100, un evento competitivo sintético/Trivia100; sin duplicaciones. | Persistencia correcta aprobada; falta caso naranja incorrecta y su revisión. |
| D3 paso4, segunda práctica | Desde práctica del subtema confirma: «Aparece Ensayo C2-D 7 con ambas figuras». | Nueva sesión PRACTICA de cinco preguntas, todas con dos imágenes; primera pregunta7. Baseline XP académico100 y sesión previa cerrada, sin cambiar selección productiva. | Segunda sesión preparada; falta enviar naranja en7 y observar resultado. |
| D3 paso5, corrección incorrecta | Tras naranja en7 y azul en las restantes confirma: «Aparece la correcta, la incorrecta y la explicacion de la pregunta donde indica de donde sale la respuesta». | Intento3ff7096d… consumido, sesión historial3a793c44…:4 correctas/1 incorrecta; seleccionada naranja976e3250… con imagend0128fce…, correcta azul8e6f4f62… con imagen515c660d…. Historial10, resultados2, XP académico190 (incremento90 según regla existente4×10+50); ledger competitivo sigue un evento sintético/Trivia100. | Corrección/explicación confirmadas; falta comprobar vista del cuaderno con ambas figuras. |
| D3 paso6 y cierre | En Progreso → Cuaderno confirma pregunta7, naranja seleccionada con figura, azul correcta con figura y explicación. | Tras consulta se conservan historial10/resultados2/XP académico190, un evento sintético y saldoTrivia100; sin duplicaciones. Cuaderno derivado del historial: un pendiente. Corrección correcta/incorrecta, historial y reinicio COLD cubiertos en pasos anteriores. | **D3 aprobado. Total3/8.** |
| D4 preparación | Sin prueba humana nueva todavía. | Fixture por APIs ADMIN reales en la misma base: subtema f369468c… «Recuperacion de imagenes C2-D», mismo tema5548e14c, cinco preguntas «Ensayo red C2-D…», dos imágenes nuevas5d69f697… yb263d640… con descripciones/dimensiones veraces. Guardado/recarga API comprobados. Sin intento student ni respuestas/XP; no se cambiaron reglas ni preguntas anteriores. | Preparado para descarga nueva; falta iniciar práctica y preparar corte USB. |
| D4 primera preparación | Confirma primera pregunta «Ensayo red C2-D…» con ambas figuras y ninguna opción seleccionada. Después solicita remontar servicios/clave nueva. | Sesión anterior con intento no consumido4c7f272a…; base nueva preparada en la entrada de reanudación superior. | Preparación confirmada; corte/recuperación pendientes. |
| D4 corte y recuperación, sesión nueva | Confirma ambas figuras sin selección, vuelve a lección; sin reverse observa texto y avisos de reintento; restaurado el túnel, ambos reintentos recuperan figuras proporcionadas sin seleccionar respuesta. | Mismo intento249ae115… no consumido y cinco preguntas antes/después, XP0/historial0/resultados0/evento sintético1; sin nuevo intento. Ver evidencia superior. | **D4 aprobado. Total4/8.** Corte anterior al envío; sin ensayo de confirmación perdida después de POST. |
| D5 logout y cuentas | Tras logout/Atrás no vuelve contenido privado; zero ve historial vacío y práctica sin reanudación; al volver a student aparece Intento reanudado sin selección. | Dos intentos propios distintos, sin cambios en historial/resultados/XP/eventos al alternar. Demo/sin token solo pruebas automáticas. | **D5 aprobado. Total5/8.** |
| D6 texto grande | Sin confirmación visual nueva todavía. | Escala1.0→2.0 por ADB, Android15 CPH2577. Restaurar1.0 al terminar. | En curso; faltan pregunta/revisión/error/accesibilidad. |
| D7 | Sin confirmaciones nuevas. | Regresiones anteriores no sustituyen pantallas físicas. | Pendiente. |
| D8a, Tira local | Sin ejecución humana. | No atribuirle una prueba online. | Pendiente. |
| D8b, Tira online | Humano confirma un único teléfono disponible. | No se simula segundo cliente ni presencia. | Pendiente: falta segundo cliente. |
| D8c, Batallas | Sin ejecución humana; evaluar alternancia de cuentas en el único teléfono. | No sustituir por HTTP/mock. | Pendiente. |
| D8d, Trivia Rush | Sin ejecución humana. | Contrato automatizado no acredita esta pantalla. | Pendiente. |
| D8e, Fantasma | Sin ejecución humana. | Compartir código con Trivia no acredita su pantalla. | Pendiente. |

**Estado operativo:** API/panel/base humana y reverse43187 activos, sin solo-on,
sin corte de red, sin cambio de escala y sin credenciales dentro de la APK.
Al comenzar D2, ADB seguía autorizado pero el túnel no aparecía en reverse --list;
se restauró únicamente tcp:43187 y se abrió com.example.saber_plus. No se atribuye
ese hallazgo a una desconexión D4 ensayada ni se afirma login humano todavía.
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
`backend/output/c5-c2-postgres-feedback.log`. Confirmación humana posterior de
estado y éxito junto al botón registrada en D1 paso3c/d; no se necesitó otra APK.
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

Comprobación de cuaderno: la consulta inicial asumía que calificar creaba una fila
CuadernoError y se corrigió tras leer el servicio. El cuaderno deriva errores del
historial y usa CuadernoError para notas/estado. Listar con el servicio existente
confirma un error pendiente de pregunta7 con las dos referencias correctas;
no se creó una fila artificial ni se cambió el comportamiento de la app.

**Siguiente paso histórico antes de la reanudación superior:** D4: abrir el nuevo subtema «Recuperacion de imagenes C2-D» y
Practicar; confirmar primera pregunta sin responder. Después salir a la lección
para disponer sus imágenes y retirar solo reverse43187; reabrir el borrador local
(la carga de práctica restaura el borrador antes de consultar API). Confirmar aviso
de imagen y recuperación sin seleccionar/enviar respuestas. StatefulShellRoute
mantiene el cuaderno con referencias anteriores: el fixture nuevo evita ese caché.
Las dos sesiones de D3 ya cubrieron azul correcta y naranja incorrecta.
No repetir D1–D3 aprobados salvo regresión concreta. D4–D7 y D8a–e siguen pendientes;
D8b requiere segundo cliente. Las cargas previas permanecen solo en la sesión
desechable; no borrar archivos con usos históricos. Coletilla demo corregida;
texto exacto nuevo aún sin observación humana tras cargar esa versión del panel.
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
| 1 | Panel: editar/guardar/recargar las imágenes; cancelar selección no publica. | Aprobado; evidencia humana D1 de esta continuación. |
| 2 | Práctica: figuras distintas y proporcionales, texto legible y selección correcta. | Aprobado; evidencia humana D2 de esta continuación. |
| 3 | Finalizar/revisar y reabrir: opción, explicación, figura y resultado conservados. | Aprobado; evidencia humana D3 de esta continuación. |
| 4 | Corte/recuperación: aviso completo y reintento sin seleccionar ni duplicar respuesta. | Aprobado; D4 sesión5db53a0f, antes del envío; no se ensayó confirmación perdida tras POST. |
| 5 | Logout/reingreso: no acceder a contenido privado con la sesión anterior; demo aislada. | Aprobado; cuentas/logout USB humanos, demo/sin token automáticos; sin demo física. |
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
