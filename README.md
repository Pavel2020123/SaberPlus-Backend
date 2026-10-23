# SaberPlus Backend

**Nuevo compañero de C2 (no OV-1):** comenzar por
[relevo operativo completo](backend/docs/RELEVO_C5_C2.md) y
[acta C2-D](backend/docs/C5C2D_VALIDACION_LOCAL.md). Incluye ambos repos,
cuentas/clave temporal, Docker/USB y pruebas; puede corregir Flutter/API/panel
de C2. **22 de octubre: ENTREGA PARCIAL**, D1–D7 y D8c/d/e conservan aprobación;
D8a reabierto solo por timeout. D8b en curso con teléfono y emulador, aún sin
aprobación. [Entrega histórica y comandos](backend/docs/C5C2_ENTREGA_PARCIAL.md).
Pavel auditó la entrega parcial; PR Flutter#9/b8253e2 y backend#11/3eb3f59 ya
integrados en main remoto (fetch verificado). Revisión en fix/c5-c2-timeout-d8b,
desde main actualizado: timeout de Tira local y D8b con teléfono/emulador.
C2 abierta, sin publicar cambios nuevos ni intervenir OV-1.
Flutter corrige eventos Socket.IO con offset de recuperación (9/9 pruebas),
pendiente observación humana en ambos clientes. Contrato exclusivo de timeout
local autorizado en desarrollo; no está activo en la sesión humana actual.

**21 de octubre — [C5-C2-C validada automáticamente](backend/docs/C5C2C_CONSUMIDORES.md):**
contratos/snapshots y Flutter incorporan imágenes opcionales sin cambiar XP ni
romper JSON antiguo.969 Flutter aprobadas/16 opt-in omitidas,128 suites/1.675
backend y44/44 PostgreSQL/HTTP;70 migraciones temporales, ninguna nueva de C2-C.
**Estado histórico del21: C2-D tenía0/8**; prevalece la entrega parcial del22 superior.
Activación apagada por defecto; sin nuevo ensayo Android ni despliegue. C1 conserva5/5.
Entrega C2-C/relevo: app `e833d6b`, backend `cfba7cd`.
Deuda ESLint previa:27 incidencias verificadas en HEAD, descritas en el acta.
Integrada en main local: app `f912880`/backend `09c763b`; sin push nuevo ni cambios OV-1.

**20 de octubre — C5-A/B validadas localmente:** [imágenes desde el panel](backend/docs/C5B_PANEL.md),
23/23 PostgreSQL/HTTP, panel124/124 y backend126/1650 aprobados en `feat/c5-archivos-base`.
Recorrido Chromium aprobado; sigue C5-C Flutter.69 migraciones
aplicadas solo en Docker temporal propio y limpiado. Rutas desactivadas por defecto,
adaptador solo development/test. Sin merge, despliegue ni cambios OV-1.
Esta entrada prevalece sobre el «siguiente C5» de las notas inferiores.

