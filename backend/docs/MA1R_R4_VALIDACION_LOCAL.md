# MA-1R / R4 — Preparación del ensayo integrado

**Seguimiento del18–19 de octubre de2026. R4 cerrada localmente el19.**
[R2 backend](MA1R_R2_BACKEND.md), [R3 app/panel](MA1R_R3_APP_PANEL.md).
Checkpoint maestro y guion humano en `docs/MA1R_R4_VALIDACION_LOCAL.md` de Flutter.

## Entrega Git integrada el19 de octubre

Commits funcionales locales: backend/panel `a747c32`, Flutter `418c291`.
Documentación guardada en backend `6a74f55` y Flutter `0a622e6`.
Rama de entrega: `feat/ma1r-reportes-preguntas`. Push comprobado e integración
autorizada por el propietario: [backend PR #9](https://github.com/Pavel2020123/SaberPlus-Backend/pull/9)
como `eef0d40`, [app PR #6](https://github.com/Pavel2020123/saber_plus/pull/6)
como `21757a1`. [CI backend del PR](https://github.com/Pavel2020123/SaberPlus-Backend/actions/runs/39321480923)
aprobado: admin/verify, instalación, build, pruebas, controles locales y auditoría.
[CI posterior de main](https://github.com/Pavel2020123/SaberPlus-Backend/actions/runs/39321700998)
también aprobado para el merge backend `eef0d40`.
No hay workflow Flutter remoto: QA-1 pendiente, conservar evidencia local sin
presentarla como CI. Esta integración no ejecuta ni autoriza migraciones/despliegues
remotos. Siguiente bloque recomendado: preparación local C5, archivos generales.
Este registro sustituye las esperas para crear commits/publicar/integrar de las notas anteriores.

## Cierre local del19: remate visual confirmado en Flutter

Por solicitud del propietario se levantó otro harness temporal para reinstalar
Flutter y comprobar el botón inferior; no es la sesión humana ya eliminada.
Docker PostgreSQL16 con67 migraciones/puerto loopback, API43187 y ADMIN4173 real
comprobados (401 sin token/200 panel), USB/reverse autorizados en Flutter.
Preparador normal sin `--resume-case7`: dos preguntas publicadas,3 smoke aprobados,
cero reportes preparados/casos humanos nuevos. Credenciales ficticias nuevas
solo en directorio privado del harness. APK Gradle debug del19 compilado con0,
paquete separado aapt comprobado, USB **Success** y Activity abierta. Sin borrar
datos de app normal. Propietario confirmó ausencia del botón inferior («si no esta»)
y detalle conservado tras flecha/reapertura de la misma pregunta («si sigue apareciendo»).
Sin pedir envío de reporte ni repetir12; es regresión del ajuste del caso8.
**R4 cerrada localmente:**12/12 humanos, dos45/45 integradas tras fix y regresiones
indicadas abajo. Entrega Git integrada según el registro superior;
quedan staging/operación y QA-1 separados, sin despliegue ni cambios OV-1 en esta tarea.

## Pruebas técnicas del 19 de octubre: 45/45 integradas aprobadas

**Fallo encontrado y corregido al repetir:** tras43/43 y45/45, una repetición
dio44/45: dos ADMIN sobre la misma revisión produjeron200/503 en vez de200/409.
No hubo doble decisión. Una barrera de planificación de transacciones reales
reprodujo el fallo y el diagnóstico mínimo confirmó PrismaP2010/SQLSTATE40001,
sin exponer SQL/texto/credenciales. La consulta raw SELECT FOR UPDATE escapaba al
reintento existente para P2002/P2034. El servicio ahora también reintenta P2010
solo con40001/40P01, conserva máximo3 intentos y409 al agotarlos; otros errores
SQL mantienen la ruta segura503 y rollback. No cambia schema/contrato/retención.
Se añadieron7 unitarias (reintento/tope/errores no elegibles): dirigidas100/100,
TypeScript y ESLint del servicio correctos, dos ejecuciones45/45 integradas tras
corrección. La última exige observar exactamente un P2010/40001 en el bloqueo
real, y200/409 con revisión1/una decisión: no un pase por ausencia de solapamiento.
40P01 solo unitario; el conflicto raw reproducido en PostgreSQL fue40001.
Build completo post-fix aprobado; global **121 suites/1567 aprobadas** (121,4s),
cero fallos. No contar45+45 como90 casos distintos.
Archivos funcionales del fix: [servicio](../src/question-reports/question-report.service.ts)
y [unitarias](../src/question-reports/question-report.spec.ts); no schema/dependencias
ni cambio al flujo académico/OV-1. El runner y sus fixtures son herramientas de prueba.

Ejecutor: [test_question_reports_postgres.mjs](../tool/test_question_reports_postgres.mjs).
Suite: [question-reports-postgres.test.cjs](../test/question-reports-postgres.test.cjs).
Desde `SaberPlus-Backend/backend`:

```powershell
npm run test:question-reports:postgres
```

Requiere dependencias instaladas y Docker Linux local con `postgres:16`.
No necesita celular, sesión humana, `.env`, URL ni contraseña externa. Rechaza
argumentos; limpia credenciales heredadas y verifica socket Docker local.
Crea contenedor rotulado propio, PostgreSQL tmpfs/puerto loopback aleatorio,
directorio/usuario/clave efímeros y marker validado. Aplica67 migraciones: SQL de
HEAD más las seis rutas institucionales/reportes explícitamente autorizadas;
no descubre SQL local arbitrario ni toca OV-1. Limpieza de recursos propios
comprobada al terminar; no elimina otras imágenes/contenedores ni volúmenes.

El servidor HTTP de la suite carga los módulos reales de reportes, Prisma y
cobertura con JwtGuard/AdminGuard/EmailVerificadoGuard, ValidationPipe y middleware
IP reales. JWT de prueba firmados localmente; no se sustituyen guards/Prisma por
mocks. No arranca AuthController ni el bootstrap productivo entero. La conexión
de autenticación normal sí se cubrió en el recorrido humano, no en estos45 tests.
Fixtures académicas/evidencias/cuotas son sintéticas y se identifican como tales;
no se contabilizan como acciones humanas. Cada caso usa HTTP loopback efímero.

| Comprobación | Evidencia aprobada |
|---|---|
| Identidad/evidencia | JWT/roles consultados en DB, correo incluso institucional, cuenta eliminada/cambio de rol/clave inicial; evidencia propia con tres orígenes admitidos y cuatro excluidos |
| DTO/privacidad | Campos forjados/tipos/nulos/UUID/controles/surrogates rechazados,500 puntos Unicode preservados, listados sin soluciones/snapshot/autor y no-store |
| Original/snapshot | ID archivado aceptado con evidencia, ID nuevo sin ella rechazado, snapshot inmutable/legado omitido explícitamente, FK restringe borrado y servidor de medios de prueba recibió0 peticiones |
| Recibos/concurrencia | Mismo UUID concurrente crea1 recibo/incidencia/auditoría; duplicado semántico crea2 recibos/1 incidencia; UUID entre actores no filtra; dos ADMIN/revisión dan200/409 |
| Reconciliación | Socket de respuesta destruido DESPUÉS del commit real: GET recibo y replay idénticos, sin segunda incidencia/auditoría; distingue este caso automático del corte humano previo al envío |
| Rollback real | Fallo SQL inducido en auditoría/recibo revierte negocio/revisión/auditoría; HTTP503 genérico; tasa durable no se revierte; reintento original recupera |
| Cuotas/tasas | Límite durable de20 entre dos instancias HTTP, GET libre de tasa de escritura, cuota diaria concurrente19→20 sin21, replay/duplicado no suman cuota, ventana vencida y diagnóstico IP esperado por header forjado |
| RLS/cobertura | ACL sin DML para anon/authenticated, SET LOCAL ROLE deniega acceso y RLS devuelve0 incluso con GRANT temporal revertido; filtros/paginación reales, IDs archivados/cerrados y hash banco/XP sin cambios |

Primera ejecución:43/43 aprobadas. Tras ampliar medios/paginación, ejecución final
**45/45 aprobadas, cero omitidas/canceladas**. No sumar43+45 como88 casos distintos.
El diagnóstico esperado `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` del ataque de prueba
se aserta localmente en el test; no se desactiva ninguna protección ni se cambia
trust proxy productivo para silenciarlo. Multiinstancia de este ensayo = dos apps
HTTP en un proceso con clientes reales de DB; no certifica proxy/distribución real.
Las repeticiones44/45 posteriores y la corrección se conservan arriba; estos pases
iniciales no constituyen por sí solos el resultado final de estabilidad.

Regresiones comprobadas del19: ADMIN109/109 y sintaxis26 módulos; controles locales
12/12; TypeScript sin errores; Nest build y después `npm run build` completos
aprobados. Flutter:920 aprobadas/13 opt-in omitidas, análisis sin incidencias.
Jest global inicial:1559 aprobadas/1 timeout (certificado HTML,5s), no aprobado.
El archivo aislado pasó8/8 sin tocar código ni timeout; repetición global sin
otras suites pesadas: **121 suites/1560 aprobadas**, cero fallos (93,5s).
El primer fallo se conserva como incidencia de la ejecución concurrente; no se
demostró un defecto en certificados ni se cambió ese servicio por él. Estas1560
son anteriores al fix de concurrencia y a sus7 unitarias; repetir global post-fix.

El primer build encontró EPERM al regenerar la DLL Prisma usada por la API humana.
Se verificó propiedad y se cerró esa sesión mediante control stop; cierre/limpieza
del harness confirmados, después build completo aprobado. Base/usuarios/clave
humanos del19 ya no existen: nueva sesión solo si se necesita otro ensayo físico.
Las bases automáticas fueron independientes y se limpiaron también. Panel puede
seguir abierto sin API; no reutilizar el archivo privado anterior.

**Resultado final local:**12/12 humanos, dos ejecuciones45/45 integradas después
del fix,100 dirigidas backend,121 suites/1567 globales, build/TypeScript/ESLint
del servicio y formato correctos; Flutter920/13 opt-in omitidas/análisis limpio,
ADMIN109/sintaxis26 y controles12. Los pases1560 anteriores no incluyen las7
unitarias nuevas y no sustituyen esta regresión post-fix.

**R4 cerrada localmente:** reinstalación/remate visual confirmados arriba.
Retención, proxy/operación, CI/PR y despliegue siguen siendo gates distintos,
no aprobados por esta suite. Siguiente: revisar cambios y decidir commits/PR/CI.
No repetir12 gestos por defecto. No commit/push/merge automático.

## Reanudación del 19 de octubre

La sesión anterior terminó; base tmpfs nueva con67 migraciones locales, API43187
y panel4173 real disponibles. Comprobados HTTP401 sin token del listado privado,
HTTP200 del panel y reverse USB43187. APK actualizado con Más → Mis reportes,
construido el18, instalado por USB el19: **Success** y MainActivity abierta;
sin borrar/reemplazar la app normal. Propietario confirmó acceso y tres reportes
PENDIENTE: «si muestra 3 preguntas en pendiente». Se retiró solo reverse USB43187
y se comprobó el listado sin ese mapeo. API401 sin token/panel200 comprobados antes
del corte. Propietario confirmó «No pudimos consultar tus reportes» al recargar
sin conexión. Reverse43187 restaurado/comprobado y API401 sin token disponible;
tras recargar de nuevo, propietario confirmó «si volvieron a aparecer» los tres
pendientes. **Caso7 aprobado; total7/12**. Error explícito sin falso vacío y
recuperación comprobados, no pérdida de respuesta tras commit. Sigue8: borrador
al volver/reabrir la misma pregunta, sin reinicio ni cambio de cuenta.

`prepare_question_reports_local.mjs --resume-case7` preparó contenido por ADMIN,
completó/calificó una práctica por la API estudiantil y envió tres reportes más
un intento duplicado por la misma API. No insertó historial directamente.
Listado propio con tres PENDIENTE; cobertura con tres abiertos/una pregunta distinta.
Preparación **automática**, no seis casos humanos repetidos ni recuperación de red.
Verificador de solo lectura `--case6` aprobó estructura/recibos/snapshot con prefijo
`r4-automatic-resume-check-6`, `manualCaseClaim:false`. Sintaxis de ambos guiones
comprobada. Análisis/80 dirigidas Flutter son evidencia del18, no repetida el19;
la global917 tampoco se repitió. La preparación automática no sumó casos humanos;
las confirmaciones humanas posteriores cerraron7 (**7/12 aprobados**).

Caso8 también aprobado el19: propietario confirmó motivo/detalle conservados
al volver/reabrir la misma pregunta y tras modificar texto/usar flecha superior.
No reinició ni cambió de cuenta; Atrás físico Android no confirmado. Decisión UX:
Flutter elimina botón inferior redundante, conserva la flecha/controller; cambio
todavía no reinstalado. **Total8/12; sigue9, aislamiento entre cuentas**.
Sin cambios funcionales backend por esta corrección.
Comprobación Flutter del19: análisis sin incidencias, formato correcto y81
dirigidas aprobadas (question_reports/practice_session_page/widget/
student_request_shortcut), incluida flecha/evento Atrás simulado y borrador.
No reinstalado aún; Atrás Android físico/global917 no comprobados de nuevo.

Caso9 aprobado el19 en su recorrido manual: propietario confirmó lista vacía en
zero@example.invalid; al regresar a student@example.invalid reaparecieron sus
tres reportes y el formulario de la misma pregunta mostró detalle vacío tras
logout/práctica/reapertura. No envió borrador ni se limpió almacenamiento.
No había recibo pendiente abierto: ese aislamiento/tardío sigue como evidencia
unitaria, no nuevo escenario humano confirmado. **Total9/12; sigue10, ADMIN**.

Caso10 aprobado el19: propietario confirmó tres pendientes en panel ADMIN y,
tras moderar Enunciado confuso, dos pendientes/uno En revisión en el celular.
SQL de solo lectura `verify_question_report_first_send_local.mjs --case10`:
EN_REVISION/revisión1, una operación DECIDIR del ADMIN con recibo coherente,
dos auditorías (creación/transición) con motivo interno válido y actor correcto.
Otros dos PENDIENTE/revisión0, única auditoría y sin decisiones. Sintaxis correcta;
sin escribir datos ni imprimir secretos. Base automática, moderación UI humana.
**Total10/12; sigue11, cobertura antes/después del cierre**. No acredita carreras,
cuotas/RLS ni suite integrada completa.

Caso11 aprobado el19: propietario confirmó cobertura de su subtema con dos
publicadas, tres reportes abiertos/una pregunta distinta, tema/subtema publicados.
`verify_question_report_first_send_local.mjs --case11-before` aprobado: lectura
SQL coherente y hash basal de preguntas/respuestas/tema/subtema/XP/balances en
archivo temporal exclusivo de sesión, sin DB writes ni reemplazar baseline.
Sintaxis aprobada. Tras cierre humano RESUELTO y recarga pegó cobertura con dos
abiertos/una pregunta distinta/dos publicadas. `--case11` aprobado en lectura SQL:
RESUELTO/revisión2, tercera auditoría con transición/motivo/ADMIN y segundo recibo
DECIDIR coherente. Otros dos PENDIENTE/revisión0. Hash basal igual: preguntas,
respuestas, tema/subtema, xpTotal y balances competitivos del estudiante sin cambios
durante el cierre. **Total11/12; sigue12, texto grande/teclado**. Cerrar un reporte
no corrige automáticamente contenido; no acredita suite integrada completa.

Caso12 aprobado el19: propietario confirmó listado legible con letra grande y
dos pendientes/uno resuelto, después edición/desplazamiento del formulario con
teclado abierto y acceso a Enviar reporte/Mis reportes. Sin pedir nuevo envío;
no auditoría completa de accesibilidad ni lector de pantalla. **12/12 humanos
aprobados dentro del alcance del acta; R4 no cerrada**. Sigue suite específica
PostgreSQL/HTTP y regresiones; retirada del botón inferior en código pendiente
de reinstalar/comprobar visualmente. No repetir12 por esa corrección sin motivo.

Usar la contraseña ficticia de la sesión nueva, no la caducada. Caso7 completado,
reverse43187 restaurado. Continuar por la suite técnica del acta Flutter. No se tocó OV-1
ni producción. El relato inferior conserva la secuencia del18, antes del cierre7.

## Evidencia de arranque

- [Harness existente](../tool/local_ranking_validation.mjs) incorpora por allowlist
  `20261017220000_academic_question_reports`.67 migraciones aplicadas únicamente
  en PostgreSQL16 nuevo, tmpfs, usuario/etiqueta propios y puerto loopback aleatorio.
  No `.env`, BD existente, Supabase/Render ni migración remota.
- `npm run build` aprobado; API real43187 y ADMIN4173 en loopback levantados.
  Panel HTTP200/config de API local/modo real comprobados. Bootstrap del harness,
  no toda la infraestructura productiva.
- [Preparador de fixtures](../tool/prepare_question_reports_local.mjs) valida
  tmpdir/marker/Docker local y etiqueta antes de usar login ADMIN/cliente real.
  Crea por API tema/subtema/lección y dos preguntas publicadas de Matemáticas.
  No inserta respuestas/historial del alumno ni reportes como si fueran humanos.
- **3 smoke HTTP/DB aprobados:** listado propio vacío, bandeja ADMIN vacía y
  cobertura opt-in con dos preguntas y cero reportes. No son la suite R4 completa.
- **12/12 regresiones de control local** aprobadas:
  `node --test tool/local_control_file.test.mjs tool/local_competitive_control.test.cjs`.
  No confundirlas con12 casos humanos ni con nuevos tests de reportes.
- USB Android autorizado y reverse43187 comprobado. Build APK aprobado, paquete
  aislado verificado con aapt, instalación USB **Success**, MainActivity abierta.
  No se reemplazó/borró app normal. Después el propietario confirmó login y
  caso1: Reportar no aparece durante práctica activa (**1/12 aprobado**).

## Credenciales y duración

Solo credenciales ficticias del directorio temporal actual del harness:
`flutter-private.json` (no imprimir ni versionar), `reports-fixtures.json` con IDs
y nombres (sin secreto). Student/admin de `example.invalid`; contraseña común
efímera. Los defines de contraseña nunca se compilan en APK. Dos horas máximas
de sesión, limpieza acotada del recurso propio; para reanudar generar sesión nueva.
API/bootstrap no tiene endpoints de prueba para fabricar XP ni saltar permisos.

## Continuación

Guion12 casos humanos, **12/12 aprobados dentro del alcance indicado**, en acta Flutter. Caso2: propietario
confirmó «Reporte recibido, gracias por ayudarnos a mejorar». Verificación SQL
de solo lectura mediante [script del primer envío](../tool/verify_question_report_first_send_local.mjs):
un reporte propio ENUNCIADO_CONFUSO, PENDIENTE/revisión0, un recibo CREAR,
una auditoría, respuesta propia acreditada y snapshot del ID original. Texto real
válido y preservado en recibo; no idéntico al ejemplo sugerido, sin modificarlo.
La aserción inicial exigía el ejemplo literal y se ajustó al criterio de texto
humano válido/preservado; la verificación completa posterior aprobó. No fallo de
producto ni prueba de concurrencia por ese resultado. Caso3 aprobado: propietario
confirmó rechazo de Otro con «corto» por mínimo10, de501 por máximo500 y envío
recibido tras eliminar un carácter. Script de lectura con `--case3` aprobado:
OTRO con exactamente500 puntos de código preservados en su recibo, una auditoría,
evidencia/snapshot propios y primer reporte intacto. Dos reportes por motivos
diferentes sobre el mismo ID; los rechazos de formulario no crearon otros.
Caso4 aprobado: mensaje de duplicado confirmado por propietario y SQL `--case4`
aprobado: dos reportes, sin nueva incidencia/auditoría/cambio del primero; segundo
recibo CREAR duplicado con otro UUID/huella pero mismo ID y detalle original.
OTRO conserva500 y único recibo/auditoría. En caso5 se preparó formulario de
EXPLICACION_INCORRECTA: propietario confirmó texto listo sin enviar; reverse USB43187
retirado y listado vacío comprobados. API401 sin token y panel200 siguen en PC.
Propietario confirmó envío con error «No se pudo confirmar la operación», botones
Consultar recibo/Reintentar mismo envío/Mis reportes/Volver activos y edición bloqueada.
Tras restaurar/consultar confirmó «no hay recibo y sigue el mismo texto»: caso5 aprobado.
Reverse43187
restaurado y listado comprobado; API401 sin token/panel200 disponibles en PC.
Caso6 aprobado para este corte previo al envío: propietario confirmó recepción
al pulsar Reintentar mismo envío. SQL `--case6` aprobado: tres reportes, uno
EXPLICACION_INCORRECTA con un recibo CREAR no duplicado/una auditoría, texto igual
a recibo y evidencia/snapshot propios. Los dos previos conservan texto/fecha/
recibos/auditoría. Todos PENDIENTE/revisión0. Lectura de solo consulta, sin fabricar
envíos. UUID local previo no capturado: no acredita por sí sola su estabilidad
ni el escenario de commit con respuesta perdida. Caso7 en curso: propietario
confirmó listado con reportes Pendiente; falta error/recuperación de recarga.
Se documentó [MA-1R-UX1](MA1R_UX1_OCULTAR_DESHACER.md): X para ocultar solo de la
lista personal y Deshacer cinco segundos, propuesta posterior a R4, no DELETE ni
cambio ADMIN. Sin implementación o corte nuevo de conexión por esa propuesta.
Al retomar R4 después de documentar UX1: dispositivo device y API401 sin token
comprobados; retirado únicamente reverse USB43187 y listado vacío. Caso7 sigue
en curso: esperar error al Actualizar estado y después restaurar para recuperar.
Todavía6/12 completos; no declarar probado error/recarga por ejecutar el corte.
Interrupción posterior: propietario salió antes de confirmar fallo de recarga y
no pudo encontrar un acceso permanente. Reverse43187 restaurado/comprobado; la
API/base/datos se conservan. Corrección Flutter localizada en curso: Más → Mis
reportes de preguntas reutiliza la lista privada/permiso actual, sin router/OV-1
ni cambios backend. Análisis Flutter limpio, formato de tres Dart y80 dirigidas
aprobadas (incluye dos nuevas del acceso). Global917 no repetida tras este cambio.
Build aprobado el18 e instalación Success el19; acceso y tres pendientes confirmados el19, falta error/recuperación del7;
no confundirla con X/Deshacer, que continúa como propuesta posterior.
Lectura SQL posterior (`--case4`) aprobada: dos reportes anteriores, sin tercero
ni cambios en recibos/auditoría. No acredita todavía el resultado de reconciliación.
Solo6/12 aprobados. Este corte previo al envío no prueba
commit con respuesta perdida, que debe ensayarse aparte.
Preparar y ejecutar
aparte suite PostgreSQL/HTTP Nest de permisos/evidencia/correo, snapshots archivados,
recibos/rollback/races/cuotas/tasa/revisiones y RLS/conteos reales. Registrar las
acciones y resultados, sin declarar integración/producción por los smoke o mocks.
Coordinar red caída e instalación con el propietario. Sin commit/push/merge,
despliegue, alteración OV-1 ni operación en datos reales.
