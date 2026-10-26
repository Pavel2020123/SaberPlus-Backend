# C5-C1 — Lectura de imágenes editoriales en Flutter

**Estado vigente del23/oct: [C5-C2 cerrada localmente y auditada](C5C2_CIERRE_LOCAL.md).**
D1–D8 y D8a–e cubiertos según actas y límites. Entrega funcional integrada y
publicada: app PR #10/`44635ae`, backend PR #12/`9c225cb`.
Los estados/órdenes de ejecución fechados antes de este cierre se conservan como
antecedentes; no reiniciar C2 ni D8b por esas notas. Sin nuevo ensayo físico,
Docker o despliegue en los remates C2.
**Continuación del24/oct:** [H1 cerrada localmente](C5_H1_HISTORIAL_REVOCACION.md),
58/58 SQL/HTTP con Docker y74 migraciones solo temporales. Sigue H2, luego H3
y PDF/offline; resto C5 abierto, sin Android/despliegue y OV-1 separado.

## Reanudación del 21 de octubre de 2026

Preparación realizada: Docker Linux activo, PostgreSQL temporal propio nuevo con
69 migraciones, API loopback43187 y panel4173 levantados; no se reutilizó la base
de la sesión anterior ni se leyó un .env remoto. Fixture publicado por la API
real: tema «Imágenes C5 - ensayo e55be94d», subtema «Rectángulos y proporciones».
La comprobación Flutter VM/HTTP/PostgreSQL se repitió: **3/3 aprobadas**.

Celular Android detectado y autorizado; reverse USB43187 configurado, APK debug
del cierre C1 instalada con éxito y aplicación abierta. No se borraron sus datos.
Esto actualiza el estado «no instalada» del cierre del20 inferior.
**Ensayo humano:5/5 aprobadas; C5-C1 cerrada en su alcance local**:
el propietario inició sesión y confirmó el caso1,
rectángulo azul horizontal2:1, sin recorte/estiramiento y con el texto de la lección.
Caso2 confirmado: imagen correcta durante la práctica; tras pulsar Finalizar,
«2 veces» marcada correcta y explicación120÷60=2 visibles. No se verificó por SQL
una concesión o persistencia adicional en este caso; no inferirla del resultado.
Caso3: se volvió primero a la lista de subtemas; se retiró solo el reverse USB
tcp:43187 para provocar una descarga fallida, comprobar el aviso y restaurarlo
antes del reintento. El propietario confirmó estar en la lista de subtemas;
se retiró el reverse tcp:43187 y se comprobó su ausencia. Docker conserva la base
propia activa; no se apagó la API ni se cambiaron datos. La captura correcta del
propietario muestra el aviso de imagen y Reintentar, pero la primera «I» recortada.
Se restauró el reverse para recompilar/reinstalar sin perder acceso a la sesión;
se repitió el corte con la APK corregida. El propietario confirmó el aviso completo
y, tras restaurar reverse y pulsar Reintentar imagen, el rectángulo azul volvió sin
salir ni reiniciar la app. Caso3 aprobado. Caso4 parcial: el propietario confirmó
que Cerrar sesión lleva al login y Atrás no permite volver a la lección privada.
El propietario inició sesión de nuevo en la cuenta ficticia y confirmó el rectángulo
azul en la lección. Caso4 aprobado dentro del alcance de logout/reingreso humano;
el aislamiento de tokens/caché conserva su evidencia automática, no una nueva
inspección forense del dispositivo. DEMO_MODE=false, sin ensayo humano demo.
Caso5 confirmado: con texto ampliado, salir y reabrir la lección conserva la figura
horizontal y permite leer textos/botones sin recortes ni desbordes. Se indicó
restaurar el tamaño habitual después; no se verificó un valor numérico de escala
ni se afirma que el usuario haya restaurado ya su ajuste.
Entrega A/B/C1 guardada en app `af73039` y backend `0bfaaba`; push posterior
confirmado hasta app `c69a5e9` y backend `e1c4d18`, incluyendo C2-A/B.
Continuación: [C5-C2-C](C5C2C_CONSUMIDORES.md) validada automáticamente;
sigue C2-D Android. C2-C posteriormente guardada e integrada en main local
según [relevo](RELEVO_C5_C2.md), sin push nuevo ni despliegue.
La carga por opción está preparada pero apagada por defecto. No se repitió el
guion Android de C1 ni se validó todavía C2 en el celular.
La confirmación es humana, no otra prueba automática. Credenciales nuevas solo
en el archivo privado temporal; no añadir claves a esta acta ni a los defines.

