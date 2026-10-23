# Relevo operativo — terminar C5-C2, imágenes en las opciones

Actualización C2-D tras auditoría de Pavel: **23 de octubre de2026, C2 abierta**.
Entrega parcial integrada en main remoto: Flutter PR#9/b8253e2 y backend
PR#11/3eb3f59. D1–D7 y D8c/d/e conservan aprobación; D8a se revisa solo por la
regresión de timeout; D8b aprobado con teléfono/emulador y cuentas distintas. Ver
[entrega](C5C2_ENTREGA_PARCIAL.md) y [acta vigente](C5C2D_VALIDACION_LOCAL.md).
No repetir los bloques aprobados sin una regresión concreta. Ramas
fix/c5-c2-timeout-d8b en ambos repos, desde main actualizado; no publicar sin
autorización de Pavel. Las evidencias de fix/c5-c2-validacion ya integradas se conservan.

**Checkpoint vigente23/oct:** D8b aprobado dentro del alcance del acta. APK4004:
emulador Pixel_7 gana y el teléfono, que estaba en segundo plano, vuelve desde
Recientes y muestra el mismo ganador. SQL23f89c68… FINALIZADA/JUGADOR_A,
zero=A/student=B, dos respuestas únicas solo de zero, cero XP; no se añadió
respuesta al regresar. Se conserva evidencia previa de figuras/selección en
Pixel_8_2, sin atribuir selecciones ilustradas al último duelo. No acredita
cierre forzado, ACK perdido o competición. Integración Flutter/pausa del timeout
local implementada:25 dirigidas y50 HTTP/SQL con73 migraciones aprobadas;
falta build/observación Android de esa regresión D8a. No repetir D8b ni otros aprobados.
Los párrafos siguientes conservan el historial de diagnóstico, no pendientes nuevos.

Checkpoint posterior: ambos clientes disponibles. D8b encontró «estado inválido»:
Socket.IO entrega [payload, offset] al activar recuperación; Flutter descartaba
la lista. Corrección localizada y9/9 pruebas, incluida recepción por WebSocket
local con la librería real; APK instalada en ambos, pendiente confirmación humana
de sala. La búsqueda inicial expiró sin respuestas durante el diagnóstico.
Timeout local: regla de Pavel ya autorizada en acta; borrador de contrato TUG_LOCAL
aislado en backend, pendiente integración Flutter/build completo/HTTP-SQL y pausa.
No declarar corregido el timeout ni aprobada D8b por preparar servicios o instalar.
Actualización: sala confirmada visualmente en ambos tras el fix de transporte.
Segundo Listo falla: la función SQL tug_snapshot_original_valid rechaza imagenUrl
en opciones. Reproducción de solo lectura false/con imágenes, true/sin ellas;
migración específica y regresión HTTP/SQL aprobada:48/48,72 migraciones solo en
PostgreSQL propio. No forzar inicio ni retirar controles de snapshot. Contrato
local HTTP/SQL validado y npm run build completo aprobado; integración Flutter/
pausa y observación humana D8b siguen pendientes. Sesión6263e056 retirada
ordenadamente al acercarse su límite de dos horas; usar la nueva clave de sesión.
Sesión posterior87a75d92: humano confirma Inicio en teléfono, emulador pierde
reverse repetidamente al reconectarse ADB. Se instaló APK x64 (build4002) con API y contenido
en http://10.0.2.2:43187 (alias del host en el emulador), sin clave compilada;
no instalarla en teléfono. Confirmación de acceso del emulador aún pendiente;
abrir manualmente tras bloqueo automático del comando de lanzamiento/comprobación.
El humano sustituyó luego el emulador: AVD vigente Pixel_8_2 (x64, serial5554).
APK4002 instalada allí con Success el22/oct a21:57; conserva API directa y
sesión zFyDcK. Túnel del teléfono restablecido. Humano confirma ambos Inicio a22:01;
sigue emparejamiento sin Listo antes de observar sala. La sala observada en el
AVD anterior no aprueba por sí sola el nuevo ensayo D8b.
Nuevo ensayo D8b: sala e inicio con preguntas/figuras coincidentes confirmados
en ambos, pero contenido fuera del globo de respuesta. Regresión de contorno0/4
antes del fix; padding16/radio16 en TugOnlinePage deja13/13 online y análisis
dirigidos sin incidencias. APK4003 instalada en ambos clientes; humano confirma
contención visual correcta a22:21. Después confirma selección propia y retorno
desde segundo plano breve (reloj continúa). Falta observar resultado en ambas
pantallas y conciliar SQL de la misma partida; no acredita cierre forzado o ACK perdido.
Aclaración posterior del humano: empate solo en uno; teléfono queda en última
ronda si terminó mientras estaba fuera. El texto «cuerda en el centro» no era
observación gráfica. D8b no aprobado. Regresión0/2 y corrección de recovery por
GET al volver/lifecycle, sin esperar animaciones antiguas ni aceptar versiones
atrasadas:19/19 online; falta instalar APK nueva y observar retorno tras final
en ambos clientes. No forzar resultado local ni reenviar respuestas al recuperar.
No cambiar reglas por este fallo visual.

