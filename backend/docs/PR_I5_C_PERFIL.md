# PR-I5-C1A — Presentación pública institucional

**C1C completada localmente,12 de octubre:** build correcto, supervisor iniciado con63
migraciones en PostgreSQL temporal propio (incluida perfil). Guion real
`tool/test_institution_profile_local.cjs` **15/15 aprobado**, incluidos permisos
HTTP, concurrencia un200/un409/auditoría única y rollback real por fallo auditado.
Flutter/API real3/3 y APK instalada; prueba humana 1 confirmada (propietario/editor).
Pruebas humanas 2 y 3 confirmadas: docente solo lectura, guardado y texto actualizado
en directorio como estudiante. UX corregida también confirmada (lectura tras éxito,
editar mediante botón). Prueba 4 confirmada: cierre/reapertura manual conserva texto.
Prueba 5 confirmada: vacío guardado, visible en perfil propietario y retirada
del texto en directorio estudiantil. Prueba 6 confirmada: límite500 y guardado
sin error; SQL confirma500 caracteres/revisión12. Prueba 7 aprobada: error sin red,
borrador conservado y Guardar bloqueado. Sigue 8, reverse43187 restaurado/API200,
consulta y guardado del borrador, confirmada. Sigue 9, borrador con cambio externo
por API y conflicto; usuario confirma aviso, borrador conservado y Guardar
bloqueado. SQL confirma revisión14 sin sobrescribir la presentación externa.
Prueba9 completada: consulta conserva borrador/habilita Guardar; éxito cierra
editor y publica. SQL confirma «borrador ficticio», revisión15. Prueba10 aprobada:
«Seguir editando» conserva borrador y «Salir» descarta; reapertura confirmada y
SQL revisión15 intacta. Diez pruebas humanas completadas. Siguiente C2, logo.
Esta corrección no cambia API/esquema.
No se inició panel nuevo. Supabase/Render no modificados. El estado anterior
«migración no aplicada» inferior es histórico del11 de octubre.
En sesión recién creada: `$env:SABERPLUS_LOCAL_SESSION` = ruta emitida por
supervisor; `node --test tool/test_institution_profile_local.cjs`. Exige fixtures
nuevos; deja propietario/lector/institución para Android y presentación vacía.
La credencial temporal nunca se imprime/commitea. Relevo completo en acta Flutter.

## Antecedentes del 11 de octubre (superados por C1C)

Actualización C1B: editor Flutter implementado con repositorio y protección de
borrador/revisión. Siguiente C1C: pruebas HTTP, PostgreSQL temporal y Android.
Migración aún no aplicada. Esta nota actualiza el pendiente Flutter inferior.

11 de octubre de 2026. Implementado contrato de perfil y lectura pública;
**pendiente editor Flutter C1B y ensayo integrado, no cierre de PR-I5.**

Migración aditiva: `20261011200000_institution_public_profile` añade
`descripcionPublica` nullable (500) y `revisionPerfil` inicialmente 0.
No migra `mensajeBienvenida`: ese contenido no se vuelve público automáticamente.
Migración NO aplicada en este turno, ni local ni remotamente. Aplicar primero
en base de pruebas autorizada antes de ejecutar esta versión de la API.

## Contrato

- GET/PATCH `/instituciones/me/perfil`: JWT + política de correo existente.
- GET devuelve `id`, `nombre`, `descripcion`, `revision`, `puedeEditar`;
  requiere membresía docente en institución APROBADA.
- PATCH requiere propietario actual. Cuerpo obligatorio `{revision: 0,
  descripcion: "Presentación pública"}`; vacío limpia. No admite campos extra,
  nombre, ubicación, HTML ejecutable ni modificación de aprobación.
- Actualización condicional por aprobación/membresía/revisión; aumenta revisión.
  Cambio y `PERFIL_PUBLICO_ACTUALIZADO` se guardan en una transacción.
- Conflicto 409: conservar borrador y consultar versión actual, no reenvío ciego.
- Detalle `/instituciones/directorio/:id` añade `descripcion` nullable mediante
  selección explícita. Nunca devuelve mensaje de bienvenida, códigos o contacto.
- Listado del directorio sin cambio de contrato/paginación.

## Validación

`npm run build` correcto. Jest `institution-profile.spec.ts` y
`institution-directory.spec.ts`: **45 aprobadas**. Pruebas con mocks y validación
DTO real; no demuestran concurrencia/rollback en PostgreSQL ni integración física.

## Plan original C1 (completado localmente)

Continuación vigente: [C2C, ensayo del logo](PR_I5_C2_LOGO.md).
El contrato C2 añade `logoUrl` a perfil/listado/detalle; conserva la revisión compartida.

### Alcance original

C1B: editor propietario Flutter, repositorio y demo explícita; sesión aislada,
borrador conservado ante error, lectura antes de reenviar escritura incierta.
Agregar pruebas HTTP de autenticación, PostgreSQL real desechable (dos revisiones
iguales, fallo auditoría, permisos), después ensayo Android. C2: logo, revisar
permisos heredados de logo/bienvenida y almacenamiento. No se modificaron esos
endpoints antiguos en C1A. Solicitudes estudiantiles siguen después.

Fuente del orden completo: `docs/ETAPAS_PENDIENTES.md` del repositorio Flutter.
