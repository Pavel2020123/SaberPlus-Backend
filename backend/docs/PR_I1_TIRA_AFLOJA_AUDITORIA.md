# PR-I1 V1 — auditoría y preparación de Tira y afloja

## Estado vigente

Base `ebe40e3`, rama `feat/pr-i1-competitive-infrastructure`: seis checkpoints
confirmados. Esta ronda local corrige idempotencia del motor existente y prueba
su frontera competitiva. **Tira no admite ni liquida XP competitivo**. No hay
verificador TUG_MATCH, flag de admisión ni migración nueva. No se convierte
ninguna partida histórica. No se declara implementada presencia durable,
snapshot competitivo ni recuperación de pagos de Tira.

[Índice](README.md) · [Infraestructura y checkpoints](PR_I1_COMPETITIVE_INFRASTRUCTURE.md)
· [Trivia/Duelo e incidencias históricas](PR_I1_TRIVIA_DUELO_AUDITORIA.md).

## Fuentes y autoridad

Auditoría previa a cambios: módulo completo `src/tira-afloja`, schema Prisma,
migración `20260831120000_add_tira_afloja_tiempo_real`, pruebas de reglas,
privacidad, gateway, autenticación y publisher; contratos, registro de
verificadores, reglas, políticas y servicio competitivo. No había documento
especializado de Tira. Arranque `src/main.ts`: sin adaptador distribuido de salas.

Lectura exclusiva del repositorio Flutter: `docs/PLAN_MAESTRO_COMPETITIVO.md`
y sección 12 de `docs/PR_I1_AUDITORIA_FORMULAS.md`. Sus propuestas históricas
no sustituyen las decisiones aprobadas. La fuente oficial es **TUG_MATCH**,
`PartidaTiraAfloja.id` UUID; participante UUID. Las fórmulas puras existentes
no certifican un motor ni habilitan un pago.

| Aspecto | Evidencia actual | Brecha para competitivo |
|---|---|---|
| Banco inicial | `seleccionarPreguntas` elige aleatoriamente hasta 20 publicadas, mínimo 4; `emparejar` persiste orden e IDs de opciones en TiraAflojaPregunta. | No congela textos, soluciones, explicación ni configuración completa. Presentación, corrección y resolución consultan Pregunta/Respuesta mutable. Exige al menos una solución, pero no verifica solución única; el futuro snapshot debe validar el banco. La selección aleatoria de preguntas no es una recompensa aleatoria. |
| R y Qpartida | `iniciarPrimeraRonda` / `resolverRondaActual` guardan eventos RONDA_INICIADA y horarios. | El evento se crea antes de su inicio programado (3 s / 1,5 s); contarlo inmediatamente inflaría R si se cancela antes de estar disponible. Falta evidencia inmutable de activación por participante y Qpartida congelado. |
| Respuestas | `responder` valida propietario, ronda, pregunta, opción y ventana; guarda corrección e instante servidor. Unicidad por partida/ronda/usuario y clave UUID. | Corrección depende del banco mutable. Se corrigen los reintentos descritos abajo; eso no vuelve competitivo el registro legacy. |
| Resultado normal | Reglas servidor: meta ±4; solo uno correcto mueve 2; ambos correctos mueve 1 hacia el más rápido, salvo diferencia ≤200 ms; agotamiento del banco decide por posición/empate. | Falta replay de evidencia congelada y protección SQL de terminal/evidencia. `versionReglas=1` legacy no constituye admisión xpRulesVersion=1. |
| Abandono y plazo | `abandonar` cierra bajo lock de partida y asigna rival si existe, incluso PREPARANDO. `procesarEstado` vence a EXPIRADA/CANCELADA. | Rival asignado no demuestra presencia suficiente; PREPARANDO no prueba partida competitiva activa. No hay evidencia individual para ambos ausentes. No interpretar CANCELADA como victoria/empate competitivo. |
| Presencia | JWT, estudiante, correo y contraseña inicial en handshake; `handleDisconnect` consulta sockets y solo emite presencia. | Sin registro PostgreSQL, lease, gracia 30 s, UNKNOWN o evidencia autenticada posterior a desconexión. HTTP permite responder sin socket: comportamiento legacy, no prueba presencia competitiva. |
| Caídas e instancias | Partida, respuestas, eventos y horarios sobreviven en PostgreSQL; barrido cada segundo y consulta recuperan progreso legacy. | Publisher RxJS y salas locales se pierden; no hay observador durable ni presencia global. Dos instancias serializan modificaciones de partida mediante advisory lock, pero no comparten notificaciones/conexiones. |
| Privacidad | `obtener`, `presentarDatosEvento` y gateway devuelven asientos A/B, no cuentas/nombres/fotos; opciones sin esCorrecta. RONDA_RESUELTA revela solución/explicación de la ronda resuelta. | Mantener lista cerrada; no serializar futuros snapshots ni soluciones pendientes. Tests existentes WS usan autenticación simulada: no prueban presencia durable. |
| Datos cliente | Solo área solicitada, IDs, ronda, clave y acciones. Movimiento, corrección y resultado se calculan en servidor. | No aceptar C/R/Qpartida/resultado/XP como prueba. Tiempo Node y fecha DB de evento no forman hoy una secuencia competitiva global. |
| Concurrencia | Advisory transaccional de partida; eventos únicos partida/version. | Emparejamiento y terminal legacy no usan orden Usuario → partida. Un futuro verificador debe coordinar todos los escritores y bloquear participantes en orden estable, sin invertir el orden de CompetitiveService. No se añade un lock de usuario aislado que cause deadlocks. |

