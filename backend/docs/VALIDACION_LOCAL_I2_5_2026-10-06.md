# Validación local I2-5 — 6 de octubre de 2026

## Dictamen

**I2-5 permanece abierto.** La regresión competitiva completa sí se ejecutó en
este PC: **347/347 pruebas, 25 archivos**, sin omisiones, cancelaciones ni
resúmenes incompletos. Las 12 pruebas dirigidas también pasan. Esto sustituye
el bloqueo de infraestructura del PC anterior, no acredita producción.

Login y ranking se comprobaron con repositorios Flutter, API Nest real y
PostgreSQL desechable. No equivale a completar navegación y observación humana
en Android. B1/B2, P5/D3, despliegue y activación siguen separados y pendientes.
No se cambiaron reglas de XP, empates, ayudas, abandono, certificados ni insignias.

## Equipo y fuentes de evidencia

| Dato | Valor observado |
| --- | --- |
| SO | Windows 11 Home Single Language, 10.0.26200 |
| Memoria física | 16.153.124 KiB; libre inicial 4.095.496 KiB |
| Disco C inicial | 777.817.726.976 bytes libres |
| Disco C al cierre | 757.649.297.408 bytes libres; reducción medida 20.168.429.568 bytes |
| Memoria libre al cierre | 3.998.820 KiB |
| Flutter | 3.47.0 estable, revisión 4cf2416426; Dart 3.13.0 |
| Node/npm usados | 24.14.1 / 11.11.0 portables; sistema 24.21.0 / 11.19.0 |
| Docker | desktop-linux local, endpoint npipe, motor Linux 29.7.2 |
| PostgreSQL | Docker postgres:16; runner nativo portable 16.15 |
| Android | Inicialmente 24117RN76L; en la reanudación CPH2577, Android 15 |
| Apple/iOS | No disponible; NO EJECUTADO |

Repositorios independientes, ambos en `main`, sin fetch, merge, commit ni push:

- Flutter: `C:\Users\modaf\saber_plus`, HEAD
  `f55a8f82c209cc95bfcfdf3ed012a5e17529e897`.
- Backend/panel: `C:\Users\modaf\SaberPlus-Backend`, HEAD
  `11b3647e66ed078cf8dd83fb7450a647b392218a`.
- Remotos: `https://github.com/Pavel2020123/saber_plus.git` y
  `https://github.com/Pavel2020123/SaberPlus-Backend.git`.

Flutter ya tenía cambios en `analysis_options.yaml` (exclusiones de plataformas);
se preservaron. Backend estaba limpio. No se encontró AGENTS.md aplicable.
El análisis Flutter se ejecutó con esas exclusiones, no con otra configuración.

Los tiempos son segundos de reloj del comando completo, no sumas de tiempos
individuales. Suspensión/presión de recursos puede aumentarlos. La evidencia
sanitizada [resultados.json](validacion-local-2026-10-06/resultados.json) conserva
comando, exit y duración de intentos fallidos y repeticiones, además de los
resúmenes PostgreSQL. No incorpora cuerpos HTTP, credenciales ni logs completos.

## Matriz por módulo y nivel

