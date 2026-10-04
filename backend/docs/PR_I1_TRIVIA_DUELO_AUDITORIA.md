# PR-I1 V1 — auditoría previa de Trivia Rush y Duelo fantasma

## Estado vigente — sexto checkpoint confirmado

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `83d53da`. Los
[checkpoints, flags y dependencias](PR_I1_COMPETITIVE_INFRASTRUCTURE.md#checkpoints)
distinguen quince checkpoints confirmados de la ronda 16 local de autoridad temporal Tira, sin commit ni XP. Contratos de Trivia/Duelo intactos. PR-I1
no está fusionado a main. Trivia/Duelo tienen verificador y recuperación versionados;
no están desplegados/activados para usuarios. Tira, Memoria y Batallas siguen
pendientes de integración; no se inicia PR-I2. Migraciones remotas no aplicadas
por estas rondas; rol PostgreSQL/RLS productivo todavía sin verificación.

Contrato actual estricto: `ghostId=null` exige `outcome=null` y XP base;
fantasma presente exige VICTORIA/EMPATE/DERROTA verificable y el bono correspondiente.
Combinaciones incompatibles se rechazan sin ledger/balance. M solo considera
resultados definitivos: segunda oportunidad no final no corta; fallo definitivo
y salto sí. Igual puntaje en Duelo es empate sin desempates. Presencia autenticada,
gracia 20 s sin pausar/ampliar reloj por reconexión, EXPIRADO antes/igual al fin
de gracia y liquidación idempotente permanecen aprobados e implementados.

Los tres flags están apagados por defecto; no bloquean recuperación de admitidos.
Se conservan las incidencias históricas de los 34 fallos y vencimiento de Rescate.
[Índice backend](README.md) · [Estado y arquitectura](PR_I1_COMPETITIVE_INFRASTRUCTURE.md).
La [auditoría de Tira](PR_I1_TIRA_AFLOJA_AUDITORIA.md) documenta la ronda actual;
no modifica las integraciones confirmadas de Trivia/Duelo. Registros inferiores
de la sexta ronda sin commit describen el historial previo a `ebe40e3`.

## Historial técnico por etapa

Los registros siguientes conservan diagnósticos, propuestas y resultados en su
fecha/base. No confundir sus bloqueos ya superados ni sus conteos anteriores con
el estado vigente. La revisión del contrato al final supera la compatibilidad
antigua que aceptaba un resultado no nulo sin fantasma; no elimina el historial.

**Estado vigente — decisiones aprobadas e integración sobre `88f7045`:** segunda oportunidad no final no rompe M; M considera resultados definitivos y un fallo definitivo o salto lo interrumpe. Duelo compara solamente puntajes servidor, sin desempates de récord. Se implementa integración XP V1, con admisión nueva explícita y flags separados apagados por defecto. La parada descrita a continuación es historial superado por la aprobación expresa del propietario; véase la sección final de implementación y validación. No hay cambios Flutter, activación productiva ni liquidación retroactiva.

**Revisión para integración XP, base `88f7045` (2026-10-02):** snapshots, modalidad, referencia inicial y presencia ya están implementados y protegidos. La integración de liquidación sigue sin registrar `TRIVIA_ATTEMPT`. Esta revisión identifica dos precisiones de producto necesarias antes de convertir la evidencia en pagos; se detallan en la sección final. Los estados anteriores se conservan como historial.

**Estado actual, base `16163b7`:** el propietario aprobó la precedencia de vencimiento normal anterior o igual al fin de gracia. Se implementan presencia PostgreSQL, canal Socket.IO, gracia de 20 s y recuperación para nuevos intentos V1, sin XP. La auditoría anterior y sus dos cambios documentales se conservan abajo como historial; su parada por precedencia queda superada por la aprobación y la implementación descritas en la última sección.

**Actualización posterior al checkpoint af78ee7:** se implementa la primera etapa de evidencia autoritativa descrita al final de este informe: snapshot, modalidad y referencia inicial protegidos, y serialización de mutaciones. No se habilita XP. El diagnóstico y los resultados siguientes se conservan como historial; los puntos resueltos se detallan en la nueva sección y no deben interpretarse como carencias actuales.

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

## Primera etapa autoritativa — base af78ee7, sin XP

Rama verificada `feat/pr-i1-competitive-infrastructure`, HEAD inicial `af78ee79c13e654e996010ceb47ab4cab717347d`, working tree inicialmente limpio. Se releen ambos informes backend y las decisiones V1 de Flutter (12.1–12.4): Q 10..30 fijado al inicio, misma fuente TRIVIA_ATTEMPT, fantasma fijo y ausencia inicial explícita. No cambian fórmulas, importes ni tiempos aprobados.

### Contrato y compatibilidad

El POST de creación acepta opcionalmente `modalidad: TRIVIA_RUSH | GHOST_DUEL`. Es una solicitud de modo para **evidencia V1 sin XP**, no `competitive:true`. El servidor valida estudiante, configuración, banco y referencia; rechaza XP, Q, snapshot, versión de evidencia o fantasma suministrados por cliente. No se crea un flag de XP ni se registra un verificador.

Omitir modalidad al crear mantiene el camino legacy, con los tres campos nuevos null y mínimo previo de 4 preguntas. Nunca se infiere modo de una pantalla, ayuda o récord. Los registros históricos conservan null. Si ya hay intento activo, omitir modalidad recupera ese intento sin cambiarlo; pedir explícitamente otra modalidad o promover un legacy produce conflicto. Las modalidades explícitas requieren 10..30 preguntas y no se degradan silenciosamente a legacy si falta banco.

Las respuestas públicas de los intentos con evidencia añaden `modalidad`, `competitive:false` y `fantasmaInicial` (referencia resumida o null). Los payloads legacy conservan sus campos anteriores. La clave compartida futura seguirá siendo TRIVIA_ATTEMPT/intento/participante; no se inventa otra fuente para Duelo.

**evidenciaVersion=1 no es admisión competitiva ni xpRulesVersion.** No se concede XP ni se promete acreditar después estas partidas. Una futura habilitación necesitará su propio contrato de admisión para nuevos intentos, presencia durable y cierre/liquidación verificables; no debe activar retroactivamente los intentos de esta etapa.

### Snapshot y referencia fija

Nueva migración incremental `20261001190000_trivia_authoritative_evidence`; añade enum ModalidadTriviaRush y campos nullable evidenciaVersion, modalidad y snapshotInicial a IntentoTriviaRush. No modifica migraciones confirmadas ni rellena historia.

El snapshot JSON conserva versión, Q, áreas normalizadas, duración, versión del motor, modo, preguntas ordenadas, IDs/orden de opciones, contenido de pregunta/caso, imágenes por URL, tema/subtema, explicaciones y solución original de cada opción. No copia binarios de imágenes externas. Calificación, 50/50, presentación de preguntas y revisión/evaluación consultan esos valores para intentos V1. Las relaciones al banco se mantienen por compatibilidad/FK, pero sus valores actuales no sustituyen la evidencia original. Los intentos legacy mantienen su lectura anterior del banco.

El DB valida Q, unicidad, orden, cuatro opciones con una correcta, configuración y fechas; impide cambiar origen/modo/snapshot/configuración, promover históricos y borrar evidencia V1. Preguntas asignadas, respuestas y ayudas V1 son append-only mientras ACTIVO; una fila terminal queda inmutable. Las respuestas se contrastan con la solución del snapshot y su ventana temporal. Se conserva RLS y se revocan accesos públicos/anon/authenticated de las cuatro tablas de Trivia.

Para GHOST_DUEL se selecciona al inicio, bajo el lock de Usuario, el mejor registro propio FINALIZADO/EXPIRADO sin ayudas, con evidencia V1 protegida, mismas áreas, duración, versión del motor y Q. Puede proceder de cualquiera de los dos modos del motor compartido. Conserva el orden de mérito legacy (puntaje, aciertos, mejor combo, fecha); un empate completo de esas claves usa ID como desempate técnico estable. No se elige una referencia enviada por cliente. La referencia copia identidad, resultado, configuración, Q, fecha y checkpoints ordenados por pregunta/envío originales; nunca se recalcula en las consultas del intento.

Los récords legacy sin snapshot no son fuentes autoritativas: siguen visibles en el GET legacy de fantasma, pero no se promueven a referencia protegida. Si no existe candidato compatible protegido, el snapshot guarda ghost:null. Significa **ausencia de referencia elegible al inicio**, no inexistencia histórica de cualquier récord. No se calcula victoria/empate/derrota ni se otorga bono. El GET legacy puede seguir mostrando un récord nuevo: no modifica fantasmaInicial de ningún intento V1.

Duelo explícito rechaza ayudas también en backend/DB, conforme al contrato documentado; las ayudas oficiales de Trivia siguen permitidas. El combo propio del motor conserva escudo/salto/segunda oportunidad. No se introduce una métrica M competitiva ni se usa automáticamente ese contador como racha estricta para XP.

### Concurrencia y fecha terminal

Creación mantiene advisory por usuario y añade lock de Usuario/revalidación de rol. Respuesta y ayuda serializan su clave idempotente UUID canónica, luego Usuario → intento; la ayuda bloquea además su concesión. Reconsultan la clave dentro de la transacción y validan payload/propietario antes de decidir que una respuesta es nueva. El mismo retry, incluso con capitalización UUID distinta, reutiliza el registro; no aumenta respuesta/puntaje/consumo. IDs de preguntas/opciones no se normalizan como UUID.

Abandono y vencimiento usan también Usuario → intento. Creación, respuestas, abandono y expiración ya no pueden cerrar el mismo intento mediante caminos sin ese bloqueo común. No se llama a CompetitiveService desde estas transacciones ni se altera su orden de locks. Los triggers de hijos serializan además sobre el intento antes de aceptar evidencia.

Para evidencia V1, la expiración detectada después usa finalizadoEn=venceEn, incluso si se detecta al abandonar; no acepta respuestas con timestamp igual o posterior al límite. Finalizar sigue sin permitir que el cliente elija el resultado. Si el banco ya se agotó, un abandono posterior no cambia ese terminal. Los históricos/legacy conservan su fecha anterior de detección de vencimiento. Tiempo extra oficial conserva su +10 s y se registra una sola vez por concesión/retry.

Esto no implementa presencia ni gracia de 20 s. EXPIRADO por reloj no se transforma en abandono competitivo y no genera penalización. No hay worker de cierre/recompensa de Trivia ni ledger de estos juegos. Una caída revierte la transacción en curso y conserva lo ya confirmado; no se afirma recuperación competitiva terminal→ledger todavía.

### Despliegue y pendientes

La migración nueva debe aplicarse, con autorización y respaldo, antes del backend que consulta las columnas nuevas. Verificar esquema, funciones/triggers y rol efectivo/RLS del backend; los resultados locales con owner no confirman permisos de Supabase. No se ocultan errores por columnas ausentes. No se aplicó ninguna migración remota ni se tocó el esquema de los tres juegos ya integrados.

Quedan pendientes presencia/desconexión autenticada durable, gracia real de 20 s, resolución definitiva del cierre normal frente a ausencia, futuros controles de admisión competitiva, replay competitivo completo, verificador y recuperación/liquidación idempotente. Las fórmulas V1 siguen intactas. **La incidencia intermitente de vencimiento de Rescate permanece abierta sin causa demostrada.**

### Validación de esta etapa

| Comando | Resultado final |
|---|---|
| `npm run build` | Correcto; cliente Prisma generado localmente. |
| `npm test -- --runInBand competitive` | 4 suites, 111/111 pruebas. |
| `npm test -- --runInBand` | 93 suites, 989/989 pruebas. |
| `node tool/test_competitive_postgres.mjs` | 73/73 pruebas; 52 migraciones confirmadas más la nueva migración local. |
| `npm audit --omit=dev` | 0 vulnerabilidades; CA del sistema temporal, TLS activo. |
| `git diff --check` | Sin errores. |

Los diez casos PostgreSQL nuevos prueban snapshot frente a cambios de contenido/soluciones, privacidad y protección SQL; banco insuficiente con compatibilidad legacy; modo y ausencia/referencia fija; exclusión de récord legacy y duración incompatible; creación/respuesta concurrentes e idempotencia UUID; última respuesta contra abandono; vencimiento contra respuesta tardía; 50/50 contra banco editado y prohibición de ayudas en Duelo; segunda oportunidad, tiempo extra, salto y escudo; RLS/denegación de roles públicos. Los casos de evidencia mantienen cero ledger/balance competitivo y XP general intacto. La referencia sigue fija aunque el GET legacy pase a mostrar un récord mejor.

Primera ejecución PostgreSQL antes de ampliar cobertura de ayudas/referencias: 71/71. Ejecución final: 73/73, incluidos los 63 casos previos. Ambas instancias fueron eliminadas por el runner; no hubo fallos intermitentes en esta etapa. Esto no resuelve la incidencia histórica de Rescate. No se modificaron su test/diagnóstico ni el runtime de los tres individuales.

Se comprobó por diff que fórmulas, CompetitiveService, registry/módulo, reconciliador y migraciones ya confirmadas no cambiaron. HEAD final permanece af78ee79c13e654e996010ceb47ab4cab717347d. No commit, push, merge, despliegue, migración remota ni cambio Flutter. Se detiene para revisión humana con PR-I1 abierto.

## Revisión del cuarto checkpoint — privacidad HTTP e integridad del fantasma (2026-10-02)

Esta revisión conserva los cambios de la etapa anterior y refuerza únicamente el test PostgreSQL de evidencia, la migración **nueva sin confirmar** `20261001190000_trivia_authoritative_evidence` y este informe. HEAD sigue siendo `af78ee7`. Las cifras de la sección anterior corresponden a aquella etapa.

### Contrato HTTP verificado

El test levanta una aplicación Nest local con `TriviaRushController`, `TriviaRushService`, `JwtGuard`, `EmailVerificadoGuard`, JWT de prueba, Prisma/PostgreSQL real y el mismo ValidationPipe de producción. No sustituye el servicio ni los guards por mocks. No levanta el AppModule completo ni certifica proxy, límites HTTP o configuración de producción.

- Se ejercitan creación y reanudación, intento activo, consulta por ID, consulta legacy de fantasma, respuestas/retry, potenciadores, finalizar y abandonar. Se cubren los modos explícitos TRIVIA_RUSH/GHOST_DUEL y creación legacy sin modalidad.
- Mientras la partida está activa se rechazan recursivamente claves privadas (`snapshotInicial`, `questions`, `esCorrecta`, `explicacion`, `respuestaCorrectaId`, datos privados de usuario), excepto el objeto de evaluación expresamente autorizado y comprobado con lista exacta de campos escalares. La evaluación final revela únicamente la solución de la respuesta aceptada; la siguiente pregunta permanece pública sin solución. La primera respuesta errónea con segunda oportunidad mantiene solución y explicación en null.
- El primer Duelo sin referencia y el siguiente con referencia se comprueban vía HTTP; `fantasmaInicial` tiene solo identidad, resumen, configuración y checkpoints, sin preguntas/soluciones. La revisión terminal solo contiene la pregunta efectivamente respondida; las pendientes no se incluyen.
- Se comprueban autenticación, lectura/retry de otro usuario rechazados, rechazo de snapshot enviado por cliente, ruta de snapshot inexistente y retry sin respuesta duplicada. El terminal y su consulta por finalizar conservan la misma revisión. Se mantienen cero eventos/balances y `Usuario.xpTotal` intacto.

### Validación independiente en PostgreSQL

El trigger reconstruye los checkpoints desde respuestas finales persistidas y el orden original de preguntas del snapshot: orden de pregunta, número de intento, suma acumulada de `puntosOtorgados` y segundos transcurridos limitados a la duración base. Conserva un checkpoint por respuesta, incluso si varias comparten segundo. No sustituye el orden por timestamps ni coalesce checkpoints. Fechas y segundos usan la precisión canónica de milisegundos de Prisma/JavaScript; el formato de fecha es UTC ISO con tres decimales, independiente de la zona horaria de la sesión SQL.

Se exige igualdad JSON del objeto completo con la referencia reconstruida: identidad, puntaje, aciertos, combo, fecha terminal, Q, configuración y checkpoints. Se rechazan también claves extra, de modo que no se pueda añadir un snapshot privado al fantasma. No se cambia el resultado fuente ni se implementa una nueva fórmula de puntos/XP.

Las condiciones de elegibilidad siguen documentadas arriba: registro propio protegido V1, FINALIZADO/EXPIRADO, sin ayudas y configuración/Q compatibles. El servicio sigue seleccionando el mejor elegible; no se introduce elección por cliente, una modalidad fuente exclusiva ni una nueva política de bonos. Históricos sin evidencia no se promueven y `ghost:null` sigue siendo válido. La DB verifica correspondencia y elegibilidad; la elección del mejor candidato continúa bajo el lock de Usuario del servicio.

Las pruebas intentan insertar fecha terminal falsificada, checkpoints con tiempo/puntaje/cantidad/orden alterados, marcador/aciertos/combo incompatibles, otro propietario, referencia legacy FINALIZADO, fecha ausente y claves privadas adicionales. Todas deben fallar por el guard; las inserciones legítimas con referencia y sin ella deben pasar.

### Límites conservados

No hay habilitación de XP de Trivia/Duelo, verificador competitivo, gracia basada en ausencia HTTP ni cambios en fórmulas o juegos ya integrados. RLS permanece activo; los permisos del rol efectivo de producción siguen como gate de despliegue, no certificados por el owner local. **La incidencia intermitente de Rescate permanece abierta sin causa demostrada**; no se alteran esperas, aserciones ni runtime para ocultarla.

### Resultados de esta revisión

| Comando | Resultado |
|---|---|
| `npm run build` | Exit 0; generación Prisma y compilación correctas. |
| `npm test -- --runInBand competitive` | Exit 0; 4 suites, 111/111 pruebas. |
| `npm test -- --runInBand` | Exit 0; 93 suites, 989/989 pruebas. |
| `node tool/test_competitive_postgres.mjs` | Dos ejecuciones locales: 78/78 en ambas; segunda con las aserciones finales reforzadas. 52 migraciones confirmadas más la nueva pendiente, PostgreSQL 16 desechable. Instancias eliminadas por el runner. |
| `npm audit --omit=dev` | Exit 0; 0 vulnerabilidades. `--use-system-ca` temporal y TLS activo. |
| `git diff --check` | Exit 0; sin errores de whitespace. |

No se reprodujo el fallo de Rescate en estas dos ejecuciones y no se atribuye una causa. No se editaron migraciones confirmadas, Flutter, fórmulas ni los tres juegos integrados. No se hizo commit, push, merge, despliegue ni migración remota. Se detiene para revisión humana.

## Auditoría de presencia y reconexión — base 16163b7 (2026-10-02)

Inicio verificado: rama `feat/pr-i1-competitive-infrastructure`, HEAD `16163b76cb7a6f4386ec35fef54ad58bb5699bd6`, árbol limpio. Se releen este informe, la infraestructura común y las decisiones Flutter (solo lectura), en particular secciones 12.4 y 12.7 del informe de fórmulas y sección 6 del plan maestro. La migración `20261001190000_trivia_authoritative_evidence` ya está confirmada y no se modifica.

### Señales existentes y alcance de su autoridad

| Componente inspeccionado | Evidencia en el repositorio | Qué demuestra / qué falta |
|---|---|---|
| Autenticación HTTP | `auth/auth.module.ts`, `jwt.guard.ts`, `email-verificado.guard.ts`: JWT HS256 con expiración de 8 h, verificación de firma y consulta de usuario; validaciones de correo/contraseña inicial. | Identidad válida para una petición. No demuestra conexión continua, salida de pantalla ni desconexión cuando dejan de llegar solicitudes. No hay una sesión de transporte de Trivia vinculada al token. |
| Trivia/Duelo | `trivia-rush.module.ts` registra controlador y servicio; `trivia-rush.controller.ts` expone únicamente HTTP. Prisma conserva intento, preguntas, respuestas y ayudas. | Propiedad y actividad persistidas, no conexiones, eventos de presencia, instancia propietaria o época de conexión. Una respuesta aceptada prueba esa acción, no presencia posterior. |
| Transporte disponible | Dependencias Nest WebSockets/Socket.IO y `tira-afloja.gateway.ts`, namespace `/tira-afloja`. | Existe tecnología reutilizable; **no falta soporte WebSocket en el proyecto**. No existe gateway de Trivia/Duelo ni asociación de sus intentos con este transporte. |
| Autenticación WS actual | `tira-afloja-ws-auth.service.ts`: verifica JWT del handshake y usuario ESTUDIANTE, correo y contraseña inicial. | Identidad en la conexión de Tira. No constituye autenticación persistida de una conexión de Trivia, ni revalidación durable en cada reconexión de estos modos. |
| Entrada/salida observables | Gateway de Tira: `handleConnection`, `handleDisconnect`, `unirAPartida`; consulta `fetchSockets()` de la sala de usuario antes de emitir salida. | Puede observar conexión/cierre de un socket mientras vive el proceso. La salida se emite al cliente, no se registra en PostgreSQL. No demuestra una desconexión pasada si el proceso murió antes de observarla o persistirla. |
| Detección y recuperación de transporte | `pingInterval:25000`, `pingTimeout:20000`, `connectionStateRecovery.maxDisconnectionDuration:120000`. | Son parámetros de Tira, **no la gracia V1 de Trivia/Duelo**. El instante físico de pérdida de red no equivale al de detección. No se reutilizan esos 120 s ni el ping timeout como política competitiva. |
| Latido | `tira:latido` limita frecuencia y devuelve `new Date().toISOString()`. | No escribe presencia ni mantiene una concesión durable de conexión. No basta cambiar el nombre del evento para volverlo evidencia competitiva. |
| Varias instancias | No se encontró `useWebSocketAdapter`, adaptador Redis/distribuido o registro compartido de conexiones en el arranque. El publisher de Tira es un `Subject` RxJS local. | El conteo local no excluye otra conexión viva en otro backend. Eventos, salas y notificaciones actuales no certifican presencia global ni sobreviven a reinicios. |
| Política pura | `competitive.policy.ts::definitiveAbsence` y `RECONNECTION` fijan 20 s y requieren `disconnectedAt`. | Evalúan evidencia recibida; no la producen, autentican o persisten. No resuelven el orden entre resultado normal y ausencia de un juego con reloj. |

Un cierre WebSocket observado es una señal servidor válida sobre **esa conexión**, pero no por sí solo sobre todas las conexiones del participante ni sobre la causa (cliente/red/backend). No se acepta `disconnected:true`, timestamp del dispositivo, falta de HTTP ni fallo del proceso como sustituto de esa evidencia.

### Decisión de precedencia que falta concretar

V1 sección 12.4 aprueba **20 segundos con reloj continuo**, y dice expresamente que «los latidos/presencia y el orden entre vencimiento normal y abandono requieren evidencia y contrato durable». La sección 12.7 exige serialización y evidencia, pero no selecciona el resultado de los siguientes casos. La sección 5 contiene propuestas históricas superadas; no se promueve su texto a una decisión vigente.

Ejemplo con inicio en t=0 y plazo en t=60: última conexión perdida y observada en t=50; la gracia terminaría en t=70.

- Retorno en t=65: no puede admitir respuestas después de t=60, pero falta explicitar si se consolida un resultado normal con fecha t=60 y cómo se registra la gracia aún abierta.
- Sin retorno hasta t=70: falta decidir si el vencimiento t=60 ya produjo resultado normal irrevocable o si la ausencia definitiva cambia la clasificación a abandono. Ambas opciones tienen consecuencias distintas para el futuro XP y no deben elegirse por orden accidental de ejecución del worker.
- Vencimiento, fin de gracia y reconexión en el mismo instante: falta fijar la precedencia de clasificación y el punto autoritativo de aceptación del retorno. La política pura existente considera definitiva la ausencia a partir de `disconnectedAt + 20000`; no especifica cómo ordenarla frente a un retorno simultáneo.

**Incompatibilidad concreta que debe resolver el diseño elegido:** el CHECK confirmado `trivia_evidence_context` exige `finalizadoEn <= venceEn`, y para EXPIRADO exige igualdad. El trigger hace inmutable el terminal. Por tanto, abandonar en t=70 con `finalizadoEn=t=70` cuando `venceEn=t=60` sería rechazado; reabrir un EXPIRADO para reclasificarlo también. No se cambia el constraint, se retrasa el reloj ni se inventa una fecha t=50/t=60 para el abandono. Si la decisión requiere resultado provisional o fecha de resolución separada, habrá que diseñar una migración incremental y su contrato explícito.

Los 20 s, fórmulas y penalizaciones aprobadas no se reabren. El almacenamiento distribuido y las épocas de conexión son requisitos técnicos implementables, no nuevas decisiones económicas. Lo pendiente de producto es la **clasificación/fecha terminal y desempate temporal** cuando se superponen los hechos indicados.

### Arquitectura propuesta para la siguiente implementación (no implementada)

Se puede construir un transporte dedicado a Trivia/Duelo reutilizando Socket.IO y el patrón de JWT, sin importar ni cambiar el motor de Tira. PostgreSQL sería la fuente compartida de presencia; la memoria del proceso solo representaría sus sockets locales. La propuesta requiere:

1. Admisión explícita de nuevos intentos al contrato de presencia y asociación autenticada usuario–intento–conexión. No promover legacy, históricos ni intentos V1 anteriores que no aceptaron ese contrato; no sancionar una partida HTTP porque nunca abrió un socket nuevo.
2. Identificador servidor de conexión y de arranque/instancia, generación monotónica y eventos persistidos de conexión, observación autenticada, cierre observado y reconexión. No guardar JWT, soluciones o snapshots en eventos públicos de presencia. RLS privado y tiempo común servidor/DB para ordenar hechos entre instancias.
3. Registro compartido de conexiones simultáneas, con protección contra un callback viejo que cierre una conexión nueva. Resolver el estado agregado bajo Usuario → intento → conexión/evento; claves idempotentes servidor y secuencia durable. Un contador de sockets local no es suficiente.
4. Distinguir una desconexión efectivamente observada de una conexión cuyo observador dejó de funcionar. La pérdida de una instancia/DB no prueba la hora de desconexión del jugador. Un lease técnico puede detectar observación obsoleta, pero no autoriza retrofechar abandono; conservar incertidumbre y diseñar recuperación explícita. No se fija aquí un timeout técnico como si fuera una regla aprobada.
5. Tras fijar la precedencia anterior, integrar cierre/retorno/respuestas/ayudas/abandono con los mismos locks y con el plazo original. Persistir los plazos y decisiones antes de confirmar al cliente; reconciliar desde DB al arrancar y periódicamente, sin depender de callbacks perdidos ni timers en memoria. Un terminal confirmado permanece único e inmutable.
6. Probar dos procesos/instancias reales, caída antes/después de persistir un evento, mensajes duplicados/tardíos, reloj controlado y fronteras exactas. El mecanismo de fan-out puede ser independiente de la autoridad PostgreSQL; no se exige Redis como única solución ni se da por instalado.

No se presenta este diseño como una arquitectura ya utilizada en runtime. El encargo permite detener la parte que no dispone de mecanismo autoritativo suficiente: no se añade un gateway parcial que simule presencia durable, ni una tabla sin productor confiable de eventos. La implementación funcional de presencia, gracia y cierre por desconexión queda detenida para revisar los puntos anteriores.

### Garantías que ya existen y pruebas que aún no existen

En `16163b7`, las mutaciones de Trivia usan Usuario → intento y reconsultan estado bajo lock. El vencimiento V1 fija `finalizadoEn=venceEn`; los triggers preservan terminal, snapshot y respuestas. Las pruebas PostgreSQL existentes cubren respuesta final contra abandono, respuesta tardía contra vencimiento, creaciones/retries concurrentes, privacidad HTTP, fantasma protegido y ausencia de XP. Se ejecutan sin modificarlas ni reducir aserciones.

Eso **no prueba** conexión/desconexión de Trivia, retorno dentro/fuera de gracia, vencimiento durante una desconexión observada, reinicio del observador, recuperación de presencia ni varias instancias. No se agregan tests que afirmen esas funciones inexistentes. Las pruebas WS de Tira usan un servicio de autenticación simulado; tampoco certifican JWT/presencia durable de Trivia. El reinicio de reconciliadores de los tres juegos individuales no se extrapola a estos dos modos.

Funcionalidades nuevas de runtime en esta ronda: **ninguna**. Migraciones nuevas: **ninguna**. Fuente compartida TRIVIA_ATTEMPT, legacy, Usuario.xpTotal y rechazo de liquidación se mantienen intactos. La incidencia de Rescate continúa abierta sin causa demostrada.

### Validación ejecutada sobre 16163b7

| Comando | Resultado real |
|---|---|
| `npm run build` | Exit 0; Prisma y Nest correctos. |
| `npm test -- --runInBand competitive` | Exit 0; 4 suites, 111/111 pruebas. |
| `npm test -- --runInBand` | Exit 0; 93 suites, 989/989 pruebas. |
| `node tool/test_competitive_postgres.mjs` | Exit 0; 78/78 pruebas, 53 migraciones confirmadas en PostgreSQL 16 local desechable; contenedor eliminado por el runner. |
| `npm audit --omit=dev` | Exit 0; 0 vulnerabilidades, CA del sistema temporal, TLS activo. |
| `git diff --check` | Exit 0; sin errores. |

El caso `STAR_RESCUE: the worker alone expires an unattended attempt` pasó; no se demuestra la causa del fallo histórico y la incidencia sigue abierta. No hubo fallos nuevos que corregir. Los logs de esta ejecución están en el temporal del usuario, prefijo `pr-i1-presence-` (build, competitive, all y pg); describen pruebas sintéticas locales, no producción.

Únicos archivos modificados: este informe y el encabezado de estado de `PR_I1_COMPETITIVE_INFRASTRUCTURE.md`. HEAD sigue en `16163b7`; no hubo commit, push, merge, despliegue, migración remota, cambios Flutter ni avance PR-I2. Se detiene para revisión humana del contrato de precedencia y del diseño de presencia.

## Implementación de presencia durable — decisión aprobada y continuación sobre 16163b7

### Precedencia aprobada por el propietario

**El vencimiento normal prevalece si ocurre antes o al mismo instante en que termina la gracia de desconexión.** Se aplica una comparación de plazos persistidos, no el orden en que llegue el worker. La gracia dura exactamente 20 s desde la desconexión observada de la última conexión válida; no pausa, amplía ni reinicia el reloj del intento.

| Evidencia (segundos desde inicio) | Resultado implementado |
|---|---|
| Desconexión t=10, gracia hasta t=30, vencimiento t=60; sin retorno | ABANDONADO, finalizadoEn=t=30. También si el worker reaparece después de t=60. |
| Desconexión t=50, gracia hasta t=70, vencimiento t=60 | EXPIRADO, finalizadoEn=t=60. |
| Retorno t=55 tras desconexión t=50 | Continúa con el mismo plazo t=60. |
| Retorno t=65 y vencimiento t=60 | No reabre; devuelve EXPIRADO. |
| Fin de gracia y vencimiento ambos t=60 | EXPIRADO, finalizadoEn=t=60. |
| Retorno exactamente al fin de gracia, siendo esta anterior al vencimiento | La ausencia ya es definitiva (`>=` según la política V1 existente); no reabre ABANDONADO. |

No se reescriben los terminales existentes. Se conservan las restricciones `finalizadoEn <= venceEn` y EXPIRADO en su plazo. La migración nueva añade un guard que rechaza una clasificación/fecha incompatible con una gracia que terminó antes. El cierre normal por respuestas y el abandono explícito anteriores a los plazos mantienen su comportamiento. Las ayudas oficiales preexistentes mantienen su semántica; **la presencia/reconexión no concede tiempo extra**, ni añade 20 s al plazo que tenga legalmente el intento.

### Implementación real y contrato de transporte

- `TriviaRushService.crear` asigna `presenciaVersion=1` solo a intentos nuevos creados con modalidad explícita y evidencia V1. Es inmutable. Los intentos existentes, incluidos V1 del checkpoint previo, conservan null; el camino legacy sigue sin presencia. No se migran ni promueven partidas históricas y no se promete XP retrospectivo.
- Canal Socket.IO `/trivia-presence`. Handshake: `auth: { token: <JWT existente>, attemptId: <UUID del intento> }`. El servidor valida firma/expiración, estudiante, correo/contraseña inicial y propiedad del intento. Reutiliza únicamente el servicio de autenticación WS existente, no el motor ni la presencia de Tira. La admisión SQL vuelve a validar propietario, versión y rol bajo lock.
- El servidor genera un UUID de conexión por handshake y un UUID de instancia por arranque. No acepta identidad de conexión, hora de desconexión o resultado desde Flutter. El único mensaje público de estado es `trivia:presencia: { estado }`; el error de admisión es genérico y no expone snapshots, soluciones, tokens, propietario ni filas de presencia.
- No hay evento cliente `disconnected:true` ni latido cliente que cambie el estado. `handleDisconnect` observa el cierre real del socket; solo la última conexión observada como cerrada, sin otra OPEN o UNKNOWN, abre la gracia. Conexiones de otras instancias cuentan por su registro PostgreSQL, no por salas locales.
- Se conserva la configuración compartida de Engine.IO usada por Tira: WebSocket, buffer 100000, ping 25 s, timeout 20 s y recuperación de transporte hasta 120 s. Una prueba compara todas las opciones salvo namespace para evitar que el orden de inicialización cambie Tira. **Los 120 s no son la gracia del juego**; un socket recuperado debe autenticarse y consultar el terminal durable, que nunca se reabre.

El instante observado de cierre de transporte no es necesariamente el instante físico de pérdida de Internet. Ping timeout y cierre de socket son señales observadas por el backend mientras vive; no prueban culpa del usuario. La gracia comienza al persistir la observación servidor, sin retrofechar al último HTTP/ping ni al reloj del cliente. Si no puede persistirse, no se inventa posteriormente su hora.

### Persistencia y recuperación entre instancias

Nueva migración incremental **`20261002190000_trivia_presence`**. No modifica ninguna confirmada. Añade `presenciaVersion` y las tablas privadas:

| Tabla | Función |
|---|---|
| TriviaPresence | Estado agregado por intento: desconexión observada y plazo de gracia exacto. |
| TriviaConnection | Identidad intento/conexión/instancia, conexión y última observación, lease técnico y estado OPEN/CLOSED/UNKNOWN/RETIRED. |
| TriviaPresenceEvent | Historial append-only de conexión, cierre, incertidumbre, retiro, gracia y cierre terminal; fecha efectiva/observada y fecha de registro DB separadas. Para EXPIRED/ABANDONED, observedAt conserva el plazo terminal que se resolvió; recordedAt muestra cuándo se persistió la recuperación. |

Las funciones SQL toman Usuario → intento antes de evaluar o modificar evidencia. El tiempo de producción se obtiene de PostgreSQL **después de adquirir los locks**. Las fechas explícitas de las funciones son una entrada interna para fixtures con reloj controlado, nunca un parámetro público HTTP/WS. Su ejecución y las tablas/secuencia se revocan a PUBLIC/anon/authenticated; RLS permanece activo. Los eventos no pueden editarse/borrarse; identidad de conexión y estados cerrados no pueden reescribirse o reabrirse. Nuevos triggers rechazan respuestas/ayudas posteriores al plazo terminal también al escribir directamente en DB.

Cada instancia revalida JWT/usuario y renueva sus conexiones observadas cada 5 s. El lease técnico dura 20 s, **separado de la gracia competitiva**, y su expiración solo produce UNKNOWN. No sanciona ni declara desconexión del estudiante. Es un parámetro de salud del observador; no concede tiempo de juego.

Si una instancia muere, DB falla o la observación caduca, quedan filas recuperables. UNKNOWN bloquea atribuir abandono a la mera desaparición del observador. Una nueva conexión autenticada retira observadores UNKNOWN, limpia una gracia aún válida y establece presencia actual sin inferir la historia perdida. Una conexión CLOSED/RETIRED nunca vuelve a OPEN; sus callbacks tardíos/duplicados son inocuos. El apagado normal registra incertidumbre en vez de simular que el usuario abandonó. Si no vuelve a existir evidencia suficiente, el intento termina por su reloj normal; no se fabrica una penalización.

`TriviaPresenceService` reconcilia al arrancar y cada 5 s, con lote de hasta 100 pendientes y exclusión de pasadas dentro de cada proceso. Varias instancias pueden ejecutar el mismo trabajo: locks y terminal inmutable impiden duplicarlo. Las filas son la cola durable. Un error se registra sin ocultarlo; el pendiente permanece en DB y las siguientes pasadas reintentan. El cierre y su evento se confirman en una sola transacción. El proceso puede caer antes del commit (rollback) o después (el siguiente reintento ve el mismo terminal, sin otro evento).

Creación/reanudación y mutaciones HTTP de Trivia consultan este mismo cierre bajo locks. Los guards SQL impiden aceptar respuestas después del plazo aunque la carrera ocurra entre comprobación y escritura. No se llama a CompetitiveService ni se registra un verificador de XP; se conserva TRIVIA_ATTEMPT y Usuario.xpTotal.

### Compatibilidad, límites y despliegue pendiente

El contrato de presencia comienza con la primera conexión autenticada del intento nuevo. **No abrir el canal nunca se interpreta como abandono**: el intento vence normalmente. La ausencia de peticiones HTTP no abre gracia. Flutter no se modificó y deberá adoptar el canal en una etapa posterior; antes de habilitar XP habrá que exigir y verificar la admisión competitiva completa. Tener presenciaVersion=1 no es competitive=true ni autorización de pago.

La detección física de cortes depende del transporte y de que exista un observador operativo. No es posible reconstruir una desconexión que ningún proceso persistió; ese caso queda explícitamente incierto, con cierre normal por reloj. Las pruebas locales no certifican latencia de producción, balanceador, reparto de carga o capacidad operativa. El worker procesa lotes limitados, por lo que la escritura del terminal puede ser eventual; su fecha efectiva no cambia por la demora.

Antes de despliegue autorizado: respaldo/revisión, verificación del rol PostgreSQL efectivo y RLS (incluidos EXECUTE de funciones y uso de secuencia), aplicación de las migraciones pendientes, comprobación de esquema/permisos y luego backend. El código consulta la columna nueva también al leer intentos; no funciona contra el esquema previo y no añade fallback que oculte columnas ausentes. No se ejecutó nada remoto. No se activan flags ni liquidaciones de Trivia/Duelo, ni se cambian fórmulas, Tira, Memoria, Batallas, Cima, Guardián o Rescate.

### Evidencia de pruebas de esta implementación

PostgreSQL prueba ambos modos con tiempos controlados t=10/30/50/55/60/65/70, igualdad exacta, límites de respuesta SQL y terminal incompatible, varias conexiones/instancias, duplicados y callbacks antiguos, caducidad del observador, retorno autenticado y conservación del reloj. También rollback del cierre, recuperación con otro cliente/worker, respuesta frente a dos reconciliadores, eventos terminales únicos, RLS, inmutabilidad, legacy/históricos y cero XP.

Hay dos aplicaciones Nest reales con puertos/IDs de instancia distintos y JWT/Socket.IO/Prisma reales: prueban conexión propia, token inválido, usuario inexistente, intento ajeno, desconexión real del primer y último socket, retorno y privacidad. La espera del test sigue la finalización de la operación SQL real, sin sleeps que oculten carreras. Además un **proceso Node hijo** persiste una conexión y termina sin ejecutar limpieza; el proceso padre recupera UNKNOWN, sin fabricar abandono. Las aplicaciones WS simultáneas comparten el proceso del test; no se presenta eso como una prueba de balanceador o despliegue distribuido real.

Jest usa reloj simulado para inicio periódico, exclusión de pasadas, apagado, fallo de DB y continuación después del error. Las pruebas previas permanecen sin debilitar. La incidencia histórica de Rescate sigue abierta mientras no exista causa demostrada.

### Validación final e incidencia descubierta

**Esta implementación permanece pendiente de cerrar la validación PostgreSQL; no se declara lista para checkpoint.**

| Validación | Resultado real más reciente |
|---|---|
| `npm run build` | Exit 0. |
| `npm test -- --runInBand competitive` | Exit 0; 5 suites, 115/115 pruebas. |
| `npm test -- --runInBand` | Exit 0; 94 suites, 993/993 pruebas. |
| `node tool/test_competitive_postgres.mjs` | Ejecuciones incrementales 90/90, 91/91 y 92/92. La siguiente ejecución completó **58/92, con 34 fallos** en cobertura institucional de las pruebas comunes/individuales. Las 14 nuevas de presencia pasaron en esa ejecución. Las repeticiones diagnósticas posteriores no pudieron comenzar por Docker local indisponible. |
| `npm audit --omit=dev` | Exit 0; 0 vulnerabilidades; CA del sistema temporal y TLS activo. |
| `git diff --check` | Exit 0. |
| Sintaxis Node del runner y test CJS | Correcta. |

Los fallos de la ejecución `pr-i1-presence-complete-pg.log` incluyen `HISTORICAL_MEMBERSHIP_UNKNOWN` al resolver membresía `desde <= terminalAt`, y aserciones derivadas de ausencia de ledger. La prueba `STAR_RESCUE: ledger committed but acknowledgment lost reuses event after restart` obtuvo 0 eventos en vez de 1, acompañada por el mismo error institucional. La prueba histórica `STAR_RESCUE: the worker alone expires an unattended attempt` sí pasó; **su incidencia anterior permanece abierta y no se atribuye a esta nueva incidencia**.

Se inspeccionó que la fuente sintética fija terminalAt con Date de Node, mientras el trigger institucional usa clock_timestamp de PostgreSQL. Una discrepancia entre relojes es una hipótesis verificable, **no una causa demostrada de la ejecución fallida**, que ya había eliminado su instancia conforme al runner. No se cambian validación institucional, fixtures, tiempos de espera, aserciones ni runtime de los tres juegos para hacerla pasar.

El runner añade únicamente diagnóstico: antes de las pruebas compara el reloj DB con el intervalo de tiempo host que rodea la consulta; al fallar, registra otra muestra y agrega cuántas fuentes recientes tienen fecha terminal anterior a su primera cobertura, antes de eliminar la instancia propia. Conserva el error y exit code originales. No ajusta relojes ni omite/reintenta automáticamente pruebas. Este diagnóstico tiene sintaxis verificada, pero todavía no pudo ejecutarse contra DB en esta sesión.

Docker Desktop no estaba ejecutándose al continuar. Se intentó iniciar su instalación local, sin cambiar configuración, volúmenes ni datos. El log de backend informa: `initializing Ingest server ... sailor-ingest.sock ... The file cannot be accessed by the system`; la API `dockerDesktopLinuxEngine` no aparece. Las repeticiones `pr-i1-presence-clock-diagnostic.log` y `pr-i1-presence-clock-final.log` terminaron antes de crear/aplicar la DB por ese error. No se hace factory reset, eliminación de sockets ajenos, reparación de permisos ni se usa una URL remota como sustituto. **Para cerrar esta validación se necesita Docker operativo y repetir el comando con el diagnóstico nuevo; la causa de los 34 fallos sigue pendiente.**

Tras la última ejecución PostgreSQL también se aisló `socket.disconnect()` al namespace de Trivia: un rechazo/cierre de este canal no debe cerrar otros namespaces multiplexados del cliente. Build/Jest finales incluyen esa corrección, pero la nueva repetición PostgreSQL sigue bloqueada por Docker. Se explicita ese límite y no se presenta la pasada anterior 92/92 como validación del árbol final.

Archivos creados: migración `20261002190000_trivia_presence/migration.sql`, `trivia-presence.service.ts`, `trivia-presence.gateway.ts`, `competitive.trivia-presence.spec.ts`, `competitive-trivia-presence-postgres.test.cjs`. Archivos modificados: schema Prisma, servicio/módulo de Trivia, runner PostgreSQL y los dos informes ya modificados al inicio (conciliados y conservados como historial). No se tocaron migraciones confirmadas, fórmulas, liquidación/verificadores, los tres juegos individuales ni Flutter. HEAD sigue en `16163b7`; sin commit, push, merge, despliegue ni migración remota. Se entrega para revisión humana con el gate PostgreSQL abierto.

### Revisión de los 34 fallos — 2026-10-02 (bloqueada, sin checkpoint)

HEAD comprobado: `16163b7`, rama `feat/pr-i1-competitive-infrastructure`. Se preservan todos los cambios de presencia y los dos informes previos. Esta revisión no corrige runtime ni modifica migraciones, fórmulas, tiempos, fixtures o aserciones: no existe todavía una causa reproducida que autorice esa corrección.

**Docker:** contexto `desktop-linux`; cliente 29.7.2, Desktop 4.87.0. Los procesos de Desktop/backend existen, pero no hay servidor accesible en `dockerDesktopLinuxEngine` ni en `docker_engine`; WSL no tiene distribuciones ejecutándose. El log `com.docker.backend.exe.log`, 2026-10-02T21:06:12Z (16:06:12 Bogotá), registra fallo de arranque: `initializing Ingest server ... sailor-ingest.sock ... The file cannot be accessed by the system`. El socket existe con atributos Archive/ReparsePoint. Esto demuestra el punto inmediato de fallo del arranque; no demuestra si su causa Windows es bloqueo, permisos u otra condición. No se eliminó el socket ni se hicieron resets, limpiezas o cambios de permisos. El daemon sigue inaccesible y no pueden ejecutarse contenedores PostgreSQL desechables.

Conforme al límite solicitado, se detienen las validaciones dependientes de Docker: no se ejecuta una nueva suite PostgreSQL ni las tres repeticiones independientes. No se declara aprobada PostgreSQL. El fallo de Docker actual **no se atribuye como causa de los 34 fallos anteriores**.

**Evidencia conservada:** `C:\Users\luisk\AppData\Local\Temp\pr-i1-presence-complete-pg.log`, con nombres, mensajes y trazas originales. Resultado de esa ejecución previa: 58/92; 34 fallos, 14/14 pruebas nuevas de presencia aprobadas. Agrupación exacta: 27 errores directos HISTORICAL_MEMBERSHIP_UNKNOWN (15 comunes y 12 individuales); una aserción de rollback esperaba injected failure pero recibió ese mismo error; seis aserciones individuales esperaban un evento y encontraron cero, acompañadas por el error institucional del reconciliador.

El punto observable es `competitive.rules.ts:28` → `competitive.service.ts:166`, dentro de la transacción: no se encuentra historia con `desde <= terminalAt` y se rechaza antes de escribir ledger/proyección. La prueba de rollback no alcanzó el fallo inyectado; las de acuse perdido no alcanzaron el commit que pretendían probar. No hay evidencia para afirmar corrupción del ledger/balance, ni que estas coberturas hayan quedado verificadas en esa ejecución.

| Prueba fallida (nombre original) | Ubicación original | Mensaje / efecto observado |
|---|---|---|
| every existing source family canonicalizes equivalent UUIDs before idempotency | `test\competitive-postgres.test.cjs:35:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| INVALIDACION is unavailable in the service and PostgreSQL enum; current projection stays intact | `test\competitive-postgres.test.cjs:75:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| group enrollment affects membership; removal from group does not; institution deletion clears it | `test\competitive-postgres.test.cjs:225:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| normal settlement: individual without institution, V1, no private metadata or general XP changes | `test\competitive-postgres.test.cjs:372:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| twenty concurrent retries create one event and increment balance once | `test\competitive-postgres.test.cjs:387:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| different concurrent sources preserve a reproducible balance sequence | `test\competitive-postgres.test.cjs:407:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| same identity with changed evidence conflicts; version never permits another payment | `test\competitive-postgres.test.cjs:422:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| same Trivia source cannot pay again under Ghost identity | `test\competitive-postgres.test.cjs:434:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| delayed settlement preserves terminal institution; current membership is never fallback | `test\competitive-postgres.test.cjs:488:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| zero normal result preserves null reachedAt and still has an auditable sequence | `test\competitive-postgres.test.cjs:555:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| abandonment replaces any partial reward, clamps to zero and preserves nominal delta | `test\competitive-postgres.test.cjs:580:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| auditable corrections are concurrent, idempotent, floored and reference immutable origin | `test\competitive-postgres.test.cjs:612:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| isolation between games and independent sequence | `test\competitive-postgres.test.cjs:670:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| abandonment victory uses snapshot and accepted actions; both absent never creates a winner | `test\competitive-postgres.test.cjs:713:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| database constraints protect source identity across versions and append-only audit history | `test\competitive-postgres.test.cjs:759:1` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| ledger and balance roll back together when the projection update fails | `test\competitive-postgres.test.cjs:817:1` | Esperaba injected failure; recibió HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: disabled admission preserves legacy and accepted competitive recovery | `test\competitive-solo-postgres.test.cjs:207:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: verified win, replay, simultaneous settlement and crash before ledger | `test\competitive-solo-postgres.test.cjs:281:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: defeat/exhaustion yields the exact verified partial result | `test\competitive-solo-postgres.test.cjs:324:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: explicit abandonment pays no partial positive XP and uses the floor | `test\competitive-solo-postgres.test.cjs:333:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: historical institution and Bogota year come from terminal time, not retry | `test\competitive-solo-postgres.test.cjs:474:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| SUMMIT: ledger committed but acknowledgment lost reuses event after restart | `test\competitive-solo-postgres.test.cjs:556:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: disabled admission preserves legacy and accepted competitive recovery | `test\competitive-solo-postgres.test.cjs:207:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: verified win, replay, simultaneous settlement and crash before ledger | `test\competitive-solo-postgres.test.cjs:281:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: defeat/exhaustion yields the exact verified partial result | `test\competitive-solo-postgres.test.cjs:324:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: explicit abandonment pays no partial positive XP and uses the floor | `test\competitive-solo-postgres.test.cjs:333:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: historical institution and Bogota year come from terminal time, not retry | `test\competitive-solo-postgres.test.cjs:474:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| GUARDIAN: ledger committed but acknowledgment lost reuses event after restart | `test\competitive-solo-postgres.test.cjs:556:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: disabled admission preserves legacy and accepted competitive recovery | `test\competitive-solo-postgres.test.cjs:207:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: verified win, replay, simultaneous settlement and crash before ledger | `test\competitive-solo-postgres.test.cjs:281:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: defeat/exhaustion yields the exact verified partial result | `test\competitive-solo-postgres.test.cjs:324:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: explicit abandonment pays no partial positive XP and uses the floor | `test\competitive-solo-postgres.test.cjs:333:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: historical institution and Bogota year come from terminal time, not retry | `test\competitive-solo-postgres.test.cjs:474:3` | HISTORICAL_MEMBERSHIP_UNKNOWN |
| STAR_RESCUE: ledger committed but acknowledgment lost reuses event after restart | `test\competitive-solo-postgres.test.cjs:556:3` | ERR_ASSERTION: 0 !== 1; reconciliador registra HISTORICAL_MEMBERSHIP_UNKNOWN |

**Aislamiento y regresión:** el runner ejecuta los cinco archivos con `--test-concurrency=1`, comunes/individuales antes de presencia. Los hooks comunes/individuales construyen servicios directamente; no arrancan AppModule ni el gateway/worker de presencia. El worker nuevo consulta solo intentos Trivia con presenciaVersion=1 y sus tablas; no modifica historial institucional, ledger o balances. `git diff HEAD` no muestra cambios en liquidación común, servicios de Cima/Guardián/Rescate, sus dos archivos de pruebas PostgreSQL ni migración de evidencia confirmada. Esta inspección no sustituye una comparación ejecutada contra HEAD en PostgreSQL; la regresión sigue sin determinarse.

**Relojes y migraciones:** Node fecha las fuentes sintéticas; la cobertura institucional se crea con clock_timestamp de PostgreSQL. El runner anterior informó aplicación de 53 migraciones confirmadas más presencia antes de probar. La instancia fallida fue eliminada por el runner; no se conservaron catálogo inicial/final, configuración horaria DB ni muestras simultáneas de ambos relojes que demuestren un desfase. La hipótesis de relojes sigue abierta. El diagnóstico añadido previamente al runner queda pendiente de ejecución: no se inventan resultados ni historial, y no se cambia el guard institucional. La precedencia EXPIRADO cuando venceEn <= graceUntil se conserva.

**Siguiente verificación pendiente:** daemon operativo, suite completa con diagnóstico de reloj/cobertura y estado del esquema, reproducción del defecto y comparación controlada con HEAD; corregir solo la causa demostrada y luego tres ejecuciones limpias independientes. La incidencia histórica de vencimiento Rescate permanece abierta y separada (esa prueba pasó en el log de los 34 fallos).

Validaciones ejecutadas nuevamente en esta revisión (logs temporales `pr-i1-review34-*.log`): build exit 0; Jest competitivo exit 0, 5 suites y 115/115; Jest completo exit 0, 94 suites y 993/993; audit de producción exit 0, 0 vulnerabilidades con CA del sistema temporal y TLS activo. PostgreSQL no ejecutado por daemon inaccesible, cero repeticiones nuevas; los 58/92 son evidencia previa fallida, no resultado nuevo. Diff check exit 0. No se hizo commit, push, merge, despliegue ni migración remota; XP de Trivia/Duelo continúa deshabilitado.

### Reanudación con Docker recuperado — 2026-10-02

Esta sección actualiza el bloqueo de daemon de la revisión anterior, conservando su historial. HEAD principal sigue en `16163b7` y rama `feat/pr-i1-competitive-infrastructure`.

**Protección del entorno.** Docker Client/Server 29.7.2, Desktop 4.87.0, contexto desktop-linux y docker info operativos. Se registró antes/después `postgres-local`, ID `20d971cc043fe04cf2fd14be83c906d2210f298381e58ac480a478ea305b7927`, Running, StartedAt `2026-10-02T21:24:22.476116454Z`, puerto 127.0.0.1:5432. No se conectó a esa DB, ni se detuvo/reutilizó/modificó/eliminó ese contenedor. Solo el runner creó instancias propias con nonce/label, credenciales aleatorias, tmpfs y puerto loopback aleatorio; verificó propiedad antes de eliminarlas. Al terminar solo quedó el contenedor original. No hubo URL remota ni migraciones Supabase.

**Resultados completos conservados.** Logs en `C:\Users\luisk\AppData\Local\Temp`:

| Ejecución | Log | Resultado real |
|---|---|---|
| Árbol actual 1 | pr-i1-recovered-pg-1.log | Exit 0; 92/92; 72232.1931 ms. |
| Árbol actual 2 | pr-i1-recovered-pg-2.log | Exit 1; 68 aprobadas y 1 archivo fallido, 69 entradas; 77452.1356 ms. La suite común no cargó: PrismaClient indefinido. No equivale a ejecutar 92 pruebas. |
| Árbol actual 3 | pr-i1-recovered-pg-3.log | Exit 0; 92/92; 71202.2798 ms. Primera de las tres pasadas secuenciales finales. |
| Árbol actual 4 | pr-i1-recovered-pg-4.log | Exit 0; 92/92; 70052.4767 ms. Segunda pasada final. |
| Árbol actual 5 | pr-i1-recovered-pg-5.log | Exit 0; 92/92; 62014.2937 ms. Tercera pasada final. |
| HEAD aislado, sin inyección | pr-i1-baseline-pg.log | Exit 0; 78/78; 57737.0431 ms; runner confirmado, 53 migraciones, sin presencia. |
| HEAD aislado, reloj Node atrasado deliberadamente 2000 ms | pr-i1-baseline-clock-probe.log | Exit 1 esperado del experimento; 43/78, 35 fallos; 54936.9463 ms. No se presenta como validación aprobada. |

Las pasadas finales 3/4/5 usan tres bases nuevas, sin datos compartidos, con el mismo árbol de código y diagnóstico final. La segunda pasada se ejecutó mientras el build regeneraba Prisma; la traza muestra `src/prisma/prisma.service.ts:6`, `Class extends value undefined is not a constructor or null`. Se reprodujo separadamente **en las dependencias de la copia aislada**, cargando el cliente mientras `prisma generate` lo reescribía: tres observaciones de PrismaClient indefinido, sin error de conexión DB (`pr-i1-prisma-race-probe.log`). Corrección de ejecución: completar build/generación antes de cargar las suites PostgreSQL; no se modificó runtime, dependencias, aserciones o esperas para encubrirlo. Este fallo es distinto de los 34 institucionales anteriores.

**Comparación aislada.** Se creó worktree detached en `C:\Users\luisk\AppData\Local\Temp\saberplus-pr-i1-baseline-65e810f921724863bfd8ad058ae0d49a`, HEAD completo `16163b76cb7a6f4386ec35fef54ad58bb5699bd6`, con npm ci y cliente Prisma propios. No se compartió node_modules ni se regeneró el cliente del árbol principal desde esa copia. Los archivos fuente, pruebas y migraciones confirmados de HEAD quedaron intactos; solo existe allí un runner diagnóstico adicional no versionado. npm ci exit 0 (su auditoría de todas las dependencias informó 36 vulnerabilidades, 6 moderadas/30 altas; no es la auditoría omit=dev solicitada, que dio cero en el árbol principal). No se actualizó ninguna dependencia.

**Mecanismo demostrado, límite histórico.** El preload externo `C:\Users\luisk\AppData\Local\Temp\pr-i1-clock-probe.cjs` altera únicamente Date sin argumentos/Date.now de los procesos de los dos archivos PostgreSQL comunes/individuales: -2000 ms. No altera PostgreSQL, fechas explícitas de fixtures ni presencia. El runner diagnóstico de la copia aplica las 53 migraciones originales, no presencia, y añade las mismas muestras de reloj/esquema. Se ejecutó con NODE_OPTIONS=--require apuntando a ese preload; se restauró la variable al finalizar. No está incorporado a las validaciones regulares ni al backend.

El experimento reprodujo **todos los 34 nombres originales**, más `real student creation, existing-user enrollment and CSV import all update historical membership` (competitive-postgres.test.cjs:175 también rechazado por HISTORICAL_MEMBERSHIP_UNKNOWN). Compare-Object entre los nombres de ambos reportes confirmó que no falta ninguno de los originales. La consulta SQL antes de eliminar la instancia encontró 37 fuentes sintéticas recientes con terminal anterior a primera cobertura, diferencias positivas de **1734 a 1994 ms**. Ese número cuenta fuentes, no pruebas. Las trazas mantienen `competitive.rules.ts:28` → `competitive.service.ts:166`, antes de ledger/proyección. Las seis aserciones de cero eventos y el rollback interceptado también se reproducen.

Esto demuestra que un reloj Node atrasado frente a PostgreSQL puede producir el conjunto original y que la dependencia de dos relojes ya existe en HEAD, sin worker de presencia. **No demuestra que ese desfase ocurriera en la ejecución original 58/92**: no hay muestra simultánea ni DB conservada de aquella ejecución. No se afirma causa raíz histórica resuelta, ni se convierte el reinicio de Docker en prueba de ella. Tampoco se demuestra una regresión funcional causada por esta ronda. La fuente sintética usa Date de Node; los tres servicios individuales usan Date de Node para sus terminales; el trigger institucional usa clock_timestamp DB. El guard rechaza correctamente evidencia anterior a su cobertura y no debe relajarse ni inventar historial. No se cambia ahora el runtime temporal de los tres juegos sobre la sola atribución hipotética del incidente original. Queda abierto el requisito técnico de consistencia de reloj entre fuente terminal y cobertura DB, además de confirmar la causa histórica si vuelve a ocurrir con diagnóstico.

**Relojes, zona horaria, esquema y aislamiento.** Node v24.14.1: America/Bogota (offset 300), ISO UTC; PostgreSQL 16.15: Etc/UTC. Las muestras antes/después de las tres pasadas finales incluyen cero en el intervalo DB-host: no prueban desfase positivo ni sincronía exacta milisegundo a milisegundo. No se atribuye un cambio de zona horaria al rechazo; se comparan instantes absolutos. Las pruebas de frontera de temporada 04:59:59.999Z/05:00Z y membresía terminal pasan. Cada instancia parte de cero con 53 migraciones confirmadas más presencia, ledger/balance/historial/presencia presentes; 65 tablas y 17 triggers públicos antes, 66 tablas y 17 triggers después. La tabla adicional es CompetitiveTestSource creada por la suite común, no una migración inesperada. La copia HEAD inicia 62 tablas/12 triggers y termina 63/12, sin presencia. El runner aplica SQL secuencial con ON_ERROR_STOP; no administra _prisma_migrations ni ejecuta prisma migrate remoto. Sus archivos de pruebas siguen con --test-concurrency=1 y usuarios/fuentes UUID propios. Las pruebas de concurrencia, ledger, balances, historial, liquidación, privacidad y las 14 de presencia pasan en las tres pasadas finales; esto no elimina la incertidumbre del registro histórico fallido.

**Cambios de esta revisión.** Solo se amplió `tool/test_competitive_postgres.mjs` con muestras de reloj al terminar y diagnóstico de zona horaria/versión/tablas/triggers al inicio/final/fallo; no ajusta fechas ni reintenta u omite pruebas. Se actualizaron los dos documentos ya modificados. Se preservaron todos los archivos previos de presencia, la migración pendiente y la precedencia EXPIRADO si venceEn <= graceUntil. No hubo corrección de producto/runtime ni nuevas migraciones en esta revisión; no se alteraron migraciones confirmadas, fórmulas, Flutter, otros juegos o XP de Trivia/Duelo.

**Validaciones restantes:** build exit 0 (`pr-i1-recovered-build.log`); Jest competitivo 5 suites, 115/115, exit 0 (`pr-i1-recovered-competitive.log`); Jest completo 94 suites, 993/993, exit 0 (`pr-i1-recovered-full.log`); npm audit --omit=dev exit 0, cero vulnerabilidades (`pr-i1-recovered-audit.log`), CA del sistema temporal y TLS activo; git diff --check exit 0. La incidencia anterior `STAR_RESCUE: the worker alone expires an unattended attempt` pasó en las ejecuciones normales y controlada, pero **continúa abierta sin causa demostrada**. No hay commit, push, merge, despliegue ni migración remota. Se detiene para revisión humana: tres pasadas completas aprobadas, pero la causa histórica de los 34 fallos permanece sin confirmación directa.

### Regla aprobada: suspender nuevas acciones sin presencia vigente (2026-10-02)

Decisión explícita del propietario para los **nuevos intentos con presenciaVersion=1** de TRIVIA_RUSH y GHOST_DUEL: después de la desconexión confirmada de todas las conexiones válidas, no se admiten respuestas ni potenciadores nuevos hasta una reconexión autenticada. También se exige presencia para la primera acción, aunque todavía nunca se haya abierto el canal. UNKNOWN no prueba desconexión/abandono, pero tampoco habilita acciones. Legacy e históricos con presenciaVersion=null conservan íntegro su camino previo.

**Admisión servidor y DB.** `requireTriviaPresence` consulta la función privada `trivia_presence_require_open` dentro de la misma transacción de la acción, después de comprobar propietario/estado y buscar el reintento. Se exige una fila vinculada al intento con state=OPEN, connectedAt/lastSeenAt no futuros y leaseUntil estrictamente posterior al reloj PostgreSQL. CLOSED, UNKNOWN, RETIRED y lease vencido nunca autorizan. Falta de presencia produce HTTP 409, TRIVIA_PRESENCE_REQUIRED. Otros errores DB/esquema se propagan; no se ocultan como desconexión.

El gateway fue auditado y se conserva: handshake JWT validado por servidor y propiedad del intento, UUID de conexión/instancia generado por backend, renovación tras revalidar autenticación, apagado/error tratado como incertidumbre. El cliente no puede enviar un indicador de conexión para autorizar HTTP. La evidencia OPEN proviene del canal servidor y sus funciones privadas; HTTP **no renueva leases, no crea presencia ni abre gracia**. El lease vigente es evidencia reciente del observador autenticado; no constituye telemetría del instante físico de un corte de Internet.

**Idempotencia.** Respuestas y ayudas buscan la operación previa antes de exigir presencia, y vuelven a buscarla bajo locks. Propietario, intento, clave y payload deben coincidir; un conflicto conserva el rechazo existente. Un reintento exacto recupera evaluación/activación sin insertar ni consumir otra concesión, incluso durante desconexión o tras un terminal. La lectura puede ejecutar la recuperación terminal normal, pero nunca añade una acción. Se prueba que payload, usuario o intento ajenos reciben 403 y que no hay segunda escritura.

**Transacciones y orden de locks.** Todos los contendientes de presencia/admisión toman Usuario → IntentoTriviaRush. La nueva función reutiliza `trivia_presence_lock`, sin esperar conexiones antes del padre. El trigger de INSERT de respuesta/potenciador se llama ahora `trivia_a_presence_action_guard`, para ejecutarse alfabéticamente **antes** del guard de evidencia confirmado que bloquea el intento. Así una inserción directa no invierte el orden tomando primero intento y después Usuario. El guard SQL repite presencia y plazo justo antes de insertar: si el lease/plazo vence entre admisión y escritura, la operación se rechaza y la transacción revierte sus efectos, incluida una concesión consumida. La comprobación del servicio no sustituye este guard.

La prueba PostgreSQL específica retiene Usuario en una transacción de desconexión y comprueba en pg_stat_activity que la inserción competidora está esperando un lock; solo entonces libera el contendiente. La desconexión adquiere intento y se confirma; la inserción falla con TRIVIA_PRESENCE_REQUIRED, sin respuesta ni interbloqueo. No usa sleeps para decidir quién gana. Las dos carreras adicionales por HTTP real (una por modo), desconexión y reconexión aceptan únicamente los resultados seriales posibles: 201 con evaluación válida o 409 de presencia; el reintento final deja exactamente una fila. Esto verifica este protocolo de locks, no certifica ausencia de interbloqueos en operaciones ajenas al protocolo.

**Tiempo y terminales.** La función privada `trivia_presence_now` centraliza el mismo clock_timestamp UTC de DB para presencia, leases y admisión. La nueva respuesta/ayuda V1 usa el instante devuelto por DB; legacy/históricos mantienen su reloj anterior. Producción no tiene entrada HTTP ni setting para cambiar ese reloj. La gracia continúa exactamente 20 s, HTTP/reconexión no pausa ni amplía venceEn, retorno válido conserva tiempo restante y una reconexión tardía no reabre terminales. Se mantiene EXPIRADO cuando venceEn ocurre antes o exactamente al fin de gracia. Recuperación, reconciliación y terminal durable siguen habilitados independientemente de admitir acciones nuevas; no se habilita XP ni verificador competitivo.

**Migración.** Se modifica únicamente la migración nueva y aún no confirmada `20261002190000_trivia_presence`: funciones privadas de reloj/admisión, trigger temprano y uso del mismo reloj en funciones existentes. Se conserva su evidencia/tablas/constraints/RLS y se revocan EXECUTE de las dos funciones nuevas a PUBLIC/anon/authenticated. No se edita ninguna migración confirmada, no se aplica nada remoto y el rol/RLS de producción continúa pendiente de verificación antes del despliegue autorizado.

**Pruebas y aislamiento.** Se agregan doce casos PostgreSQL: cinco por modo para presencia inicial, t10/t15 desconectado, ayuda suspendida/concesión intacta, t20 retorno, retries exactos/conflictivos, UNKNOWN, OPEN vencido, conexiones múltiples/antiguas, carrera HTTP, precedencia de plazo y retorno tardío; un caso de compatibilidad legacy/histórica; un caso de locks SQL. Todos comprueban ausencia de XP competitivo cuando corresponde. Los casos previos de evidencia/privacy siguen con sus aserciones: sus fixtures V1 ahora registran una observación autenticada del servidor antes de actuar, usando el mismo contrato SQL privado que el gateway. No se simula presencia mediante datos del cliente.

El tiempo de los nuevos casos se controla únicamente en la DB local desechable: el test reemplaza allí la función de reloj por una versión que lee un setting de transacción SET LOCAL. Un proxy de Prisma fija ese valor antes de las transacciones del controlador HTTP real; se conservan JWT, DTO, Prisma y triggers reales. La función de producción en la migración no acepta ese setting, y ninguna ruta permite fijarlo. Las fechas explícitas de los fixtures no son telemetría. La compatibilidad legacy se prueba con fechas reales, coherentes con su reloj preexistente.

| Validación | Resultado |
|---|---|
| npm run build | Exit 0; Prisma generado antes de ejecutar PostgreSQL. |
| npm test -- --runInBand competitive | Exit 0; 5 suites, 118/118. |
| npm test -- --runInBand | Exit 0; 94 suites, 996/996. |
| PostgreSQL inicial, pr-i1-presence-gate-pg-1.log | Exit 1; 102/103. Único fallo en el nuevo fixture histórico: inició en 2050, pero el camino legacy respondió con reloj actual; SQL rechazó Answer outside time window (23514). Se corrigió el fixture usando inicio real, sin tocar guard ni aserción. No se atribuye a presencia, historial institucional o Rescate. |
| PostgreSQL tras corrección y prueba SQL, pr-i1-presence-gate-pg-2.log | Exit 0; 104/104; 92809.1716 ms. |
| PostgreSQL final con carrera por HTTP real, pr-i1-presence-gate-pg-final.log | Exit 0; 104/104; 79435.7095 ms. 53 migraciones confirmadas + presencia en instancia nueva propia, eliminada al finalizar. |
| npm audit --omit=dev | Exit 0; cero vulnerabilidades, CA del sistema temporal y TLS activo. |
| git diff --check | Exit 0. |

Logs conservados en C:/Users/luisk/AppData/Local/Temp, prefijo pr-i1-presence-gate-. Se preservó postgres-local: mismo ID y StartedAt, sin acceso a sus datos. Los tres juegos solo no muestran cambios de código; las fórmulas, Usuario.xpTotal y la ausencia de XP Trivia/Duelo se mantienen. Tres nuevas unitarias comprueban tiempo de admisión DB, conflicto de presencia y propagación de errores de esquema.

Archivos ajustados en esta revisión: trivia-presence.service.ts, trivia-rush.service.ts, migración pendiente, competitive.trivia-presence.spec.ts, competitive-trivia-presence-postgres.test.cjs, competitive-trivia-evidence-postgres.test.cjs y los dos documentos existentes. Gateway, schema, módulo y runner previamente pendientes se preservan. No hay nuevas migraciones adicionales. La incertidumbre histórica de los 34 fallos sigue abierta: el experimento de reloj previo demuestra un mecanismo, no su causa histórica. La incidencia intermitente de vencimiento Rescate también sigue abierta pese a pasar en estas ejecuciones. HEAD continúa 16163b7, sin commit/push/merge/despliegue/migración remota ni cambios Flutter. Se detiene antes del quinto commit para revisión humana.
## Auditoría de admisión y liquidación XP sobre 88f7045

### Evidencia disponible y límites actuales

Se verificó HEAD `88f7045`, rama `feat/pr-i1-competitive-infrastructure`, con árbol inicialmente limpio. Se consultaron los dos documentos backend obligatorios, contratos/reglas/registro de verificadores/liquidación, Prisma, motores y presencia; también las decisiones V1 en `saber_plus/docs/PR_I1_AUDITORIA_FORMULAS.md` y el plan maestro, sin modificar Flutter.

Los nuevos intentos explícitos ya conservan Q 10..30, orden, contenido y soluciones originales, modalidad y fantasma inicial o ausencia de referencia. Los guards SQL de evidencia y presencia protegen esas estructuras y las acciones aceptadas. La presencia vigente se exige transaccionalmente, con orden Usuario → intento, lease PostgreSQL y cierre durable: UNKNOWN no demuestra abandono, y vencimiento anterior o igual al fin de gracia prevalece. Estos requisitos resueltos no se vuelven a presentar como carencias del motor.

La evidencia V1 preparada **no equivale a admisión competitiva**. No hay campos de admisión XP/reconciliación en IntentoTriviaRush ni verificador registrado para TRIVIA_ATTEMPT. Crear esos campos, un verificador común que derive gameId de modalidad inmutable y una recuperación durable es trabajo técnico autorizado, pero su implementación pagadora se detiene mientras estén sin resolver las precisiones siguientes. Ningún intento anterior puede obtener elegibilidad retroactiva.

La infraestructura común ya comparte fuente TRIVIA_ATTEMPT y UUID canónico para ambas modalidades; la clave fuente/intento/participante no depende de modo ni rulesVersion. El XP usa half-up racional con enteros BigInt. Historial institucional desconocido rechaza liquidación, sin sustituirlo por institución actual. No se modifica Usuario.xpTotal.

### Precisiones solicitadas al propietario, sin respuesta asumida

1. **Racha M y segunda oportunidad de Trivia.** `src/trivia-rush/trivia-rush.rules.ts`, resolverRespuestaTriviaRush, guarda el fallo aceptado no final de segunda oportunidad sin cortar el combo del marcador. El contrato competitivo exige reconstruir M, sin copiar mejorCombo, pero no explicita si ese fallo no final corta la racha competitiva o si M se calcula solo sobre respuestas finales. Ejemplo con Q=10: dos aciertos; fallo no final en tercera pregunta, seguido de acierto final; cuarta pregunta correcta; seis fallos finales. C=4. Contando solo finales, M=4 y XP=40; cortando con el fallo no final, M=2 y XP=34. Ambas mantienen la fórmula aprobada y admiten la ayuda legal, pero producen pagos distintos. No se escoge una interpretación sin aprobación.

2. **Comparación de Duelo cuando hay igual puntaje.** La selección del mejor fantasma en fijarFantasma ordena por puntaje, aciertos, mejor combo y fecha. Es una regla de selección de referencia; no demuestra que esos desempates definan el bono competitivo. En Flutter, GhostRun.isBetterThan (`lib/features/games/ghost_duel/domain/ghost_duel_models.dart`) también desempata, mientras la presentación de Trivia (`lib/features/games/trivia_rush/presentation/trivia_rush_page.dart`) describe igual puntaje como empate. Las decisiones V1 fijan bonos +20/+10/+0, pero no resuelven explícitamente esa diferencia. Con Q=10, C=4 y el mismo puntaje que el fantasma, base=32: empate paga 42; una victoria por desempate pagaría 52; derrota pagaría 32. La fecha posterior usada para seleccionar récords no se convierte en una victoria automática. La ausencia inicial sigue inequívocamente sin bono.

Se solicitaron ambas precisiones al propietario. Las opciones presentadas no constituyen autorización ni se adoptan por falta de respuesta. No se modifican coeficientes, selección de fantasma, ayudas ni comportamiento legacy. Tampoco se registran verificadores simulados, flags habilitables incompletos o rutas de pago. Tras resolverlas, la integración deberá añadir admisión explícita inmutable, flags separados apagados por defecto y orden total verificable de acciones, sin editar migraciones confirmadas.

### Validación de la base y riesgos conservados

Resultados de esta ronda: build exit 0; Jest competitivo 5 suites, 118/118, exit 0; Jest completo 94 suites, 996/996, exit 0; PostgreSQL 104/104, sin fallos, cancelaciones ni omitidos, exit 0 (72 452 ms); audit --omit=dev exit 0, cero vulnerabilidades, CA del sistema y TLS activo. Logs locales: `%TEMP%/pr-i1-xp-integration-build.log`, `%TEMP%/pr-i1-integration-competitive.log`, `%TEMP%/pr-i1-integration-jest.log` y `%TEMP%/pr-i1-integration-postgres.log`. Son verificaciones del motor e infraestructura existentes; no prueban una integración XP Trivia/Duelo aún ausente. El runner aplicó las 54 migraciones confirmadas en PostgreSQL 16.15 propio y desechable local, sin reutilizar postgres-local ni credenciales remotas; retiró únicamente su contenedor al terminar. Docker Server 29.7.2, contexto desktop-linux. Build/generación Prisma terminó antes de cargar las suites PostgreSQL.

La causa histórica de los 34 fallos institucionales permanece sin confirmación directa; el experimento previo de desfase demuestra un mecanismo y no su causa histórica. La incidencia intermitente de vencimiento de Rescate también permanece abierta mientras no exista causa demostrada. No hay nuevas migraciones ni cambios runtime en esta revisión, ni commit, push, merge, despliegue o migraciones remotas.


## Integración XP Trivia/Duelo tras decisiones aprobadas (base 88f7045)

### Auditoría y decisiones cerradas

Se preservan los dos documentos sin commit de la ronda anterior. HEAD sigue 88f7045 y no se modifican las migraciones confirmadas. Las decisiones pendientes de la sección anterior quedan resueltas por instrucción expresa del propietario: solo resultados definitivos para M, fallo no final con segunda oportunidad no corta racha, fallo definitivo y salto sí; Duelo usa únicamente puntuación verificada y sin desempates por aciertos/racha/fecha. El ejemplo C=4, Q=10, dos aciertos, fallo no final recuperado y otro acierto da M=4 y XP=40. Igual puntuación entre un fantasma de cuatro aciertos/racha cuatro y un duelo de seis aciertos/racha dos constituye empate.

Se revisaron los contratos comunes, fórmulas, registro de verificadores, fuentes/idempotencia, esquema/migraciones y motores/presencia. Snapshot inmutable completo, modo, referencia inicial protegida y observación autenticada están disponibles. No quedan decisiones de producto nuevas para esta integración. La evidencia antigua preparada carece de admisión XP y de secuencia total de ayudas/respuestas; por eso permanece inelegible, sin rellenarla o convertirla. Un registro anterior limpio con snapshot puede seguir siendo referencia de fantasma conforme al selector existente, sin recibir XP retroactivo.

### Admisión y persistencia

CrearTriviaRushDto acepta competitive booleano estricto opcional; true requiere modalidad explícita, estudiante y flag servidor específico. El servicio rechaza strings incluso con conversión implícita del DTO. Solo nuevas creaciones consultan COMPETITIVE_TRIVIA_ENABLED o COMPETITIVE_GHOST_ENABLED, exactamente true, independientes del flag solo. Recuperar un competitivo ya admitido sigue funcionando con ambos apagados; un intento existente no competitivo no puede convertirse mediante una solicitud nueva. Omitir competitive o false conserva el camino existente.

La migración nueva 20261002230000_trivia_competitive_v1 agrega competitiveRulesVersion=1 y competitiveAdmittedAt inmutables, competitiveSettledAt y competitiveRetryAt como cola durable. Inicio/admisión y acciones competitivas usan reloj PostgreSQL; el vencimiento competitivo no se recalcula usando un reloj Node adelantado. Los registros previos conservan admisión null. Checks y trigger rechazan enrollment posterior, cambio de versión/mode y terminal inicialmente fabricado. La evidencia terminal de juego sigue inmutable: la nueva definición incremental del guard solo permite cambiar acuse/backoff, no respuestas, configuración, score ni fecha terminal.

Una secuencia privada PostgreSQL ordena INSERT de respuestas y ayudas de nuevos competitivos bajo Usuario → intento. El cliente/servicio no aporta la secuencia; SQL rechaza valores explícitos. Las ayudas aceptadas congelan además identidad/propietario/caducidad de la concesión consumida, sin depender después de su estado mutable. El trigger existente mantiene append-only de esa evidencia. Se conservan RLS y revocaciones; anon/authenticated no obtienen tablas, evidencia, funciones privadas ni la secuencia nueva.

### Replay y fantasma

TriviaCompetitiveVerifier es el único adaptador TRIVIA_ATTEMPT; deriva gameId de modalidad persistida, nunca del cliente. Valida origen, propietario, reglas, Q 10..30, soluciones/opciones/orden/configuración, acciones en su secuencia servidor y dentro del plazo vigente al aceptarlas, fecha terminal y completitud. Reproduce los puntos con las reglas existentes y efectos de ayudas legales, contrastando contadores persistidos sin usarlos como fuente para XP. Reconstruye C y M por pregunta definitiva: no finales no duplican preguntas ni cortan M; escudo conserva el combo del juego, pero no convierte un fallo definitivo en continuidad de M; salto siempre corta M.

Duelo no permite ayudas. Se reconstruyen ambos puntajes: el actual y el de la referencia elegible limpia del mismo usuario/configuración/Q y finalizada antes del inicio. Se verifica identidad, terminal, estadísticas y checkpoints originales contra el snapshot fijo. Los registros preparados sin secuencia solo pueden reconstruirse como fantasmas limpios sin ayudas; nunca se admiten por ello como competitivos. No se consulta el mejor récord actual como sustituto. Referencia null da bono cero; internamente el marcador neutro sin rival no declara una victoria/empate. XP pasa por normalXp V1 y roundRatio BigInt existentes: Trivia half-up((70C+30M)/Q), Duelo half-up(80C/Q)+20/10/0. No cambian coeficientes ni Usuario.xpTotal.

### Terminales, liquidación y recuperación

EXPIRADO por vencimiento normal es resultado normal de Trivia/Duelo con los aciertos válidos recibidos; ABANDONADO demostrado aplica nominal -10 y elimina recompensa positiva parcial. El abandono explícito competitivo añade evento durable ABANDONED dentro de la misma transacción; el abandono por gracia usa el evento generado por el resolver existente. El verificador exige evento coincidente para abandono. UNKNOWN no se transforma en abandono. Siguen la gracia exacta de 20 s, presencia OPEN vigente para acciones nuevas, reintentos exactos de solo lectura, y EXPIRADO cuando su plazo es anterior o igual al fin de gracia. Ayuda oficial de tiempo extra conserva la regla del juego existente; reconexión/gracia no añade tiempo ni cambia ese plazo.

TriviaCompetitiveReconciler usa una cola independiente en IntentoTriviaRush, limitada a admisión versión 1. Al arrancar y cada 5 s busca terminales o vencimientos/gracias debidos. Resuelve cierre bajo Usuario → intento, confirma esa transacción y luego llama settle fuera de ella. No consulta flags de creación ni modifica el recuperador de Cima/Guardián/Rescate. Error de esquema se registra expresamente; no se simula un entorno compatible. Fallos dejan trabajo durable y backoff de un minuto; no hay bucle de pagos.

CompetitiveService conserva fuente/UUID canónico/participante/SETTLEMENT como clave común a ambos modos y todas las versiones. No hay segunda fuente de Duelo. Verificación y liquidación bloquean evidencia frente a escrituras y el balance conserva piso cero, delta nominal/aplicado, secuencia y alcanzadoEn. El hash ordena acciones por secuencia y excluye acuse/backoff; reintentar después de un acuse no cambia evidencia. Caída antes del ledger mantiene cero eventos; después del commit y antes del acuse recupera el mismo evento. Varias instancias pueden intentar liquidar/confirmar sin duplicarlo. Temporada se toma del resultado terminal en America/Bogota; institución del historial a esa fecha. HISTORICAL_MEMBERSHIP_UNKNOWN falla sin inventar historial.

### Despliegue y límites

La nueva migración es requisito previo para Prisma/verificador/recuperador, incluso con flags apagados. Orden seguro: respaldo/revisión, rol DATABASE_URL y RLS/grants privados verificados, migración autorizada compatible, comprobación de esquema/guards, backend con ambos flags apagados, pruebas operativas, activación expresa posterior por modalidad. No se aplicó nada en Supabase, Render o bases remotas, ni se confirmó rol productivo sin evidencia. Mantener guards/tablas mientras haya liquidaciones pendientes. No hay endpoints públicos de liquidación, cambios Flutter, otros juegos ni PR-I2.

La causa histórica de los 34 fallos institucionales y la incidencia de vencimiento Rescate continúan abiertas. Los experimentos y errores de fixtures de esta ronda no se atribuyen a esas incidencias históricas. Los resultados finales se registran tras completar las validaciones.


### Resultados de validación de la integración

| Ejecución | Resultado y diagnóstico |
|---|---|
| Build inicial y final | Exit 0; prisma generate terminado antes de PostgreSQL. Log final: %TEMP%/pr-i1-trivia-xp-final-build.log. |
| Jest competitivo inicial | 135/136, una prueba de lifecycle esperaba solo tres consultas. El módulo incorpora ahora el recuperador Trivia; se añadió aserción explícita de esa consulta y se mantienen las tres consultas solo. No se cambia runtime solo para ocultar el fallo. |
| Jest competitivo final | Exit 0; 6 suites, 137/137. Log: %TEMP%/pr-i1-trivia-xp-final-competitive.log. |
| Jest completo final | Exit 0; 95 suites, 1015/1015. Log: %TEMP%/pr-i1-trivia-xp-final-jest.log. |
| PostgreSQL inicial | Exit 1; 110/114. Cuatro expectativas del fixture nuevo suponían Q=10, pero el banco de Inglés compartido de la suite previa produjo Q=20. Se aisló el fixture en Lectura Crítica y se añadió aserción Q=10 al inicio; sin cambiar fórmula ni expectativas XP. Log: %TEMP%/pr-i1-trivia-xp-pg-1.log. |
| PostgreSQL segunda | Exit 1; 116/118. Dos casos de tiempo controlado PostgreSQL usaron terminales futuros con reloj Node real; validateTerminal rechazó correctamente terminalAt > Date.now. El fixture controla Date.now únicamente al liquidar esos casos y lo restaura en finally; guard productivo intacto. Log: %TEMP%/pr-i1-trivia-xp-pg-2.log. |
| PostgreSQL tercera | Exit 0; 120/120. Log: %TEMP%/pr-i1-trivia-xp-pg-3.log. |
| PostgreSQL final tras añadir carrera de cierre/liquidación | Exit 0; 121/121, 0 fallos/canceladas/omitidas; 92 419 ms. Log: %TEMP%/pr-i1-trivia-xp-final-postgres.log. |
| npm audit --omit=dev | Exit 0; cero vulnerabilidades, CA del sistema temporal; TLS permanece activo. |
| git diff --check | Exit 0; sin errores de whitespace. |

Cada ejecución PostgreSQL creó su propia base y aplicó las 54 migraciones confirmadas más la nueva incremental, sin editar las confirmadas. El runner eliminó únicamente sus recursos propios. postgres-local conserva ID 20d971cc043fe04cf2fd14be83c906d2210f298381e58ac480a478ea305b7927, estado Running e inicio 2026-10-02T21:24:22.476116454Z. Docker Server 29.7.2/desktop-linux permanece operativo. No hay migraciones remotas, commit, push, merge, despliegue ni cambios Flutter.

Cobertura nueva: gates independientes y elegibilidad por HTTP; booleano estricto y legacy; no conversión/admisión histórica; ayudas, resultados definitivos, M y saltos; fórmulas/half-up; primer duelo y resultados win/tie/loss; igualdad con distintas estadísticas; referencia fija incluso después de otro récord; UUID equivalente e idempotencia; dos recuperadores y caídas antes/después del ledger; última respuesta/abandono/liquidación/recuperación concurrentes; terminal/secuencia inmutables y privacidad HTTP/RLS; abandono nominal/piso, gracia/UNKNOWN/expiración tardía, temporada y membresía histórica, XP general intacto. Las pruebas anteriores de presencia, socket JWT, lease, reconexión y snapshots siguen formando parte de la regresión; no se presentan como nuevas capacidades de esta ronda.

La prueba histórica de vencimiento Rescate pasó en las ejecuciones de esta ronda, pero su incidencia continúa abierta sin causa demostrada. Lo mismo ocurre con la causa histórica de los 34 fallos institucionales: no se declara resuelta por las pasadas actuales. Sin bloqueos nuevos de producto para Trivia/Duelo; persiste gate operativo de migraciones, rol PostgreSQL/RLS productivo y consistencia de relojes. Se detiene para revisión humana con ambos flags apagados por defecto.


### Cierre inicial: ausencia de resultado sin fantasma (compatibilidad superada)

La revisión final elimina el placeholder interno DERROTA cuando no existe fantasma: NormalEvidence permite outcome=null únicamente para ausencia de referencia; una referencia real requiere resultado verificable. El adaptador emite null en primera referencia y el bono sigue siendo cero. Ese cierre inicial no cambió fórmulas ni coeficientes, pero todavía aceptaba un resultado ignorado para ghostId=null. Esa compatibilidad se elimina en la revisión estricta del sexto checkpoint; no es una regla activa. competitive.rules.ts solo cambia esa representación/validación en Ghost, sin alterar reglas de otros juegos.

Validación final tras ese ajuste: npm run build exit 0; npm test -- --runInBand competitive exit 0, 6 suites/138 pruebas; npm test -- --runInBand exit 0, 95 suites/1016 pruebas; node tool/test_competitive_postgres.mjs exit 0, 121/121, 0 fallos/omitidos/cancelados, 88 419 ms; npm audit --omit=dev exit 0, 0 vulnerabilidades, TLS activo; git diff --check exit 0. Logs de cierre en %TEMP%/pr-i1-trivia-xp-approved-build.log, pr-i1-trivia-xp-approved-competitive.log, pr-i1-trivia-xp-approved-jest.log y pr-i1-trivia-xp-approved-postgres.log. La prueba PostgreSQL verifica también outcome=null, además del XP base sin bono. No se cambian las causas y resultados históricos registrados arriba.

Archivos de esta ronda: los dos documentos existentes; prisma/schema.prisma; nueva migración 20261002230000_trivia_competitive_v1/migration.sql; competitive.activation.ts, competitive.module.ts, competitive.rules.ts; nuevos competitive.trivia.ts, competitive.trivia-reconciler.ts y competitive.trivia.spec.ts; competitive.solo.spec.ts (lifecycle del módulo), competitive.trivia-boundary.spec.ts (DTO de admisión); trivia-rush.controller.ts y trivia-rush.service.ts; nuevo test/competitive-trivia-xp-postgres.test.cjs; tool/test_competitive_postgres.mjs. No hay cambios en los motores individuales, migraciones confirmadas, dependencias ni Flutter. HEAD sigue 88f7045 en feat/pr-i1-competitive-infrastructure. Sin commit/push/merge/despliegue/migraciones remotas, pendientes revisión y gates productivos; los documentos sin commit previos se conservaron.


## Revisión mínima del sexto checkpoint — contrato estricto y documentación

Rama feat/pr-i1-competitive-infrastructure, HEAD 88f7045, todos los cambios locales de la sexta ronda preservados. No hay nuevo commit ni migración en esta revisión. Corrección en competitive.rules.ts: ghostId=null exige outcome=null (GHOST_RESULT_WITHOUT_REFERENCE si existe un resultado ficticio). Fantasma presente exige VICTORIA/EMPATE/DERROTA válido; null se rechaza con GHOST_RESULT_REQUIRED. Ausencia paga solo base; presencia usa el bono aprobado. No cambian fórmulas ni las decisiones de M, empate, presencia o liquidación.

Pruebas ajustadas: competitive.spec.ts ahora usa null/null para primera referencia; competitive.trivia.spec.ts conserva los cuatro casos válidos y rechaza expresamente los tres resultados sin fantasma y resultados malformados con referencia. competitive-postgres.test.cjs conserva la prueba de identidad compartida usando evidencia válida null/null y añade cinco combinaciones incompatibles, exigiendo rechazo con cero eventos/balances y xpTotal intacto. No se sustituyó la aserción IDEMPOTENCY_CONFLICT por un error genérico ni se relajaron pruebas anteriores.

Auditoría documental: README raíz y README API conservaban «PR-I1 espera decisiones/no comenzar»; se actualizó solo esa referencia y se añadió navegación de estado. No había índice general bajo docs; EDITORIAL_LEGACY_INDEX describe indexación de contenido, no documentación. Se añade docs/README.md con enlaces a los cuatro documentos especializados existentes y a ambos README. Los informes de arquitectura/pendientes/relevo encontrados corresponden a auditorías antiguas o a Flutter; no se reescriben. PR_I1_COMPETITIVE_INFRASTRUCTURE y esta auditoría ahora separan resumen vigente de historial explícito: cinco checkpoints confirmados y sexta ronda sin commit, tres flags apagados por defecto, reglas estrictas y dependencias de las cinco migraciones competitivas. La antigua compatibilidad sin fantasma se marca superada.

Rol PostgreSQL y RLS de producción siguen sin verificación; no se aplicaron migraciones remotas. Incertidumbre histórica de los 34 fallos y vencimiento intermitente Rescate siguen abiertos. Tira/Memoria/Batallas continúan pendientes; PR-I1 no fusionado a main y PR-I2 no iniciado. La comprobación local git merge-base --is-ancestor 88f7045 main devuelve 1: HEAD no contenido en main local; no se consultó/remodificó el remoto. Código implementado no se declara desplegado ni activado.

Validaciones de esta revisión: build exit 0; Jest competitivo exit 0, 6 suites/144 pruebas; Jest completo exit 0, 95 suites/1022 pruebas; PostgreSQL exit 0, 122/122, cero fallos/omitidas/canceladas, 88 061 ms; audit --omit=dev exit 0, cero vulnerabilidades con CA del sistema temporal/TLS activo; diff check exit 0. Logs: %TEMP%/pr-i1-sixth-review-build.log, pr-i1-sixth-review-competitive.log, pr-i1-sixth-review-jest.log y pr-i1-sixth-review-postgres.log. No hubo fallos nuevos en esta ejecución. La prueba de Rescate pasó, sin declarar resuelta su incidencia histórica.

Enlaces: se comprobaron los cinco documentos modificados/creados, 42 enlaces Markdown locales y sus anclas, sin destinos faltantes. Recursos PostgreSQL propios desechables: 54 migraciones confirmadas más la incremental previa de la sexta ronda, intacta; contenedor propio eliminado por el runner. Docker Server 29.7.2/desktop-linux operativo; postgres-local ajeno conserva ID/inicio/estado Running. Sin commit, push, merge, despliegue, Supabase, Flutter ni TLS desactivado. Se detiene antes del sexto commit para revisión humana.
