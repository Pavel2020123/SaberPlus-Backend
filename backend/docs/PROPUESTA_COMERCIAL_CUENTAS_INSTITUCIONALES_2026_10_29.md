# SaberPlus — Propuesta funcional: licencias institucionales, cuentas y renovación

**Fecha:** 29 de octubre de 2026  
**Estado:** PROPUESTA PARA REVISIÓN — NO IMPLEMENTADA NI AUTORIZADA PARA DESPLIEGUE  
**Alcance de este documento:** requisitos y flujos de negocio, incluida la decisión posterior sobre **eliminación completa por el docente**, panel web, códigos de beca y anuncios. No modifica código, esquema Prisma, migraciones, datos ni permisos vigentes.

## 1. Objetivo y decisión de producto

Permitir que una institución contrate un número determinado de cupos para estudiantes durante un período (mensual, temporada escolar, anual o plazo acordado), y que un docente o responsable institucional autorizado administre los estudiantes asociados. Al vencer el contrato, se suspende el **acceso educativo contratado** de esas cuentas sin borrar sus registros; al renovar, las cuentas seleccionadas recuperan acceso.

**Decisión expresada por el propietario del proyecto:** las cuentas institucionales creadas en ese marco **no pasan automáticamente al plan gratuito** tras el vencimiento. El docente debe poder seguir entrando al panel administrativo para consultar la institución y gestionar la renovación. Los datos de estudiantes vinculados no desaparecen por la sola expiración.

**Precisión importante:** que el docente haya creado/importado las cuentas **no equivale a ser titular jurídico de los datos personales**. El docente tiene facultades de gestión **delegadas, acotadas por institución y rol**; el tratamiento, acceso, conservación y supresión deben estar definidos contractualmente y conforme a la normativa aplicable, especialmente por tratarse potencialmente de menores. El administrador general tampoco debería realizar alteraciones directas de producción sin controles, autorización y auditoría.

## 2. Contexto técnico que ya existe

En el backend NestJS + Prisma + PostgreSQL ya existen modelos y reglas de instituciones/usuarios y planes: el esquema consultado incluye `Institucion.planActual`, `Institucion.fechaVencimientoPlan`, `Institucion.limiteEstudiantes`, `Institucion.calendarioIcfes`, `Usuario`, `MiembroInstitucion`, `Clase`, `ClaseEstudiante` y relaciones institucionales. También existen códigos de ingreso y otros flujos institucionales. **No se presupone que exista actualmente** un sistema completo de contratos pagados, cupos asignados, importación CSV, cuentas institucionales generadas ni renovación comercial. Se debe auditar los contratos y permisos actuales antes de implementar esta propuesta.

El panel del docente se propone prioritariamente en **web** para importar CSV, administrar cupos y revisar estadísticas; la app Flutter puede conservar consultas rápidas. Ambos clientes utilizarían **la misma API NestJS** y los controles de autorización del servidor. El panel actual `admin/` es administrativo/editorial y **no debe confundirse** automáticamente con un panel institucional del docente ni con una solución comercial ya lista.

## 3. Roles y responsabilidades propuestas

- **ADMIN_GENERAL:** aprueba altas, planes, pagos/contratos, cupos, renovaciones, suspensiones excepcionales y auditoría global. Las operaciones sensibles deben quedar registradas.
- **RESPONSABLE_INSTITUCIONAL / DOCENTE_AUTORIZADO:** administra únicamente su institución y estudiantes **asignados a su ámbito**, conforme a privilegios explícitos; puede cargar CSV, ver listados, restablecer accesos iniciales y solicitar bajas. No puede inventar cupos pagados ni renovar contratos por sí mismo.
- **ESTUDIANTE_INSTITUCIONAL:** usa la aplicación educativa solamente si su cuenta está habilitada y tiene un cupo vigente asignado, además de satisfacer las demás reglas de seguridad.

La autorización debe validar **identidad + rol + pertenencia institucional + alcance sobre el estudiante + vigencia de licencia + operación solicitada**. Ser creador de una fila o poseer un JWT válido **no autoriza por sí solo** a ver, modificar o borrar cualquier dato.

## 4. Ciclo de contrato y licencias

