# PR-I1 V1 — auditoría previa de Trivia Rush y Duelo fantasma

Fecha: 2026-10-01. Rama `feat/pr-i1-competitive-infrastructure`; HEAD inicial `76a8a47d42865e4a1813834f20f32479ed50fd35`; árbol inicialmente limpio. Infraestructura común y tres juegos individuales ya versionados. No se infiere que estén desplegados.

**Resultado: integración competitiva de ambos juegos detenida por insuficiencia de evidencia autoritativa del runtime actual.** Existe un motor servidor real para preguntas, pero no el contrato completo necesario para certificar el resultado competitivo. Se aplica la condición expresa de esta petición: «Si alguno de los juegos no posee un motor servidor suficientemente autoritativo, NO simules esa capacidad. Detalla el bloqueo y detén la integración de ese juego». No se registra un adaptador que convierta contadores legacy en evidencia competitiva.

Esto no significa que las fórmulas estén pendientes ni que estos requisitos sean imposibles de implementar. La pausa afecta a la integración: antes de habilitarla hacen falta los cambios autoritativos de sesión descritos abajo. Esta ronda entrega auditoría y pruebas de la frontera de seguridad, no una implementación funcional de Trivia/Duelo competitivo.

## Autoridad documental consultada

- `backend/docs/PR_I1_COMPETITIVE_INFRASTRUCTURE.md`, contratos/verificadores, servicio de liquidación, políticas, fórmulas y canonicalización en `backend/src/competitive`.
- `saber_plus/docs/PR_I1_AUDITORIA_FORMULAS.md`, especialmente 12.1–12.4 y 12.7. La autorización actual supera la antigua parada documental; las propuestas históricas de las secciones 4/5 no se convierten en reglas activas.
- `saber_plus/docs/PLAN_MAESTRO_COMPETITIVO.md`, para alcance y separación de juegos.
- Código Prisma, migración original de Trivia, servicio/controlador/módulo/reglas/pruebas de Trivia. Lectura de las referencias Flutter de Duelo solo para contrastar el contrato actual; ningún cambio Flutter.

La información numérica indispensable sí está disponible: half-up racional exacto, Q inmutable 10..30, Trivia `(70C+30M)/Q`, Duelo `80C/Q` más 20/10/0, sin bono en primera referencia, nominal de abandono -10, gracia de 20 s sin detener reloj. Las ayudas oficiales no invalidan por sí solas una sesión. No se sustituyen por las antiguas propuestas `floor(S/10)` o ventanas de 15 s.

## Evidencia de la auditoría

Referencias relativas a `backend`, válidas para HEAD 76a8a47:

| Aspecto | Evidencia actual | Consecuencia competitiva |
|---|---|---|
| Creación/propiedad | `src/trivia-rush/trivia-rush.service.ts:115`, `crear`, valida estudiante y usa advisory por usuario. Controlador con JWT/correo verificado. | Hay origen servidor autenticado; no hay opt-in competitivo ni modo persistido. No basta para acreditar XP. |
| Banco y Q | `seleccionarPreguntas`, línea 1037: objetivo 30, mínimo legacy 4; persiste IDs/orden/opciones. | Un banco legacy 4..9 no es competitivo válido. No hay Q competitivo ni snapshot inmutable de textos/solución/configuración. No usar preguntas respondidas como denominador. |
| Snapshot | `prisma/schema.prisma:1114`, `TriviaRushPregunta` solo conserva preguntaId, orden y opcionesOrden, con FK al banco. | Calificación/presentación/revisión leen contenido mutable. No se puede reproducir la solución original tras una edición solo con esta evidencia. |
| Respuestas | `responder`, línea 300: comprueba propietario/pregunta actual, consulta `tx.pregunta.findUnique`, calcula esCorrecta y persiste envíos/fecha/idempotencia. | Autoridad real para la recepción y cálculo de ese momento, pero sin solución inicial congelada. No fabricar replay a partir del banco actual. |
| Racha | `trivia-rush.rules.ts`: error con escudo conserva combo; salto también; segunda oportunidad produce primer envío no final. | No copiar `mejorCombo` directamente a M como si siempre fuese una racha estricta. El requisito actual exige reconstrucción por orden; el marcador de juego y la métrica competitiva deben distinguirse sin invalidar ayudas legales. |
| Tiempo | Reloj de 60/90/120 s, +10 s por ayuda servidor, rechazo de respuesta en `ahora >= venceEn`. | Hay límite de respuesta real. No existe presencia/desconexión durable ni endpoint/gateway de reconexión competitivo para aplicar la gracia. Un periodo sin responder no demuestra desconexión. |
| Cierre | FINALIZADO al agotar banco; EXPIRADO al consultar/crear/responder después del plazo; ABANDONADO explícito. `procesarVencimiento`/`marcarExpirado`, líneas 750/765. | El vencimiento guarda `finalizadoEn=ahora` de la detección, no el instante terminal original. No puede determinarse abandono por ausencia definitiva frente a cierre normal durante gracia. Afecta temporada e institución. |
| Concurrencia | Respuestas/vencimiento usan advisory por intento; `abandonar`, línea 542, hace lectura y update separados sin ese lock. Creación usa otro advisory. | No está garantizada la serialización común cierre/abandono/respuesta ni el orden Usuario → intento requerido por liquidación. No se afirma haber reproducido un deadlock: es una carencia comprobable de locks. |
| Retry | Clave UUID única y comprobación de payload antes de transacción; constraint por intento/pregunta/número de envío. | Previene varias escrituras duplicadas, pero una colisión concurrente debe recuperar el mismo resultado; el camino actual no reconsulta idempotencia dentro del lock. Las pruebas existentes no certifican toda la carrera competitiva. |
| Duelo | `obtenerFantasma`, línea 210, devuelve el mejor registro limpio por áreas, duración y versión, ordenado por puntaje/aciertos/combo/fecha. `crear` no recibe modalidad ni guarda la referencia. | Consultar un récord no demuestra qué fantasma enfrentó una partida. Puede variar entre inicio y final. Ni Q compatible ni rival fijo están certificados. |
| Primer intento | Consulta sin récord devuelve `{ fantasma: null }`; no se persiste esa ausencia como snapshot del inicio. | No puede acreditarse retrospectivamente que era primer intento. No inventar victoria/empate ni asignar el récord actual a una sesión pasada. |
| Ayudas Duelo | UI las oculta; backend comparte `activarPotenciador` sin modo. | La restricción de esa modalidad no está aplicada en servidor. No extenderla a Trivia ni declarar inválidas todas las ayudas. |
| Recuperación | `CompetitiveModule` registra solo tres verificadores individuales; reconciliador solo escanea sus tablas. | No hay cierre/cola/reconciliación competitiva de Trivia/Duelo. Un callback posterior no resolvería la caída entre cierre y ledger. |
| Protección | Schema/migración original de Trivia tienen claves/FK, pero no los guards competitivos terminales de los tres individuales. | Falta proteger snapshot, modo, referencia, respuestas y fecha terminal antes de confiar en ellos para replay/idempotencia. |

No se reclasifican intentos históricos ni se corrigen aquí las carencias competitivas mediante supuestos. La prueba PostgreSQL nueva sí detectó un defecto independiente en `bloquear`, línea 1144: `SELECT pg_advisory_xact_lock(...)` devuelve `void`, que Prisma no puede deserializar. Se corrige mínimamente a `SELECT 1::int AS locked FROM pg_advisory_xact_lock(...)`, conservando la misma clave y semántica de bloqueo. Esto permite ejecutar el camino legacy real; no lo convierte en competitivo.

## Identidad inequívoca requerida

Ambas experiencias comparten `TriviaRushController`, `TriviaRushService`, `IntentoTriviaRush`, `TriviaRushPregunta`, `TriviaRushRespuesta` y `TriviaRushPotenciador`. No se encontró motor/tabla independiente de Duelo.

La identidad de fuente ya está resuelta en infraestructura: `TRIVIA_ATTEMPT / IntentoTriviaRush.id`, UUID estándar normalizado a minúsculas. `SOURCE_FOR_GAME` asigna esa misma fuente a `TRIVIA_RUSH` y `GHOST_DUEL`. La clave de liquidación comparte fuente/intento/participante/SETTLEMENT y no incluye gameId ni rulesVersion; no debe crearse una segunda fuente para cobrar como otro modo. El gameId futuro debe derivarse de un modo servidor inmutable, nunca de lo que pida el solicitante al liquidar.

