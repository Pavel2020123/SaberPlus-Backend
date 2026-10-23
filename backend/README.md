# API de SaberPlus

**Nuevo compañero de C2 (no OV-1):** seguir [relevo completo](docs/RELEVO_C5_C2.md)
y [acta C2-D](docs/C5C2D_VALIDACION_LOCAL.md): instalación, cuentas/clave temporal,
Docker/USB, pruebas pendientes y correcciones permitidas en app/backend/panel.

**22 de octubre — ENTREGA PARCIAL C5-C2:** D1–D7 y D8c/d/e conservan aprobación;
D8a reabierto solo por timeout. D8b en curso con teléfono y emulador, sin
aprobación todavía. [Entrega histórica y comandos](docs/C5C2_ENTREGA_PARCIAL.md).
Pavel auditó la entrega parcial; PR Flutter#9/b8253e2 y backend#11/3eb3f59 ya
integrados en main remoto. Nueva revisión en fix/c5-c2-timeout-d8b desde main
actualizado: timeout de Tira local y D8b con dos clientes. C2 sigue abierta.
Flutter corrige eventos Socket.IO con offset de recuperación (9/9 pruebas);
sala confirmada en ambos clientes. El segundo Listo detectó rechazo SQL de
opciones con imágenes: migración corregida y48/48 HTTP/SQL con72 migraciones
solo temporales. Contrato TUG_LOCAL backend validado: tiempo de servidor,
autorización, reintento concurrente y última pregunta sin respuestas ni XP
inventados; Jest5/62, TypeScript y build completo aprobados. Falta integrar
Flutter/conservar pausa y observar D8b; C2 sigue abierta.
D8b posterior ya inició y muestra preguntas/figuras coincidentes en ambos; el
humano detecta contenido fuera del botón. Corrección Flutter localizada,13/13
pruebas online/análisis aprobados; falta observación tras actualizar las APK.

**21 de octubre — [C5-C2-C validada automáticamente](docs/C5C2C_CONSUMIDORES.md):**
contratos/snapshots y Flutter incorporan imágenes opcionales sin cambiar XP ni
romper JSON antiguo.969 Flutter aprobadas/16 opt-in omitidas,128 suites/1.675
backend y44/44 PostgreSQL/HTTP;70 migraciones temporales, ninguna nueva de C2-C.
**Estado histórico del21: C2-D tenía0/8**; prevalece la entrega parcial del22 superior.
Activación apagada por defecto; sin nuevo ensayo Android ni despliegue. C1 conserva5/5.
Entrega C2-C/relevo: app `e833d6b`, backend `cfba7cd`.
Deuda ESLint previa:27 incidencias verificadas en HEAD, descritas en el acta.
Integrada en main local: app `f912880`/backend `09c763b`; sin push nuevo ni cambios OV-1.

**20 de octubre — C5-A/B validadas localmente:23/23 PostgreSQL/HTTP.**
[archivos editoriales privados](docs/C5_ARCHIVOS.md), recibos, metadatos y límites.
Rama `feat/c5-archivos-base`;69 migraciones solo temporales. [Panel C5-B](docs/C5B_PANEL.md)
comprobado en Chromium,124/124 pruebas ADMIN y126/1650 backend. Sigue C5-C, app
y almacenamiento externo. La bandera EDITORIAL_FILES_LOCAL_ENABLED está apagada
por defecto y bloqueada fuera de development/test. No activar ni aplicar la
migración en servicios reales por seguir esta guía. OV-1 se mantiene separado.

Ensayo automático repetible con Docker, sin celular:
`npm run test:editorial-files:postgres`. No acepta URL externa y limpia solo
su contenedor/directorio temporal. [Resultados y límites](docs/C5_ARCHIVOS.md).

**19 de octubre — MA-1R/R4 técnico aprobado:**45/45 integradas PostgreSQL/HTTP,
12/12 humanas, backend121 suites/1567 tras fix de concurrencia, ADMIN109, build/TypeScript y regresión
Flutter920/13 opt-in omitidas/análisis correctos. [Comandos, incidencias y límites](docs/MA1R_R4_VALIDACION_LOCAL.md).
Ejecutar `npm run test:question-reports:postgres` requiere Docker local, no celular
ni URL/contraseña externa; crea/aplica67 migraciones y limpia solo su base temporal.
Retirada del botón y borrador con flecha confirmados: R4 cerrada localmente.
Integrado en main por PR backend #9/app #6 (eef0d40/21757a1); CI backend del PR aprobado.
Sigue preparación local C5; QA-1 Flutter remoto pendiente. Sin SQL remoto/despliegue ni cambios OV-1;
estados anteriores históricos.

