# PR-I2 — rankings competitivos por juego y temporada

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

### Continuidad I2-3

Registrar/invocar el lector desde una API autenticada separada de `/ranking`;
UUID propio exclusivamente del JWT, nunca query/body. Mapear errores internos a
respuestas seguras; conservar NO_DISPONIBLE (total null), SIN_PARTICIPANTES (0)
y CON_PARTICIPANTES. No crear nuevos campos públicos sin revisar el contrato.
El lector no oculta balances al apagar admisión y no escribe XP/alcanzadoEn.

B1/B2 siguen abiertos: backend necesita rol con visibilidad completa de balances
y usuarios (no RLS por estudiante), esquema compatible incluso con flags OFF,
secreto HMAC privado estable, presupuesto del pool y validación operativa real.
El ensayo usa dueño de la DB OWNED y no certifica roles/RLS productivos.
Pendientes de I2-3: autenticación, DTO/HTTP, mapping de errores y pruebas de rutas;
sin decisiones de producto nuevas identificadas. Flutter continúa en I2-4.

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
