# API de SaberPlus

Backend NestJS de SaberPlus con Prisma y PostgreSQL. El proyecto fija Node
`24.14.1` y npm `11.11.0` para que el lockfile sea reproducible en Windows y en
el entorno Linux de Render.

## Comandos

JN-2B: [Rescate de estrellas — contrato y pruebas locales](STAR_RESCUE.md).
Backend y migración preparados; sigue JN-2C Flutter remoto. Sin despliegue automático.

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

## Escudo del conocimiento — JN-4B

Backend local de rondas, escudo y páginas; sin XP ni diagnóstico.
Contrato y pruebas en [KNOWLEDGE_SHIELD.md](KNOWLEDGE_SHIELD.md).
Rutas privadas bajo /escudo-conocimiento; cliente remoto y despliegue pendientes.

## Base de datos

- `DATABASE_URL`: conexion de ejecucion utilizada por NestJS.
- `DIRECT_URL`: conexion administrativa utilizada por Prisma CLI.
- `npm run db:status`: consulta migraciones pendientes.
- `npm run db:deploy`: aplica migraciones versionadas.

Flutter consume esta API y nunca se conecta directamente a las tablas.

## Certificados de finalización

Hay seis tipos: una constancia por cada área de Saber 11 y una final por las cinco.
`GET /gamificacion/certificados` devuelve el progreso del alumno autenticado;
`GET /gamificacion/certificados/:tipo/pdf` emite el PDF solo al completar todas
las lecciones publicadas correspondientes. Un área sin lecciones no se habilita.
Los logros permanecen como insignias; la antigua descarga por logro responde 410.

La plantilla HTML y las dos imágenes locales están en
`src/gamificacion/templates/`. Puppeteer instala Chrome durante `npm ci` en
`.cache/puppeteer`, carpeta ignorada por Git; el servicio debe conservar ese
navegador entre instalación y ejecución. En Render, verificar que el build
incluya la carpeta y que el plan permita iniciar Chrome. No hace falta migración
para esta función. El renderer no carga recursos de red.

Vista previa sin datos reales: `npm run build` y
`node tool/preview_course_certificate.cjs`. Las muestras marcadas
“DEMOSTRACIÓN / NO VÁLIDO” quedan en `output/pdf/` y no se versionan.