**Contrato:** institución, tipo y duración, fecha de inicio y expiración, cantidad de cupos contratados, estado comercial (`PENDIENTE`, `ACTIVO`, `VENCIDO`, `SUSPENDIDO`, `CANCELADO`), constancia de aprobación y responsable. Los nombres de estados son propuestos y no deben copiarse a los enums existentes sin análisis.

**Cupos:** separar (a) cuenta de estudiante, (b) vinculación a institución y (c) **asignación de licencia**. Ejemplo: 30 cupos contratados, 30 asignados, 0 disponibles. Un estudiante no debe consumir dos cupos por importaciones repetidas. La creación de usuario no debe activar por sí sola una suscripción paga.

**Vencimiento:** al llegar a la fecha pactada, el servidor bloquea el acceso educativo institucional, aun si existe un JWT válido. **No eliminar automáticamente** cuentas, historiales o resultados. El docente conserva acceso limitado al panel para ver alumnos vinculados, estado, cupos y opciones de renovación/gestión autorizadas. El sistema debe controlar esto desde NestJS, nunca solo ocultando botones en Flutter/web.

**Renovación:** solo tras confirmación administrativa o de pago autorizada. Si se renuevan los mismos 30 cupos, se reactivan las asignaciones elegibles sin recrear contraseñas ni perder progreso sujeto a la política de retención. Si se renuevan 20 de 30, un responsable autorizado selecciona los 20 beneficiarios; los 10 restantes siguen sin acceso contratado. Evitar extender licencias desde el panel docente sin autorización de ADMIN_GENERAL.

**Reemplazo de estudiantes:** cuando un docente desea incorporar 30 estudiantes diferentes, deberá existir un flujo de desvinculación/reasignación que considere los cupos comprados, las fechas y una política comercial de transferencias (por definir: libre, limitada o con aprobación). No usar borrado irreversible para liberar automáticamente un cupo y evitar abusos.

## 5. Alta de institución e importación masiva por CSV

Flujo propuesto:
1. Crear/solicitar institución y registrar un responsable institucional verificable.
2. Confirmar contrato y número de cupos por el administrador general.
3. El docente descarga plantilla CSV con campos mínimos, p. ej. primer nombre, segundo nombre opcional, apellidos y referencia institucional; solicitar datos adicionales **solo si son necesarios**.
4. Carga CSV; backend valida extensión, tipo, tamaño, cabeceras, columnas, duplicados internos y externos, pertenencia a institución y cupos restantes. Mostrar **vista previa y errores por fila** antes de confirmar.
5. Tras confirmación, crear cuentas/vinculaciones/asignaciones mediante operación transaccional o estrategia idempotente por lote, con resultados claros de importados, omitidos y rechazados.
6. Generar **identificador de inicio de sesión** único por ámbito, por ejemplo `ALFREDO-0001`; no presentarlo como email real ni usar dominios ajenos. Si se usa identificador con `@`, debe documentarse expresamente que es un alias de inicio de sesión, **no una dirección de entrega de correo**.
7. Entregar credenciales iniciales **una única vez** por canal controlado; forzar cambio en primer inicio. Guardar solo hash bcrypt, nunca contraseña en texto plano recuperable.

Una importación no debe permitir sobrepasar cupos ni cambiar datos de estudiantes de otras instituciones. Se deben proteger CSV de exposición innecesaria y destruir archivos temporales cuando proceda.

## 6. Recuperación y baja de cuentas institucionales (ver decisión posterior vinculante en sección 12)

**Recuperación:** el profesor autorizado puede iniciar un **restablecimiento de acceso** de estudiantes de su institución, después de controles de identidad, autorización y registro de auditoría. Se genera credencial temporal/flujo de recuperación con expiración y un solo uso; el docente **no puede ver la contraseña actual** ni recuperar hashes. Los estudiantes pueden cambiar su clave cuando el acceso esté habilitado.

**Baja/desvinculación:** se entiende la intención del usuario de que el docente pueda “eliminar” estudiantes que creó. Para implementarlo de manera segura, distinguir:
- **Desactivar o desvincular** al estudiante de la institución: acción ordinaria autorizada, reversible según las reglas, preservando auditoría y las obligaciones de datos.
- **Solicitar eliminación definitiva de datos personales:** flujo separado sujeto a verificación de identidad, calidad de titular/responsable, retención legal/contractual, vínculos con resultados y política de supresión; no borrado físico inmediato e indiscriminado por el mero hecho de haber importado la cuenta.

