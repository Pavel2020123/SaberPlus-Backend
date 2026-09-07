# SaberPlus Backend

API oficial de SaberPlus. Centraliza autenticacion, permisos, contenido
academico, diagnosticos, intentos, calificacion, gamificacion, instituciones y
reglas de negocio. La aplicacion Flutter no accede directamente a PostgreSQL.

## Estructura

- `backend/`: API NestJS, Prisma y migraciones versionadas.
- `render.yaml`: Blueprint del ambiente de staging en Render.
- `admin/`: panel editorial 7F-C3-A, con acceso ADMIN, catálogo y creación de
  temas/subtemas en borrador. Demo e instrucciones en [admin/README.md](admin/README.md).

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