No se puede inferir modo de un GET de fantasma, del uso de ayudas, del puntaje ni de `ghostMode` visual. Los intentos históricos permanecen legacy.

## Bloqueos y requisitos para reanudar

1. **Compartidos:** snapshot privado inmutable y Q 10..30 al admitir, registro de acciones con orden verificable, cierre terminal protegido, serialización de todas las mutaciones y recuperación durable compatible con ledger existente.
2. **Presencia:** observación autenticada y persistida de desconexión/retorno, gracia exacta de 20 s, precedencia verificable de vencimiento normal y ausencia definitiva. No inventar presencia a partir de una petición tardía; no conceder 20 s extra para responder. La propuesta histórica de latidos cada 5 s no constituye evidencia de que hoy existan ni una implementación aprobada activa.
3. **Duelo adicional:** modo inmutable, selección servidor de mejor referencia elegible y compatible al inicio, snapshot de referencia o ausencia de ella, comparación reproducible y restricción de ayudas aplicada en backend. Nunca asignar retrospectivamente una referencia.
4. **Admisión:** controles separados del flag de los tres individuales, apagados por defecto, una vez que exista el camino autoritativo seguro. En esta ronda **no se crean flags decorativos ni rutas competitivas incompletas**: ambos juegos siguen sin admisión competitiva y devuelven `SOURCE_NOT_INTEGRATED` al intentar liquidar mediante la infraestructura. La solicitud de controles habilitables queda sin implementar por esta parada.

Estos son bloqueos técnicos, no nuevos coeficientes de producto. No se integra Tira, Memoria ni Batallas. PR-I1 permanece abierto.

## Pruebas y alcance real

Se añaden pruebas de frontera que verifican que activar `COMPETITIVE_SOLO_ENABLED` no habilita ninguna de estas dos modalidades, que el DTO legacy rechaza campos de XP/Q/modo/fantasma/control competitivo no contratados y que una partida legacy real, su retry y su récord fantasma no crean eventos/balances competitivos. PostgreSQL ejecuta el servicio real, privacidad de pregunta activa, cierre por banco, idempotencia de respuestas, rechazo de liquidaciones simultáneas y reconciliación sin pagos; comprueba `Usuario.xpTotal` intacto.

Estas pruebas **no** demuestran snapshot competitivo, fantasma fijo, ventana de reconexión, abandono competitivo, admisión habilitada ni recuperación competitiva de Trivia/Duelo: esas capacidades siguen bloqueadas. Las pruebas puras de fórmulas existentes tampoco las sustituyen. Los tests de crash/concurrencia de Cima/Guardián/Rescate continúan dentro de la regresión, sin extrapolarlos a Trivia/Duelo.

No hay nueva migración ni modificación de migraciones confirmadas. Se amplía el runner local existente con una prueba adicional; su mensaje ahora distingue correctamente las 52 migraciones ya versionadas de una migración pendiente, sin contar de nuevo la del checkpoint 76a8a47.

## Resultados ejecutados y limitaciones

| Comando | Resultado final |
|---|---|
| `npm run build` | Correcto. |
| `npm test -- --runInBand competitive` | 4 suites, 106/106 pruebas. |
| `npm test -- --runInBand` | 93 suites, 984/984 pruebas. |
| `node tool/test_competitive_postgres.mjs` | 63/63 pruebas, 52 migraciones confirmadas, PostgreSQL 16 local desechable eliminado. |
| `npm audit --omit=dev` | 0 vulnerabilidades; uso temporal de CA del sistema, TLS activo. |
| `git diff --check` | Sin errores. |

Primera ejecución PostgreSQL: 61/63 aprobadas. La prueba nueva falló en la creación legacy por deserialización de `void`; la corrección mínima del lock resolvió ese fallo y permitió recorrer toda la prueba sin mocks de Prisma. También falló la prueba preexistente `STAR_RESCUE: the worker alone expires an unattended attempt`: esperaba EXPIRADO y obtuvo ACTIVO. En la siguiente ejecución completa pasó sin modificar esa prueba ni el runtime de Rescate. **Causa no determinada; incidencia pendiente de investigación, no declarada corregida por una repetición verde.** No se relajaron aserciones, se omitieron tests ni se alteraron los fixtures anteriores para esconder el fallo.

