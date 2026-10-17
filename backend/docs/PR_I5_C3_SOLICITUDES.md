# PR-I5-C3 — Solicitudes estudiantiles de ingreso

## Reanudación vigente — 16 de octubre de 2026

**C3C cerrado localmente:10/10; siguiente C4 código institucional privado/revocable.**
Caso10 confirmado por usuario: filtros y vacío coherentes, páginas20+1/retorno,
borrador conservado con Volver y descartado con Salir/reapertura. Cambio a docente
lector sin solicitudes del alumno ni revisión de propietario. Texto ampliado legible
confirmado según recorrido solicitado, sin captura ni medición instrumental de escala.
Evidencia Android/API/SQL en sesiones temporales distintas identificadas; no iOS,
producción ni nueva regresión completa. Casos7–8 no cubrieron pérdida de respuesta
tras escritura. Sin commit de instituciones/push/merge/despliegue. Notas parciales
inferiores son históricas y no reabren los casos ya cerrados.

Caso10: tras cerrar/reabrir desde recientes, usuario confirma que no reaparece
el borrador descartado, sin reinstalación ni borrado de datos. Pendientes cambio
a docente lector y texto ampliado; no confundir con persistencia de borrador activo.

Caso10: usuario confirma campo vacío al reabrir después de Salir. Descarte de
borrador explícito validado; no envío ni persistencia entre reinicios acreditados.
Faltan reapertura de app, cambio de cuenta y texto grande. Sigue9/10.

Caso10, protección de salida: usuario ve Volver/Salir y confirma texto conservado
al elegir Volver en borrador no enviado. Falta confirmar descarte con Salir y
reapertura, cambio de cuenta/reinicio y texto grande; no afirmar nuevo envío.

Caso10: usuario confirma21 solicitudes y navegación Android Siguiente→Página2 con
una solicitud/Siguiente deshabilitado/Anterior→Página1. Hubo reconexión USB manual
por usuario tras bloqueo de herramienta. Paginación humana acreditada además del
GET20+1 previo; faltan borrador/salida, cambio de cuenta/reinicio y texto grande.
Sigue9/10. Siguiente absent@example.invalid prepara borrador sin enviarlo.

Caso10: usuario confirma filtro Pendientes vacío tras rechazo. Helper nuevo
tool/prepare_student_requests_pagination.cjs: sintaxis y ejecución local aprobadas,
sesión temporal propia validada,21 alumnos/solicitudes sintéticos por HTTP.
GET propietario páginas20+1, sin IDs comunes, hayMas true/false. No altera los casos
anteriores ni acredita recorrido humano. Siguiente Android Consultar/Siguiente/Anterior;
no decidir estas solicitudes. Sigue9/10 hasta completar el resto del caso10.

Caso10 parcial: usuario rechazó Cupo C3 después de restauración y confirma filtros
Cancelada/Rechazada. GET propio verifica0041de76-c3c5-437e-8d52-5e338e6fe999
CANCELADA/revisión1 y ca1ca099-a4a2-4fb5-936a-5d7fe91653a0 RECHAZADA/revisión1.
Alumno absent conserva ESTUDIANTE sin institución. No repetir decisión ni afirmar
que quedó pendiente. Siguiente Pendientes vacío, paginación y resto del caso10;
9/10 completos.

**Checkpoint actual:9/10 locales completos, sigue caso10.** Usuario confirma
«no se pudo confirmar» al aprobar durante suspensión. SQL mantiene solicitud
ca1ca099-a4a2-4fb5-936a-5d7fe91653a0 PENDIENTE/revisión0, absent sin vínculo,
una creación y ninguna aprobación. Restaurados APROBADA y limiteEstudiantes=NULL.
Caso9 cerrado (conflicto obsoleto/cupo/suspensión), sin afirmar mensaje humano
específico de suspensión. Siguiente filtros Canceladas/Pendientes, paginación,
borradores y cambio de cuenta. Avances parciales inferiores son históricos.

