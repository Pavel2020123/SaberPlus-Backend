# MA-1R / R1 — Auditoría y propuesta de reportes académicos

**Continuación verificada del19:** [R4](MA1R_R4_VALIDACION_LOCAL.md) con12/12
humanos y45/45 PostgreSQL/HTTP en bases temporales propias, ya limpiadas. Carrera
ADMIN P2010/40001 corregida y probada; contrato efectivo R2/R4, no la propuesta
original inferior. Remate visual confirmado, cierre local R4 e integración a main
por PR API #9/app #6 (eef0d40/21757a1); CI backend del PR aprobado.
Sigue preparación local C5; sin producción/SQL remoto, QA-1 Flutter remoto pendiente.
Este documento conserva la auditoría R1, no ordena rehacer fases completadas.

17 de octubre de 2026. Responsable: propietario. **R1 auditada y flujo inicial
autorizado; [R2 implementada y probada localmente](MA1R_R2_BACKEND.md).
R3 app/panel local lista según [acta](MA1R_R3_APP_PANEL.md); R4 pendiente.**
Este texto conserva la propuesta/auditoría R1 original;
las precisiones y resultados de implementación están en el acta R2.
Documento técnico del contrato; la guía de UX/checkpoint general está en
`docs/MA1R_REPORTES_PREGUNTAS.md` del repositorio Flutter, no en este árbol.
No es un endpoint existente ni autorización para crear tablas, cambiar reglas,
activar servicios o desplegar. No se usaron Docker, Android ni datos de usuarios.

## Base y coordinación

- Backend revisado: `56a65fb`, sobre main institucional `388bb18`.
- App revisada: `894bcc0`, sobre main institucional `e679c50`.
- Ramas locales de esta tarea: `docs/ma1r-r1-reportes`. Parten de los commits
  documentales de `docs/estado-post-instituciones`, todavía no integrados a main
  al hacer fetch. Es una dependencia documental, no código funcional adicional.
- No se mezcló la rama OV-1 ni se editó CHECKPOINT_OV1. Coordinar schema,
  migraciones, registro de módulos y locks antes de R2, no asumir exclusividad.
- Sin commit/push/PR/merge en R1. El cierre institucional y su CI son antecedentes,
  no pruebas de reportes. [Orden general](ESTADO_Y_ORDEN_2026_10_17.md).

## Evidencia encontrada por inspección estática

| Archivo real | Hallazgo | Consecuencia |
|---|---|---|
| [Cobertura](../BANK_COVERAGE.md), [servicio](../src/admin/bank-coverage.service.ts) | Conteos por subtema ya implementados; `reportesDisponibles:false` / `reportes:null`. | No reconstruir cobertura ni presentar ceros ficticios. |
| [Validador del panel](../../admin/public/bank-coverage.mjs) y [pruebas](../../admin/test/bank-coverage.test.mjs) | Rechazan cualquier valor distinto de false/null en esos campos. | Cambiar solo backend rompe el panel actual. Compatibilidad coordinada obligatoria. |
| [Schema](../prisma/schema.prisma) | No hay modelo de reporte académico. `BatallaReporte` reporta personas/rivales. | Persistencia separada, sin reutilizar denuncias de rival. |
| [Servicio de simulacros](../src/simulacro/simulacro.service.ts) | Intento asigna IDs; al calificar genera revisión e HistorialRespuesta propio. Historial enlaza la pregunta, no conserva todo el contenido histórico. | Puede acreditar que la cuenta respondió esa pregunta; no reconstruye exactamente toda pantalla anterior. |
| [Editor](../src/admin/question-editor.service.ts) y [publicación simple](../src/admin/simple-content.controller.ts) | Guardar edición directa archiva ID anterior y crea ID nuevo, devuelve reemplazaId. | Conservar el ID original reportado, incluso archivado. No reasignar el reporte a la nueva pregunta. |
| [Editor](../src/admin/question-editor.service.ts), [huella](../src/common/question-fingerprint.ts) | Revisión editorial incluye relaciones/contadores; huella de duplicados omite solución/explicación y normaliza contenido. | Ninguna identifica por sí sola todo el contenido visto. No reutilizarla como versión semántica ni como autorización. |
| [Reclasificación](../src/admin/question-reclassification.service.ts) | Bloquea mover preguntas publicadas o con uso. | Reutilizar protecciones, sin inventar un nuevo flujo de reclasificación en MA-1R. |
| [Guards](../src/auth/jwt.guard.ts), [correo](../src/auth/email-verificado.guard.ts) | Roles se comprueban en BD; ADMIN no equivale a administrador institucional. | Separar creación estudiantil y moderación global. Nunca fiarse del rol enviado por el cliente. |
| [Guardián](../src/guardian/guardian.service.ts), [Cima](../src/summit/summit.service.ts), [Rescate](../src/star-rescue/star-rescue.service.ts) | Intentos JSON y contratos propios; no todos devuelven el mismo detalle/revisión. | Necesitan adaptadores de evidencia por juego; compartir PracticeQuestion no acredita una respuesta en HistorialRespuesta. |
| [Soporte](../src/soporte/soporte.service.ts) | Configura contacto WhatsApp; no es una bandeja persistente de reportes. | No reemplazar reportes por un enlace ni convertir WhatsApp en dependencia. |

