# PR-I2 — rankings competitivos por juego y temporada

## I2-3: API HTTP autenticada — estado vigente

Base `60da6de`, rama `feat/pr-i2-competitive-rankings`, árbol limpio al iniciar.
I2-1 (`1962224`) e I2-2 (`60da6de`) confirmados/publicados. I2-3 implementado y
validado localmente, pendiente de revisión y publicación del propietario.
No está desplegado, no activa admisión y no cierra PR-I2.

### Ruta, identidad y autorización

`GET /ranking/competitivo?juego=TRIVIA_RUSH&temporada=2026`.
Ambos parámetros son obligatorios: juego exacto del enum `JuegoCompetitivo` y
año decimal canónico 1..9999. Se rechazan parámetros adicionales, arrays,
duplicados, espacios, exponentes, fracciones y ceros iniciales. Se conserva la
sintaxis original frente a la conversión implícita del ValidationPipe existente.
No hay selección de año por defecto ni filtros de institución/periodo/limite.

[Controlador y DTO](../src/ranking/competitive-ranking.controller.ts) registrados
en [RankingModule](../src/ranking/ranking.module.ts). Reutilizan el
[JwtGuard existente](../src/auth/jwt.guard.ts), que verifica firma y vigencia con
JwtService, consulta el usuario actual y establece `req.usuario`; el rol no se
toma del claim antiguo. La configuración JWT HS256 y expiración de los tokens
emitidos siguen siendo las de AuthModule, sin verificador ni caducidad paralelos.
Después se exige rol actual ESTUDIANTE y se aplica EmailVerificadoGuard con sus
reglas existentes; se conserva también la restricción de contraseña inicial.
Profesores y administradores reciben 403 en esta ruta.

La posición propia procede exclusivamente de `req.usuario.sub`. Selectores en
query o un body no vacío reciben 400. Headers personalizados de identidad no
seleccionan usuario y se ignoran. El controlador delega al lector I2-2 sin
recalcular posiciones ni abrir consultas paralelas. Usa el mismo PrismaService
y pool del módulo existente; no introduce otro cliente, esquema o dependencia.
Las respuestas exitosas llevan `Cache-Control: private, no-store` y
`Vary: Authorization`.

### Respuesta y errores

Los tres estados contractuales son HTTP 200: CON_PARTICIPANTES,
SIN_PARTICIPANTES y NO_DISPONIBLE. Conservan TOP 50, total completo y posición
propia independiente. Los seis juegos PR-I1 están disponibles contractualmente;
Memoria/Batallas devuelven NO_DISPONIBLE, total null y sin posición.
Flags de admisión OFF no ocultan balances ya liquidados.

Ejemplo ficticio, sin datos personales ni UUID:

```json
{
  "juego": "TRIVIA_RUSH",
  "temporada": 2026,
  "limite": 50,
  "estado": "CON_PARTICIPANTES",
  "totalParticipantes": 1,
  "ranking": [{ "posicion": 1, "alias": "Tú", "xp": 80, "esUsuarioActual": true }],
  "miPosicion": { "posicion": 1, "alias": "Tú", "xp": 80, "esUsuarioActual": true }
}
```

Cada entrada tiene exclusivamente posicion, alias, xp y esUsuarioActual. Se
reutiliza HMAC I2-1: no expone nombre, correo, institución, fecha, partida o
evidencia. No se cambia Usuario.xpTotal ni se escribe XP, ledger o alcanzadoEn.

| HTTP | Situación |
|---|---|
| 401 | Sin JWT, firma inválida, token expirado/no vigente o usuario no válido según JwtGuard |
| 403 | Rol no estudiante o restricciones existentes de correo/contraseña |
| 400 | Query inválida o body no admitido; validación Nest existente y código INVALID_COMPETITIVE_RANKING_QUERY donde corresponde |
| 500 | Anomalía de datos/contexto interno o error inesperado |
| 503 | Fallo de lectura PostgreSQL del lector |

500/503 usan el código público `COMPETITIVE_RANKING_UNAVAILABLE` y mensaje
genérico. No serializan SQL, Prisma metadata, UUID, secretos o conexiones.
Los diagnósticos del lector siguen siendo privados; el controlador registra
solamente un código seguro para errores inesperados. No atribuye anomalías
de datos del servidor al estudiante ni las convierte en ranking vacío.