Caso9, suspensión preparada después de consultar Android y confirmar Aceptar:
SQL cambia principal propia c3dc8e83-af9a-4714-b0bd-e6f1325693fa APROBADA→SUSPENDIDA.
Pendiente ca1ca099-a4a2-4fb5-936a-5d7fe91653a0 conserva revisión0.
Restaurar APROBADA después del escenario; limiteEstudiantes ya NULL.
Falta intento Android Aceptar/Confirmar desde lista antigua y verificación final;
no cerrar caso9 ni atribuir esta preparación a acción humana.

Caso9, cupo: usuario confirma bloqueo al aceptar por límite1. SQL verifica pendiente
ca1ca099-a4a2-4fb5-936a-5d7fe91653a0/revisión0, alumno absent sin vínculo,
una auditoría de creación y ninguna aprobación. Restaurado limiteEstudiantes=NULL
en principal propia, estado APROBADA. Falta suspensión: primero consultar desde
Android para habilitar revisión; no cerrar caso9 aún.

Caso9: usuario confirma retiro de cancelada al consultar pendientes. Preparación de cupo:
HTTP crea ca1ca099-a4a2-4fb5-936a-5d7fe91653a0, absent@example.invalid, «Cupo C3»,
PENDIENTE/revisión0. Fixture HTTP5c044c9e-f967-4631-b480-dc45ded2e1af aprobado para
zero@example.invalid ocupa un cupo. SQL configura limiteEstudiantes=1 en principal
propia, con un alumno vinculado comprobado; anterior NULL, restaurar al terminar.
Intento previo0 rechazado por CHECK sin persistir; protección conservada.
Preparación sintética, no aprobación humana. Falta intento Android de aceptar Cupo C3.

Avance caso9: Aceptar/Confirmar desde Android desactualizado devuelve al usuario
«no se pudo confirmar» (sin confirmar aviso específico de revisión). GET propio
posterior mantiene0041de76-c3c5-437e-8d52-5e338e6fe999 CANCELADA/revisión1.
No sobrescribió la cancelación. Pendiente consulta humana y restantes cupo/suspensión;
8/10 completos, no cerrar caso9 por este único conflicto.

Caso9 en curso: propietario mantiene pendiente visible en Android. Sesión HTTP
separada de absent@example.invalid cancela0041de76-c3c5-437e-8d52-5e338e6fe999
con DELETE/revisión0; respuesta CANCELADA/revisión1. Preparación de conflicto por
herramienta, no gesto humano. Tras operación previa sin resultado se consultó y
seguía pendiente antes del DELETE confirmado. Siguiente: Aceptar desde pantalla
obsoleta sin refrescar y observar respuesta; todavía no aprobado el caso9.

Caso9 preparado por usuario Android: absent@example.invalid envía y confirma pendiente.
GET propio verifica0041de76-c3c5-437e-8d52-5e338e6fe999 PENDIENTE/revisión0,
mensaje «conflicto c3», principal c3dc8e83-af9a-4714-b0bd-e6f1325693fa. No se ha
ejecutado conflicto/cancelación/decisión; siguiente propietario abre pendiente antes
de modificarla en sesión separada. No contar preparación como caso9 aprobado.

Siguen casos9–10;8/10 locales cerrados con límites documentados. Nueva sesión propia
saberplus-i2-local-YO1GnL:65 migraciones, API43187/panel4173, Android autorizado y
reverse43187. Credencial nueva privada en flutter-private.json/AUTH_E2E_PASSWORD.
Helper de preparación ejecutado sobre base nueva: principal
c3dc8e83-af9a-4714-b0bd-e6f1325693fa, alternativa77bb1071-edad-4db6-a583-74f96c54783c,
cancelada sintética13ade584-47a7-4c5f-996d-7006c2c1b38f. No es repetición humana
ni reconstrucción de las aprobaciones anteriores. Login HTTP de absent@example.invalid
verifica ESTUDIANTE sin institución e historial vacío; actor propuesto para caso9.
Siguiente: preparar pendiente desde Android y comprobar conflicto entre sesiones.
Las sesiones/IDs del15 de octubre inferiores son evidencia histórica, no parámetros actuales.

## Checkpoint del propietario — 15 de octubre de 2026

