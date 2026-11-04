# LIC-2 — Cuentas institucionales gestionadas

Estado al 3 de noviembre de 2026: alcance LIC-2 implementado y verificado localmente.
Contrato: [LIC-0](LIC_0_CONTRATO_INSTITUCIONAL.md). Se conserva LIC-1. Este documento
sustituye los partes históricos que todavía describían la interfaz como pendiente.

## Contrato implementado

- Usuario completo globalmente único (`ana@colegio.example`), no correo ni buzón.
  La institución solicita el sufijo; ADMIN lo aprueba. No verifica dominio real.
- Correo real separado y nullable. Alias/correo comparten registro derivado mediante
  trigger, evitando colisiones entre campos o por mayúsculas. No fusiona cuentas;
  una colisión histórica detiene la migración para revisión del operador.
- Solo propietario/ADMIN hacen altas. Docente consulta y resetea exclusivamente sus
  alumnos gestionados asignados, con cupo docente activo. Una personal vinculada no
  se transforma en gestionada ni permite reset institucional.
- Alta individual y CSV comparten preview/confirmación. CSV `nombre,usuario`, hasta
  1 MiB y 1000 filas, grupo aparte; sin columnas de contraseñas/correo ni Excel nativo.
- Confirmar revalida contenido, sufijo, grupo y licencia dentro del bloqueo LIC-1.
  Usuario, origen, vínculo, cupo y grupo son atómicos. Preview no reserva cupos.
- Temporal criptográficamente aleatoria, persistida solo como bcrypt. Entrega única:
  replay devuelve recibo sin claves; entrega perdida exige reset nuevo autorizado.
- Se consume al primer login correcto, con compare-and-swap de hash/versión/marcador.
  Dos logins concurrentes no obtienen dos sesiones. Cerrar antes del cambio obligatorio
  requiere otra temporal. Reset limpia recuperación previa y permite una temporal nueva.
- Reset y cambio inicial gestionado incrementan versión; guards HTTP/ADMIN y auth de
  sockets contrastan versión persistida. Cambio inicial entrega JWT nuevo.
- Excepción móvil mínima autorizada: guardar ese JWT antes del perfil, sin pantallas
  LIC-3. Mantiene respuesta personal antigua sin JWT y protege logout durante petición
  o escritura nativa. Una respuesta tardía no debe restaurar una cuenta cerrada.
- Auditoría/recibos: actor, destinatario, instante, operación y resultado seguro; sin
  contraseñas, JWT ni CSV crudo. Gestión responde `Cache-Control: no-store`.
- Hasta 20 resets exitosos/actor y 5/alumno en 15 minutos. Hashing acotado por proceso
  e institución; no se afirma rate limiting distribuido. Login conserva sus defensas.
- Reportes sin correo verificado solo para gestionadas con alias, origen explícito,
  cambio inicial terminado, cupo y licencia activos comprobados por backend. Nunca
  falsificar `correoVerificado`; FK institucional sola no basta. Offline conserva
  origen explícito, vigencia y máximo de 72 horas, sin afectar PDF exportado.

## Panel existente: `/cuentas`

Módulos ES/estilos existentes, sin framework ni portal LIC-3. Token solo en memoria.
Acceso editorial sigue limitado a ADMIN; esta utilidad admite propietario/docente.

1. Entrar. Propietario/docente usan su institución; ADMIN indica institución autorizada.
2. Solicitar sufijo. Solo ADMIN aprueba; no se cambia aprobación silenciosamente.
3. Elegir grupo, alta individual o CSV y previsualizar.
4. Confirmar contenido revisado. Editarlo invalida confirmación.
5. Entregar claves por canal autorizado y ocultarlas. Logout/página vacían DOM y
   referencias; recargar no recupera credenciales.
6. Listado paginado permite reset por ámbito, nunca suplantación del estudiante.

No hay reintento automático de comandos con secretos. Reintento explícito conserva
UUID; si ya se ejecutó devuelve recibo sin claves. No se pueden impedir capturas o
copias manuales del destinatario autorizado.

## Modelo y rutas

Migraciones LIC-2 aditivas, únicamente ejecutadas en bases locales propias:
`20261102220000_managed_account_identity`, `20261102223000_institution_alias_suffix`,
`20261102230000_managed_temporary_single_login`.

