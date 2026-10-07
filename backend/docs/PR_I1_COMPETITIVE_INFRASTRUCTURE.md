# PR-I1 V1: infraestructura competitiva común

## Alcance vigente para revisión de integración

PR-I1, con 22 checkpoints funcionales, fue integrado a main por PR #5 (`5216383`);
incluye infraestructura e integración competitiva local de Cima, Guardián,
Rescate, Trivia Rush, Duelo fantasma y Tira y afloja. Memoria y Batallas todavía
**no están integradas competitivamente**.

Integración de código no equivale a activación productiva. Los flags
`COMPETITIVE_SOLO_ENABLED`, `COMPETITIVE_TRIVIA_ENABLED`,
`COMPETITIVE_GHOST_ENABLED` y `COMPETITIVE_TUG_ENABLED` permanecen desactivados
por defecto. Integrar a `main` y desplegar son decisiones separadas; despliegue
y activación siguen sujetos a los requisitos B1/B2 descritos en este documento.
El [relevo técnico](PR_I1_RELEVO.md#alcance-vigente-para-revisión-de-integración)
resume el estado vigente; los apartados siguientes conservan su historial.

PR-I2 tiene [contrato, lector y API](PR_I2_RANKINGS.md) integrados, e I2-4 Flutter.
I2-5 abierto. Ver [conciliación vigente](CONCILIACION_2026_10_07.md) e IC-1/2/3
para clientes y juegos pendientes. El ranking general se conserva.

> **Base funcional histórica: 97ebfc4, 18 checkpoints publicados entonces.** La integración
> y corrección P1 de CP18 ya están confirmadas; validación local final PostgreSQL
> 304/304, sin autorización para producción. [Entrada de relevo](PR_I1_RELEVO.md).
> Las etiquetas «CP18 local/SIN COMMIT» y HEAD af2374e inferiores conservan el
> contexto anterior a su publicación; no describen el estado Git vigente.


## Checkpoint 22 — NestJS Linux, señales y límites operativos

Base comprobada `f2b4a6b`, origin local coincidente, main `fb27225`;
21 checkpoints publicados según propietario y árbol inicialmente limpio.
CP22 incorpora ensayos locales reproducibles; no cambia runtime, dependencias,
migraciones, flags de despliegue, fórmulas ni contratos de liquidación.

### Backend real y señales POSIX

[Pruebas Linux](../test/competitive-linux-postgres.test.cjs),
[supervisor/observador](../test/helpers/competitive-linux-nest.cjs) y
[preparación Linux](../tool/competitive_linux_runtime.mjs) arrancan el `dist/main`
real con AppModule completo, no una aplicación mínima ni proveedores sustituidos.
El bootstrap existente llama enableShutdownHooks; se observan y delegan los hooks
reales de PrismaService, CompetitiveReconciler, TriviaCompetitiveReconciler,
TugCompetitiveReconciler, TriviaPresenceService, TiraAflojaService y ambos gateways.
La instrumentación de tx agrega observación y un gate pre-COMMIT, sin modificar
resultados deportivos, evidencia, verificador o XP. Los fixtures Cima se producen
mediante el servicio deportivo real; los hijos recuperan con flags apagados.

Entorno: Node 24.14.1 Debian bookworm Linux, Prisma nativo generado desde el
schema vigente y package-lock existente, PostgreSQL 16.15 OWNED. El contexto de
imagen copia solo package/lock, schema, dist y helper, nunca .env, uploads o
node_modules Windows. La red interna Docker contiene exclusivamente procesos
propios y el PostgreSQL etiquetado del runner; no hay puertos HTTP publicados ni
acceso a servicios remotos. uploads usa tmpfs propio: no monta archivos del usuario.

| Caso | Evidencia/asserts | Estado y límite |
|---|---|---|
| SIGTERM normal | /health/ready real 200; hooks completos de ocho proveedores; principal y testigo con PID distintos; clientes vuelven al baseline | VALIDADO EN LINUX DESECHABLE; no prueba señal a PID 1 |
| SIGTERM en contención | Lock PostgreSQL observable; señal; comienzo de hook; liberar blocker propio; cierre de hooks/pools; otro arranque recupera una vez | VALIDADO EN LINUX DESECHABLE; no garantiza cancelación mientras un blocker permanente siga reteniendo lock |
| SIGKILL pre-COMMIT | Evento solo dentro de tx original; afuera cero ledger/balance; señal sin hooks; cero sesiones adicionales; otro arranque liquida 100 una sola vez | VALIDADO EN LINUX DESECHABLE, liquidación individual Cima |
| Segundo reinicio | Ledger=1, XP=100, versión=1 y Usuario.xpTotal=101 tras dos recuperaciones | VALIDADO EN LINUX DESECHABLE; caos de procesos del par Tira no añadido |
| COMMIT sin acuse | Recuperación idempotente CP21 Windows | VALIDADO LOCALMENTE; no nuevo caso POSIX de este punto |

Los comandos exactos de señales se registran en `posix-signal`, por ejemplo:
`docker exec sp-linux-420497ffdcaafab3-17d92c19-5976-45c9-89cc-572f1bc6ee53 kill -TERM 14`
y `docker exec sp-linux-420497ffdcaafab3-850d2b5b-622f-4309-b6fd-e731b647c1fb kill -KILL 14`.
Node PID 14/15 es hijo del supervisor PID 1. El hijo sale con signal SIGTERM o
SIGKILL y code null; supervisor/contenedor sale 0, sin confundir ambos resultados.
SIGKILL NO ejecuta hooks. Primer bloque corregido: 3/3, 48306.8255 ms; intervalos
señal-observación de salida 1902..2508 ms, incluyendo CLI/poll/inspección Docker;
no son SLA ni tiempos puros de shutdown del proveedor. Verificar forwarding de
señales del entrypoint/productor real permanece pendiente.

### Límites reales de ensayo y recuperación

[Ensayos PostgreSQL/red](../test/competitive-timeouts-postgres.test.cjs) preservan
los valores por defecto del backend. SET LOCAL configura solo la transacción de
prueba; tras rollback se comprueba que statement_timeout/lock_timeout vuelven a 0.

| Límite configurado solo para prueba | Observación corregida | Assert de recuperación |
|---|---|---|
| statement_timeout=150 ms | SQLSTATE 57014; 318 ms observados incluyendo overhead | Nueva consulta funciona; setting restaurado |
| lock_timeout=150 ms | SQLSTATE 55P03; 179 ms; bloqueo real retenido por otra conexión | Waiter deja de esperar; liberar blocker permite nuevo FOR UPDATE |
| connect_timeout=1 s | TCP realmente aceptado y handshake sin respuesta: fallo en 1011 ms | Mismo PrismaClient conecta tras restaurar forwarding; no crea XP; sockets cierran |
| pool_timeout=1 s, pools 2+1 | CP21 conserva contención P2024 y recuperación de ambos pools | VALIDADO LOCALMENTE, sin convertirlo en capacidad productiva |
| Corte TCP/readiness | CP21 sigue dentro del runner completo: TTL éxito 5 s, fallo 1 s, live independiente | Recuperación segura; no detectar inmediatamente mientras cache positivo sea válido |

El blackhole cubre establecimiento/handshake, no silencio indefinido de una
consulta ya autenticada. Valores reales de URL/proveedor, límites servidor,
reserva de conexiones y política de timeouts siguen pendientes; no recomendar
150 ms/1 s como configuración productiva. La imagen se prepara con plazo propio
600 s para instalación/generación nativa, fuera de los límites de 120 s por archivo;
no se amplían transacciones ni deadlines del runner de tests. Preparación requiere
registro de paquetes/imágenes disponible. Un fallo bloquea validación, no omite Linux.

### Fallos intermedios y validación

Primera ejecución Linux: 0/3. Reproducción aislada: importar logo-upload.config
con filesystem read-only sin uploads falla ENOENT al mkdir /app/uploads/logos.
Se agrega tmpfs propio, sin corregir runtime por un defecto del contenedor de prueba.
Segunda ejecución: 0/3 por marca ready ausente. El servidor real sí arrancó;
Nest 11.1.26 createExceptionProxy usa el mismo trap para get/set y la asignación
app.listen del observador no se aplica. Se sustituye por evento listening del
servidor real. Se conservan asserts/plazos y se agrega diagnóstico bootstrap-error
más detección inmediata de salida del hijo. Tercera ejecución: Linux 3/3 y timeouts
3/3. No se demostró un defecto de runtime que requiera cambio productivo.
Un diagnóstico adicional propio arrancó temporalmente el backend sobre la primera
base mientras continuaban pruebas posteriores; se retiró y esa ejecución se conserva
solo como diagnóstico. La tercera ejecución usa base independiente, sin ese proceso.
Validaciones completas: Jest competitivo 280/280, 19 suites, 17.422 s, exit 0;
Jest completo 1164/1164, 108 suites, 80.632 s, exit 0; audit --omit=dev cero
vulnerabilidades, exit 0, usando CA sistema sin desactivar TLS.

| Ejecución PostgreSQL completa | Resultado | Tiempo de archivos / total runner | Causa |
|---|---|---|---|
| Primera, 24 archivos | 332/335, fail 3, exit 1 | 869357 / 984942 ms | Contenedor sin uploads escribible; además diagnóstico temporal sobre esta base, no certifica aislamiento de toda esta ejecución |
| Segunda, 24 archivos | 332/335, fail 3, exit 1 | 961564 / 1001650 ms | Observador app.listen no aplicado; fallaron exclusivamente tres casos Linux |
| Tercera, 24 archivos | 335/335, exit 0 | 927323 / 982317 ms | Linux 3/3 y timeouts 3/3; 329 casos anteriores conservados |

Ninguna ejecución tuvo tests cancelados, omitidos o TODO ni archivos incompletos;
las dos primeras se rechazan por sus tests fallidos. Tercera: ningún archivo
inválido; respaldos/restauraciones OWNED de schema y datos poblados PASS con
comparación de digests, RLS, constraints, índices, funciones, secuencias y ACL.
Sintaxis de cinco archivos JS y cinco enlaces Markdown nuevos: correctos;
git diff --check exit 0. Build inicial exit 0 (15912 ms); build final exit 0 (45922 ms).
El contenedor postgres-local ajeno conserva ID e instante de inicio; ningún
staging, commit, push, merge, despliegue ni acceso a base remota.

La limpieza verifica etiquetas antes de retirar contenedores, redes internas,
imagen derivada y directorio propio; también cubre terminación del proceso de test
por el runner. No hay prune general ni eliminación de imágenes/recursos ajenos.
El cache compartido de build/descarga Docker no se limpia destructivamente.

### Matriz final de bloqueantes B1/B2

| Requisito | Clasificación | Gate restante |
|---|---|---|
| Rollback, idempotencia, recuperación, presupuesto CP19–21 | VALIDADO LOCALMENTE | No certifica capacidad/operación del proveedor |
| Hooks Nest, señales directas a Node y recuperación CP22 | VALIDADO EN LINUX DESECHABLE | Comando/entrypoint/gracia/forwarding y reinicio reales |
| Rol PostgreSQL, grants y RLS productivos | PENDIENTE DE ENTORNO REAL | Verificar identidad DATABASE_URL; backend permitido, anon/authenticated bloqueados |
| WAL, disco, replicación, RPO/RTO | PENDIENTE DE ENTORNO REAL | Durabilidad física y garantías del proveedor |
| Backup y restauración operativa real | PENDIENTE DE ENTORNO REAL | Local OWNED PASS no valida respaldo productivo |
| Número de réplicas, pools, reserva y capacidad | BLOQUEADO POR DECISIÓN DEL PROPIETARIO | Elegir topología y presupuesto; medir límite efectivo |
| Health checks, TTL y política de reinicios reales | PENDIENTE DE ENTORNO REAL | Probar política y plazos del proveedor |
| Timeouts de consultas ya conectadas bajo blackhole prolongado | NO VERIFICADO | Ensayo adicional autorizado si se necesita certificar esa condición |
| Publicación deportiva distribuida | BLOQUEADO POR DECISIÓN DEL PROPIETARIO | Subject local; decidir arquitectura antes de afirmar multiinstancia deportiva |
| 34 fallos históricos y Rescate intermitente | NO VERIFICADO | Sin causa demostrada; no declarar resueltos por suites verdes |

La regresión completa pasó; procede proponer revisión técnica final de PR-I1. No se autoriza despliegue/activación ni se considera cerrada B1/B2.
No se justifica otro checkpoint de código por los dos defectos del harness;
las verificaciones productivas/topología requieren evidencia y decisión del propietario.

## Checkpoint 21 local — resistencia y presupuesto consolidado

Base `6f7b3de`, origin local coincidente, rama competitiva; main `fb27225`.
Veinte checkpoints publicados según propietario; árbol limpio al iniciar.
CP21 incorpora ensayos locales, sin migraciones/dependencias ni cambios
al runtime, flags, fórmulas, locks, admisión o protocolos de liquidación.

### Procesos propios y recuperación

[Ensayo PostgreSQL](../test/competitive-resilience-postgres.test.cjs) y
[hijo controlado](../test/helpers/competitive-owned-worker.cjs), incorporados
al inicio del [runner](../tool/test_competitive_postgres.mjs), preservan las
323 pruebas anteriores y límites de 120 s por archivo. El helper exige IPC,
marker OWNED/loopback y un intento Cima V1 terminal del participante indicado.
No es entry point del backend ni admite fuentes remotas. Usa verificador real,
CompetitiveService y CompetitiveReconciler; instrumenta puntos precisos de la
transacción/acuse sin fabricar resultados ni modificar evidencia deportiva.

| Escenario | Aserción concreta | Alcance |
|---|---|---|
| Terminación antes del COMMIT | Ledger presente solo dentro de tx del hijo; padre no ve evento; después de morir no hay evento ni balance; reinicio liquida una vez | Liquidación individual Cima real; no nuevo ensayo de proceso para el par Tira |
| COMMIT antes del acuse worker | Padre ve un evento y settledAt null; terminación; worker reiniciado reconoce mismo pago y completa acuse; otro reinicio no duplica | Fuente durable PENDING, flags de admisión OFF en hijos |
| Muerte en espera de lock | Espera confirmada en pg_stat_activity; sin pago; tras liberar blocker propio, cero backend/locks; dos procesos recuperan un solo evento/balance versión 1 | No prometer liberación inmediata mientras el blocker siga activo |
| Cierre cooperativo | Hook real onModuleDestroy del reconciliador y disconnect; exit 0; PID PostgreSQL desaparece | Cooperativo, no sustituto de SIGTERM ni del cierre de Nest bajo señal |
| Presupuesto main + testigo | Dos slots main y uno testigo ocupados simultáneamente; P2024 de ambos consumidores; recuperación y cierre de todos los PID | Instrumenta pool del testigo real; no fabrica R ni certifica una partida |
| Corte TCP local y caché | 200 durante cache positivo, luego 503 seguro, live 200, cache negativo sin reconectar, posterior 200; cero XP por health y sockets/backend cerrados | Proxy OWNED a la misma base; no blackhole prolongado/proveedor |

En Windows, child.kill('SIGKILL') ejecuta terminación abrupta nativa
TerminateProcess. Se registra PID del proceso, PID PostgreSQL, punto y salida;
NO equivale a demostrar SIGKILL/SIGTERM POSIX. El cierre cooperativo tampoco
simula una señal. La cobertura Linux/SIGTERM real permanece PENDIENTE: no se
introduce otra imagen/runtime ni se señala procesos o contenedores ajenos.
La atomicidad del par Tira y sus prioridades siguen cubiertas por las suites
previas completas; estos hijos ensayan liquidación individual, no otra prueba
específica de caída del proceso de par. Usuario.xpTotal permanece 101 en fixtures.

### Inventario y presupuesto parametrizado

| Consumidor runtime | Pool | Presupuesto |
|---|---|---|
| PrismaService de PrismaModule | Principal por módulo Nest compartido por sus consumidores | Pmain por instancia; no fijado en código |
| Solo/Trivia/Tira reconciliadores, motores y presencia | Inyectan PrismaService; no crean cliente propio | Usan Pmain, no sumar un pool por cada worker |
| Readiness CP20 | PrismaService real, single-flight/cache | Usa Pmain; reservar capacidad dentro de ese pool |
| TiraAflojaVisibilityWitness | Único new PrismaClient adicional encontrado en src no-test; lazy, independiente, challenge misma DB, close | Pwitness por testigo instanciado (normalmente un proveedor Tira por backend) |
| CLI migraciones/operación administrativa | Fuera del proceso Nest | M simultáneos más reserva A; no sumar permanentemente scripts que no están ejecutando |

Para N instancias, Wi testigos por instancia y otros pools/directos Xi:

`Bapp = sum_i(Pmain_i + Wi*Pwitness_i + Xi)`

Si son homogéneas: `Bapp = N*(Pmain + W*Pwitness + X)`.

`Busado = Bapp + M + A` debe satisfacer
`Busado <= max_connections - superuser_reserved_connections - reserved_connections`
para identidades ordinarias, además del límite efectivo del proxy/proveedor.
M puede ser cero fuera de mantenimiento; A es reserva acordada, no dato inventado.
No contar readiness ni reconciliadores dos veces. Los pools son máximos posibles,
no cantidad abierta permanentemente; el testigo se abre de forma lazy. Presupuesto
productivo requiere valores efectivos de URL/runtime, réplicas, topología y proveedor.
No se leyeron .env ni credenciales; no se fija tamaño definitivo.

Ensayo acotado: main PrismaService pool=2, testigo real pool=1, pool_timeout=1 s,
un observer pool=1. Se mantienen tres transacciones de gates explícitos (máximo
10 s), se confirma pg_stat_activity=4 clientes simultáneos, se fuerza contención
P2024 sin elevar límites y se liberan gates antes de cerrar. El máximo configurado
runtime es 3 slots y el pico observado incluyendo observer es 4. PostgreSQL local
reporta max_connections=100, superuser_reserved_connections=3, reserved_connections=0;
97 slots ordinarios son un cálculo local, no capacidad certificada del proveedor.
El owner sintético del runner es privilegiado: este ensayo NO satura el límite
PostgreSQL de identidades ordinarias; alcanza únicamente los límites de pools
controlados. Recuperación local observada en primera ejecución: 2054 ms,
incluyendo dos timeouts de 1 s; no es SLA. Todos los pools y PID propios cierran.

### Fallos, correcciones y validación

Primera ejecución, bloque nuevo: 4/6. No se inventa fuga de runtime:
(1) esperaba desaparición del backend mientras su consulta aún esperaba el
blocker propio; (2) destruía sockets pero comprobaba tamaño antes de sus eventos
close. Se preservan aserciones y se corrige sincronización: liberar blocker,
exigir ausencia de backend y locks; await eventos close de ambos lados y servidor.
No se aumenta ninguna espera para esconder el problema. Evidencia reproducida en
segunda ejecución: backendRetainedWhileBlocked=1, locksAfterRelease=0.

Segunda ejecución, bloque nuevo 6/6, 18632 ms. Proxy: cache positivo restante
4977 ms; primer 503 a 5008 ms desde corte y recuperación a 6071 ms; negativo
1 s sin conexiones nuevas dentro del cache. Mide detection y recovery por separado.
No afirmar detección inmediata ni equivalencia con health del proveedor.
Build final exit 0 (19858 ms; también build inicial correcto); Jest competitivo 280/280 (19 suites, 17.121 s), completo
1164/1164 (108 suites, 44.203 s), ambos exit 0. npm audit --omit=dev:
cero vulnerabilidades, exit 0; TLS permanece verificado.
PostgreSQL completo inicial: 327/329, 22 archivos, 731933 ms, exit 1;
únicamente falló el bloque nuevo (dos sincronizaciones anteriores), sin
archivos incompletos ni pruebas canceladas/omitidas/TODO. Las 323 pruebas
previas pasaron. Segunda ejecución completa: 329/329, 22 archivos, 737749 ms, exit 0;
cero fallos, cancelados, omitidos, TODO, archivos incompletos o inválidos.
Respaldo/restauración OWNED de esquema y datos poblados: ambos PASS,
con comparación de datos, RLS, constraints, índices, funciones, secuencias y ACL.
Recuperación de pools en esta ejecución: 2050 ms. git diff --check exit 0;
enlaces Markdown nuevos/modificados verificados contra archivos y ancla existentes.
Contenedores OWNED retirados; postgres-local ajeno continúa running con el mismo
ID e instante de inicio. Ningún staging, commit, push, merge ni despliegue.
Conserva incidencias históricas de 34 fallos y Rescate; las ejecuciones locales
no demuestran una causa de esas incidencias ni permiten declararlas cerradas.

### Gates restantes

VALIDADO LOCALMENTE no cierra B1/B2 productivos: rol/RLS/grants reales, WAL/disco,
replicación, RPO/RTO/backups, blackholes de red y timeout efectivo del proveedor,
política de reinicios/readiness, máximos de pools y réplica, señales Linux/Nest,
y publicación distribuida (Subject local) siguen pendientes. Un proceso muerto
puede dejar un backend esperando un lock hasta que PostgreSQL detecte el corte o
termine la espera: acordar límites de espera del servidor en un próximo ensayo,
sin afirmar que un timeout cliente garantiza cancelación inmediata del servidor.
Siguiente CP22 propuesto: cierre Nest bajo señal real en plataforma destino y
límites de espera PostgreSQL/blackhole, con recursos propios y criterios medibles;
la elección de topología/bus y cualquier validación productiva requieren autorización.

## Checkpoint 20 local — readiness y presupuesto de conexiones

Base comprobada `7c1b793`, origin local coincidente, rama competitiva; main
`fb27225`. Diecinueve checkpoints publicados según propietario; árbol limpio
al inicio. CP20 documenta pruebas locales, sin autorización productiva.

[HealthController](../src/health/health.controller.ts) conserva `/health/live`
independiente de PostgreSQL y el contrato público de `/health/ready`: 200
OK/UP o 503 ERROR/DOWN, sin SQL, roles ni detalles privados. El nuevo
[probe competitivo](../src/health/competitive.readiness.ts) usa el PrismaClient
inyectado al backend y `current_user` real de esa conexión. No crea otro pool,
no cambia de rol y no escribe datos. El rol necesita SELECT sobre
`_prisma_migrations`; ese permiso interno también se verifica al consultar, sin
concederlo desde health. Recuperación Solo/Trivia/Tira sigue cargada
con admisión OFF: readiness exige sus precondiciones incluso con flags apagados.

Dos consultas SELECT dentro de una transacción READ ONLY comprueban historial
Prisma: once migraciones competitivas críticas finalizadas, ningún fallo/inicio
sin rollback pendiente; columnas escalares/enums requeridas por el cliente
generado; tipos esenciales/UUID nativos y etiquetas de enums, precisión terminal de microsegundos, RLS requerido,
índice único de liquidación, trigger de recibo habilitado, funciones críticas,
grants de tablas/funciones y USAGE de secuencias de historial/presencia. El probe
no ejecuta funciones deportivas ni lee snapshots/respuestas de jugadores.

Límites: maxWait 1000 ms, statement_timeout 1500 ms por sentencia y transacción
2500 ms. Single-flight por instancia; cache positivo cinco segundos, negativo
uno, desde terminación del probe. Puede conservar un estado anterior hasta ese
TTL; no es certificación continua ni readiness distribuido. Errores/timeout
producen 503 seguro y se vuelven a comprobar al vencer el cache. Liveness no
falla por la indisponibilidad competitiva.

Para rol sujeto a RLS, el análisis de catálogo acepta una policy permisiva ALL
aplicable, incondicional, y ninguna policy restrictiva aplicable condicional.
Aplicabilidad usa pg_has_role USAGE, no MEMBER: pertenecer a un rol NOINHERIT
no equivale a disponer de sus permisos sin SET ROLE. El probe privado incluye
una policy exclusiva de un parent no heredado y exige rechazo; luego cambia
solo la policy local al rol directo y comprueba liquidación real antes del rollback.
Owner sin FORCE, superusuario o BYPASSRLS siguen su semántica PostgreSQL real.
Una policy dependiente de filas/sesión no se certifica mediante catálogo y queda
fail-closed hasta un contrato operativo adicional: no fabricar permisos para
pasar health. Esta comprobación conservadora NO demuestra que todo INSERT pase
triggers, FKs o límites institucionales. Esa garantía pertenece a ensayos
operativos de rollback/negocio separados. Tampoco audita exhaustivamente toda
constraint, checksum/definición histórica o configuración productiva.

[Pruebas HTTP y capacidad](../test/competitive-readiness-postgres.test.cjs)
usan PostgreSQL propio del runner. Fixtures negativos de metadata se revierten;
el rename HTTP se restaura en finally. Dos reconciliadores reales, un origen
Cima autoritativo y dos pools limitados a una conexión prueban contención,
recuperación, drain con trabajo en vuelo y reinicio sin doble XP; los flags solo
se simulan dentro del proceso de fixtures y se restauran. No es un límite
productivo ni un cambio a Cima. El pool principal puede reservar conexiones
adicionales mientras observa el lock; no extrapolar el presupuesto local.

El [runner](../tool/test_competitive_postgres.mjs) ahora aplica migraciones con
Prisma migrate deploy a su base OWNED, copiando SQL confirmado desde HEAD a un
directorio temporal aislado. CLI ejecuta allí con DATABASE_URL/DIRECT_URL propios,
sin leer `.env` del repositorio. Conserva archivo secuencial, cobertura anterior,
límite 120 s, resumen estricto y ambos respaldos. No se fabrica `_prisma_migrations`.

Registro de validaciones CP20. Primera ejecución: readiness rechazó correctamente la base
sin `_prisma_migrations`: el runner anterior solo concatenaba SQL. Se corrige el
ensayo para representar un despliegue Prisma real. Build inicial exit 1 por
EPERM al reemplazar DLL de Prisma mientras PostgreSQL usaba su cliente. Se
repite secuencialmente al cerrar las conexiones, sin cambiar permisos ni TLS. Jest health inicial 10/10 (2 suites).
Segunda ejecución, con deploy Prisma: bloque nuevo 10/10; timeout de lock SQL
1585 ms y recuperación; ensayo de dos workers: 5 respuestas deportivas, cuatro
conexiones observadas, dos rechazos por pool, un evento ledger, cero backends de
workers tras cerrar, 2252 ms hasta completar y verificar recuperación. No se
extrapolan esos tiempos a producción. Segunda y tercera suites completas terminaron correctamente; resultados abajo.

| Garantía CP20 | Resultado | Límite / estado |
|---|---|---|
| Readiness real y errores privados | HTTP positivo y negativo; metadata incompatible rechazada, recuperación comprobada | VALIDADO LOCALMENTE; rol productivo NO VERIFICADO |
| Contención de dos pools y drain | Dos workers reales, un evento, conexiones liberadas | VALIDADO LOCALMENTE; no certifica señales de proceso ni carga sostenida |
| Migraciones con historia real | 61 versiones aplicadas mediante deploy en recurso propio | VALIDADO LOCALMENTE; migraciones productivas requieren otra autorización |
| Topología y capacidad productivas | Presupuesto debe sumar todos los clientes por réplica, incluido testigo independiente | PENDIENTE; no asumir límites de proveedor ni distribución de avisos |

Ejecución 1 completa: 309/320, 21 archivos, 654624 ms, exit 1; diez fallos del
bloque nuevo y uno del probe privado CP19, todos interceptados por ausencia de
historial Prisma. Sin cancelados/omitidos/TODO/incompletos. Ejecución 2 completa:
320/320, 21 archivos, 665868 ms, exit 0; bloque nuevo inicial 10/10 y probe
privado CP19 6/6. Ambos respaldos PASS (74 tablas iniciales y 75 al terminar). Ejecución 3 final: 323/323, 21 archivos, 660517 ms, exit 0;
ambos respaldos PASS (74/75 tablas), sin fallidos/cancelados/omitidos/TODO ni
archivos incompletos. Bloque nuevo 13/13, incluyendo UUID, enum y transacción larga controlada con
`pg_sleep(0.15)` frente a timeout Prisma 50 ms: P2028, recuperación en 163 ms.
Drain final: cuatro conexiones, dos rechazos por pool, un evento, recuperación
2236 ms, cero conexiones de workers tras cerrar. Suite final completa aprobada; el probe privado CP19 también pasó 6/6,
incluyendo MEMBER=true/USAGE=false de un parent no heredado, rechazo de
readiness y aceptación solo tras policy dirigida al rol efectivo. No se
conservan los roles/policies temporales.
Audit omit=dev cero vulnerabilidades, TLS intacto (CA del sistema temporal).

El despliegue debe distinguir `/health/live` para vida del proceso de readiness
para admisión de tráfico. `render.yaml` conserva healthCheckPath ready: revisar
la acción real del proveedor ante un fallo persistente antes de desplegar este
contrato; no afirmar que los dos endpoints configuran por sí solos su política
de reinicios. No se cambia ni se prueba configuración del proveedor en CP20.
No se simuló un corte TCP/proveedor ni una señal de terminación de proceso;
los límites de SQL/pool y los hooks reales de workers sí se probaron. La prueba
inaccesible del controller usa error de conexión unitario; no certifica latencia
de un blackhole de red productivo. B1/B2 no están completados.

Cierre final: build exit 0; Jest competitivo 280/280 (19 suites, 9,239 s),
Jest completo 1164/1164 (108 suites, 29,955 s); npm audit --omit=dev cero
vulnerabilidades; git diff --check exit 0 y enlaces/anclas modificados válidos.
Logs locales `%TEMP%/sp-cp20-postgres-1.log`, `sp-cp20-postgres-2.log`,
`sp-cp20-postgres-3.log`, `sp-cp20-build.log` (EPERM inicial),
`sp-cp20-build-final.log`, `sp-cp20-jest-competitive.log`,
`sp-cp20-jest-all.log` y `sp-cp20-audit.log`. Recursos propios retirados;
postgres-local ajeno conserva identidad y StartedAt originales.
No hay migraciones nuevas, dependencias nuevas, cambios deportivos, fórmulas,
flags de despliegue, ledger/pair protocol ni acceso remoto en CP20.

B1/B2 continúan abiertos para producción: identidad/grants/policies reales,
WAL/almacenamiento/replicación, RPO/RTO y respaldo autorizado; capacidad máxima,
suma de pools principal + testigo por réplica, cierre bajo señales/orquestación
y publicación distribuida (Subject local). Mantener incidencias históricas de
34 fallos y Rescate. Siguiente checkpoint sugerido: ensayo acotado de shutdown
bajo señal real y presupuesto de pools/testigo; requiere decidir topología antes
de prometer avisos entre instancias. Sin autorización productiva ni flags activos.

## Checkpoint 19 local — B1/B2, sin autorización productiva

> Historial publicado en `7c1b793`. Las referencias a SELECT 1 y al probe
> readiness UP inferiores describen CP19; CP20 sustituye ese contrato y
> refuerza la prueba del rol privado. No son la comprobación activa de CP20.

Base Git comprobada: e7cae17, rama feat/pr-i1-competitive-infrastructure;
main fb27225. Dieciocho checkpoints funcionales y commit documental publicados
según propietario. Árbol limpio al iniciar. [Relevo](PR_I1_RELEVO.md) conservado.
CP19 agrega verificaciones locales, sin cambiar fórmulas, flags, Prisma o
migraciones confirmadas. No equivale a cerrar B1/B2 ni autoriza activación productiva.

### Evidencia reproducible y matriz operativa

Pruebas nuevas: [competitive-operational-postgres.test.cjs](../test/competitive-operational-postgres.test.cjs),
ejecutadas al final del [runner desechable](../tool/test_competitive_postgres.mjs).
El runner mantiene archivos secuenciales y límite original de 120 s por archivo.
Antes de las suites restaura el esquema recién migrado; después restaura la base
poblada. Ambos ensayos usan pg_dump custom y pg_restore --single-transaction
--exit-on-error en bases separadas del MISMO contenedor propio. Compara conteos y
huellas ordenadas de todas las tablas públicas, flags RLS, constraints, índices,
funciones, valores de secuencias y privilegios efectivos de tablas/secuencias;
el segundo exige ledger/balances/historial/recibos poblados. Solo registra
igualdad/conteos, nunca contenido privado ni credenciales. Un desacuerdo falla
la ejecución. El recurso completo es desechable; no toca backups reales.

| Requisito | Riesgo | Evidencia/prueba | Resultado y estado | Restricción | Pendiente productivo/autorización |
|---|---|---|---|---|---|
| B1 rol insuficiente | Acceso indebido o backend sin acceso | Identidades SQL anon/authenticated; NOSUPERUSER/NOBYPASSRLS, grants sin policy | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | Ensayo en recurso propio | Identificar rol REAL de DATABASE_URL |
| B1 rol privado autorizado | Depender necesariamente de superusuario | Políticas privadas TO rol local, liquidación Cima real/idempotente antes de rollback | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | Grants amplios del probe, no receta de mínimo privilegio productivo ni prueba de login | Acordar y auditar grants/policies de backend |
| B1 RLS/evidencia | Ledger, balances, historial, snapshots o recibos accesibles directamente | Tablas RLS inventariadas y acceso denegado a dos roles; funcs competitivas sin SECURITY DEFINER oculto | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | No prueba configuración Supabase | Owner/BYPASSRLS, grants, membership y policies efectivas de producción |
| B1 migraciones | Dependencias o constraints faltantes | Secuencia versionada en base nueva; suites de integridad existentes y digest de esquema restaurado | PASS, 61 migraciones y esquema restaurado; VALIDADO LOCALMENTE | Sin alterar ni aplicar migraciones remotas | Respaldo, revisión, autorización y esquema real |
| B1 WAL local | Confundir COMMIT con durabilidad física | SHOW equivalente de fsync, synchronous_commit, full_page_writes y wal_level | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | Solo parámetros de esta instancia | Almacenamiento, replicación y configuración efectiva productiva |
| B1 durabilidad física | Pérdida después de fallo de infraestructura | Atomicidad/reintentos anteriores conservados; no prueba corte eléctrico/disco/proveedor | NO VERIFICABLE LOCALMENTE para producción | Settings on no certifican hardware ni réplica | SLA, WAL/replicación, recuperación y evidencia del proveedor |
| B1 respaldo/restauración | Backup inutilizable o datos/esquema alterados | pg_dump/pg_restore propios + huellas iguales, sin exposición de filas | PASS, esquema y datos poblados; VALIDADO LOCALMENTE | Restaura mismo cluster/version, no otra versión/proveedor | RPO/RTO, cifrado/custodia, retención, roles y ensayo real autorizado |
| B2 pool | Agotamiento y conexiones abandonadas | Pool 1, error P2024 acotado, recuperación y desaparición de backend tras disconnect | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | Prueba de contención, no carga real | Presupuesto total por instancia/pools/testigos/replicas, endpoint de pooling |
| B2 selección/reintentos | Un pendiente sin evidencia bloquea los demás o reintenta agresivamente | 30 orígenes deportivos reales, más de un lote, cinco fallos inyectados sin pago y backoff 5 min | PASS en ejecuciones 1, 2 y 5; VALIDADO LOCALMENTE | Inyección de error para probar scheduler, no evidencia deportiva ficticia autorizada | Volumen, distribución de errores, latencias y observabilidad operativa |
| B2 atomicidad/multiinstancia | Doble pago o rollback parcial | Suites CP18: dos clientes/instancias, hash, rollback, COMMIT sin acuse; se repiten íntegramente | PASS en suites CP19; VALIDADO LOCALMENTE | No certifica clusters ni capacidad productiva | Pools/topología de despliegue y ensayo de carga autorizado |
| B2 publicación distribuida | Usuarios conectados a otra instancia no reciben aviso local | TiraAflojaRealtimePublisher usa RxJS Subject; sin bus compartido en ese proveedor | BLOQUEADO para garantía distribuida | SQL durable no distribuye automáticamente notificaciones | Decidir infraestructura/topología con propietario; no simular bus |
| B2 ciclo de vida | Cerrar pool con trabajo activo | PrismaService conecta/desconecta; hooks de shutdown en main; workers coalescen y esperan running; testigo close libera su cliente | PENDIENTE de evidencia bajo carga | Pruebas anteriores y pool local, no señales/fallos reales bajo carga | Orquestación, límites de cierre, capacidad y pruebas operativas |

### Privilegios y configuración: alcance de la evidencia

El backend no requiere DDL de migraciones para liquidar. Necesita USAGE de schema;
SELECT/UPDATE para locks y cierres en Usuario/orígenes; SELECT/INSERT de ledger;
SELECT/INSERT/UPDATE de balance y cola/recibos; SELECT de historial; EXECUTE de
funciones invocadas directamente. Cambios de institución requieren INSERT de
historial por trigger y USAGE de su secuencia. Inventario completo del backend
incluye otros módulos: esta lista no es una política final de mínimo privilegio.

RLS sin policy privada no permite operar a un rol ordinario aunque tenga grants.
Owner puede omitir RLS salvo FORCE, y superusuario/BYPASSRLS pueden omitirla;
no confundir el rol privilegiado del runner con el backend productivo. El probe
privado no tiene superusuario, BYPASSRLS, CREATEDB, CREATEROLE ni LOGIN: SET LOCAL
ROLE prueba identidad/privilegios SQL, no autenticación/password/login externo.
Sus policies y cambios de liquidación quedan dentro de una transacción revertida;
no se instalan policies de producción ni se conceden privilegios a clientes.

PrismaService usa DATABASE_URL; directUrl usa DIRECT_URL para CLI. No se leyeron
valores ni .env. No hay límite de pool fijo en PrismaService: depende del URL y
del runtime. TiraAflojaVisibilityWitness crea un PrismaClient adicional y verifica
que sea la misma base mediante challenge de locks; cierra su pool. Su identidad
real/endpoint productivo sigue pendiente. Dimensionar SUMA de pools por instancia,
no solo PrismaService; la prueba pool=1 no selecciona un tamaño productivo.

render.yaml observado: plan free, build npm ci --include=dev && npm run build,
start npm run start:prod, readiness /health/ready. No se observó allí un paso
preDeploy de migraciones ni numInstances explícito. Eso no prueba configuración
del proveedor ni autoriza cambiarla. [HealthController](../src/health/health.controller.ts)
usa SELECT 1: readiness demuestra conectividad, no tablas/policies competitivas.
El probe privado comprueba readiness UP aun cuando RLS oculta ledger sin policy;
esto es una limitación P1 del gate de despliegue, no autorización de acceso.
Mantener verificación explícita de esquema/privilegios y no reinterpretar health
como certificación de migraciones. No se cambia ese contrato global en CP19.
Esquema competitivo debe preceder backend,
incluso con flags apagados; no usar un despliegue para ocultar esquema faltante.

### Validaciones y siguientes pasos

Registro completo de ejecuciones PostgreSQL CP19 (logs locales `%TEMP%/sp-cp19-postgres-N.log`):

| Ejecución | Suites | Resultado global | Diagnóstico |
|---|---|---|---|
| 1 | 310/310, 20 archivos, 734277 ms; nuevas 6/6 | exit 1 | Comparador del respaldo detectó diferencia después de todas las suites |
| 2 | 310/310, 20 archivos, 726011 ms; nuevas 6/6 | exit 1 | Diagnóstico aisló exclusivamente constraints; datos, flags RLS, índices y funciones coincidían |
| 3 | Ninguna ejecutada | exit 1 | Nuevo gate inicial reprodujo siete CHECK de esquema con representación diferente al restaurar |
| 4 | Ninguna ejecutada | exit 1 | CHECK reparsedos ya iguales; nueva comprobación de ACL textuales detectó representación diferente |
| 5 | 310/310, 20 archivos, 712656 ms; nuevas 6/6 | exit 0 | Restauración inicial PASS (73 tablas) y poblada PASS (74 tablas), sin tests fallidos/cancelados/omitidos/TODO ni archivos incompletos |

Causa demostrada del desacuerdo CHECK: los casts históricos de array varchar[]
a text[] aparecen como casts por elemento después de pg_dump/pg_restore. Afectó
los CHECK de estado/contexto de Cima, Guardián y Rescate, y el CHECK histórico de
Escudo. No se modificó ninguna constraint ni migración. El comparador ahora
reparsea ambos CHECK mediante el parser PostgreSQL en tablas temporales aisladas,
conservando tipos/casts y flags validated/deferrable/deferred. Para ACL compara
acldefault/aclexplode ordenados por grantor, grantee, privilegio y grant option,
no la representación textual u orden de entradas. El gate inicial de ejecución
5 confirma igualdad completa con estas comprobaciones; no certifica
el respaldo poblado por sí solo: el segundo ensayo, tras las 310 pruebas,
lo verifica también (74 tablas). Estas correcciones afectan el ensayo nuevo, no las reglas
ni el runtime. No se omite ningún archivo para lograr PASS.

Validaciones iniciales: build exit 0, Jest competitivo 276/276 (18 suites,
18,468 s), completo 1157/1157 (107 suites, 77,142 s), audit cero vulnerabilidades.
Repetición final tras PostgreSQL: build exit 0; competitivo 276/276 (18 suites,
12,149 s); completo 1157/1157 (107 suites, 42,470 s); audit omit=dev cero
vulnerabilidades; git diff --check exit 0. Enlaces locales y ancla CP19 comprobados.
TLS activo; NODE_OPTIONS --use-system-ca temporal para audit, restaurado después.
Logs locales `%TEMP%/sp-cp19-build-final.log`,
`sp-cp19-jest-competitive-final.log`, `sp-cp19-jest-all-final.log`,
`sp-cp19-audit-final.log` y los cinco logs PostgreSQL anteriores. Docker 29.7.2,
contexto desktop-linux: al cierre solo queda postgres-local, con identidad y
StartedAt originales. No declarar B1/B2 completos.
Permanecen las incidencias históricas de 34 fallos y Rescate intermitente.
Siguiente checkpoint propuesto: presupuesto de conexiones y cierre bajo carga
con criterios locales acordados; después, decisión explícita de topología/bus
antes de afirmar publicación multiinstancia. Los gates de producción requieren
otra autorización; no iniciar Memoria/Batallas/PR-I2 ni activar flags.

## Estado vigente — checkpoint 18 local: integración de par Tira

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `af2374e`, diecisiete
checkpoints publicados; CP18 SIN COMMIT. Implementa A6–A8 mediante proveedor
CompetitiveTugPairProtocol y TugCompetitiveReconciler, sin registro individual
TUG_MATCH. Usa replay preciso real, recibo/decisiones neutrales durables y una
transacción para todos los eventos/balances del par. No convierte terminalUs a
Date ni modifica xpTotal. Flags conservan default OFF; la recuperación solo
consume admisión persistida V1 con temporalVersion=1, independientemente del flag.
Corrección P1 local: certificado R ausente conserva PENDING con diagnóstico y
reintento cada cinco minutos aun después del deadline; solo su presencia e
integridad verificadas permiten pagar. Observación oportuna puede confirmar
después; no se fabrica R ni se cambia el testigo. Certificado huérfano visible
se bloquea como INVALID. P1 validado: build exit 0, Jest competitivo 276/276 (18 suites), completo
1157/1157 (107 suites), PostgreSQL 304/304 (19 archivos, 776049 ms), audit cero
vulnerabilidades y diff check exit 0. Primera ejecución P1 302/304: los fixtures
usaban el deadline del padre, limpiado al cerrar; corregidos para esperar R
inmutable y verificar vencimiento en PostgreSQL. Resultados anteriores CP18
conservados abajo; diagnóstico y reproducción real en la auditoría de Tira.

Nueva migración local `20261005120000_tug_pair_settlement` después de autoridad
temporal CP16: fechaEfectiva(6), conversor entero, tabla de pendientes/recibos,
constraints/RLS privados. Corrección administrativa conserva instante original
exacto; contratos Date de otros verificadores permanecen intactos. Requiere
esquema nuevo antes del backend aunque los flags estén apagados. No se ejecuta
migración remota, despliegue ni activación. CP18 validado localmente: build exit 0, Jest competitivo 276/276 (18 suites),
Jest completo 1157/1157 (107 suites), PostgreSQL 302/302 (19 archivos),
audit omit=dev cero vulnerabilidades y diff check exit 0. Tres ejecuciones
PostgreSQL fallidas previas y sus correcciones se conservan en la auditoría
de Tira; no hubo pruebas omitidas ni canceladas. Historial CP17 e inferiores
representa únicamente sus contratos anteriores.

[Camino, matriz, recuperación, límites y pruebas CP18](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
Rol/RLS productivo, WAL/durabilidad física, capacidad/multiinstancia y pruebas
operativas siguen pendientes. Incidencias históricas 34 fallos/Rescate abiertas.
No main/Flutter ni inicio Memoria/Batallas/PR-I2; sin commit/push/merge.

## Historial — checkpoint 17 confirmado en af2374e: contrato preciso del par Tira

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `795d6a3`; dieciséis
checkpoints confirmados/publicados según el propietario, árbol limpio al iniciar.
CP17 SIN COMMIT prepara A3–A5 sin conectar TUG_MATCH al ledger, registro,
workers, gateways o controllers. No existe liquidación individual de Tira.

`VerifiedTerminal` y su contrato Date permanecen intactos para Solo/Trivia/Duelo.
`VerifiedTugPairTerminal` es un contrato interno distinto, con identidad común
TUG_MATCH, dos participantes originales, admisión/ACTIVA/terminal en epoch µs
(decimal string), fase versionada y resoluciones discriminadas. El nuevo método
`loadPreciseLockedPair` no es `loadTerminal` ni `loadLockedPair`: no puede entrar
accidentalmente al kernel anterior. El kernel y sus barreras permanecen intactos.

El lector exige admisión persistida y temporalVersion=1; cruza marca ACTIVA,
versión deportiva y watermark con snapshot y replay. Conserva timestamp(6),
usa reloj PostgreSQL (tug_presence_now), no Date.now() para validar terminales,
y rechaza evidencia contradictoria. No hay migración nueva ni backfill.
Cancelación y expiración son NEUTRAL, nunca RESULTADO/EMPATE ficticio.
EXPLICIT pre-ACTIVA representa cero para ambos sin penalización. Abandono propio
GRACE/EXPLICIT durante ACTIVA probado se clasifica penalizable, sin aplicar −15.

La presencia positiva por GRACE exige evidencia autenticada estrictamente
posterior a desconexión rival y no estar en gracia propia: CONNECTED/RENEWED
persistido o respuesta realmente aceptada, correcta o incorrecta. UNKNOWN actual
no borra una prueba histórica válida ni demuestra suficiencia por sí solo.
Cero acciones conserva NO_ACTIONS, futura recompensa cero; no calcula XP.
Cierre A5: el propietario aprueba para EXPLICIT_ACTIVE OPEN histórico autenticado
válido al instante exacto de cierre, sin gracia propia ni abandono propio anterior.
El replay aporta connectionId, evento CONNECTED/RENEWED, authenticatedUs,
leaseUntilUs y authUntilUs; verifica el intervalo con BigInt, sin leer el estado
actual del socket como prueba. Se retira EXPLICIT_PRESENCE_POLICY_UNDEFINED.
OPEN booleano sin intervalo, lease/token vencido o evidencia futura se rechazan.
Sin acciones, NO_ACTIONS conserva cero XP positivo. GRACE mantiene su requisito
propio de evidencia posterior a desconexión; las dos políticas no se confunden.
Actualización de producto CP17 APROBADA: SIMULTANEOUS_CANCELLED
conserva CANCELADA, ganador nulo y dos NEUTRAL/SIMULTANEOUS con positiveXp=0
y nominalPenalty=0 para cada participante. Solo aplica a dos desconexiones
confirmadas cuyas gracias vencen en el mismo µs PostgreSQL, sin terminal normal
o global prioritario. Se retira el bloqueo de política anterior; no hay dos −15,
empate ficticio ni extensión a otras cancelaciones. UNKNOWN no prueba abandono.
El contrato permanece settlement=NOT_INTEGRATED; no se escribe ledger ni se
modifican flags. El kernel anterior conserva su barrera hasta integración A6.

Contrato implementado ≠ integrado ≠ desplegado ≠ listo para activar. Todos los
flags siguen OFF por defecto (SOLO, TRIVIA, GHOST, TUG). A6–A8 integración
atómica, recuperación competitiva y selección de neutrales siguen pendientes;
B1/B2 rol/RLS productivo, WAL/durabilidad física, capacidad y multiinstancia,
migraciones remotas autorizadas y gates operativos permanecen abiertos.
Se conservan la incertidumbre histórica de 34 fallos y Rescate intermitente,
PR-I1 no fusionado a main y ninguna migración remota aplicada aquí.
Validación inicial CP17, antes de la actualización de producto: build exit 0; Jest competitivo 252/252 (17 suites, 7,048 s);
completo 1133/1133 (106 suites, 25,667 s); PostgreSQL 267/267 (17 archivos,
497494 ms), sin fail/cancelled/skipped/TODO/incompletos; 16 casos PG y 24 Jest
nuevos. Auditoría omit=dev cero vulnerabilidades con TLS activo y diff check exit 0.
Actualización simultánea APROBADA validada: build exit 0; Jest competitivo
255/255 (17 suites, 9,514 s); completo 1136/1136 (106 suites, 28,812 s);
PostgreSQL 267/267 (17 archivos, 495423 ms), sin fail/cancelled/skipped/TODO
ni archivos incompletos. Simultánea con respuestas aceptadas conserva cero
recompensa y cero penalización; 1 µs de diferencia no aplica esa política.
Auditoría omit=dev cero vulnerabilidades/TLS activo y diff check exit 0.
Cierre A4/A5 validado: build exit 0; Jest competitivo 267/267 (17 suites,
10,642 s), completo 1148/1148 (106 suites, 59,192 s); PostgreSQL final 273/273
(17 archivos, 559646 ms), contrato 22/22 y suites anteriores 251/251, sin
fallos/cancelados/omitidos/TODO ni resúmenes incompletos. Audit omit=dev cero
vulnerabilidades/TLS y diff check exit 0. Primera ejecución PG 272/273,
563603 ms, exit 1: fixture esperaba UNKNOWN tras UNCERTAIN post-terminal,
pero SQL retorna OPEN hasta el lease. Fixture corregido con leaseUntil persistido;
verifica UNKNOWN real sin relajar aserciones ni cambiar motor/migraciones.
No migración nueva; los 60 enlaces locales revisados existen. Detalles y logs en
[contrato, matriz y validaciones CP17](PR_I1_TIRA_AFLOJA_AUDITORIA.md).

## Historial — checkpoint 16 confirmado en 795d6a3: autoridad temporal Tira

HEAD `83d53da`, rama `feat/pr-i1-competitive-infrastructure`; quince checkpoints
confirmados/publicados. CP16 SIN COMMIT cierra A1/A2 para nuevas búsquedas admitidas:
marca ACTIVA PostgreSQL µs/version/watermark, snapshot temporal inmutable, rapidez
y programación exactas. Countdown GRACE puede reconstruirse con esa marca;
versiones anteriores no reciben evidencia retroactiva ni cambian reglas Date.
Migración nueva `20261004160000_tug_temporal_authority` depende de las cuatro
migraciones Tira confirmadas (evidencia→presencia→visibilidad→admisión).
TUG_MATCH sigue sin registro, kernel conectado, liquidación o XP. Fórmulas V1
sin cambios y COMPETITIVE_TUG_ENABLED=false por defecto.

TerminalUs exacto solo privado: fracciones no se redondean a VerifiedTerminal;
el contrato temporal nuevo completo queda bloqueado en loadLockedPair hasta
resolver la dependencia Date/Date.now() compartida en integración futura.
A3–A8 no implementados; B1/B2 rol/RLS, WAL, capacidad/multiinstancia pendientes.
Validación CP16: build exit 0; Jest competitivo 228/228 (16 suites), completo
1109/1109 (105 suites); PostgreSQL 251/251 (16 archivos, 486297 ms), cero fallos,
cancelaciones, omisiones, TODO o archivos incompletos; audit omit=dev cero
vulnerabilidades y diff check exit 0. Se conservan PG 247/249 y 250/251, sus
causas y correcciones en [contrato, matriz y pruebas](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
Historial inferior no sustituye el estado vigente. Incidencias de 34 fallos y
Rescate abiertas; PR-I1 no fusionado y ninguna migración remota aplicada aquí.

## Historial — checkpoint 15 publicado (83d53da): replay de presencia aislado, sin XP Tira

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `60b1228`, catorce checkpoints
confirmados por el propietario; checkpoint 15 local sin commit.
[Algoritmo, clasificación, pruebas y bloqueos](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
Se extiende TugSportsReplay con conexiones/eventos PG, precisión µs, precedencia
normal/global/gracia, abandono confirmado, EXPLICIT pre/durante ACTIVA y
CANCELADA simultánea. Salida excepcional privada, sin VerifiedTerminal ficticio
ni conexión kernel/ledger; solo NORMAL conserva el contrato anterior.

Revisión humana posterior: el replay exige reconexión en [inicio de gracia,
vencimiento), impidiendo timestamps retroactivos aunque su ID sea posterior.
Una ronda resuelta debe tener decisionAt <= terminal excepcional, además de
las verificaciones existentes de global/gracia. Se añaden cuatro casos Jest y
dos regresiones PG con cero/una respuesta y alteraciones privilegiadas en
rollback. Validación de estos refuerzos: build exit 0; Jest competitivo 227/227
(16 suites); Jest completo 1108/1108 (105 suites); PostgreSQL 240/240 en 15
archivos, sin fallos, cancelaciones, omisiones, TODO o archivos incompletos;
auditoría omit=dev sin vulnerabilidades; git diff --check exit 0. Resultados
anteriores abajo conservados como historial. Véase la auditoría para duraciones
y límites pendientes; estas pruebas no resuelven las incidencias históricas.

GRACE durante countdown sigue bloqueada: falta marca exacta de activación entre
streams. Evidencia incompleta, certificados R ausentes y contradicciones bloquean
el par. No se cambia CompetitivePairProtocol, CompetitiveService, fórmulas,
servicios deportivos ni migraciones. Sin migración nueva. TUG_MATCH sigue
SOURCE_NOT_INTEGRATED, sin pagos XP ni activación para usuarios.
COMPETITIVE_TUG_ENABLED=false, independiente de SOLO/TRIVIA/GHOST, también OFF
por defecto: admisión no equivale a liquidación.

Validación final: build exit 0; Jest competitivo 223/223 (16 suites), completo
1104/1104 (105 suites); PG 238/238 en 15 archivos, incluyendo 19 nuevos, cero
fallos/omisiones/cancelaciones/TODO/incompletos; audit cero vulnerabilidades y
diff correctos. La auditoría conserva la primera PG 234/235 y su causa
demostrada en el reloj del fixture, la segunda 236/236 y la final 238/238.
No cierra incertidumbre histórica de 34 fallos ni Rescate. Pendientes WAL,
rol/RLS productivo, capacidad multiinstancia y gate: respaldo/revisión → rol/RLS
→ migraciones autorizadas → esquema → backend flags OFF → pruebas operativas
→ activación explícita. Nada se despliega ni migra remotamente aquí.
Otros juegos e integración Tira pendientes; PR-I2 no iniciado, PR-I1 no fusionado.

## Historial confirmado — checkpoint 14 (60b1228)


## Historial — checkpoint 14: replay Tira aislado y parcial

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `d18a676`: trece checkpoints
confirmados; ronda 14 local sin commit. [Auditoría vigente del replay](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
El adaptador privado reconstruye únicamente terminales normales demostrables
sin gracia previa, con admisión persistida, snapshot, respuestas y todas las
parejas R certificadas. No se registra en Nest/registry, no llama al kernel de
liquidación y no paga XP. TUG_MATCH sigue SOURCE_NOT_INTEGRATED.

Abandonos, neutrales, gracia histórica incompleta y discrepancias de microsegundos
permanecen bloqueados; no se cambia VerifiedTerminal ni CompetitivePairProtocol.
COMPETITIVE_TUG_ENABLED=false, independiente de los tres flags anteriores, también
apagados por defecto. Sin migración nueva: depende de evidencia, presencia,
visibilidad y admisión confirmadas (última 20261004010000).

La futura integración debe resolver estos bloqueos antes de registrar/pagar;
conservar respaldo, verificación rol/RLS, migración autorizada, esquema, despliegue
con flags apagados, pruebas operativas y activación explícita. Nada se despliega
ni migra remotamente aquí. Pendientes WAL, rol/RLS productivo, incertidumbre de
los 34 fallos, Rescate intermitente, multiinstancia y PR-I1 sin fusionar a main.
Revisión humana del checkpoint 14: corregida la contención P2028 del barrido, que ahora espera cada transacción y su testigo antes de despachar la siguiente, priorizando certificados pendientes. Se conserva connection_limit=1 y todos los deadlines. La regresión pasó y la validación completa terminó 219/219 en 14 archivos (cero fail/cancelled/skipped/todo/incompletos); replay 13/13. Build, Jest competitivo 216/216, Jest completo 1097/1097, audit y diff correctos. Los resultados fallidos 205/217 y 217/218 se conservan como historial. El checkpoint permanece sin commit y pendiente de autorización humana. Los resultados finales se registran en la auditoría de Tira; los siguientes
apartados son historial, no validación ni habilitación de la ronda 14.


## Historial — checkpoint 13, admisión persistida Tira sin XP

Rama feat/pr-i1-competitive-infrastructure, HEAD fdfa9aa: doce checkpoints
confirmados, árbol limpio al inicio. Ronda 13 local, sin commit. La decisión
aprobada por el propietario es admisión automática del backend para búsquedas
nuevas elegibles con el futuro flag activo, y emparejamiento solo entre la misma
clasificación persistida. A queda fijado al INSERT; B en su primer emparejamiento.

[Contrato, migración y pruebas de admisión](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
COMPETITIVE_TUG_ENABLED está apagado por defecto y en .env.example. No es un
permiso del cliente ni reutiliza SOLO. No se activa para usuarios: los tests
positivos cambian únicamente el entorno del proceso de pruebas desechables.
TUG_MATCH permanece SOURCE_NOT_INTEGRATED, sin provider/verificador/reconciliador
de XP. Admisión no demuestra replay ni transforma certificados R en elegibilidad.
El núcleo del par del checkpoint 12 continúa aislado y con sus barreras.

Nueva migración incremental
[20261004010000_tug_competitive_admission](../prisma/migrations/20261004010000_tug_competitive_admission/migration.sql),
posterior a evidencia, presencia y visibilidad Tira. Históricos quedan NULL,
sin backfill; UPDATE no puede promoverlos ni cambiar decisión/política/versiones.
El backend nuevo requiere aplicar y verificar esta migración antes del despliegue,
incluso con flags apagados: Prisma lee los nuevos campos. No se ocultan errores
de esquema ni se ejecutan migraciones remotas. Mantener respaldo/revisión,
verificación de rol/RLS, migración autorizada, esquema, backend con flags apagados,
pruebas operativas y activación explícita posterior a resolver el replay.

Pendientes: replay completo, terminales neutrales/fase ACTIVA, integración final
TUG_MATCH, WAL productivo, rol/RLS, incertidumbre de 34 fallos históricos,
intermitencia Rescate y límites multiinstancia. PR-I1 no fusionado ni desplegado.
Los registros inferiores son historial; no describen habilitación actual.

Validación final: build exit 0 (27922 ms); Jest competitivo 213/213 en 14 suites
(16,931 s), completo 1094/1094 en 103 suites (72,235 s); PostgreSQL 205/205 en
trece archivos completos, incluidos nueve casos de admisión (352842 ms bloque /
366248 ms runner); cero fallos, cancelados, omitidos, TODO o incompletos.
Audit omit=dev cero vulnerabilidades, TLS activo; diff --check exit 0;
75 enlaces locales existentes. La auditoría de Tira conserva las tres ejecuciones
PG: primera 202/203 por inventario desactualizado de funciones privadas, segunda
203/203 con ese inventario corregido, tercera 205/205 tras agregar procedencia
de UUID y sus dos regresiones. No se relajó la comprobación de permisos.
TugMatchIdentity, privado e inmutable, evita que borrar/renombrar una fila legacy
permita reutilizar su UUID como admisión nueva. No inventa admisiones históricas.
Se aplica y prueba únicamente en PostgreSQL propio desechable.

### Checkpoints

| Etapa | Commit / estado | Entrega |
|---|---|---|
| 1 | 08fa13b, confirmado | Infraestructura común y reglas V1. |
| 2 | 76a8a47, confirmado | Cima, Guardián y Rescate. |
| 3 | af78ee7, confirmado | Auditoría de frontera Trivia/Duelo. |
| 4 | 16163b7, confirmado | Evidencia, snapshot y fantasma inicial. |
| 5 | 88f7045, confirmado | Presencia y acciones Trivia/Duelo. |
| 6 | ebe40e3, confirmado | Verificación/liquidación Trivia/Duelo. |
| 7 | 39d3881, confirmado | Auditoría e idempotencia Tira. |
| 8 | a4d010b, confirmado | Snapshot y presentaciones R Tira. |
| 9 | 3d0e625, confirmado | Presencia/gracia Tira y runner. |
| 10 | 7edef15, confirmado | Auditoría de locks y visibilidad. |
| 11 | 1c12245, confirmado | Certificación R independiente post-COMMIT. |
| 12 | fdfa9aa, confirmado | Núcleo aislado del par, con barreras de evidencia. |
| 13 | d18a676, confirmado | Admisión persistida, flag apagado; sin verificador/XP Tira. |
| 14 | 60b1228, confirmado | Replay normal aislado y barrido serial corregido; sin XP. |
| 15 | 83d53da, confirmado | Replay de presencia y terminales privado, con bloqueos de evidencia; sin XP. |
| 16 | 795d6a3, confirmado | ACTIVA exacta y temporalidad µs para nuevas búsquedas admitidas; contrato de liquidación bloqueado, sin XP. |
| 17 | af2374e, confirmado | Contrato preciso del par, neutrales, fase penalizable y presencia del beneficiario; sin liquidación. |
| 18 | Local, sin commit | Integración interna de par, ledger preciso, recibo durable y recuperación; validado localmente, flags OFF. |

## Historial — checkpoint 12 confirmado en fdfa9aa

Rama feat/pr-i1-competitive-infrastructure, HEAD 1c12245, once checkpoints
confirmados. Árbol limpio al inicio; checkpoint 12 local sin commit. Se prepara
un núcleo de ledger atómico para dos participantes, NO una integración XP Tira.
Véase [alcance, locks y bloqueos](PR_I1_TIRA_AFLOJA_AUDITORIA.md).

Orden: clave compartida de fuente → usuarios originales ordenados → evidencia
de partida mediante adapter confiable → validación de ambos/cobertura histórica
→ dos postings en una transacción. Reutiliza las primitivas del ledger existente;
no usa dos transacciones individuales ni modifica Usuario.xpTotal. El núcleo
rechaza parcialidad previa, hashes contradictorios, R/resultados incompatibles y
coverage desconocida; reintentos recuperan los mismos dos eventos.

La revisión humana del checkpoint 12 bloquea dos ABANDONO con
PAIR_DOUBLE_ABANDONMENT_UNAPPROVED y cualquier abandono de fase no demostrable
con PAIR_ABANDONMENT_PHASE_UNVERIFIED. definitive=true no prueba ACTIVA; el
contrato compartido no contiene esa evidencia. Se bloquea todo el par antes de
postings, sin penalizar ni premiar y sin cambiar el cierre deportivo. Las otras
combinaciones no normales reciben PAIR_TERMINAL_CLASSIFICATION_UNSUPPORTED.
El adapter futuro necesita replay de fase y representación neutral; no se añaden
campos ni se habilita un verificador. La consulta institucional conserva el log
de transiciones (desde,id), incluida institución nula: el registro siguiente
termina implícitamente el anterior. Una regresión usa el trigger real y verifica
los límites exactos sin modificar historial ni consultas de los otros juegos.

CompetitivePairProtocol NO está registrado ni conectado a HTTP, sockets o
workers. El adapter de las pruebas es un fixture sintético, no un verificador
autoritativo de Tira. La ausencia de admisión persistida y replay deportivo
completo impide registrar TUG_MATCH: se mantiene SOURCE_NOT_INTEGRATED. Las
pruebas reales de ledger del núcleo no demuestran liquidaciones deportivas con
certificados, UNKNOWN, gracia o terminales falsificados. No se habilita XP,
ningún flag ni otros juegos. Sin nuevas migraciones. Los flags existentes siguen
apagados por defecto; no se modifican las fórmulas V1.

Revisión humana del checkpoint 12: build exit 0 (30894 ms), competitivo
206/206 (13 suites, 27,291 s), completo 1087/1087 (102 suites, 90,561 s),
PostgreSQL 196/196 en doce archivos completos (351017 ms del bloque / 365909 ms
del runner), incluidos 16/16 casos del núcleo. Cero fallos, omitidos, cancelados,
TODO o archivos incompletos. Audit omit=dev cero vulnerabilidades con TLS activo;
diff --check exit 0 y 70 enlaces locales existentes. No hubo intentos fallidos en
esta revisión; los anteriores se conservan abajo y en la auditoría de Tira.
Las barreras no crean eventos/balances; la regresión institucional usa el trigger
real, sin inventar historial. Logs TEMP: saberplus-twelfth-review-.

Se preservan WAL/durabilidad física, rol/RLS productivos, los 34 fallos históricos,
Rescate y límites multiinstancia. PR-I1 no fusionado a main ni desplegado; no se
aplican migraciones remotas. Los apartados siguientes son historial confirmado.

Validación anterior a esta revisión humana: build exit 0 (27507 ms); competitivo 206/206 (13 suites, 27,859 s); completo 1087/1087
(102 suites, 88,364 s); PostgreSQL 192/192 en 12 archivos completos (354169 ms
del bloque, 367677 ms del runner); audit omit=dev cero vulnerabilidades y TLS
activo; diff --check exit 0 y 70 enlaces locales válidos. La auditoría conserva
los dos Jest iniciales con error de compilación de la prueba de versión y la
primera ejecución PG 191/192. La segunda demuestra el snapshot de actividad
retenido dentro de la transacción del harness y su refresco; el observador
independiente corrige la barrera sin aumentar tiempos ni relajar aserciones.
La cobertura nueva es del núcleo aislado con fixtures, no del replay deportivo.

## Historial — checkpoint 11 confirmado en 1c12245

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `7edef15`: diez checkpoints
confirmados, árbol limpio al iniciar. Ronda 11 local y sin commit: añade un
testigo PostgreSQL independiente post-COMMIT para R de partidas nuevas, sin
modificar CompetitiveService ni registrar TUG_MATCH. Los R originales y el
resultado deportivo se conservan; históricos/preparados anteriores no se
inscriben retroactivamente. La [auditoría vigente](PR_I1_TIRA_AFLOJA_AUDITORIA.md)
explica el contrato, recuperación, fail-closed y sus límites.

Un certificado exige otra conexión/XID, origen top-level confirmado, pareja
completa y observación PostgreSQL posterior a los locks antes del deadline.
COMMIT tardío del origen o falta de testigo a tiempo dejan R no certificable.
El COMMIT del propio certificado no se presenta como fecha del COMMIT de origen.
Sin certificados para **todos** los R originales, el futuro verificador deberá
bloquear el intento, sin recortar R y alterar C/R. Los certificados no acreditan
terminal/C/presencia/historial: replay y liquidación atómica del par permanecen
pendientes. No se autoriza activar/admitir/liquidar XP Tira, otros juegos o PR-I2.

Nueva dependencia local: [certificación de visibilidad](../prisma/migrations/20261003220000_tug_round_visibility/migration.sql),
posterior a las migraciones confirmadas de evidencia y presencia Tira. Aplicarla
con autorización/revisión antes del backend nuevo; no se ejecutan migraciones
remotas. Rol/RLS, presupuesto del pool adicional y durabilidad física WAL
productivos siguen pendientes; tmpfs local no los demuestra. Los 34 fallos
históricos y Rescate siguen abiertos. Todos los flags existentes siguen apagados
por defecto; no hay flag/admisión XP Tira ni fusión a main.

La revisión humana agrega certificación inmediata al COMMIT de responder,
aislamiento observable de errores del testigo y verificación de identidad de
base entre pools. Solo PT001 representa el deadline; otras violaciones de
integridad no se silencian. Se conserva R deportivo, sin elegibilidad si falta
certificado y sin error al cliente por fallo exclusivo del testigo tras COMMIT.
Véanse recorridos, límites y resultados nuevos en la auditoría vigente enlazada.

Revisión humana final: build exit 0 (18542 ms); competitivo 205/205, 12 suites
(18,497 s); completo 1086/1086, 101 suites (50,355 s); PostgreSQL 180/180,
11 archivos completos (306762 ms bloque / 318822 ms runner), cero fallos,
cancelados, omitidos o TODO. Audit omit=dev cero vulnerabilidades y TLS activo;
diff --check exit 0, 67 enlaces locales válidos. Se conservan un build fallido
por EPERM al generar Prisma mientras otro proceso lo usaba y un PostgreSQL
174/180 por deserialización void en el chequeo nuevo de identidad; la auditoría
documenta el ::text correctivo y los seis fallos, sin relajar pruebas/plazos.
Los catorce archivos locales se conservan; no hay commit ni migraciones remotas.

Validación previa a esta revisión: build exit 0 (17082 ms); competitivo 200/200, 12 suites
(8,117 s); completo 1081/1081, 101 suites (38,904 s). PostgreSQL 177/177,
11 archivos, 292302 ms del bloque y 303458 ms del runner, cero fallos,
cancelados, omitidos, TODO o archivos incompletos. Audit omit=dev cero
vulnerabilidades, TLS activo. La auditoría conserva las cuatro ejecuciones:
176/177 por inventario de permisos obsoleto, 177/177 con rechazo genérico
insuficiente para probar caída, 176/177 al exigir terminación real, y 177/177
tras demostrar SQLSTATE 42883 por PID bigint y corregirlo con ::integer.
No se ocultan fallos ni se presenta repetir hasta verde como corrección.
Git diff --check exit 0; 67 enlaces locales existen. Diez archivos modificados
y cuatro nuevos, sin commit. Branch/HEAD permanecen en la base 7edef15.
Los registros inferiores son historial y no validación de esta ronda.

## Historial — décima ronda, confirmada en 7edef15

Rama feat/pr-i1-competitive-infrastructure, HEAD 3d0e625: nueve checkpoints
confirmados. La ronda 10 agrega pruebas/auditoría, sin habilitar ni registrar XP
TUG_MATCH. CompetitiveService aún bloquea un participante antes del verificador;
Tira necesita el par ordenado antes de la partida. Se detiene el registro hasta
extender el contrato con liquidación atómica del par, validar terminal por replay
y certificar R. Véase [la auditoría vigente](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
No se cambian flags, fórmulas, integraciones existentes ni migraciones confirmadas.
Pruebas locales: ciclo per-user→par reproducido (40P01), kernel con clave común
y usuarios ordenados sin deadlock, y SET CONSTRAINTS anticipado permite COMMIT
tardío de R. No se confunde una prueba con marcadores con dos premios ledger
atómicos implementados. APROBADO: normal con R_A=R_B=0 da 0 XP para ambos sin
bonos; R inconsistente entre participantes o respuestas incompatibles bloquean
la futura liquidación y requieren registro del problema. EXPLICIT antes de
ACTIVA da 0 XP para ambos, sin penalización ni recompensa de ganador,
conservando el resultado deportivo. No implementa liquidación. WAL productivo,
rol/RLS, 34 fallos históricos y Rescate permanecen abiertos.
Revisión final: build exit 0; competitivo 194/194 (24,557 s), completo 1075/1075
(90,895 s); PostgreSQL 167/167, 10 archivos (los nueve anteriores más preflight),
254,588 s del bloque, 270,686 s del runner total; cero fallos/cancelados/omitidos/
TODO/incompletos. SQLSTATE 40P01 comprobado explícitamente en meta.code de
P2010 con Prisma 5.22, conservando también la aserción del mensaje.
Audit omit=dev 0 vulnerabilidades; diff --check exit 0. Sin verificador TUG
registrado, nuevas migraciones, activación XP, commit o despliegue.

## Historial — estado y validaciones del noveno checkpoint

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `a4d010b`: ocho checkpoints
confirmados en Git. Ronda 9 implementa presencia/gracia durable Tira localmente,
sin XP y SIN COMMIT. Diagnóstico de corte por timeout reproducido/corregido;
la base completa pasó 145/145. Ajuste definitivo de GRACE validado localmente: PostgreSQL 160/160, sin omisiones.
PR-I1 sigue abierto y **no fusionado a main**. Implementación
local no acredita despliegue/activación productiva; estas rondas no han aplicado
migraciones remotas. No se modifican Flutter, Usuario.xpTotal ni fórmulas V1.

Revisión humana de la ronda 9: runner endurecido para exigir resumen completo
y cero fallos/cancelados/omitidos/TODO, sin cambiar límites ni cobertura.
JWT sin exp mantiene compatibilidad con el verificador existente; el lease de
presencia sigue vigente solo 45 s renovables por observación autenticada.
Decisión definitiva: primera gracia confirmada vencida asigna victoria deportiva
al rival aunque esté UNKNOWN o en gracia posterior; igualdad exacta cancela con
dos abandonos. Meta/agotamiento anteriores y plazo global anterior o igual
prevalecen. Sin acciones aceptadas, futura recompensa del rival = 0 XP; todavía
no se calcula ni liquida XP TUG_MATCH. EXPLICIT conserva su contrato.
Véase [la revisión y evidencia de Tira](PR_I1_TIRA_AFLOJA_AUDITORIA.md).

### Tabla histórica de checkpoints

| Etapa | Commit / estado | Entrega |
|---|---|---|
| 1 | `08fa13b`, confirmado | Infraestructura común, ledger/balance, reglas V1 e institución histórica. |
| 2 | `76a8a47`, confirmado | Cima/Guardián/Rescate con admisión apagada por defecto. |
| 3 | `af78ee7`, confirmado | Auditoría y protección de frontera Trivia/Duelo, sin XP. |
| 4 | `16163b7`, confirmado | Snapshot, modalidad, fantasma fijo y evidencia/privacidad protegida, sin XP. |
| 5 | `88f7045`, confirmado | Presencia durable, gracia/reconexión y protección de acciones V1, sin XP. |
| 6 | `ebe40e3`, confirmado | Admisión, verificador común TRIVIA_ATTEMPT y liquidación/recuperación Trivia/Duelo; contrato estricto de fantasma. |
| 7 | `39d3881`, confirmado | Auditoría Tira, corrección de bloqueo/idempotencia legacy y pruebas de frontera; sin XP TUG_MATCH. |
| 8 | `a4d010b`, confirmado | Snapshot original y R durable Tira, guards SQL, privacidad/compatibilidad; sin admisión/verificador/XP TUG_MATCH. |
| 9 | `3d0e625`, confirmado | Presencia/gracia durable Tira y runner estricto. Decisión deportiva de rival UNKNOWN resuelta; sin XP TUG_MATCH. |
| 10 | `7edef15`, confirmado | Auditoría/pruebas de locks del par y brecha de visibilidad de R; verificador XP no registrado. |
| 11 | Local, sin commit | Testigo de visibilidad R post-COMMIT y evidencia append-only; sin verificador/admisión/XP TUG_MATCH. |

Cima/Guardián/Rescate y Trivia/Duelo están versionados.
Tira, Memoria y Batallas siguen sin integración competitiva; Memoria requiere
autoridad backend. No se avanza PR-I2. Las fórmulas puras de ocho juegos no
equivalen a ocho motores/verificadores integrados.

[Auditoría vigente de Tira](PR_I1_TIRA_AFLOJA_AUDITORIA.md): Qpartida confirmado,
precedencia durante gracia aprobada en el checkpoint 7. Snapshot/R están
confirmados en el checkpoint 8; presencia/cierre implementados localmente en la ronda 9, admisión/verificador XP siguen pendientes. No hay
flag competitivo Tira. Las reglas de gracia de 20 s inferiores
son de Trivia/Duelo, no se extrapolan a Tira (30 s).

### Habilitación durable Tira (octavo checkpoint confirmado)

R cuenta rondas efectivamente habilitadas por servidor, sin ACK, entrega ni
visualización demostrada. La transición privada SQL registra ambos participantes
atómicamente, con identidad/rol verificados, solo dentro de ventana vigente.
Distingue programadaEn, presentadaEn efectiva y registradaEn PostgreSQL. PK,
guards inmutables y constraint diferido impiden duplicados o habilitación parcial.
El constraint revalida el plazo al procesar COMMIT: un COMMIT solicitado tarde
revierte ambas filas. responder y el guard SQL refrescan límites tras bloqueos.
La función indica si insertó una pareja nueva y el servicio verifica su existencia
después del COMMIT: Prisma 5.22 puede resolver sin excepción tras un rechazo
diferido, por lo que esa promesa sola no acredita confirmación.
Respuestas V1 requieren la evidencia; abandono no la crea. Un worker tardío no
reconstruye rondas vencidas: sin habilitación oportuna no aumenta R. No se pausa
el reloj ni se promete puntualidad durante una caída. Véanse mecanismos, límites
de scheduler y orden de locks en [la auditoría Tira](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
La migración de evidencia Tira está confirmada e inalterada; la ronda 9 requiere
la migración incremental local [20261003160000_tug_presence](../prisma/migrations/20261003160000_tug_presence/migration.sql) antes del backend.
Presencia/gracia de 30 s implementadas localmente; admisión y liquidación continúan pendientes, sin XP.
La validación previa al COMMIT no certifica su instante físico de WAL/visibilidad;
la auditoría documenta esa limitación y la certificación posterior necesaria
antes de habilitar XP. No se atribuyen fechas ficticias de commit.

### Validación local de presencia Tira (ronda 9)

Revisión final con decisión GRACE: build exit 0; competitivo 178/178 (10 suites,
12,156 s); Jest completo 1059/1059 (99 suites, 58,435 s); PostgreSQL 160/160
(9 archivos secuenciales, 212,111 s del bloque; 224,284 s del runner completo,
sin fallos, cancelados, omisiones, TODO ni resúmenes incompletos/inválidos);
audit omit=dev cero vulnerabilidades con TLS activo. El detalle por archivo y
los resultados anteriores preservados están en la auditoría de Tira.
Cortes y fallos de fixtures quedan documentados en la auditoría Tira, junto con
su corrección y resultados, sin presentarlos como validaciones aprobadas.
El runner tiene límite existente 120 s por archivo y resumen agregado: ningún
fallo oculta las familias posteriores. Incidencias históricas/Rescate y WAL
siguen abiertas; la liquidación TUG futura debe resolver además los locks de
los dos participantes antes de habilitar su verificador/admisión XP.

### Reglas vigentes y flags

Trivia: half-up((70C+30M)/Q), Q congelado 10..30. M usa cada resultado definitivo
una vez, en orden original: fallo no final con segunda oportunidad no lo rompe;
fallo definitivo y salto sí. Duelo: half-up(80C/Q), comparando solo puntajes
verificados contra la referencia fija. Igual puntaje es empate sin desempates.

| Referencia | Resultado exigido | XP con C=Q=10 |
|---|---|---|
| `ghostId=null` | `outcome=null` | 80, solo base. |
| Fantasma presente | VICTORIA | 100. |
| Fantasma presente | EMPATE | 90. |
| Fantasma presente | DERROTA | 80. |

Toda combinación incompatible se rechaza antes de ledger/balance. No existen
resultados ficticios sin referencia. Ayudas oficiales de Trivia no invalidan
por sí solas la partida; Duelo conserva su restricción servidor de ayudas.

| Flag servidor | Nuevas admisiones | Valor por defecto |
|---|---|---|
| `COMPETITIVE_SOLO_ENABLED` | Cima/Guardián/Rescate | Apagado. |
| `COMPETITIVE_TRIVIA_ENABLED` | Trivia Rush | Apagado. |
| `COMPETITIVE_GHOST_ENABLED` | Duelo fantasma | Apagado. |
| `COMPETITIVE_TUG_ENABLED` | Solo admisión de nuevas búsquedas Tira; no habilita liquidación | Apagado. |

Solo el literal `true` habilita su grupo/modalidad. Apagarlos no detiene cierre,
reconciliación o liquidación de intentos ya admitidos. Sin admisión retroactiva
de históricos ni V1 preparados. Presencia OPEN autenticada con lease vigente
para acciones nuevas, reintentos exactos sin escritura, UNKNOWN sin abandono
inventado, gracia exacta de 20 s y reloj sin pausa/ampliación por reconexión.
EXPIRADO prevalece antes o exactamente al fin de gracia; terminales no se reabren.
Abandono demostrado aplica -10 en Trivia/Duelo, sin recompensa positiva parcial;
vencimiento normal produce resultado normal. TRIVIA_ATTEMPT es compartida y su
idempotencia impide pagar por dos modos. Temporada/membresía son las del terminal;
historial desconocido falla sin inventarlo.

### Migraciones y gate productivo

Orden y dependencias del esquema requerido:

1. [Base competitiva](../prisma/migrations/20260930120000_competitive_infrastructure/migration.sql), checkpoint 1.
2. [Runtime individual](../prisma/migrations/20260930180000_competitive_solo_runtime/migration.sql), checkpoint 2, depende de la base.
3. [Evidencia Trivia/Duelo](../prisma/migrations/20261001190000_trivia_authoritative_evidence/migration.sql), checkpoint 4.
4. [Presencia](../prisma/migrations/20261002190000_trivia_presence/migration.sql), checkpoint 5, depende de evidencia.
5. [Competitivo Trivia/Duelo](../prisma/migrations/20261002230000_trivia_competitive_v1/migration.sql), checkpoint 6, depende de base/evidencia/presencia.
6. [Evidencia Tira](../prisma/migrations/20261003010000_tug_authoritative_evidence/migration.sql), checkpoint 8 confirmado, requiere esquema legacy Tira; snapshot y R, sin liquidación XP.
7. [Presencia Tira](../prisma/migrations/20261003160000_tug_presence/migration.sql), checkpoint 9 confirmado; depende de evidencia.
8. [Testigo R](../prisma/migrations/20261003220000_tug_round_visibility/migration.sql), checkpoint 11 confirmado; depende de evidencia/presencia.
9. [Admisión Tira](../prisma/migrations/20261004010000_tug_competitive_admission/migration.sql), checkpoint 13 confirmado; conserva procedencia negativa e identidad.
10. [Autoridad temporal Tira](../prisma/migrations/20261004160000_tug_temporal_authority/migration.sql), checkpoint 16 confirmado en 795d6a3; requiere las anteriores. Sin backfill ni autorización de migración remota.

Incluso con flags apagados, el backend nuevo exige esquema compatible antes de
usar campos Prisma/recuperadores. Respaldo/revisión → verificar rol real de
DATABASE_URL y RLS (owner/BYPASSRLS o policy/grant privado), acceso backend y
denegación anon/authenticated → migración autorizada → comprobar esquema/guards →
backend con tres flags apagados → pruebas operativas → activación explícita.
Rol/RLS productivo **aún no verificado**; pruebas locales no lo confirman. RLS se
mantiene. Migraciones remotas no aplicadas por estas rondas; confirmadas intactas.

Siguen abiertas la incertidumbre histórica de los 34 fallos institucionales y
la incidencia intermitente de Rescate. [Auditoría y validaciones](PR_I1_TRIVIA_DUELO_AUDITORIA.md).
Navegación: [índice backend](README.md), [README API](../README.md).

## Historial de implementación y validación

Los registros siguientes describen su etapa, fecha/base. Expresiones anteriores
«sin verificador», «otros cinco pendientes» o «Docker bloqueado» no son el estado
vigente. Se preservan como evidencia, no como reglas activas. El resumen anterior
y las precisiones finales superan las propuestas o compatibilidades antiguas.

**Estado vigente — integración Trivia/Duelo sobre `88f7045`:** el propietario aprobó las dos precisiones y se implementan admisión explícita, verificador común TRIVIA_ATTEMPT y recuperación durable. `COMPETITIVE_TRIVIA_ENABLED` y `COMPETITIVE_GHOST_ENABLED` requieren exactamente `true` y están apagados por defecto; COMPETITIVE_SOLO_ENABLED no autoriza estas modalidades. Requiere la nueva migración incremental `20261002230000_trivia_competitive_v1` antes del backend. No hay activación en producción ni elegibilidad retroactiva. La parada de la revisión documental siguiente queda superada, conservándose su diagnóstico e historial.

**Decisiones aprobadas:** M usa únicamente resultados definitivos, en el orden original: fallo no final con segunda oportunidad no corta M; fallo final o salto sí. Cada pregunta cuenta una vez. Duelo compara exclusivamente puntajes servidor verificables: mayor/victoria, igual/empate, menor/derrota. Sin fantasma inicial válido no hay bono. El selector de mejor referencia mantiene sus criterios existentes; esos desempates no se aplican al resultado del duelo. Fórmulas y half-up V1 permanecen intactos. La implementación y validación de esta ronda se detallan al final de [la auditoría](PR_I1_TRIVIA_DUELO_AUDITORIA.md).

**Revisión previa detenida, historial sobre `88f7045` (2026-10-02):** evidencia inmutable y presencia de Trivia/Duelo disponibles; todavía sin admisión XP, verificador TRIVIA_ATTEMPT ni liquidación de estas modalidades. Antes de implementar pagos se solicitaron dos precisiones: si el fallo no final de segunda oportunidad corta M, y si igual puntaje en Duelo siempre significa empate o aplica desempate por aciertos/racha. La selección de mejor referencia no se adopta implícitamente como regla del bono. Véase «Auditoría de admisión y liquidación XP sobre 88f7045» en [la auditoría](PR_I1_TRIVIA_DUELO_AUDITORIA.md), con ejemplos de pagos distintos y fuentes concretas. No hay respuesta asumida, verificadores simulados, migraciones nuevas ni cambios runtime; no se paga retroactivamente a los intentos preparados. Las fórmulas V1 siguen aprobadas e intactas.

Validación de esta base: build exit 0; competitivo 118/118 (5 suites); Jest completo 996/996 (94 suites); PostgreSQL local independiente 104/104, 54 migraciones confirmadas; audit omit=dev cero vulnerabilidades y TLS activo. Docker desktop-linux/29.7.2 operativo, postgres-local existente intacto. La incertidumbre histórica de los 34 fallos y la incidencia intermitente de Rescate permanecen abiertas. Las secciones anteriores de estado se conservan debajo como historial, no como diagnóstico actual de Docker o de ausencia de snapshots/presencia. Sin commit, push, merge, despliegue ni migraciones remotas; pendiente revisión humana y resolución de las dos precisiones.

Estado de presencia, base `16163b7`: el propietario aprobó vencimiento normal prioritario cuando su plazo es anterior o igual al fin de gracia. La continuación implementa canal `/trivia-presence`, presencia privada PostgreSQL, gracia de 20 s y reconciliador para **nuevos** intentos explícitos V1; continúa sin XP. Migración incremental `20261002190000_trivia_presence`, pendiente de revisión/aplicación autorizada antes del backend. Los intentos anteriores conservan presenciaVersion=null. Caída del observador produce incertidumbre, no abandono inventado. Véase «Implementación de presencia durable» en [la auditoría](PR_I1_TRIVIA_DUELO_AUDITORIA.md); la auditoría anterior se conserva como historial y su bloqueo de precedencia queda resuelto. Los tres juegos individuales y sus verificadores permanecen intactos.

**Gate de validación abierto:** build/Jest pasan; una ejecución posterior PostgreSQL produjo 34 fallos de cobertura institucional tras pasadas verdes. La causa sigue sin demostrar y la repetición diagnóstica está bloqueada por el arranque local de Docker (`sailor-ingest.sock`). No se declara listo este checkpoint ni se ocultan esos fallos. La última sección de la auditoría conserva resultados, límites y siguiente verificación necesaria.

Etapa posterior a `af78ee7`: se preparan snapshots inmutables, modalidad explícita y referencia inicial de Trivia/Duelo, con bloqueos e idempotencia reforzados. **No se habilita XP ni se añaden verificadores**; TRIVIA_ATTEMPT continúa rechazado. Véase la sección «Primera etapa autoritativa» de [la auditoría](PR_I1_TRIVIA_DUELO_AUDITORIA.md) para el contrato opcional, la nueva migración y los límites. El flag de los tres individuales no habilita estos juegos.

Revisión posterior al checkpoint `76a8a47`: la [auditoría de Trivia Rush y Duelo fantasma](PR_I1_TRIVIA_DUELO_AUDITORIA.md) detecta evidencia temporal/snapshot insuficiente y falta de modo/fantasma inicial persistido. Conforme a la condición de parada de la petición, ambos siguen sin integración competitiva. Esta revisión añade documentación y pruebas de rechazo seguro, y corrige la deserialización `void` del advisory lock legacy de Trivia detectada en PostgreSQL; no registra nuevos verificadores ni modifica fórmulas o migraciones. Las secciones siguientes conservan el historial de la implementación de los tres individuales.

Estado: infraestructura común y primera integración de **SUMMIT, GUARDIAN y STAR_RESCUE** implementadas para revisión; **PR-I1 sigue abierto**. Los tres módulos de juego importan `CompetitiveModule`, que registra sus verificadores reales y un reconciliador común. No hay endpoint genérico de XP. Los otros cinco juegos siguen sin integración. Código y nueva migración de esta ronda no desplegados; Flutter no se modifica.

Autoridad de producto: `saber_plus/docs/PLAN_MAESTRO_COMPETITIVO.md` y sección 12 de `saber_plus/docs/PR_I1_AUDITORIA_FORMULAS.md`, Flutter `main` `6903816`. La petición de implementación de esta ronda sustituye la anterior parada documental. Backend inicial: `feat/pr-i1-competitive-infrastructure`, `fb27225d96376c3867418d9f5a1a53030d2256c0`. No se modifican Flutter, dependencias ni `Usuario.xpTotal`.

La ronda de integración parte del checkpoint **08fa13b4093a237ab168b519c293c45a67d1d8fc**, misma rama, working tree inicialmente limpio. La migración base competitiva versionada se conserva intacta.

## Integración individual: activación y autoridad

La admisión de **nuevos** intentos competitivos requiere además `COMPETITIVE_SOLO_ENABLED=true` en el entorno del backend. La comprobación está centralizada en `competitive.activation.ts`, compartida por los tres servicios. Ausencia, `false` o cualquier valor distinto del literal `true` deshabilitan la creación; devuelve HTTP 403 con código `COMPETITIVE_SOLO_DISABLED`, sin crear un intento. `.env.example` declara false. Flutter no configura este valor ni puede sustituirlo mediante el payload.

El gate se evalúa después de recuperar un intento activo compatible y antes de seleccionar el banco/crear uno nuevo. Por ello apagarlo no modifica registros existentes ni impide continuar un competitivo previamente aceptado, incluso si el cliente repite `competitive:true` al recuperarlo. Tampoco se consulta en respuestas, abandono, verificación, liquidación o reconciliación. Los intentos legacy siguen funcionando y el flag habilitado no omite elegibilidad, snapshots, locks ni validaciones. No habilita los otros cinco juegos ni cambia XP V1. Un cambio del entorno operativo requiere reiniciar/recrear las instancias según el mecanismo de despliegue; no existe un endpoint para modificarlo.

### Compatibilidad y orden seguro de despliegue

**El flag no hace compatible este backend con un esquema anterior.** Prisma lee los campos nuevos incluso en operaciones legacy y el reconciliador consulta las tablas al arrancar. Deben estar aplicadas tanto `20260930120000_competitive_infrastructure` como `20260930180000_competitive_solo_runtime` antes de ejecutar este backend. No se añade fallback a un esquema viejo ni se interpreta un error de esquema como cero XP o cola vacía. Las operaciones propagan errores de Prisma; el worker registra explícitamente `COMPETITIVE_SCHEMA_MISSING` para tablas/columnas ausentes (P2021/P2022 y SQL 42P01/42703 mediante P2010), y conserva los pendientes para reintento. Un arranque HTTP por sí solo no demuestra compatibilidad del esquema.

Orden obligatorio para un despliegue futuro autorizado:

1. Respaldo verificable y revisión de migraciones, retención de evidencia, locks y plan de reversión. La nueva migración es aditiva para el cliente Prisma anterior, pero habilita RLS en Guardián y restringe escrituras competitivas; no asumir compatibilidad de permisos sin comprobarla.
2. Verificar rol PostgreSQL efectivo del backend y gate RLS descrito en este informe, incluidos intentos, ledger, balance, historial y triggers. Sigue sin evidencia de producción.
3. Aplicar **con autorización** las migraciones pendientes compatibles, respetando el orden base → runtime individual, antes del nuevo backend. No ejecutar `db push` como sustituto ni editar migraciones aplicadas.
4. Verificar historial de migraciones, columnas/tipos/defaults, índices, constraints/triggers y permisos reales. Comprobar acceso del backend y denegación de anon/authenticated. Resolver cualquier esquema faltante antes de continuar.
5. Desplegar backend con `COMPETITIVE_SOLO_ENABLED=false` explícito en todas las instancias. El worker debe ejecutarse también con el flag apagado.
6. Realizar pruebas operativas autorizadas: creación/continuación legacy, rechazo de nuevos competitivos, salud de consultas/reconciliación, ausencia de errores de esquema y recuperación de intentos ya aceptados donde existan. Las pruebas positivas de activación se validan antes en un entorno autorizado y aislado.
7. Solo después de revisar los resultados, activar explícitamente `COMPETITIVE_SOLO_ENABLED=true`. Apagarlo posteriormente bloquea nuevas admisiones; deja activos cierre y recuperación. No revertir/eliminar esquema o evidencia mientras haya intentos pendientes.

Esta ronda solo prueba PostgreSQL local desechable; no aplica migraciones remotas ni confirma el rol de producción.

Los POST existentes de creación de Cima, Guardián y Rescate aceptan ahora `competitive?: boolean`. Omitirlo al crear un intento, o enviar false, conserva el modo no competitivo. Solo true permite solicitar un intento competitivo; el servidor verifica ESTUDIANTE y construye un snapshot completo con preguntas publicadas. El flag no admite strings/números coercionados aunque la configuración global de validación convierta tipos. No se aceptan XP, victoria, métricas finales, institución, temporada, snapshot ni fecha de inicio del cliente.

No existe importación de partidas offline: el inicio competitivo es una llamada autenticada online que crea un intento vacío con ID, configuración, snapshot y reloj servidor. Una partida local/práctica anterior no puede convertirse mediante este campo ni cargar sus resultados históricos. La desconexión posterior a un inicio online no invalida la sesión recuperable de 24 h. No se añade heartbeat.

`competitiveRulesVersion` es null para todos los intentos previos y para los nuevos legacy/práctica. Es 1 únicamente en nuevos inicios competitivos autorizados. Es inmutable, incluso al intentar promover un registro legacy por SQL. Si ya hay un intento activo, un cambio explícito de modo produce conflicto; omitir el campo al recuperar conserva el modo del intento existente. El estado público incorpora únicamente el booleano `competitive`, sin ledger, hashes, marcas internas de cola ni datos institucionales. Se mantiene la revisión pedagógica ya existente de respuestas respondidas de Guardián; no se añaden soluciones futuras ni evidencia competitiva privada.

`SoloCompetitiveVerifier` tiene tres instancias registradas para SUMMIT_ATTEMPT, GUARDIAN_ATTEMPT y STAR_RESCUE_ATTEMPT. Lee y bloquea el intento dentro de la transacción de `CompetitiveService`; verifica propiedad, origen competitivo V1, versión del motor, fecha y estado terminal, plazo de 24 h, tamaño/configuración del snapshot, preguntas/opciones únicas y secuencia de respuestas. Recalcula cada acierto comparando opción aceptada y solución privada del snapshot; comprueba el booleano persistido, deduplica claves y rechaza respuestas posteriores al resultado terminal. Los motores existentes reconstruyen altura máxima, escudos, estrellas y constelaciones. No consulta el banco actual para sustituir el snapshot.

La liquidación normal y el abandono usan las reglas V1 existentes. Abandono explícito o caducidad definitiva generan nominal -10 sin premio parcial; el balance aplica piso cero. Una caducidad competitiva usa `finalizadoEn = venceEn`, el plazo servidor definitivo, aunque se detecte más tarde; así no cambia temporada/institución por demorar el reinicio. Los intentos legacy conservan su comportamiento previo de caducidad. Un microcorte no cierra ninguno de estos tres juegos.

## Recuperación durable y nueva migración

Nueva migración **`20260930180000_competitive_solo_runtime`**, posterior a la base; añade a IntentoCima, IntentoGuardian e IntentoRescateEstrellas:

| Campo | Significado |
|---|---|
| competitiveRulesVersion nullable | null = no competitivo; 1 = nuevo intento competitivo online autorizado. |
| competitiveSettledAt nullable | Acuse de ledger confirmado; null mantiene trabajo pendiente. |
| competitiveRetryAt | Momento del siguiente intento de reconciliación; permite posponer errores sin bloquear las demás partidas. |

La propia fila del intento es la cola durable: `competitiveRulesVersion=1`, acuse null y estado terminal, o estado ACTIVO con plazo vencido. No se necesita otra outbox porque el resultado terminal y la evidencia se escriben en esa misma fila/transacción. No se depende de un callback ni de que el cliente vuelva a consultar.

`CompetitiveReconciler` se inicia con el módulo Nest: escanea al arrancar y cada **30 segundos**, hasta 25 candidatos por juego en cada pasada. Los escaneos se excluyen dentro de un proceso y la idempotencia/locks de PostgreSQL protegen entre procesos. Cierra sesiones vencidas bajo lock y llama al servicio de liquidación fuera de esa transacción. Tras un fallo, conserva el pendiente, registra un código de error seguro y pospone un minuto su próximo intento. Una caída de DB no elimina pendientes ni detiene futuras pasadas. El apagado cancela el temporizador y espera la pasada activa.

Casos de caída:

1. **Antes de persistir cierre:** se revierte la transacción; el intento sigue recuperable o el reconciliador lo vence después de su plazo.
2. **Cierre persistido, sin ledger:** la fila terminal conserva acuse null; otro proceso/pasada la detecta y liquida.
3. **Ledger confirmado, sin acuse:** el siguiente intento devuelve el mismo evento por identidad fuente/participante, sin volver a incrementar saldo/secuencia; después escribe el acuse.
4. **Evidencia o historial insuficientes:** no se acredita ni se usa institución actual como sustituto. El intento continúa pendiente con reintento diferido. Una inconsistencia permanente necesita revisión operativa; el reconciliador no falsifica evidencia ni reescribe un terminal inmutable.

Los constraints/triggers nuevos conservan modo, configuración, snapshot, propietario, fechas de inicio/plazo y versión; respuestas solo se agregan al final, de una en una. Un terminal no puede alterar resultado/respuestas/fecha. Se prohíbe eliminar evidencia competitiva y marcar liquidación sin ledger correspondiente. Los CHECK exigen V1, ventana exacta de 24 h, fechas/estado coherentes y acuse solo para competitivos terminales. Se conservan los constraints existentes de un único intento activo y banco/tamaño de cada motor. Se añaden tres índices de búsqueda por versión/acuse/reintento.

RLS de los snapshots se conserva y se habilita también en Guardián; se revocan permisos públicos/anon/authenticated para las tres tablas. El gate de rol efectivo de producción descrito más abajo sigue pendiente y ahora comprende también las tablas de intentos y el SELECT del ledger que realiza el trigger del acuse. No se ejecutó ninguna migración remota.

### Orden de locks

Los servicios conservan su advisory lock por juego/usuario para las operaciones existentes, y después bloquean Usuario y revalidan ESTUDIANTE dentro de la transacción, antes de leer/modificar el intento. Guardián conserva además su rechazo temprano y añade la comprobación transaccional. La recuperación adquiere Usuario → intento; la liquidación adquiere identidad idempotente → Usuario → intento → balance. Ningún verificador/reconciliador solicita el advisory de juego después de bloquear Usuario. El acuse solo modifica el intento y no adquiere después un lock de usuario. No se llama a `settle` desde una transacción de respuesta/cierre, evitando inversión de locks.

La fecha normal de cierre se fija dentro de la transacción que mantiene bloqueado Usuario, serializando frente a cambios institucionales. Las respuestas tardías compiten con la caducidad bajo ese mismo lock y no se aceptan después del plazo. Las pruebas usan PostgreSQL real para respuestas/reintentos/caducidad/liquidaciones concurrentes.

### Alcance y límites de esta integración

"Integrado" significa que un nuevo intento online con opt-in servidor puede recorrer creación → snapshot/respuestas persistidos → cierre → verificador real → ledger/balance y recuperarse tras reiniciar sin volver a pagar. No significa desplegado ni activado desde Flutter, que aún omite el opt-in. La liquidación es eventual; requiere al menos una instancia backend ejecutándose y los permisos/migraciones correctos. Los lotes de 25 y reintentos son parámetros operativos, no límites de recompensa. No se agrega UI, ranking ni endpoint público para inspeccionar pendientes. PR-I1 continúa abierto.

## Motor puro V1

`src/competitive/competitive.rules.ts` define los ocho IDs estables y `XP_RULES_VERSION = 1`. Las fórmulas no consultan Prisma, no usan azar y rechazan evidencia inválida. `roundHalfUp(x) = floor(x + 0.5)` tiene pruebas explícitas; `roundRatio` usa enteros y BigInt para calcular el mismo half-up en fracciones sin errores intermedios de coma flotante. Solo se redondea en los puntos aprobados.

| ID | Cálculo normal V1 |
|---|---|
| TRIVIA_RUSH | half-up((70C + 30M) / Q), Q entero 10..30, M verificable ≤ C ≤ Q. |
| GHOST_DUEL | half-up(80C/Q) + 20/10/0 por victoria/empate/derrota; sin referencia exige outcome=null y bono 0; con referencia exige resultado válido. Exige modo separado, referencia inicial inmutable y configuración compatible. |
| SUMMIT | 15H + 25V, altura máxima 0..5; sin velocidad ni preguntas sobrantes. |
| TUG_OF_WAR | half-up(60C/R) + 40/20/0; R=0 da 0. No paga rondas favorables ni terreno. |
| GUARDIAN | 10C + V(10 + 10E); invariantes del motor actual: 6 aciertos ganan, 3 errores agotan escudos, 8 preguntas. |
| MEMORY_MATCH | Función futura: 5P + half-up(50P/(Mov+A)); P=6/8/10, parejas completas, Mov≥P, pistas legales reducen eficiencia. **Liquidación bloqueada**. |
| BATTLES | half-up(B C/Q), B=100/75/50, Q=8/8/10 por Carrera/Duelo Relámpago/Supervivencia. C=0 da 0; banco incompleto se rechaza. |
| STAR_RESCUE | 10S + 10K + 20V, S≤6, K=floor(S/3)≤2. |

Máximo normal: 100. Memoria perfecta sin ayudas: 80/90/100; su función pura no habilita acreditaciones. El servicio rechaza `MEMORY_ATTEMPT` y `MEMORY_MATCH`, y la migración incorpora un CHECK que impide eventos de Memoria incluso por escritura directa o corrección. Habilitarla requerirá autoridad backend y una migración explícita posterior.

Los límites terminales se contrastaron con `guardian.rules.ts`, `summit.rules.ts`, `star-rescue.rules.ts` y la configuración actual de Tira (máximo 20 preguntas, snapshot de 4..20 para abandono). La aritmética no sustituye la validación del resultado terminal por el adaptador.

## Frontera de confianza

`CompetitiveService.settle` recibe **solo** una referencia tipada (`sourceType`, `sourceId`, `participantId`) y versión; nunca recibe XP ni hechos desde un DTO HTTP. `CompetitiveVerifierRegistry` exige un adaptador registrado; sin él falla con `SOURCE_NOT_INTEGRATED` antes de iniciar escrituras.

`CompetitiveVerifier.loadTerminal` deberá leer evidencia servidor persistida dentro de la transacción proporcionada, serializar frente a cambios del origen y reconstruir `VerifiedTerminal`. El contrato es interno, no una vía para aceptar booleanos o timestamps del cliente. Debe validar:

- Propiedad y participación del usuario, origen online competitivo y resultado terminal definitivo.
- Snapshot inmutable completo, configuración y bancos suficientes. Trivia/Duelo: Q=10..30 sin relleno después de iniciar. Duelo: modo y fantasma fijados al inicio.
- Respuestas aceptadas y aciertos, métricas derivadas y hash de la evidencia autoritativa. Conservar el origen necesario para replay y detección de conflictos.
- R de Tira: una ronda cuenta una vez al estar activa, tener pregunta fijada y quedar disponible a ese jugador; no se duplica por retry/reconexión. Una no respondida sí cuenta; una cancelada antes de activar no cuenta.
- Prioridad del abandono definitivo sobre rendimiento parcial, y ambos ausentes sin ganador ni premio positivo. Una partida larga u oscilante no es fraude por sí misma.
- Plazos y presencia durable: no basta un socket desconectado, heartbeat o afirmación del rival. Retener rival, rondas, movimientos, respuestas, resultado, duración y abandono en evidencia privada del origen para análisis futuro.

Los adaptadores deben usar un orden de locks compatible: usuario/rol y después origen, sin adquirirlos en orden inverso desde cierres del juego. Deben serializar el timestamp terminal con cambios de membresía sobre el mismo usuario. Solo los tres verificadores individuales descritos arriba se registran ahora. Los adaptadores sintéticos de pruebas de infraestructura permanecen exclusivos del PostgreSQL desechable; no se incluyen en el módulo de producción.

## Persistencia, transacciones e idempotencia

Migración: `prisma/migrations/20260930120000_competitive_infrastructure/migration.sql`, transaccional (`BEGIN`/`COMMIT`). Crea:

- `EventoXpCompetitivo`: ledger append-only con usuario, juego, temporada, versión de reglas, tipo, nominal/aplicado, saldos antes/después, secuencia, fuente, clave/hash, institución histórica nullable, fechas UTC, estado `APLICADO`, motivo/actor/referencia de corrección y metadata mínima.
- `BalanceCompetitivo`: proyección por PK usuario+juego+temporada; XP, `alcanzadoEn`, `updatedAt`, versión monotónica. No hay balance competitivo general independiente; posteriormente se podrá sumar por juegos.
- `HistorialInstitucionCompetitiva`: snapshots append-only de pertenencia, incluido null, con timestamp y desempate por ID.
- Enums: `JuegoCompetitivo` (8), `FuenteXpCompetitivo` (7 familias), `TipoEventoXpCompetitivo` (resultado, abandono, victoria por abandono, corrección), `EstadoEventoXpCompetitivo` (`APLICADO`). `INVALIDACION` fue retirado antes del despliegue; no es una capacidad activa.

La liquidación usa PostgreSQL `READ COMMITTED`, advisory locks **transaccionales** para la identidad y el balance, y locks de fila. No depende de mutexes en memoria:

1. Bloquear identidad estable de liquidación y consultar evento previo.
2. Bloquear fila de usuario y verificar `ESTUDIANTE`; leer/verificar evidencia mediante el adaptador.
3. Comparar hash canónico: retry idéntico devuelve el evento; evidencia incompatible produce `IDEMPOTENCY_CONFLICT`.
4. Resolver reglas, temporada y membresía histórica; serializar/crear/bloquear el balance y leer saldo previo.
5. Calcular nominal y `deltaAplicado = max(deltaNominal, -saldoAntes)`; insertar evento y actualizar proyección con secuencia +1 en la misma transacción.
6. Usar reloj de PostgreSQL para fecha de registro/aplicación. Actualizar `alcanzadoEn` solo si delta aplicado != 0; un evento nuevo de delta cero sí incrementa secuencia. Commit conjunto; cualquier fallo revierte todo.

La identidad normal es fuente+sourceId+participante+`SETTLEMENT`; no contiene `xpRulesVersion`, juego ni tipo de desenlace. Todos los desenlaces de una misma fuente compiten por esa identidad. Trivia y Duelo comparten `TRIVIA_ATTEMPT`: renombrar el juego no permite cobrar nuevamente el mismo intento. Los UUID de participante, operación de corrección, actor y evento original se normalizan a minúsculas, coherentemente con la identidad UUID de PostgreSQL. Versión distinta de 1 se rechaza en esta ronda; una futura V2 debe mantener esa identidad y la unicidad DB. No hay pago parcial previo a abandono.

La secuencia y los saldos permiten reconstruir la proyección recorriendo `deltaAplicado`; el nominal de penalización es determinista, mientras el aplicado depende del saldo previo auditado. La fila de usuario también serializa liquidaciones del mismo estudiante entre juegos: es una opción conservadora de concurrencia, no una promesa de rendimiento a gran escala. Los fallos transaccionales pueden reintentarse con la misma identidad.

## Constraints, índices y privacidad

Además de tipos, NOT NULL y FK restrictivas:

- Unicidad de clave idempotente y fuente+sourceId+usuario+liquidación; no incluye versión de reglas.
- Unicidad usuario+juego+temporada+secuencia; PK del balance por usuario+juego+temporada.
- CHECK de piso cero, secuencia/versión, nominal/aplicado/saldos, temporada Bogotá, hash, compatibilidad fuente/juego, topes de recompensas, nominal de abandono y referencias/motivo de corrección.
- Triggers impiden UPDATE, DELETE y TRUNCATE del ledger y del historial. Una corrección no cambia el estado ni borra el evento original.
- Índices de juego+temporada en ledger/balance, institución+temporada, fecha efectiva, evento corregido y usuario+desde+id en historial. Los índices únicos ya cubren consultas por usuario/juego/temporada, fuente y secuencia; no se duplican. `estado` tiene un solo valor en esta ronda y no requiere índice independiente.
- RLS habilitado y privilegios revocados a PUBLIC, `anon` y `authenticated` (si existen), incluida la secuencia del historial. El rol backend debe ser propietario o tener los permisos/política privada adecuados; no conceder acceso de clientes a estas tablas.

Institución/actor históricos no tienen FK a entidades actuales que puedan desaparecer. Usuario y evento original sí tienen FK restrictiva: no se puede eliminar físicamente un usuario con auditoría competitiva sin diseñar antes la conservación/anonimización correspondiente. No se altera ahora ningún flujo de borrado ni se borra historial para eludir la restricción.

No hay API pública competitiva nueva. El resultado del servicio contiene IDs internos y es **interno**; una futura API necesitará su propia proyección pública. Metadata del ledger contiene solo `{ evidenceContract: 1 }`, no respuestas, correo, nombre privado, diagnóstico ni progreso. El hash no reemplaza la conservación privada del origen.

## Temporada e institución histórica

`competitiveSeason` usa `America/Bogota` sobre la fecha terminal autoritativa; no usa fecha de liquidación ni del dispositivo. A las `05:00:00Z` del 1 de enero comienza el año Bogotá. Una partida que cruza año se atribuye íntegramente al año de su cierre. Los timestamps se almacenan como `timestamptz(3)`.

La membresía estudiantil actual reside en `Usuario.institucionId`; los flujos existentes pueden cambiarla desde registro/importación, administración y membresías. Un trigger sobre INSERT/UPDATE de esa columna conserva los cambios, incluidos los realizados mediante relaciones Prisma, sin reescribir todos esos módulos ni implementar PR-I5. El historial usa el reloj DB; cambios sin variación no generan entradas. El índice `(usuarioId, desde, id)` permite resolver el último snapshot válido en el instante terminal.

La migración bloquea cambios concurrentes durante activación y registra la pertenencia **desde ese momento**, nunca desde la creación histórica del usuario. Sin snapshot anterior o igual al cierre, la liquidación falla con `HISTORICAL_MEMBERSHIP_UNKNOWN`; no consulta el valor actual como sustituto. Un snapshot explícito null permite XP individual sin institución. Cambiar de institución no mueve eventos anteriores. El backend de integración debe conservar el orden temporal de los cierres y cambios de membresía bajo lock; la precisión persistida es milisegundos, con desempate del historial por ID.

## Correcciones

`CompetitiveService.correct` es un método de dominio interno; exige actor ADMIN validado dentro de transacción, motivo no vacío, UUID de operación y evento original existente. No hay panel ni endpoint nuevo.

Una corrección administrativa explícita positiva o negativa crea un evento nuevo. Respeta piso cero, verifica idempotencia/hash, incrementa secuencia y actualiza fecha de alcance si afecta saldo. Conserva juego, fuente, temporada, institución y fecha efectiva del original; la fecha de registro refleja la aplicación real. Nunca transfiere XP a la institución actual. No se interpreta como retirar el evento original ni reconstruir su historia.

**Revisión previa al checkpoint: opción A.** `INVALIDACION` se elimina del tipo TypeScript y del enum Prisma/SQL de esta migración aún no desplegada. `correct` rechaza también llamadas dinámicas con ese kind (`UNSUPPORTED_CORRECTION_KIND`), y PostgreSQL rechaza el valor del enum. No se implementa replay ahora. Una invalidación futura requiere semántica de reconstrucción, dependencias posteriores y migración explícita.

Contraejemplo confirmado: `+40, -50, +20` produce saldo 20; añadir `-40` deja 0, pero el replay sin el primer `+40` da 20. El piso hace que el inverso del premio no sea la invalidación. El -50 es un ejemplo aritmético, **no** una penalización de abandono V1 aprobada. Las pruebas puras verifican esa diferencia, y PostgreSQL comprueba que intentar invalidar no modifica el saldo ni añade eventos. La antigua capacidad de invalidación mediante nominal negativo queda descartada.

## Abandono y reconexión

Nominal -10 para Trivia, Duelo, Cima, Guardián, Rescate y Memoria futura; -15 para Tira/Batallas. Sin penalización creciente. El piso se aplica por balance de usuario/juego/temporada. Ejemplo: saldo 6, nominal -10, aplicado -6, saldo 0; en saldo 0 el aplicado es 0 y no cambia `alcanzadoEn`.

Victoria por abandono es un tipo separado para Tira/Batallas. Exige partida activa competitiva, participantes válidos, abandono definitivo y evidencia suficiente. Sin respuesta competitiva aceptada: 0. Con al menos una: `min(80, half-up(60C/Q) + 20)`, Q es **Qpartida completo** en Tira y banco 8/10 en Batallas. No usa R en abandono de Tira. Una respuesta incorrecta aceptada es acción; ready/pantalla/heartbeat no lo son. Ambos ausentes: el servicio rechaza crear una victoria (`NO_WINNER`); cada abandono se liquida con su propia evidencia e identidad.

`competitive.policy.ts` contiene funciones puras para ausencia definitiva y presencia suficiente de Tira. No simula almacenamiento de presencia ni ejecuta un temporizador. Para Tira exige gracia rival vencida, restante fuera de su propia gracia y presencia autenticada posterior a la desconexión rival. Batallas no requiere heartbeat: respuesta competitiva aceptada tras activación y plazo asíncrono. Los adaptadores deben aplicar estas políticas al estado durable y resolver carreras entre reconexión, vencimiento y resultado.

| Juego | Reconexión configurada |
|---|---|
| Trivia / Duelo | 20 s, reloj continúa. |
| Tira | 30 s. |
| Cima / Guardián / Rescate | Ventana de sesión 24 h desde plazo original, no renovada por reconexión. |
| Batallas | 24 h asíncronas, sin conexión continua. |
| Memoria futura | 24 h cuando tenga sesión autoritativa. |

## Juegos y trabajo real restante

### Auditoría de fuentes e identidad previa al checkpoint

`competitive.source.ts` enumera explícitamente los contratos comprobados en `prisma/schema.prisma`. No se normalizan identificadores arbitrarios por semejanza con UUID.

| Fuente | Modelo/campo real (línea del schema en checkpoint 08fa13b) | Representación aceptada/canónica |
|---|---|---|
| TRIVIA_ATTEMPT | `IntentoTriviaRush.id`, 1081; `@db.Uuid`, `uuid_generate_v4()` | UUID estándar 8-4-4-4-12; minúsculas antes de lock/hash/consulta. Trivia y Duelo comparten fuente. |
| SUMMIT_ATTEMPT | `IntentoCima.id`, 1370; `@db.Uuid`, `uuid()` | Igual. |
| TUG_MATCH | `PartidaTiraAfloja.id`, 976; `@db.Uuid`, `uuid_generate_v4()` | Igual; no confundir con código de invitación. |
| GUARDIAN_ATTEMPT | `IntentoGuardian.id`, 1351; `@db.Uuid`, `uuid()` | Igual. |
| BATTLE | `Batalla.id`, 821; `@db.Uuid`, `uuid_generate_v4()` | Igual; `codigoInvitacion` no es la PK de liquidación. |
| STAR_RESCUE_ATTEMPT | `IntentoRescateEstrellas.id`, 1390; `@db.Uuid`, `uuid()` | Igual. |
| MEMORY_ATTEMPT | No existe modelo/intento servidor de Memoria | Sin contrato canónico aprobado; siempre bloqueado, sin convertir identificadores locales a UUID. |

Las líneas señalan el campo ID en el schema del checkpoint 08fa13b; el nombre de modelo/campo es la referencia estable. UUID compacto, con llaves, espacios o guiones alternativos se rechaza, aunque PostgreSQL pueda aceptar algunas variantes como UUID. Nunca se usa su texto sin normalizar para crear otra identidad. El CHECK SQL de `sourceId` exige representación UUID estándar en minúsculas para las fuentes actualmente habilitables; Memoria permanece prohibida por su propio CHECK. Las pruebas cubren las seis familias, retry concurrente con mayúsculas/minúsculas, alternativas rechazadas y escritura directa no canónica rechazada.

### Auditoría completa de pertenencia institucional actual

Se buscaron todas las escrituras Prisma sobre usuario/membresía, relaciones anidadas y referencias SQL en runtime, scripts y utilidades del repositorio. Resultado: **no se encontró un flujo actual que cambie la institución efectiva en `MiembroInstitucion` sin sincronizar `Usuario.institucionId`**. No fue necesario cambiar servicios institucionales ni implementar PR-I5. Esta conclusión describe los flujos versionados; no certifica la consistencia de datos de producción ni escrituras manuales externas.

`MiembroInstitucion` (`schema.prisma`, modelo y enum `RolMembresiaInstitucion`) representa el equipo: PROPIETARIO, ADMINISTRADOR y PROFESOR. No tiene rol ESTUDIANTE ni estado de suspensión de membresía. La pertenencia estudiantil está en `Usuario.institucionId`; pertenecer a un grupo (`ClaseEstudiante`) es otra relación.

| Flujo auditado | Evidencia concreta, relativa a `backend/src` | Efecto sobre pertenencia/historial |
|---|---|---|
| Registro individual | `auth/auth.service.ts:83`, `registrarCuenta` | Crea Usuario sin institución; trigger registra null desde el alta. |
| Alta institucional de estudiante | `institucion/estudiante.service.ts:94`, `crearEstudianteEnMiInstitucion` | `usuario.create` con institucionId, dentro de transacción; sin MiembroInstitucion docente. |
| Incorporar estudiante existente | Mismo archivo, `agregarEstudianteExistenteAMiInstitucion`, update en 172 | Actualiza Usuario; rechaza pertenencia a otra institución. |
| Importación CSV | `institucion/estudiante-import.service.ts:217` | Crea cada Usuario con institucionId dentro de transacción; no mueve cuentas existentes. |
| Ingreso por código de grupo | `institucion/vinculacion-grupo.service.ts:195`, `aceptarIngreso` | `usuario.updateMany` condicionado a institución null/igual, seguido de inscripción en la misma transacción. |
| Añadir/quitar estudiante de grupo | `institucion/grupo.service.ts:220` y `:267` | Añadir exige misma institución; quitar elimina solo ClaseEstudiante, no pertenencia institucional. El historial no debe registrar una salida institucional ficticia. |
| Crear institución, vía legado | `institucion/institucion.service.ts:86` y `:103` | `Institucion.create` con `Usuario.connect` actualiza la FK real; crea MiembroInstitucion en la misma transacción. Probado con trigger real. |
| Aprobar alta institucional | `institucion/institution-approval.service.ts:352` y `:358` | Actualiza Usuario profesor null→institución y crea propietario en una transacción. |
| Aprobar solicitud de ingreso | `institucion/administracion-institucion.service.ts:159` y `:172` | Actualiza Usuario profesor y crea membresía conjuntamente. Rechazar/cancelar solicitud no concede pertenencia. |
| Aceptar invitación | Mismo archivo, `responderInvitacion`, `:396` y `:400` | Actualiza Usuario y crea MiembroInstitucion en una transacción. Rechazo/caducidad no cambia pertenencia. |
| Cambiar rol institucional / transferir propiedad | Mismo archivo, `:461`, `:538`, `:542` | Solo cambia `MiembroInstitucion.rol`, no usuarioId ni institucionId. No requiere un cambio de pertenencia en Usuario. |
| Retirar miembro del equipo | Mismo archivo, `:493` y `:497` | Pone Usuario.institucionId=null y elimina MiembroInstitucion en la misma transacción. |
| Eliminar institución legado | `institucion/institucion.service.ts:213` | Primero `usuario.updateMany` a null y después elimina institución; las membresías se eliminan por cascade. El historial conserva la institución anterior sin FK destructiva. |
| Suspender/reaprobar institución | `institucion/institution-approval.service.ts:377` | Cambia estado de verificación/operatividad de Institucion; no elimina ni suspende individualmente membresías. No se inventa una salida de cada estudiante. La operatividad es distinta de la pertenencia y los adaptadores deberán respetar las restricciones existentes. |
| Administración global / leads | `admin/admin.service.ts:57`, `:65`, `:154` | Cambio de rol no mueve institución; eliminar Usuario puede eliminar membresía por cascade (la auditoría competitiva restringe borrar usuarios con eventos); alta de lead crea profesor con institucionId, sin MiembroInstitucion. Esta asimetría administrativa no crea pertenencia estudiantil invisible al trigger. |
| Guion de demostración | `admin/demo-institution-approval.mjs` en raíz | Estado ficticio local sin escrituras Prisma; no es un flujo de pertenencia real. |

Las pruebas PostgreSQL ejecutan servicios reales de creación institucional anidada, alta/incorporación/importación de estudiantes, solicitudes, invitaciones, cambio de rol, transferencia, retiro, aceptación de código, retiro de grupo y eliminación institucional. Verifican Usuario, historial y, donde corresponde, MiembroInstitucion; también liquidación retrasada tras eliminar la institución. Las pruebas existentes de aprobación/registro y la suite completa siguen formando parte de la regresión. No se genera historial previo a activar la migración ni se deduce pertenencia histórica de una fila actual de MiembroInstitucion.

### RLS: gate obligatorio de despliegue, pendiente de evidencia de producción

**RLS permanece habilitado. El rol real de producción NO está confirmado. No se leyó ni utilizó DATABASE_URL remoto para esta revisión.** Los resultados locales se obtuvieron con un propietario de una instancia desechable y roles de prueba anon/authenticated; no prueban permisos de Supabase.

Antes de ejecutar esta migración en Supabase/producción, el responsable del despliegue debe registrar evidencia de:

1. La identidad PostgreSQL efectiva utilizada por DATABASE_URL del backend y su pool: `current_user`, `session_user`, propietario de tablas, `rolsuper`/`rolbypassrls` e implicaciones de cualquier `SET ROLE`. No basta inspeccionar el nombre escrito en la URL; no publicar credenciales.
2. Si el rol es owner/BYPASSRLS o necesita grants y una policy privada explícita. Con RLS habilitado y sin policy, un rol ordinario queda bloqueado aunque tenga grants. Mantener las tablas sin acceso de clientes y contemplar también INSERT del trigger institucional y permisos sobre su secuencia. No resolverlo desactivando RLS ni otorgando permisos a PUBLIC/anon/authenticated.
3. En un entorno de validación autorizado con el mismo rol/configuración, comprobar operaciones del backend: historial en alta/cambio de Usuario, lectura histórica, liquidación, proyección y corrección administrativa, con transacciones de prueba reversibles. Este documento no autoriza ejecutar pruebas ni migraciones remotas ahora.
4. Comprobar mediante conexiones/roles efectivos anon y authenticated que no pueden leer ni escribir directamente las tres tablas ni usar la secuencia; comprobar también exposición a través de la API de datos. Confirmar RLS y ausencia de policies/grants públicos heredados después de migrar.

El test local comprueba catálogos/permisos/RLS y ejecuta SELECT e INSERT bajo `SET LOCAL ROLE anon/authenticated`, exigiendo error PostgreSQL 42501. El gate de producción permanece **pendiente**, no aprobado por esos resultados locales.

Solo los tres juegos individuales están conectados al runtime competitivo por opt-in. Tener una función pura no habilita los otros cinco.

| Juego | Regla V1 implementada | Integrado al runtime | Autoridad suficiente | Estado |
|---|---|---|---|---|
| Trivia Rush | Sí | No | Parcial: falta snapshot competitivo Q y cierre/presencia durable | Preparado/no conectado |
| Duelo fantasma | Sí | No | No: modo y fantasma inicial no persistidos | Bloqueado por autoridad |
| Cima | Sí | Sí, opt-in | Snapshot/replay, cierre y recuperación servidor | Integrado backend; no desplegado |
| Tira y afloja | Sí | No | Parcial: faltan R/Qpartida y presencia/cierre durable | Preparado/no conectado |
| Guardián | Sí | Sí, opt-in | Snapshot/replay, cierre y recuperación servidor | Integrado backend; no desplegado |
| Memoria | Pura futura | No | No: solo estado local | Bloqueado por autoridad |
| Batallas | Sí | No | Parcial: banco degradado y abandono deben cerrarse | Bloqueado por autoridad |
| Rescate de estrellas | Sí | Sí, opt-in | Snapshot/replay, cierre y recuperación servidor | Integrado backend; no desplegado |

Para completar PR-I1: integrar Trivia con Q competitivo inmutable y cierre/presencia; Duelo con modo y fantasma inicial persistidos; Tira con R/Qpartida y presencia/cierre durable; Memoria con motor autoritativo; Batallas con banco completo y abandono asíncrono verificado. Para estos tres individuales restan la revisión/despliegue autorizado, el gate de rol/RLS y la futura activación del cliente; no falta un callback de recuperación. Mantener vigilancia de pendientes bloqueados por datos/permisos. No corresponde iniciar rankings TOP 50, insignias ni PR-I2.

No se detectó contradicción interna con las reglas V1. Las carencias de evidencia actual son requisitos técnicos de integración, no decisiones de producto reabiertas. No se promete recuperar pertenencia institucional anterior a esta migración ni convertir partidas locales antiguas en competitivas.

## Validación reproducible

Desde `backend`:

```powershell
npm run build
npm test -- --runInBand competitive
npm test -- --runInBand 'summit|guardian|star-rescue'
npm test -- --runInBand
node tool/test_competitive_postgres.mjs
npm audit --omit=dev
git diff --check
```

El ejecutor PostgreSQL usa Docker con socket/pipe local, contenedor con nombre/label de propiedad aleatorios, almacenamiento efímero, puerto aleatorio publicado solo en `127.0.0.1` y credenciales temporales. No carga `.env`, ignora URLs heredadas y el test valida un marcador de propiedad antes de conectar. Aplica las 51 migraciones versionadas de HEAD y solo la nueva migración local `20260930180000_competitive_solo_runtime`, nunca otras pendientes. Se amplía el mismo runner para ejecutar los archivos de pruebas comunes y de los tres juegos; no se crea otro runner. Al finalizar verifica propiedad y elimina su contenedor/directorio; no usa ni modifica servicios PostgreSQL existentes.

Las pruebas incluyen ocho fórmulas, half-up, límites, memoria bloqueada, reconexión, fechas Bogotá, roles, historial, ausencia de institución, banco insuficiente, ambos ausentes, correcciones, idempotencia incompatible, doble liquidación concurrente, fuentes concurrentes, correcciones concurrentes, piso, secuencias, independencia entre juegos/XP general, constraints, RLS y rollback inyectado después de insertar ledger.

Resultados de la revisión previa al checkpoint: build correcto; suite dirigida competitiva **66/66**; suite completa **90 suites y 944 pruebas aprobadas** (incluye las 66); PostgreSQL 16 real **24/24**, aplicando las 50 migraciones versionadas y la nueva migración competitiva; `git diff --check` sin errores. El audit de dependencias de producción terminó con **0 vulnerabilidades**, usando temporalmente `NODE_OPTIONS=--use-system-ca` por la cadena de certificados local detectada en la primera ronda, sin desactivar TLS ni cambiar dependencias/configuración persistente. Las pruebas adicionales verifican el rechazo de invalidación, canonicalización por familia y sincronización institucional mediante servicios reales.

Resultados de esta ronda de integración (2026-10-01):

| Comprobación | Resultado |
|---|---|
| `npm run build` | Correcto. |
| `npm test -- --runInBand competitive` | 2 suites, 85/85 pruebas. |
| Dirigidas `summit\|guardian\|star-rescue` | 7 suites, 40/40 pruebas. |
| `npm test -- --runInBand` | 91 suites, 963/963 pruebas, incluidas las anteriores. |
| `node tool/test_competitive_postgres.mjs` | 59/59 pruebas reales: 24 comunes y 35 de integración; 51 migraciones versionadas y la nueva migración de esta ronda. |
| `npm audit --omit=dev` | 0 vulnerabilidades; CA del sistema temporal, TLS activo, sin cambios de dependencias. |
| `git diff --check` | Sin errores. |

Las pruebas nuevas ejercitan creación real desde los servicios, victoria, derrota/agotamiento, abandono, caducidad, evidencia inválida, roles, privacidad, historial, temporada, doble respuesta/liquidación y conservación de XP general. Cubren arranque del módulo Nest real, barrido automático/periódico, caída de DB y apagado. En PostgreSQL se omite deliberadamente la liquidación después del cierre persistido y dos reconciliadores recuperan un único ledger; también se inyecta una caída después de confirmar ledger y antes del acuse, y el reinicio reutiliza ese evento. Los rechazos de evidencia/historial y fallos inyectados producen logs esperados sin acreditar XP.

Las pruebas PostgreSQL usan fixtures persistidas y servicios reales, no telemetría ni integración de juegos en producción. Cubren también UUID con distinta capitalización, sin segundo pago. Las instancias desechables se eliminaron al finalizar. No se ejecutaron migraciones sobre Supabase, Render o producción. No se hicieron commit, push, merge ni despliegue.

### Revisión adicional: activación controlada y despliegue (2026-10-01)

Resultados finales posteriores al feature flag y al diagnóstico explícito de esquema:

| Comando | Resultado |
|---|---|
| `npm run build` | Correcto. |
| `npm test -- --runInBand competitive` | 3 suites; 96/96 pruebas. |
| `npm test -- --runInBand` | 92 suites; 974/974 pruebas. |
| `node tool/test_competitive_postgres.mjs` | 62/62; contenedor local desechable eliminado. |
| `npm audit --omit=dev` | 0 vulnerabilidades; CA del sistema temporal y TLS activo. |
| `git diff --check` | Sin errores. |

Las pruebas de activación rechazan valores ausentes/false/no reconocidos y permiten solo true explícito. Por cada juego, PostgreSQL verifica rechazo sin insertar filas, creación y cierre legacy, aceptación con flag true, recuperación del intento activo tras apagarlo, respuesta/cierre posterior, dos reconciliadores concurrentes con un único evento de 100 XP y rechazo de una nueva partida después de ese cierre. Las pruebas de profesores/administradores, snapshots y banco siguen ejecutándose con admisión habilitada; el flag no sustituye elegibilidad. Cuatro casos adicionales comprueban el diagnóstico de tabla/columna faltante. No se requiere otra migración para el flag ni se modifica la migración base.

### Gate abierto: revisión de los 34 fallos PostgreSQL (2026-10-02)

El checkpoint de presencia continúa bloqueado. El daemon local no es accesible: Docker Desktop falla al inicializar `sailor-ingest.sock`; no se asume que ese fallo explique los 34 fallos anteriores. La revisión detallada de nombres, mensajes, trazas, aislamiento, relojes y límites está en `PR_I1_TRIVIA_DUELO_AUDITORIA.md`, sección «Revisión de los 34 fallos». Son 27 errores institucionales directos, una aserción de rollback y seis de ledger ausente; el punto observable es el rechazo de cobertura antes de liquidar, sin causa raíz reproducida. No se corrigió código ni se debilitó la validación.

Resultados nuevos: build correcto; competitivo 115/115 (5 suites); completo 993/993 (94 suites); audit 0 vulnerabilidades con TLS activo; diff check correcto. PostgreSQL y las tres ejecuciones limpias independientes quedan pendientes por Docker inaccesible. También permanecen pendientes la comparación ejecutada con HEAD 16163b7, diagnóstico DB/host y catálogo de esquema de cada ejecución. Se preservan el árbol de presencia y el historial documental; no hay autorización para checkpoint, despliegue, activación XP ni migraciones remotas. La incidencia previa de vencimiento de Rescate continúa abierta y separada.

### Actualización del gate tras recuperación Docker (2026-10-02)

El bloqueo de daemon está superado; postgres-local ajeno permanece intacto. Se conservó toda la evidencia de la revisión previa. Árbol actual: primera pasada 92/92; segunda 68 aprobadas/1 archivo fallido por cargar Prisma durante su regeneración (causa reproducida aisladamente); después tres pasadas limpias, independientes y secuenciales de 92/92. HEAD 16163b7 en worktree/dependencias/DB propios pasó 78/78 sin presencia.

Un experimento explícito en HEAD con reloj Node atrasado 2000 ms reprodujo los mismos 34 fallos originales más uno institucional adicional (43/78, 35 fallos). SQL verificó terminales sintéticos anteriores a primera cobertura por 1734..1994 ms. Demuestra un mecanismo existente antes de presencia; no prueba que hubiera ese desfase en la ejecución histórica, que no guardó sus relojes/DB. No se relajó el guard institucional ni se alteró historial/runtime. La consistencia de relojes de fuentes terminales y cobertura institucional sigue siendo un requisito técnico abierto; la causa histórica no se declara resuelta por repetir verde. Detalles, trazas, logs y método reproducible en la sección «Reanudación con Docker recuperado» de PR_I1_TRIVIA_DUELO_AUDITORIA.md.

El runner solo añade diagnóstico de reloj/esquema; build/generación Prisma debe terminar antes de suites que cargan ese cliente. Resultados finales: build exit 0; competitivo 115/115; completo 993/993; audit --omit=dev cero vulnerabilidades con TLS activo; diff check correcto. La incidencia histórica de vencimiento Rescate continúa abierta pese a sus pasadas actuales. No se activó XP Trivia/Duelo ni se modificaron fórmulas/migraciones confirmadas; no hay autorización de despliegue ni confirmación del rol/RLS de producción. Pendiente revisión humana, sin commit/push/merge ni migraciones remotas.

### Admisión de acciones HTTP según presencia aprobada (2026-10-02)

Para nuevos intentos Trivia/Duelo con presenciaVersion=1, una respuesta/ayuda nueva exige conexión OPEN autenticada del intento con lease DB vigente; ausencia inicial, desconexión confirmada, UNKNOWN, CLOSED/RETIRED o lease vencido impiden nuevas acciones. HTTP no aporta ni renueva evidencia de presencia. Una reconexión válida permite continuar con el tiempo original; gracia exacta de 20 s y EXPIRADO antes/igual al fin de gracia permanecen. Legacy/históricos sin enrollment conservan el camino anterior; reintentos exactos de acciones aceptadas recuperan el resultado sin nueva escritura, incluso desconectados/terminales.

La comprobación ocurre dentro de la transacción después del lookup idempotente y se repite en SQL al insertar. La migración pendiente agrega reloj/admisión privados y ordena el trigger antes del guard confirmado para tomar Usuario → intento, también en inserciones directas. RLS y revocaciones de funciones nuevas permanecen. Gateway autenticado/revalidado se conserva. Las acciones V1 usan el instante DB de admisión; no hay override de reloj en producción. La prueba SQL de espera sobre lock y las carreras HTTP verifican el protocolo; recuperación durable y cero XP competitivo se mantienen.

Resultados: build exit 0; competitivo 118/118 (5 suites); completo 996/996 (94 suites); PostgreSQL final 104/104 con carreras por rutas HTTP reales; audit omit=dev cero vulnerabilidades y TLS activo; diff check correcto. Se conserva un primer fallo de fixture histórico incompatible entre fecha futura y reloj legacy, diagnosticado/corregido sin relajar aserciones; la pasada intermedia también dio 104/104. Detalles y logs en «Regla aprobada: suspender nuevas acciones sin presencia vigente» de PR_I1_TRIVIA_DUELO_AUDITORIA.md.

Solo se ajusta la migración nueva no confirmada, no las confirmadas. No se cambian Cima/Guardián/Rescate, fórmulas ni Flutter. La causa histórica de los 34 fallos y la incidencia de Rescate siguen abiertas como antes. Todos los cambios previos se preservan. Sin XP Trivia/Duelo, commit/push/merge/despliegue ni migraciones remotas; pendiente revisión humana del quinto checkpoint.


### Validación final de integración Trivia/Duelo (88f7045)

Decisiones de M y empate cerradas por el propietario. Adaptador común TRIVIA_ATTEMPT y recuperador independiente registrados; solo nuevos intentos admitidos explícitamente con versión 1 pueden liquidarse. COMPETITIVE_TRIVIA_ENABLED y COMPETITIVE_GHOST_ENABLED siguen apagados por defecto; ningún flag ni despliegue fue activado para usuarios. Nueva migración 20261002230000_trivia_competitive_v1, probada exclusivamente en PostgreSQL local desechable; no se alteran migraciones confirmadas ni los tres motores individuales.

Resultados finales: build exit 0; competitivo 137/137 (6 suites); Jest completo 1015/1015 (95 suites); PostgreSQL 121/121 con cierre/abandono/ledger/recuperación concurrentes; audit omit=dev cero vulnerabilidades/TLS activo; diff check exit 0. Los fallos iniciales de fixtures Q compartido y reloj futuro no sincronizado, y el ajuste de lifecycle del módulo, están documentados con resultados y logs en la auditoría; no se debilitaron reglas/aserciones para ocultarlos. No quedan decisiones de producto abiertas de esta integración. La incertidumbre histórica de los 34 fallos y el vencimiento intermitente Rescate siguen abiertos. El gate de migración previa y verificación real de rol/RLS de producción permanece obligatorio. Sin commit/push/merge/despliegue/migraciones remotas; pendiente revisión humana.


Cierre de representación de primera referencia: sin fantasma, outcome=null y bono cero; con fantasma, resultado obligatorio por puntajes verificados. Ninguna derrota ficticia ni cambio de fórmula V1. Revalidación final: build exit 0; competitivo 138/138 (6 suites); Jest completo 1016/1016 (95 suites); PostgreSQL 121/121; audit 0 vulnerabilidades/TLS activo; diff check exit 0. Detalles, inventario y logs de cierre en la auditoría. HEAD 88f7045, flags independientes apagados por defecto y pendiente revisión humana, sin acciones remotas ni commit/push.


### Revisión mínima de contrato y navegación del sexto checkpoint

La correspondencia ghostId/outcome es estricta: null/null paga base; referencia presente exige VICTORIA/EMPATE/DERROTA. Resultado ficticio sin referencia se rechaza sin ledger/balance. Supera explícitamente la compatibilidad anterior; fórmulas, M, empate por puntaje y presencia permanecen intactos. Sexta ronda todavía local sin commit, cinco checkpoints previos confirmados. Los README y el índice docs enlazan a los resúmenes vigentes; registros históricos se conservan señalados como tales.

Resultados: build exit 0; competitivo 144/144 (6 suites); Jest completo 1022/1022 (95 suites); PostgreSQL local 122/122; audit cero vulnerabilidades/TLS activo; diff check exit 0. 42 enlaces Markdown locales y anclas comprobados en cinco documentos, todos válidos. Rol/RLS productivo, causa histórica de los 34 fallos e incidencia Rescate permanecen abiertos. No hay nuevas migraciones de esta revisión ni acciones remotas/commit/push/merge/despliegue. Detalle en la revisión final de la auditoría.