**MA-1R/R2:** [backend local y validación](docs/MA1R_R2_BACKEND.md), 121 suites/1.560
aprobadas; build/TypeScript correctos. [R3 app/panel local](docs/MA1R_R3_APP_PANEL.md),
18 de octubre:32 dirigidas Flutter/109 ADMIN aprobadas. Migración sin aplicar; R4 pendiente.
Rutas nuevas no desplegadas; cobertura nueva opt-in reportesVersion=1.

**17 de octubre, estado vigente:** [C4-C10/10 guiones integrados cubiertos](docs/PR_I5_C4_CODIGO.md),
Android+19 HTTP/SQL finales, no10 manuales independientes.66 migraciones solo temporales.
APK corregida instalada, regresión Flutter final893 aprobadas/13 opt-in omitidas
y análisis limpio. [Cierre técnico local consolidado](docs/CIERRE_INSTITUCIONES_LOCAL.md),
backend119 suites/1.470 y panel95/95; commits creados app6bab6be/API7ba93d7/lockbfce42e.
PR app #5/API #8 integrados a main; CI backend del PR y main aprobado. Flutter
analyze limpio y102 dirigidas aprobadas; sin workflow Flutter remoto. [Orden posterior](docs/ESTADO_Y_ORDEN_2026_10_17.md):
MA-1R/R1–R3 locales, sigue R4; OV-1 del compañero en curso sin entrega nueva verificada.
Sin nuevos ensayos físicos/SQL ni despliegue. Auditoría documental en
`docs/estado-post-instituciones`, publicación manual/PR pendientes.
Sin producción. Notas inferiores son antecedentes, no el paso siguiente.

**15 de octubre — C3A/B implementadas; sigue C3C integrado.**
[Solicitudes estudiantiles](docs/PR_I5_C3_SOLICITUDES.md): permisos, historial,
cancelación y decisión transaccional sin promover alumno.37 pruebas nuevas,
regresión1.411/118 suites y14 HTTP/SQL aprobadas; Flutter27 dirigidas.
65 migraciones solo en base temporal. Sin Android C3 ni despliegue remoto.

**14 de octubre: C2C validada localmente.**6/6 HTTP/PostgreSQL y8/8 casos humanos
Android aprobados; migración solo en base temporal propia. Siguen solicitudes
estudiantiles/avisos/código institucional. Observaciones de captura original y
CI Linux pendientes; sin despliegue remoto ni pruebas iOS. [Contrato y relevo](docs/PR_I5_C2_LOGO.md). Notas inferiores históricas.

**12 de octubre — C1C completada localmente:** perfil con15 HTTP/SQL +3 Flutter/API reales
aprobadas, 63 migraciones solo en base temporal, APK instalada. Prueba física 1
aprobada y pruebas 2–10 confirmadas; SQL confirma descarte sin escritura/revisión15.
Siguiente C2, logo institucional. No acredita despliegue Supabase/Render.
[Estado y relevo](docs/PR_I5_C_PERFIL.md).

**10 de octubre — [PR-I5-T1/T2 territorio](docs/PR_I5_T_TERRITORIO.md):** catálogo
DANE/API y persistencia/revisión ADMIN implementados; regresión 1.311 aprobados,
16 casos PostgreSQL reales T2 aprobados y build correcto. Migración solo probada
en base temporal, no desplegada. T3 formularios Flutter/ADMIN implementados el
11 de octubre; T4 filtros implementados y **T5 cerrado localmente** con guion
HTTP/PostgreSQL, panel y Android. Siguiente: perfil institucional y solicitudes
PR-I5. Sin despliegue ni validación iOS. Evidencia/límites en acta territorial.
Prevalece sobre el siguiente paso histórico de las notas inferiores.