La interfaz puede ofrecer `Desvincular estudiante` y `Solicitar eliminación definitiva` con explicaciones distintas, confirmación explícita, trazabilidad y controles que impidan afectar otra institución. Si la cuenta del estudiante participa en otras relaciones o posee otros derechos, no se debe destruir información ajena.

## 7. Panel del docente, web y móvil

**Web docente (propuesto):** iniciar sesión; ver contrato, vencimiento y cupos; consultar estudiantes vinculados; importar CSV; revisar errores; asignar o reasignar licencias dentro de reglas; restablecer accesos; suspender/desvincular; consultar estadísticas autorizadas; solicitar renovación. Acceso limitado en estado vencido.

**App Flutter:** acceso habitual de estudiante y funcionalidades reducidas del docente para consultas rápidas; no es necesario replicar todas las tablas y la importación masiva en móvil.

**Una misma identidad del docente** puede iniciar sesión en ambos clientes. No crear una segunda cuenta por usar web. Toda modificación de datos y comprobación de permisos se resuelve en el backend.

## 8. Seguridad, privacidad y decisiones pendientes

- Autenticación y autorización en cada endpoint; validación de rol, institución, curso/estudiante y estado del contrato.
- Protección contra duplicados y condiciones de carrera al consumir cupos; transacciones para asignación y renovación.
- Auditoría de altas, CSV, restablecimientos, desvinculaciones, eliminación y cambios contractuales.
- Minimización de datos y mecanismos de ejercicio de derechos de titulares/acudientes. Definir responsable/encargado del tratamiento, consentimiento y plazos de conservación conforme a la regulación aplicable.
- Definir si un docente puede editar datos académicos/personales o solo gestionar cuentas y vinculación. **La conversación actual autoriza conceptualmente la gestión de sus cuentas y su baja; no autoriza acceso ilimitado ni modificación global de datos.**
- Definir política de transferencia de cupos, reducción de cupos al renovar, retención tras terminación y destino de cuentas creadas por el colegio que luego cambian de institución.
- Validar compatibilidad con modelo de instituciones actual, códigos existentes, altas pendientes, roles y políticas de expiración según calendario ICFES antes de diseñar migraciones.

## 9. Requisitos funcionales propuestos (para backlog)

- **LIC-01:** ADMIN_GENERAL configura/activa contrato y cupos de institución.
- **LIC-02:** sistema calcula cupos disponibles/asignados y bloquea excesos, incluso bajo concurrencia.
- **LIC-03:** docente autorizado importa CSV con vista previa, validaciones, detección de duplicados y reporte.
- **LIC-04:** sistema genera usuarios institucionales únicos y credenciales temporales no recuperables.
- **LIC-05:** estudiante institucional solamente usa contenido licenciado cuando asignación y contrato están vigentes.
- **LIC-06:** al vencer, se suspende acceso educativo; se conserva identidad, vínculo e historial sujeto a retención.
- **LIC-07:** docente conserva acceso de gestión limitada aunque venza contrato.
- **LIC-08:** al renovar, se recupera acceso para los cupos seleccionados sin recrear cuentas.
- **LIC-09:** docente puede desactivar/desvincular estudiantes **dentro de su institución y facultades**.
- **LIC-10:** eliminación definitiva se tramita separadamente conforme a controles legales y de seguridad.
- **LIC-11:** docente puede restablecer credenciales, sin ver contraseñas actuales.
- **LIC-12:** panel web y app móvil consumen la misma API/identidad, con autorizaciones del backend.
- **LIC-13:** registrar auditoría y aplicar idempotencia/atomicidad en operaciones sensibles.

## 10. Criterios de aceptación de ejemplo

1. Contrato de 30 cupos: la importación de 31 cuentas con licencia se rechaza o limita explícitamente, sin activaciones excedentes.
2. Dos cargas del mismo CSV no crean cuentas/licencias duplicadas.
3. Contrato vencido: los estudiantes reciben acceso suspendido aun con JWT válido; el docente entra al panel de renovación/gestión autorizada.
4. Renovación de 20 de 30: exactamente 20 recuperan acceso y 10 continúan suspendidos.
5. Restablecimiento de una clave: docente nunca ve la contraseña original ni el hash.
6. Docente de institución A no puede ver, desvincular ni eliminar estudiantes de B.
7. Desvinculación de un alumno no borra automáticamente información de otra institución ni historiales sujetos a retención.
8. El sistema audita altas, renovaciones, cambios de cupos, restablecimientos y bajas.

