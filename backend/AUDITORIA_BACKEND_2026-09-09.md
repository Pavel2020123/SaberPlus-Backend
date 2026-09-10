# Auditoría del backend de SaberPlus

Fecha: 9 de septiembre de 2026. Estado: correcciones locales verificadas; no es una certificación de seguridad ni un despliegue.

## Alcance y límites

Se revisaron autenticación, autorización, validación de entradas, acceso académico gratuito, contratos editoriales, persistencia y dependencias del backend NestJS/Prisma. La revisión combina lectura dirigida de código y pruebas automatizadas; no acredita haber inspeccionado manualmente cada línea ni equivale a una prueba de penetración externa.

Repositorio: `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend`. Comandos del backend desde su subcarpeta `backend`.

No se desplegó en Render, no se modificó Supabase, no se ejecutaron migraciones contra una base real y no se publicaron commits. Se preservaron los cambios previos de Guardian en `src/guardian`, `src/app.module.ts`, `prisma/schema.prisma`, su migración y `tool/probe_database.mjs`.

## Problemas corregidos

| Hallazgo | Corrección y evidencia |
| --- | --- |
| El cambio de contraseña inicial podía usarse aunque la cuenta ya no tuviera ese cambio pendiente. | `AuthService` exige la bandera pendiente y consume el cambio con una actualización condicionada por bandera y hash anterior. Dos solicitudes concurrentes no pueden sustituir sucesivamente la contraseña inicial. |
| Verificación de correo y recuperación de contraseña podían aceptar tokens sin vencimiento o reutilizarlos en solicitudes concurrentes. | Se rechaza vencimiento ausente o alcanzado. `updateMany` exige que el token y su vencimiento sigan vigentes al escribir; se valida que cambie exactamente una fila. |
| La conversión implícita de booleanos podía convertir la cadena JSON `"false"` en `true`. | Decorador reutilizable `IsJsonBoolean`: valida el valor original del cuerpo como booleano real. Aplicado a las entradas afectadas de administración, preguntas, anuncios, batallas, cupones, instituciones, soporte y ventas. Hay pruebas con `ValidationPipe`, además de los servicios. |
| El consentimiento de vinculación al grupo dependía de un valor truthy. | `VinculacionGrupoService` exige `acepto === true`, incluso para llamadas internas. |
| Persistía un muro de pago de prueba de tres días contrario al modelo acordado. | `PlanVigenteGuard` conserva la comprobación de cuenta autenticada existente, sin bloquear el estudio por vencimiento. El perfil devuelve `planVencido: false` y verificar correo no inicia una prueba académica. No se otorga Premium ni se eliminan cupos institucionales. |
| Dependencias con avisos de seguridad y versiones transitivas antiguas. | Multer 2.3.0, Nodemailer 9.1.1 y resoluciones de js-yaml 4.3.2 y fast-uri 3.1.7, con archivo de bloqueo actualizado. No se aplicaron degradaciones automáticas incompatibles de NestJS. |
| Tipado inseguro en mocks de pruebas académicas. | Se tipan argumentos de consultas/transacciones y se inspeccionan llamadas registradas sin accesos `any` implícitos. No cambia la lógica productiva. |

Las pruebas nuevas de autenticación están en `src/auth/auth-security.service.spec.ts`; las del acceso gratuito en `src/auth/plan-vigente.guard.spec.ts`; la validación estricta en `src/common/is-json-boolean.spec.ts`. La vinculación incorpora regresiones en su prueba de servicio.

## Verificación

Resultados obtenidos durante esta auditoría antes de su última reanudación:

- Suite completa del backend: **66 suites y 671 pruebas aprobadas**.
- `npm run build`: compilación y generación de Prisma Client exitosas. Generar el cliente no aplica migraciones.
- Integración editorial PostgreSQL: **12 pruebas aprobadas**, sobre un clúster temporal exclusivo del ejecutor; limpieza completada sin tocar bases existentes.
- Pruebas de seguridad del ejecutor PostgreSQL: **11 pruebas aprobadas**.
- `npm audit`: **0 vulnerabilidades informadas** en ese momento. Este resultado depende del catálogo de avisos disponible y no demuestra ausencia de vulnerabilidades en la aplicación.