### Evidencia y límites de validación I2-3

[Pruebas HTTP Jest](../src/ranking/competitive-ranking.controller.spec.ts)
usan RankingModule real, JWT firmado y los guards reales, sin sustituirlos.
Usuario/lector son dobles: comprueban HTTP, autorización, parámetros, privacidad,
estados y traducción de errores, pero no SQL real. Prueban firma incorrecta,
expiración, nbf, roles actuales frente a claims antiguos, TOP/posición 51,
selectores query/body/headers y compatibilidad del GET legacy `/ranking`.

[Suite PostgreSQL dirigida](../test/competitive-ranking-postgres.test.cjs)
conserva las diez pruebas I2-2 y añade dos HTTP con RankingModule, JWT, guards,
lector y PostgreSQL reales. Verifica el mismo PrismaService, corrección real
visible por HTTP, roles actuales, privacidad y ausencia de escrituras XP.
Introduce anomalía temporal y tabla ausente exclusivamente en la DB OWNED;
restaura ambas en finally y comprueba recuperación. No prueba AppModule completo
ni certifica roles productivos o un nuevo motor deportivo.

```text
npm run build
npm test -- --runInBand competitive-ranking.controller.spec.ts competitive-ranking.reader.spec.ts competitive-ranking.contract.spec.ts ranking.service.spec.ts jwt.guard.spec.ts email-verificado.guard.spec.ts
node --check test/competitive-ranking-postgres.test.cjs
node tool/test_competitive_postgres.mjs --ranking
git diff --check
```

Resultados I2-3: build exit 0; Jest **102/102, cinco suites**, 12,036 s.
Suites: controlador HTTP 37, lector 6, contrato 51, legacy 3 y JwtGuard 5.
No existe suite independiente email-verificado.guard.spec.ts; su guard real
sí está ejercitado por las pruebas HTTP. Sintaxis CJS correcta.
PostgreSQL **12/12, un archivo, exit 0**, 4,428 s de tests / 4,601 s de archivo;
cero fallidos, cancelados, omitidos, TODO o resúmenes incompletos. Aplicó las
61 migraciones versionadas en un contenedor propio desechable, luego retirado.
Una sonda pg_isready inicial devolvió exit 2 durante el arranque; la espera
acotada existente comprobó disponibilidad antes de migrar/probar. No hubo
fallos de tests. Registro local: `sp-i2-3-postgres.log` en TEMP.

La regresión PostgreSQL completa **no se volvió a ejecutar al cerrar I2-2 ni
en I2-3**. Aquí se eligió cobertura dirigida del módulo real y los componentes
afectados: no cambian workers, migraciones, reglas, liquidaciones o ciclo de vida.
Estos resultados no equivalen a regresión integral PR-I1 ni pruebas Linux/POSIX.
La integración global y la regresión de cierre se mantienen como criterio I2-5.

Archivos I2-3: controlador y spec nuevos; RankingModule, comentario del lector,
suite PostgreSQL y este documento actualizados. Sin cambios en ranking legacy,
autenticación existente, reglas competitivas, migraciones, flags o Flutter.

### Continuidad y requisitos externos

I2-4 pendiente: consumir esta API en Flutter, seleccionar juego/año, presentar
los tres estados y TOP/posición propia, tratar 401/403/400/5xx sin exponer datos
privados y probar compatibilidad del ranking general. No implementado aquí.
I2-5 pendiente: validación global Backend/Flutter, regresión de cierre e
integración real con AppModule/autenticación del entorno autorizado; revisar
privacidad, errores, correcciones y admisión OFF antes de proponer merge.
No declarar PR-I2 completo por esta ruta ni empezar esos checkpoints sin orden.

B1/B2 siguen abiertos: rol/RLS con visibilidad completa para el backend,
esquema compatible incluso con flags OFF, HMAC privado estable, presupuesto
de conexiones, capacidad, respaldo/durabilidad y pruebas operativas autorizadas.
No se verificaron producción, Supabase o despliegue; no se activaron flags.
La API local no integra Memoria/Batallas, premios, perfiles o ranking institucional.

## I2-2: lector PostgreSQL interno

Base `1962224`, rama `feat/pr-i2-competitive-rankings`, árbol limpio al iniciar.
I2-1 confirmado/publicado; I2-2 implementa lectura real, **sin endpoint HTTP,
registro de proveedor público, Flutter, despliegue o activación**.