## 11. Alcance de implementación

No implementa pasarela de pago, panel web, código Flutter, SQL, Prisma ni migraciones. **Los códigos de beca y la publicidad se documentan como propuestas adicionales en la sección 13; no están implementados.**

**Siguiente paso técnico recomendado:** auditar modelos y endpoints actuales de instituciones, altas, membresías, cuentas, permisos y planes; decidir las políticas pendientes; redactar SRS y diseño de base de datos; realizar implementación en rama con pruebas de concurrencia, permisos, vencimiento, CSV y recuperación; aprobar por PR antes de cualquier despliegue.


---

## 12. Decisión posterior del propietario — eliminación COMPLETA de cuentas institucionales (29 de octubre de 2026)

> **Esta sección actualiza y prevalece sobre la interpretación de la sección 6 que limitaba la acción ordinaria del docente a «desvincular».** La decisión de producto del propietario de SaberPlus es que el docente/responsable institucional autorizado **sí pueda solicitar y ejecutar la eliminación definitiva de las cuentas institucionales creadas por él o bajo su autoridad**, desde su propio panel, y no solo retirar al estudiante de una clase o institución.

### 12.1. Lo que se solicita expresamente

- El docente puede listar las cuentas institucionales que creó mediante el CSV o creación individual y que siguen adscritas a su ámbito de administración.
- Desde el panel web docente existirá una acción clara **«Eliminar cuenta institucional definitivamente»**, distinta de «Suspender», «Retirar de clase» y «Desvincular institución».
- Cuando se ejecuta una eliminación definitiva válida, esa identidad institucional deja de poder iniciar sesión; su credencial, sesiones, asignaciones y acceso se invalidan. No se podrá recuperar la cuenta mediante la renovación posterior.
- La eliminación no requiere que el docente pida al administrador general ejecutar manualmente cada baja: la facultad se concede al rol institucional autorizado para las **cuentas institucionales de su propia institución, creadas bajo ese mandato**, dentro de las reglas del producto.
- El docente **no** podrá eliminar cuentas de otra institución, cuentas personales independientes, cuentas de otros administradores ni identidades que también tengan derechos o vínculos válidos fuera del ámbito institucional.
- No atribuir al docente propiedad legal de datos personales por haber registrado al estudiante: este es un **permiso operativo de administración** otorgado por el sistema y sujeto a los derechos de estudiantes, familias y obligaciones del responsable del tratamiento.

### 12.2. Condiciones necesarias para hacer segura esa facultad

El botón de eliminación definitiva debe comprobar en NestJS: identidad con sesión autenticada, rol vigente, pertenencia a institución, autoridad sobre la cuenta, tipo `INSTITUCIONAL_GESTIONADA`, ausencia de vínculos o titularidades ajenas y que la eliminación sea legalmente procedente. La UI no es el control de seguridad. Se pide confirmación explícita, preferiblemente reautenticación del docente, y se registra un evento de auditoría sin conservar credenciales o datos sensibles innecesarios.

Si un registro está sujeto a plazos de conservación, una disputa, una obligación de trazabilidad o una solicitud de titular/acudiente pendiente, el proceso no debe fingir borrado definitivo: **bloquear acceso y poner la supresión en estado pendiente**, explicar la razón y completar la supresión cuando resulte procedente. Cuando sí procede, eliminar o anonimizar los datos personales asociados en los sistemas pertinentes y gestionar respaldos según política de retención. Evitar borrados en cascada que destruyan resultados compartidos, registros financieros, evidencias de seguridad o relaciones de otras personas.

**Regla de UX:** antes de confirmar mostrar «Esta acción elimina definitivamente la cuenta institucional y su acceso. No es lo mismo que suspenderla ni desvincularla». Indicar el impacto sobre resultados personales y posibilidad o no de recuperación; confirmar con nombre/identificador del estudiante. Si no procede, mostrar estado y siguiente paso real, no «eliminada».

### 12.3. Diferencia con vencimiento y renovación