Preparación original: **21 de octubre de 2026**. Este es el punto de entrada
para el **nuevo compañero que sustituye al propietario en C2**. No es el compañero
de orientación vocacional: **OV-1 continúa independiente y no se le reasigna**.

## 1. Encargo exacto y fuente de verdad

Terminar **C5-C2**, no toda C5 ni todas las etapas de SaberPlus:

- C2-A: base/FK, permisos y protección de usos; implementada.
- C2-B: contrato y selector de imagen por opción en el panel; implementada.
- C2-C: referencias públicas/snapshots y consumidores Flutter; implementada y
  validada automáticamente. No rehacer desde cero.
- **C2-D: validación integrada Android/panel/API y correcciones que encuentre.
  Entrega parcial: D1–D7 y D8b/c/d/e aprobados; falta regresión de timeout D8a.**

La tabla de resultados humanos vive en `C5C2D_VALIDACION_LOCAL.md`, en docs/ de
Flutter y backend/docs/ del backend. Actualizar ambas copias después de cada
prueba/fallo/corrección, antes de pasar a otra. Este relevo contiene el procedimiento;
el acta contiene los resultados reales. Prevalece el checkpoint más reciente del acta,
no un mensaje histórico del chat, una sesión temporal o un contador de esta guía.

Ya existe evidencia automática en `C5C2C_CONSUMIDORES.md`:969 Flutter aprobadas,
16 opt-in omitidas;128 suites/1.675 backend;44/44 HTTP/PostgreSQL en Docker con
70 migraciones. Análisis Flutter y build backend aprobados. ESLint tiene27
incidencias anteriores documentadas: no declarar lint global limpio ni usar
`npm run lint` sin revisar que incluye `--fix`. No ejecutar todo de nuevo por cada
toque, pero sí repetir las pruebas afectadas por una corrección y la regresión final.

La entrega parcial está integrada por PR en ambos main remotos (fetch verificado).
No reabrir Flutter#4/backend#7 ni tratar la rama anterior como trabajo sin integrar.
Esta revisión requiere commits/PR nuevos solo cuando Pavel autorice publicarlos.
Antecedente de integración original anterior a los PR#9/#11:
app entrega `e833d6b`, merge `f912880`; backend entrega `cfba7cd`, merge `09c763b`.
Ese cierre era local; los PR#9/#11 posteriores incorporaron la entrega parcial.
Un push a main puede activar CI/despliegue si el repositorio tiene automatizaciones:
la integración local no autoriza operar Render/Supabase ni migrar una base remota.

## 2. Auditoría inicial antes de tocar código

Tener **ambos repositorios**; no basta descargar Flutter. Rutas del propietario
(en otro PC adaptar, no crear carpetas duplicadas por copiar estos nombres):

| Repositorio | Ruta del propietario | Contenido |
| --- | --- | --- |
| App | `C:\Users\LENOVO 14ALC6\Desktop\SaberPLus\saber_plus` | Flutter/Dart |
| Backend | `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend` | API en backend/, panel en admin/ |