## Decisiones V1 verificadas

Normal: `roundHalfUp(60*C/R)` +40 victoria / +20 empate / +0 derrota,
R≤20. R cuenta cada ronda disponible una vez, respondida o no; no cuenta un
inicio cancelado antes de activación. Empate normal válido con C=0 y R>0 da 20;
ambos ausentes no reciben ese bono. No recompensar terreno ni oscilaciones.

Abandono propio: nominal -15, piso cero y sin recompensa parcial. Rival:
`min(80, roundHalfUp(60*C/Qpartida)+20)` si hay al menos una respuesta aceptada,
incluso incorrecta; sin acción válida, 0. Qpartida es el máximo congelado al
inicio, no R: C=1/R=1/Qpartida=20 produce 23, no 80. Ready/latido no son acciones.
El sobreviviente necesita presencia autenticada posterior a desconexión rival
y no estar también en gracia. Ambos ausentes: sin ganador/pago positivo,
abandono individual solo con evidencia. Se reutilizarán ledger, temporadas e
historial institucional; historial desconocido falla, no se inventa.

### Precedencia aprobada por el propietario en esta ronda

Resultado normal alcanzado y verificado antes de finalizar la gracia cierra
inmediatamente, sin esperar 30 s. Si el plazo global vence antes o exactamente
al finalizarla, prevalece vencimiento normal con sus reglas existentes. Si
finaliza primero la gracia y sigue activa sin resultado normal, abandono solo
con evidencia autoritativa suficiente. Reconexión no pausa ni amplía relojes;
terminal no se reabre. Resolver carreras transaccionalmente por instante y orden
de eventos aceptados por servidor. **No se reutiliza la precedencia de Trivia**.
La aprobación resuelve esta ambigüedad; no implementa aún la máquina durable.

## Corrección funcional acotada

PostgreSQL real demostró que `bloquear` devolvía `void` mediante `$queryRaw`,
que Prisma 5.22 no puede deserializar. Se conserva exactamente el advisory lock
transaccional y se convierte su resultado a `text`; no se elimina el bloqueo.
Las pruebas unitarias anteriores con `$queryRaw` simulado no detectaban el fallo.

Contrato de respuesta: reintento exige mismo propietario, partida, clave, ronda,
pregunta y opción. Diferente payload con clave aceptada: 403, sin escritura.
Reintentos concurrentes toman lock de clave UUID canónica y después de partida,
releen la aceptación dentro de la transacción y no insertan otra respuesta.
Otra clave para la misma ronda propia: 400, sin segunda escritura. La clave
compartida entre partidas también se serializa. IDs de pregunta/opción son TEXT
y se comparan exactamente; no se convierten indiscriminadamente a minúsculas.
UUID de partida/propietario/clave respetan equivalencia de mayúsculas de PostgreSQL.

Los demás escritores legacy solo bloquean partida y nunca esperan clave: no hay
inversión clave/partida. No se toca Usuario ni se llama CompetitiveService desde
la transacción. El futuro orden competitivo Usuario → partida todavía requiere
diseño conjunto. Un reintento después de cierre/reinicio devuelve estado actual
sin acción nueva; no se promete un snapshot histórico de la respuesta HTTP.

## Bloqueos técnicos de habilitación

Antes de registrar un verificador o crear un flag competitivo deben existir:
snapshot inmutable reproducible; activaciones R y Qpartida verificables;
presencia durable global y gracia/UNKNOWN; cierre con precedencia aprobada,
evidencia individual y guardas SQL; admisión explícita nueva; verificación y
recuperación idempotente por ambos participantes. No se paga sobre las tablas
legacy actuales ni se inventan resultados por desconexión. No se habilita XP.

