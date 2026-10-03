# PR-I1 V1 — auditoría y preparación de Tira y afloja

## Estado vigente — checkpoint 13: admisión persistida sin liquidación

Base feat/pr-i1-competitive-infrastructure / fdfa9aa: doce checkpoints
confirmados; árbol limpio al iniciar. Ronda 13 local y sin commit.

### Auditoría de rutas y decisión aprobada

La única creación productiva encontrada es TiraAflojaService.emparejar(), invocada
por POST /tira-afloja/emparejamiento y protegida por JWT, correo verificado y rol
ESTUDIANTE. Primero recupera una partida abierta del usuario; si no existe,
selecciona banco publicado, toma el advisory de emparejamiento del usuario y
revalida el retry. Busca BUSCANDO por área, sin B, y serializa la incorporación
con el advisory de partida y updateMany condicionado. Si no se incorpora,
crea BUSCANDO con A y preguntas, evidencia preparada, presenciaVersion=1 y
certificacionRVersion=1. Estas tres inscripciones NO son admisión competitiva.
Snapshot completo y ambos participantes se congelan al pasar a ACTIVA;
presentaciones y testigo R siguen su protocolo confirmado post-COMMIT.

El propietario aprobó expresamente admisión automática por backend para nuevas
búsquedas de estudiantes elegibles cuando el futuro flag esté activo y colas
separadas por clasificación persistida. No se inventa modalidad elegible del
cliente. BuscarPartidaDto solo aporta área; ninguna opción competitive del
cliente determina admisión. Legacy y nuevas no admitidas comparten la cola
no competitiva; admitidas solo emparejan con nuevas solicitudes de clasificación
admitida. Repetir una búsqueda existente recupera su decisión original, aunque
el flag haya cambiado. No se reclasifica una búsqueda en espera.

### Prueba persistida y garantías PostgreSQL

[tira-afloja.admission.ts](../src/tira-afloja/tira-afloja.admission.ts) decide una
sola vez dentro de la transacción nueva. COMPETITIVE_TUG_ENABLED debe ser el
literal true; ausente, false, TRUE, 1 o vacío no admiten. Por defecto está apagado,
independiente de SOLO/TRIVIA/GHOST. No se cambia configuración de despliegue.

La migración [20261004010000_tug_competitive_admission](../prisma/migrations/20261004010000_tug_competitive_admission/migration.sql)
añade campos privados a PartidaTiraAfloja:

- competitiveAdmissionVersion=1 para decisiones nuevas, incluso no admisión.
- competitiveRulesVersion=1 solamente para admitidas; NULL para no admitidas.
- competitivePolicy: policyVersion=1, nombre COMPETITIVE_TUG_ENABLED y decisión
  booleana observada. CHECK exige correspondencia exacta con la versión XP.
- competitiveAdmissionAt y competitiveOriginalAId fijados por PostgreSQL al
  INSERT, no desde timestamps/identidades enviados por cliente.
- competitiveOriginalBId fijado por trigger al primer BUSCANDO → PREPARANDO;
  después B no se sustituye ni retira. El vínculo es consistente con jugadorBId.

Históricos, incluidos V1 preparados/certificados, conservan todos esos campos
NULL: no admitidos para XP y sin historial inventado. Las decisiones nuevas no
admitidas conservan versión/política propia, pero nunca se promueven mediante
UPDATE. SQL directo y Prisma no pueden cambiar decisión, versiones, política,
fecha ni A, ni reemplazar B después de su incorporación. Identidad, área y
versionReglas quedan vinculadas al contexto nuevo; DELETE conserva el registro.
No se introducen restricciones deportivas nuevas para filas legacy NULL.

TugMatchIdentity conserva los UUID originales sin FK al padre: al activar la
migración copia solo las identidades existentes, sin inventar admisiones ni
fechas históricas. Cada INSERT nuevo registra su UUID en la misma transacción;
duplicarlo se rechaza con TUG_ADMISSION_ID_REUSED. Por eso borrar una fila legacy
que permita el contrato anterior no permite recrearla como competitiva. Este
registro privado es append-only, sin TRUNCATE, con RLS y permisos revocados;
no cambia resultados deportivos ni ofrece una ruta pública.
Un renombrado de UUID que permita el contrato legacy también reserva la identidad
nueva, conservando la anterior; renombrar/borrar no reinicia la procedencia.

Una admisión positiva exige BUSCANDO nuevo sin B/rondas, preparación de evidencia,
presencia/visibilidad V1, reglas deportivas V1 y A estudiante con correo verificado.
Al incorporar B, PostgreSQL comprueba ambos estudiantes verificados y fija su
identidad. No se añaden locks de usuarios después del lock de partida: las
comprobaciones de rol son lecturas MVCC. El protocolo advisory y updateMany
existente conserva su orden. La admisión registra elegibilidad observada, no
garantiza que los roles nunca cambien; el futuro verificador debe revalidar las
políticas y reconstruir toda la evidencia bajo el protocolo de usuarios del par.

readTugAdmission distingue ADMITTED, NOT_ADMITTED y error específico
TUG_ADMISSION_EVIDENCE_INSUFFICIENT para evidencia incompleta/contradictoria.
ADMITTED no es resultado deportivo verificado. Un INSERT directo realizado por
el owner sigue siendo una operación privilegiada confiable; el trigger no puede
leer el entorno Node ni certificar que un owner no lo falsificó. Las restricciones
sí impiden promociones/reconfiguraciones retroactivas sin desactivar guards.
No se presenta seguridad frente a quien puede alterar los propios triggers.

Los contratos públicos siguen seleccionando campos explícitos: no retornan
admisión/política/participantes internos ni soluciones; alias A/B se conservan.
Los permisos privados y RLS existentes se mantienen; función nueva revocada
para PUBLIC/anon/authenticated. No hay endpoint para configurar flags.

### Límites y validación

TUG_MATCH no está admitido por el registry para liquidación: sin verificador
registrado, sin XP ni recuperación de pagos deportivos reales. La nueva admisión
solo preparará la condición necesaria que el futuro adapter deberá exigir,
además del replay, todos los certificados R, fase ACTIVA y terminales correctos.
Los cierres deportivos, tiempos, gracia, UNKNOWN, snapshots y fórmulas no cambian.
El núcleo aislado del checkpoint 12 conserva sus barreras de abandono/neutral.

Pendientes: replay completo, clasificación neutral/fase ACTIVA, integración TUG,
WAL/durabilidad física, rol/RLS productivos, 34 fallos históricos, Rescate y
limitaciones multiinstancia. PR-I1 no fusionado a main ni desplegado.
La migración nueva requiere revisión/aplicación autorizada antes del backend,
incluido despliegue con flag apagado; solo se prueba en PostgreSQL desechable.

Se conservan los doce archivos PostgreSQL anteriores y sus aserciones, y se
añade [competitive-tug-admission-postgres.test.cjs](../test/competitive-tug-admission-postgres.test.cjs).
Nueve casos: compatibilidad/cierre legacy, creación real con flag apagado y
evidencia V1 sin XP, promoción SQL bloqueada, colas/flags/reinicio/retries,
emparejamientos concurrentes desde dos clientes, inmutabilidad de metadata y
participantes, prerrequisitos/origen, recreación y renombrado/borrado de UUID.
No se usan esperas arbitrarias ni se registra un verificador de prueba productivo.
Los siete casos Jest nuevos cubren flag, colas, boundary del registry y
clasificación privada fail-closed. Las pruebas de flags positivos modifican
solo el proceso local de pruebas, no archivos/env de despliegue ni usuarios reales.

### Validación exacta del checkpoint 13

Build inicial: exit 0, 16989 ms. Build final después del registro de identidades:
exit 0, 27922 ms. Jest competitivo inicial: 213/213, 14 suites, 11,580 s;
final: 213/213, 14 suites, 16,931 s (19076 ms con npm). Completo inicial:
1094/1094, 103 suites, 68,946 s; final: 1094/1094, 103 suites, 72,235 s
(74413 ms con npm). No hubo suites Jest fallidas.

| PostgreSQL desechable completo | Resultado | Bloque / runner (ms) | Diagnóstico |
|---|---|---|---|
| 1 | 202/203, exit 1, trece archivos completos | 363022 / 375685 | Inventario exacto de funciones privadas no incluía tug_admission_guard. Los siete casos nuevos pasaron. No fue un fallo de Docker, historial institucional ni concesión de permisos. |
| 2 | 203/203, exit 0, trece archivos completos | 355316 / 369172 | Inventario actualizado con una entrada; conserva igualdad exacta y comprobación EXECUTE=false de cada función para anon/authenticated. Validación anterior al registro de identidades y sus dos casos nuevos. |
| 3 final | 205/205, exit 0, trece archivos completos | 352842 / 366248 | Registro privado de identidades aplicado; nueve/nueve casos nuevos, 3959,775 ms. Cero fallos/cancelados/omitidos/TODO, archivos inválidos o incompletos. |

La revisión de diseño detectó que un guard solo de UPDATE no cubría
borrado/recreación del UUID legacy. Se añadió el registro de identidad en la
migración todavía no confirmada y se probó el rechazo, incluido renombrado legacy,
sin modificar migraciones confirmadas. No se presenta la segunda ejecución verde
como validación del diseño final reforzado: esa evidencia corresponde a la tercera.

Audit omit=dev exit 0: cero vulnerabilidades, 2297 ms, TLS activo con CA del
sistema, NODE_OPTIONS restaurado. Diff --check exit 0 y 75 enlaces locales
existentes. Docker desktop-linux, Engine 29.7.2; solo recursos propios con nonce
y loopback, eliminados por cada runner. postgres-local conserva ID
20d971cc043fe04cf2fd14be83c906d2210f298381e58ac480a478ea305b7927 y StartedAt
2026-10-02T21:24:22.476116454Z. Se aplican 58 migraciones confirmadas más esta
migración nueva únicamente en el PostgreSQL desechable; nunca Supabase/remoto.
Logs conservados en TEMP con prefijo saberplus-thirteenth-.

Archivos: helper y spec/archivo PG nuevos, migración nueva; schema, servicio de
emparejamiento, .env.example, runner y un inventario exacto de funciones PG;
seis documentos/índices backend actualizados. No cambian CompetitiveService,
kernel del par, fórmulas ni motores de otros juegos. Detenido para revisión humana.

## Historial — checkpoint 12 confirmado en fdfa9aa

Base verificada: feat/pr-i1-competitive-infrastructure / 1c12245, once
checkpoints confirmados y árbol limpio al comenzar. Trabajo nuevo local, sin
commit. El checkpoint 11 y su revisión de visibilidad están confirmados.

