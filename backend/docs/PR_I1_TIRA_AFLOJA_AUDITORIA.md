# PR-I1 V1 — auditoría y preparación de Tira y afloja

## Estado vigente — primera etapa de evidencia autoritativa

Base `39d3881`, rama `feat/pr-i1-competitive-infrastructure`; se conservan
los cambios locales de la octava ronda. Siete checkpoints confirmados por el propietario; esta octava ronda
es local y sin commit. **Tira no admite ni liquida XP competitivo**; no se registra
verificador TUG_MATCH, ni flag de admisión competitiva. Preparación de evidencia
no equivale a admisión, despliegue ni autorización de pagos.

Se implementan snapshot original inmutable, Qpartida persistido, calificación
y presentación desde el snapshot, R durable por participante y protecciones
SQL de evidencia. Los registros inferiores corresponden al séptimo checkpoint:
sus carencias de snapshot/R quedan superadas por esta sección; las decisiones
V1, precedencia de 30 s e incidencias conservan vigencia.

### Congelación y compatibilidad

Solo nuevas creaciones del servicio tienen `prepararEvidencia=true`; el default
SQL false conserva históricos y fixtures legacy. Ese marcador no se modifica
después de crear y no se expone al cliente. Recuperar/emparejar una partida
histórica no la convierte. El marcador **no concede XP** ni habilita un juego.

Cuando ambos están listos, la misma transacción bajo lock de partida toma locks
SHARE ordenados de preguntas/opciones, reconstruye el banco y activa la primera
ronda. PostgreSQL contrasta snapshot contra asignaciones y contenido original,
no solo contra datos calculados por el servicio. Falla y revierte el inicio si
el banco no permite evidencia coherente (4..20, orden único, opciones completas,
una solución por pregunta). No rellena ni reduce Qpartida después de iniciar.

Se conservan enunciado, imagen, explicación, dificultad, contexto/caso, área,
tema/subtema, opciones con sus explicaciones y corrección original, orden,
participantes internos A/B, configuración y evidenciaVersion=1. Preguntas y
opciones usan IDs TEXT exactos. No se guarda información mutable de usuario
como nombre/correo/foto. Calificación, pantalla y explicación de ronda resuelta
consultan ese contenido congelado. Legacy mantiene su banco mutable.

SQL impide modificar snapshot/Qpartida/configuración/participantes, cambiar
la marca histórica, alterar asignaciones, editar/borrar respuestas aceptadas o
eventos V1 y reabrir un terminal. Respuestas se contrastan con solución congelada,
participante, ronda y ventana. Se conservan los locks de clave → partida y la
idempotencia exacta del checkpoint 7. No se llama al liquidador ni se incorpora
un lock Usuario aislado; el orden competitivo futuro deberá coordinarse con
CompetitiveService antes de registrar el verificador.

### R, Qpartida y C

Qpartida es el total inicial (4..20), independiente de R. **Decisión aprobada:
R cuenta habilitaciones efectivas registradas por servidor para cada participante,
sin ACK del cliente.** No demuestra entrega, visualización ni participación.
La cuenta regresiva de 3 s, pausa de 1,5 s y evento RONDA_INICIADA solo programan
una ronda; no habilitan acciones ni crean R anticipadamente.

La transición SQL privada tug_record_presented_round bloquea la partida y crea
las dos filas de TiraAflojaRondaPresentada en una transacción. Cada inserción
verifica ACTIVA, ronda/pregunta congeladas, pertenencia e identidad de ambos
participantes y sus roles ESTUDIANTE actuales en PostgreSQL. No exige conexión
ni respuesta. Un constraint diferido exige ambas filas: una habilitación parcial
no puede confirmarse. Además vuelve a comprobar el plazo de la ronda registrada
(y el global) durante la validación diferida del COMMIT. Un COMMIT solicitado
cuando ahora >= min(venceEn, expiraEn) revierte las dos filas. Usa venceEn de la
fila original, aunque la partida haya cerrado o avanzado dentro de la misma
transacción. La PK partida/ronda/participante impide duplicados.

programadaEn guarda el inicio programado; presentadaEn la habilitación efectiva
con reloj PostgreSQL, a precisión de milisegundos; registradaEn la escritura,
a microsegundos. Los triggers asignan las fechas, ignorando fechas de habilitación
enviadas por quien inserta. Después de adquirir el lock verifican
inicio <= ahora < min(vencimiento de ronda, vencimiento global). El límite
superior es exclusivo, incluida la igualdad. SQL rechaza inserciones tardías,
anticipadas, de terceros, legacy o terminales y toda mutación/eliminación.