**10 de octubre — [PR-I5A, directorio institucional](docs/PR_I5_DIRECTORIO.md):**
listado y detalle autenticados, solo instituciones aprobadas e identidad pública.
Cliente Flutter y recorrido local API/PostgreSQL/Android aprobados; pendientes
territorio y solicitudes estudiantiles. P4-C se conserva.
Rescate local cerrado en `3fdf699`; las secuencias inferiores son antecedentes.

**8 de octubre:** [IC-1A/IC-1A2 Cima](docs/IC1_CIMA.md) validada localmente:
Android/API/ledger real, un evento de 100 XP, recuperación/red/reintento,
admisión OFF y normal sin XP. [IC-1B1 Guardián](docs/IC1_GUARDIAN.md) implementado
en Flutter, 34 tests; IC-1B2 local confirma victoria/100 XP únicos, recuperación,
reintento/ranking y normal sin XP; derrota +30 por 3 aciertos y abandono −10,
saldo final120. IC-1B local validada; siguiente IC-1C Rescate. Control IPC del harness
exclusivamente temporal; sin cambios del runtime productivo ni activación remota.
Criterios funcionales I2-5 revisados; su deuda operativa y QA-1 se conservan.
El resumen del día 7 siguiente es antecedente.

Antecedente: [conciliación del 7 de octubre](docs/CONCILIACION_2026_10_07.md).
I2-5 tiene criterios funcionales Android revisados el 8 de octubre;
limpieza operativa y QA-1 siguen pendientes.
IC-1/2/3 cubren clientes, Memoria y Batallas sin activar servicios.

> Conciliación del relevo, 29 de septiembre de 2026: las referencias «sigue
> MA-3C», «sigue JN-2C» y «pendiente de JN-1C» inferiores describen el cierre
> histórico de cada entrega backend. Las tres integraciones Flutter ya existen
> en el HEAD auditado; MA-2A/B/C y MA-3A/B/C están implementadas localmente.
> Ensayos integrados y despliegue siguen sin acreditarse en esta auditoría.
> Consultar la Ruta vigente del equipo en Flutter (`docs/ETAPAS_PENDIENTES.md`)
> y su auditoría de relevo para Flutter. Las decisiones PR-I1 V1 ya están aprobadas;
> consultar el [índice backend vigente](docs/README.md) para los checkpoints y gates.

## Estado competitivo PR-I1 V1 y PR-I2

PR-I1 fue integrado a main mediante PR #5, merge `5216383`, con 22 checkpoints
funcionales. Incluye infraestructura e integración competitiva local de Cima,
Guardián, Rescate, Trivia Rush, Duelo fantasma y Tira y afloja. Memoria y Batallas
todavía no están integradas competitivamente.

[PR-I2 — I2-1/2/3](docs/PR_I2_RANKINGS.md) incluye contrato, lector PostgreSQL
y API autenticada, fusionados por PR #6 (`66b5aa2`). Flutter I2-4 está fusionada
por PR #3 (`1921ba9`). Sigue I2-5: validación integrada y cierre, todavía pendientes.
El ranking general `/ranking` continúa vigente y separado.

[Relevo PR-I1](docs/PR_I1_RELEVO.md) e
[infraestructura](docs/PR_I1_COMPETITIVE_INFRASTRUCTURE.md) conservan evidencia
e históricos. Todos los flags competitivos permanecen apagados por defecto.
Merge no autoriza despliegue/activación; verificar el esquema aun con flags OFF.
Rol/RLS, durabilidad y B1/B2 productivos, así como las incidencias históricas,
siguen pendientes. No se aplicaron migraciones remotas en estos checkpoints.

MA-3B: [Agenda y sincronización del repaso diferido](DEFERRED_REVIEW.md).
Implementada/probada localmente: API privada, recibos idempotentes y migración
con RLS. MA-3C Flutter implementada localmente; ensayo desplegado pendiente.

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
Backend y JN-2C Flutter implementados localmente; falta ensayo desplegado. Sin despliegue automático.

JN-1B: [Salto a la cima — API, reglas y pruebas locales](SUMMIT_CHALLENGE.md).
Migración preparada; JN-1C Flutter implementada localmente. Ensayo desplegado pendiente.

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
