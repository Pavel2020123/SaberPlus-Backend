# C5-D: operación y recuperación local

Actualización: 2/nov/2026. Desarrollo local; no habilita producción ni autoriza cambios remotos. Complementa [el adaptador](C5_D_SUPABASE_STORAGE.md) y [la auditoría inicial](C5_D_AUDITORIA_INICIAL.md).

## Límites y activación

El proveedor predeterminado sigue siendo `local`. Seleccionar `EDITORIAL_FILE_PROVIDER=supabase` exige URL, bucket privado y clave privilegiada exclusivamente en backend. No se crean buckets ni se conceden permisos automáticamente. El runtime editorial continúa limitado a desarrollo/pruebas y a su opt-in existente. Las operaciones adicionales requieren `EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED=true`, desactivado por defecto. No hay endpoints HTTP nuevos de recuperación.

La CLI acepta únicamente marcadores de bases temporales creadas por nuestros runners y comprueba sus etiquetas Docker. Para Supabase exige además Storage propio en loopback. No sirve para conectar una base productiva. Nunca copiar claves de servicio a Flutter, panel, Git, PDF o manifiestos.

## Diagnóstico paginado

Desde `backend`, con compilación vigente:

```text
node tool/editorial_file_operations.mjs audit <owner.json> <adminUUID>
node tool/editorial_file_operations.mjs audit <owner.json> <adminUUID> <cursorNext>
```

El auditor recorre los metadatos de PostgreSQL en páginas de 25. Repetir con `next` hasta recibir `null`. Exige un administrador verificado y sin cambio de contraseña pendiente; vuelve a autorizar antes de entregar resultados. Verifica tamaño y SHA-256 de los bytes y distingue íntegro, corrupto, no verificable y cambio durante revisión. Un error del proveedor no prueba que un archivo haya desaparecido.

**No es un listado de todos los objetos del bucket**: objetos sin registro en PostgreSQL no se detectan en este inventario. No se eliminan huérfanos desconocidos, temporales, revocados ni objetos por antigüedad. La paginación no constituye un snapshot bajo escrituras concurrentes.

## Respaldo y restauración conservadora

```text
node tool/editorial_file_operations.mjs backup <owner.json> <adminUUID> <fileUUID>
node tool/editorial_file_operations.mjs restore <owner.json> <adminUUID> <fileUUID>
node tool/editorial_file_operations.mjs cleanup <owner.json> <adminUUID> <fileUUID> --confirm-cleanup
```

El respaldo de bytes se guarda en `editorial-backups/<UUID>.json` dentro del directorio temporal propietario. No sobrescribe respaldos existentes ni permite elegir una ruta arbitraria. Contiene la imagen codificada; tratarlo como contenido privado. Los permisos solicitados al sistema de archivos no sustituyen una revisión de ACL en Windows.

Restaurar exige un registro existente y coincidencia exacta de identidad, tamaño, hash y Base64 canónico. Nunca restaura permisos, recibos, referencias ni estados de la base de datos. Un revocado permanece revocado y un retirado no admite restauración. Un objeto diferente/corrupto existente no se sobrescribe: requiere análisis separado, no borrado automático.

`cleanup` solo reintenta la retirada de un registro ya retirado, sin revocación, pasando por todas las comprobaciones de referencias existentes. No es limpieza masiva ni borra el bucket.

Para ensayar una copia de local a Supabase: respaldar con proveedor `local`, restaurar con configuración Supabase propia y verificar todas las páginas del auditor. Conservar los mismos UUID y metadatos. **No cambiar el proveedor de una instalación hasta verificar todos sus objetos**; no existe fallback automático. Un respaldo completo necesita también PostgreSQL y un procedimiento coordinado de recuperación: el JSON de bytes no es un respaldo de la base.

## Seguridad, cuotas y alcance

WEBP hasta 2 MiB por objeto, lectura limitada y timeout del adaptador. El ensayo usa bucket privado, imagen oficial fijada por digest, claves aleatorias y volúmenes/red/containers propios con etiquetas verificadas para su retirada. La persistencia se prueba reiniciando Storage, no eliminando el volumen. No se han implementado cuotas comerciales, retención programada ni recuperación ante desastre de un proyecto remoto.

Los PDF previamente exportados siguen fuera de la restricción offline. El contenido privado de la app conserva revalidación a las 72 horas y bloqueo tras revocación confirmada; no se reinicia ese plazo al restaurar bytes. Fotos de perfil y evidencias institucionales no se habilitan mediante este módulo.

## Evidencia y pendientes

Verificación del 2/nov:

- `SABERPLUS_C5_REAL_STORAGE_TEST=true node tool/test_editorial_files_postgres.mjs`: 99/99, cero omitidas, 190092ms; `.tmp/c5-d-resume-real-storage.log`. Incluye panel Chromium en 1280/390, lectura estudiante, PDF con imagen, manifiesto privado, revocación, restauración exacta, retirada interrumpida, CLI y copia local → Supabase sin cambiar identidad. Recursos desechables retirados por sus runners.
- `npx jest src/editorial-files --runInBand`: 15 suites, 242/242; `.tmp/c5-d-resume-unit.log`. Incluye la validación Base64 canónica y recuperación conservadora.
- `node --test tool/editorial_file_operations.test.mjs`: 7/7, incluida forma paginada del auditor.
- ESLint dirigido al servicio/módulo y pruebas de recuperación, `node --check` de los tres scripts y `npx nest build`: salida 0.
- APK normal de `SaberPlus Pruebas` reinstalado por USB con `Success` y lanzado; app principal no modificada. API reiniciada con login sintético HTTP201, panel HTTP200 y reverse43187. La base temporal contiene fixtures sintéticos, no los datos de una instalación remota.

Los cinco escenarios Android de caché cifrada, aislamiento y revocación sobre Supabase local se ejecutaron el 1/nov, no se repitieron el 2/nov: evidencia en la app `.tmp/c5-d-android-integration.log`, `All tests passed`. No se modificó Dart ni Android en este incremento; se restauró el ejecutable normal después del de integración. No se afirma haber esperado físicamente 72 horas ni haber validado una manipulación de reloj en este reinicio.

Las pruebas emplean cuentas y contenido sintéticos. No acreditan despliegue, migración remota, permisos de un bucket comercial ni validación psicométrica. Logs y capturas `.tmp` son evidencia local no versionada; los resultados se consolidan aquí para la entrega.

Antes de producción: aprobación explícita, revisión de permisos/RLS y secretos, capacidad y costes, respaldo coordinado, recuperación ensayada, inventario de objetos sin registro, observabilidad y entrega por PR. No ejecutar migraciones, push, merge ni despliegues como parte de este runbook local.
