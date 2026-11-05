# C5: respaldo y recuperación privados locales

Alcance: operador técnico SaberPlus, exclusivamente fixtures desechables propios.
No es una interfaz de docentes, propietarios institucionales ni estudiantes.
No habilita producción ni sustituye un plan de recuperación ante desastre.

## Preparación

Compilar el backend (`node node_modules/@nestjs/cli/bin/nest.js build`).
Usar el ejecutor `tool/local_ranking_validation.mjs` con
`SABERPLUS_C5_PRIVATE_FILES_LOCAL=true` en un puerto local libre.
El ejecutor informa el directorio temporal; su `owner.json` contiene secretos:
no copiarlo a documentación, Git, capturas ni mensajes.
El entorno incluye las migraciones privadas únicamente en su PostgreSQL propio.

## Comandos

Desde `backend`, reemplazar los marcadores por valores del fixture actual:

```powershell
node tool/private_file_operations.mjs backup '<directorio-temporal>\owner.json' '<uuid-admin>' '<uuid-archivo>'
node tool/private_file_operations.mjs restore '<directorio-temporal>\owner.json' '<uuid-admin>' '<uuid-archivo>'
```

Solo se aceptan cuatro argumentos exactos. No se aceptan rutas de respaldo,
URLs, claves, bucket remoto ni una base externa. Se validan el marcador temporal,
el Docker local y la etiqueta de propiedad del contenedor antes de conectar.
Las variables de proveedores remotos heredadas se descartan.
El actor debe ser ADMIN global verificado, no suprimido y sin clave temporal.
Los resultados contienen únicamente identidad técnica, tamaño y confirmación;
nunca bytes de fotos/PDF, contraseña ni clave de cifrado.

Los originales del fixture API están en `.tmp/private-files`; la bóveda está
en `.tmp/private-backup-vault`, ambos dentro del directorio propio del ejecutor.
El fixture de pruebas PostgreSQL utiliza sus rutas internas separadas.
El respaldo AES-256-GCM mantiene clave y sobre separados, identidad de bóveda y
recibo durable en PostgreSQL. No copiar únicamente los sobres como supuesto
respaldo recuperable. Los permisos de archivo no acreditan ACL de Windows.

## Límites e invariantes

- Solo archivos vigentes y actualmente vinculados. Se comprueba otra vez tras IO.
- Restaurar no modifica revisiones, propietarios, resolución ni vencimiento.
- Un original distinto existente no se sobrescribe; investigar antes de intervenir.
- Retirada, supresión y vencimiento no pueden deshacerse restaurando una copia.
- El trabajador elimina clave/sobre de respaldos retirados y registra su
  confirmación física; fallos conservan la obligación pendiente para reintentar.
- Una bóveda distinta no puede confirmar el borrado o restaurar ese registro.
- La limpieza vuelve a reconciliar los IDs respaldados que ya estén retirados,
  incluso si existe una primera confirmación de borrado. Una escritura tardía
  tras timeout y fallo compensatorio no queda excluida para siempre por ese
  recibo. No se enumeran ni eliminan objetos desconocidos:se usan IDs retirados
  registrados, tandas20 con cursor circular cada60s. Puede repetir DELETE de un
  objeto ya ausente; no constituye una garantía de borrado instantáneo bajo
  fallo de disco/red o acumulación de pendientes.
- Los PDF exportados por usuarios quedan fuera de esta recuperación y revocación.

La pérdida simultánea de originales, bóveda, claves y base no está cubierta.
No se ha contratado almacenamiento externo ni aplicado migraciones remotas.
Antes de habilitar producción hacen falta decisiones y validación de custodia de
claves, almacenamiento, persistencia, recuperación y operación real.
