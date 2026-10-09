# Ensayo I2-5 exclusivamente local

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