Leer en este orden:

1. AGENTS.md aplicables, si existen, README de ambos repos y backend/README.md.
2. App `docs/ARQUITECTURA_Y_ESTRUCTURA.md`, `FUNCIONALIDADES_PARA_EL_EQUIPO.md`,
   `ETAPAS_PENDIENTES.md`, `TRABAJO_PARALELO.md`; backend `backend/docs/README.md`.
3. En ambos: `C5_ARCHIVOS.md`, `C5B_PANEL.md`, `C5C_FLUTTER.md`,
   `C5C2_OPCIONES.md`, `C5C2C_CONSUMIDORES.md`, este relevo y el acta C2-D.
4. Inspeccionar el código y los tests de las rutas inferiores. Identificar cómo
   funcionan sesión, transporte, permisos, persistencia, snapshots y reintentos.
   Recorrer el árbol general para entender dependencias; no afirmar haber auditado
   cada línea del proyecto por leer los README. Registrar lo inspeccionado y riesgos.

Arquitectura existente: Flutter feature-first con presentación/dominio/datos,
Riverpod/Dio/GoRouter, inspirada en Clean sin ser estricta; backend monolito modular
NestJS sobre Express/TypeScript, DTO/servicios/Prisma/PostgreSQL; panel HTML/CSS/JS
modular servido por Node. Conservarla; no reconstruir ni convertir a microservicios.

| Flujo de C2 | Archivos que revisar |
| --- | --- |
| Modelo/asociación/permisos | `backend/prisma/schema.prisma`, migración `20261021180000_editorial_option_image_links`, `backend/src/editorial-files/`, `backend/src/admin/` |
| Proyección y snapshots | `backend/src/common/public-answer-option.ts`, servicios/snapshots de simulacro, diagnóstico, cuaderno, guardian, summit, star-rescue, trivia-rush, tira-afloja y batallas |
| Panel | `admin/public/question-editor.mjs`, `question-fields.mjs`, `editorial-image-upload.mjs`, `editorial-file-fields.mjs`, `api.mjs` |
| Flutter compartido | `lib/core/media/`, `lib/core/widgets/academic_image.dart`, `academic_option_content.dart` |
| Consumidores | Modelos/pantallas de academic, practice, progress, battles y games; localizar cada uso de AcademicOptionContent y los modelos de opción |
| Ensayo | `backend/tool/local_ranking_validation.mjs`, `local_ranking_api.cjs`, `prepare_editorial_options_local.mjs`, `backend/test/editorial-files-postgres.test.cjs`, `test/academic_option_content_test.dart` y `test/editorial_image_test.dart` |

## 3. Git y coordinación: no pisar al compañero de OV-1

Comprobar status, rama y commits en **cada repo**, conservar cualquier cambio ajeno.
Si hay archivos modificados, identificar dueño antes de actualizar o cambiar de rama.
Nunca reset hard, clean destructivo, force-push o checkout que descarte trabajo.

Con árbol limpio y main publicado, ejecutar por separado en cada repo:

```powershell
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c fix/c5-c2-timeout-d8b
```

Si esa rama ya existe, inspeccionarla y usar `git switch fix/c5-c2-timeout-d8b`,
no borrarla/recrearla. Si pull diverge, parar la operación Git y revisar; no forzar.
Guardar HEAD inicial de los dos repos. No hacer merge de OV-1 para probar C2.
Si hacen falta cambios en schema/migraciones/AppModule, sesión/navegación o locks,
coordinar con el propietario/OV-1 antes de editarlos. C2-C no añadió migraciones.

## 4. Preparar herramientas y comprobación automática

Windows/PowerShell; Git, Flutter/Android SDK, JDK compatible, Node/npm de los
manifiestos (backend pide Node24.14.1/npm11.11.0), Docker Desktop con motor Linux,
ADB y depuración/instalación USB. Verificar versiones; no actualizar dependencias
ni SDK a ciegas. En el PC del propietario Flutter también está en `C:\flutter_sdk`.

