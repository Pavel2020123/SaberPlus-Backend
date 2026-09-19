# JN-1B — Salto a la cima: contrato del servidor

Implementado y probado localmente el 18 de septiembre de 2026. No desplegado;
la migración no se aplicó a Supabase. Flutter continúa en demo hasta JN-1C.
No se conceden XP, rachas, logros ni evidencia diagnóstica en esta entrega.

## Reglas versión 1

- Base 0, meta 5, hasta 12 preguntas distintas por ID.
- Acierto sube uno; error baja uno, nunca por debajo de cero.
- La victoria termina inmediatamente; consumir 12 preguntas sin llegar a 5 agota
  la partida. No se muestran explicaciones ni soluciones durante el juego.
- Una partida activa por estudiante; caduca a las 24 horas de su creación.
  No es un cronómetro de velocidad. El reloj y el resultado los decide el servidor.
- Estados: ACTIVO, VICTORIA, AGOTADO, ABANDONADO y EXPIRADO.

## Rutas

Todas requieren JWT vigente y correo verificado. El servicio comprueba el rol
ESTUDIANTE y obtiene el propietario del token, nunca del cuerpo de la petición.

| Método | Ruta | Entrada / resultado |
| --- | --- | --- |
| POST | `/salto-cima/intentos` | `area` obligatoria; `temaId`, `subtemaId`, `dificultad` opcionales. Crea o recupera la partida activa con los mismos filtros. |
| GET | `/salto-cima/intentos/activo` | Estado de la partida activa o `null`. |
| GET | `/salto-cima/intentos/:id` | Recupera una partida propia y actualiza su caducidad. |
| POST | `/salto-cima/intentos/:id/respuestas` | `preguntaId`, `respuestaId`, `idempotencyKey` UUID. |
| POST | `/salto-cima/intentos/:id/abandonar` | Cierra la partida; repetir el cierre no cambia el resultado. |

Los identificadores de intentos son UUID. Área y dificultad usan los enums de
Prisma. Los IDs de tema, subtema, pregunta y opción son cadenas no vacías.
No enviar puntaje, altura, usuario, acierto ni XP calculados por Flutter.

## Estado público y reintentos

La respuesta contiene `id`, filtros, `reglas: {version: 1, target: 5, questions: 12}`,
`venceEn`, `estado`, `escalon`, `maximoEscalon`, `aciertos`, `errores`, `respondidas`,
`ultimoMovimiento`, `pregunta` y `ultimaRespuesta`.

`pregunta` es solo la siguiente pregunta actual (o `null` tras el cierre): incluye
enunciado, imagen, opciones con ID/texto, subtema/tema/área y contexto/imagen del caso.
`ultimaRespuesta` contiene IDs de pregunta/opción, acierto y movimiento; no solución.
No se entregan preguntas futuras, historial privado ni claves de idempotencia.

Flutter debe generar y conservar un UUID por envío, reutilizarlo tras un fallo de
red y recuperar el estado antes de inventar un resultado. Reenviar la misma clave
con la misma pregunta/opción devuelve el **estado actual**, no una copia histórica
de la respuesta HTTP inicial. Reutilizarla con otros datos devuelve 409.
Una pregunta ya consumida con otra clave también se rechaza. Una partida que acaba
de caducar devuelve EXPIRADO sin calificar; otros cierres rechazan nuevas respuestas.

## Banco y seguridad

- Selección aleatoria paginada entre preguntas publicadas con jerarquía y caso
  publicados. Los filtros se combinan; un subtema ajeno al área no aporta preguntas.
- Requiere 12 IDs distintos válidos; no repite ni rellena con ejemplos demo.
  Con menos contenido responde 400 sin crear una partida. La deduplicación
  semántica del contenido corresponde al flujo editorial, no a este muestreo.
- Enunciado no vacío, entre 2 y 6 opciones de texto y exactamente una correcta.
- Copia privada del contenido y solución al comenzar: cambios posteriores en el
  banco no alteran la calificación de una partida iniciada.
- Transacciones y bloqueo por estudiante evitan pérdidas de actualizaciones.
  Un índice único parcial impide dos partidas activas incluso fuera del servicio.
- Tabla IntentoCima con RLS y permisos revocados a PUBLIC, anon y authenticated.
  El acceso pasa por la API; nunca por conexión directa desde Flutter.
- No modifica historial académico. Se conserva el límite de peticiones global.

## Verificación local

Desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
npx --no-install eslint src/summit --max-warnings=0
npm test -- --runInBand
node tool/test_editorial_postgres.mjs --summit
```

El último comando crea un PostgreSQL temporal en loopback, aplica migraciones
versionadas y la migración exacta de Cima si aún no está versionada, ejecuta 16
pruebas y elimina únicamente su instancia temporal. No lee las credenciales de
Supabase. Requiere los binarios de PostgreSQL local según el runner.
Ocho pruebas Jest nuevas verifican reglas y frontera del controlador; las pruebas
PostgreSQL cubren concurrencia, publicación, permisos, RLS, snapshots y cierres.

Migración preparada: `prisma/migrations/20260918140000_summit_challenge/migration.sql`.
No ejecutar despliegues ni migraciones reales hasta retomar infraestructura.

## Pendiente

- JN-1C: repositorio remoto Flutter, reintentos persistentes por cuenta,
  recuperación de partidas, imágenes/casos y estados de red; sin fallback demo.
- Prueba completa en teléfono y staging autorizado, volumen/rendimiento del banco
  y revisión de dificultad de las reglas antes de publicación.
- Arte y animaciones al final, sin cambiar calificación por eventos visuales.

## Cambios anteriores en el repositorio

Al comenzar esta entrega ya había cambios locales de Guardián y privacidad
institucional. Se conservaron. `schema.prisma`, `app.module.ts` y el runner de
PostgreSQL contienen cambios compartidos: no usar `git add .` para publicar esta
etapa de forma aislada. Revisar y guardar esos trabajos en sus propios commits.
Las pruebas informadas corresponden al árbol de trabajo completo, no a un checkout
aislado de un commit nuevo. Antes de desplegar, verificar que el esquema, módulos
y migraciones de Guardián también estén versionados coherentemente.