[CompetitiveRankingReader](../src/ranking/competitive-ranking.reader.ts) recibe
juego/año explícitos validados y UUID interno confiable. Usa PrismaService, su
pool y `$queryRaw(Prisma.sql)`, sin abrir otro cliente/pool en runtime. No usa
Usuario.xpTotal, banco deportivo, ledger para recalcular XP ni flags de admisión.

### Consulta y consistencia

Una única sentencia SELECT parametrizada:

1. `population`: BalanceCompetitivo unido a Usuario; juego/año exactos,
   rol ESTUDIANTE y xp > 0. No exige institución.
2. `stats`: cuenta **toda** esa población y comprueba fechas, incluso fuera del TOP.
3. `ranked`: row_number por XP DESC, alcanzadoEn ASC, UUID PostgreSQL ASC,
   solamente si no existe anomalía.
4. `top`: primeras 50 filas; posición propia buscada en ranked completo.
5. Retorna una fila con total, indicador de anomalía y JSON de TOP/posición propia.

READ COMMITTED de PostgreSQL da un único snapshot MVCC por sentencia: TOP,
posición propia, roles, total e integridad observan ese mismo estado. No hay
lecturas independientes ni necesidad de una transacción larga REPEATABLE READ.
La prueba real también ejecuta el lector en una transacción READ ONLY.
La ordenación completa ocurre en PostgreSQL, no en memoria de Node; la aplicación
recibe hasta 50 entradas y una entrada propia, sin fechas ni columnas personales.

Positivos con alcanzadoEn NULL, fechas infinitas o alcanzadoEn > updatedAt
rechazan toda la consulta con `POSITIVE_BALANCE_INVALID_REACHED_AT`; no se reparan
ni excluyen silenciosamente. El esquema ya garantiza updatedAt no nulo, XP entero
no negativo y unicidad por usuario/juego/año. Un total no representable exactamente
en JavaScript también se rechaza. Los años conservan el contrato I2-1.

La presentación pública mantiene la lista permitida y HMAC I2-1; UUID solo interno.
Diagnóstico privado de anomalía: código, juego y temporada. Error de PostgreSQL:
código seguro y, cuando existe, Prisma code/SQLSTATE; no se registra texto SQL,
parámetros, mensaje original, UUID ni objeto Prisma. El consumidor recibe
`COMPETITIVE_RANKING_READ_FAILED`, sin detalles de evidencia o conexión.

### Pruebas y medición local

[Suite PostgreSQL dirigida](../test/competitive-ranking-postgres.test.cjs),
[pruebas unitarias del lector](../src/ranking/competitive-ranking.reader.spec.ts).
Ejecutar build antes de tests para evitar regenerar Prisma mientras se carga:

```text
npm run build
npm test -- --runInBand competitive-ranking.reader.spec.ts competitive-ranking.contract.spec.ts ranking.service.spec.ts
node tool/test_competitive_postgres.mjs --ranking
```

El modo `--ranking` admite únicamente ese argumento fijo, crea su propio
PostgreSQL 16 loopback con credenciales aleatorias/etiqueta y aplica las 61
migraciones versionadas mediante Prisma deploy. Conserva validación de propiedad,
resúmenes estrictos y plazo de 120 s por archivo. No usa .env, DB remota ni el
contenedor ajeno. No ejecuta Linux o backup/restore deportivo: son gates del modo
completo, que los conserva y además incluye la suite nueva. El resumen dirigido
se identifica como `ranking-only`; no equivale a regresión completa PR-I1.

Resultados: build exit 0; Jest 60/60, tres suites (lector 6, contrato 51, legacy 3),
11,424 s; sintaxis JS/MJS correcta. PostgreSQL inicial: tests 10/10 pero runner
exit 1 porque el probe de respaldo exigía datos de todos los motores deportivos.
Se separó ese probe del modo dirigido, sin reducir aserciones ni cambiar el modo
completo. Segunda base independiente: **10/10, un archivo, exit 0**, 2,799 s de
tests / 2,927 s de archivo. Cero fallidos, cancelados, omitidos, TODO o resúmenes
incompletos. Una sonda inicial pg_isready devolvió exit 2 durante el arranque;
el mecanismo acotado existente esperó disponibilidad antes de migrar/probar.
Se reforzó la prueba de corrección para demostrar posición propia 1 → 2 con XP
estrictamente distintos, sin depender del tiempo de dos liquidaciones empatadas.
Tercera base independiente final: 10/10, un archivo, exit 0; 2,740 s de tests y
2,888 s de archivo, sin cancelados/omitidos/TODO ni resúmenes incompletos.

