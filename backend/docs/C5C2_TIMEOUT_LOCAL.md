# C5-C2 — Vencimiento de Tira local, entrega a revisión

Regla autorizada por Pavel: una ronda sin respuesta conserva su resolución frente
a CPU y continúa con la siguiente pregunta si el duelo sigue abierto. No consume
comodines, anuncios ni recompensas; no crea una selección o XP ficticios.

El cambio conecta backend y Flutter mediante un proveedor específico de Tira
local. **No cierra C2**: regresión D8a observada y aprobada, pendiente auditoría
de Pavel. Los casos de
respuesta en vuelo/reintentos y pausa cuentan con pruebas automáticas; no
atribuirles evidencia humana de pérdida de ACK real.

## Alcance del contrato

JWT, correo verificado, estudiante y propietario del intento. Ruta exclusiva
`/tira-local/intentos`; no acepta parámetros de competición ni modalidad libre.

| Operación | Comportamiento |
| --- | --- |
| POST raíz, `{areas}` | Crea intento `TUG_LOCAL` aislado, sin evidencia competitiva. |
| GET `/:id` | Estado propio; conserva imágenes públicas sin soluciones anticipadas. |
| POST `/:id/ronda`, `{preguntaId}` | Inicia diez segundos con reloj del servidor; repetir no amplía la ventana. |
| POST `/:id/pausa`, `{preguntaId,version,pausada}` | Conserva pausa existente con tiempo calculado por servidor; una versión atrasada devuelve estado sin volver a aplicar la transición. |
| POST `/:id/respuestas`, `{preguntaId,respuestaId,idempotencyKey}` | Evalúa dentro de la ventana, conservando controles e idempotencia. |
| POST `/:id/sin-respuesta`, `{preguntaId,idempotencyKey}` | Rechaza antes del vencimiento; después registra selección nula y avanza una vez. |
| POST `/:id/abandonar` | Abandona el intento propio al cerrar el duelo. |

No existe endpoint de potenciadores o de salto libre. Los endpoints normales de
Trivia/Fantasma rechazan intentos locales y no permiten crearlos como modalidad.
Sus consultas de activo/récord excluyen `TUG_LOCAL`; sus reglas no cambian.

La vigencia global de este intento local es600s, independiente de los10s por
ronda. La siguiente pregunta queda sin iniciar hasta pedir `/ronda`; el tiempo de
feedback de CPU no consume su ventana. La pausa conserva el tiempo restante de
la ronda, pero no amplía los600s globales. El cliente no envía una duración ni una
hora propia. No emplear el viejo inicio Trivia de60s para este flujo.

`rondaLocal` expone versión, estado pausado y milisegundos restantes. Inicio,
pausa, reanudación y avance bloquean el intento y versionan cambios; una petición
repetida o retrasada no puede sumar dos pausas. No se pausa una ronda ya vencida,
ni se responde o vence una ronda pausada. Caducar limpia la pausa y fija
`finalizadoEn = venceEn`, incluso si el cliente estaba en segundo plano.

Flutter espera inicio confirmado antes de habilitar respuestas. Al vencer, conserva
la resolución frente a CPU y espera el recibo de `sin-respuesta` antes de permitir
avanzar. Si el acuse de una respuesta es desconocido, conserva selección, tiempo
original y clave UUID; solo reintenta ese envío. Una denegación explícita por
vencimiento permite registrar la ronda sin respuesta. Un error de red muestra
reintento y bloquea nuevas selecciones/avance. No se inventa una pregunta siguiente
o un resultado. Al terminar el duelo antes de agotar el banco, se abandona el
intento propio; el modo demo conserva su banco y reloj locales.

La operación sin respuesta usa los bloqueos existentes de intento/propietario y
clave UUID. Tres reintentos concurrentes producen una sola fila final con
selección nula, cero puntos y sin historial de respuesta, concesión o XP. Repetir
la última operación devuelve el resultado ya guardado; una clave ajena u otra
pregunta no puede reutilizarla. No aumenta errores ni preguntas saltadas; la
proyección local distingue `sinRespuesta`.

## Migraciones y validación

`20261022203000_tug_local_timeout_scope` añade el enum y una rama específica a
`trivia_evidence_context`. Conserva las condiciones anteriores y excluye para el
modo local evidencia, presencia, competición y asistencias. No reinscribe intentos
históricos ni permite cambiar su modalidad inmutable.

`20261022213000_tug_option_image_snapshot` corrige por separado el fallo D8b:
el validador original de Tira online rechazaba cualquier opción con `imagenUrl`.
Conserva las comprobaciones originales, acepta el campo solo si coincide con la
Respuesta original y sigue admitiendo snapshots antiguos sin él. No admite otros
campos extra ni imágenes alteradas.

`20261023150000_tug_local_pause` añade solo `tiraLocalPausadaEn` y
`tiraLocalRondaVersion`, con restricción de ámbito: los intentos Trivia/Fantasma
mantienen pausa nula y versión0. Es necesaria para conservar la pausa de CPU
al introducir la validación temporal del servidor. No requiere dependencias
nuevas ni modifica OV-1. Las tres migraciones se prueban solo en bases propias;
no se han aplicado a servicios externos.

Validación previa: build completo, TypeScript, Jest afectado5/62 y48/48 HTTP/SQL
con72 migraciones. Ampliación del23:50/50 HTTP/PostgreSQL con73 migraciones en
Docker propio; pausa real de10.1s, versiones atrasadas, reintento de respuesta,
caducidad pausada y restricciones SQL del ámbito. Flutter25/25 dirigidas incluyen
timeout, reintento, última pregunta, ACK perdido/en vuelo y lifecycle/pausa.
Regresión general final: Flutter1.016 aprobadas/16 opt-in omitidas, backend128
suites/1.675 aprobadas (Jest exit0 confirmado), análisis dirigido Flutter limpio
y `npm run build` completo exit0. Android/4005 aprobado en el alcance del acta:
avance tras timeout, pausa activa8s, reanudación, contención y acierto.

La primera ejecución original dio44/47 (restricción sin nueva modalidad); la
primera ampliación de pausa48/50 (contrato/campos aún ausentes). Se conservan
las evidencias fallidas en el acta. Ninguna base remota fue operada.

## Archivos y siguiente paso

Backend: `src/trivia-rush/tug-local.controller.ts`, `trivia-rush.service.ts`,
`prisma/schema.prisma`, tres migraciones específicas y regresión integrada
`test/editorial-files-postgres.test.cjs`. Los ejecutores locales admiten estas
migraciones expresamente. Flutter: `tug_local_repository.dart`,
`remote_tug_local_repository.dart`, `tug_local_providers.dart`, `tug_of_war_page.dart`
y pruebas `tug_of_war_test.dart`/`remote_tug_local_repository_test.dart`.

Ensayo humano completado con API propia y APK sin claves: avance a rondas2/3
tras vencimiento, pausa activa en8s y reanudación/respuesta correcta. SQL concilia
filas nulas, respuestas humanas independientes y ausencia de potenciadores/XP.
Recibos sanitizados en `evidencias/C5C2_TIMEOUT_D8B_2026_10_23.json` y detalle en
el acta. No se provocó pérdida física de ACK ni se agotó humanamente la última
pregunta; esas variantes tienen evidencia automática. No repetir D8b ni D1–D7.
Pavel audita la entrega y decide el cierre; C2 sigue abierta hasta su revisión.
