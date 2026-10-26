# C5-C2 — ENTREGA PARCIAL para auditoría de Pavel

**Estado vigente del23/oct: [C5-C2 cerrada localmente y auditada](C5C2_CIERRE_LOCAL.md).**
D1–D8 y D8a–e cubiertos según actas y límites. Entrega funcional integrada y
publicada: app PR #10/`44635ae`, backend PR #12/`9c225cb`.
Los estados/órdenes de ejecución fechados antes de este cierre se conservan como
antecedentes; no reiniciar C2 ni D8b por esas notas. Sin nuevo ensayo físico,
Docker o despliegue en los remates C2.
**Continuación del24/oct:** [H1 cerrada localmente](C5_H1_HISTORIAL_REVOCACION.md),
58/58 SQL/HTTP con Docker y74 migraciones solo temporales. Sigue H2, luego H3
y PDF/offline; resto C5 abierto, sin Android/despliegue y OV-1 separado.

22 de octubre de2026, America/Bogota. Exclusivamente imágenes en opciones.
**7/8 bloques aprobados; D8a/c/d/e aprobados y D8b pendiente por segundo cliente.**
No se declara C2 completa ni se comienza otra etapa. [Acta detallada](C5C2D_VALIDACION_LOCAL.md)
y [procedimiento](RELEVO_C5_C2.md). Documentos espejo en Flutter/docs y backend/docs.

## Repositorios y alcance revisado

Ambos en `fix/c5-c2-validacion`. Bases publicadas utilizadas: Flutter3513b44,
backend8444b9a; se descargaron y revisaron sin retroceder ni trabajar en main.
No se reabrieron PR Flutter#4/backend#7. Sin push, merge, despliegue ni operación
de Render/Supabase. OV-1, sus ramas, código y checkpoint no se tocaron.
El cambio ajeno Flutter/analysis_options.yaml sigue fuera de los commits.

Se leyeron README de ambos repos/API/panel, arquitectura, funcionalidades,
etapas/coordinación y guías C5/C2. No se encontraron AGENTS.md aplicables.
Auditoría acotada: contratos/serializadores/proyecciones de opciones; editor,
versionado y permisos; transporte privado/sesión; snapshots y consumidores;
pruebas/runner y flujos físicos ensayados. No es auditoría de todo el código.
Inventario y comandos iniciales detallados en el acta, sección Auditoría inicial.

Dependencias de ensayo: Docker/PostgreSQL16 propio,70 migraciones temporales,
API local43187/panel real4173 y Android USB CPH2577,360dp/Android15. Node24.21/
npm11.19 difieren de las versiones fijadas; Flutter3.47/Dart3.13. No se modificaron
dependencias, schema, migraciones, arquitectura, permisos ni reglas de XP/ranking/
certificados. Texto obligatorio, imágenes opcionales y contratos antiguos conservados.

## Correcciones localizadas y commits funcionales

| Repo / commit / comentario | Archivos y comportamiento |
| --- | --- |
| Flutter69e48e5 — avanzar opciones ilustradas de Tira local con API real | lib/features/games/tug_of_war/presentation/tug_of_war_page.dart y test/tug_of_war_test.dart: incorporar la siguiente pregunta confirmada por serverState; conservar ronda/CPU/reglas. |
| Flutterdfb05dc — contener imágenes y texto dentro de opciones de Tira local | Mismos archivos: contorno redondeado/padding para contenido ilustrado; geometría real320/412 px y texto1.0/2.0. |
| Flutterc94add3 — ajustar configuración y estadísticas de Batallas a pantallas estrechas | lib/features/battles/presentation/async_battles_page.dart y test/async_battles_test.dart: selectores expandidos y estadísticas adaptables. |
| Flutter02c774c — conservar campo de invitación durante el cierre del diálogo | Mismos archivos: controlador interno del TextField evita dispose prematuro durante la transición de Unirme/Cancelar. |
| Flutter1716e21 — conservar imágenes en la revisión de Batallas | lib/features/battles/presentation/battle_detail_page.dart y test/async_battles_test.dart: AcademicOptionContent en elegida/correcta, sin anticipar soluciones. |
| Flutterc19bd1a — contener texto e imágenes de opciones en Trivia y Fantasma | lib/features/games/trivia_rush/presentation/trivia_rush_page.dart y test/trivia_option_bounds_test.dart: contorno de radio16, ocho regresiones geométricas de ambos modos. |
| Backend8decfc5 — esperar recarga del panel al validar opciones | backend/test/editorial-files-postgres.test.cjs: esperar banco habilitado tras recarga asíncrona, sin modificar runtime. |
| Backend53b88fb — mostrar confirmación junto a Guardar en panel | admin/public/index.html, admin/public/question-editor.mjs y admin/test/question-editor.test.mjs: aviso visible junto al botón; conservar anuncio accesible único. |
| Backendf89502e — distinguir confirmación real y demo | Editor/test anteriores: coletilla de demostración solo en api.demo. Persistencia real ya funcionaba. |