Comprobaciones finales tras reanudar la auditoría:

- Tres suites de mocks académicos corregidos: **46 pruebas aprobadas**. Son un subconjunto de la suite general, no pruebas adicionales a sumar al total de 671.
- Suite de booleanos y `ValidationPipe`: **20 pruebas aprobadas**; se corrigió además el tipo del prototipo usado por el helper de reflexión de sus pruebas.
- ESLint completo, sin `--fix`: los ocho errores previos de los tres mocks académicos quedaron resueltos. Permanecen **43 errores** exclusivamente en archivos con cambios previos preservados: 4 en `src/app.module.ts`, 6 en `guardian.controller.spec.ts`, 30 en `guardian.service.spec.ts` y 3 en `guardian.service.ts`. Guardian también presenta **11 advertencias**. No se declara que el lint global pase.
- La comprobación inicial de ESLint señaló además una advertencia en la nueva prueba de booleanos; se corrigió y la comprobación aislada `npx eslint src/common/is-json-boolean.spec.ts --max-warnings=0` terminó correctamente, sin errores ni advertencias.
- `git diff --check` de los tres mocks modificados: sin errores de espacios. Git avisa de su conversión configurada LF/CRLF, que no es un fallo de pruebas.

El script general `npm run lint` incluye `--fix` y no se usó sobre cambios ajenos. Los errores de Guardian se documentan para que puedan resolverse sin mezclar su trabajo preexistente con esta auditoría.

## Pendientes importantes antes de producción

1. **Sesión única y revocación del lado servidor.** El JWT dura ocho horas y el guard comprueba la cuenta y su rol actual en la base, pero no valida una sesión persistida revocable por dispositivo. Cerrar sesión localmente o cambiar una contraseña no invalida por sí solo todos los JWT ya emitidos. Falta el contrato de sesión/renovación/revocación y sus pruebas; no se considera resuelto con controles del cliente.
2. **Aislar pagos heredados.** El módulo `/pagos` de ePayco permanece conectado al servidor. No representa la integración de Google Play Billing aprobada para la aplicación móvil. Antes de producción deben delimitarse o retirarse las rutas heredadas, verificar sus permisos/webhooks y completar la validación de compras y derechos en el servidor.
3. **Completar y validar Guardian por separado.** Sus cambios preexistentes y migración no forman parte de este conjunto de correcciones. Deben revisarse, probarse y desplegarse mediante su propia etapa.
4. **D3 sigue pendiente.** La conexión real del panel editorial con Render/Supabase requiere comprobar la URL vigente, una cuenta ADMIN y el flujo de catálogo/autorización. No se afirma que la prueba local compruebe esa integración remota.
5. **Operación de producción.** Rotación de secretos que hayan sido expuestos, políticas de retención, restauración de copias de seguridad, observabilidad, límites de recursos y validación del servicio desplegado requieren una comprobación operativa separada.

## Fuentes de los avisos de dependencias

Los cambios de versiones responden a avisos publicados, no a una garantía genérica de seguridad:

- [Multer: denegación de servicio, corregida en 2.3.0](https://github.com/advisories/GHSA-wc9g-mqfw-jrwm).
- [Nodemailer: elusión de restricciones en resolución de contenido, corregida en 9.1.1](https://github.com/advisories/GHSA-8m3c-c648-2xjj).
- [js-yaml: consumo de CPU, corregido en 4.3.2 para la rama 4](https://github.com/advisories/GHSA-2883-xcg3-v3hh).
- [fast-uri: interpretación de IPv6 que puede contribuir a SSRF](https://github.com/advisories/GHSA-f65p-4m7j-42xc).

## Entrega y organización

Se mantienen los módulos NestJS y los servicios existentes; el validador booleano se centraliza para evitar correcciones divergentes entre controladores. No se reorganizaron masivamente carpetas ni se mezcló esta auditoría con una nueva funcionalidad. El informe general y el inventario de funcionalidades para los compañeros se entregan en `docs` del repositorio Flutter.