HTTP/Socket.IO y el barrido usan esa misma transición antes de admitir nuevas
respuestas. Una respuesta V1 requiere una fila confirmada de su participante,
y su fecha no puede preceder la habilitación. La comprobación se hace también
en PostgreSQL. responder() obtiene el reloj después de esperar los advisory locks,
lo refresca y revalida tras registrar la habilitación. El guard de respuestas
obtiene su propio reloj después del lock de fila y rechaza escritura fuera del
plazo aunque recibidaEn anterior pareciera válida. El abandono no crea
presentaciones; conserva solo las existentes.
La función invocada tarde devuelve sin insertar: procesamiento de vencimiento,
recuperación o HTTP tardío no reconstruyen una disponibilidad histórica.

El barrido de 1 s busca rondas dentro de ventana todavía sin dos filas. Si pierde
toda la ventana por caída, bloqueo o retraso, R de esa ronda queda cero; la
resolución legacy sin respuestas sigue su curso, sin inventar habilitación ni
cambiar relojes. El arranque recupera registros confirmados, nunca habilitaciones
pasadas no registradas. No se garantiza latencia del worker bajo una caída.
La transición durable y el guard de respuestas evitan acciones realmente
aceptadas sin evidencia, más allá de filtrar por fecha. Una futura integración
competitiva debe validar resultados con rondas omitidas antes de pagar XP.
Si se exige garantizar una habilitación puntual incluso sin solicitudes, se
necesita un scheduler durable con reclamación de trabajos entre instancias y
monitoreo; tampoco puede prometer ejecución durante indisponibilidad total de DB.

Orden conservado: clave idempotente (solo respuesta) → advisory de partida →
fila de partida → inserciones. SQL directo empieza por fila de partida y nunca
espera advisory/clave; los guards no bloquean filas Usuario después de partida.
La elegibilidad es la lectura servidor del rol al habilitar, sin afirmar que
serializa cambios administrativos de rol posteriores. Las dos filas son
atómicas; cada fecha efectiva pertenece a su inserción dentro de esa transacción.
Reinicios e instancias concurrentes reutilizan filas inmutables, sin sumar R.
C deriva de respuestas correctas aceptadas únicas, no de contadores cliente.

### Privacidad, migración y despliegue

HTTP y Socket.IO conservan listas cerradas y asientos públicos A/B: no devuelven
snapshot, IDs internos, soluciones de preguntas pendientes ni explicaciones
privadas. La solución/explicación autorizada solo aparece al resolver su ronda.
No se añaden rutas de evidencia privada.

Nueva [migración incremental](../prisma/migrations/20261003010000_tug_authoritative_evidence/migration.sql),
dependiente del esquema Tira legacy y de las migraciones confirmadas anteriores.
Añade columnas de preparación/snapshot/Q y tabla de presentación, guards y
función de registro. RLS activado y acceso directo anon/authenticated revocado
en las tablas Tira y función de registro. Producción requiere confirmar el rol
real de DATABASE_URL y grants/policies privados; pruebas como owner local no
certifican ese rol. Migración remota **no aplicada**. Verificar permisos, respaldo,
migración autorizada y esquema antes de desplegar: las lecturas Prisma ya usan
las columnas nuevas y no ocultan un esquema faltante.

### Pendientes y validación

Persisten presencia durable entre instancias, desconexión confirmada/gracia
30 s/UNKNOWN/ambos ausentes, máquina de cierre con precedencia aprobada,
admisión competitiva y verificación/replay/liquidación/recuperación de pagos.
No se interpreta HTTP sin solicitudes como abandono. No se certifica aún la
semántica completa de resultados competitivos por disponer de un snapshot.
Usuario.xpTotal, fórmulas, las cinco integraciones existentes y Flutter intactos.
Riesgos históricos de los 34 fallos y Rescate siguen abiertos; PR-I1 no fusionado
a main, Memoria/Batallas y PR-I2 fuera de alcance.

### Revisión final: COMMIT tardío y respuestas tras bloqueos

Reproducción real, previa a la corrección: 143 pruebas, 142 aprobadas y únicamente
la nueva regresión fallida (150,288 s). La transacción insertó ambas filas dentro
de la ventana: su lectura interna vio 2 y una transacción independiente vio 0.
Esperó en PostgreSQL hasta rondaVenceEn y después confirmó: quedaron 2 filas,
sin error. Quedó demostrado que validar solamente al insertar y exigir una
pareja al COMMIT no bastaba. No fue un fallo de Docker ni del historial institucional.