Desde backend/ (no desde la raíz del repo):

```powershell
npm ci
npm run build
npm test -- --runInBand
npm run test:editorial-files:postgres
```

Desde admin/ del backend:

```powershell
npm ci
npm test
npm run check
```

Desde la raíz Flutter:

```powershell
flutter pub get
flutter analyze
flutter test --no-pub --concurrency=2 test/academic_option_content_test.dart test/editorial_image_test.dart
```

Las pruebas PostgreSQL requieren Docker; las unitarias no requieren celular ni
contraseña. El ejecutor automático crea/retira SU contenedor, no deja una API
humana abierta. Regresión Flutter final: `flutter test --no-pub --concurrency=2`.
Si se omiten opt-in, registrar cuántas y por qué; no contarlas como aprobadas.
No usar `.env` productivo, `npm run start:dev`, `db:deploy` ni Supabase/Render para
este recorrido. El runner aplica migraciones solo a su base desechable propia.

## 5. Arranque de una sesión humana nueva — tres terminales

No reutilizar claves, tokens, directorios, códigos o IDs del chat del propietario.
La sesión anterior puede haber caducado. Al cierre de preparación el celular no
estaba conectado y no se instaló la APK C2-D; no dar la instalación por hecha.

Primero abrir Docker Desktop, esperar a que esté listo y comprobar:

```powershell
docker info --format '{{.OSType}}'
docker ps
docker image inspect postgres:16
```

Debe responder linux. Si falta la imagen: `docker pull postgres:16` (requiere red
y espacio). No usar docker prune ni eliminar contenedores/volúmenes ajenos.
El ensayo humano usa PostgreSQL tmpfs: sus datos se pierden al terminar.

**Terminal1, dentro de backend/:** compilar antes de abrir la API.

```powershell
npm run build
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL = 'true'
node tool/local_ranking_validation.mjs
```

Esperar `local-ranking-ready`, `migrations:70` y `optionImagesLocal:true`.
La API queda en `http://127.0.0.1:43187`. Dejar la terminal abierta. El ejecutor
usa entorno aislado, credenciales aleatorias, SMTP inutilizable y cuentas ficticias;
caduca a las dos horas. No modificar el límite ni convertirlo en servicio productivo.
Si un puerto está ocupado, identificar el proceso/sesión antes de actuar; no matar
todos los node/Java ni arrancar varias APIs simultáneas.

**Terminal2, dentro de backend/:** copiar SOLO la ruta de directory que devuelve
el evento anterior; aquí se llama sessionDirectory.

```powershell
$sessionDirectory = '<ruta temporal devuelta por local-ranking-ready>'
$env:SABERPLUS_LOCAL_SESSION = $sessionDirectory
node tool/prepare_editorial_options_local.mjs
notepad (Join-Path $sessionDirectory 'flutter-private.json')
```

Esperar `c2d-fixture-ready`:12 preguntas, cuatro opciones y dos con imágenes.
El manifiesto `editorial-options-fixture.json` contiene tema/subtema/IDs, sin
contraseña. `opcion-azul.png` y `opcion-naranja.png` están en esa misma carpeta
para usar el selector del panel. Repetir el preparador reconoce su manifiesto;
si falla antes de crearlo puede haber cargas parciales: revisar o crear otra
sesión, no declarar rollback ni borrar datos fuera de esta base propia.

**Terminal3, dentro de admin/:** no usar npm run demo.

```powershell
$env:API_BASE_URL = 'http://127.0.0.1:43187'
node server.mjs
```

Abrir `http://127.0.0.1:4173`. Debe indicar API real local, NO DEMOSTRACIÓN LOCAL.
Comprobaciones: `http://127.0.0.1:43187/health/live` y `/health/ready` deben
responder OK; `/health` sin sufijo no existe y devuelve404.

## 6. Usuarios y contraseña: exactamente dónde encontrarlos

**La contraseña NO está ni debe estar en Git.** Abrir con el Bloc de notas
`flutter-private.json` del directorio de ESTA sesión. El valor de
**AUTH_E2E_PASSWORD es la contraseña ficticia compartida por estas cuentas**;
AUTH_E2E_EMAIL identifica student. Introducirla manualmente, no mediante
`adb shell input text`, capturas o logs. No enviar este archivo al compañero de OV-1.