Prefijo `/instituciones/:institucionId/cuentas-gestionadas`: `contexto`, `grupos`,
`alumnos`, `sufijo`, `sufijo/solicitar`, `sufijo/aprobar`, `previsualizar`, `confirmar`,
`restablecer`. Todas autenticadas y con autorización de ámbito. Consulta histórica
no habilita altas con licencia vencida/suspendida. No reemplaza importador personal.

## Evidencia y reproducción

No sumar baterías solapadas. `.tmp` es evidencia local no publicada, no sustituto
de repetir comandos. Fuentes de prueba por requisito:

| Requisito | Prueba |
| --- | --- |
| Identidad, CSV, versión, temporal única | Specs de políticas, `managed-temporary-login.spec.ts`, `session-version.guard.spec.ts` |
| Sufijo, origen, hash, replay, ámbitos y docente retirado | `tool/lic2_service_assertions.mjs`, PostgreSQL real |
| Último cupo concurrente, colisión correo/alias, límites reset | Mismo ensayo, inspección de filas/versiones |
| Login temporal concurrente único, cambio/reset revoca JWT | `tool/lic1_http_assertions.mjs`, AppModule/HTTP/SQL reales |
| Reportes sin correo y offline acotado | HTTP real y specs de question-report/private-offline |
| Permisos visuales, alta/reset y limpieza de secretos | `tool/lic2_browser_assertions.mjs`, Edge + HTTP + PostgreSQL |
| Texto sin XSS, respuesta tardía, UUID estable, preview invalidada | `admin/test/managed-accounts*.test.mjs` |
| JWT nuevo antes de perfil y logout durante renovación | Flutter `remote_auth_repository_test.dart`, `session_controller_test.dart` |

Antes de la repetición final: `.tmp/lic2-single-use-all-tests.log`, 152 suites/2063
pruebas backend aprobadas; `.tmp/lic2-single-use-postgres-browser.log`, 83 migraciones
(78 comprometidas + 5 locales LIC-1/2), servicios/saldo, inventario 314 rutas (18
públicas), HTTP y Edge 1280/390 px aprobados, limpieza de recursos propios al final.
Panel completo: 152 pruebas y comprobación de 31 módulos aprobadas. No prueba Android
ni CORS/despliegue real. El worker permite CORS loopback solo bajo opt-in de ensayo
y verificación de propiedad de base; no cambia CORS de producción.

Desde backend:

```powershell
npx jest --runInBand
node tool/lic1_postgres_local.mjs
node tool/test_question_reports_postgres.mjs
node tool/test_editorial_files_postgres.mjs
```

Runner LIC-1 incluye LIC-2/navegador; crea base tmpfs con propietario verificable y
la retira. No acepta base remota ni `.env`. Desde admin: `npm run check`, `npm test`.
Flutter: `flutter test test/remote_auth_repository_test.dart test/session_controller_test.dart`:
21 aprobadas el 3/nov; análisis de cinco archivos sin incidencias. Recarga intentada
con DTD, sin app activa; no se declara validación física.

## Límites y cierre

Sin despliegue/migraciones remotas, dominio/buzón, billing, traslado de progreso,
LIC-3/4, borrado real, push/merge. Sin commit en `feat/lic2-managed-accounts` y
`feat/lic2-auth-session-contract`; se preservan cambios ajenos. Release posterior
requiere revisar colisiones históricas, CORS/HTTPS, migración y recuperación operativa.
Pruebas locales no equivalen a habilitación productiva.

Regresiones repetidas el 3/nov con 83 migraciones: `.tmp/lic2-final-reports-postgres.log`
(45 aprobadas); `.tmp/lic2-final-files-postgres.log` (101 aprobadas, 1 omitida, cero
fallos; almacenamiento local, no Supabase real); `.tmp/lic2-final-panel.log` (152
aprobadas); `npm run check` (31 módulos). `.tmp/lic2-final-focused-lint.log` vacío y
salida 0: lint focalizado correcto; no afirmar que el lint global histórico esté
limpio. `.tmp/lic2-final-temporary-unit.log`: 6 pruebas aprobadas tras ajuste tipado.

Cierre local: `.tmp/lic2-final-preview-audit.log`, salida 0, confirma nuevamente
servicios LIC-1/2, saldo, inventario, HTTP y navegador; incluye importación sin
preview, CSV cambiado y alta por docente rechazados sin crear origen/cupo estudiantil.
Cada runner retiró únicamente sus recursos propios. Los servicios de demostración
se mantienen aparte. No quedan pendientes dentro de este alcance local; las
condiciones de release anteriores y la validación Android siguen fuera de esta entrega.