Corrección limitada a la migración pendiente y responder(): comprobación temporal
adicional diferida al COMMIT y comprobaciones renovadas después de bloqueos.
Se descubrió además un comportamiento de Prisma 5.22: la transacción interactiva
resolvió sin excepción aunque el COMMIT rechazado dejó cero filas. La función de
habilitación devuelve ahora si insertó una pareja nueva; responder/procesarEstado
verifican después del COMMIT que esa pareja exista, y rechazan el resultado si
falta. No interpretan la promesa Prisma resuelta como prueba de confirmación.
La prueba nativa usa psql del contenedor propio y exige el error SQL al COMMIT;
otra conserva la reproducción del comportamiento Prisma y exige rechazo del
servicio. Se preservan las aserciones de atomicidad y conservación de datos;
las comparaciones ordenan por ronda/usuario porque SQL no garantiza un orden
sin ORDER BY. No cambió ningún campo de las filas previamente confirmadas.

Se mantienen constraint inicialmente diferido y las transacciones normales del
backend; no existe SET CONSTRAINTS en el runtime. Las pruebas nuevas verifican
rollback de ambas filas tras COMMIT tardío y respuesta bloqueada hasta el límite,
conservando las presentaciones previamente confirmadas. No se amplían plazos.

Límite de la garantía: el trigger valida dentro del procesamiento del COMMIT;
no proporciona el instante físico de flush WAL o visibilidad posterior. No se
presenta presentadaEn/registradaEn como timestamp de commit. Tampoco se afirma
una garantía de tiempo real ante una pausa del motor después del último check,
ni si un operador fuerza anticipadamente SET CONSTRAINTS. Para certificar
estrictamente durabilidad observable antes del plazo, antes de habilitar XP,
hará falta evidencia posterior al commit observada dentro de ventana (o una
fuente de tiempo de commit comprobable), y excluir registros no certificados.
Esta revisión cierra el COMMIT solicitado tarde reproducido; Tira continúa sin
admisión ni liquidación competitiva, y no se declara resuelto ese límite físico.

Validación intermedia tras el guard: 144 pruebas, 142 aprobadas y dos fallidas
(155,891 s). Una exigía excepción Prisma, aunque la DB había revertido ambas
filas; motivó la prueba nativa y el control posterior del servicio. La otra
comparaba arrays sin ORDER BY y mostró solo permutación de las mismas filas.
Se corrigió el orden de consulta, manteniendo comparación completa. Una
invocación inicial de build desde la raíz falló ENOENT por no tener package.json;
se ejecutó correctamente en backend. Ninguno de estos fallos se atribuye a Docker,
PostgreSQL institucional o Rescate.

Resultados finales de esta revisión:

| Validación | Resultado final |
|---|---|
| npm run build (backend) | Exit 0; Prisma generado antes de las pruebas. |
| npm test -- --runInBand competitive | 159/159, 8 suites, exit 0; 15,316 s. |
| npm test -- --runInBand | 1040/1040, 97 suites, exit 0; 56,490 s. |
| node tool/test_competitive_postgres.mjs | 145/145, exit 0; 168,849 s; sin skips/cancelaciones. |
| npm audit --omit=dev | Exit 0, cero vulnerabilidades; TLS activo, CA del sistema y NODE_OPTIONS restaurado. |
| git diff --check | Exit 0. |
| Enlaces locales | 53 destinos existentes, sin enlaces nuevos rotos. |

Tres escenarios adicionales respecto a la revisión anterior: COMMIT nativo
posterior al límite, responder bloqueado hasta el límite y rollback Prisma
rechazado por el servicio. Persisten los casos de confirmación oportuna,
countdown, inserción tardía, atomicidad, reinicio, concurrencia, idempotencia,
privacidad, banco congelado, legacy y cero XP competitivo. Las esperas se fijan
contra los plazos originales y reloj PostgreSQL; no hay colchones/reintentos.
Las tres ejecuciones PostgreSQL de esta revisión fueron independientes y
usaron 55 migraciones confirmadas más la pendiente, en contenedores propios
desechables. La ejecución final valida la corrección, no resuelve las incidencias
históricas de 34 fallos o Rescate. El contenedor ajeno sigue intacto.

Archivos ajustados en esta revisión final: migración Tira pendiente, servicio
Tira, prueba PostgreSQL Tira y las dos auditorías especializadas. Schema, helper,
pruebas y documentos previamente modificados se preservan. Rama y HEAD siguen
feat/pr-i1-competitive-infrastructure / 39d3881; sin commit, push, merge,
despliegue, migraciones remotas, Flutter, otros juegos ni activación de XP.

### Historial: validación de la revisión anterior de R

- Build: exit 0, Prisma generado antes de cargar las pruebas.
- Jest competitivo: 159/159, 8 suites, 16,256 s.
- Jest completo: 1040/1040, 97 suites, 60,985 s.
- PostgreSQL final: 142/142, exit 0, 139,762 s, sin skips ni cancelaciones.
  Incluye dos escenarios nuevos de fechas/roles/habilitación atómica y límite
  superior/worker tardío, además de las pruebas previas de countdown, abandono,
  reinicio/concurrencia, idempotencia, SQL privado, privacidad, legacy y cero XP.
  La prueba de escrituras parciales ahora exige rechazo al commit y el test de
  permisos verifica las seis funciones privadas, sin reducir aserciones.
