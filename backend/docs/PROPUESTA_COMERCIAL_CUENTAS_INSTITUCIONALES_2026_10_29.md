# SaberPlus — Propuesta funcional: licencias institucionales, cuentas y renovación

**Fecha:** 29 de octubre de 2026  
**Estado:** PROPUESTA PARA REVISIÓN — NO IMPLEMENTADA NI AUTORIZADA PARA DESPLIEGUE  
**Alcance de este documento:** requisitos y flujos de negocio. No modifica código, esquema Prisma, migraciones, datos ni permisos vigentes.

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

## 6. Recuperación y baja de cuentas institucionales

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

## 11. Exclusiones de este documento

No implementa la pasarela de pago, cálculo de precios, panel web, código Flutter, SQL, Prisma ni migraciones. Las becas/códigos de un solo uso y anuncios corresponden a otra propuesta futura y **no se consideran implementados** por este documento.

**Siguiente paso técnico recomendado:** auditar modelos y endpoints actuales de instituciones, altas, membresías, cuentas, permisos y planes; decidir las políticas pendientes; redactar SRS y diseño de base de datos; realizar implementación en rama con pruebas de concurrencia, permisos, vencimiento, CSV y recuperación; aprobar por PR antes de cualquier despliegue.
