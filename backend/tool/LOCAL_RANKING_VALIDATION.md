# Ensayo I2-5 exclusivamente local

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
el directorio propio. No se cargan `.env`, SMTP real, flags competitivos ni bases
anteriores. El SMTP apunta a loopback:1; no usar registro/recuperación de correo.
La publicación editorial se habilita exclusivamente en esta API propia para
ensayar el panel; los flags competitivos permanecen apagados. Con la sesión lista:

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
