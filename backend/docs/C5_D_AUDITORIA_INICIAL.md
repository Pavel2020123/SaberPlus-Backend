# C5-D — auditoría inicial de integración y operación

1/nov/2026. Rama `feat/c5-d-storage-operations` desde `4de83aa`. Auditoría local; no proveedor nuevo activado, sin acceso a secretos o cuentas remotas. C5-P3 permanece cerrado en su alcance local anterior.

## Contratos que deben conservarse

| Invariante | Evidencia de código existente | Comprobación para el nuevo proveedor |
| --- | --- | --- |
| Consumidores no reciben ubicaciones o credenciales de almacenamiento. | `EditorialFileStore` abstrae put/read/remove; `EditorialFileService.metadata` devuelve rutas de API. | Mantener rutas y DTO; ninguna URL pública o credencial en panel/app/PDF/manifiesto. |
| La misma operación no sobrescribe otro contenido ni crea otro recurso. | Reserva/huella y estados PREPARADO/DISPONIBLE del servicio; publicación local mediante enlace sin reemplazo. | Reintentos simultáneos idénticos, distintos y respuesta perdida en el proveedor. |
| Un recurso corrupto no se entrega. | `content` verifica bytes/SHA-256 y vuelve a comprobar estado tras IO. | Objetos ausentes, truncados, alterados y fallos de red; límites al leer antes de reservar memoria sin límite. |
| Revocar no equivale a borrar físicamente. | `revoke` conserva recurso; `retire` rechaza revocados para conservar auditoría. | Inventario/limpieza nunca deben tratar un recurso revocado como huérfano eliminable. |
| Retirada primero deniega, después limpia bytes. | `retire` cambia estado en transacción antes de `store.remove`; DELETE repetido completa la limpieza. | Borrado fallido/reintentado, eliminación física ausente y operación tardía. |
| No eliminar recursos todavía referenciados. | Retirada cuenta usos en preguntas/casos/subtemas/opciones/historial y snapshots de juegos. | Limpieza y restauración no pueden saltarse esas barreras ni reescribir historia. |
| No hay transacción atómica PostgreSQL/almacén. | Reserva, IO y confirmación del servicio son pasos separados. | Diagnóstico de estados intermedios, recuperación idempotente y respaldo coherente de metadatos/objetos; no prometer atomicidad distribuida. |
| PDF exportado y caché privada son distintos. | P2 y P3 implementados; manifiesto privado y tiempo monotónico72h en Android. | Nueva copia/P3 deben denegar revocación; PDF ya exportado permanece independiente. |

## Decisión confirmada

El propietario confirmó **Supabase Storage privado** el1/nov/2026 después de esta auditoría. Se autoriza implementar y ensayar localmente el adaptador, no crear/configurar buckets remotos ni usar credenciales reales. La base auditada solo contiene `LocalEditorialFileStore` con raíz `.tmp/editorial-files`; la nueva implementación debe registrarse con sus pruebas posteriores.

Desarrollo/pruebas locales y preparación de entrega sí están autorizados. Crear/configurar buckets remotos, usar credenciales reales, contratar, desplegar, migrar remotamente o publicar requieren nueva autorización. No se sustituyó esa decisión con otra arquitectura ni se cambió el runtime productivo.

## Evidencia de base

`npx jest src/editorial-files --runInBand`: **13 suites/192 pruebas aprobadas**, ninguna omitida,60s. Cubre adaptador local, servicio/HTTP simulado, integridad, asociación, historial, snapshots y política/manifiesto privado. `npx nest build` posterior aprobado con salida0. No se presenta como prueba de Supabase ni de persistencia remota; no se ejecutaron migraciones.