Cobertura: TOP y puestos 1/50/51, total >50, propio ausente/cero, desempates,
roles/institución, juego/año, estados, flags OFF, privacidad y ausencia de pagos.
Anomalías más allá del TOP se introducen exclusivamente en transacciones de la DB
OWNED y se revierten; después se compara nuevamente con la proyección I2-1.
Corrección real: CompetitiveService liquida evidencia persistida de un verificador
**solo de prueba**, aplica CORRECCION y el lector refleja el saldo sin añadir eventos.
Esto no certifica un motor deportivo nuevo ni modifica verificadores productivos.

Concurrencia: la sentencia real se envuelve solo en el test con una barrera advisory;
se observa en pg_locks que está esperando, se confirma otra transacción que cambia
saldo y población y se libera la barrera. La lectura retenida coincide íntegramente
con el estado previo (total 3, posición propia 3); la siguiente observa el nuevo
(total 2, posición propia 1). No se decide el orden mediante sleeps arbitrarios.

EXPLAIN ANALYZE/BUFFERS en la DB desechable, 10.000 elegibles y 10.000 de otro año:
segunda ejecución planificación 0,506 ms, ejecución 21,021 ms, 50 entradas TOP
retornadas. Usa `BalanceCompetitivo_gameId_temporada_idx`; primera medición 19,777 ms.
Medición final: planificación 0,452 ms, ejecución 20,047 ms, mismo índice.
No hay necesidad demostrada de índice adicional para esta muestra; **no se crea
migración**. No es SLA, ensayo de carga productiva ni prueba de tamaños mayores;
window/CTEs siguen procesando la población completa en PostgreSQL y pueden requerir
más memoria/ordenación al crecer. Logs locales sp-i2-2-postgres-1.log, -2.log y
sp-i2-2-postgres-final.log en TEMP.

### Continuidad prevista al cerrar I2-2 (histórica)

Registrar/invocar el lector desde una API autenticada separada de `/ranking`;
UUID propio exclusivamente del JWT, nunca query/body. Mapear errores internos a
respuestas seguras; conservar NO_DISPONIBLE (total null), SIN_PARTICIPANTES (0)
y CON_PARTICIPANTES. No crear nuevos campos públicos sin revisar el contrato.
El lector no oculta balances al apagar admisión y no escribe XP/alcanzadoEn.

B1/B2 siguen abiertos: backend necesita rol con visibilidad completa de balances
y usuarios (no RLS por estudiante), esquema compatible incluso con flags OFF,
secreto HMAC privado estable, presupuesto del pool y validación operativa real.
El ensayo usa dueño de la DB OWNED y no certifica roles/RLS productivos.
Los pendientes de autenticación, DTO/HTTP, mapping de errores y pruebas de rutas
quedan implementados en la sección vigente I2-3 superior. Flutter continúa en I2-4.

## I2-1: contrato aislado

Base `5216383`: PR-I1 integrado a main mediante PR #5, 22 checkpoints funcionales.
Rama de trabajo `feat/pr-i2-competitive-rankings`. I2-1 prepara contratos y
pruebas; **no es API funcional, lector PostgreSQL ni integración Flutter**.
El ranking general `/ranking` sigue vigente, con sus periodos, XP y empates legacy.

Fuentes: plan maestro Flutter, apartado PR-I2, y decisiones del propietario de
I2-1. Los estados antiguos «PR-I1 abierto/no integrado» quedan superados por el
merge; los historiales y pruebas de PR-I1 se conservan. Ver
[relevo PR-I1](PR_I1_RELEVO.md) e [infraestructura](PR_I1_COMPETITIVE_INFRASTRUCTURE.md).

## Población y orden

- Estudiantes con balance competitivo **XP > 0** del juego y año solicitados.
  No se exige institución. Profesores/administradores no participan.
- XP cero no tiene posición, incluso si conserva una fecha de alcance anterior.
- Orden total: XP DESC, alcanzadoEn ASC, UUID canónico ASC. Posiciones consecutivas,
  sin puestos compartidos. El UUID se usa solamente dentro del servidor.
