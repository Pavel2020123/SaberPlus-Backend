# SaberPlus Backend

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

## Desarrollo local

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