Se prepara [CompetitivePairProtocol](../src/competitive/competitive.pair-protocol.ts),
aislado: no es un verificador deportivo, provider Nest ni API de admisión;
no se importa desde endpoints, sockets, registry o reconciliadores productivos.
TUG_MATCH sigue rechazado por el registro habitual con SOURCE_NOT_INTEGRATED.
No hay flag Tira, nuevas admisiones ni liquidaciones automáticas. Los tres flags
existentes permanecen apagados por defecto. No se convierten partidas históricas,
preparadas o certificadas en competitivas.

### Protocolo preparado y alcance de su prueba

Una transacción ReadCommitted: clave compartida hash(TUG_MATCH, partida,
SETTLEMENT), independiente de participante/version → leer identidades originales
sin lock de partida → bloquear ambos Usuario por UUID canónico ordenado → adapter
bloquea partida/evidencia y revalida identidades → validar ambos terminales,
R/resultados compatibles, cálculos e historial institucional → publicar ambos
ledger/balances con las primitivas existentes → COMMIT único. No se invoca dos
veces settle individual. La clave de cada evento conserva el contrato habitual
fuente/partida/participante/SETTLEMENT, sin versión en la identidad.

CompetitiveService solo cambia cuatro métodos de private a protected para
reutilizar su validación/locks/post; el comportamiento de liquidación individual
y correcciones no cambia. El writer común conserva piso cero, nominal/aplicado,
secuencia, alcanzadoEn, temporada Bogotá e institución histórica. Usuario.xpTotal
no se modifica. Solo dos eventos previos con hashes compatibles son un retry;
un evento solo o evidencia divergente bloquea todo el par. Cualquier error
intermedio revierte ambos eventos y balances.

La prueba nueva [PostgreSQL del núcleo](../test/competitive-pair-protocol-postgres.test.cjs)
usa ledger/balances reales y conexiones independientes, pero su adapter lee una
tabla de fixtures sintéticos: NO son partidas Tira verificadas ni un verificador
ficticio registrado. Prueba cálculos normales, half-up, cero R sin
bonos, barreras de abandono, validación de ambos, rollback después del primer ledger,
idempotencia, reinicio del objeto, concurrencia entre instancias, conflicto de
hash/parcialidad e historial ausente. La prueba de locks combina el núcleo real
de ledger con el protocolo Usuario ordenados → advisory de partida de un fixture;
no se presenta como carrera con un cierre deportivo real. Los once archivos
anteriores siguen incluidos, con su evidencia deportiva/visibilidad independiente.

### Bloqueos: todavía NO hay verificador autoritativo TUG

No existe inscripción/admisión competitiva persistida en PartidaTiraAfloja;
certificacionRVersion=1 solo certifica visibilidad. Es indispensable diseñar
inscripción inmutable para nuevos intentos admitidos por servidor; las partidas
existentes deben seguir excluidas. No se crea ni simula esa autoridad aquí.

El adapter productivo aún debe reconstruir el resultado completo desde snapshot,
Qpartida, respuestas aceptadas, todos los R originales y sus certificados,
eventos de resolución y abandono/presencia, conservando precisión temporal SQL.
El núcleo recibe VerifiedTerminal de un adapter confiable: no demuestra por sí
solo C/R, resultado, UNKNOWN, prioridad de gracia/plazo o ausencia de falsificación
parcial. Registro y conexión productivos quedan bloqueados hasta ese replay.
El adapter debe leer participantes terminales inmutables sin locks de partida
antes de los Usuario y no adquirir usuarios adicionales después de ese prefijo.
VerifiedTerminal actualmente solo representa RESULTADO, ABANDONO y
VICTORIA_POR_ABANDONO: hace falta representar los cierres neutrales legítimos
sin inventar EMPATE deportivo ni aplicar -15 a un EXPLICIT anterior a ACTIVA.
La revisión humana del checkpoint 12 establece una barrera explícita:

- Dos clasificaciones ABANDONO se rechazan con
  PAIR_DOUBLE_ABANDONMENT_UNAPPROVED. CANCELADA por gracias confirmadas exactamente
  simultáneas conserva su contrato deportivo, sin ganador ni XP positivo; no
  hay aprobación inequívoca de dos penalizaciones de -15.
- Cualquier par con un ABANDONO se rechaza íntegramente con
  PAIR_ABANDONMENT_PHASE_UNVERIFIED, incluso definitive=true y aunque el rival
  declare activeCompetitiveMatch=true. VerifiedTerminal no prueba la fase del
  abandono; no basta la elegibilidad declarada del premio del rival.
- Otras combinaciones no normales se rechazan con
  PAIR_TERMINAL_CLASSIFICATION_UNSUPPORTED. No se fabrican EMPATE ni premios
  neutrales. Estas barreras preceden a la lectura de idempotencia y a cualquier
  posting: no crean eventos ni balances para ninguno de los participantes.

La futura adaptación debe reconstruir la fase desde la evidencia deportiva
persistida y ordenada: transición ACTIVA/RONDA_INICIADA frente al evento
TugAbandonment (reason EXPLICIT/GRACE y effectiveAt), bajo los locks del par.
No basta mirar el estado terminal actual ni definitive=true. EXPLICIT anterior
a ACTIVA exige cero XP para ambos, sin penalización ni cambio deportivo, y
necesita una representación neutral aprobada en el contrato futuro. No se añaden
campos al contrato compartido ni se implementa ese verificador en esta ronda.
Las pruebas de protocolo simulan y rechazan la clasificación ambigua de un
adapter; no se presentan como replay deportivo de un EXPLICIT real.

El núcleo no resuelve ese contrato mediante un verificador ficticio.
Un R sin certificado debe bloquear la partida completa; nunca recortar R ni
inventar certificados/backfill. Esa exigencia NO está implementada en el adapter
del fixture, y por tanto NO se afirma liquidación real segura de Tira.

Todas las variantes deportivas permanecen bloqueadas para XP. En particular,
certificado ausente/tardío, R real distinto de Q, rival UNKNOWN, cancelación
simultánea y EXPLICIT pre-ACTIVA conservan los contratos aprobados, pero no se
presentan como liquidaciones verificadas por las pruebas del núcleo. El adapter
futuro debe justificar individualmente cualquier tratamiento negativo de una
cancelación; este trabajo no decide ni activa esa variante.

### Vigencia institucional comprobada

HistorialInstitucionCompetitiva no representa intervalos independientes con
fecha de fin. Es un log inmutable de transiciones, definido en schema.prisma y
la migración 20260930120000_competitive_infrastructure: el trigger de Usuario
registra cada cambio de institucionId con clock_timestamp(), incluida una salida
con institucionId=null. Un estado termina implícitamente al comenzar el siguiente.
Se selecciona el máximo (desde, id) con desde <= terminalAt; id resuelve empates
en la precisión de milisegundos. En el límite exacto corresponde el estado nuevo,
no el anterior. No hay columna hasta que falte filtrar ni otra migración que
reemplace esta representación. La ausencia de cualquier registro anterior o
igual sigue bloqueada con HISTORICAL_MEMBERSHIP_UNKNOWN.

La regresión PostgreSQL utiliza cambios reales de Usuario y su trigger, sin
insertar ni inventar historial: null → institución A → institución B → null;
liquida después de la salida fuentes cerradas en los límites exactos reales y
una fuente anterior. Comprueba institución original, sustitución y salida nula
para ambos eventos del par. No se cambia la consulta común ni otros juegos.

Sin migraciones nuevas ni cambios a migraciones confirmadas. WAL/durabilidad
física, rol/RLS productivos, 34 fallos históricos, Rescate y límites multiinstancia
siguen abiertos. Validación local no autoriza despliegue. PR-I1 no fusionado a main.

### Validaciones e intentos del checkpoint 12

#### Revisión humana: barreras de abandono y vigencia institucional

Build exit 0, 30894 ms. Jest competitivo: 206/206, 13 suites, 27,291 s
(29508 ms con npm). Jest completo: 1087/1087, 102 suites, 90,561 s
(92660 ms con npm). PostgreSQL desechable: 196/196, los doce archivos completos,
351017 ms del bloque y 365909 ms del runner, exit 0; cero fallos, cancelados,
omitidos, TODO, archivos inválidos o incompletos. El archivo del núcleo conserva
los doce casos, ajustando el caso de penalización ahora no autorizada a exigir
rechazo íntegro, y añade cuatro: dos abandonos, clasificación EXPLICIT pre-ACTIVA,
combinación no normal y transiciones institucionales. Resultado 16/16,
2888,822 ms; ningún caso está omitido. Las pruebas comunes del piso cero y las
fórmulas V1 permanecen intactas. Los fixtures no prueban un replay deportivo.

Audit omit=dev: exit 0, cero vulnerabilidades, 2501 ms, TLS activo y CA del
sistema; NODE_OPTIONS restaurado. Diff --check exit 0; 70 enlaces locales
comprobados, ninguno roto. Docker desktop-linux / Engine 29.7.2 disponible;
postgres-local conserva ID y StartedAt. Solo el PostgreSQL propio desechable
recibe las 58 migraciones confirmadas y se elimina al finalizar.
No hubo ejecuciones fallidas en esta revisión. Los intentos anteriores siguientes
se conservan como historial; no se confunden con esta validación.
Logs: TEMP, prefijo saberplus-twelfth-review-.

Cambios de esta revisión: kernel aislado, su archivo PostgreSQL y los dos
documentos especializados de infraestructura/Tira. Se preservan todos los otros
cambios locales. Sin nuevas migraciones, cambios al contrato compartido, motores,
fórmulas o liquidación productiva TUG. Se requiere revisión humana antes del commit.

#### Ejecuciones preparatorias anteriores a la revisión humana

Build final exit 0, 27507 ms. Los tres builds anteriores también pasaron:
20525, 15774 y 34209 ms. No se regenera Prisma mientras el runner mantiene
conexiones activas. El último build usa los archivos ya formateados.

Jest competitivo inicial: una suite no compiló (TS2345), con las 12 anteriores
y 205 pruebas aprobadas, exit 1; 16,805 s. Completo inicial: una suite no compiló,
las 101 anteriores y 1086 pruebas pasaron, exit 1; 71,620 s. La prueba nueva
intentaba la versión 2; el default había inferido el literal TypeScript 1.
Se declaró version:number y se conserva la validación V1 en runtime; no se
eliminó el caso ni se convirtió su argumento a any. Después: competitivo
206/206, 13 suites, 27,859 s; completo 1087/1087, 102 suites, 88,364 s; exit 0.

PostgreSQL: se conservan los once archivos anteriores y se añade el duodécimo,
sin cambiar el límite de 120 s por archivo ni el gate estricto.