Las únicas escrituras de DB se hicieron en las instancias locales desechables propiedad del runner. No se modificaron Flutter, dependencias, fórmulas ni esquema Prisma. HEAD final permanece `76a8a47d42865e4a1813834f20f32479ed50fd35`; sin commit, push, merge ni despliegues. Los cambios previos de `pubspec.yaml`/`pubspec.lock` en el repositorio Flutter siguen sin tocarse. Detención para revisión humana; no PR-I2.

## Revisión de frontera e investigación de Rescate (seguimiento)

Se conserva la corrección previa del advisory lock de Trivia; este seguimiento no añade cambios de runtime ni integra juegos.

### Qué verifican realmente las dos pruebas de frontera

| Garantía | Cobertura comprobada y reforzada | Límite explícito |
|---|---|---|
| Integración no disponible | La prueba Jest comprueba la fuente `TRIVIA_ATTEMPT` de ambos gameId y el rechazo `SOURCE_NOT_INTEGRATED` con el flag solo false/true. PostgreSQL invoca dos liquidaciones simultáneas y exige rechazo. | No hay admisión competitiva de Trivia/Duelo ni flags propios habilitables que se puedan certificar. |
| Sin liquidaciones legacy | Partida real creada/respondida/finalizada, consulta de récord, liquidaciones rechazadas y pasada del reconciliador; cero eventos/balances y xpTotal=123 intacto. | No demuestra cierre/recuperación competitiva de estos juegos. |
| Aislamiento | El DTO rechaza gameId/ghostMode/ghostId y otros campos no contratados con HTTP 400 en ValidationPipe. PostgreSQL comprueba que otro usuario no lee el intento ni reutiliza su respuesta y no obtiene su fantasma. La consulta de fantasma no crea otro intento. | **No existe aislamiento persistido entre modalidades**: comparten fuente y motor, no se simulan dos partidas de modos distintos. El aislamiento entre usuarios y el rechazo de seleccionar modo no prueban una modalidad servidor inexistente. |
| Privacidad | Lista exacta de campos de la pregunta activa y de cada opción, al inicio y durante el avance. Ausencia recursiva de correo, hash de contraseña, IDs internos de usuario/institución y campos privados competitivos en respuestas/registro fantasma. | La evaluación de una respuesta ya final permite revelar su solución según contrato legacy. No equivale a una auditoría integral de todos los endpoints, permisos de producción o RLS. |
| Idempotencia/comportamiento | Retry secuencial conserva puntos y marcador completo; el conteo real aumenta exactamente una vez por respuesta. Reutilizar clave con payload distinto o con otro usuario devuelve 403 sin añadir filas. Cierre FINALIZADO y referencia obtenida del mismo intento. | No certifica respuestas concurrentes de Trivia, ventanas de gracia, fantasma fijo ni doble pago de un futuro resultado competitivo. Las dos liquidaciones concurrentes prueban rechazo, no una liquidación válida. |

Los tests usan DTOs/servicios reales y PostgreSQL real cuando corresponde. La prueba del DTO ejecuta ValidationPipe, no una petición HTTP de extremo a extremo. No se atribuyen a estos tests capacidades que todavía no existen.

### Revisión técnica de la intermitencia

Se recorrió `test/competitive-solo-postgres.test.cjs`, helper `synthetic` y caso `the worker alone expires an unattended attempt`; también `CompetitiveReconciler`, `StarRescueService`, schema Prisma y constraints/triggers de la migración versionada.

