# SaberPlus Backend

> Estado del relevo, 29 de septiembre de 2026: MA-2A/B/C y MA-3A/B/C tienen
> implementación local en backend, ADMIN (MA-2) y Flutter; JN-1C/JN-2C también
> existen. No acredita migraciones, despliegue ni ensayo físico. Los apartados
> editoriales históricos inferiores no definen la siguiente etapa global:
> el flujo actual `/admin/simple` guarda/publica directamente con permisos y
> validaciones; no hay que reponer la revisión editorial histórica obligatoria.
> Consultar la Ruta vigente del equipo en Flutter (`docs/ETAPAS_PENDIENTES.md`)
> y `docs/AUDITORIA_RELEVO_2026-09-28.md` de ese repositorio para Flutter. PR-I1
> ya tiene seis checkpoints confirmados y una preparación de Tira local sin commit;
> su estado backend vigente está en el [índice de documentación](backend/docs/README.md).

API oficial de SaberPlus. Centraliza autenticacion, permisos, contenido
academico, diagnosticos, intentos, calificacion, gamificacion, instituciones y
reglas de negocio. La aplicacion Flutter no accede directamente a PostgreSQL.

## Estructura

- `backend/`: API NestJS, Prisma y migraciones versionadas.
- `render.yaml`: Blueprint del ambiente de staging en Render.
- `admin/`: panel editorial 7F-C3-D1, con acceso ADMIN, catálogo, editores y
  revisión/publicación en demo. Nuevas escrituras reales apagadas hasta D2.
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

PR-I1 competitivo V1 sigue abierto y sin fusionar a main. La infraestructura y
Cima/Guardián/Rescate y Trivia/Duelo están versionados hasta `ebe40e3`.
La preparación de Tira sigue local y sin XP. Esto no acredita despliegue, migraciones
remotas ni activación para usuarios. Los tres flags de admisión están apagados
por defecto; apagar nuevas admisiones permite recuperar/liquidar las existentes.
Consultar [checkpoints, flags y dependencias](backend/docs/PR_I1_COMPETITIVE_INFRASTRUCTURE.md)
y [auditoría, pruebas e incidencias](backend/docs/PR_I1_TRIVIA_DUELO_AUDITORIA.md).
La [auditoría de Tira](backend/docs/PR_I1_TIRA_AFLOJA_AUDITORIA.md) distingue
correcciones actuales de los requisitos pendientes de integración competitiva.

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