| Ejecución completa | Resultado | Bloque / runner (ms) | Diagnóstico |
|---|---|---|---|
| Primera | 191/192, exit 1; 12 archivos completos | 344541 / 357290 | Los 11 archivos anteriores y 11 casos nuevos pasaron. La prueba de espera por locks agotó su transacción de 20 s (P2028); también se registró su rechazo asíncrono posterior. |
| Segunda | 192/192, exit 0; 12 archivos completos | 354169 / 367677 | 12/12 casos del núcleo, 2718,223 ms; cero cancelados/omitidos/TODO, fallos o archivos incompletos. |

La causa del fallo de observación se demuestra en la segunda ejecución:
una transacción lee actividad antes de iniciar el competidor (before=false);
otro backend en autocommit confirma el bloqueo real; la primera transacción
sigue viendo stale=false; pg_stat_clear_snapshot permite refreshed=true.
El diagnóstico queda registrado como activity-snapshot-versus-independent-lock-observer.
La barrera ahora usa esa conexión independiente. No se aumentan los 20 s,
ni se elimina/reduce la aserción: se agregan las tres comparaciones exactas.
Esto corrige el harness, no una regresión demostrada del protocolo de ledger.

Las ocho solicitudes concurrentes desde dos instancias recuperan los mismos
dos IDs, sin duplicates y con versión 1 de ambos balances. El fallo inyectado
tras el primer post real deja cero eventos y cero balances. La parcialidad
previa se genera mediante un writer deliberadamente roto SOLO en el fixture;
el núcleo normal la detecta y no completa ni repaga silenciosamente.

Audit omit=dev exit 0, cero vulnerabilidades, 4811 ms; TLS activo, usando CA
del sistema y restaurando NODE_OPTIONS. Diff --check exit 0, 70 enlaces locales
válidos. Ambos runners aplican las 58 migraciones confirmadas solo en PostgreSQL
desechable propio. No se interviene postgres-local, que conserva ID/StartedAt.
Los logs se conservan en TEMP con prefijo saberplus-twelfth-.

Archivos: núcleo aislado, spec Jest y archivo PG nuevos; CompetitiveService
(solo cuatro accesos protected), runner (+1 archivo) y los seis documentos de
estado/índices. No se cambian schema, fórmulas, motores ni verificadores actuales.
Sin nuevas migraciones, commit, push, merge, despliegue o acceso a Supabase.

## Historial — checkpoint 11 confirmado en 1c12245: visibilidad R

2026-10-03, rama `feat/pr-i1-competitive-infrastructure`, HEAD `7edef15`.
Diez checkpoints confirmados; árbol limpio al iniciar. La ronda 11 permanece
local y sin commit. TUG_MATCH sigue sin admisión, verificador o liquidación;
CompetitiveService y las fórmulas V1 no se modifican.

### Contrato y evidencia de la certificación

La [migración nueva](../prisma/migrations/20261003220000_tug_round_visibility/migration.sql)
depende de evidencia y presencia Tira confirmadas. Añade `certificacionRVersion=1`
solo al crear partidas nuevas; históricos y preparados anteriores permanecen
NULL, sin UPDATE de inscripción ni backfill. El motor deportivo sigue contando
sus filas R originales. La certificación es evidencia adicional, nunca una
habilitación retroactiva, un ACK de cliente o una modificación del denominador.
La inscripción de certificación no es admisión competitiva. Tampoco las
partidas nuevas certificadas en esta ronda pueden convertirse o pagarse
retroactivamente cuando se integre XP: todas siguen sin admisión competitiva.

