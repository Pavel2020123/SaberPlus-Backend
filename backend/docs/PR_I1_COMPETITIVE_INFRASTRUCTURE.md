# PR-I1 V1: infraestructura competitiva común

Estado: primera ronda implementada para revisión; **PR-I1 no completado**. No hay juegos habilitados, endpoints competitivos ni integración masiva. `CompetitiveModule` exporta el servicio, pero todavía no está importado por `AppModule`; su registro de verificadores está vacío deliberadamente.

Autoridad de producto: `saber_plus/docs/PLAN_MAESTRO_COMPETITIVO.md` y sección 12 de `saber_plus/docs/PR_I1_AUDITORIA_FORMULAS.md`, Flutter `main` `6903816`. La petición de implementación de esta ronda sustituye la anterior parada documental. Backend inicial: `feat/pr-i1-competitive-infrastructure`, `fb27225d96376c3867418d9f5a1a53030d2256c0`. No se modifican Flutter, dependencias ni `Usuario.xpTotal`.

## Motor puro V1

`src/competitive/competitive.rules.ts` define los ocho IDs estables y `XP_RULES_VERSION = 1`. Las fórmulas no consultan Prisma, no usan azar y rechazan evidencia inválida. `roundHalfUp(x) = floor(x + 0.5)` tiene pruebas explícitas; `roundRatio` usa enteros y BigInt para calcular el mismo half-up en fracciones sin errores intermedios de coma flotante. Solo se redondea en los puntos aprobados.

| ID | Cálculo normal V1 |
|---|---|
| TRIVIA_RUSH | half-up((70C + 30M) / Q), Q entero 10..30, M verificable ≤ C ≤ Q. |
| GHOST_DUEL | half-up(80C/Q) + 20/10/0 por victoria/empate/derrota; primer intento sin referencia: bono 0. Exige modo separado, referencia inicial inmutable (incluido null) y configuración compatible. |
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

Los adaptadores deben usar un orden de locks compatible: usuario/rol y después origen, sin adquirirlos en orden inverso desde cierres del juego. Deben serializar el timestamp terminal con cambios de membresía sobre el mismo usuario. No registrar fuentes hasta completar estas garantías. Los adaptadores de prueba leen una tabla de fixtures que solo existe en PostgreSQL desechable; no se incluyen en el módulo de producción.

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

| Fuente | Modelo/campo real (línea del schema) | Representación aceptada/canónica |
|---|---|---|
| TRIVIA_ATTEMPT | `IntentoTriviaRush.id`, 1081; `@db.Uuid`, `uuid_generate_v4()` | UUID estándar 8-4-4-4-12; minúsculas antes de lock/hash/consulta. Trivia y Duelo comparten fuente. |
| SUMMIT_ATTEMPT | `IntentoCima.id`, 1370; `@db.Uuid`, `uuid()` | Igual. |
| TUG_MATCH | `PartidaTiraAfloja.id`, 976; `@db.Uuid`, `uuid_generate_v4()` | Igual; no confundir con código de invitación. |
| GUARDIAN_ATTEMPT | `IntentoGuardian.id`, 1351; `@db.Uuid`, `uuid()` | Igual. |
| BATTLE | `Batalla.id`, 821; `@db.Uuid`, `uuid_generate_v4()` | Igual; `codigoInvitacion` no es la PK de liquidación. |
| STAR_RESCUE_ATTEMPT | `IntentoRescateEstrellas.id`, 1390; `@db.Uuid`, `uuid()` | Igual. |
| MEMORY_ATTEMPT | No existe modelo/intento servidor de Memoria | Sin contrato canónico aprobado; siempre bloqueado, sin convertir identificadores locales a UUID. |

Las líneas señalan el campo ID en el schema de esta revisión; el nombre de modelo/campo es la referencia estable. UUID compacto, con llaves, espacios o guiones alternativos se rechaza, aunque PostgreSQL pueda aceptar algunas variantes como UUID. Nunca se usa su texto sin normalizar para crear otra identidad. El CHECK SQL de `sourceId` exige representación UUID estándar en minúsculas para las fuentes actualmente habilitables; Memoria permanece prohibida por su propio CHECK. Las pruebas cubren las seis familias, retry concurrente con mayúsculas/minúsculas, alternativas rechazadas y escritura directa no canónica rechazada.

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