**19 de octubre — checkpoint vigente MA-1R/R4:**12/12 humanos y45/45 pruebas
HTTP/PostgreSQL aisladas repetidas tras fix de concurrencia aprobadas; backend121 suites/1567, ADMIN109, build/TS
y Flutter920/13 opt-in omitidas/análisis correctos. [Acta técnica y límites](backend/docs/MA1R_R4_VALIDACION_LOCAL.md).
Repetir suite específica desde backend: `npm run test:question-reports:postgres`.
Retirada del botón y borrador con flecha confirmados: **R4 cerrada localmente**.
**Integrado en main:** [backend PR #9](https://github.com/Pavel2020123/SaberPlus-Backend/pull/9)
(`eef0d40`) y [app PR #6](https://github.com/Pavel2020123/saber_plus/pull/6) (`21757a1`).
CI backend del PR aprobado; QA-1 Flutter remoto pendiente. Sigue preparación local
C5, archivos generales. Bases automáticas/anteriores limpiadas; remate en otra
sesión temporal. Sin despliegue ni migraciones remotas por esta entrega.
OV-1 separado. Entradas anteriores inferiores son antecedentes, no estado vigente.

[Documentación conciliada y guía de continuidad](backend/docs/AUDITORIA_DOCUMENTAL_2026_10_19.md).

**18 de octubre — MA-1R/R3 app/panel locales:** [acta R3](backend/docs/MA1R_R3_APP_PANEL.md).
R2 backend local: [implementación](backend/docs/MA1R_R2_BACKEND.md).
R1/flujo inicial autorizados; 121 suites/1.560 aprobadas, build/TypeScript correctos.
R3:32 dirigidas Flutter/109 ADMIN aprobadas y26 módulos de sintaxis.
Regresión Flutter del18:917 aprobadas/13 opt-in omitidas y análisis sin incidencias.
SQL escrito, no aplicado; sigue R4 PostgreSQL/HTTP Nest/Android.
Sin despliegue ni CI remoto de R2. OV-1 separado; contrato legacy de cobertura intacto.

**17 de octubre, estado vigente:** [C4-C10/10 guiones locales cubiertos](backend/docs/PR_I5_C4_CODIGO.md)
con Android+19 HTTP/SQL finales, no10 manuales independientes. APK corregida instalada,
Regresión Flutter final893 aprobadas/13 opt-in omitidas y análisis limpio.
[Cierre técnico local consolidado](backend/docs/CIERRE_INSTITUCIONES_LOCAL.md),
backend119 suites/1.470 y panel95/95. Commits creados app6bab6be/API7ba93d7/lockbfce42e;
integrados a main por [PR #8 API](https://github.com/Pavel2020123/SaberPlus-Backend/pull/8)
y [PR #5 app](https://github.com/Pavel2020123/saber_plus/pull/5).
CI backend del PR y main aprobado; Flutter analyze limpio y102 dirigidas aprobadas.
[Orden posterior y auditoría](backend/docs/ESTADO_Y_ORDEN_2026_10_17.md): MA-1R,
reportes académicos, propuesto y no iniciado. OV-1 del compañero en curso, sin
entrega nueva verificada aquí. Sin nuevos ensayos físicos/SQL ni despliegue.
La auditoría documental se entrega separada en `docs/estado-post-instituciones`;
publicación manual y revisión por PR pendientes.
Las notas fechadas inferiores son antecedentes, no el siguiente paso.

**15 de octubre — C3A/B solicitudes implementadas localmente.**
Backend37 nuevas, regresión1.411/118 suites y14 HTTP/PostgreSQL aprobadas;
cliente Flutter27 dirigidas. Sigue C3C Flutter/API/Android, no despliegue.
[Contrato y checkpoint](backend/docs/PR_I5_C3_SOLICITUDES.md). Migración solo temporal;
OV-1 sigue separado. No hacer commit de instituciones todavía.

**14 de octubre:** [C2C validada localmente](backend/docs/PR_I5_C2_LOGO.md),6/6
HTTP/SQL y8/8 humanos. Siguen solicitudes estudiantiles/avisos/código institucional.
Acta conserva observaciones de captura original/CI y límites; sin despliegue.

13 de octubre: [checkpoint del compañero OV-1](backend/docs/CHECKPOINT_OV1.md)
y [C2C del propietario](backend/docs/PR_I5_C2_LOGO.md) independientes.
[Conciliación documental](backend/docs/AUDITORIA_DOCUMENTAL_2026_10_13.md).

**Trabajo paralelo acordado:** propietario → entrega institucional integrada y
próximo bloque por acordar; compañero → OV-1A/B/C/D en paralelo.
Ver [responsables, ramas y entrega](backend/docs/TRABAJO_PARALELO.md). Este acuerdo sustituye
la secuencia estricta de OV-1 y el trabajo individual directo en main.

## Antecedente — 12 de octubre de 2026

**Siguiente: PR-I5-C2C, ensayo integrado del logo institucional.**
C2A/backend y C2B/Flutter implementadas: 79 pruebas backend y 45 Flutter
aprobadas, build y análisis correctos. APK debug compilada, no instalada en C2.
Migración C2 no aplicada; seis casos reales HTTP/PostgreSQL y ocho pruebas
humanas Android pendientes. No se acredita despliegue remoto ni validación iOS.
C1C ya completó 15 HTTP/SQL, 3 Flutter/API y 10/10 pruebas humanas locales.
Territorio T5 también cerrado localmente. No repetir esos recorridos salvo regresión.

[Contrato y guion C2](backend/docs/PR_I5_C2_LOGO.md). La ruta maestra está en el repo Flutter.
Las notas inferiores son antecedentes; no reiniciar Rescate, territorio ni C1.

**IC-1C Rescate, cierre local 10 de octubre:** [acta](backend/docs/IC1_RESCATE.md).
Cliente/tests/Android/API/SQL aprobados en su alcance local; saldo final80 tras
dos abandonos distintos. Push manual/cierre operativo separados. Después: instituciones.

## Acuerdo de alcance — 9 de octubre de 2026

Fuente del orden: `docs/ETAPAS_PENDIENTES.md` y
`docs/ALCANCE_V1_NOVIEMBRE_2026.md` del repositorio Flutter
`Pavel2020123/saber_plus` (no pertenecen a este árbol).
Competición inicial: Cima, Guardián y Rescate. Después de Rescate: instituciones.
Trivia/Duelo/Tira/Memoria/Batallas competitivos se aplazan sin borrar código,
migraciones ni modos normales. OV-1, perfiles, insignias anuales y territorio
permanecen. Las secuencias anteriores son antecedentes; no activar servicios
por este acuerdo. Sustentación y lanzamiento comercial son hitos distintos.

**Relevo de pruebas para compañeros:** leer
[guía de ambos repositorios](backend/docs/RELEVO_PRUEBAS_LOCALES.md) y el
checkpoint vivo en `docs/ETAPAS_PENDIENTES.md` del repositorio Flutter.
Docker local, Android USB, credenciales ficticias y acta tras cada prueba;
no reutilizar base/contraseña del PC anterior ni asumir push por un commit local.

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