En Flutter, PracticeQuestion/PracticeReviewQuestion tienen ID y contenido,
sin revisión semántica común. Marcar «difícil» es un registro personal local,
no una denuncia de error ni evidencia suficiente para reportar al servidor.

## Recomendación de alcance inicial, por confirmar

1. Cuenta real ESTUDIANTE con correo verificado; crear desde revisión posterior
   a la calificación de práctica por subtema, aleatoria o simulacro por área.
   Acierto y error permiten reportar; equivocarse no demuestra fallo del banco.
2. El servidor exige HistorialRespuesta de ese usuario y pregunta. No basta
   enviar UUID válido, pertenecer a una institución o poseer un borrador local.
3. No exigir plan vigente para reportar/consultar una pregunta ya respondida;
   tampoco dar acceso al banco ni a una evaluación nueva por este canal.
4. ADMIN de SaberPlus revisa en panel. Profesor/propietario/ADMIN institucional
   no recibe bandeja, identidad del reportante ni permiso para resolver.
5. Demo sin escritura real. Juegos, diagnóstico, histórico AM/PM, flashcards,
   cuaderno y respuestas antiguas se incorporan por adaptadores explícitos,
   no por asumir que todas las pantallas tienen la misma evidencia.
   No se retiran esos módulos; solo queda fuera su botón de reporte inicial.
6. No interrumpir evaluaciones activas, alterar tiempo, XP, nota, racha,
   ranking, progreso ni certificados. Sin incentivo ni anuncio por reportar.

## Motivos y texto propuestos

Un motivo por reporte: `ENUNCIADO_CONFUSO`, `RESPUESTA_INCORRECTA`,
`EXPLICACION_INCORRECTA`, `IMAGEN_NO_CARGA`, `OTRO`.
Detalle opcional de hasta 500 puntos de código Unicode; para OTRO mínimo 10
tras trim. Misma cuenta Unicode en app y servidor. Rechazar NUL/controles no
admitidos, objetos/arrays y propiedades ajenas. No interpretar HTML/Markdown;
renderizar texto seguro, no innerHTML. Avisar que no incluya datos personales.
Sin adjuntos, enlaces nuevos ni descarga de recursos remitidos en el detalle.

## Identidad y evidencia de contenido

- La identidad base es Pregunta.id del registro respondido. Una corrección por
  el editor directo produce otro ID: no fusionar reportes por enunciado o huella.
- En recepción guardar un snapshot **del servidor al recibir el reporte**:
  ID, clasificación, texto/opciones/solución/explicaciones, caso y referencias
  de imagen pertinentes, origen comprobado y fecha de captura. Datos de revisión
  completos solo para ADMIN; no copiarlos a listados públicos o recibos del alumno.
- Snapshot recibido no equivale a captura exacta del dispositivo ni a bytes
  originales de imagen. Contextos/metadatos/URLs pueden haber cambiado; marcar
  esa limitación y evidencia incompleta cuando corresponda. No reconstruir
  versiones antiguas a partir de texto inventado por el cliente.
- La primera versión propone ese alcance honesto y reutiliza el ID archivado.
  Si se exige certificar exactamente lo mostrado al servir cada pregunta,
  decidir antes de R2: requiere evidencia inmutable emitida por servidor al
  entregar/revisar y adaptación de intentos/clientes; no existe hoy de forma común.
- No bloquear reportes legítimos solo porque el registro quedó archivado
  después de contestar. No revelar registros sin uso propio verificable.
