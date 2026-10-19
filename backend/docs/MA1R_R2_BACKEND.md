# MA-1R / R2 — Backend local de reportes académicos

**Actualización del19 que prevalece:** [R4](MA1R_R4_VALIDACION_LOCAL.md) con12/12
humanos y45/45 HTTP/PostgreSQL, SQL aplicado solo en67 migraciones temporales y
limpieza comprobada. Se corrigió carrera raw P2010/40001 con reintento acotado;
7 unitarias nuevas/dirigidas100 aprobadas. Remate visual confirmado, cierre local R4;
siguen revisión/commits/PR/CI.
Las afirmaciones inferiores «sin aplicar»/«sin ensayo» corresponden al cierre R2
del17, no al estado del19 ni a una autorización de migración remota/despliegue.

**Continuación del18 de octubre:** [R3 app/panel local](MA1R_R3_APP_PANEL.md)
implementada/probada,109 ADMIN y32 dirigidas Flutter aprobadas. Este documento
conserva el contrato y evidencia R2 del17; sigue R4 PostgreSQL/Nest/Android.
Las menciones inferiores a «R3 debe» describen requisitos ya consumidos en R3;
SQL sigue sin aplicar, no despliegue ni nueva validación DB por esta actualización.

17 de octubre de 2026. Propietario autorizó continuar con R2 tras revisar el flujo
R1. Implementación local; **sin migración aplicada ni ensayo PostgreSQL/HTTP/Android**.
R3 app/panel y R4 integración siguen pendientes. No equivale a despliegue o CI remoto.

Contrato de base y hallazgos: [R1](MA1R_REPORTES_PREGUNTAS.md). Las propuestas
anteriores son antecedentes; las precisiones de implementación se registran aquí.
Rama `feat/ma1r-reportes-preguntas`, conserva los cambios documentales de R1
desde 56a65fb/894bcc0. Sin commit/push/merge de esta entrega. OV-1 no se modificó.

## Qué se implementó

- [Módulo aislado](../src/question-reports/question-report.module.ts), incorporado
  desde AdminModule sin editar app.module.ts ni archivos vocacionales.
- [Servicio](../src/question-reports/question-report.service.ts): reporte de
  ESTUDIANTE real con correo efectivamente verificado y respuesta propia acreditada
  en PRACTICA, PERSONALIZADO o SIMULACRO. Sin PlanVigenteGuard.
  La excepción institucional del guard común no exime este requisito de correo.
- Los cinco motivos y detalle Unicode hasta 500 puntos de código, OTRO mínimo
  10 tras trim. Tipos JSON estrictos, NUL/controles y surrogates aislados rechazados.
  No acepta autor/rol/solución/snapshot/classificación enviados por el cliente.
- Pregunta original PUBLICADO o ARCHIVADO, sin cambiar banco, XP, notas ni grupos.
  Snapshot de servidor a recepción, nunca «captura exacta del teléfono». Para
  contenido legado mayor de 512 KiB solo metadata, marcada contenidoOmitido:true.
  No descarga imágenes ni enlaces; soluciones/snapshot solo en detalle ADMIN.
- Recibos por UUID y hash de payload normalizado, vinculados a actor y operación.
  Reintento idéntico devuelve recibo original. UUID ajeno no revela información;
  UUID propio con otro payload devuelve409. Otra operación que deduplica también
  recibe un recibo propio, sin modificar ni reabrir el reporte anterior.
- Duplicado semántico: autor+Pregunta.id+motivo, también cerrado. Cuenta distinta
  u otro ID editorial no se fusionan. Cuota no suma replays/duplicados.
- Estados PENDIENTE→EN_REVISION→RESUELTO/DESCARTADO, reapertura a EN_REVISION solo
  ADMIN con motivo; revisión esperada, recibo de decisión y eventos append-only.
  No hay recalificación, publicación/archivo ni cierre automático de preguntas.
- Transacciones Serializable, restricciones únicas y bloqueos parametrizados;
  reintento acotado de conflictos P2002/P2034. Concurrencia real aún no comprobada.
- Cuota técnica inicial 20 reportes nuevos/cuenta/24 h móviles, y ventana durable
  20 escrituras/minuto/cuenta, que incluye replays. La ventana se confirma en una
  transacción independiente para no reiniciarse al fallar el negocio.
- Protección IP adicional100 escrituras/minuto/proceso; no limita lecturas de
  reconciliación. Usa la IP interpretada por Express, no un header arbitrario.
  No sustituye revisión de proxy/infra distribuida antes de publicar.
- [Filtro de almacenamiento](../src/question-reports/question-report-storage.filter.ts)
  evita enviar o registrar aquí diagnósticos Prisma con valores privados; devuelve
  503 genérico y remite a consultar recibo. Un error no se convierte en éxito.
- Listados paginados con selección de columnas, sin cargar snapshots/soluciones;
  no devuelven autores ni notas internas al alumno. Cache-Control private,no-store.

## Rutas implementadas, aún no desplegadas

