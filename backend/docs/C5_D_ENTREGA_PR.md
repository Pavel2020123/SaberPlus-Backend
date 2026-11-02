# Entrega local C5-D

2/nov/2026. Rama `feat/c5-d-storage-operations`. Propuesta para PR; **no se creó PR remoto, no se hizo push, merge ni despliegue**.

## Título propuesto

`C5-D: almacenamiento editorial privado y recuperación conservadora`

## Cambios propios

- `5c2d58e`: adaptador REST Supabase privado y harness propietario local.
- `fbdbb6d`: recuperación, respaldo, auditoría paginada, limpieza de retirados y pruebas integradas con Storage real local.
- Documentación de operación y evidencia: [runbook](C5_D_OPERACION_LOCAL.md).

Se preserva la abstracción `EditorialFileStore`, sus consumidores, UUID, metadatos, comprobaciones de permisos y revocación. Sin dependencias nuevas, migraciones, endpoints operativos públicos ni cambios Flutter. La app mantiene PDF exportado independiente de caché privada72h.

## Validación

99/99 integradas con PostgreSQL/Storage local y Chromium, 242/242 unitarias editoriales, 7/7 CLI. Build, lint dirigido y sintaxis de scripts aprobados. Cinco escenarios Android sobre el proveedor de ensayo aprobados el 1/nov; el 2/nov se restauró y lanzó el APK normal `SaberPlus Pruebas`. Resultados y límites exactos en el runbook. No se acredita lint global de cambios ajenos ni despliegue remoto.

## Revisión y reversión

Revisar primero configuración fail-closed, almacenamiento inmutable, autorización antes/después de IO y recuperación sin cambios de derechos. `local` sigue predeterminado y operaciones desactivadas. Seleccionar proveedor no crea infraestructura ni habilita runtime productivo.

No revertir una instalación con datos cambiando solamente el selector: primero verificar que el destino conserva todos los objetos y los mismos metadatos. El ensayo de copia local → Supabase mantiene identidad; la migración de una instalación real necesita plan y autorización independiente. Los backups de bytes no sustituyen PostgreSQL.

Hay cambios ajenos sin commit en ambos repositorios: no incorporarlos al PR ni usar `git add .`. Los commits propios están aislados; el worktree completo no está limpio. La rama contiene entregas previas: revisar el diff contra la base real del PR antes de publicarlo, sin asumir que solo incluye estos dos commits.

## Fuera del cierre local

Supabase remoto, producción, RLS real, facturación/capacidad, respaldo ante desastre, inventario de objetos sin registro y limpieza automática necesitan trabajo y aprobación posteriores. El inventario actual es de metadatos PostgreSQL; no borra huérfanos. Fotos de perfil y evidencias institucionales no forman parte de este objetivo editorial. C5 global no se declara terminado.