| Módulo / nivel | Estado | Evidencia y límite |
| --- | --- | --- |
| Flutter estático | APROBADO | pub get con lock, analyze sin incidencias |
| Flutter unit/widget | APROBADO | Base 694 pass/4 skip; final 694 pass/9 skip, sin modificar expectativas |
| Backend build/Jest | APROBADO | 1.258/1.258, 111 suites |
| Backend lint | FALLÓ | 567 errores, 150 avisos; revisión sin --fix |
| Dependencias | FALLÓ | audit completo 13 paquetes afectados; producción 1 critical |
| Panel sintaxis | APROBADO | 22 módulos |
| Panel npm test predeterminado | FALLÓ | Tres ejecuciones: 78, 74 y 73 aprobadas de 88 |
| Panel serial explícito | APROBADO | 88/88; no elimina el fallo de concurrencia predeterminada |
| Competición PostgreSQL completa | APROBADO | 347/347, 25 archivos; Linux y restauración incluidos |
| Ranking PostgreSQL dirigido | APROBADO | 12/12 tras preparación de imagen |
| Editorial PostgreSQL | APROBADO | 13/13, publicación, historial, concurrencia, borrado permitido |
| Prioridades docentes PostgreSQL | APROBADO | 13/13 |
| Tiempo de estudio PostgreSQL | APROBADO | 11/11 |
| Aprobación institucional PostgreSQL | APROBADO | 13/13 |
| Cima PostgreSQL | APROBADO | 16/16 |
| Rescate PostgreSQL | APROBADO | 20/20 |
| Cobertura PostgreSQL | APROBADO | 4/4 |
| Mapa PostgreSQL | APROBADO | Repetición 7/7; primer intento fallido conservado, sin resumen |
| Repaso diferido PostgreSQL | APROBADO | 5/5; no sustituye recorrido de pantalla |
| Login/ranking Flutter HTTP real | APROBADO | 6/6 iniciales (auth + ranking), 5/5 tras corrección |
| Panel cliente HTTP/API real | APROBADO | 2/2 y repetición 2/2; ADMIN y profesor reales |
| Panel navegador local | APROBADO | Login ADMIN, jerarquía, pestañas preguntas/mapa, logout observados |
| Certificados render | APROBADO | 7 PDF: cinco áreas, curso y nombre largo |
| Certificados recorrido humano | NO EJECUTADO | No descarga/impresión física; reglas y áreas vacías cubiertas unitariamente |
| Android compilación/instalación | APROBADO | APK debug separada; instalación adb Success |
| Android navegación/manual completa | BLOQUEADO | Teléfono bloqueado al retomar; no dar por aprobada sin observación |
| Juegos/audio físicos | NO EJECUTADO | No inferirlos de tests de motores o fixtures |
| Diagnóstico/estudio API live completo | NO EJECUTADO | Suites opt-in sin banco local completo preparado |
| iOS | NO EJECUTADO | Requiere equipo Apple |

## Comandos principales

Todos en el directorio correspondiente, con Node/npm exactos en PATH. Las rutas
absolutas de herramientas y tiempos completos de cada intento están normalizados
en el JSON adjunto. No ejecutar `npm run lint`: incluye `--fix`.

| Directorio | Comando | Exit | Pruebas / duración |
| --- | --- | --- | --- |
| Flutter | `flutter pub get --enforce-lockfile` | 0 | 7,466 s |
| Flutter | `flutter analyze --no-pub` | 0 | 20,416 s; repetición también correcta |
| Flutter | `flutter test --no-pub --reporter expanded` | 0 | Base 694 pass, 4 skip; 199,659 s |
| Flutter | Mismo comando, repetición tras añadir test opt-in | 0 | 694 pass, 9 skip; 129,594 s |
| backend | `npm ci` con `NODE_OPTIONS=--use-system-ca` | 0 | 426,910 s |
| backend | `npm run build` | 0 | 75,580 s |
| backend | `npm test -- --runInBand` | 0 | 1.258; 133,714 s |
| backend | `node node_modules/eslint/bin/eslint.js "{src,apps,libs,test}/**/*.ts" --format json` | 1 | 567 errores/150 avisos |
| backend | `npm audit --json` | 1 | 7 moderate, 5 high, 1 critical |
| backend | `npm audit --omit=dev --json` | 1 | 1 critical |
| admin | `npm run check` | 0 | 22 módulos; 4,387 s |
| admin | `npm test` | 1 | 78/88; 373,762 s; dos repeticiones fallidas |
| admin | `node --test --test-concurrency=1 test/*.test.mjs` | 0 | 88/88; 11,350 s |
| backend | `node tool/test_competitive_postgres.mjs --ranking` | 0 | Final 12/12; 28,644 s |
| backend | `node tool/test_competitive_postgres.mjs` | 0 | 347/347; 1.302,396 s |
| backend | `node --test tool/test_editorial_postgres.test.mjs` | 0 | 11/11 controles del runner; 0,559 s |
| backend | `node tool/preview_course_certificate.cjs` | 0 | 7 PDFs; 22,508 s |
| backend | `node --test tool/test_local_panel.mjs` | 0 | 2/2; 2,760 s; repetición 2,621 s |
| Flutter | `flutter build apk --debug --no-pub` con defines locales | 0 | 8.702,907 s totales; Gradle informa 4.684,9 s |