**C3A backend y C3B Flutter implementadas localmente; sigue C3C integrado.**
No es una entrega productiva ni el cierre completo de instituciones. El compañero
mantiene OV-1 por separado; esta acta pertenece al frente del propietario.
C2C conserva su cierre y observaciones en [logo institucional](PR_I5_C2_LOGO.md).
No hacer commit de instituciones todavía: el propietario decidió esperar al cierre
del bloque. No hacer push, merge ni migraciones remotas automáticamente.

## Reanudación actual — 15 de octubre

Sesión anterior detenida/sin contenedor, archivos temporales residuales no equivalen
a base disponible. Nueva sesión propia `saberplus-i2-local-DdRR2v`:65 migraciones,
API43187/panel4173 HTTP200, Android autorizado/reverse43187 y APK ajustada ya instalada.
No se reinstaló ni se borraron datos. Credenciales anteriores no sirven.
`tool/prepare_student_requests_resume.cjs` comprobado de sintaxis y ejecutado:
requiere base temporal propia vacía, crea fixtures y reconstruye por HTTP una
solicitud cancelada. Una fila CANCELADA/revisión1, una creación/una cancelación
y alumno sin vínculo verificados. Preparación sintética, no nuevo caso humano.

IDs actuales: principal `d9f26224-308a-48eb-b5a2-bc3ffa930b39`, alternativa
`a617753a-4915-4da0-88cf-63f5a03965fd`, solicitud `cfddf1a2-2012-4d18-a285-234e8a161af8`.
Alumno/propietario/lector conservan correos de ensayo; contraseña nueva únicamente
en archivo privado de la nueva sesión. Van8/10 casos completos en el alcance local documentado: usuario confirma retiro
del acceso en Más y conservación de Buscar instituciones; propietario/lector ya probados.
Casos5–8 cerrados; siguen9 y10. zero@example.invalid quedó aprobado tras recuperación
de red; no desvincular a los alumnos ya aprobados. No atribuir la cancelación humana
antigua a este fixture ni tratar referencias inferiores como IDs actuales.

## Regla de negocio

- ESTUDIANTE sin institución solicita ingreso a una institución APROBADA.
- Solo una solicitud PENDIENTE por estudiante, incluso entre instituciones.
- El estudiante consulta su historial privado y cancela una solicitud pendiente.
- Solo el PROPIETARIO docente, vigente en esa institución aprobada, acepta o rechaza.
  ADMINISTRADOR y PROFESOR institucionales no reciben esta facultad.
- Aprobar vincula `Usuario.institucionId` sin cambiar ESTUDIANTE, crear membresía
  docente ni asignar grupo. Comprueba cupo dentro de la misma transacción.
- Rechazar/cancelar conserva historial y no vincula. No se traslada silenciosamente
  a un alumno que ya ingresó por otra vía. Una decisión terminal no se reabre.
- Historial y estado serán los avisos privados dentro de la app. No hay push del
  sistema operativo, correo, motivo libre del revisor ni contador de no leídos
  implementados por esta entrega.
- Las solicitudes docentes existentes son otro flujo y no se reutilizan para alumnos.
  El código institucional privado y revocable queda en C4; no alterar códigos de grupo.

## Contrato HTTP

Base: `/instituciones/ingresos-estudiantes`. Sesión JWT y política de correo verificado
existente en todas las rutas. Respuestas correctas `Cache-Control: private, no-store`.

| Método/ruta | Actor y cuerpo/query | Resultado |
|---|---|---|
| POST base | Alumno; `{id, institucionId, mensaje?}` | 201, solicitud pendiente o resultado del mismo intento. |
| GET `/me` | Alumno; `pagina?` | Historial propio de todos los estados. |
| DELETE `/:id` | Alumno solicitante; `{revision}` | Cancelación; no borra historial. |
| GET `/pendientes` | Propietario; `pagina?`, `estado?` | Bandeja institucional; estado predeterminado PENDIENTE. |
| PATCH `/:id/revision` | Propietario; `{revision, decision}` | Decisión APROBAR o RECHAZAR. |