- Primera ejecución de esta revisión: exit 1 antes de las pruebas, por un
  delimitador de función SQL incorrecto en la migración pendiente editada.
  Se corrigió el delimitador; la ejecución final aplicó limpiamente las 55
  migraciones confirmadas más la incremental local. No fue un fallo de Docker
  ni una reproducción de HISTORICAL_MEMBERSHIP_UNKNOWN.
- npm audit --omit=dev: exit 0, cero vulnerabilidades, TLS activo con CA del
  sistema y NODE_OPTIONS restaurado. git diff --check: exit 0.
- 53 enlaces Markdown locales comprobados en los seis documentos; sin destinos
  faltantes. Docker Engine 29.7.2 / desktop-linux operativo; el contenedor ajeno
  postgres-local conserva ID y fecha de arranque, sin operaciones sobre él.

Solo se ajustaron en esta revisión schema, servicio Tira, migración pendiente,
prueba PostgreSQL Tira y los dos documentos especializados. Se preservan los
otros cambios locales de la ronda, incluido el helper de snapshot. No se
editaron migraciones confirmadas, fórmulas, los cinco juegos integrados ni Flutter.
Las incidencias históricas de 34 fallos y Rescate siguen abiertas sin causa nueva
demostrada. El rol/RLS de producción sigue pendiente; no hay migraciones remotas,
activación competitiva Tira, commit, push, merge ni despliegue.

| Historial de validación antes de esta revisión de R | Resultado real |
|---|---|
| npm run build | Exit 0; generación Prisma y compilación Nest terminadas antes de las pruebas. |
| Jest competitivo | 159/159, 8 suites; seis pruebas nuevas del constructor/lector de snapshot. |
| Jest completo | 1040/1040, 97 suites; la fixture de privacidad incorpora esCorrecta del SELECT real, sin reducir aserciones. |
| PostgreSQL exploratorio | 138/138, exit 0; ocho escenarios iniciales. |
| PostgreSQL tras emparejamiento real/guards | 139/139, exit 0. |
| PostgreSQL final | 140/140, exit 0; diez escenarios nuevos, incluye histórico con banco incompatible con preparación V1, registro de presentación según la interpretación anterior (superada) y permisos de las cinco funciones originales. 113,912 s; sin skips/cancelaciones. |
| npm audit --omit=dev | Exit 0; cero vulnerabilidades, certificados del sistema y TLS activo. NODE_OPTIONS temporal restaurado. |
| git diff --check | Exit 0. |
| Enlaces Markdown | 52 enlaces locales/anclas comprobados en seis documentos; todos válidos. |

Cada ejecución PostgreSQL utilizó su propio contenedor/banco efímero, 55
migraciones confirmadas más la incremental Tira pendiente. Una cuarta ejecución
140/140 verificó la declaración final de defaults/FK coherente con Prisma y
revocaciones explícitas de funciones también ante defaults de permisos.
No se observaron fallos PostgreSQL ni intermitencias en estas cuatro ejecuciones,
que prueban versiones sucesivas de esta ronda, no cuatro repeticiones idénticas. No se declara
resuelta ninguna incidencia histórica por esos resultados.

Las pruebas reales usan guards/JWT y gateway Socket.IO existentes. Cubren
snapshot/orden, banco modificado tras inicio, reloj de disponibilidad original
(espera únicamente hasta ese plazo, sin colchones), R sin respuestas/duplicados,
concurrencia/reinicio/barrido, manipulaciones SQL, participantes, rechazo de
acceso directo anon/authenticated, creación/emparejamiento nuevos, legacy sin
conversión y rechazo de liquidación TUG_MATCH. No certifican presencia/gracia
ni pagos competitivos todavía inexistentes. La validación de banco V1 se hace
solo al crear una partida nueva; unirse a un candidato legacy conserva su
validación original, incluso si su banco no admite snapshot V1.

Docker desktop-linux / Engine 29.7.2 disponible; `postgres-local` conserva ID
`20d971cc043f`, running y StartedAt `2026-10-02T21:24:22.476116454Z`.
Solo se retiraron contenedores propios del runner. Migraciones confirmadas
intactas. Cambios: schema, servicio/helper Tira, fixture de privacidad, dos
pruebas nuevas, runner, migración incremental y seis documentos/índices.
Sin commit/push/merge/despliegue/migraciones remotas; detenido para revisión.

## Historial — auditoría y correcciones del séptimo checkpoint

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