Fallos reproducidos antes de corregir: avance remoto de Tira; cuatro contornos
de Tira; tres anchos del diálogo; dos cierres con router/controlador; dos revisiones
ilustradas de Batallas; ocho contornos Trivia/Fantasma. El acta registra también
fallos de preparación de tests y repeticiones, sin contarlos como aprobación.

## Resultado humano y evidencia técnica

| Prueba | Resultado / alcance |
| --- | --- |
| D1 Panel | Aprobado: selección, cancelación, texto obligatorio, guardado/recarga y asociación de cada figura. Avisos corregidos y observados. |
| D2 Práctica | Aprobado: figuras/proporciones y selección correcta. |
| D3 Corrección/historial | Aprobado: correcta/incorrecta, explicación, historial y persistencia al reabrir. |
| D4 Red | Aprobado: fallo al descargar antes de POST, reintentar/restaurar sin selección ni respuestas accidentales. Confirmación perdida después de POST no ensayada. |
| D5 Sesión | Aprobado: logout, Back, cuentas student/zero y borradores propios; demo/sin token comprobados automáticamente, sin demo física. |
| D6 Accesibilidad | Aprobado a escala2.0 y vuelta a1.0: sin recortes, botones de reintento alcanzables. Semántica Android automática; sin TalkBack humano. |
| D7 Snapshot | Aprobado en Cima: reinicio/recuperación, resultado y liquidación única100 XP. Rescate conserva evidencia automática. |
| D8a Tira local | Aprobado tras corregir avance y borde. CPU local; preguntas/evaluación API. No certifica funcionamiento totalmente desconectado. |
| D8b Tira online | **Pendiente/no ejecutado:** humano solo dispone del teléfono conectado; requiere segundo cliente. Sin aprobación simulada ni exclusión acordada. |
| D8c Batallas | Aprobado: invitación/unión real, cuentas alternadas, ocho preguntas/cuenta y recuperación de revisión ilustrada. Student50/zero25 XP, fechas y16 respuestas sin duplicar. Tras arreglo de transición, Cancelar en USB y Unirme en widget; no segunda unión física. Incorrecta revisada automáticamente. |
| D8d Trivia | Aprobado: doce ilustradas,3200 puntos/12 correctas, botones corregidos y recuperación desde segundo plano. No se certifica restauración tras matar proceso. |
| D8e Fantasma | Aprobado desde su entrada propia, opciones/progreso/resultado:3200 puntos/combo12/12 correctas. Flujo legado, sin certificar admisión/presencia competitiva Ghost. |

Última sesión1282b217: Trivia62162133… y Fantasma6f1960ea… FINALIZADOS,
12 respuestas cada uno, asistido:false/modalidad:null; XP académico0 de ambas
cuentas, ledger solo evento sintético inicial. Las evidencias de otras sesiones
no se importaron ni se perdieron del acta al recrear la base.

Observación fuera del arreglo C2: Fantasma muestra «Venciste a tu fantasma» con
empate3200/12/12 porque la selección existente desempata por fecha más reciente.
No se presenta como mejora de puntos ni se cambian esas reglas/textos aquí.

## Comandos ejecutados y validación

Además de git status/fetch/switch/pull iniciales, se usaron diffs, commits
específicos, comprobaciones SQL de la base propia y las órdenes del relevo:

```powershell
# Backend/API y banco: solo sesión desechable propia
npm ci --include=dev --no-audit --no-fund
npm run build
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL = 'true'
node tool/local_ranking_validation.mjs
$env:SABERPLUS_LOCAL_SESSION = '<directorio de esta sesión>'
node tool/prepare_editorial_options_local.mjs
# Panel real, desde admin/
$env:API_BASE_URL = 'http://127.0.0.1:43187'
node server.mjs
# Flutter: análisis, regresión y APK sin credenciales
flutter analyze --no-pub
flutter test --no-pub --concurrency=2
flutter build apk --debug --no-pub --dart-define=APP_ENV=dev --dart-define=DEMO_MODE=false --dart-define=API_BASE_URL=http://127.0.0.1:43187 --dart-define=CONTENT_BASE_URL=http://127.0.0.1:43187
# Android: dispositivo autorizado, datos conservados
adb -s NFWKHYIZKVLF8LKJ install -r build/app/outputs/flutter-apk/app-debug.apk
```