`id` e `institucionId`: UUID v4. El cliente genera `id` **una vez por intento lógico**
y lo conserva si la respuesta es incierta. Reenviar el mismo UUID/actor/institución
consulta el resultado, sin duplicar ni reabrir; no sirve para editar el mensaje.
Una nueva solicitud tras cancelar/rechazar necesita otro UUID.
`mensaje` opcional, máximo 500 caracteres, se recorta en extremos.
`revision` es entero JSON de 0 a 2147483646, sin coerción desde texto.
Página 1–10000, 20 registros y `hayMas`; no hay descarga completa del historial.

Solicitud devuelta: `id`, `institucion: {id,nombre}`, `estado`, `mensaje`, `revision`,
`fechaCreacion`, `fechaActualizacion` ISO. La bandeja añade `estudianteNombre`.
No devuelve correos, identificadores de alumno/revisor, evidencias, códigos ni datos
académicos. 401 sesión inválida; 403 rol/propietario/estado institucional; 404 recurso
ajeno o institución no disponible; 409 conflicto/revisión/vinculación; 400 validación
o cupo agotado, conforme al servicio de límites existente.

## Persistencia y concurrencia

Modelo nuevo `SolicitudIngresoEstudiante`; reutiliza únicamente el enum de estados,
no la tabla docente. Migración aditiva `20261014180000_student_institution_requests`.
Índice parcial único por estudiante cuando está PENDIENTE; RLS habilitado y sin
permisos directos para PUBLIC, anon o authenticated. Revisión optimista y transacciones
Serializable con reintentos acotados ante P2034/P2002. Vínculo, decisión y auditoría
se confirman juntos; si falla auditoría, no queda una aprobación parcial.
El parámetro de grado del servicio de cupos heredado no asigna grado ni grupo.

`prisma/schema.prisma` es archivo compartido con OV-1: coordinar sus cambios al
integrar PR, sin formatearlo completo ni descartar cambios del compañero.

## Evidencia ejecutada localmente

- `npm run build`: generación Prisma y compilación correctas antes de iniciar API.
- Regresión Jest: **118 suites / 1.411 pruebas aprobadas**, incluidas **37 nuevas**.
- Guion `tool/test_student_institution_requests_local.cjs`: **14/14 HTTP/PostgreSQL**
  aprobadas; se corrigió el fixture inicial de cupos para usar un límite válido ocupado,
  sin relajar la restricción de la base. Última ejecución incluye carrera por último cupo.
- Sesión propia temporal: PostgreSQL 16 local, **65 migraciones**, API loopback43187.
  Fixture sintético, no datos reales. No publicar `owner.json` ni `flutter-private.json`.
- Casos: RLS/índice único, autenticación/roles/identidad inyectada, privacidad, reintento
  concurrente de mismo UUID, dos solicitudes simultáneas, aprobación idempotente sin
  promoción, rechazo/cancelación/historial, revisión obsoleta y acceso ajeno, suspensión,
  cupo/vínculo previo, cancelación contra aprobación, último cupo concurrente, rollback
  por fallo de auditoría y persistencia tras reconectar.

Flutter añadió27 pruebas dirigidas aprobadas y regresión completa834 aprobadas/13
opt-in omitidas; análisis correcto: cliente, pantallas, incertidumbre,
permisos, cambio de sesión, límites y texto grande. No hay pruebas humanas Android C3
ni ensayo Flutter/API todavía. No se aplicó esta migración
en Supabase/Render, no hay despliegue, validación iOS ni cierre operativo productivo.
Las observaciones C2 sobre captura original/CI Linux siguen abiertas, no se ocultan.

## Reproducir sin tocar una base externa

En `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
node tool/local_ranking_validation.mjs
```

El supervisor imprime la ruta temporal recién creada; dejar esa terminal abierta.
En otra terminal de backend, usar **esa ruta actual**, no una sesión antigua:

```powershell
$env:SABERPLUS_LOCAL_SESSION = '<ruta temporal impresa por el supervisor>'
node --test tool/test_student_institution_requests_local.cjs
```