- Corregir en editor no cierra el reporte automáticamente ni elimina evidencia.
  C4/C6 y C5 siguen siendo responsables de versiones amplias y medios persistentes.

## Estados y revisión propuestos

| Estado | Significado | Transición propuesta |
|---|---|---|
| PENDIENTE | Recibido, sin dictamen | ADMIN → EN_REVISION |
| EN_REVISION | Se está comprobando | ADMIN → RESUELTO o DESCARTADO |
| RESUELTO | ADMIN documentó atención/corrección comprobada | ADMIN puede reabrir a EN_REVISION con motivo |
| DESCARTADO | No se requiere corrección, con motivo | ADMIN puede reabrir a EN_REVISION con motivo |

Toda decisión cambia revisión monotónica, con actor/fecha/transición/motivo en
auditoría append-only. Motivo de cierre/reapertura obligatorio; nota interna
separada del estado/texto público para el alumno. No prometer plazo de respuesta.
Cerrar no edita respuestas ni recalifica intentos. Una corrección usa el editor
actual; referencia a nueva Pregunta.id opcional y verificada, nunca inferida.
Otra versión/otro reporte concurrente no recibe la decisión por accidente.

## Duplicados, reintentos y concurrencia

- UUID de operación generado al confirmar. Mismo usuario+UUID+payload normalizado:
  mismo recibo; UUID reutilizado con otro payload: 409, sin modificar el anterior.
  Colisión de UUID ajeno: error genérico sin confirmar existencia/identidad.
- Un reporte por usuario+Pregunta.id+motivo, incluso con distinto UUID o ya cerrado.
  Devuelve el reporte propio existente con duplicado:true; no agrega comentario,
  cambia motivo, reabre ni suma conteos silenciosamente. Nuevo ID editorial puede
  recibir un reporte nuevo. Reportantes distintos conservan sus propios registros.
- Reintento semántico con UUID distinto debe quedar vinculado a un recibo estable:
  consultar por ese UUID funciona también después de respuesta duplicado:true.
  Restricciones únicas y transacción/recibo, no solo findFirst antes de insertar.
- ADMIN envía UUID de decisión y revisión esperada; reintento idéntico no duplica
  auditoría. Si otro ADMIN avanzó: 409, consultar versión actual, no sobrescribir.
- Timeout/5xx/respuesta inválida: resultado incierto. Conservar texto/intento,
  permitir consulta propia por UUID y reenvío del mismo payload con mismo UUID.
  No fabricar éxito ni generar otro UUID automáticamente. Cambio de cuenta limpia
  datos de pantalla y descarta respuestas tardías; no envía con cuenta nueva.
- Propuesta de límites: 20 reportes nuevos por cuenta en 24 h móviles; replays
  y duplicados no consumen cupo nuevo. Límite técnico de escritura 20 solicitudes/
  minuto/cuenta más protección por IP adecuada a redes compartidas. Valores y
  mecanismo por aprobar; cuota atómica y tasa real verificadas antes de publicar,
  no una promesa de protección multiinstancia usando solo memoria del proceso.

## API propuesta original de R1; implementación actual en el acta R2

| Ruta | Entrada / salida mínima | Permiso |
|---|---|---|
| POST /preguntas/reportes | operacionId, preguntaId, motivo, detalle; recibo propio con id/estado/revision/duplicado | ESTUDIANTE verificado y evidencia propia |
| GET /preguntas/reportes/operaciones/:operacionId | Recibo propio para reconciliar envío | Mismo usuario, nunca búsqueda global de UUID |
| GET /preguntas/reportes/mios | Paginado de reportes propios, sin solución ni notas internas | Mismo usuario |
| GET /admin/reportes-preguntas | Filtros área/subtema/estado/motivo; paginación estable | ADMIN |
| GET /admin/reportes-preguntas/:id | Snapshot, contexto y auditoría autorizados | ADMIN |
| PATCH /admin/reportes-preguntas/:id/estado | operacionId, revision, destino y motivo; recibo de decisión | ADMIN |