Runner nativo: `EDITORIAL_PG_BIN` apunta únicamente al portable del ensayo.
Ejecutar `node tool/test_editorial_postgres.mjs` sin argumento y con cada modo
`--teacher-priorities`, `--study-time`, `--institution-approval`, `--summit`,
`--star-rescue`, `--coverage`, `--learning-map`, `--deferred-review`.
Los nueve modos aprobados suman **102 pruebas**, incluido mapa 7/7 en la
repetición (exit 0, 98,184 s). Se conservan ambos intentos en evidencia.
Se aplicaron los SQL de **61 migraciones versionadas** en cada instancia propia;
no se usó db push ni historia ficticia de Prisma. El runner competitivo sí usa
Prisma migrate deploy. Restauración de esquema y poblada: PASS, 76 tablas,
igualdad de datos, RLS, restricciones, índices, funciones, secuencias y ACL.
Esto no certifica durabilidad o respaldo productivo.

## Integración real y fixtures

Ver [procedimiento reproducible](../tool/LOCAL_RANKING_VALIDATION.md).
Se añadió un supervisor local que crea PostgreSQL Docker con tmpfs y puerto
loopback, verifica propiedad y aplica migraciones de HEAD. Inicia AppModule
con Prisma, bcrypt, login JWT, guards y ValidationPipe reales. Su entry point
es exclusivo del ensayo: no acredita todo el bootstrap de main.ts. El runner
Linux completo comprueba por separado el arranque real.

SMTP apunta a loopback:1; no se cargan `.env` ni bases existentes. La publicación
editorial se habilita solo en esta API desechable. Flags competitivos apagados.
Cuentas ficticias verificadas estudiante/cero/sin balance/profesor/ADMIN,
contraseña aleatoria y secretos efímeros. No se firman tokens desde los tests.

Las 5 pruebas nuevas de Flutter comprueban login real, TOP 50, propio 51 entre
61, XP cero, ausencia de balance, juego/año, vacío, Memoria/Batallas no disponibles,
roles 403, sesión inválida 401 y nuevo login, privacidad del contrato y GET legacy.
Se ejecutaron junto al test de auth real: 6/6. Tras `CompetitiveService.correct`
con actor ADMIN ficticio, otra ejecución 5/5 confirmó XP 100→2.100 y puesto 51→1.
Flutter nunca concede XP. El evento procede de un verificador del harness y los
60 rivales son sintéticos: **no son partidas reales verificadas**.

El panel HTTP ejercita jerarquía, publicación, duplicados, revisión obsoleta,
historial archivado, mapa, cobertura y eliminación de tema vacío. Navegador
Chromium local observado por capturas: login, jerarquía, preguntas, mapa y logout;
no atribuirle las escrituras que ejecutó el test HTTP. Las peticiones del navegador
a hosts no locales se bloquearon. No se usaron cuentas institucionales reales.

Certificados: se amplió únicamente el script de preview con cuatro áreas que
faltaban; ahora produce cinco certificados de área, uno de curso y uno con nombre
largo. Dos capturas de HTML renderizado se inspeccionaron visualmente sin recorte
visible; los siete PDF sí fueron generados. No afirmar revisión visual de cada
PDF ni impresión física. Seis tipos, requisitos y áreas vacías: evidencia Jest.

## Android y límites físicos

APK compilada con APP_ENV=dev, DEMO_MODE=false, API_BASE_URL y CONTENT_BASE_URL
`http://127.0.0.1:43187`; sin defines de contraseña ni archivo privado de login.
Se usó temporalmente suffix `.i2validation`: paquete
`com.example.saber_plus.i2validation`, actividad
`com.example.saber_plus.MainActivity`. El archivo Gradle se restauró byte a byte
(SHA256 idéntico al respaldo). La app habitual y sus datos se preservaron.
Conexión USB mediante `adb reverse tcp:43187 tcp:43187`, sin exposición pública.