El guion exige marcador de propiedad y PostgreSQL local desechable, crea instituciones
y usuarios propios y no acepta DATABASE_URL externa. Puede repetirse: cada ejecución
crea fixtures nuevos. No imprime contraseñas/tokens. Cerrar la API antes de regenerar
Prisma si Windows bloquea la DLL; el apagado normal elimina solo el contenedor propio.

## C3B implementada en la app — 15 de octubre

1. Cliente remoto, modelos y repositorio siguiendo la arquitectura existente.
2. Ficha del directorio: solicitar ingreso con confirmación/mensaje opcional; mostrar
   pendiente/estado en vez de duplicar formulario; cuenta vinculada sin botón de solicitud.
3. Historial privado del estudiante con consulta, paginación, cancelación confirmada y
   estados comprensibles; aceptación/rechazo visibles al consultar o actualizar.
4. Bandeja exclusiva del propietario: nombre, mensaje, confirmar aceptar/rechazar,
   recargar tras decidir; docentes lectores no tienen botones de revisión.
5. Respuesta incierta: conservar UUID/borrador y consultar antes de reenviar; conflictos
   no sobrescriben. Carga/error/reintento, salida y cambios de sesión sin datos cruzados.
6.27 pruebas Flutter dirigidas aprobadas; C3C integrado HTTP/SQL/Android USB pendiente.

Acceso alumno: Más → acceso contextual de ingreso (solo si procede), o directorio → ficha → Solicitar
ingreso. Acceso propietario: espacio del profesor → Solicitudes de estudiantes.
La demostración no envía solicitudes; solo explica que requiere cuenta real.
Al cambiar de identidad se invalida el contexto institucional y se descartan borradores
y respuestas de la cuenta anterior. Las solicitudes docentes siguen separadas.

**UX ajustada durante caso2,15 de octubre:** menú sin acceso permanente si no hay
solicitud, está cancelada/aprobada o cuenta ya vinculada. Pendiente muestra acceso
contextual; último rechazo muestra aviso hasta consultar el resultado. Lectura se
recuerda localmente por cuenta/UUID/revisión, no sincronizada entre dispositivos;
historial remoto y reglas de ingreso no cambian, sin nueva migración. Fallos de
preferencias conservan aviso. Institución aceptada sin grupos se muestra vinculada,
sin asignar grupo.86 pruebas Flutter dirigidas aprobadas (12 nuevas), análisis limpio
y APK compilada; validación humana Android del nuevo menú pendiente. Regresión
completa834/13 anterior no reejecutada después de este ajuste. API no cambia aquí.
APK ajustada instalada Success por USB sin borrar datos y actividad abierta;
SQL conserva solicitud humana `2b4a7c92-32ef-4809-89a5-7f8f7060bd09` PENDIENTE/revisión0.
API200 y reverse43187 comprobados. Siguiente gesto: Más → acceso contextual pendiente;
validación humana aún por confirmar, caso2 no cerrado por instalar la APK.

## Continuación C3C

**Checkpoint vigente:8/10, siguen casos9–10.** Usuario confirma consulta tras reconectar,
botones habilitados y aprobación/retiro de pendientes al decidir una vez. SQL verifica
f790925d-1b8b-4675-a4c2-5bf2844680ec APROBADA/revisión1, mensaje «Hola c3»,
zero@example.invalid ESTUDIANTE vinculado a institución principal; exactamente una
creación y una aprobación auditadas. Casos7–8 aprobados para desconexión previa
a escritura y recuperación mediante consulta/reintento, sin duplicados observados.
No se probó pérdida de respuesta posterior al commit ni se capturó UUID en tráfico
Android. Los avances parciales inferiores son evidencia histórica, no el siguiente paso.

**Caso7 parcial, red previa al envío:** zero@example.invalid, sin vínculo e historial
vacío, prepara borrador (el guion proponía «Prueba de conexión C3»). Se retira reverse USB43187 antes del POST,
API sigue activa. Usuario confirma aviso de operación no confirmada y texto conservado.
Reverse restaurado y GET autenticado propio devuelve historial vacío. Esto no prueba
pérdida de confirmación después de escritura. Faltan consulta/reintento Android del
mismo envío (caso8), contraste final y fallo durante decisión; siguen6/10 completos.