| Ruta | Uso |
|---|---|
| POST /preguntas/reportes | operacionId UUIDv4, preguntaId string, motivo, detalle opcional |
| GET /preguntas/reportes/operaciones/:operacionId | Recibo propio **del envío**, no estado actual de moderación |
| GET /preguntas/reportes/mios | Estado actual de reportes propios; pagina/limite |
| GET /admin/reportes-preguntas | ADMIN; filtros area/subtemaId/estado/motivo, pagina/limite |
| GET /admin/reportes-preguntas/:id | ADMIN; snapshot y auditoría |
| PATCH /admin/reportes-preguntas/:id/estado | ADMIN; operacionId, revision, destino, motivoRevision |

Recibos conservan la respuesta original para reconciliar el mismo envío. Después
de confirmar, recargar mios/detalle para ver decisiones posteriores; no sobrescribir
una versión más reciente del cliente con un recibo antiguo. Un envío incierto
conserva UUID/payload: consultar antes de modificar el intento o crear otro.
Pagina1–10000, limite1–50 (20 por defecto), desempate por ID. No se publica identidad
de otros alumnos ni se permite administrar reportes con rol institucional.

## Cobertura compatible: mejora de R1

El panel actual valida estrictamente false/null. Para no romperlo, se añadió un
**opt-in**, sin cambiar el contrato por defecto:

```text
GET /admin/cobertura?area=MATEMATICAS&pagina=1&limite=20
    → contrato anterior, reportesDisponibles:false / reportes:null

GET /admin/cobertura?area=MATEMATICAS&pagina=1&limite=20&reportesVersion=1
    → reportesDisponibles:true, reportesVersion:1
      item.reportes: número de reportes PENDIENTE+EN_REVISION
      item.preguntasConReportes: IDs distintos afectados
```

Agregación en transacción de lectura RepeatableRead, limitada a subtemas de la
página y clasificación capturada, sin excluir incidencias de preguntas archivadas.
Disponibilidad académica y número de reportes son métricas distintas.
No consultar tablas nuevas en contrato legacy, ni consulta sin límites en página
vacía; falla de datos propaga error, no devuelve un cero ficticio.
**R3 debe pedir reportesVersion=1 y validar su respuesta**. Panel/demo permanecen
sin cambios funcionales en R2; false/null por defecto no significa backend sin
reportes, sino consumidor legacy que no optó por el contrato nuevo.

## Migración escrita, no aplicada

[20261017220000_academic_question_reports](../prisma/migrations/20261017220000_academic_question_reports/migration.sql):
cuatro tablas (ReportePregunta, OperacionReportePregunta, AuditoriaReportePregunta,
TasaReportePregunta), tres enums, índices/unique/checks y RLS/revocaciones directas.
Relación con Pregunta restringe borrado de evidencia; retirar contenido debe archivar.
Al eliminar Usuario se ponen a null vínculos de autor/actor; la ventana de tasa
se elimina. Esto **no completa una política de retención ni depura texto libre**.
No conservar PII indefinidamente por defecto; retención/anonimización y procedimiento
de eliminación deben acordarse y probarse antes de producción.

Schema compartido recibió solo estas tablas/relaciones aditivas. Coordinar con
OV-1 antes de integrar migraciones; no regenerar, borrar ni reordenar las ajenas.
La base de prueba posterior debe aplicar la secuencia completa, no solo este SQL.
Nunca ejecutar migrate deploy sobre una URL habitual/remota por seguir este documento.

## Validación y límites

- `prisma validate`: aprobado. `prisma generate`: cliente local generado.
- TypeScript `tsc --noEmit --incremental false`: aprobado; `npm run build`: aprobado.
- Regresión Jest final: **121 suites / 1.560 pruebas aprobadas**. Incluye DTO,
  permisos/evidencia propia, recibos/duplicados, estado/revisión, cuotas/tasa,
  privacidad, Unicode y cobertura opt-in/legacy; la prueba SQL es **lectura estática**.
- ESLint de los ocho archivos de producción nuevos/modificados seleccionados:
  sin incidencias. No se ejecutó ni se declara limpio el lint global del proyecto.
- Inicialización del módulo compilado mediante Nest TestingModule con Prisma
  sustituido por un mock: aprobada, sin listen ni conexión DB; verifica registro
  de controladores/guards/filtro/middleware, no comportamiento HTTP autenticado.
- Herramientas locales: Node24.11.1/npm11.6.2, distintas de24.14.1/11.11.0 fijadas
  por el proyecto. No se reinstalaron dependencias ni se verificó CI Linux de R2;
  debe comprobarse en PR antes de integrar. No se modificaron esos pins.
- No se cambiaron dependencias/lockfiles. Entorno de comandos con URL local
  ficticia en puerto no utilizado; ninguno ejecutó migrate deploy ni conexiones
  PostgreSQL, HTTP real o Android. Prisma generate no aplica una migración.

No reutilizar CI/actas de instituciones como evidencia de MA-1R. Los mocks y la
lectura estática no prueban índices/RLS efectivos, rollback ni concurrencia real.

Para R4 quedan: migrar una base temporal, probar recibos/rollback/races entre
usuarios/ADMIN, cuota y tasa concurrentes, permisos DB, snapshots y agregación real;
después el recorrido Android/API/panel cuando exista R3. Sin celular ni servicios
necesarios para continuar el trabajo unitario de R2 o empezar UI de R3.
Antes de publicación, resolver retención, operación multiinstancia/proxy y staging
autorizado. P5/D3 siguen pausadas. Sin archivos adjuntos ni adaptadores de juegos aquí.
