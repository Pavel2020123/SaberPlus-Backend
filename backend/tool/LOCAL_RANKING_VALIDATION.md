# Ensayo I2-5 exclusivamente local

**19 de octubre, MA-1R/R4 técnico aprobado:**12/12 humanos y45/45 integradas,
con regresiones y límites en [acta R4](../docs/MA1R_R4_VALIDACION_LOCAL.md).
La suite independiente es `npm run test:question-reports:postgres`, no necesita
sesión humana ni celular. API/base/credenciales del ensayo humano se cerraron
y limpiaron; no reutilizarlas. Remate en otra sesión posterior, retirada del botón
inferior/borrador confirmados: R4 cerrada localmente e integrada en main por PR
API #9/app #6. CI backend del PR aprobado; sigue preparación C5, no otro ensayo por defecto.
Las instrucciones inferiores de arranque son
históricas/reutilizables únicamente cuando se solicite otro ensayo.

**19 de octubre, reanudación MA-1R/R4:** en una sesión nueva propia, la opción
`node tool/prepare_question_reports_local.mjs --resume-case7` prepara tres reportes
por las API reales, con práctica respondida/calificada y un intento duplicado.
Requiere `SABERPLUS_LOCAL_SESSION` del harness actual. Es preparación automática,
no aprobación de casos Android ni reejecución humana de1–6. El verificador
`--case6` detecta esa fixture y registra `manualCaseClaim:false`. Ver acta R4.

**18 de octubre, MA-1R/R4:** allowlist explícita añade migración de reportes:
67 aplicadas solo en la base tmpfs nueva. [Arranque y límites](../docs/MA1R_R4_VALIDACION_LOCAL.md).
`tool/prepare_question_reports_local.mjs` prepara dos preguntas por API y tres
smoke aprobados; requiere SABERPLUS_LOCAL_SESSION de esta sesión. No es cierre
de la suite integrada ni confirma casos Android; no ejecutar contra base habitual.

Actualización16 de octubre,C4: allowlist explícita incorpora
`20261016180000_student_institution_codes`; base temporal66 migraciones.
`node --test tool/test_student_institution_codes_local.cjs`16/16 HTTP/SQL y
regresión C3 posterior14/14 aprobadas. Contrato/checkpoint actual en
[código estudiantil](../docs/PR_I5_C4_CODIGO.md). No acredita Android C4 ni bootstrap
productivo429. Las preparaciones históricas inferiores no son tareas nuevas.

Actualización C2,12 de octubre: allowlist incorpora explícitamente
`20261012180000_institution_logo`; demás migraciones conservan su origen en HEAD.
Guion `node --test tool/test_institution_logo_local.cjs` preparado (no ejecutado):
requiere fixtures del guion C1 en sesión nueva; seis casos SQL/HTTP. Ver
[contrato y relevo C2](../docs/PR_I5_C2_LOGO.md) y acta Flutter para ocho pruebas
Android pendientes. C1C ya terminó diez pruebas humanas; nota inferior histórica.

Actualización PR-I5-C1C,12 de octubre: allowlist explícita de migraciones
territorial y perfil `20261011200000_institution_public_profile`, demás desde HEAD.
Sesión nueva arrancó con63 migraciones; `tool/test_institution_profile_local.cjs`
15 casos HTTP/PostgreSQL reales aprobados. Flutter/API3/3, APK instalada y
recorrido humano C1C completado localmente (10/10). Ver acta PR_I5_C_PERFIL del repo Flutter.

Actualización PR-I5-T5, 11 de octubre: el harness admite por ruta explícita la
única migración pendiente `20261010193000_institution_territory`; las demás
proceden de HEAD. Se comprobó arranque con 62 migraciones y guion territorial
HTTP/PostgreSQL aprobado. Seguimiento humano en el acta territorial de Flutter.
Ese cambio permite ensayar antes del commit sin copiar otros SQL locales.

## Acuerdo de alcance — 9 de octubre de 2026

Fuente del orden: `docs/ETAPAS_PENDIENTES.md` y
`docs/ALCANCE_V1_NOVIEMBRE_2026.md` del repositorio Flutter
`Pavel2020123/saber_plus` (no pertenecen a este árbol).
Competición inicial: Cima, Guardián y Rescate. Después de Rescate: instituciones.
Trivia/Duelo/Tira/Memoria/Batallas competitivos se aplazan sin borrar código,
migraciones ni modos normales. OV-1, perfiles, insignias anuales y territorio
permanecen. Las secuencias anteriores son antecedentes; no activar servicios
por este acuerdo. Sustentación y lanzamiento comercial son hitos distintos.