- TOP 50, total de participantes y posición propia independiente del TOP.
- `alcanzadoEn` no se modifica ni reconstruye. PR-I1 lo actualiza por cualquier
  delta efectivo no cero, incluidas penalizaciones/correcciones. El balance usa
  precisión timestamptz(3), no el timestamp terminal preciso de Tira.
- Un positivo sin fecha válida, con updatedAt inválido o alcanzadoEn > updatedAt
  bloquea **toda la clasificación solicitada** con
  `POSITIVE_BALANCE_INVALID_REACHED_AT`. No se elimina silenciosamente la fila,
  no se inventa una fecha ni se escribe una reparación. I2-2 deberá diagnosticar
  de forma privada y reproducible antes de volver a admitir esa lectura.
- Duplicados canónicos o XP fuera del rango entero del balance también se rechazan.

## Parámetros y estados

Juego: nombre exacto del enum Prisma `JuegoCompetitivo`. Temporada: entero
1..9999, como el constraint existente; el parser admite números enteros o cadenas
decimales canónicas, no arrays, fracciones, espacios, exponentes o ceros iniciales.
No se introduce un límite de años comerciales no aprobado. Años anuales según
America/Bogota; la selección por defecto/reloj servidor corresponde a I2-2/I2-3.
No hay periodos semanales/mensuales ni filtro institucional en este contrato.

| Estado | Significado | TOP / posición propia / total |
|---|---|---|
| CON_PARTICIPANTES | Juego integrado con positivos elegibles | Hasta 50 / propia o null / número de positivos |
| SIN_PARTICIPANTES | Juego integrado sin positivos elegibles | [] / null / 0 |
| NO_DISPONIBLE | Memoria o Batallas, todavía no integradas | [] / null / null (no afirma un total consultado) |

Los seis juegos integrados son Cima/SUMMIT, Guardián/GUARDIAN,
Rescate/STAR_RESCUE, Trivia/TRIVIA_RUSH, Duelo/GHOST_DUEL y Tira/TUG_OF_WAR.
El catálogo incluye los ocho enums. Su disponibilidad indica capacidad integrada,
**no despliegue ni admisión**. Apagar admisión no borra balances ni su ranking.
I2-1 no consulta ni modifica flags.

## Identidad y privacidad

Cada entrada pública contiene exclusivamente posicion, alias, xp y
esUsuarioActual. No incluye UUID, correo, nombre, institución, fechas internas,
respuestas, hash ni metadata. La identidad propia muestra «Tú».

[crearAliasRanking](../src/ranking/ranking.alias.ts) extrae sin cambiar el algoritmo
HMAC legacy: mismo dominio `ranking-v1`, alcance GLOBAL para competitivo,
catálogo/número y resolución de secreto. Legacy conserva GLOBAL/INSTITUCION.
Los seudónimos no son alias de perfil ni identificadores únicos: pueden colisionar,
no se usan para ordenar y cambian si se rota el secreto.
La precedencia heredada es RANKING_ALIAS_SECRET, JWT_SECRET y fallback de desarrollo;
no certifica privacidad productiva con un secreto público. Antes de activar se
requiere secreto privado estable y verificación operativa B1/B2. No se leen .env reales.

El usuario propio se recibe como **contexto interno confiable** en la proyección
aislada. I2-3 lo obtendrá de autenticación, nunca de userId en query/body.

## Pruebas y continuidad

[Contrato](../src/ranking/competitive-ranking.contract.ts) y
[pruebas aisladas](../src/ranking/competitive-ranking.contract.spec.ts): población,
orden, TOP/posición 51, aislamiento, anomalías, estados, privacidad, parámetros
y reutilización real del alias en RankingService legacy. La proyección en memoria
es una referencia de contrato, no una consulta de producción ni verificador deportivo.
No está registrada como proveedor/controlador ni escribe XP.

El lector I2-2 está implementado y probado localmente en la sección vigente superior.
I2-3: autenticación/HTTP; I2-4: Flutter.
No se integran Memoria/Batallas, ni premios PR-I3, perfiles PR-I4 o instituciones PR-I6.
Migraciones remotas, rol/RLS, durabilidad, capacidad y B1/B2 siguen pendientes.