- **Vencimiento del plan:** suspensión de acceso, **sin eliminación automática**. Todas las cuentas institucionales siguen vinculadas y son candidatas a renovación.
- **Renovación:** reactiva únicamente las cuentas aún existentes y con licencia reasignada. No recupera cuentas previamente eliminadas definitivamente.
- **Eliminación voluntaria del docente:** operación individual y explícita, irreversible cuando concluye la supresión efectiva; puede liberar el cupo solo de acuerdo con la política comercial de reasignación (no automáticamente en cualquier momento).
- **Nuevo grupo:** el docente puede importar otras 30 cuentas después de que un contrato y los cupos correspondientes estén aprobados. No se requiere borrar cuentas anteriores para renovar y **no debe promocionarse el borrado como mecanismo para evitar pagar cupos**.

### 12.4. Ejemplos de aceptación

1. La Institución A tiene 30 alumnos creados por un docente autorizado. Al vencer el plan, quedan con acceso suspendido pero visibles en la gestión del docente.
2. El docente selecciona una cuenta exclusivamente institucional de su ámbito y confirma «Eliminar cuenta institucional definitivamente»: se revocan sesiones, se registra auditoría y se completa la supresión cuando sea procedente; la cuenta no retorna al renovar.
3. Si el docente solo selecciona «Desvincular», la identidad **no** se destruye; son operaciones distintas.
4. La Institución B, otro docente sin facultad y un estudiante común no pueden invocar el endpoint de eliminación de esa cuenta.
5. Si la persona tiene una cuenta personal aparte, vínculos multiinstitucionales o datos sujetos a conservación, no se elimina indiscriminadamente toda su identidad o información ajena; el sistema informa la limitación y ejecuta únicamente la operación autorizada.
6. Si un docente elimina 10 de 30 y luego renueva solo 20 licencias, las cuentas eliminadas no se reactivan ni ocupan cupo. La renovación debe definir qué 20 identidades existentes reciben licencia.

## 13. Otras ideas comerciales planteadas por el propietario — detalle funcional (PROPUESTAS)

### 13.1. Contratos, docentes y panel web

- Ofrecer planes por mes, por temporada del calendario ICFES y por 1, 1,5, 2, 2,5, 3 o 4 años, con precios y reglas de renovación a definir. Un colegio puede contratar, por ejemplo, 30 plazas; no debe excederlas al activar accesos.
- La creación de la institución por docente/responsable pasa por el flujo de aprobación institucional que defina el administrador general; **crear una institución no equivale a tener automáticamente un contrato pagado activo**.
- La institución tiene un responsable verificable. No asumir que un docente cualquiera puede actuar como representante legal o comprador.
- Permitir a la misma identidad docente acceder desde Flutter y desde un **panel web docente** con información detallada: alumnos, cupos, estado del contrato, CSV, estadísticas y solicitudes de renovación. Mantener separado el rol ADMIN_GENERAL. El vencimiento suspende acceso educativo de alumnos, pero el docente puede entrar al panel de gestión limitado.
- Las renovaciones comerciales son autorizadas por el administrador general o un proceso de pago validado; el docente no cambia por sí mismo la fecha de vencimiento.

### 13.2. Cuentas generadas desde CSV

- El docente descarga plantilla CSV, registra al menos los nombres y apellidos necesarios para diferenciar homónimos, sube, revisa previsualización, errores, duplicados y confirma antes de crear.
- El backend crea identidades institucionales únicas y contraseñas **aleatorias temporales**; no derivar contraseñas predecibles de nombres o apellidos.
- El identificador institucional puede tener apariencia similar a un correo, pero **no afirmar que es un buzón real ni un dominio educativo registrado**. Alternativa recomendada: código `ALFREDO-0001` y campo de acceso «Usuario institucional o correo».
- El docente descarga las credenciales **una sola vez** en sesión autorizada; no se almacenan claves legibles para visualización posterior. Restablecimiento con nueva clave temporal y cambio obligatorio en el primer inicio.
- El archivo CSV se valida, se limita el tamaño y se protege; se evita crear usuarios duplicados; la asignación de licencias exige cupos disponibles y transacciones.

### 13.3. Código de beca de un solo uso, creado por ADMIN_GENERAL