Los marcadores no se ejecutan literalmente. Claves solo en flutter-private.json
temporal, introducidas manualmente; sin tokens, contraseñas o datos privados en
Git/APK. Primer npm ci falló por CA; se resolvió con certificados del sistema,
sin desactivar TLS. No se repiten aprobadas sin cambios/regresión concreta.

| Control automático | Resultado |
| --- | --- |
| Flutter final c19bd1a | **992 aprobadas/16 opt-in omitidas, cero fallidas**,4min27s. Log ignorado output/c5-c2-entrega-regresion-flutter.log. |
| Flutter dirigido último arreglo | 36/36, incluidos ocho contornos Trivia/Fantasma; análisis sin incidencias, build debug aprobado43,7s; adb install Success y apertura OK/COLD. |
| Flutter completo previo1716e21 | 984 aprobadas/16 opt-in omitidas, cero fallidas. No se atribuye al último arreglo. |
| Panel actual | 132/132 y sintaxis28 módulos aprobadas tras correcciones; sin cambios posteriores de runtime. |
| Backend | 128 suites/1675 aprobadas, build aprobado. Sin cambios runtime API en esta continuación; build repetido al remontar. |
| PostgreSQL/HTTP/Chromium | 44/44,70 migraciones solo propias, escritorio/390 px; repetidas tras ajuste de feedback. |
| ESLint | Deuda previa27 incidencias documentadas en C2-C; no declarar lint global limpio ni ejecutar --fix. |

Las16 opt-in requieren credenciales AUTH_E2E, fixtures/supervisor propio de API,
entorno staging o captura explícita no habilitados en la orden global; no cuentan
aprobadas. No se habilitó staging para reducir ese contador. Documentación:
ocho espejos idénticos,263 enlaces locales en14 archivos sin destinos ausentes,
git diff --check limpio en ambos repositorios.

Logs, receipts JSON y registros privados ignorados en output/ no son entregables.
El acta guarda resultados, IDs, límites y confirmaciones sin secretos. No se
publican dumps, imágenes privadas, owner.json ni flutter-private.json.

## Pendientes y siguiente paso exacto

1. Pavel audita código, panel, documentación y evidencia de ambos repositorios.
2. Preparar segundo Android o emulador compatible para D8b; sesión propia nueva
   según relevo, student/zero, túnel/host de cada cliente. Emparejar Tira online,
   misma pregunta ilustrada/opciones, selección propia y reanudación sin duplicar.
   Actualizar actas tras cada paso; no repetir D1–D7/D8a/c/d/e sin motivo concreto.
3. Tras D8b aprobado, solicitar aceptación de Pavel para cerrar C2. Resto de C5,
   autorización histórica/PDF/offline/evidencias y OV-1 siguen fuera del encargo.
4. Publicar solo con autorización de Pavel, mediante PR nuevo por repo afectado.
   No reabrir los PR antiguos ni fusionar/desplegar por iniciativa propia.

Comandos de push **preparados, no ejecutados**:

```powershell
git -C C:\Users\modaf\saber_plus push -u origin fix/c5-c2-validacion
git -C C:\Users\modaf\SaberPlus-Backend push -u origin fix/c5-c2-validacion
```

Título propuesto en cada PR: `C5-C2: correcciones y validación local parcial de imágenes en opciones`.
Incluir ambos HEAD finales, esta acta, controles y D8b pendiente. Los commits
documentales finales se consultan con git log -1 en cada rama; sus hashes se
entregan a Pavel al terminar, sin reescribir commits funcionales.

Sesión propia1282b217 cerrada mediante action:stop tras comprobar dueño/ruta/
Docker local y etiqueta. El runner confirmó retirada de API/PostgreSQL/directorio;
se comprobó API43187 sin listener, carpeta y contenedor propios ausentes. Ya no
hay contraseña activa de esta sesión. El panel heredado4173/PID7108 sigue abierto
sin API; el túnel USB43187 permanece para retirada manual. Comando preparado:

```powershell
adb -s NFWKHYIZKVLF8LKJ reverse --remove tcp:43187
```

No se reintentó esa mutación adb por el rechazo previo. Para D8b hay que montar
una sesión nueva con contraseña nueva, además del segundo cliente.

Limpieza histórica pendiente: el control automático rechazó borrar contenedor
5548e14c…/su directorio («blocked by policy»); recursos conservados y sin reutilizar.
Al remontar volvió a rechazar el comando combinado de health/reverse/apertura;
se hicieron solo comprobaciones de lectura y luego el túnel apareció activo.
No se eludieron los rechazos reintentando esas mutaciones por otro medio.

Pavel, preparé la entrega de C5-C2. Por favor audita y verifica Flutter,
backend, panel, documentación y evidencias antes de aceptar el cierre
y decidir la siguiente etapa.