Para retomar con un compañero/otro chat, ver
[relevo de pruebas](../docs/RELEVO_PRUEBAS_LOCALES.md) y el checkpoint vivo del
roadmap Flutter. Esta guía describe el harness, no decide la siguiente etapa.
Unitarias no requieren contraseña; HTTP/login físico usan la credencial ficticia
privada de SU nueva sesión. No copiar directorio, token ni contraseña de otro PC.

Requiere Node/npm del manifest, `npm ci`, `npm run build`, Docker local Linux y
`postgres:16`. Descargar la imagen previamente si la red supera el plazo de
preparación del runner. Nunca usar `.env` ni una base existente.

Desde `backend/`:

```powershell
node tool/local_ranking_validation.mjs
```

El proceso permanece abierto y publica **solo la ruta** de su directorio temporal
en el evento `local-ranking-ready`. Guarda esa ruta como `$sessionDirectory` en
otra terminal. `flutter-private.json` contiene credenciales ficticias aleatorias:
no imprimirlo en logs, adjuntarlo a un informe ni añadirlo a Git. No contiene
credenciales productivas. No utilizar sus defines de autenticación para un APK.

Desde Flutter, con el mismo directorio temporal:

```powershell
flutter test --no-pub --reporter expanded "--dart-define-from-file=$sessionDirectory/flutter-private.json" test/auth_api_live_test.dart test/competitive_ranking_local_api_test.dart
```

La API escucha exclusivamente `127.0.0.1:43187`. Usa AppModule, Prisma,
AuthService, bcrypt, emisión JWT y guards reales. El entry point de ensayo instala
ValidationPipe y CORS local; **no es el bootstrap completo de `main.ts`** ni
certifica rate limiting, estáticos o cabeceras productivas. Los tests Linux del
runner competitivo cubren por separado el bootstrap real.

Se crea PostgreSQL 16 en tmpfs, con puerto loopback aleatorio, etiqueta de
propiedad y usuario aleatorio. Prisma aplica las migraciones SQL de HEAD desde
el directorio propio. No se cargan `.env`, SMTP real, flags competitivos heredados ni bases
anteriores. El SMTP apunta a loopback:1; no usar registro/recuperación de correo.
La publicación editorial se habilita exclusivamente en esta API propia para
ensayar el panel; la admisión competitiva empieza apagada. Con la sesión lista:

```powershell
$env:SABERPLUS_LOCAL_SESSION = $sessionDirectory
node --test tool/test_local_panel.mjs
```

Este test usa el cliente HTTP del panel y login ADMIN/profesor reales. Crea
contenido sintético, conserva la versión anterior, rechaza duplicados y revisión
obsoleta, guarda un mapa y comprueba borrado solo de un tema vacío. No es una
prueba de navegador ni de edición de contenido real.

## Fixtures y alcance

- `student@example.invalid`: cuenta verificada, XP 100, puesto 51 entre 61.
- `zero@example.invalid`: balance cero; `absent@example.invalid`: sin balance.
- `teacher@example.invalid` y `admin@example.invalid`: permisos actuales reales.
- Todas usan la contraseña efímera en `AUTH_E2E_PASSWORD` del archivo privado.
- Trivia tiene datos en la temporada del evento; el año anterior y Cima están
  vacíos. Memoria/Batallas conservan `NO_DISPONIBLE`.
- Los 60 balances rivales son **sintéticos**. El evento del estudiante procede
  de un verificador exclusivo del harness: **no son partidas reales verificadas**.
- La API no añade rutas de prueba ni permite que Flutter conceda XP.

Para comprobar una corrección interna legítima, escribir en el directorio propio:

```powershell
Set-Content -LiteralPath "$sessionDirectory/control.json" -Encoding ASCII -Value '{"action":"correct"}'
```

Esperar el evento `local-ranking-corrected` de la terminal. El servicio real
`CompetitiveService.correct` modifica el evento propio con actor ADMIN ficticio:
XP 2100, puesto 1. Repetir el test Flutter con
`--dart-define=LOCAL_RANKING_CORRECTED=true`. El comando es de control local por
archivo, no un endpoint HTTP. Solo aplica la corrección una vez por sesión.

### Lectura segura de control.json

