# PR-I2 — rankings competitivos por juego y temporada

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

I2-2: lector de BalanceCompetitivo/Usuario con un único snapshot coherente para
TOP, posición y total; misma población/orden, sin recalcular XP. Medir consulta
antes de proponer índices. I2-3: autenticación/HTTP; I2-4: Flutter.
No se integran Memoria/Batallas, ni premios PR-I3, perfiles PR-I4 o instituciones PR-I6.
Migraciones remotas, rol/RLS, durabilidad, capacidad y B1/B2 siguen pendientes.