Listados: página inicial 1, tamaño 20, máximo 50, página máxima 10000; orden por
fecha e ID para desempate, filtros validados y área/subtema compatibles.
Paginación no garantiza snapshot entre solicitudes; recarga explícita tras decisión.
IDs de pregunta son strings del banco; no imponer UUID v4 donde schema no lo exige.
UUID de operaciones sí estricto; no recibir usuarioId/rol/estado/solución desde app.
JWT + EmailVerificadoGuard y rol de BD en estudiante; AdminGuard en moderación.
No usar PlanVigenteGuard por defecto en reportes ya acreditados, sujeto a aprobación.
Respuestas privadas Cache-Control: private, no-store; sin PII/payload en logs.
400 datos; 401 sesión; 403 rol/correo; 404 recurso sin acceso o inexistente;
409 operación/revisión incompatible; 429 tasa/cuota con espera. Códigos semánticos
estables y mensajes específicos, no «recarga catálogo» para un reporte incierto.

## Persistencia propuesta, por diseñar en R2

Entidad reporte separada con autor interno, pregunta original, motivo/detalle,
snapshot recibido/origen/fecha, clasificación capturada, estado/revisión/fechas.
Recibos idempotentes de creación/decisión y eventos de revisión append-only.
Unique del duplicado semántico y de operaciones, índices de bandeja/autor/estado;
RLS y revocación de acceso directo anon/authenticated como otros datos privados.
No FK con borrado en cascada que destruya evidencia por retirar una pregunta.
Minimización/retención y eliminación/anonimización de cuenta por acordar antes
de publicar; no guardar correos, tokens, IPs o historial completo innecesarios.
No autorizar conservar datos personales indefinidamente por esta propuesta.

## Cobertura y panel: compatibilidad obligatoria

Propuesta: reportesDisponibles:true, versión de contrato de reportes 1 y por
subtema reportes = número de reportes abiertos (PENDIENTE+EN_REVISION), junto a
preguntasConReportes = IDs distintos con reportes abiertos. No confundir alumnos,
incidencias, preguntas y conteo histórico; resuelto/descartado no suma abiertos.
Clasificación capturada de recepción permite conservar incidencias de IDs
archivados; no ocultarlas ni cerrarlas por quedar fuera de publicadas disponibles.

Actualmente dejar false/null. Antes de activar el contrato nuevo, el panel debe
aceptar tanto false/null del backend viejo como la respuesta nueva validada.
Backend nuevo con panel viejo fallaría: preparar compatibilidad R3 antes de
desplegar/activar el cambio; sin cambiar banderas, endpoints o datos en R1.
Backend/panel/demo/pruebas cambian coordinados; cero solo significa consulta
exitosa, sistema disponible y ningún reporte abierto. Error no equivale a cero.
Conteos agrupados y paginados, sin descargar todas las preguntas/reportantes.

## Pruebas a escribir/ejecutar después, no realizadas en R1

- R2 unitarias: roles/ownership/evidencia propia, versiones archivadas, validación,
  snapshot/privacidad, idempotencia/cambio de payload, cuota, transiciones/revisión.
- PostgreSQL/HTTP temporal: índices/recibos/races, dos reportantes/ADMIN concurrentes,
  rollback, estado incierto, RLS/acceso directo y agregación de cobertura.
- R3 panel/demo: dos contratos, filtros/paginación, error no vacío, XSS como texto,
  permisos globales vs institucionales, sesión vencida y respuestas tardías.
- R3 Flutter: formulario Unicode, doble toque, cancelar, timeout y mismo envío,
  consulta por UUID, duplicado sin sobreescritura, cambio de cuenta y revisión.
- R4: recorrido físico app→API→panel→estado propio, red/cierre y corrección del ID
  original; documentar cada resultado real, sin copiar checks institucionales.
- Ensayos de juego/otros orígenes solo al implementar sus adaptadores; no declarar
  alcance global por pasar práctica. Staging/producción requieren permiso separado.

## Puerta R1 y decisiones posteriores

El propietario autorizó el flujo inicial y continuar R2 sin servicios/dispositivo.
Se implementaron motivos/500 caracteres, estados/reapertura, dedupe por usuario+
ID+motivo y snapshot de recepción; límites técnicos iniciales según acta R2.
Retención/eliminación de texto libre, operación distribuida, evidencia histórica
exacta y extensión de otros orígenes siguen pendientes antes de sus respectivas
activaciones. Autorizar R2 no significa desplegar, aplicar SQL ni cerrar R3/R4.

Verificación realizada en R1: inspección estática de los archivos citados,
referencias Markdown locales y git diff --check. No ejecuta tests nuevos,
Prisma generate/migrate, API, panel/demo ni APK. Sin modificación funcional.