| Dónde / función | Correo de ensayo |
| --- | --- |
| Panel web, ADMIN | `admin@example.invalid` |
| App, estudiante principal | `student@example.invalid` |
| App/segundo cliente, estudiante alternativo | `zero@example.invalid` |
| Tercera cuenta estudiante si se necesita | `absent@example.invalid` |
| Profesor, solo si el ensayo lo requiere | `teacher@example.invalid` |

Todas son cuentas locales creadas verificadas; no registrarlas ni usar recuperación
por correo. Student ya tiene un evento de ranking **sintético** del preparador:
anotar saldo inicial, no atribuir ese XP a una partida real. Zero permite comparar
otra cuenta. Reiniciar sesión/base cambia contraseña e IDs; cerrar la sesión vieja
en app/panel y volver a entrar con los nuevos datos. Si no aparece el archivo,
comprobar que terminó el arranque; no buscar contraseñas de Supabase/Render.

## 7. USB, APK y sesión en Android

El compañero humano necesita hacer las acciones y confirmar lo que ve; Codex
prepara servicios/datos, instala, corta/restaura el túnel y comprueba API/SQL.
Codex no puede declarar aprobada una pantalla que nadie observó.

Conectar un cable de datos, activar depuración USB e instalación por USB si el
fabricante la pide, mantener la pantalla encendida/desbloqueada y aceptar la
autorización RSA. Ejecutar:

```powershell
adb devices -l
adb reverse tcp:43187 tcp:43187
adb reverse --list
```

Debe aparecer device, no unauthorized/offline. Si hay varios, añadir
`adb -s <serial>` a cada orden; no operar el equipo equivocado.
Una lista vacía no es una instalación fallida: revisar cable/permiso/controlador.

Desde Flutter, compilar sin secretos:

```powershell
flutter build apk --debug --no-pub --dart-define=APP_ENV=dev --dart-define=DEMO_MODE=false --dart-define=API_BASE_URL=http://127.0.0.1:43187 --dart-define=CONTENT_BASE_URL=http://127.0.0.1:43187
adb install -r build/app/outputs/flutter-apk/app-debug.apk
```

Esperar Success, abrir SaberPlus y entrar con student. **No integrar
flutter-private.json al APK** con dart-define-from-file: contiene credenciales.
No desinstalar ni limpiar datos por costumbre. La build normal usa
`com.example.saber_plus`; comprobar qué instalación se está usando. El opt-in
Gradle `saberplusValidationApk=true` crea `.i2validation`: si se decide usarlo,
registrar explícitamente la variante y no abrir la otra app por error.
El APK debug no es una entrega de Play Store. La advertencia futura de KGP de
flutter_timezone está registrada; no cambiar dependencias para ocultarla.

## 8. Pruebas pendientes: pasos y aceptación

**Antes de cada bloque:** API disponible, usuario y tema correctos, túnel activo,
capturar solo evidencia sin secretos. Tema del panel: Matemáticas →
«Opciones C2-D - ensayo …» → «Opciones con imágenes». Las dos figuras son azul
horizontal160×80 y naranja vertical80×160; correcta: azul horizontal.
No fiarse de A/B: las opciones pueden estar mezcladas, usar ID/texto/figura.

### D1 — Panel, persistencia y cancelación (pendiente)

1. Entrar como ADMIN, seleccionar tema/subtema y la primera pregunta del fixture.
2. Abrir el selector de imagen de ambas opciones; verificar azul/naranja y texto.
3. Seleccionar el PNG correspondiente desde el directorio temporal y completar
   los metadatos veraces de figura sintética propia que solicite el selector.
   Guardar la pregunta y recargar el registro: conserva asociaciones y versión.
4. En otra opción, abrir el selector y cancelar. Recargar sin guardar:
   no se publica una selección cancelada ni se cambia la respuesta correcta.
