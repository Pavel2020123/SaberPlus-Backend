# JN-2B — Rescate de estrellas: backend

Entrega local del 23 de septiembre de 2026. No desplegada en Render ni migrada a
Supabase. Flutter conserva la demo hasta JN-2C. No concede XP, rachas, premios,
insignias ni evidencia diagnóstica.

## Reglas versión 1

Se fijan para esta versión las reglas de la demo, sujetas a revisión de dificultad
antes de publicar. Cambiarlas requiere otra versión, no reinterpretar intentos.

- Un acierto libera una estrella; un error consume pregunta sin restar estrellas.
- Tres estrellas forman una constelación; seis estrellas completan las dos.
- Diez preguntas distintas por ID; victoria inmediata al sexto acierto, también
  en la décima pregunta. Agotar diez con menos de seis conserva el rescate parcial.
- Sin cronómetro de velocidad. Una partida activa por estudiante para este juego;
  caducidad de 24 horas desde creación, sin ampliarla al recuperar la partida.
- Estados: ACTIVO, VICTORIA, AGOTADO, ABANDONADO, EXPIRADO.

## API

Prefijo `/rescate-estrellas`. Todas las rutas pasan por JwtGuard y
EmailVerificadoGuard (política de verificación vigente). El servicio exige rol
ESTUDIANTE. La identidad procede del token; no se admite usuario ni puntuación
en el cuerpo. La validación global rechaza campos extra.

| Método | Ruta tras el prefijo | Acción |
| --- | --- | --- |
| POST | `/intentos` | Crear o recuperar la partida activa con iguales filtros |
| GET | `/intentos/activo` | Partida activa o null |
| GET | `/intentos/:id` | Recuperar partida propia, incluso terminada |
| POST | `/intentos/:id/respuestas` | Calificar una respuesta a la pregunta actual |
| POST | `/intentos/:id/abandonar` | Cierre idempotente |

Creación: `area` obligatoria (enum AreaIcfes), `temaId`, `subtemaId` y `dificultad`
opcionales. Una configuración distinta con partida activa devuelve 409.
Respuesta: `preguntaId`, `respuestaId` y `idempotencyKey` UUID. Intentos usan UUID.
IDs de contenido: cadenas no vacías, máximo 100 caracteres.

## Estado público

`id`, `area`, `temaId`, `subtemaId`, `dificultad`, `venceEn`, `estado`,
`reglas: {version: 1, target: 6, questions: 10, starsPerConstellation: 3}`,
`estrellas`, `constelaciones`, `aciertos`, `errores`, `respondidas`,
`pregunta` y `ultimaRespuesta`.

`pregunta` solo expone la pregunta actual con opciones ID/texto, imágenes de
enunciado/caso y clasificación. Es null tras el cierre. `ultimaRespuesta` contiene
preguntaId, respuestaId, esCorrecta y estrellasGanadas (0/1). No se entregan claves,
explicaciones, preguntas futuras ni historial privado. El error no revela la solución.

El reintento de una clave con los mismos datos devuelve el **estado actual** de
la partida, no una respuesta HTTP antigua; cambiar datos de esa clave devuelve 409.
Reenviar una pregunta consumida con nueva clave también se rechaza. Si ha caducado,
se persiste EXPIRADO sin calificar. Un intento ajeno devuelve 404.

JN-2C deberá conservar la clave y el envío pendiente por cuenta, recuperar primero
tras desconexión y no inventar resultados. Crear otra partida después de terminar
la anterior es una nueva operación, no una promesa de idempotencia de creación
entre distintas partidas. No hay fallback a preguntas demo en el servidor.

## Persistencia y seguridad

- Tabla separada `IntentoRescateEstrellas` relacionada con Usuario; copia privada
  del contenido y solución inicial. Una edición posterior no altera el intento.
- Selección aleatoria por páginas con memoria acotada a diez candidatos válidos.
  Exige publicación de pregunta, tema, subtema y caso, caso de la misma área,
  2–6 opciones de texto y una sola correcta. Con banco insuficiente: 400 sin crear.
- Transacciones y bloqueo por usuario/juego; índice único parcial para una activa.
  Snapshots conservan nombres/clasificación sin depender de futuras ediciones.
- Restricciones SQL de versión, estado, cantidad y fechas; RLS habilitado y
  privilegios revocados a PUBLIC/anon/authenticated. Solo acceso mediante API.
- El módulo reutiliza los guards, Prisma y filtro de publicación existentes. Sigue
  el patrón de Cima con repositorio de intentos y reglas separados para no cambiar
  sus partidas. No modifica motores, contratos ni puntuaciones de otros juegos.
- Aplican los límites HTTP globales; revisión de volumen/rendimiento pendiente
  del ensayo real, no se promete escalabilidad ilimitada.

Migración: `prisma/migrations/20260923160000_star_rescue/migration.sql`.
No ejecutar migraciones reales antes de confirmar entorno, respaldo y autorización.

## Verificación reproducible

Desde la carpeta `SaberPlus-Backend/backend`:

```powershell
npm run build
npx --no-install eslint src/star-rescue --max-warnings=0
npm test -- --runInBand
node tool/test_editorial_postgres.mjs --star-rescue
```

El runner solo usa PostgreSQL desechable en loopback, con propiedad comprobada y
credenciales efímeras; no lee `.env` ni usa Supabase. Aplica migraciones de HEAD y
solo la migración nueva de este juego si no está versionada. Requiere PostgreSQL
local (por defecto `C:/Program Files/PostgreSQL/16/bin`). Limpia su instancia al
terminar; conserva datos si no puede confirmar el cierre seguro.

Las pruebas cubren reglas, DTO/guards, propietario/roles, contenido publicado,
filtros, concurrencia, claves, snapshots, caducidad, cierres, victoria en pregunta
diez, rescate parcial, recuperación desde otra instancia, XP intacto y RLS.

Resultado local: build correcto, ESLint del módulo sin avisos, 811 pruebas Jest
en 80 suites y 20 pruebas PostgreSQL aprobadas. La instancia desechable fue
detenida y eliminada; no se modificaron bases existentes. No es un ensayo de
despliegue, ni una prueba de interfaz Flutter remota o de carga.

Sigue **JN-2C: cliente remoto Flutter**. Después: migración/despliegue autorizado
y ensayo en teléfonos; arte y animaciones al final.