Avance posterior7–8: usuario consulta estado, confirma texto conservado y reintenta
una vez; aparece PENDIENTE. SQL: única f790925d-1b8b-4675-a4c2-5bf2844680ec,
revisión0, una creación auditada; alumno ESTUDIANTE sin institución. Mensaje real
«Hola c3», no el ejemplo. Usuario confirma expresamente que era su texto original;
conservación del borrador acreditada por observación humana y persistencia.
No hay duplicación observada; no acredita pérdida de respuesta tras escritura.
Pendiente fallo durante decisión y resto del alcance; siguen6/10 cerrados.

Fallo durante decisión ya observado: propietario intenta Aceptar/Confirmar «Hola c3»
con reverse43187 retirado; usuario confirma operación no confirmada. SQL conserva
f790925d-1b8b-4675-a4c2-5bf2844680ec PENDIENTE/revisión0 y alumno sin institución.
Una creación auditada, ninguna decisión persistida. Reverse restaurado; siguiente
gesto: consultar estado en Android antes de volver a decidir. No cerrar recuperación
de decisión hasta observación humana y comprobación final.

**Caso6 aprobado localmente; estado actual6/10:** propietario confirma Aceptar/Confirmar y retiro de pendientes.
SQL `86c61a40-2b21-4f63-9474-0d632b0de416`: APROBADA/revisión1, revisor propietario,
una creación/una aprobación. Alumno ESTUDIANTE, institución principal
`d9f26224-308a-48eb-b5a2-bc3ffa930b39`, cero membresías docentes y cero grupos en base.
Sin promoción ni asignación de grupo. Usuario confirma retiro del acceso de solicitud
y aporta captura de Mi institución y grupos: Institución vinculada, sin grupos asignados.
Buscar instituciones permanece como directorio; la confusión inicial no fue un fallo
de persistencia. SQL y login HTTP reconfirman el vínculo. Siguiente caso7 de red con
otro alumno ficticio sin institución; conservar intacto al aprobado y no repetir decisión.

**Caso5 aprobado localmente:** propietario confirma Rechazar/Confirmar y retiro de pendientes.
SQL de `997ed62b-92d4-4f3d-81f0-ca40985fed08`: RECHAZADA/revisión1, mensaje `permiso 3`,
una creación y un rechazo auditados. Alumno ESTUDIANTE sin institución. Usuario
alumno confirma aviso previo a consulta, lectura de Rechazada
y retiro del acceso al volver a Más, sin retirar Buscar instituciones. No se afirma
inspección nativa ni lectura sincronizada. Luego crea nueva solicitud y confirma
historial conservado. SQL: tres filas distintas CANCELADA/revisión1, RECHAZADA/revisión1
intacta y nueva `86c61a40-2b21-4f63-9474-0d632b0de416` PENDIENTE/revisión0, una creación
por fila. Mensaje real `aprobación c3`, no reemplazar por el ejemplo. Estudiante sin
vínculo ni membresía docente. Siguen5/10 completos. Caso6 preparado: entrar como
propietario y Aceptar/Confirmar la pendiente nueva, después consultar desde alumno.

**Caso4 aprobado localmente:** usuario ve cancelada y nueva pendiente. SQL confirma
preparación `cfddf1a2-2012-4d18-a285-234e8a161af8` CANCELADA/revisión1 y nueva
`997ed62b-92d4-4f3d-81f0-ca40985fed08` PENDIENTE/revisión0, una creación por fila,
mensaje real `permiso 3`; no modificarlo por el texto de ejemplo. Alumno ESTUDIANTE
sin institución. Propietario teacher@example.invalid confirma bandeja, mensaje
`permiso 3` y controles Aceptar/Rechazar; sin decisión indicada ni acreditada.
Lector teacher-reader@example.invalid confirma ausencia del acceso de revisión.
HTTP con sesiones independientes de lector y alumno: bandeja rechazada403 para
ambos. No se ejecutaron decisiones mediante herramientas. Siguen4/10 completos.
Siguiente caso5: salir del lector, entrar como propietario y Rechazar/Confirmar;
después verificar el aviso y el historial desde el alumno.

