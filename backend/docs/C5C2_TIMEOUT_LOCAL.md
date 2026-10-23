# C5-C2 — Contrato de vencimiento de Tira local, integración pendiente

Regla autorizada por Pavel: una ronda sin respuesta conserva su resolución frente
a CPU y continúa con la siguiente pregunta si el duelo sigue abierto. No consume
comodines, anuncios ni recompensas; no crea una selección o XP ficticios.

Este cambio implementa la parte backend. **No cierra C2 ni corrige aún la pantalla
Flutter**: falta conectar su transición, resolver respuestas en vuelo/reintentos y
conservar la pausa existente antes de validar el caso humano de D8a.

## Alcance del contrato

JWT, correo verificado, estudiante y propietario del intento. Ruta exclusiva
`/tira-local/intentos`; no acepta parámetros de competición ni modalidad libre.

| Operación | Comportamiento |
| --- | --- |
| POST raíz, `{areas}` | Crea intento `TUG_LOCAL` aislado, sin evidencia competitiva. |
| GET `/:id` | Estado propio; conserva imágenes públicas sin soluciones anticipadas. |
| POST `/:id/ronda`, `{preguntaId}` | Inicia diez segundos con reloj del servidor; repetir no amplía la ventana. |
| POST `/:id/respuestas`, `{preguntaId,respuestaId,idempotencyKey}` | Evalúa dentro de la ventana, conservando controles e idempotencia. |
| POST `/:id/sin-respuesta`, `{preguntaId,idempotencyKey}` | Rechaza antes del vencimiento; después registra selección nula y avanza una vez. |
| POST `/:id/abandonar` | Abandona el intento propio al cerrar el duelo. |

No existe endpoint de potenciadores o de salto libre. Los endpoints normales de
Trivia/Fantasma rechazan intentos locales y no permiten crearlos como modalidad.
Sus consultas de activo/récord excluyen `TUG_LOCAL`; sus reglas no cambian.

La vigencia global de este intento local es600s, independiente de los10s por
ronda. La siguiente pregunta queda sin iniciar hasta pedir `/ronda`; el tiempo de
feedback de CPU no consume su ventana. El contrato de pausa aún debe completarse
antes de conectar la interfaz. No emplear el viejo inicio Trivia de60s para este flujo.

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

Validación: build completo, TypeScript, Jest afectado5/62 y48/48 HTTP/PostgreSQL
con72 migraciones en Docker propio. Incluye10.1s reales, reintentos simultáneos,
última pregunta, separación de flujos y snapshots online con imágenes. La primera
ejecución local dio44/47: faltaba admitir la nueva modalidad en la restricción;
la evidencia fallida se conserva en el acta. Ninguna base remota fue operada.