5. Comprobar opciones solo de texto y texto obligatorio. Si se quita una imagen
   del formulario y se guarda, debe desvincularse, no borrar bytes referenciados;
   restaurarla para el resto del recorrido. Ante conflicto de versión, conservar
   texto, consultar versión actual y reintentar según el contrato, no sobrescribir.

Aceptar solo si guardado/recarga y cancelación se verifican visualmente y por API.

### D2 — Práctica y selección (pendiente)

1. App student → Practicar → Preguntas aleatorias: Matemáticas, Básico,5 preguntas.
   La sesión tiene otro banco de sumas sin imágenes: avanzar hasta una C2-D;
   si no aparece, no marcar aprobado. Localizar por el tema/subtema cuando el
   flujo lo permita, sin cambiar la selección productiva para forzar el test.
2. Ver azul horizontal y naranja vertical, sin estiramiento, texto siempre visible.
3. Tocar una opción ilustrada: selecciona esa misma opción, no la vecina.
   Conservar IDs para cotejar el envío; no confiar en posición/orden de letras.
4. La pregunta sin contestar no debe revelar correcta/explicación/FK/autoría.
   Codex comprueba la proyección HTTP autenticada sin registrar tokens.

### D3 — Finalizar, revisión, historial y reapertura (pendiente)

1. Enviar al menos una azul correcta y una naranja incorrecta en preguntas C2-D.
2. Finalizar: corrección y explicación corresponden a la opción y figura elegidas.
3. Salir, abrir historial/detalle y reabrir app: mismo intento y resultado;
   imágenes correspondientes. Si el flujo manda errores a cuaderno, comprobarlo.
4. Consultar saldo/eventos antes/después de volver: recuperar o ver historial no
   duplica liquidaciones. Un saldo anterior del fixture no es XP de este ensayo.

No archivar el contenido ni retirar recursos: autorización histórica está fuera.

### D4 — Error de imagen y recuperación sin respuesta accidental (pendiente)

1. Dejar listo un punto que requiera una nueva descarga de imagen; si ya estaba
   decodificada puede seguir visible y eso no prueba fallo. Anotar el estado.
2. Codex retira solo el túnel: `adb reverse --remove tcp:43187`.
   Reabrir una pregunta/imagen no cargada: aviso completo y Reintentar imagen,
   sin «I» recortada, botones accesibles y texto de la opción conservado.
3. Restaurar `adb reverse tcp:43187 tcp:43187`; pulsar Reintentar imagen.
   Vuelve la figura y **no selecciona/envía una respuesta** por tocar el reintento.
4. Verificar también salida del error sin perder intento; ante envío incierto
   consultar estado/reintentar la misma operación, nunca fabricar otro ID para saltarlo.

No confundir corte antes del POST con pérdida de confirmación después de guardar.
Si un subcaso no se ejecutó, declararlo; no inventar un ack perdido.

### D5 — Logout, cuenta alternativa y demo (pendiente)

1. Mostrar opciones privadas, cerrar sesión; Atrás no debe volver a contenido
   protegido de student. Entrar como zero: sin borradores/resultados heredados.
2. Reingresar student: su intento/historial conserva el estado autorizado.
3. Verificar por test automatizado el aislamiento de demo/ausencia de token y
   caché; si se exige confirmación visual demo, compilar una variante aislada
   sin sustituir la app de ensayo ni compartir bytes privados. Anotar qué parte
   fue humana y cuál automática; no afirmar demo física si no se abrió.

### D6 — Pantalla estrecha, texto grande y accesibilidad (pendiente)

1. Aumentar tamaño de texto en Android y repetir pregunta/revisión y aviso de D4.
2. Desplazarse por todas las opciones: texto, imágenes y controles alcanzables;
   sin overflow, clipping, deformación ni área de toque de otra respuesta.
3. Comprobar descripción accesible de imagen/opción y restaurar el tamaño habitual.
   Registrar dispositivo y escala si se conoce; no inventar un valor numérico.

### D7 — Juego con snapshot y reanudación (pendiente)