- ADMIN_GENERAL crea desde su panel un código criptográficamente aleatorio, vigencia para canje, duración del beneficio (p. ej., 30 días), modalidad de acceso `BECA_CON_ANUNCIOS`, límite de **1 canje** y opcionalmente destinatario predefinido.
- Puede entregarlo manualmente a una persona que solicita acceso por situación económica; la evaluación/confirmación de esa situación se hace de forma respetuosa, mínima y sin exposición innecesaria de datos sensibles.
- El estudiante usa **su propia cuenta** y abre «¿Tienes un código de acceso?». Al canjear, el backend valida estado, vigencia y límite; una operación **atómica** vincula el código a **un solo usuario**, lo marca consumido y activa la beca durante el período concedido. Nadie más puede reutilizarlo. El canje duplicado en la misma cuenta no extiende el período.
- ADMIN_GENERAL puede consultar códigos creados, redimidos, anulados y vencidos, con trazabilidad; no debe revelar innecesariamente códigos completos ya utilizados.
- Expirado el beneficio, aplicar la política del plan personal gratuito o suspensión que se adopte; **esta beca es independiente de las cuentas institucionales** y no modifica su regla de no conversión automática al plan gratuito.
- Limitar intentos de canje, evitar enumeración de códigos y registrar eventos de seguridad. No conceder acceso por una comprobación hecha solamente en Flutter.

### 13.4. Publicidad en becas

- El propietario propone beca gratuita **con anuncios**. Registrar un atributo de plan/política que permita distinguir plan individual pago, beca y licencia institucional.
- **No adoptar «muchísimos anuncios» como requisito cerrado**: por tratarse de estudiantes y potencialmente menores, el diseño debe cumplir las normas y políticas de las tiendas/proveedor publicitario; preferir anuncios poco intrusivos, apropiados por edad y fuera de pruebas, preguntas y partidas donde perjudiquen el aprendizaje.
- Medir ingresos y retención; no prometer que la publicidad financia el costo del acceso sin datos de monetización.
- Los anuncios no se deben activar únicamente por mostrar un widget; los derechos de acceso se verifican en backend y el cliente aplica la experiencia publicitaria según el plan.

### 13.5. Flujos cruzados y casos límite

- Un alumno con cuenta institucional vencida **no obtiene automáticamente** acceso gratuito personal ni por beca, salvo una migración/vinculación expresamente autorizada que preserve derechos y contratos.
- Si se intenta importar un estudiante ya existente en otra institución, pedir revisión, no fusionar ni borrar cuentas automáticamente.
- Si un docente solicita eliminar una cuenta que tiene un proceso de supresión pendiente, mostrar el estado exacto y bloquear toda operación que lo contradiga.
- Registrar fecha de compra, comienzo real del período, vencimiento, pagos/renovaciones, asignaciones y quién realizó cada cambio; contemplar zona horaria y uso de fechas de corte.

## 14. Requisitos ampliados para revisión técnica

- **LIC-14:** docente autorizado puede **eliminar completamente** cuentas institucionales de su ámbito cuando sea legal y técnicamente procedente; operación distinta de desvincular/suspender, con confirmación fuerte y auditoría.
- **LIC-15:** si la supresión efectiva debe esperar por retención o vínculos ajenos, revocar acceso y registrar petición de supresión pendiente; no declarar eliminación completada.
- **LIC-16:** revocar sesiones y credenciales de cuentas eliminadas; impedir reactivación tras renovación.
- **LIC-17:** panel web y móvil comparten identidad docente y el mismo backend NestJS; exposición de estadísticas solo a miembros autorizados.
- **LIC-18:** ADMIN_GENERAL emite becas de código aleatorio con 1 uso y vencimiento; canje transaccional e idempotente, vinculado a una cuenta.
- **LIC-19:** beca con anuncios respetuosos y controles de edad/cumplimiento, sin interrupciones invasivas.
- **LIC-20:** las renovaciones parciales y las importaciones masivas respetan cupos, duplicados y aislamiento entre instituciones.

**Advertencia de implementación:** este documento refleja requisitos de producto y límites de seguridad; aún requiere diseño detallado, revisión jurídica para cuentas de menores, evaluación de borrado físico/anonimización y aprobación del equipo antes de cambiar esquema Prisma, endpoints o interfaz.