Ninguno está conectado al runtime competitivo; tener una función pura no habilita el juego.

| Juego | Regla V1 implementada | Integrado al runtime | Autoridad suficiente | Estado |
|---|---|---|---|---|
| Trivia Rush | Sí | No | Parcial: falta snapshot competitivo Q y cierre/presencia durable | Preparado/no conectado |
| Duelo fantasma | Sí | No | No: modo y fantasma inicial no persistidos | Bloqueado por autoridad |
| Cima | Sí | No | Para aritmética normal; falta contexto/cierre competitivo | Listo para ronda de integración |
| Tira y afloja | Sí | No | Parcial: faltan R/Qpartida y presencia/cierre durable | Preparado/no conectado |
| Guardián | Sí | No | Para aritmética normal; falta contexto/cierre competitivo | Listo para ronda de integración |
| Memoria | Pura futura | No | No: solo estado local | Bloqueado por autoridad |
| Batallas | Sí | No | Parcial: banco degradado y abandono deben cerrarse | Bloqueado por autoridad |
| Rescate de estrellas | Sí | No | Para aritmética normal; falta contexto/cierre competitivo | Listo para ronda de integración |

Para completar PR-I1: implementar/verificar snapshots y adaptadores por juego; persistir presencia, plazos y cierres idempotentes; resolver los bloqueos de Duelo/Memoria/banco de Batallas; conectar el módulo y probar la integración real preservando XP general/privacidad; revisar y aplicar la migración únicamente mediante un proceso autorizado posterior. No corresponde iniciar rankings TOP 50, insignias ni PR-I2.

No se detectó contradicción interna con las reglas V1. Las carencias de evidencia actual son requisitos técnicos de integración, no decisiones de producto reabiertas. No se promete recuperar pertenencia institucional anterior a esta migración ni convertir partidas locales antiguas en competitivas.

## Validación reproducible

Desde `backend`:

```powershell
npm run build
npm test -- --runInBand competitive
npm test -- --runInBand
node tool/test_competitive_postgres.mjs
npm audit --omit=dev
```

El ejecutor PostgreSQL usa Docker con socket/pipe local, contenedor con nombre/label de propiedad aleatorios, almacenamiento efímero, puerto aleatorio publicado solo en `127.0.0.1` y credenciales temporales. No carga `.env`, ignora URLs heredadas y el test valida un marcador de propiedad antes de conectar. Aplica las migraciones versionadas de HEAD y solo la migración local competitiva explícita, nunca otras pendientes. Al finalizar verifica propiedad y elimina su contenedor/directorio; no usa ni modifica servicios PostgreSQL existentes.

Las pruebas incluyen ocho fórmulas, half-up, límites, memoria bloqueada, reconexión, fechas Bogotá, roles, historial, ausencia de institución, banco insuficiente, ambos ausentes, correcciones, idempotencia incompatible, doble liquidación concurrente, fuentes concurrentes, correcciones concurrentes, piso, secuencias, independencia entre juegos/XP general, constraints, RLS y rollback inyectado después de insertar ledger.

Resultados de la revisión previa al checkpoint: build correcto; suite dirigida competitiva **66/66**; suite completa **90 suites y 944 pruebas aprobadas** (incluye las 66); PostgreSQL 16 real **24/24**, aplicando las 50 migraciones versionadas y la nueva migración competitiva; `git diff --check` sin errores. El audit de dependencias de producción terminó con **0 vulnerabilidades**, usando temporalmente `NODE_OPTIONS=--use-system-ca` por la cadena de certificados local detectada en la primera ronda, sin desactivar TLS ni cambiar dependencias/configuración persistente. Las pruebas adicionales verifican el rechazo de invalidación, canonicalización por familia y sincronización institucional mediante servicios reales.

Las pruebas PostgreSQL usan fuentes sintéticas persistidas, no telemetría ni integración de juegos en producción. Cubren también UUID con distinta capitalización, sin segundo pago. Las instancias desechables se eliminaron al finalizar. No se ejecutaron migraciones sobre Supabase, Render o producción. No se hicieron commit, push, merge ni despliegue.