Al retomar, Android era CPH2577/15; la instalación dio Success y se lanzó la
actividad. La captura negra coincidió con `mDreamingLockscreen=true`.
No es evidencia de un fallo de render de la app. Se pidió desbloqueo al usuario.
El usuario había aceptado ayudar, pero eso no constituye resultado de prueba.
Texto grande, teclado, desplazamiento, fondo/retorno, audio, cambios rápidos de
filtros, gesto, reintento y red deben consignarse solo si se observan después.

Clientes de juegos: no se observó cableado Flutter de admisión/presencia
competitiva. Pendiente por cada cliente: Cima, Guardián, Rescate, Trivia Rush,
Duelo fantasma y Tira y afloja. La integración backend y sus tests no prueban ese
recorrido en el teléfono. Memoria y Batallas NO_DISPONIBLE es el contrato vigente.

## Incidencias, reproducción y severidad

1. **Alta, deuda de dependencias:** repetir los dos comandos audit. Producción
   señala proxy-addr 2.0.7, parche 2.0.8,
   [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h).
   npm califica critical al paquete. La condición del advisory involucra subredes
   IPv4-mapped IPv6 con prefijos cortos; main usa trust proxy numérico 1 cuando
   se habilita. No se demostró explotación ni se inspeccionó un despliegue real.
   Audit completo cuenta 13 paquetes afectados, no 13 CVE independientes.
   No se ejecutó audit fix ni se cambiaron manifests/locks.
2. **Media, calidad estática:** lint 567 errores/150 avisos en código existente;
   predominan no-unsafe-member-access, prettier, no-unsafe-argument y
   no-unnecessary-type-assertion. Los recuentos históricos 111/11 no son vigentes.
3. **Media, validación del panel:** `npm test` falla por timeouts/socket de HTTP
   loopback con concurrencia predeterminada, repetido tres veces. Serial explícito
   pasa 88/88 e isolated editorial-review pasa 6/6. Hipótesis: presión/temporización
   del entorno; causa raíz no confirmada. `npm test -- --test-concurrency=1` no se
   considera prueba serial correcta: el flag quedó después del patrón de archivos.
4. **Media, mapa:** primer runner nativo terminó con exit 1 sin resumen de tests;
   no se inventa un recuento ni se atribuye a lógica. Cierre de instancia confirmado.
   Repetición 7/7 correcta; no se modificó el código para obtener ese resultado.
5. **Entorno, resuelto para continuar:** primer npm ci falló por cadena TLS de
   Norton. Se usaron raíces del sistema con Node, sin desactivar TLS. Java no
   soportaba Windows-ROOT: se copió cacerts y añadió la raíz pública ya confiada
   de Norton solo a esa copia temporal. Gradle usa esa copia por proceso.
6. **Entorno, recursos:** se detuvo únicamente el daemon Gradle propio cuando la
   RAM libre cayó a ~90 MiB. Reintento con 1 GiB y un worker compiló. Android Gradle
   instaló automáticamente CMake 3.22.1 en el SDK existente; se registra esa
   modificación del SDK, no se oculta como herramienta portable.
7. **Entorno PostgreSQL:** primera descarga de postgres:16 excedió 120 s (0 tests);
   otro intento falló antes de migraciones con Schema engine error (0 tests).
   Tras preparar la imagen, corrida completa y dirigida final aprobadas. El error
   de motor no volvió a reproducirse; causa no confirmada.
8. **Entorno/harness:** la segunda API temporal salió inesperadamente durante
   la espera prolongada de compilación. Supervisor informó limpieza de API/PG;
   no se atribuye causa a la app. Se creó otra instancia para el teléfono.
9. **Render inicial:** primer preview dio 503 genérico; reintentos de 3 y 7 PDF
   correctos. No se demostró defecto de plantilla. Un fallo de import de Windows
   en el script diagnóstico de navegador se corrigió solo en ese script temporal.

## Cambios y entrega

No se cambió runtime de producto. Se añadieron harness aislado, entry point local,
test de panel real y documentación de uso; se ampliaron previews de certificados.
Flutter añade cinco pruebas opt-in HTTP, sin modificar expectativas anteriores.
Los resultados previos no se sustituyen por repeticiones favorables.

Archivos para `git add` en backend (revisar el diff antes; no ejecutar commit/push
sin confirmación del compañero):