1. Elegir Cima o Rescate, Matemáticas/Básico; confirmar pregunta C2-D con figuras.
2. Si falta admisión competitiva, habilitar SOLO la sesión sintética por el control
   local documentado, no editar .env de producción ni debilitar guards:
   `'{"action":"solo-on"}' | Set-Content -Encoding ASCII (Join-Path $sessionDirectory 'control.json')`.
   Esperar local-solo-admission enabled:true. Apagar con solo-off al terminar.
3. Responder una vez, salir/reabrir sin desinstalar: mismo intento/snapshot,
   pregunta y figuras; selección/envío pendiente conservado según el contrato.
4. Finalizar y recuperar: mismo resultado y como máximo una liquidación competitiva
   por fuente. Codex compara intento y eventos SQL en la base propia.

La fuente puede contener sumas antiguas sin imágenes: eso no valida C2-D. Si el
azar impide una pregunta ilustrada, preparar un banco sintético aislado por área
en esta sesión con el mismo editor/contrato y documentarlo, no cambiar reglas
del juego, falsificar eventos ni abrir otra base. Registrar si se probó Cima o
Rescate; el otro conserva evidencia automática, no atribuirle otra prueba USB.

### D8 — Otros contratos de juegos: cinco subcasos (regresión D8a pendiente)

| Subcaso | Qué observar / recursos |
| --- | --- |
| D8a Tira local | Abrir juego, elegir Matemáticas/Básico y comprobar pregunta ilustrada, proporción, toque correcto y avance sin mezclar imágenes. No certifica Tira online. |
| D8b Tira online | Dos clientes y cuentas distintas student/zero; iniciar/emparejar según contrato, ambos ven la misma ronda con opciones correctas y sus propias selecciones; reanudar sin duplicación. Requiere segundo teléfono o emulador compatible; configurar el host/túnel de cada uno. No simular presencia con un flag de solo. |
| D8c Batallas | Dos cuentas, crear/unirse con el flujo existente y ver opciones/resultado consistente. Al ser asíncrono se pueden alternar cuentas si el flujo lo permite; si no, segundo cliente. No sustituir la prueba física por un mock HTTP. |
| D8d Trivia Rush | Configurar área que contenga las figuras y una duración admitida; ver opciones ilustradas, responder y avanzar; revisar resultado y recuperación. |
| D8e Fantasma | Usar su entrada propia y récord/ghost permitido; ver opciones, progreso y resultado sin mezclar preguntas/imágenes. Compartir código con Trivia no acredita por sí solo esta pantalla física. |

Registrar por separado datos de admisión, clientes, variante local/online, pregunta
ilustrada y resultado. Si no hay segundo cliente, D8b queda **pendiente**, no
«aprobado porque Tira local funcionó». Preparar el recurso o acordar explícitamente
una reducción de alcance con el propietario. No cerrar C2-D8/8 dejando estos
subcasos sin evidencia o sin una exclusión aceptada.

Son **ocho bloques**, pero D8 contiene cinco subcasos (mínimo12 entradas de
ejecución). El número de toques, repeticiones y pruebas automáticas será mayor.

## 9. Si hay fallos, qué puede modificar este compañero

Puede corregir **Flutter, backend, panel y pruebas de C2**, no solo lo visual.
Primero reproducir, acotar causa y añadir regresión donde corresponda. Cambios
pequeños sobre componentes existentes; no rediseñar toda la app ni las animaciones.
Un fallo de datos/serialización puede requerir backend aunque se vea en la app.
Un fallo de layout puede requerir el componente compartido y sus consumidores.

Conservar texto obligatorio, imágenes opcionales, JSON y snapshots antiguos,
atomicidad/revisionado, permisos y no filtración de soluciones antes de corregir.
No cachear bytes privados globalmente/disco, no enviar tokens a URLs externas,
no abrir buckets ni quitar autenticación, y no cambiar XP/rankings/certificados.
No habilitar flags remotos o productivos. El adaptador actual es development/test.