El trigger de inserción conserva el XID **top-level** `xid8` y PID PostgreSQL
de origen en cada fila R nueva. Ambos participantes deben conservar la misma
transacción, pregunta, programación y deadline. La identidad xid8 se almacena
como texto decimal generado por PostgreSQL, evitando conversión/truncamiento
a xid32 o Number de JavaScript. UPDATE/DELETE de R siguen rechazados.
La semántica de top-level y estado de transacción corresponde a la
[documentación PostgreSQL 16](https://www.postgresql.org/docs/16/functions-info.html);
los casos y comparaciones temporales se verifican además en PostgreSQL real.

[El testigo privado](../src/tira-afloja/tira-afloja-visibility.witness.ts) usa
otro PrismaClient/pool sobre el mismo DATABASE_URL del PrismaService estándar.
Antes de leer evidencia, verifica la base real del PrismaService inyectado:
el origen toma un advisory lock transaccional aleatorio y el testigo debe
observarlo ocupado en otra sesión. Ese namespace pertenece a la misma base
PostgreSQL; una configuración divergente falla con TUG_WITNESS_DATABASE_MISMATCH,
sin consultar ni insertar certificados. No se cambia configuración persistente
ni se leen credenciales internas de Prisma. El chequeo se comparte en la
inicialización del pool y se reintenta si falla; se reinicia al cerrarlo.
No recibe el cliente transaccional del escritor para certificar. Tras el COMMIT del motor,
observa candidatos y llama `tug_certify_presented_round`. La DB bloquea ambos
Usuario ordenados → advisory/fila de partida, lee la pareja y exige:

1. Inscripción nueva y evidencia original V1.
2. Ambos R completos, consistentes e inmutables.
3. PID de testigo diferente del origen y XID de testigo diferente del top-level
   de origen, incluso cuando la inserción se hizo en un savepoint.
4. `pg_xact_status(origenXid)='committed'`, nunca `in progress`, abortado o NULL.
5. `clock_timestamp()` PostgreSQL **después** de locks/lecturas/comprobaciones
   estrictamente anterior al menor deadline congelado de ronda/partida.

El guard de `TugRoundVisibility` genera/reescribe los hechos, sin confiar en
timestamps o identidades recibidos por INSERT. El certificado del par tiene PK
partida/ronda, XID/PID de origen y observador, `observadaEn` y `limiteEn` con
microsegundos. Es append-only, privado y con RLS; anon/authenticated tampoco
pueden ejecutar las funciones. Los reintentos recuperan el certificado existente
sin fabricar una segunda observación. Una conexión de origen no se autocertifica.

La distinción es esencial: **observación efectiva de una fuente ya confirmada**
no es el instante del COMMIT del certificado. Un testigo puede observar R válido
antes del límite y confirmar su certificado después. Su evidencia proviene del
guard ejecutado a tiempo contra una fuente confirmada, no de afirmar que una
escritura tardía ocurrió antes. El certificado no contiene una supuesta hora
exacta de COMMIT. Si el testigo aborta antes de confirmar, no queda certificación.

| Caso | R deportivo | Evidencia para futura liquidación |
|---|---|---|
| Origen confirmado y observado por otro backend a tiempo | Se conserva el par | Certificado independiente persistido. |
| SET CONSTRAINTS IMMEDIATE temprano y COMMIT de origen tardío | Puede existir el par por la brecha confirmada | Sin certificado; no elegible. |
| Origen oportuno, pero testigo ausente/abortado hasta después del límite | Se conserva el par | Momento oportuno no demostrable; no elegible. |
| Testigo en espera hasta el límite | Se conserva el par | El reloj posterior al lock impide certificar. |
| Certificado confirmado y posterior reinicio | Se conserva el par | Reutilizar la evidencia existente, sin backfill. |

No se deduce «COMMIT tardío» de la mera ausencia de certificado: la DB pudo
confirmar a tiempo sin que sobreviviera un testigo. El caso B se demuestra en
las transacciones controladas de las pruebas; para una partida sin testigo en
producción, distinguir B de C retrospectivamente **no está garantizado**.
La recomendación es exigir prueba positiva A y tratar ambos casos restantes
como no elegibles, conservando R. No reconstruir fechas desde inserciones,
ni usar un timestamp de COMMIT como sustituto de observación independiente.
Una clasificación negativa durable más precisa requeriría investigación
adicional y un protocolo verificable; no se simula en esta ronda.

La recuperación del motor busca pares pendientes mientras la observación aún
es posible, incluso si hubo cierre deportivo dentro de la ventana. Tras el
deadline no inventa certificaciones. El testigo solo absorbe el SQLSTATE privado
PT001 (deadline vencido durante la observación). Otras violaciones 23514,
errores de esquema, conectividad y deadlocks llegan al límite post-COMMIT del
servicio: registra TUG_VISIBILITY_PENDING con partida, código Prisma y SQLSTATE,
sin devolver al cliente un fallo de una operación deportiva ya confirmada.
El certificado permanece ausente; la recuperación reintenta solo dentro del
plazo original. Errores de la transacción deportiva no se capturan ni se ocultan.
Ausencia de certificado es fail-closed.

### Revisión humana: cobertura y fallos posteriores al COMMIT

Solo registrarPresentacion inserta R, mediante tug_record_presented_round;
sus dos llamadores son responder y procesarEstado. Ambos verifican el par
confirmado y llaman al testigo después del COMMIT. responder lo hace ahora
directamente antes del publisher o de otra transacción deportiva, evitando
que una espera posterior consuma la oportunidad de observación. procesarEstado
lo hace también cuando el intento ya es terminal y quedan pares certificables.
marcarListo/iniciarPrimeraRonda y resolverRondaActual programan la ronda, pero
no insertan R durante la cuenta regresiva/pausa. Obtener, respuestas y el worker
invocan procesarEstado; la recuperación busca además pares pendientes dentro
del deadline, incluidos los que sobrevivieron a un reinicio.

La partida completa PostgreSQL usa listo y respuestas públicas, sin invocar
manualmente procesarEstado entre rondas. Otro caso deja transcurrir la cuenta
regresiva según PostgreSQL entre la consulta previa y la transacción de respuesta:
comprueba que el par creado por responder ya tenga certificado antes del siguiente
procesamiento. Son flujos del servicio real conectado a PostgreSQL, no una prueba
HTTP ni un verificador XP. La prueba de error SQL real 22012 comprueba respuesta
confirmada, reintento sin segunda escritura, error observable, certificado ausente
y recuperación oportuna. La caída de transporte se inyecta explícitamente, no se
presenta como una caída real de red. La recuperación mantiene el par sin certificar
durante el fallo y lo observa después si aún está dentro del plazo.

**Gate del futuro verificador:** comprobar que todos los pares R originales
del intento tienen certificación válida. No contar solamente los certificados
como nuevo R ni ignorar una ronda sin certificado: eso alteraría C/R. Una sola
habilitación no certificada bloquea la liquidación del intento, conservando
originales y motivo diagnosticable. Hoy no hay verificador ni premios TUG.
Esta certificación no demuestra C, terminal deportivo, elegibilidad/presencia
para bono ni historial institucional: el replay y la liquidación atómica del
par siguen pendientes. No queda autorizado registrar/activar XP Tira.

### Límites de la garantía y despliegue

Se prueba visibilidad lógica en PostgreSQL real mediante conexiones distintas.
Pruebas de reconexión/rollback representan recuperación de aplicación; no
demuestran supervivencia a pérdida física del servidor/disco. WAL, fsync,
synchronous_commit y recuperación física productiva siguen pendientes. El
contenedor local usa tmpfs. Permisos/rol/RLS productivos no están verificados;
no se aplican migraciones remotas. Revisar presupuesto de conexiones: el pool
del testigo es separado del pool del escritor. Requiere la migración nueva
antes del backend nuevo, incluso sin admisión XP. No se ocultan errores de
esquema faltante. Publisher local/multiinstancia, los 34 fallos históricos y
la intermitencia de vencimiento de Rescate continúan abiertos.

Las pruebas de [visibilidad PostgreSQL](../test/competitive-tug-visibility-postgres.test.cjs)
añaden conexiones con PID distintos, límites reales sin acortar rondas,
savepoint/IMMEDIATE/COMMIT tardío, testigo abortado/reinicio, certificado
confirmado tarde tras observación efectiva temprana, esperas por locks,
reintentos/dos instancias, privacidad/RLS, históricos, cierre normal/abandono
y ausencia de ledger/balance XP. [Jest](../src/competitive/competitive.tug-visibility.spec.ts)
solo verifica la frontera operativa del testigo, no simula prueba de visibilidad.
El runner conserva los diez archivos anteriores y agrega el undécimo, sin
cambiar el gate estricto ni los 120 s por archivo.

### Validación de la revisión humana — historial de intentos

Se conserva un build inicial exitoso (17790 ms). El segundo intento falló
con EPERM al renombrar query_engine-windows.dll.node mientras el runner
PostgreSQL seguía usando Prisma. No se eliminó la DLL ni se detuvieron procesos
ajenos. Terminada esa ejecución, el build completo pasó (18542 ms).

Primera validación PostgreSQL de la revisión: 174/180, exit 1; once archivos
completos, seis fallos en visibilidad, cero cancelados/omitidos/TODO. Bloque:
309737 ms; runner total: 321860 ms. Los otros diez archivos pasaron. El error
demostrado del chequeo nuevo fue P2010 con meta.code=N/A: Prisma no puede
deserializar una columna void de pg_advisory_xact_lock. Fallaron las pruebas
de recuperación tras caída, testigo real del servicio, partida normal completa,
certificación inmediata de responder, recuperación tras SQL 22012 y recuperación
tras transporte inyectado, porque no pudieron obtener certificado. Se añadió
::text al resultado del lock, sin modificar relojes, deadlines ni aserciones.
Los fallos históricos de 34 pruebas y Rescate no se atribuyen a este defecto nuevo.

Validación final después de corregir el tipo void:

| Validación | Resultado exacto |
|---|---|
| Build | Exit 0; 18542 ms; ejecutado sin runner activo para evitar el conflicto DLL. |
| Jest competitivo | 205/205, 12 suites, 18,497 s; primera ejecución también 205/205, 19,034 s. |
| Jest completo | 1086/1086, 101 suites, 50,355 s; primera ejecución también 1086/1086, 45,703 s. |
| PostgreSQL completo, segunda ejecución | 180/180, 11 archivos completos, exit 0; bloque 306762 ms, runner 318822 ms. |
| PostgreSQL visibilidad | 13/13; 88856,834 ms; incluye SQLSTATE PT001 explícito y los tres recorridos nuevos. |
| Audit omit=dev | Exit 0; cero vulnerabilidades; 1791 ms, TLS activo con CA del sistema. |
| git diff --check | Exit 0. Los 67 enlaces Markdown locales siguen apuntando a archivos existentes. |

PostgreSQL: cero fallos, cancelados, omitidos, TODO o archivos incompletos en la
segunda ejecución. Ambas ejecuciones aplican 57 migraciones confirmadas más
la nueva, exclusivamente en contenedores desechables propios. Cada log incluye
una sonda inicial docker/pg_isready con code=2 antes de estar disponible; el
retry de arranque existente alcanzó disponibilidad y no fue un fallo del daemon.
El contenedor ajeno postgres-local conserva ID y StartedAt; no se intervino.

Esta revisión cambia el motor Tira, testigo, pruebas Jest/PG de visibilidad,
la migración nueva (solo SQLSTATE de deadline) y estos dos documentos de Tira
e infraestructura. Se preservan los otros siete archivos ya modificados del
checkpoint; el cambio de Trivia/Duelo sigue siendo exclusivamente HEAD y
cantidad de checkpoints, sin alterar contratos. Ninguna migración confirmada
se modifica. Rama y HEAD siguen feat/pr-i1-competitive-infrastructure / 7edef15.
Sin commit, push, merge, despliegue o migraciones remotas. TUG_MATCH sigue sin
admisión/verificador/liquidación. WAL, rol/RLS productivos, publisher entre
instancias, incertidumbre de los 34 fallos y Rescate permanecen pendientes.

### Validaciones previas a la revisión humana de la ronda 11 e intentos fallidos

Build final exit 0 (17082 ms); Jest competitivo 200/200, 12 suites, 8,117 s;
Jest completo 1081/1081, 101 suites, 38,904 s. La primera build y ambas suites
también pasaron: competitivo 14,376 s y completo 39,171 s. Seis casos nuevos
Jest; ninguna fórmula ni prueba aritmética se modifica.

| PostgreSQL completo, 11 archivos | Resultado | Bloque / runner (ms) | Diagnóstico |
|---|---|---|---|
| Primera ejecución | 176/177, exit 1 | 297167 / 308961 | Inventario exacto de permisos esperaba 16 funciones; el esquema ahora tiene 20. Las diez pruebas nuevas pasaron. |
| Segunda ejecución | 177/177, exit 0 | 291894 / 303107 | Inventario actualizado y acceso privado preservado; **no prueba por sí sola terminación de la conexión**, por rechazo genérico demasiado amplio en esa prueba nueva. |
| Tercera ejecución | 176/177, exit 1 | 288402 / 300327 | La aserción fuerte detectó que no se había terminado el escritor: el error SQL anterior podía satisfacer assert.rejects. |
| Final tras corregir el tipo PID | 177/177, exit 0 | 292302 / 303458 | Terminación real exigida y alcanzada; rollback, recuperación y las diez pruebas nuevas aprobadas. |

La primera corrección amplía el inventario exacto y el rechazo efectivo de
anon/authenticated para las cuatro funciones y tabla nuevas; no elimina
aserciones. Se cierra además el pool del testigo en el teardown del fixture
HTTP existente. La segunda corrección afecta únicamente la nueva prueba:
Prisma 5.22 enlaza el PID Number como bigint; un contenedor diagnóstico propio
reprodujo P2010/meta.code=42883 y el mensaje
`function pg_terminate_backend(bigint) does not exist`. La misma llamada con
`::integer` devolvió terminated=true. La prueba conserva una bandera/aserción
que exige haber ejecutado la terminación real, antes de verificar rollback y
recuperación. No se usa un error previo como sustituto de caída de conexión.
Los registros de las ejecuciones previas permanecen; el verde de la segunda
no se presenta como demostración de ese camino de recuperación.

Audit omit=dev: 0 vulnerabilidades, TLS activo y CA del sistema temporal,
sin cambios persistentes en NODE_OPTIONS. PostgreSQL final: 11 archivos completos,
57 migraciones confirmadas más la nueva de visibilidad; PostgreSQL 16.15/UTC,
72 tablas y 34 triggers. Cero fallos/cancelados/omitidos/TODO y cero archivos
fallidos/incompletos/inválidos. Revisión de enlaces locales y diff/check se
registra en el cierre documental inferior.

Logs conservados en TEMP: `saberplus-eleventh-postgres-1.log`,
`saberplus-eleventh-postgres-2.log`, `saberplus-eleventh-postgres-final.log`
(tercera, fallida) y `saberplus-eleventh-postgres-final-2.log` (corrección PID);
build/competitive/jest/audit con sufijos `-1` y `-final` de la misma familia.
El runner mantiene resúmenes íntegros y rechaza archivos fallidos, parciales,
cancelados, omitidos y TODO. Solo se elimina cada contenedor propio verificado
por etiqueta; el diagnóstico PID no modifica postgres-local.

| Archivo PostgreSQL, ejecución final (test/) | Pass / total | Proceso (ms) |
|---|---:|---:|
| competitive-postgres.test.cjs | 25/25 | 7341 |
| competitive-solo-postgres.test.cjs | 38/38 | 10766 |
| competitive-trivia-boundary-postgres.test.cjs | 1/1 | 2450 |
| competitive-trivia-evidence-postgres.test.cjs | 15/15 | 22191 |
| competitive-trivia-presence-postgres.test.cjs | 26/26 | 14894 |
| competitive-trivia-xp-postgres.test.cjs | 17/17 | 31515 |
| competitive-tug-boundary-postgres.test.cjs | 8/8 | 2328 |
| competitive-tug-evidence-postgres.test.cjs | 15/15 | 74240 |
| competitive-tug-presence-postgres.test.cjs | 15/15 | 31612 |
| competitive-tug-preflight-postgres.test.cjs | 7/7 | 17111 |
| competitive-tug-visibility-postgres.test.cjs | 10/10 | 77851 |

Archivos: diez modificados (seis documentos de estado, schema, motor Tira,
runner y prueba previa de permisos) y cuatro nuevos (migración, testigo,
Jest y PostgreSQL de visibilidad). No se modifican migraciones confirmadas,
CompetitiveService, registro de verificadores, fórmulas o los otros motores.
Trivia/Duelo solo actualizan dos líneas de metadata documental del checkpoint.
Snapshots, eventos, R originales, alias públicos y legacy se conservan.

Docker Engine 29.7.2, contexto desktop-linux. postgres-local conserva ID
20d971cc043fe04cf2fd14be83c906d2210f298381e58ac480a478ea305b7927 y StartedAt
2026-10-02T21:24:22.476116454Z, activo/healthy. No se modifica/reutiliza ese
contenedor; el diagnóstico extra y los cuatro runners usan recursos propios.
Rama/HEAD se mantienen en feat/pr-i1-competitive-infrastructure/7edef15.
Sin commit/push/merge/despliegue/Supabase/migraciones remotas/Flutter/PR-I2.
Detenido para revisión humana. Liquidación del par aún bloqueada por contrato
de locks y replay no implementados; certificación positiva no los sustituye.
Cierre documental: 67 enlaces Markdown locales comprobados, cero rotos;
git diff --check exit 0. Estado del árbol: 10 modificados y 4 nuevos,
todos sin commit; las versiones confirmadas de las migraciones permanecen intactas.

## Historial — décima ronda, confirmada en 7edef15

2026-10-03, rama feat/pr-i1-competitive-infrastructure, HEAD 3d0e625.
Árbol inicialmente limpio; nueve checkpoints confirmados, incluida presencia
durable Tira. La ronda 10 agrega exclusivamente auditoría y pruebas preparatorias.
No se registra TUG_MATCH, no existe admisión/flag XP Tira ni se modifican los
verificadores actuales. No hay migraciones nuevas o cambios a las confirmadas.

### Evidencia auditada

| Hecho | Fuente autoritativa | Límite para liquidación |
|---|---|---|
| Participantes originales | snapshotInicial.participants y jugadorAId/jugadorBId congelados al activar evidenciaVersion=1 | Leer ambos antes del lock y revalidarlos bajo el par ordenado; pertenencia/elegibilidad histórica no se inventa. |
| Preguntas y Qpartida | Snapshot completo original, opciones y soluciones; qPartida 4..20 y preguntas asignadas | No consultar banco mutable ni reducir Q al número respondido. No equivale a admisión competitiva. |
| R individual | TiraAflojaRondaPresentada, PK partida/ronda/usuario; pareja atómica y ventana SQL | Cuenta habilitaciones, no sockets/ACK; validación diferida no es un certificado de instante físico de COMMIT. |
| Respuestas y C | TiraAflojaRespuesta, propietario/ronda/clave únicos; solución validada contra snapshot y OPEN por trigger | Recalificar independientemente, conservar orden/instantes; no aceptar C o resultado del cliente. |
| Resultado normal | Resolver rondas, posición/meta y agotamiento; eventos append-only | Replay obligatorio: una fila terminal sola no demuestra un resultado. |
| Abandono y cierre | TugAbandonment + TugPresence/Event/Connection, GRACE o EXPLICIT y fecha efectiva | UNKNOWN no prueba abandono. GRACE deportiva del rival no certifica elegibilidad para recompensa. |
| Precisión temporal | PostgreSQL timestamp(6), selección de primera gracia y fecha exacta | No ordenar gracias por UUID ni truncarlas con JS Date para decidir ganador. |
| Liquidación previa | EventoXpCompetitivo, clave fuente/usuario/SETTLEMENT sin rulesVersion | Ninguna liquidación funcional TUG; fixtures sintéticos de tests comunes no son integración del motor. |

### Bloqueo y protocolo propuesto

CompetitiveService.settle obtiene clave de fuente **por participante**, bloquea
ese Usuario y luego llama loadTerminal. Tira obtiene ambos Usuario en orden UUID,
advisory de partida, fila de partida y después respuestas/presencia. Añadir
loadTerminal que tome el segundo usuario después del primero sería incompatible:
A puede retener Usuario A y esperar B, mientras B retiene B y espera A.
Las nuevas pruebas invocan las primitivas reales de CompetitiveService y
tug_presence_lock en PostgreSQL: el ciclo se reprodujo con P2010/SQLSTATE
40P01 (una transacción abortada por deadlock y otra completada). Es un diagnóstico
esperado dentro de una prueba aprobada, no una ejecución fallida oculta ni una
regresión de los verificadores registrados. No se instala un verificador de
prueba como si fuera funcional.

La revisión final añade aserción estructurada failure.code=P2010 y
failure.meta.code=40P01, además del mensaje. Prisma 5.22 expone ese SQLSTATE
de forma fiable para este camino PostgreSQL/$queryRaw, observado en la ejecución
anterior. No se generaliza a todos los errores o futuras versiones de Prisma:
un timeout u otro error SQL no puede satisfacer la prueba de deadlock.

Modificación mínima necesaria del contrato común antes de registrar TUG:
un camino interno de liquidación **del par en una sola transacción**. Orden:
clave común de idempotencia de partida canónica → ambos Usuario ordenados →
advisory/fila de partida → replay/elegibilidad/historial → balances en orden
estable → ambos eventos ledger y proyecciones → COMMIT. Revalidar participantes
bajo lock; mantener claves individuales fuente/usuario/SETTLEMENT existentes
y tratar un par parcialmente liquidado como conflicto, no completar a ciegas.
La extensión debe adquirir el par antes del lock individual, no introducir una
excepción dentro del verificador. Correcciones actuales conservan clave de
operación → Usuario → balance; los verificadores monousuario no se alteran.

El kernel propuesto pasó con **marcadores desechables**, no con premios:
serialización, unicidad/retry, lectura tras reinicio, rollback total de un fallo
intermedio y observación coherente frente al cierre EXPLICIT real. Esto no
demuestra una liquidación ledger de dos usuarios implementada. Se detiene el
registro del verificador; CompetitiveService y el módulo permanecen intactos.

### Fórmulas y variantes

Normal: half-up exacto 60*C/R +40/+20/+0. Abandono propio: nominal -15,
delta aplicado con piso cero. Victoria por abandono: sin acciones = 0; con
acciones y elegibilidad suficiente, min(80, half-up(60*C/Qpartida)+20).
No combinar bonos. C=1,R=1,Q=20 da normal 100 frente a abandono 23;
C=1,R=8 da 48/28/8; máximo especial 80. Ayudas, ready y heartbeat no inventan C.

**Decisiones adicionales APROBADAS por el propietario en la revisión final:**
normal con R_A=0 y R_B=0 produce 0 XP para ambos, sin bonos de victoria/empate
ni inferencia de participación desde el resultado deportivo. Si R_A=0 y R_B>0
(o a la inversa), o hay respuestas aceptadas incompatibles con R, bloquear la
futura liquidación y registrar la inconsistencia. Los tests aritméticos cubren
los tres resultados con R=0 y rechazan C>R; no verifican la coherencia del par
ni todas las respuestas aceptadas, que requerirán el futuro verificador real.

EXPLICIT antes de llegar a ACTIVA produce 0 XP para ambos, sin penalización -15
ni recompensa de ganador. Se conserva el resultado deportivo vigente. El
nominal -15 permanece para abandono competitivo aplicable después de activarse;
no se ejecuta aquí. Estas dos decisiones ya no están pendientes de producto,
pero no habilitan admisión, integración ni liquidación TUG_MATCH. No se cambian
CompetitiveService, fórmulas, motor deportivo o migraciones.
CANCELADA simultánea tiene dos abandonos confirmados y ninguna recompensa
positiva; CANCELADA por plazo global sin abandono no se convierte en empate.
EXPLICIT con rival sin presencia conserva CANCELADA deportiva; no inventar
victoria ni aplicar fórmula normal a esa variante. La presencia insuficiente
del ganador deportivo UNKNOWN/gracia posterior no autoriza un premio positivo.

### R, visibilidad y WAL

Se distinguen filas confirmadas/visibles, atomicidad e idempotencia, flush físico
WAL y configuración de producción. El constraint diferido comprueba el reloj al
ejecutarse; PostgreSQL reprodujo SET CONSTRAINTS tug_presented_pair IMMEDIATE
temprano, espera controlada hasta el deadline y COMMIT posterior aceptado.
Una conexión independiente vio cero filas antes de ese COMMIT y dos filas
después, ya fuera de plazo. El código actual no emite ese SET CONSTRAINTS: el
hallazgo limita la garantía del constraint frente a SQL privado, no atribuye
el mismo comportamiento al camino normal. Sus pruebas de COMMIT tardío usual
siguen pasando. No se modifican guards confirmados ni se oculta el diagnóstico.
Un verificador no debe tomar filas/timestamps de inserción como prueba suficiente
de confirmación dentro de ventana; esas filas de diagnóstico no conceden XP.

La prueba obtuvo fsync=on, synchronous_commit=on, full_page_writes=on y
wal_level=replica del contenedor local. El runner usa tmpfs: ni esos settings ni una reconexión Prisma
demuestran persistencia en medio no volátil, recuperación física tras crash o
instante exacto de visibilidad productivo. Resolver certificación de habilitación
o una definición técnica aprobada antes de XP; mantener gate de revisión/autorización
de migraciones, rol/RLS y configuración WAL productiva, sin acceder a producción.

### Validación final de la revisión humana de la ronda 10

Decisiones R_A=R_B=0 y EXPLICIT antes de ACTIVA aprobadas documentalmente,
sin verificador ficticio. Jest añade victoria/empate/derrota sin bonos con R=0
y rechazo de C>R. El diagnóstico PostgreSQL conservó el mensaje y comprobó
explícitamente P2010 + meta.code=40P01; la aserción estructurada pasó sobre
Prisma 5.22/PostgreSQL 16, sin aceptar timeouts como prueba de deadlock.

Build exit 0; Jest competitivo 194/194 (11 suites, 24,557 s); Jest completo
1075/1075 (100 suites, 90,895 s). PostgreSQL 167/167 en 10 archivos completos,
254588 ms del bloque y 270686 ms del runner con preparación/limpieza, exit 0.
Cero fallos/cancelados/omitidos/TODO, archivos fallidos/incompletos/ inválidos.
Audit omit=dev: 0 vulnerabilidades con TLS activo; diff --check exit 0.
Ninguna validación falló en esta revisión. Los logs previos se conservan; nuevos
logs TEMP con prefijo saberplus-tenth-final-review-: build.log, competitive.log,
jest.log, postgres.log, audit.log y diff.log.

Se mantienen separados kernel de locks con marcadores, liquidación ledger del
par todavía inexistente, visibilidad de R antes del deadline no garantizada y
durabilidad física/configuración productiva pendientes. Sin cambios de runtime,
CompetitiveService, registro, flags o migraciones. Se preserva íntegro el árbol
preparatorio; los ajustes finales afectan únicamente las dos pruebas y ambos
informes PR-I1. Sin commit/push/merge/despliegue ni operaciones remotas.

### Historial: validación inicial de la ronda 10

Se conservan los nueve archivos PostgreSQL anteriores y se agrega
[preflight PostgreSQL](../test/competitive-tug-preflight-postgres.test.cjs),
con [pruebas Jest preparatorias](../src/competitive/competitive.tug-preflight.spec.ts).
Runner/gate mantienen resúmenes completos, cero cancelados/omitidos/TODO y
120 s por archivo secuencial. Build exit 0; Jest competitivo 190/190 (11 suites,
29,056 s), Jest completo 1071/1071 (100 suites, 84,717 s). PostgreSQL 167/167,
10 archivos, 264477 ms del bloque de pruebas y 280034 ms del runner completo
incluyendo preparación/limpieza, exit 0. Cero fallos/cancelados/omitidos/TODO,
archivos fallidos/incompletos/ inválidos. Una ejecución completa; ningún intento
de validación falló en esta ronda. Audit omit=dev: 0 vulnerabilidades con TLS
activo y CA del sistema, sin conservar cambios en NODE_OPTIONS. Diff --check
exit 0. Logs TEMP con prefijo saberplus-tenth-preflight-: build.log,
competitive.log, jest.log, postgres.log, audit.log y diff.log.

| Archivo PostgreSQL (test/) | Aprobados / total | Proceso (ms) |
|---|---:|---:|
| competitive-postgres.test.cjs | 25/25 | 8364 |
| competitive-solo-postgres.test.cjs | 38/38 | 13931 |
| competitive-trivia-boundary-postgres.test.cjs | 1/1 | 3258 |
| competitive-trivia-evidence-postgres.test.cjs | 15/15 | 29877 |
| competitive-trivia-presence-postgres.test.cjs | 26/26 | 20296 |
| competitive-trivia-xp-postgres.test.cjs | 17/17 | 42404 |
| competitive-tug-boundary-postgres.test.cjs | 8/8 | 6473 |
| competitive-tug-evidence-postgres.test.cjs | 15/15 | 81595 |
| competitive-tug-presence-postgres.test.cjs | 15/15 | 38465 |
| competitive-tug-preflight-postgres.test.cjs | 7/7 | 19811 |

El último archivo prueba el deadlock actual, el kernel de locks y marcadores,
rollback completo, observación concurrente de cierre real, terminal privilegiado
ficticio rechazado por la frontera no integrada, COMMIT diferido anticipado y
settings WAL locales. No afirma probar pagos TUG reales, dos premios ledger
atómicos ni recuperación física tras crash. La tabla de marcadores se elimina
en la DB desechable. El contenedor propio se elimina con ownership; postgres-local
conserva ID 20d971cc043f y StartedAt 2026-10-02T21:24:22.476116454Z.

Archivos: cinco documentos de estado (README raíz/backend, índice e informes
Infra/Tira), runner y dos pruebas nuevas; sin cambios de runtime, schema o
migraciones. Estado: 6 modificados y 2 nuevos. El verificador TUG permanece
sin implementar/registrar; el protocolo descrito es preparación, no un pago listo.
Siguen abiertos los 34 fallos históricos, Rescate y limitaciones multiinstancia:
publisher local, sin entrega distribuida garantizada; PostgreSQL es la autoridad.
No commit/push/merge/despliegue/Supabase/Flutter/PR-I2 ni cambios de otros juegos.

## Historial — novena ronda y revisiones, confirmadas en 3d0e625

2026-10-03, rama feat/pr-i1-competitive-infrastructure, HEAD a4d010b.
Ocho checkpoints confirmados; esta implementación sigue SIN COMMIT y requiere
revisión humana. Se preservan los seis archivos locales de la auditoría anterior.
No hay admisión, flag ni verificador TUG_MATCH: XP competitivo Tira permanece
inhabilitado. Las secciones posteriores son historial, no el estado del runtime.

### Decisión definitiva y ajuste focalizado de GRACE (2026-10-03)

El propietario resolvió expresamente el resultado: la primera gracia vencida
por desconexión confirmada produce abandono de ese participante y victoria
deportiva del rival, aunque esté UNKNOWN, sin OPEN o con una gracia posterior.
No depende del número de acciones del rival. UNKNOWN no prueba su abandono ni
borra sus respuestas. Si ambas gracias confirmadas coinciden exactamente,
CANCELADA, ningún ganador y abandono individual de ambos. PostgreSQL conserva
la comparación y fecha terminal en microsegundos, sin desempatar por UUID.

`cerrarAusencia()` deja de consultar OPEN como requisito de ganador GRACE.
La selección autoritativa anterior excluye primero meta/agotamiento anterior
a la primera gracia y plazo global anterior o igual; toma solo los participantes
con la gracia mínima exacta. Se conservan causa GRACE y evidencia append-only.
EXPLICIT mantiene su comprobación de presencia y resultado vigente; esta
decisión no extiende la nueva regla a ese contrato ni a partidas legacy.

Una victoria deportiva no constituye admisión ni liquidación competitiva.
Sin acciones aceptadas del beneficiario, su futura recompensa por abandono
será exactamente 0 XP; con acciones se conserva la evidencia sin calcularla.
No hay verificador/admisión TUG_MATCH ni eventos XP. Snapshot, Qpartida, R,
protección de COMMIT tardío, privacidad, alias, retries, locks y temporizadores
se mantienen. Reconexión tardía no reabre terminales.

Las pruebas PostgreSQL amplían las aserciones: rival OPEN y UNKNOWN sin acciones,
UNKNOWN con respuesta aceptada y retry exacto tras cierre, primera gracia de
cualquiera de los participantes con rival en gracia posterior (1 s o 1 µs),
empate exacto, causa/fecha conservada y un solo cierre entre instancias/reinicio.
EXPLICIT se verifica separadamente con rival OPEN/UNKNOWN. Se conservan las
pruebas de vencimiento normal, meta/agotamiento, privacidad, lease/UNKNOWN,
legacy y ausencia de XP. Todas pasaron sobre PostgreSQL real desechable.

Validación final del ajuste: build exit 0; competitivo 178/178 (10 suites,
12,156 s); Jest completo 1059/1059 (99 suites, 58,435 s); audit omit=dev cero
vulnerabilidades con TLS activo; git diff --check exit 0. PostgreSQL: 160/160 en 9 archivos, 212111 ms
del bloque de pruebas; 224284 ms del runner completo con preparación/limpieza,
exit 0. Cero fallos, cancelados, omitidos, TODO, archivos fallidos/incompletos/
inválidos. Una ejecución completa, sin intentos fallidos en este ajuste.

| Archivo PostgreSQL (en test/) | Aprobados / total | Duración del proceso (ms) |
|---|---:|---:|
| competitive-postgres.test.cjs | 25/25 | 6824 |
| competitive-solo-postgres.test.cjs | 38/38 | 11062 |
| competitive-trivia-boundary-postgres.test.cjs | 1/1 | 2580 |
| competitive-trivia-evidence-postgres.test.cjs | 15/15 | 23450 |
| competitive-trivia-presence-postgres.test.cjs | 26/26 | 19410 |
| competitive-trivia-xp-postgres.test.cjs | 17/17 | 34230 |
| competitive-tug-boundary-postgres.test.cjs | 8/8 | 4067 |
| competitive-tug-evidence-postgres.test.cjs | 15/15 | 77915 |
| competitive-tug-presence-postgres.test.cjs | 15/15 | 32572 |

El runner/gate conserva el rechazo de procesos con error/timeout (aunque tengan
resumen), campos faltantes, cancelados, omitidos, TODO y total distinto de pass.
No se cambia el límite de 120 s por archivo, la lista ni el orden secuencial.
Los logs anteriores se conservan. Logs nuevos en TEMP del propietario con
prefijo saberplus-ninth-approved-grace-: build.log, competitive.log, jest.log,
postgres.log, audit.log y diff.log. El contenedor de prueba propio se eliminó
tras verificar ownership; postgres-local conserva su ID y StartedAt originales.

Archivos ajustados en esta entrega: TiraAflojaService, prueba PostgreSQL de
presencia y cuatro documentos backend (README, índice, infraestructura y este
informe). Ningún archivo nuevo en este ajuste; se preservan todas las entradas
locales anteriores (13 modificadas y 7 nuevas en el árbol completo).

Continúan pendientes WAL/visibilidad física, rol/RLS productivo, causa de los
34 fallos históricos, intermitencia Rescate y protocolo de liquidación futura
de dos usuarios. No se crean ni modifican migraciones en este ajuste; la
migración local de presencia anterior sigue sin commit ni aplicación remota.

### Historial: revisión humana inicial del noveno checkpoint (2026-10-03)

Se conserva íntegra la implementación local; ningún cambio está confirmado.
El caso A con abandono confirmado / B UNKNOWN con respuestas aceptadas tenía
una decisión de resultado deportivo pendiente. `cerrarAusencia()` entonces
producía CANCELADA porque exigía OPEN vigente de B. Esto describía el código, **no
una decisión de producto aprobada para ese escenario**. A se registra abandonado;
UNKNOWN de B no registra su abandono ni borra respuestas aceptadas. Se preguntó
si debía conservar CANCELADA o finalizar con B ganador deportivo, separando la
verificación futura de recompensa. La decisión y el ajuste definitivos están arriba.
La cancelación por dos gracias confirmadas exactamente simultáneas sí está
aprobada y conserva dos abandonos individuales, sin ganador ni XP positivo.

El runner tenía un defecto comprobable: solo exigía la clave tests y el exit
del proceso. Ahora [el gate de resumen](../tool/competitive_postgres_summary.cjs)
exige exactamente una entrada numérica válida de tests, suites, pass, fail,
cancelled, skipped, todo y duration_ms; rechaza errores de archivo, campos
ausentes/duplicados/malformados, cero cobertura, pruebas no aprobadas y total
distinto de pass. Conserva resultados por archivo y agregado, ejecución
secuencial, diagnóstico y límite de 120000 ms por archivo. Las
[regresiones](../src/competitive/competitive.postgres-runner.spec.ts) incluyen
un proceso Node real con exit 0 que contiene skip y TODO y debe rechazarse.

Autenticación: AuthModule emite HS256 con expiresIn=8h y AuthService firma
el payload sin reemplazar ese contrato. JwtGuard y el autenticador websocket
verifican la firma; no exigen exp. jsonwebtoken verifica expiración solo cuando
exp existe. Un JWT firmado válido sin exp sigue siendo compatible: authUntil
NULL expresa ausencia de límite absoluto, **no** presencia indefinida. El lease
OPEN continúa limitado a 45 s y debe renovarse con observación autenticada;
caduca a UNKNOWN, sin fabricar abandono. Con exp, el lease queda acotado por él.
Pruebas con JWT real cubren ausencia, propagación de exp y token expirado; el
socket PostgreSQL confirma authUntil NULL y lease exacto de 45 s sin exponerlos.

Locks auditados: respuesta nueva toma clave idempotente, usuarios ordenados,
advisory de partida y fila de partida; ningún escritor de presencia/cierre
adquiere después esa clave. SQL connect/observe/refresh toma el mismo par de
usuarios, advisory y fila antes de modificar presencia/conexiones. Ambas
conexiones e instancias compiten por ese mismo orden, no por locks inversos de
conexiones. Los retries recuperan primero la evidencia aceptada. El gateway
espera su renovación en curso antes de cerrar el socket y no mantiene una
transacción abierta durante autenticación. No se detectó inversión en esos
caminos actuales; las carreras PostgreSQL existentes se conservan. Esto no
certifica transacciones arbitrarias del owner que primero bloqueen una partida
y luego llamen presencia: los escritores privados deben respetar el protocolo.
La liquidación futura de dos usuarios sigue pendiente y no se habilita TUG_MATCH.

Validación final de esta revisión: build exit 0; Jest competitivo 178/178,
10 suites, 12,686 s; Jest completo 1059/1059, 99 suites, 43,307 s. PostgreSQL
157/157, 9 archivos, 201453 ms del bloque, exit 0: cero fallos, cancelados,
omitidos, TODO, archivos fallidos, incompletos o inválidos. Audit omit=dev:
cero vulnerabilidades con TLS activo; diff --check exit 0. 54 enlaces locales
comprobados, ninguno inexistente. Docker desktop-linux/Engine 29.7.2 disponible;
postgres-local conserva ID 20d971cc043f y StartedAt 2026-10-02T21:24:22.476116454Z.
Contenedor de prueba propio eliminado verificando ownership. Ningún intento
falló en esta revisión; los fallos históricos se conservan debajo sin ocultarlos.
Logs TEMP: saberplus-ninth-review-build.log, -competitive.log, -jest.log,
-postgres.log, -audit.log y -diff.log, todos con ese mismo prefijo.

Cambios de esta revisión: gate de resumen CJS y prueba Jest nuevos; runner,
pruebas unitarias/PG de presencia y documentación de estado actualizados.
`cerrarAusencia()` no se cambió en esa revisión inicial sin decisión. No se
modifican migraciones en esta revisión. El árbol completo conserva 13 archivos
modificados y 7 entradas nuevas, incluyendo todo el trabajo anterior.

### Diagnóstico reproducible del corte PostgreSQL

El reporter conserva la salida spec completa y agrega test:dequeue/pass/fail,
archivo, instante y duración. Con el límite original de 180000 ms se reprodujo
SIGTERM/killed=true: 144 pruebas aprobadas, cero aserciones fallidas, última
prueba iniciada a los 171,281 s y todavía incompleta al cortar. Era
«service detects Prisma silent deferred-COMMIT rollback instead of reporting
enablement». Sus operaciones esperan el vencimiento PostgreSQL real de 10 s
más countdown, igual que los escenarios de COMMIT tardío/bloqueo. Las ejecuciones
anteriores no tenían marcas de inicio: solo puede identificarse su última
prueba terminada y la siguiente candidata, no afirmar dónde estaba su cuerpo.

Corrección limitada del runner: presupuesto total 240 s, calculado a partir de
180 s más hasta tres pruebas restantes de ~13 s (219 s), redondeado a 240 s.
No se modifican relojes del juego, esperas SQL, aserciones, concurrencia ni
cobertura. Primera ejecución completa de la base: 145/145, 218031,7168 ms,
exit 0.
La ejecución posterior con migración nueva también alcanzó SIGTERM a 240 s,
antes de la familia de presencia, y mostró una aserción obsoleta de permisos
que contaba solo seis funciones Tira. Se reemplazó por la lista explícita de
las 16 funciones privadas, manteniendo denegación de EXECUTE en ambos roles.
El presupuesto global se sustituyó por el límite existente de 120 s POR ARCHIVO,
secuencialmente, con la misma lista completa de familias/aislamiento Node.
Una familia fallida no omite las siguientes; el resumen agregado registra
fallos e incompletos y exit 1 en cualquiera de ellos. No se subieron límites
individuales, ni se omiten/filtran casos. Se conservan timestamps/errores/trazas.

Primera ejecución completa con presencia: 156 casos, 153 aprobados, 3 fallidos,
cero cancelados/omitidos/incompletos, 232814 ms del bloque completo, exit 1.
Los tres fallos correspondieron a pruebas nuevas: segunda clave de una ronda
ya respondida devuelve el rechazo de duplicado antes del gate de presencia;
JS Date truncaba el lease en microsegundos, dejando el clock test justo ANTES
del límite; conteo global de ledger incluía tres eventos sintéticos de los
verificadores de prueba comunes. Correcciones: HTTP de B aún sin respuesta
exige 409 por ausencia, mientras A exige 400 de duplicado y su retry exacto
recupera la aceptación; límite lease nativo PostgreSQL sin truncar; cero eventos
para TODOS los sourceId propios, saldo general de TODOS los usuarios propios
intacto y conteo global sin aumento respecto del inicio de la familia. No se
sustituyen resultados por verde ni se atribuye a regresión del ledger.
 Las muestras de pg_stat_activity no mostraron esperas de lock en los
instantes consultados; no prueban ausencia de cualquier espera entre muestras.
No hay una regresión de presencia que explicar en esa base: su runtime y
migraciones eran exactamente los de HEAD, sin cambios de presencia todavía.
La variación de duración total respecto de la ejecución previa de ~169 s no
está atribuida a una causa única. El timeout demostrado se distingue de esa
variación y de las incidencias históricas.

### Implementación y contratos

Nueva [migración incremental de presencia](../prisma/migrations/20261003160000_tug_presence/migration.sql),
dependiente de 20261003010000_tug_authoritative_evidence, confirmada e inalterada.
Prisma debe tener aplicado este esquema ANTES de arrancar el backend. El runner
usa únicamente PostgreSQL propio, loopback, tmpfs y credenciales privadas; el
contenedor postgres-local ajeno se mantiene intacto. No hay aplicación remota.

- presenciaVersion=1 se inscribe exclusivamente al crear partidas nuevas desde
  el servidor. Inscripción inmutable; NULL histórico conserva su contrato.
- Conexiones privadas por UUID servidor, usuario, partida e instancia; estados
  OPEN/CLOSED/UNKNOWN/RETIRED; eventos append-only y abandono por participante.
- Lease técnico 45 s corresponde a pingInterval=25 s y pingTimeout=20 s ya
  compartidos por Socket.IO. NO es gracia. Solo autenticación vigente más
  conexión inicial, pong observado o latido/acción autenticados renuevan;
  nunca un indicador del cliente o socket.connected aislado. Lease limitado
  también por el vencimiento del JWT cuando contiene exp.
- Cierre observado client namespace disconnect/transport close es confirmado.
  Ping timeout, error, parada de instancia, observador perdido o lease vencido
  producen UNKNOWN, no abandono. Un fallo de persistencia se registra sin
  retrofechar desconexiones; el lease posterior acaba UNKNOWN.
- Última conexión cerrada de un participante ACTIVO y sin otras OPEN/UNKNOWN
  inicia gracia de 30 s. Una CLOSED/RETIRED antigua no puede renovarse ni
  cancelar la conexión nueva. UNKNOWN se retira en reconexión autenticada.
- Gracia no pausa/amplía rondas o plazo global. OPEN nuevo se rechaza si hay un
  terminal o plazo terminal pendiente; no reabre ni revierte resultados.
- Respuestas nuevas: clave idempotente → usuarios ordenados → advisory de partida
  → fila de partida. Se recupera primero la respuesta aceptada exacta; después
  se exige OPEN vigente en PostgreSQL, y el trigger lo vuelve a comprobar antes
  de insertar. Ningún lease vencido autoriza acciones.
- El reconciliador consulta evidencia compartida, no sockets locales. Recupera
  plazos pendientes entre instancias y compara candidatos en PostgreSQL con
  microsegundos. Primero resuelve rondas anteriores ya vencidas, sin inventar R;
  meta/agotamiento anteriores a gracia cierran normal, plazo global anterior o
  igual prevalece, luego gracia vencida. Fecha terminal efectiva preservada.
- Abandono confirmado de A no requiere OPEN de B. B UNKNOWN no equivale a
  abandono ni borra participación previa. La primera gracia confirmada vencida
  asigna victoria deportiva al rival sin exigir OPEN; no concede XP. Abandonos
  exactamente simultáneos: CANCELADA, dos registros individuales, ningún XP.
  Las diferencias de un microsegundo no se colapsan a empate por JS Date.
- Publisher sigue local; otros procesos recuperan estado por HTTP/sincronizar
  y PostgreSQL. No se promete entrega distribuida de notificaciones RxJS ni
  se inventa un adaptador Redis. La autoridad de cierres no depende del aviso.

Snapshot, Qpartida, R atómico, rechazo de COMMIT tardío, comprobación poscommit,
privacidad/alias, calificación original e idempotencia del checkpoint 8 quedan
preservados. La distinción de victoria normal/abandono permanece en eventos y
TugAbandonment; no se reutiliza ni implementa una recompensa normal para ese cierre.
No cambia Usuario.xpTotal, balances, ledger, fórmulas ni otros juegos.

### Verificaciones de esta ronda

Build final exit 0; competitivo 162/162, 9 suites, 29,344 s. Primera suite Jest
completa: 1042 aprobadas/1 fallo, 98 suites, 105,413 s; mock legacy del gateway
sin enrolled causaba cierre del socket y espera del evento. Se completó ese
mock con enrolled=false, sin cambiar timeout ni aserciones. Prueba aislada 2/2
(19,093 s); repetición completa 1043/1043, 98 suites, 85,262 s, exit 0.
Auditoría omit=dev: cero vulnerabilidades, TLS activo y CA del sistema;
NODE_OPTIONS restaurado. PostgreSQL final: 156/156, 9 archivos, 251139 ms del bloque completo, exit 0;
cero fallos/cancelados/omitidos/incompletos. Esquema: 56 migraciones confirmadas
más la nueva de presencia, 70 tablas antes/71 después por CompetitiveTestSource,
31 triggers, PostgreSQL 16.15, timezone Etc/UTC. Todos los archivos anteriores
se ejecutaron y pasaron; no se filtró cobertura para conseguir ese resultado.
El contenedor propio fue eliminado verificando etiqueta y nonce; postgres-local
mantiene ID y StartedAt originales. La incertidumbre histórica de los 34 fallos
y Rescate sigue abierta, sin atribuirles una causa por estas pasadas verdes.

Logs completos locales (TEMP del propietario): saberplus-ninth-pg-diagnostic.log,
saberplus-ninth-pg-complete1.log, saberplus-ninth-pg-implementation1/2/3.log,
saberplus-ninth-final-build.log, saberplus-ninth-final-competitive.log,
saberplus-ninth-final-jest.log, saberplus-ninth-gateway-regression.log,
saberplus-ninth-final-jest2.log, saberplus-ninth-final-postgres.log y
saberplus-ninth-final-audit.log. Conservan cortes/fallos y su validación posterior,
no se sobrescriben como si los intentos anteriores hubieran aprobado. Primera
aplicación de la migración local: error sintáctico de delimitador SQL en la nueva
función de reloj, antes de pruebas (exit 1); corregido solo en la migración nueva.
Las pruebas controlan el reloj exclusivamente dentro de PostgreSQL desechable;
ninguna ruta HTTP/socket admite un timestamp de presencia remitido por cliente.

Para la futura liquidación TUG también debe resolverse el protocolo de locks de
DOS participantes: CompetitiveService hoy bloquea un usuario por liquidación;
no basta añadir un verificador que luego intente adquirir el par empezando por
el otro usuario. La admisión/verificador TUG siguen ausentes: esta ronda serializa
sus escritores con el par ordenado antes de la partida y no ejecuta ese flujo
futuro ni certifica que el contrato monousuario ya resuelva ese problema.

Siguen abiertas durabilidad física WAL/instante real de visibilidad de R,
verificación de rol/RLS productivo, incertidumbre histórica de los 34 fallos e
intermitencia de vencimiento Rescate. Una pasada exitosa no demuestra su causa.
Tira sigue sin XP; Memoria/Batallas y PR-I2 no se implementan. PR-I1 no fusionado
a main. Sin commit, push, merge, despliegue ni migraciones remotas.

### Inventario y cierre para revisión humana

13 archivos modificados: README raíz; backend/README.md; índices/docs PR-I1
(README.md, PR_I1_COMPETITIVE_INFRASTRUCTURE.md, este informe); Prisma schema;
TiraAfloja service/gateway/module/ws-auth y prueba gateway; prueba PostgreSQL
Tug evidence y runner. Cinco creados: migración 20261003160000_tug_presence;
TiraAflojaPresenceService; competitive.tug-presence.spec.ts;
competitive-tug-presence-postgres.test.cjs; competitive_postgres_reporter.cjs.
Los seis archivos iniciales de auditoría conservan sus cambios; no se descartan.
En la prueba antigua de evidencia se eliminó únicamente ruido de formato y se
comprobó igualdad exacta de AST con la versión probada; se mantienen sus cambios
reales de proveedor y lista exhaustiva de funciones privadas.

Diff check exit 0. 51 referencias Markdown locales comprobadas en los cinco
README/índices/informes modificados: cero destinos faltantes. Rama y HEAD
siguen feat/pr-i1-competitive-infrastructure / a4d010b. No hay cambios de
migraciones confirmadas ni del repositorio Flutter. Docker Engine 29.7.2,
desktop-linux; postgres-local conserva ID
20d971cc043fe04cf2fd14be83c906d2210f298381e58ac480a478ea305b7927 y StartedAt
2026-10-02T21:24:22.476116454Z, funcionando. Sin contenedores de prueba remanentes.
No commit, push, merge, despliegue, migraciones remotas, activación XP ni PR-I2.

## Historial — auditoría previa de presencia, antes de la implementación


## Estado vigente — auditoría previa de presencia (noveno checkpoint)

2026-10-03, rama feat/pr-i1-competitive-infrastructure, HEAD a4d010b.
Se verificaron los ocho checkpoints en el historial local y árbol limpio al
comenzar; su publicación en GitHub fue informada por el propietario.
La ronda 9 está en auditoría; **no se implementó todavía presencia/gracia Tira**.
No hay migración nueva, admisión XP ni verificador TUG_MATCH. Los apartados
inferiores se conservan como historial del checkpoint 8 confirmado.

### Evidencia y arquitectura propuesta, sin implementación

El gateway autentica JWT, estudiante, correo y cambio de contraseña inicial.
La pertenencia se comprueba por el servicio antes de unir la sala. Sin embargo,
handleDisconnect consulta salas locales, y RxJS publica solo en la instancia:
ninguno demuestra ausencia global ni una desconexión durable. No hay adaptador
distribuido en main.ts. La recuperación Socket.IO de 120 s no es gracia de juego.

Trivia/Duelo persisten OPEN/CLOSED/UNKNOWN/RETIRED, identidad de instancia,
leases y eventos append-only. Su observador caído produce UNKNOWN. Es reutilizable
la técnica de leases, identidad, eventos privados y autenticación, pero no su
resolución: Tira requiere evidencia del rival, dos participantes y precedencia
por meta/agotamiento/plazo global, además de gracia 30 s en lugar de 20 s.
No se modifica Trivia/Duelo para esta ronda.

Diseño técnico propuesto: conexiones identificadas por servidor y vinculadas
inmutablemente a usuario/partida/instancia; registro PostgreSQL UTC; renovación
basada en observaciones autenticadas del canal; leases vencidos o pérdida del
observador como UNKNOWN; eventos privados inmutables; serialización común con
respuestas y cierres. Una nueva inscripción de presencia debe distinguirse de
partidas históricas del checkpoint 8, sin convertirlas ni modificar su runtime.
La futura migración debe ser incremental: la de evidencia Tira ya está confirmada.

CONNECTED exige conexión autenticada vigente. CONFIRMED_DISCONNECTED requiere
observación atribuible del cierre de todas las conexiones válidas, sin otras
conexiones inciertas. UNKNOWN incluye observador perdido, token/renovación no
verificable y lease vencido; no implica abandono. socket.connected, fetchSockets
local o ausencia de HTTP no son por sí solos prueba global. Un timeout/caída del
proceso no debe clasificarse como abandono del estudiante. La publicación entre
instancias requerirá recuperación desde PostgreSQL; el publisher local por sí
solo no resuelve esa garantía. Estas son exigencias del diseño, no código hecho.

Las operaciones nuevas necesitarán comprobar presencia transaccionalmente,
después de recuperar reintentos exactos, y nuevamente tras esperas por locks.
El orden debe coordinar clave idempotente y participantes ordenados antes de
partida, sin invertir Usuario → origen de CompetitiveService. No se añade un
lock aislado ni se reutiliza el resolver de Trivia con resultados ficticios.

El resolver actual comprueba primero vencimiento global y después la ronda;
no es aún un árbitro de candidatos normal/gracia. La integración tendrá que
comparar sus instantes autoritativos y orden de aceptación, no solo el momento
de detección del worker: resultado normal anterior cierra sin esperar gracia;
plazo global anterior o igual al final de gracia prevalece; abandono requiere
que gracia venza primero y exista evidencia individual de desconexión. La
presencia suficiente del rival se evalúa por separado para su resultado.
Una reconexión nunca ampliará rondas/plazo global ni reabrirá un terminal.
R, snapshot, Qpartida, guard de COMMIT tardío, comprobación posterior Prisma,
calificación original, privacidad y contratos legacy del checkpoint 8 se conservan.

### Decisiones de producto aprobadas para presencia durable V1

El propietario resolvió las precisiones anteriores el 2026-10-03:

- Desconexión confirmada de A y gracia de 30 s vencida sin reconexión válida:
  registrar abandono de A si no existe cierre normal prioritario. No se exige
  OPEN de B para reconocer ese abandono; UNKNOWN de B no demuestra abandono.
  El resultado de B depende exclusivamente de las reglas V1 y evidencia real;
  reconocer abandono de A no inventa presencia, participación ni premio de B.
- Toda respuesta nueva requiere OPEN autenticado, vigente y persistido.
  UNKNOWN o falta de OPEN bloquean acciones nuevas, pero nunca prueban abandono.
  Los reintentos exactos previamente aceptados se recuperan antes de ese bloqueo.
  Los intentos históricos conservan su contrato.
- Meta/preguntas agotadas antes de gracia tienen prioridad; luego plazo global
  anterior o igual al vencimiento de gracia; finalmente abandono si vence primero
  la gracia. Reconectar no amplía ningún reloj ni reabre un terminal.
- Si ambas desconexiones están confirmadas y las gracias vencen exactamente a la
  vez, sin cierre normal/global prioritario: CANCELADA, sin ganador ni XP positivo,
  con abandono individual de ambos. Decisión explícita del propietario; no se
  escoge un ganador por orden de consulta.

Estas decisiones autorizan el diseño e implementación posterior al diagnóstico
PostgreSQL. No significan presencia implementada ni admisión/liquidación TUG_MATCH.

### Validación de la base publicada

Build exit 0; Jest competitivo 159/159 (8 suites, 26,563 s); Jest completo
1040/1040 (97 suites, 104,169 s); auditoría omit=dev cero vulnerabilidades con
TLS y CA del sistema, NODE_OPTIONS restaurado.

Primera ejecución PostgreSQL: exit 1 sin resumen final, interrumpida alrededor
de los 180 s del presupuesto del proceso. No aparece ninguna aserción fallida;
las últimas pruebas terminadas incluyen habilitación oportuna de Tira, faltan
los cuatro escenarios finales. Diagnósticos DB antes/después: timezone Etc/UTC,
56 migraciones confirmadas y sin fuentes recientes anteriores a cobertura
institucional. La coincidencia con el timeout es evidencia de posible corte por
presupuesto, no prueba de una regresión de presencia aún inexistente. El wrapper
anterior no conservaba killed/signal/code; se añadieron solo esos metadatos al
runner, sin cambiar timeout, pruebas, aserciones ni runtime. Segunda ejecución
independiente secuencial, sin otros tests paralelos, también terminó exit 1:
metadatos del hijo node.exe signal=SIGTERM, killed=true, timeoutMs=180000.
Quedó demostrado el corte por presupuesto del runner; faltó el resumen completo
tras llegar a la prueba de worker tardío de Tira. No se certifica PostgreSQL
aprobado, ni se atribuye a una aserción de presencia/historial. No se amplió
ningún timeout ni ventana, ni se omitieron o relajaron pruebas. La razón del
mayor tiempo total respecto de ejecuciones anteriores no está demostrada.
El límite del runner y la validación completa quedan pendientes para la próxima
continuación, además de las dos precisiones de producto.

Estas pruebas verifican a4d010b y el checkpoint 8; no certifican
funcionalidades de presencia Tira inexistentes. Docker desktop-linux / Engine
29.7.2 está disponible; el runner aplica 56 migraciones confirmadas en su propio
PostgreSQL desechable. postgres-local ajeno no se modifica.
Diff check exit 0 y 49 destinos Markdown locales verificados sin faltantes.
Modificados únicamente cinco documentos/índices backend y el diagnóstico de
terminación del runner; no hay cambios en motores, Prisma ni migraciones. Persisten la garantía
pendiente de durabilidad física WAL, los 34 fallos históricos, la incidencia
intermitente de Rescate y la verificación de rol/RLS productivo. No hay migraciones
remotas, Flutter, otros juegos, PR-I2, commit, push, merge ni despliegue.

## Historial — estado del octavo checkpoint

## Primera etapa de evidencia autoritativa

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
