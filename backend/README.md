# API de SaberPlus

Backend NestJS de SaberPlus con Prisma y PostgreSQL. El proyecto fija Node
`24.14.1` y npm `11.11.0` para que el lockfile sea reproducible en Windows y en
el entorno Linux de Render.

## Comandos

JN-1B: [Salto a la cima — API, reglas y pruebas locales](SUMMIT_CHALLENGE.md).
Migración preparada, sin despliegue; integración Flutter pendiente de JN-1C.

Pasarelas heredadas retiradas el 12 de septiembre de 2026: no hay integración
operativa de ePayco/Wompi. Las rutas antiguas solo responden HTTP 410, sin modificar
pagos. [Alcance, pruebas y despliegue pendiente](PAGOS_HEREDADOS_RETIRADOS.md).

```bash
npm ci
npm run db:generate
npm run db:validate
npm run build
npm test -- --runInBand
```

Para desarrollo, copia `.env.example` como `.env.local` y completa valores
locales. Para staging o produccion, configura los secretos en el proveedor de
despliegue. No guardes contrasenas ni cadenas de conexion reales en Git.

## Base de datos

- `DATABASE_URL`: conexion de ejecucion utilizada por NestJS.
- `DIRECT_URL`: conexion administrativa utilizada por Prisma CLI.
- `npm run db:status`: consulta migraciones pendientes.
- `npm run db:deploy`: aplica migraciones versionadas.

Flutter consume esta API y nunca se conecta directamente a las tablas.