Fuera de C2: autorización histórica ampliada, bytes PDF/offline, proveedor
persistente, fotos/evidencia privada, cuotas/limpieza/respaldos y C5-D global;
OV-1 y demás etapas. Reportar problemas encontrados fuera de alcance, no arreglarlos
silenciosamente ni declarar toda C5 terminada por cerrar estas pruebas.

## 10. Cómo documentar, guardar y entregar

Después de cada entrada D1–D8/subcaso actualizar el acta C2-D en ambos repos:

```text
Fecha/hora y responsable:
HEAD app/backend y rama:
Sesión propia/dispositivo/usuario ficticio (sin contraseña/token):
Bloque y subcaso, pasos realmente hechos:
Esperado / observado, confirmación humana y evidencia técnica por separado:
Resultado: pendiente / parcial / falló / aprobado:
Error, causa y archivos corregidos; tests repetidos con resultado:
Datos alterados y restaurados, reverse/servicios actuales:
Siguiente paso exacto; restricciones y pendientes:
```

No subir flutter-private.json, owner.json, tokens, DB URL, imágenes privadas,
logs de sesiones o dumps. Capturas sin datos sensibles, solo donde esté autorizado.
El directorio temporal no es evidencia persistente: dejar resumen verificable en
el acta sin secretos. No modificar actas históricas para fingir nuevas pruebas.

Para cada corrección indicar repositorio, ruta de archivos y comentario concreto:

```powershell
git status --short
git diff --check
git diff -- <rutas revisadas>
git add -- <rutas revisadas>
git diff --cached --stat
git diff --cached --check
git commit -m "fix: corregir <fallo concreto> en imagenes de opciones C5-C2"
```

No ejecutar literalmente los marcadores `<...>`. No usar add . por comodidad
ni mezclar cambios OV-1. Un commit por corrección coherente y evidencia, no por
toque. Cierre documental: `docs: cerrar validacion local de imagenes en opciones C5-C2`.
Publicar solo cuando el propietario lo autorice, por repo:

```powershell
git push -u origin fix/c5-c2-timeout-d8b
```

Abrir PR separado por repositorio si hubo cambios, indicando ambos commits/PR,
pruebas, límites y si deben integrarse juntos. No merge/push main/despliegue sin
autorización nueva para su entrega. La autorización de integración del propietario
de hoy no autoriza automáticamente futuros merges del compañero.

### Criterio de cierre completo de C2

- D1–D7 y D8a–e con evidencia; ninguna aprobación inventada. Desviaciones requieren
  acuerdo explícito y se conservan como límites, no desaparecen del acta.
- Fallos corregidos, regresiones afectadas y final aprobadas; informe de omitidas
  y deuda ESLint preexistente, sin declarar calidad global limpia.
- Contratos antiguos, permisos y puntuación conservados; sin activación productiva.
- Actas espejo, README/etapas/relevo actualizados; commits y siguiente paso claros.
- Parar SOLO sus servicios/recursos: en terminal2 puede escribir
  `'{"action":"stop"}' | Set-Content -Encoding ASCII (Join-Path $sessionDirectory 'control.json')`,
  esperar limpieza del runner; Ctrl+C en SU panel; retirar SU reverse USB.
  No detener Docker Desktop completo si hay otros proyectos ni docker prune.
- Entregar resumen de C2 cerrado localmente y pendientes del resto de C5.
  No avanzar automáticamente a OV-1, C5-D productivo u otras etapas.

### Aviso obligatorio a Pavel antes de continuar

Al terminar los trabajos y las pruebas de C2, decir explícitamente a Pavel:

> Pavel, preparé la entrega de C5-C2. Por favor audita y verifica Flutter,
> backend, panel, documentación y evidencias antes de aceptar el cierre
> y decidir la siguiente etapa.

Adjuntar ramas/commits de ambos repositorios, archivos cambiados, pruebas
aprobadas/fallidas/omitidas, pendientes y pasos para reproducir. Si falta un
subcaso, decir «entrega parcial», no «C2 terminada». La autoevaluación del
compañero no sustituye la revisión de Pavel. Esperar su decisión: no intervenir
en OV-1 ni ampliar el trabajo al resto de C5 por iniciativa propia.
