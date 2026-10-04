# PR-I1 V1 — relevo técnico de SaberPlus-Backend

## Continuación operativa local CP19

Base documental confirmada e7cae17, que conserva el checkpoint funcional 97ebfc4.
CP19 incorpora pruebas B1/B2 en PostgreSQL desechable, sin activación
ni cambios a contratos. Consultar la [matriz operativa actual](PR_I1_COMPETITIVE_INFRASTRUCTURE.md#checkpoint-19-local--b1b2-sin-autorización-productiva)
para resultados, límites y próximos pasos. Los datos inferiores conservan el
punto de relevo funcional; no implican evidencia productiva.

## Estado confirmado y alcance

Referencia de relevo: **97ebfc4**, rama **feat/pr-i1-competitive-infrastructure**.
Inspección del 4 de octubre de 2026: HEAD y referencia local origin coinciden;
árbol limpio antes de esta tarea documental. Main permanece en **fb27225**,
también merge-base: la rama contiene **18 commits adicionales**. El propietario
confirma los 18 checkpoints publicados en GitHub; no se hizo fetch ni consulta
remota en esta tarea. El commit 18 incluye integración Tira y corrección P1.
PR-I1 no está fusionado a main. Este documento se preparó a partir del checkpoint funcional 97ebfc4; cualquier commit documental posterior deberá verificarse mediante Git.

Tira A1–A8 está implementado, integrado internamente y validado localmente.
Eso **no acredita despliegue ni autoriza activación productiva**. No hay código
funcional pendiente sin commit al iniciar; sí pendientes operativos y módulos
futuros. El estado de Flutter no fue inspeccionado: no afirmar que está actualizado.

Estructura: `backend/` contiene NestJS, Prisma, tests y runners; `admin/` el panel
administrativo; `render.yaml` configuración de despliegue, no prueba de despliegue.
El cliente Flutter pertenece a otro repositorio.

Lectura de referencia, sin repetir auditorías generales:

- [Infraestructura, contratos e historial de checkpoints](PR_I1_COMPETITIVE_INFRASTRUCTURE.md).
- [Tira: A1–A8, replay, recuperación P1 y bloqueantes B1/B2](PR_I1_TIRA_AFLOJA_AUDITORIA.md).
- [Trivia/Duelo: evidencia, privacidad y decisiones](PR_I1_TRIVIA_DUELO_AUDITORIA.md).
- [README de la API](../README.md) y [índice backend](README.md), con advertencia de antigüedad abajo.

## Arquitectura y archivos de entrada

| Responsabilidad | Evidencia concreta |
|---|---|
| Liquidación individual interna, idempotencia, locks, corrección y posting | [CompetitiveService](../src/competitive/competitive.service.ts); no endpoint público de pago |
| Contratos y registro de verificadores confiables | [competitive.contracts.ts](../src/competitive/competitive.contracts.ts), [CompetitiveModule](../src/competitive/competitive.module.ts) |
| Reglas puras, half-up entero y versión 1 | [competitive.rules.ts](../src/competitive/competitive.rules.ts); fórmulas existentes no autorizan un motor ni admisión |
| Fuentes canónicas y temporada/presencia | [competitive.source.ts](../src/competitive/competitive.source.ts), [competitive.policy.ts](../src/competitive/competitive.policy.ts) |
| Solo y Trivia/Duelo autoritativos | [competitive.solo.ts](../src/competitive/competitive.solo.ts), [competitive.trivia.ts](../src/competitive/competitive.trivia.ts) |
| Recuperación Solo y Trivia/Duelo | [competitive.reconciler.ts](../src/competitive/competitive.reconciler.ts), [competitive.trivia-reconciler.ts](../src/competitive/competitive.trivia-reconciler.ts) |
| Kernel de par preparatorio aislado | [CompetitivePairProtocol](../src/competitive/competitive.pair-protocol.ts); no proveedor de producción ni sustituto del replay real |
| Replay deportivo y presencia exactos de Tira | [TugSportsReplay](../src/competitive/competitive.tug-replay.ts), [replay de presencia](../src/competitive/competitive.tug-presence-replay.ts), [clasificación terminal](../src/competitive/competitive.tug-terminal.ts) |
| Liquidación precisa del par real | [CompetitiveTugPairProtocol](../src/competitive/competitive.tug-pair-protocol.ts), consumidor interno de loadPreciseLockedPair |
| Recuperación durable del par | [TugCompetitiveReconciler](../src/competitive/competitive.tug-reconciler.ts) |
| Motor, admisión, presencia y testigo independiente | [TiraAflojaService](../src/tira-afloja/tira-afloja.service.ts), [admisión](../src/tira-afloja/tira-afloja.admission.ts), [presencia](../src/tira-afloja/tira-afloja-presence.service.ts), [testigo R](../src/tira-afloja/tira-afloja-visibility.witness.ts) |
| Persistencia | [schema.prisma](../prisma/schema.prisma): EventoXpCompetitivo, BalanceCompetitivo, HistorialInstitucionCompetitiva y TugCompetitiveSettlement |

Ledger es fuente de verdad; balance es proyección competitiva independiente de
Usuario.xpTotal. Idempotencia por fuente/participante, no por rulesVersion:
cambiar reglas no permite pagar de nuevo. Balance tiene piso cero, secuencia y
alcanzadoEn; delta aplicado distinto de cero actualiza este último. Se conservan
saldo antes/después y deltas nominal/aplicado. No reconstruir invalidaciones
mediante una resta: INVALIDACION está retirada; corrección administrativa explícita
no equivale a replay de invalidación.

Camino Tira:

```text
Cierre deportivo durable y admisión persistida V1/temporalVersion=1
→ identidad compartida TUG_MATCH y participantes originales
→ advisory de par → Usuario ordenados → presencia/partida
→ loadPreciseLockedPair desde PostgreSQL
→ hash y dos decisiones coherentes
→ ledger/balances y recibo en el mismo COMMIT
→ recuperación idempotente desde el origen y TugCompetitiveSettlement
```

Neutrales no crean eventos RESULTADO ficticios ni balances. Un par puede tener
una decisión neutral sin evento y otra penalizable: ambas se resuelven atómicamente.
Sin B no se inventa pareja: solo se admite resolución cero de A con cierre
pre-ACTIVA/global verificable; otros casos ambiguos quedan bloqueados.

## Juegos, rutas y controles

| Juego | Implementación confirmada | Admisión servidor, default false |
|---|---|---|
| Cima, Guardián, Rescate (Solo) | Verificadores, liquidación y recuperación | COMPETITIVE_SOLO_ENABLED |
| Trivia Rush | Snapshot, respuestas, modo, presencia, verificador y recuperación | COMPETITIVE_TRIVIA_ENABLED |
| Duelo fantasma | Mismo motor/fuente TRIVIA_ATTEMPT, modo GHOST_DUEL persistido y fantasma fijo | COMPETITIVE_GHOST_ENABLED |
| Tira y afloja | A1–A8; replay preciso, par y worker internos | COMPETITIVE_TUG_ENABLED |
| Memoria | Fórmula/diseño; sin autoridad backend competitiva ni integración | No habilitar XP local |
| Batallas | Motor deportivo existente; sin integración competitiva PR-I1 | Banco completo y evidencia autoritativa antes de integrar |

Solo el literal servidor `true` permite admisión; no se verificó configuración
productiva. Apagar nuevas admisiones no cancela liquidaciones/recuperación de
orígenes admitidos. No promover históricos ni intentos V1 preparados sin admisión.
En Tira, nuevas búsquedas elegibles se clasifican por servidor; colas separadas
por clasificación persistida, A original y B congelado en primera incorporación.

Registro individual real: tres adaptadores Solo y un verificador común Trivia/Duelo.
TUG_MATCH **no está registrado individualmente**: CompetitiveService.settle lo
rechaza. CompetitiveModule sí registra protocolo preciso y worker de par internos;
esto no significa flag activado ni endpoint de pago público.

Rutas deportivas reales (paths de controllers; respetar cualquier prefijo de API
configurado en main): [TriviaRushController](../src/trivia-rush/trivia-rush.controller.ts)
expone `/trivia-rush/intentos`, respuestas, potenciadores, finalizar y abandonar;
Duelo comparte ese controller, no inventar `/duelo` independiente.
[TiraAflojaController](../src/tira-afloja/tira-afloja.controller.ts) expone
`/tira-afloja/emparejamiento`, `/:id/listo`, `/:id/respuestas`, `/:id/abandonar`
y consultas. Ver [Cima](../src/summit/summit.controller.ts),
[Guardián](../src/guardian/guardian.controller.ts) y
[Rescate](../src/star-rescue/star-rescue.controller.ts) para contratos Solo.

## Decisiones V1 que deben preservarse

La fuente normativa detallada son las auditorías enlazadas y las reglas versionadas.
Resumen de puntos que suelen inducir regresiones:

- XP determinista half-up: misma evidencia y versión, mismo importe; no random.
  Trivia `(70*C+30*M)/Q`, Duelo `80*C/Q` más 20/10/0; Q servidor congelado 10–30.
  Fantasma ausente exige outcome=null y solo base; presente exige resultado válido.
  Primera partida no tiene bono. Igual puntaje es EMPATE sin desempates.
  Segunda oportunidad no final no corta M; error definitivo y salto sí.
- Tira normal R certificado >0: `roundHalfUp(60*C/R)+40/20/0`; R=0 ambos cero.
  Respuestas incorrectas cuentan como acciones, no como C. No pagar terreno recuperado.
- Participantes originales, snapshot y marca ACTIVA son inmutables. Tiempo Tira
  PostgreSQL timestamp(6)/epoch µs, sin conversión silenciosa a Date. Contrato
  VerifiedTugPairTerminal distinto de VerifiedTerminal Date de Solo/Trivia/Duelo;
  no reutilizar el adaptador antiguo para liquidar Tira.
- Testigo R: pareja confirmada, backend y transacción independientes, observación
  después de locks y antes del deadline original. COMMIT del certificado puede
  ocurrir después: lo certificado es observación oportuna, no timestamp de COMMIT.
- GRACE Tira 30 s, Trivia/Duelo 20 s; reloj no pausa ni amplía. Nuevas acciones
  V1 requieren OPEN autenticado vigente; retry aceptado conserva identidad/payload.
  UNKNOWN no demuestra desconexión ni abandono. Múltiples sockets y leases importan.
- Meta/preguntas agotadas antes de gracia tienen prioridad; plazo global anterior
  o igual al fin de gracia prevalece; abandono cuando gracia vence primero.
  Reconexión tardía no reabre terminal. EXPLICIT_PRE_ACTIVE: cero y sin penalización.
  EXPLICIT_ACTIVE/GRACE propio probado durante ACTIVA: nominal -15, aplicado con piso.
- Beneficiario con cero acciones o evidencia insuficiente: cero XP positivo.
  Con acciones y suficiencia: `min(80,roundHalfUp(60*C/Qpartida)+20)`.
  EXPLICIT exige OPEN histórico válido al cierre, sin gracia/abandono propio;
  GRACE exige evidencia posterior a desconexión rival, sin gracia propia.
  No inferir presencia de victoria deportiva ni del socket actual.
- SIMULTANEOUS_CANCELLED solo para ambas gracias confirmadas al mismo µs sin
  cierre prioritario: CANCELADA, nadie gana, cero XP y cero penalizaciones.
  GLOBAL_EXPIRED neutral no inventa resultado ni premio.
- Temporada: año America/Bogota del terminal servidor, incluso si cruza año.
  Institución: historial vigente en ese instante, no institución actual al pagar;
  nunca transferir XP previo ni inventar cobertura histórica ausente.

## Recuperación y diagnóstico P1

TugCompetitiveSettlement distingue PENDING, SETTLED, RESOLVED e INVALID.
Origen terminal admitido es cola durable; recibo incluye terminalUs, hash y decisiones.
Caída durante transacción revierte todo; caída tras COMMIT antes del acuse no repaga.
Dos instancias/reintentos usan locks e identidad comunes. SETTLED/RESOLVED son finales.

Escaneo cada 5 s, hasta 25 pendientes elegibles por retryAt. Error transitorio:
reintento de un minuto. Certificado R ausente: **PENDING y reintento de cinco minutos**,
incluso después del deadline; lastError/attempts conservan diagnóstico. Certificado
huérfano visible o evidencia positivamente contradictoria: INVALID para revisión.
El reloj solo no demuestra ausencia definitiva. Si se confirma un certificado
válido observado oportunamente, se recupera en el siguiente reintento; sin él
no hay recompensa, fabricación ni backfill de R. El testigo original no cambia.

## Validación local comunicada del checkpoint 18

No son resultados productivos ni una nueva ejecución de suites durante este relevo.

| Validación | Último resultado comunicado |
|---|---|
| Build | exit 0 |
| Jest competitivo | 276/276, 18 suites, 27,687 s |
| Jest completo | 1157/1157, 107 suites, 92,09 s |
| PostgreSQL | 304/304, 19 archivos, 776,049 s |
| npm audit --omit=dev | 0 vulnerabilidades reportadas |
| git diff --check | correcto |

La auditoría Tira conserva errores intermedios, causas demostradas y correcciones.
P1 primero dio 302/304 por esperas de fixtures sobre un deadline del padre que
se limpia al cerrar; corregidas para usar R inmutable y comprobar vencimiento SQL.
No se relajaron aserciones. Las incidencias históricas no se cierran por un verde.

Pruebas clave: [liquidación real](../test/competitive-tug-settlement-postgres.test.cjs),
[recuperación y certificado tardío](../test/competitive-tug-recovery-postgres.test.cjs),
[worker unitario](../src/competitive/competitive.tug-reconciler.spec.ts),
[testigo R](../test/competitive-tug-visibility-postgres.test.cjs),
[autoridad temporal](../test/competitive-tug-temporal-postgres.test.cjs) y
[contrato A3–A5](../test/competitive-tug-contract-postgres.test.cjs).

Repetición local desde backend, con Node 24.14.1/npm 11.11.0 según package.json,
dependencias del lockfile (`npm ci`) y Prisma generado por build:

```powershell
npm run build
npm test -- --runInBand competitive
npm test -- --runInBand
node tool/test_competitive_postgres.mjs
npm audit --omit=dev
git diff --check
```

El [runner PostgreSQL](../tool/test_competitive_postgres.mjs) requiere Docker Engine
local accesible, contexto local válido, imagen postgres:16 (disponible o descargable),
puertos loopback y permiso para crear sus propios recursos temporales. No acepta
argumentos ni URL externa; ignora credenciales de entorno productivas, no lee .env,
valida identidad/marker del recurso y aplica SQL versionado en base desechable.
Ejecuta 19 archivos secuencialmente, límite 120 s por archivo, con resumen estricto:
fallidos/cancelados/omitidos/TODO/incompletos hacen fallar el runner. Solo elimina
sus recursos; nunca reutilizar/detener/limpiar un contenedor PostgreSQL ajeno.
No ejecutar migrate deploy contra una URL heredada para repetir estas pruebas.
TLS debe permanecer habilitado; resolver confianza del certificado sin desactivarlo.

## Migraciones y seguridad

Orden real de migraciones PR-I1, tomadas del árbol versionado (sus nombres no
prueban fecha de despliegue). Las migraciones deportivas e institucionales previas
también son dependencias: en una base nueva usar toda la secuencia del repositorio,
no aplicar aisladamente esta lista.

- [20260930120000_competitive_infrastructure](../prisma/migrations/20260930120000_competitive_infrastructure/migration.sql).
- [20260930180000_competitive_solo_runtime](../prisma/migrations/20260930180000_competitive_solo_runtime/migration.sql).
- [20261001190000_trivia_authoritative_evidence](../prisma/migrations/20261001190000_trivia_authoritative_evidence/migration.sql).
- [20261002190000_trivia_presence](../prisma/migrations/20261002190000_trivia_presence/migration.sql).
- [20261002230000_trivia_competitive_v1](../prisma/migrations/20261002230000_trivia_competitive_v1/migration.sql).
- [20261003010000_tug_authoritative_evidence](../prisma/migrations/20261003010000_tug_authoritative_evidence/migration.sql).
- [20261003160000_tug_presence](../prisma/migrations/20261003160000_tug_presence/migration.sql).
- [20261003220000_tug_round_visibility](../prisma/migrations/20261003220000_tug_round_visibility/migration.sql).
- [20261004010000_tug_competitive_admission](../prisma/migrations/20261004010000_tug_competitive_admission/migration.sql).
- [20261004160000_tug_temporal_authority](../prisma/migrations/20261004160000_tug_temporal_authority/migration.sql).
- [20261005120000_tug_pair_settlement](../prisma/migrations/20261005120000_tug_pair_settlement/migration.sql).

CP18: 20261005120000_tug_pair_settlement amplía fechaEfectiva a timestamptz(6),
conversor entero exacto, tabla/constraints/recibos, RLS y revocación de accesos.
Fue validada **solo en PostgreSQL local desechable**, no aplicada remotamente en
estas rondas. El backend necesita esquema compatible incluso con flags apagados,
porque recuperación y correcciones lo usan; no ocultar errores de esquema faltante.
No editar migraciones confirmadas. Este documento no autoriza ninguna aplicación remota.

## Bloqueantes y continuidad

| Grupo | Pendiente y criterio antes de activación |
|---|---|
| B1: seguridad y durabilidad | Verificar rol real de DATABASE_URL, owner/BYPASSRLS o grants/policy privada; backend puede operar y anon/authenticated no acceden directamente. Revisar WAL/durabilidad física, respaldo/restauración, migraciones autorizadas y esquema |
| B2: operación | Capacidad, pools, recuperación bajo carga, multiinstancia y publicación deportiva distribuida; las pruebas de dos clientes no certifican todo el despliegue |
| Incidencias históricas | 34 fallos HISTORICAL_MEMBERSHIP_UNKNOWN y vencimiento intermitente de Rescate: mantener incertidumbre; no atribuir causa ni declararlos resueltos por pruebas posteriores |
| Otros módulos | Memoria necesita motor backend autoritativo; Batallas necesita integración completa y banco 8/10 sin degradación; no iniciar aquí |
| Otros componentes | Revisar contratos propios de ADMIN, aprendizaje, repaso, pagos y Flutter antes de planear ensayos/despliegue; este relevo no certifica su estado completo |

Secuencia mínima de continuidad:

1. Verificar checkout y leer este relevo y auditorías originales. Presentar plan
   acotado; no repetir auditoría general de A1–A8 ni reconstruir checkpoints.
2. Con autorización específica, resolver B1/B2 y documentar evidencia operativa.
   Si aparece un defecto backend reproducible, tratarlo separadamente con prueba
   mínima, preservando contratos y migraciones confirmadas.
3. Solo tras autorización: respaldo/revisión → rol/RLS → migraciones compatibles
   → esquema → backend con flags apagados → pruebas operativas → eventual activación
   explícita posterior. No confundir implementado, validado, integrado y activable.
4. Memoria/Batallas son futuros módulos con alcance propio. No iniciar PR-I2,
   activar flags ni modificar Flutter sin decisión explícita del propietario.

## Discrepancias documentales encontradas

README raíz e índice docs aún describen quince checkpoints/ronda 16; README API
contiene resumen similar. Cabeceras de auditorías e infraestructura conservan
HEAD af2374e, diecisiete checkpoints y CP18 local/SIN COMMIT, aunque ese contenido
ya forma parte de 97ebfc4. Hay resultados CP18 302/302 anteriores a P1: el último
es 304/304. Los registros anteriores sirven como historial, no como estado vigente.
Los marcadores preparatorios del contrato (por ejemplo settlement=NOT_INTEGRATED)
no sustituyen la inspección del consumidor preciso y del módulo interno actual.

Por alcance documental mínimo se añade aviso/enlace de estado confirmado en
README backend e infraestructura; no se reescriben otras auditorías ni índices.
Para decidir continuidad prevalecen el commit inspeccionado, este relevo y las
reglas posteriores aprobadas. No reinterpretar comentarios históricos como
activación productiva ni como ausencia de la integración de par confirmada.

## Prompt de continuidad para otro Codex

> Trabajamos en SaberPlus-Backend, PR-I1 V1. Lee primero backend/docs/PR_I1_RELEVO.md
> y consulta las tres auditorías originales enlazadas. Verifica rama
> feat/pr-i1-competitive-infrastructure, HEAD confirmado 97ebfc4 (o sucesor
> expresamente aprobado), referencia origin, relación con main y cambios locales.
> Conserva todo trabajo existente. A1–A8 de Tira están confirmados y validados
> localmente; producción no está autorizada. Presenta un plan acotado y sus
> criterios de aceptación antes de modificar código. No repitas auditorías
> generales ni rehagas checkpoints. No actives flags, inicies PR-I2/Memoria/Batallas,
> modifiques Flutter, ejecutes migraciones remotas o despliegues sin decisión
> explícita del propietario. No commit/push/merge, reset/clean ni recursos Docker
> ajenos. Identifica evidencia faltante sin inventar contratos o resultados.