El editor puede dejar el archivo vacío o con JSON parcial durante un guardado.
El supervisor ignora esa lectura, avisa sin imprimir el contenido y vuelve a
leer; no modifica admisión ni ejecuta órdenes incompletas. Solo acepta un objeto
con una clave `action`: `correct`, `solo-on`, `solo-off` o `stop`. Un error real
de disco/permisos sigue notificándose. Esperar siempre el ACK de ON/OFF; que el
archivo exista no demuestra que se aplicó la orden.

Regresión (también ejecutada por Backend CI):

```powershell
node --test tool/local_control_file.test.mjs tool/local_competitive_control.test.cjs
```

Para preparar puntos de Rescate en una sesión NUEVA sin copiarlos de otra base,
se puede jugar mediante el test opt-in Flutter con la cuenta `student`:

```powershell
flutter test --no-pub --reporter expanded "--dart-define-from-file=$sessionDirectory/flutter-private.json" --dart-define=RESCUE_LOCAL_COMPETITIVE=true --dart-define=RESCUE_LOCAL_EMAIL=student@example.invalid test/star_rescue_local_api_test.dart
```

Ejecutar desde el repo Flutter, solo con SOLO ON confirmado y antes de que el
teléfono use esa cuenta. Por defecto el test usa `zero@example.invalid`; no
alterarlo para una prueba normal. Esta preparación juega seis respuestas contra
la API/verificador reales, no inserta balances; debe documentarse como automática,
no victoria humana. Registrar el saldo nuevo y no reutilizar el de otra sesión.

## Android

### IC-1A2: Cima competitiva, exclusivamente en esta API temporal

El harness también crea `Cima - ensayo local IC-1A2` / `Sumas para el ascenso`
en Matemáticas: doce preguntas sintéticas `n + 1`, con dos opciones y una correcta.
No crea eventos ni balances de Cima. Estos deben proceder de partidas reales,
verificador y reconciliador de AppModule, no del fixture de Trivia.

Después de comprobar en Android el rechazo con admisión apagada, escribir en el
directorio propio `control.json` con `{"action":"solo-on"}`. Esperar en la consola
`local-solo-admission` con `enabled: true`. Para apagar nuevas admisiones sin
reiniciar cuentas ni interrumpir la recuperación de una partida aceptada, usar
`{"action":"solo-off"}` y esperar `enabled: false`.

El supervisor controla por IPC únicamente `COMPETITIVE_SOLO_ENABLED` del proceso
local verificado. No hay endpoint HTTP de activación ni cambio en `main.ts`,
Render/Supabase o las reglas de XP. El control no liquida resultados; esperar
el reconciliador real y consultar ledger/balance para confirmar una sola concesión.
Repetir lecturas no constituye otra partida. No interpretar el fixture de Trivia
como evidencia de esta integración. `node --test tool/local_competitive_control.test.cjs`
cubre rechazo de mensajes malformados y cambios explícitos de admisión.

Una sesión creada por la versión anterior del harness debe cerrarse normalmente
y recrearse para usar este control: las credenciales y JWT de ensayo cambian.

Conectar USB y usar `adb reverse tcp:43187 tcp:43187`. Compilar exclusivamente
con `APP_ENV=dev`, `DEMO_MODE=false`, `API_BASE_URL=http://127.0.0.1:43187` y
`CONTENT_BASE_URL=http://127.0.0.1:43187`. No incluir `flutter-private.json` en
la compilación: las credenciales se introducen al iniciar sesión. Preservar la
instalación/datos habituales del teléfono; preferir un paquete debug separado.
No abrir puertos de red ni túneles públicos.

Los tests de repositorios HTTP no sustituyen navegación, teclado, texto grande,
gestos, suspensión, audio, pérdida de red y observación humana del teléfono.
El orden de respuestas de filtros se cubre también por pruebas unitarias, que
deben identificarse como tales, no como E2E físico.

## Cierre

```powershell
Set-Content -LiteralPath "$sessionDirectory/control.json" -Encoding ASCII -Value '{"action":"stop"}'
```

Esperar `Owned local ranking API and PostgreSQL removed.`. El proceso cierra
Nest/Prisma, verifica la etiqueta antes de retirar su contenedor y comprueba la
ruta antes de borrar su directorio y secretos. Hay un límite de dos horas.
Si se mata el supervisor externamente, no asumir limpieza: identificar su nonce,
etiqueta, directorio y procesos antes de retirar exclusivamente esos recursos.
Nunca usar `docker system prune`. Retirar solo el reverse USB creado para este
ensayo mediante `adb reverse --remove tcp:43187`.