- El fixture fija `end = Date.now() - 1000` y `start = end - 24 h`; crea historial sintético conocido y un nuevo intento ACTIVO. El original se abandona con el servicio real antes de insertar el nuevo; no se viola el índice de un activo por usuario.
- La creación del fixture se espera con await. El helper excluye competitiveRetryAt/competitiveSettledAt del original: el nuevo registro recibe su propio default de retry en DB y acuse null.
- Hay dos relojes: Date.now del proceso para el fixture y clock_timestamp de PostgreSQL para selección/vencimiento del worker. `venceEn` es timestamp sin zona, tratado como UTC; la consulta compara con `timezone('UTC', clock_timestamp())`. `competitiveRetryAt` es timestamptz(3), comparado con clock_timestamp. Revisar estas diferencias no demuestra que hubiera desfase en la ejecución histórica; no se dispone de su diagnóstico temporal.
- La selección exige versión 1, acuse null, retry vencido y estado terminal o vencimiento alcanzado, con límite de 25 ordenado por retry/id. El test espera **una pasada**, no el drenaje ilimitado de toda la cola. No se demostró que la fila fallida quedara fuera del lote histórico.
- Este caso construye un worker e invoca/espera `reconcile()` directamente. **No llama onApplicationBootstrap ni espera el intervalo de 30 s**. No existe un temporizador de ese worker que deba haber corrido antes de la aserción. Las pruebas Jest separadas cubren arranque, exclusión de pasadas, intervalo y apagado mediante reloj simulado.
- Dentro de la pasada, expiración toma Usuario → intento en una transacción y vuelve a comprobar vencimiento; después espera liquidación y acuse. El commit de expiración precede a la lectura final del test. El caso no lanza respuestas concurrentes; las carreras con respuestas se cubren en otro caso PostgreSQL que continúa ejecutándose.
- Se añadió diagnóstico **solo si la aserción va a fallar**, con reloj de proceso/DB, zona DB, estado/fechas/acuse de la fila y candidatos de una consulta posterior equivalente. No altera el escaneo original, no espera, no reintenta ni transforma el fallo en éxito. La consulta posterior ayuda a investigar, pero no se presenta como snapshot retroactivo del escaneo que falló.

No se cambió el vencimiento del fixture, el límite de lote, las esperas, el intervalo, el orden de locks ni la aserción EXPIRADO. No se añadió un retry para lograr que la prueba pase. Sin un defecto reproducido no corresponde modificar el runtime por una causa supuesta.

### Repeticiones y validación final del seguimiento

Se ejecutó cuatro veces `node tool/test_competitive_postgres.mjs`, cada vez contra una instancia PostgreSQL 16 desechable nueva, con las 52 migraciones confirmadas. Todas completaron sus 63 pruebas y eliminaron su instancia. No se reutilizó DB ni se aplicaron migraciones remotas.

| Ejecución | Condición | Resultado | Duración de pruebas reportada por Node |
|---|---|---|---|
| 1 | Ejecución individual | 63/63; caso Rescate aprobado | 14,481 s |
| 2 | Simultánea con 3, contenedores independientes | 63/63; caso Rescate aprobado | 15,674 s |
| 3 | Simultánea con 2, contenedores independientes | 63/63; caso Rescate aprobado | 15,641 s |
| 4 | Validación final junto con build y Jest | 63/63; caso Rescate aprobado | 25,707 s |

Logs locales de estas ejecuciones: `rescue-review-1.log` a `rescue-review-4.log` en el directorio temporal del usuario. Son resultados de pruebas sintéticas, no telemetría de producción. El tiempo listado no incluye creación/aplicación de migraciones/eliminación del contenedor.

Validación final: `npm run build` correcto; `npm test -- --runInBand` **93 suites, 984/984 pruebas**; `node tool/test_competitive_postgres.mjs` **63/63**; `git diff --check` sin errores.

**Incidencia de Rescate: ABIERTA, NO REPRODUCIDA en estas cuatro ejecuciones. Causa no demostrada.** Los resultados verdes no anulan el fallo histórico ni permiten atribuirlo al reloj, al intervalo, al lote o a una carrera. El diagnóstico agregado conserva el fallo y permitirá obtener más evidencia si reaparece. No hubo corrección de runtime ni nueva prueba que se presente como regresión de una causa desconocida.

Archivos tocados en este seguimiento: esta auditoría, `competitive.trivia-boundary.spec.ts`, `competitive-trivia-boundary-postgres.test.cjs` y `competitive-solo-postgres.test.cjs`. Se preservan los demás cambios de la auditoría anterior. Sin commit/push/merge, despliegue, cambios Flutter, migraciones nuevas ni integración de juegos.
