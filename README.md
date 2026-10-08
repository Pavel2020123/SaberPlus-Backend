# SaberPlus Backend

> Actualización del 8 de octubre: criterios funcionales de I2-5 revisados tras
> recorrido Android; limpieza operativa y QA-1 pendientes. [IC-1A Cima](backend/docs/IC1_CIMA.md)
> validado localmente con Android/API/ledger: un evento real de 100 XP,
> recuperación/red/reintento, OFF y normal sin XP. [IC-1B1 Guardián](backend/docs/IC1_GUARDIAN.md)
> implementado con 34 tests; IC-1B2 local acredita victoria/100 XP únicos,
> recuperación/reintento/ranking y normal sin XP; derrota +30 por 3 aciertos,
> abandono −10, saldo final120. IC-1B local validada; sigue IC-1C Rescate.
> Decisión vigente: un commit por juego después de pruebas/documentación;
> revisar cambios acumulados, sin push automático.
> Solo herramientas de ensayo/control IPC modificadas; sin cambios de runtime
> productivo, migraciones remotas ni activación productiva. Esta
> actualización prevalece sobre los antecedentes del 7 siguientes.

> Estado vigente, 7 de octubre de 2026: PR-I1 y PR-I2 hasta I2-4 integrados.
> I2-5 tiene regresión PostgreSQL e integración HTTP documentadas; falta
> recorrido Android y cierre de criterios. Panel normal 88/88, audit producción
> 0 y lint 603 errores/150 avisos en la revisión del día 7.
> [Conciliación, ruta IC-1/2/3 y límites](backend/docs/CONCILIACION_2026_10_07.md).
> La fuente global es docs/ETAPAS_PENDIENTES.md del repositorio Flutter.
> Main autorizado, sin publicación automática ni operaciones remotas.

> Estado del relevo, 29 de septiembre de 2026: MA-2A/B/C y MA-3A/B/C tienen
> implementación local en backend, ADMIN (MA-2) y Flutter; JN-1C/JN-2C también
> existen. No acredita migraciones, despliegue ni ensayo físico. Los apartados
> editoriales históricos inferiores no definen la siguiente etapa global:
> el flujo actual `/admin/simple` guarda/publica directamente con permisos y
> validaciones; no hay que reponer la revisión editorial histórica obligatoria.
> Consultar la Ruta vigente del equipo en Flutter (`docs/ETAPAS_PENDIENTES.md`)
> y `docs/AUDITORIA_RELEVO_2026-09-28.md` de ese repositorio para Flutter. PR-I1
> ya tiene quince checkpoints confirmados hasta 83d53da; la ronda 16 local prepara ACTIVA exacta y autoridad temporal Tira, con contrato de liquidación bloqueado, flag apagado y sin XP;
> su estado backend vigente está en el [índice de documentación](backend/docs/README.md).

API oficial de SaberPlus. Centraliza autenticacion, permisos, contenido
academico, diagnosticos, intentos, calificacion, gamificacion, instituciones y
reglas de negocio. La aplicacion Flutter no accede directamente a PostgreSQL.

## Estructura

- `backend/`: API NestJS, Prisma y migraciones versionadas.
- `render.yaml`: Blueprint del ambiente de staging en Render.
- `admin/`: panel ADMIN, catálogo y editores. Flujo simple: guardar válido publica
  directamente; demo en memoria separada de API real. Ensayo desplegado D3 pendiente.
  Instrucciones en [admin/README.md](admin/README.md).
- **7F-C3-D2-A:** escrituras heredadas retiradas y bloqueo editorial común por
  área. Cambio de compatibilidad HTTP 410; no desplegado automáticamente.
  [Rutas y condiciones de despliegue](backend/EDITORIAL_LEGACY_RETIREMENT.md).
- **7F-C3-D2-B:** indexación por lotes del legado con vista previa, revisión,
  confirmación y reportes de duplicados. Escrituras apagadas por defecto; no
  publica ni reclasifica. [Procedimiento y límites](backend/EDITORIAL_LEGACY_INDEX.md).
- **7F-C3-D2-C:** reclasificación revisada de preguntas sin uso registrado,
  dentro de la misma área y sin publicar. Bloquea contenido usado/publicado;
  escrituras apagadas por defecto. [Contrato y límites](backend/EDITORIAL_RECLASSIFICATION.md).
- **7F-C3-D2-D:** API especializada para guardar/retirar CLOZE en borradores
  sin uso, validación de espacios y opciones y revisión previa a publicar.
  Compatible con Flutter; publicación sigue apagada. Interfaz añadida en D2-E.
  [Contrato y límites](backend/EDITORIAL_CLOZE.md).
- **7F-C3-D2-E:** formularios CLOZE y herramientas de lotes, coincidencias y
  reclasificación integrados en el panel, con demo aislada. Prueba visual y
  PostgreSQL pendientes. [Recorrido de prueba](admin/EDITORIAL_TOOLS.md).
- **7F-C3-D2-F:** ejecutor de PostgreSQL temporal y pruebas de SQL, bloqueos,
  conflictos, rollback y uso histórico. No conecta a bases existentes ni activa
  banderas reales. [Repetir pruebas y límites](backend/EDITORIAL_POSTGRES_TESTS.md).

## Desarrollo local

PR-I1 integrado y PR-I2 hasta I2-4 fusionados. Completar I2-5 sin rehacer
infraestructura ni considerar pendiente toda la regresión. Los clientes
competitivos y Memoria/Batallas tienen entregas IC-1/2/3 explícitas.
Consultar [estado actual](backend/docs/CONCILIACION_2026_10_07.md) y
[contrato de ranking](backend/docs/PR_I2_RANKINGS.md).
Integración no acredita despliegue, migraciones remotas ni activación.

Requisitos: Node.js 24 y PostgreSQL compatible con las migraciones Prisma.

```bash
cd backend
npm ci
copy .env.example .env.local
npm run db:generate
npm run start:dev
```

Las credenciales reales se guardan solamente en `.env.local`, Supabase y
Render. Nunca deben incluirse en Git.

## Verificacion

```bash
cd backend
npm run db:validate
npm run build
npm test -- --runInBand
```

## Despliegue

Render ejecuta el servicio desde `backend/`. Las migraciones se aplican de
forma controlada con `npm run db:deploy` antes de desplegar una version que las
requiera. El ambiente de desarrollo usa el proyecto Supabase `saberplus-dev`;
produccion tendra un proyecto y secretos independientes.