**Preparado15 de octubre, humano2/10:** sesión propia `saberplus-i2-local-PBB898`,
65 migraciones, API43187/panel4173 comprobados y Android USB reverse43187.
APK nueva `.i2validation` compilada, instalación Success y actividad abierta,
sin borrar datos ni reemplazar la app habitual. No acredita confirmación humana.
Propietario `teacher@example.invalid`, lector `teacher-reader@example.invalid`,
alumno `student@example.invalid` sin vínculo ni solicitudes. Institución aprobada
`Institucion de ensayo C3` (`a9b7bf03-0734-4d16-96c4-63f2f9ef293a`) y alternativa
`7055cc6a-451a-47bd-b788-6f3f3a33f425`. Datos sintéticos.
Smoke HTTP aprobado: login, consultas vacías/privadas, permisos y directorio.
Se corrigió coerción implícita en DTO con Transform al valor original: revisión
texto/booleano/null y mensaje numérico rechazados por HTTP;37 pruebas dirigidas
aprobadas con `enableImplicitConversion:true`. No se repitió todavía toda la regresión
después de ese ajuste. No se creó solicitud en el smoke. Credenciales solo en archivo
privado de sesión, nunca en repo/APK.

**Caso1 aprobado localmente:** usuario confirma texto conservado al pulsar Volver
en la confirmación, sin enviar. SQL:0 solicitudes del alumno,0 auditorías de solicitudes,
rol ESTUDIANTE y sin institución. No acredita todavía envío ni decisiones. Siguiente:
caso2, consulta/reapertura para terminar de comprobar persistencia visual.

**Caso2 aprobado localmente:** usuario confirma pendiente tras envío y consulta/reapertura;
tras ajuste UX confirma acceso contextual y solicitud sin formulario. SQL confirma una solicitud
`2b4a7c92-32ef-4809-89a5-7f8f7060bd09`, revisión0/PENDIENTE, una auditoría de creación,
sin vínculo ni membresía docente y rol ESTUDIANTE conservado. Reconsulta SQL conserva
una creación/PENDIENTE/revisión0. Continúa2/10 casos completos. Siguiente caso3:
ficha alternativa impide segunda solicitud, después probar cancelación confirmada.

**Caso3 aprobado en el alcance registrado:** usuario informa que desde alternativa vuelve a la pendiente anterior;
sin nuevo envío. No confirmó texto explicativo, queda mejora UX de claridad. Cancelar
solicitud → Volver conserva pendiente según usuario. SQL verifica una sola solicitud
original PENDIENTE/revisión0, una auditoría total (creación) y sin vínculo en ese momento.
Luego usuario confirmó Cancelada; SQL previo a la interrupción verificó fila conservada
CANCELADA/revisión1, una creación/una cancelación, ESTUDIANTE sin vínculo.
Tras reanudar con fixture cancelado, usuario confirma retiro del acceso de Más,
directorio conservado con las dos instituciones. Son3/10 completos; último chequeo
visual tras reconstrucción, no secuencia humana ininterrumpida. Auditorías originales
verificadas antes de interrupción, no atribuidas a esta base. Sigue caso4.

Preparar fixtures actuales en sesión propia con65 migraciones, API43187 y APK nueva.
Primero probar repositorio Flutter/API; después Android USB despierto, depuración e
instalación autorizadas. **5 casos humanos aprobados y5 pendientes**, detallados en el acta Flutter:
confirmación/descarte; envío/persistencia; una pendiente y cancelación; permisos;
rechazo; aprobación/vínculo sin promover; error de red; recuperación/idempotencia;
conflicto/cupo/suspensión; paginación/salida/sesión/texto grande. No declarar los restantes
ejecutados por tener pruebas Jest/widgets. Registrar evidencia sin secretos.

Después: C4 código institucional privado/revocable y cierre integrado de instituciones.
El rediseño ventana por ventana y el recorrido inicial quedan para la fase visual final.