La entrega A/B/C1 quedó guardada en esos commits funcionales locales de ambos repos.
El commit documental móvil52a3488 anterior ya se publicó, pero no incluía el código
funcional C5; el push funcional posterior se registra arriba. No hubo merge a main
ni despliegue. Las afirmaciones inferiores sobre ausencia de commit/push
corresponden al cierre original del20.
OV-1 sigue independiente. Conservar el límite de dos horas del ejecutor local.

## Corrección visual durante el caso3 — 21 de octubre

Causa verificada en código: ClipRRect de la lección envolvía AcademicImage completo,
incluyendo el texto de error, y recortaba su esquina superior izquierda.
La corrección traslada el borderRadius al componente compartido y aplica ClipRRect
solo a RawImage/píxeles de la imagen pública decodificada. Los estados de carga,
dirección inválida, error y Reintentar quedan fuera del recorte.
Retiradas las envolturas equivalentes en lección, práctica, diagnóstico, batallas
y Tira y afloja. No se cambiaron permisos, API, proporciones ni reglas de juego.

Regresión dirigida: **57/57 aprobadas** (31 de imagen, incluidas las30 previas,
y26 de práctica/diagnóstico/batallas/Tira). Nueva prueba320px, texto1.6× y aviso
sin ancestro ClipRRect; la prueba de éxito exige mantener radio16 y proporción120×60.
Flutter analyze sin incidencias. La regresión global950 inferior corresponde al20;
no se ha repetido toda ni se infiere un nuevo total a partir de este arreglo.
APK debug corregida compilada e instalada con adb install -r (Success), sin borrar
datos, y aplicación abierta con am start (Status:ok). Se conserva reverse USB43187
restaurado para recuperar la sesión. El propietario volvió a la lista sin abrir
la lección; se retiró de nuevo reverse USB43187 y se comprobó que Docker seguía
activo. El propietario abrió la lección y confirmó el aviso corregido, con la palabra
«Imagen» completa y Reintentar visible. Se restauró reverse USB43187 y se verificó
su presencia. El propietario pulsó Reintentar imagen y confirmó que reapareció
el rectángulo azul sin salir/reiniciar. Caso3 aprobado; contador3/5.

## Checkpoint del 20 de octubre de 2026

**Implementación online y controles automáticos locales aprobados; ensayo Android pendiente.**
Rama `feat/c5-archivos-base` en los dos repositorios. No se hizo commit, push,
merge, despliegue ni SQL remoto. OV-1 del compañero no se modificó.
Contrato global: [C5 — archivos](C5_ARCHIVOS.md). Antecedente: [panel C5-B](C5B_PANEL.md).

C1 es una subdivisión de C5-C, no el cierre de toda C5. La revisión física
posterior del21 quedó aprobada5/5 según el checkpoint superior. Continúan imágenes
en opciones, PDF/offline, autorización histórica y fotos/evidencias con contratos
propios; finalmente C5-D y proveedor persistente autorizado.

## Implementación

- `lib/core/media/editorial_image_reference.dart`: referencia relativa UUID4
  estricta `/recursos/editoriales/:id`. No acepta URLs externas, query, fragmento
  ni rutas ADMIN como referencias autenticadas.
- `remote_editorial_image_repository.dart`: usa el cliente Dio y la sesión
  existentes, sin redirecciones, respuesta WEBP y máximo2 MiB comprobado también
  mientras recibe el stream. Plazo total30 segundos y cierre del transporte al
  terminar o rechazar una descarga. No descarga contenido arbitrario con Bearer.
- `lib/core/widgets/academic_image.dart`: carga, error legible y reintento
  explícito, sin recortar ni estirar la imagen. Comprueba dimensiones hasta2560
  por2560 y una sola imagen estática antes de mostrarla.
- Las imágenes gestionadas se decodifican a `ui.Image` y usan `RawImage`:
  no se introducen en ImageCache global ni en disco. El proveedor autoDispose
  cancela solicitudes y libera la imagen; logout/cambio de cuenta invalida
  respuestas y evita mostrar los datos anteriores durante una recarga.
  La copia de render se libera cuando sale el widget.