```text
backend/tool/local_ranking_validation.mjs
backend/tool/local_ranking_api.cjs
backend/tool/test_local_panel.mjs
backend/tool/LOCAL_RANKING_VALIDATION.md
backend/tool/preview_course_certificate.cjs
backend/docs/VALIDACION_LOCAL_I2_5_2026-10-06.md
backend/docs/validacion-local-2026-10-06/resultados.json
backend/docs/PR_I2_RANKINGS.md
backend/docs/PR_I1_RELEVO.md
backend/docs/README.md
```

Commit sugerido: `test: documentar validacion local I2-5 y harness aislado`.
La lista Flutter está en el informe del otro repositorio. Antes de push confirmar
revisión de ambos diffs, destino main/remotos vigentes, ausencia de secretos y
artefactos, conservación del cambio ajeno en analysis_options, y aceptación de
pendientes. No asumir autorización de commit/push por haber autorizado pruebas.

Siguiente checkpoint: completar la comprobación física y resolver/documentar
los fallos de validación; revisar después los criterios completos de I2-5.
No reiniciar PR-I1 ni reimplementar I2-1/2/3/4. No saltar a activación o producción.

## Cierre de recursos y revisión final

Confirmado al terminar:

- Los tres entornos de login/ranking se retiraron por su supervisor; el último
  cerró con exit 0 y `cleanupConfirmed: true` en evidencia. Sus directorios
  privados y contraseñas ya no existen. Una sesión anterior falló, pero confirmó
  también retirada de API y base. No hay listener en 43187.
- Los nueve modos nativos, incluido el intento fallido y la repetición de mapa,
  informaron parada y eliminación de su instancia. No quedan directorios
  `saberplus-editorial-pg-*` ni `saberplus-i2-local-*` al comprobar el cierre.
- Docker solo conserva los contenedores ajenos preexistentes `mysql-indexing`
  y `postgres-local`. Redes listadas: bridge, host, none, indexacion_default y
  postgres-docker_default; ninguna propia del ensayo. Imágenes temporales del
  runner Linux retiradas. La imagen base postgres:16 queda como caché local;
  imágenes previas postgres:17, mysql:8.0 y mssql:2019 intactas. No hubo prune.
- Navegador y servidor del panel cerrados en finally. USB reverse propio
  retirado; lista de reverse vacía. La app `.i2validation` se detuvo y desinstaló
  con Success; no se tocó el paquete habitual. No quedó una app conectada a un
  entorno expirado. Para retomar hay que reinstalar la APK e iniciar otra sesión.
- APK conservada solo en `saber_plus/build/app/outputs/flutter-apk/app-debug.apk`
  (381.367.095 bytes), ignorada por Git. PDFs en `backend/output/pdf/`, también
  ignorados. No se copiaron al conjunto de archivos para añadir.
- Herramientas portables, copia privada de cacerts, capturas y logs de ensayo
  se conservan fuera de Git en
  `C:\Users\modaf\AppData\Local\Temp\saberplus-validation-544e5cf21b834d5faa6727ea52106668`.
  Son artefactos locales para revisión/repetición, no bases en ejecución. No
  publicar logs completos. El puntero está en `.codex/saberplus-validation-path.txt`
  del perfil del usuario. No se borraron cachés compartidas de npm/pub/Gradle ni
  CMake del SDK; no se atribuye toda la variación de disco a un único directorio.
- Se eliminó únicamente el informe HTML generado y no ignorado en android/build;
  Gradle de la app coincide con su copia original. Manifests/locks sin cambios.
- `git diff --check` correcto en ambos repositorios; sintaxis de los cuatro
  scripts JS nuevos/modificados correcta. Cambio ajeno analysis_options intacto.
  Ningún APK, log completo, credencial temporal o base se incluye en las listas
  exactas de entrega. No se ejecutó git add, commit ni push.

Resumen para Pavel: regresión completa local y pruebas HTTP reales aprobadas;
Android compiló e instaló, pero no se pudo completar el recorrido porque el
teléfono permaneció bloqueado y no hubo respuesta con resultados manuales.
I2-5 sigue abierto. Revisar lint/dependencias y fallo concurrente del panel antes
de declarar una validación global limpia. El ensayo local no autoriza producción.
