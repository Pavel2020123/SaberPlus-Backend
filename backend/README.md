# API de SaberPlus

> Conciliación del relevo, 29 de septiembre de 2026: las referencias «sigue
> MA-3C», «sigue JN-2C» y «pendiente de JN-1C» inferiores describen el cierre
> histórico de cada entrega backend. Las tres integraciones Flutter ya existen
> en el HEAD auditado; MA-2A/B/C y MA-3A/B/C están implementadas localmente.
> Ensayos integrados y despliegue siguen sin acreditarse en esta auditoría.
> Consultar la Ruta vigente del equipo en Flutter (`docs/ETAPAS_PENDIENTES.md`)
> y su auditoría de relevo para Flutter. Las decisiones PR-I1 V1 ya están aprobadas;
> consultar el [índice backend vigente](docs/README.md) para los checkpoints y gates.

## Estado competitivo PR-I1 V1

Nueve checkpoints están confirmados hasta `3d0e625`. La décima ronda prepara y
audita XP Tira, sin registrarlo ni habilitarlo: el contrato de locks del par y la
certificación de R requieren resolución. La auditoría enlazada conserva las
decisiones deportivas, pruebas actuales e historial de validaciones.
PR-I1 no está fusionado a main. Código implementado no significa desplegado ni
activado: no se aplicaron migraciones remotas en esta revisión; la nueva evidencia
Tira se prueba únicamente en PostgreSQL desechable local.

`COMPETITIVE_SOLO_ENABLED` controla Cima/Guardián/Rescate;
`COMPETITIVE_TRIVIA_ENABLED` controla Trivia Rush y `COMPETITIVE_GHOST_ENABLED`
Duelo. Todos apagados por defecto: solo el literal servidor `true` permite nuevas
admisiones. El flag solo no autoriza Trivia/Duelo. Apagarlos no bloquea cierre o
liquidación de intentos previamente admitidos; no hay conversión retroactiva.

[Infraestructura, checkpoints y orden de migraciones](docs/PR_I1_COMPETITIVE_INFRASTRUCTURE.md)
y [auditoría de Trivia/Duelo y validaciones](docs/PR_I1_TRIVIA_DUELO_AUDITORIA.md)
son las referencias de esta rama. Siguen pendientes rol PostgreSQL/RLS de
producción, activación/despliegue autorizados, causa histórica de los 34 fallos
e incidencia de Rescate. Tira, Memoria y Batallas siguen sin integración
competitiva; no comienza PR-I2. Aplicar/verificar el esquema requerido antes del
backend incluso con flags apagados; no usar los comandos de despliegue como
autorización para ejecutar migraciones remotas.

[Auditoría de Tira y afloja](docs/PR_I1_TIRA_AFLOJA_AUDITORIA.md): precedencia
aprobada, snapshot original/R durables y brechas restantes de presencia/cierre.
No se registra un verificador ni se habilita XP de Tira en esta preparación.

MA-3B: [Agenda y sincronización del repaso diferido](DEFERRED_REVIEW.md).
Implementada/probada localmente: API privada, recibos idempotentes y migración
con RLS. Sin despliegue en Supabase. Sigue MA-3C (UI y ciclo de sincronización Flutter).

MA-2A: [Mapa de aprendizaje — reglas y API](LEARNING_MAP.md), relaciones orientativas
entre subtemas con control de ciclos/concurrencia. Implementado y probado localmente;
migración nueva no desplegada. MA-2B panel y MA-2C Flutter también tienen entrega
local; ensayo real sigue pendiente.

MA-1: [Cobertura básica del banco](BANK_COVERAGE.md), consulta ADMIN por subtema,
dificultades y explicaciones faltantes. Implementada y probada localmente; reportes
académicos y ensayo desplegado pendientes. No requiere nueva migración.

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

## Escudo del conocimiento — retirado

Retirado por decisión del propietario el 27 de septiembre: sin módulo ni motor.
Las rutas antiguas responden 410, sin acceder a base. Modelo/migración se conservan
solo como historial legado, sin borrar partidas. El retiro en Render requiere
desplegar esta versión. [Antecedente histórico](KNOWLEDGE_SHIELD.md).

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