- Los enlaces públicos anteriores conservan su ruta de recursos y nunca reciben
  los headers de sesión. HTTPS obligatorio fuera de desarrollo.
- Consumidores migrados: lección y Markdown, práctica/caso, diagnóstico, batallas,
  Guardián, Cima, Rescate y Tira y afloja. Trivia Rush y Fantasma ahora muestran
  imagen y contexto recibidos del contrato existente, sin duplicar la misma figura.
  No se cambiaron puntuaciones, respuestas, tiempos, XP ni reglas competitivas.

El estado de error avisa que no se debe contestar sin el contexto visual.
No promete recuperar imágenes históricas todavía: la ruta del backend sigue
exigiendo uso publicado, según B. Una pregunta archivada puede necesitar otro
contrato de autorización para su intento anterior; eso queda pendiente en C5-C.

## Validación automática realizada

- `flutter analyze --no-pub`: aprobado antes de la comprobación final.
- **30/30 controles nuevos** en `test/editorial_image_test.dart`: contrato,
  sesión, MIME/firma/límites, HTTP302/401/403/404/503, exceso durante streaming,
  cambio de sesión, proporción120×60, ausencia de ImageCache privado, reintento
  y retirada de la imagen al cerrar sesión. Son pruebas de repositorio/widget,
  no gestos de un Android físico.
- **3/3 pruebas Flutter VM ↔ HTTP ↔ PostgreSQL real** en
  `test/editorial_image_local_api_test.dart`: práctica entrega la referencia,
  descarga/decodificación WEBP120×60, recurso sin publicar404 y anónimo401
  (lectura publicada y decodificación forman el primer caso).
- **20/20 controles Node** del entorno local repetidos y aprobados.
- Regresión completa Flutter: **950 aprobadas/13 opt-in omitidas**, sin fallos.
  La nueva suite opt-in C1 se añadió durante ese recorrido y se comprobó después
  por separado3/3 con API real. Sin variable de sesión se verificó su omisión3/3.
- Comprobación final dirigida tras el ajuste que evita duplicar la imagen de
  contexto en Trivia: **32 aprobadas/3 opt-in omitidas** (30 C1 y2 Trivia).
- Análisis final sin incidencias. **APK debug compilada correctamente** con
  los cuatro defines públicos del comando inferior, sin credenciales de pruebas
  en la configuración de compilación final. No instalada ni validada en Android.
  Gradle avisa de compatibilidad futura de flutter_timezone/KGP; no bloqueó el
  build ni se actualizaron dependencias por este aviso.

La primera ejecución dirigida apuntó a un nombre de suite inexistente; los53
casos existentes pasaron, pero ese comando no se considera una regresión aprobada.
Se lanzó después la regresión completa. La primera prueba HTTP de C1 detectó el
HttpClient simulado por el widget binding; el ensayo opt-in ahora deliberadamente
no crea ese binding y sí accede a la API loopback real.
El control de exceso detectó que cancelar solo el stream de salida no bastaba
para cerrar la fuente HTTP de Dio; se corrigió cancelando el token propio de
cada descarga y se repitió la suite30/30.

## Entorno local y reproducción

Se reutiliza `backend/tool/local_ranking_validation.mjs`, que crea una base
Docker local propia y desechable y una API completa en `127.0.0.1:43187`.
Su allowlist incorpora explícitamente las dos migraciones nuevas C5-A/B;
se aplicaron69 migraciones únicamente a esa base temporal. La bandera de
archivos se activa solo dentro del proceso local de pruebas. No lee `.env`.
El panel real usa `http://127.0.0.1:4173` y esa API, no el modo DEMO.

Nuevo preparador `backend/tool/prepare_editorial_images_local.mjs`:
verifica ruta temporal, marcador, URL loopback, contexto Docker local y etiqueta
del contenedor. Crea por las APIs reales del panel un rectángulo sintético,
una lección y una pregunta publicadas; deja otra imagen sin asociar.
No copia contenido académico real ni asigna XP. Un manifiesto con el nonce
evita duplicar los datos al repetirlo en la misma sesión.

Desde `SaberPlus-Backend/backend`, después de levantar el ejecutor:

```powershell
# Usar exactamente el directorio que informó el ejecutor de ESTA sesión.
$env:SABERPLUS_LOCAL_SESSION = 'DIRECTORIO_TEMPORAL_PROPIO'
node tool/prepare_editorial_images_local.mjs
```

Desde `saber_plus`, con la misma variable de entorno:

```powershell
flutter test test/editorial_image_local_api_test.dart --no-pub
```

Sin variable local, los3 casos se omiten expresamente. Nunca introducir una URL
remota o una contraseña como argumento. La suite usa una cuenta ficticia
separada (`absent@example.invalid`), no la del alumno del ensayo humano.
El manifiesto `editorial-images-fixture.json` y las credenciales están solo en
el directorio temporal, fuera de Git. La sesión tiene límite de dos horas:
si finaliza, levantar otra y preparar nuevamente el fixture, sin reutilizar claves.

Para compilar una APK local, usar solo configuración pública, no incluir
`AUTH_E2E_PASSWORD` ni todo el archivo privado de pruebas en los defines:

```powershell
flutter build apk --debug --no-pub --dart-define=APP_ENV=dev --dart-define=DEMO_MODE=false --dart-define=API_BASE_URL=http://127.0.0.1:43187 --dart-define=CONTENT_BASE_URL=http://127.0.0.1:43187
```

Es APK de ensayo local, no una versión lista para tienda. Con celular por USB,
se necesita `adb reverse tcp:43187 tcp:43187` para acceder a loopback del PC.
Instalar después de avisar al propietario; no confundir la instalación con la
confirmación humana de los cinco casos.

## Guion de cinco comprobaciones Android

1. Entrar con el alumno ficticio de la sesión; Estudiar → Matemáticas →
   tema «Imágenes C5 - ensayo …» → «Rectángulos y proporciones».
   Ver el rectángulo horizontal2:1 y el texto, sin recorte ni estiramiento.
2. Practicar ese subtema: ver la misma figura y responder «2 veces».
   Confirmar feedback y explicación normales; no cambiar reglas ni premiar fixtures.
3. Abrir de nuevo la pantalla sin conexión al PC/API: aviso visible, sin figura
   de otra pantalla; restaurar conexión y pulsar Reintentar imagen.
   No exigir reiniciar la app. Registrar exactamente cómo se cortó y restauró.
4. Cerrar sesión: no debe quedar la imagen privada visible ni ser accesible
   regresando a la pantalla anterior. Volver a iniciar sesión en la cuenta de
   ensayo y comprobar la figura desde la API. La APK actual usa DEMO_MODE=false:
   no se exige una entrada demo inexistente. Su bloqueo de descarga privada está
   cubierto automáticamente; no declararlo ensayado manualmente en esta APK.
5. Salir/volver y reabrir la lección con API activa: proporción conservada,
   controles legibles con texto grande y sin desbordes. Esto no valida un
   reinicio/despliegue remoto ni almacenamiento productivo.

Estado humano actual: **5/5 aprobadas**, casos1–5 confirmados por el propietario
el21 de octubre de2026 en la sesión de ensayo e55be94d. Cierre acotado a imagen
de lección/práctica, recuperación de conexión, logout/reingreso y reapertura con
texto ampliado. No equivale a validar todas las pantallas, iOS o producción.
Los juegos migrados tienen regresión automatizada, pero este guion acotado no
los certifica uno a uno en Android. Ampliar su recorrido en integración C5-D.

## Pendientes de C5

- Imágenes en opciones: base, panel y consumidores C2-A/B/C validados
  automáticamente. Sigue C2-D Android; no cerrar por las pruebas automáticas.
  [Checkpoint independiente C2](C5C2_OPCIONES.md).
- PDF/offline, derechos/retención del archivo descargado y autorización de imágenes
  en intentos históricos. No guardar bytes privados globalmente por este bloque.
- Fotos de perfil y evidencias institucionales privadas, con límites y permisos
  propios; nunca reutilizar una imagen editorial publicada para evidencia privada.
- Biblioteca, limpieza/huérfanos, cuotas, respaldos, proveedor persistente y operación.
- Conciliar archivos compartidos con OV-1 antes de PR/merge. CI remoto y despliegue
  permanecen pendientes. Mantener separados implementación, automático y humano.