No hay migraciones nuevas. La migración legacy y las cinco competitivas
confirmadas permanecen intactas. Rol PostgreSQL/RLS productivo pendiente;
migraciones remotas no ejecutadas. Se conservan abiertos la incertidumbre
histórica de los 34 fallos institucionales y el vencimiento intermitente de
Rescate. Memoria/Batallas y PR-I2 fuera de esta ronda; PR-I1 no fusionado a main.

## Validación de esta ronda

Las pruebas nuevas distinguen fórmulas puras de pagos reales. PostgreSQL cubre
reintentos/carreras, payload alterado, UUID equivalente, jugadores concurrentes,
privacidad, reinicio/cierre legacy, ausencia de ledger/balance/XP y dependencia
actual del banco mutable. No certifica snapshot/presencia competitiva inexistentes.
Los resultados reproducidos y finales se detallan a continuación.

### Resultados reproducidos y validación final

Tres bases PostgreSQL 16 propias, desechables e independientes; cada ejecución
aplicó las 55 migraciones confirmadas, sin migraciones nuevas. El runner no lee
`.env`, admite solo loopback con marcador de propiedad y elimina únicamente su
contenedor. Docker Engine 29.7.2, contexto desktop-linux. `postgres-local`
preservado: mismo ID `20d971cc043f`, estado running y StartedAt
`2026-10-02T21:24:22.476116454Z` antes/después.

| Ejecución | Resultado real | Diagnóstico |
|---|---|---|
| PostgreSQL antes de corregir | 122/129; 7 fallos nuevos | Todos bloqueados por `Failed to deserialize column of type 'void'`, traza `TiraAflojaService.bloquear → procesarEstado → responder`. Las 122 pruebas existentes pasaron. |
| PostgreSQL con solo cast del lock | 126/129; 3 fallos nuevos | Reintentos simultáneos: Prisma P2002 `claveIdempotencia`; payload alterado: `Missing expected rejection`; segunda clave misma ronda: error Prisma en lugar de rechazo de aplicación 400. Los otros cuatro escenarios y las 122 existentes pasaron. |
| Jest privacidad antes de corregir idempotencia | 6/9; 3 fallos nuevos | Ronda, pregunta u opción distintas con clave aceptada devolvían estado en vez de 403. |
| Build final | exit 0 | Prisma generate y Nest build, completados antes de cargar Prisma en pruebas. |
| Jest competitivo final | 153/153, 7 suites | Incluye 9 comprobaciones nuevas de reglas puras/frontera, sin afirmar pagos de Tira. |
| Jest completo final | 1034/1034, 96 suites | Incluye las tres regresiones de payload y todas las pruebas legacy WS/privacidad/reglas. |
| PostgreSQL final | 130/130; exit 0 | Ocho escenarios nuevos (se añadió carrera de clave entre dos partidas), todos pasan tras la corrección. 93,880 s. Sin skips/cancelaciones. |
| npm audit --omit=dev | 0 vulnerabilidades; exit 0 | Primer intento falló por certificado local. Repetición con `NODE_OPTIONS=--use-system-ca`, restaurado al finalizar; TLS no desactivado. |
| git diff --check | exit 0 | Sin errores de whitespace. |

50 enlaces locales Markdown/anclas comprobados en los seis documentos tocados,
todos existentes. Ninguna prueba nueva declara resuelto snapshot, presencia
durable, grace/UNKNOWN ni liquidación competitiva de Tira. Las tres ejecuciones
son diagnóstico antes/después, no tres verdes usadas como sustituto de una causa.
Las tres reproducciones de payload y las carreras en PostgreSQL demuestran la
causa de estos defectos; no demuestran la causa de los antiguos 34 fallos ni del
vencimiento intermitente Rescate, que siguen abiertos pese a pasar esta ronda.

Archivos modificados: `src/tira-afloja/tira-afloja.service.ts`, su prueba de
privacidad, `tool/test_competitive_postgres.mjs`, README raíz/API, índice docs y
resúmenes vigentes de infraestructura/Trivia-Duelo. Nuevos: este informe,
`src/competitive/competitive.tug-boundary.spec.ts` y
`test/competitive-tug-boundary-postgres.test.cjs`. Sin cambios de fórmulas,
integraciones confirmadas, schema/migraciones, Flutter o Usuario.xpTotal.
Sin commit/push/merge/despliegue/migraciones remotas. Detenido para revisión.
