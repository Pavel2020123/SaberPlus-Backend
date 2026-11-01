# C5-P3-A — borrador de contrato para caché privada de imágenes

1/nov/2026. Continuación de PDF P2, **propuesta técnica aún no implementada**. El propietario aprobó separar PDF exportable de contenido privado offline y revalidar este último al reconectar. No se inventa aprobación de plazos, endpoints ni permisos nuevos.

## Frontera

Primer incremento propuesto: únicamente imágenes gestionadas de lecciones publicadas junto con una copia exacta del contexto que las explica. No preguntas de diagnóstico/práctica, soluciones anticipadas, casos, juegos ni contenido histórico archivado. No usar una imagen nueva para reconstruir una versión pasada. El PDF exportado sigue fuera de la revocación remota.

Hoy `EditorialResourceController` exige JWT/correo/cuenta/runtime y devuelve `private, no-store`; `RemoteEditorialImageRepository` no guarda disco y verifica revisión de sesión. **No convertir ese GET en una caché persistente silenciosa**. La capacidad futura necesita concesión explícita del servidor y permanece apagada hasta completar permisos/pruebas.

## Manifiesto propuesto

Solicitud por contexto de lección, no por URL libre ni usuario enviado por el cliente. Sujeto derivado del JWT. El servidor devuelve solo recursos cuya publicación/archivo/revocación y asociación exacta al contexto haya comprobado.

Campos a concretar en P3-B: identidad opaca de la concesión; propietario; contexto y huella de la copia exacta; id canónico y SHA-256 de cada imagen; MIME/dimensiones/bytes; `issuedAt`, `expiresAt` y versión de contrato. No incluir credenciales, URLs firmadas persistentes, motivo ADMIN, otras opciones o metadatos de recursos denegados. No tratar `fechaActualizacion` como historial inmutable de lecciones mutables.

No prometer descarga de la lección completa guardando solo una imagen: texto y versión/contexto deben coincidir. Antes de añadir esquema, revisar las estructuras existentes de catálogo y permisos y diseñar una migración aditiva si realmente se necesita.

## Estado del cliente

| Evento | Comportamiento requerido |
| --- | --- |
| Descarga autorizada | Validar límites/hash y propietario/generación de sesión; escritura temporal y publicación atómica del paquete completo. |
| Sin conexión | Solo copia íntegra de la misma cuenta y concesión aún válida. Mostrar versión y última validación; no ofrecer como vigente una copia no comprobada. |
| Reconexión | Marcar pendiente de validación, revalidar concesión/contexto/archivo antes de volver a mostrarlo como autorizado. No reutilizar un permiso cacheado tras un 403/404/410. |
| Denegación o caducidad | Retirar píxeles y acceso al paquete; limpieza reintentable. No degradar una denegación a fallback offline. |
| Fallo transitorio | Distinguir red/503 de denegación. No renovar la concesión localmente ni extender su fecha por reintentos. |
| Logout/cambio de cuenta/demo | Cancelar escrituras tardías e invalidar memoria y acceso al almacenamiento privado. Nunca mezclar cuentas; PDF exportados se rigen por su contrato separado. |
| Reinicio/reloj alterado | No confiar en identidad desconocida, rollback de reloj ni manifiesto alterado. Revisar restauración de sesión sin red antes de prometer arranque offline. |

El `userId` de una carpeta o SQLite no sustituye un permiso. Debe revisarse almacenamiento privado, cifrado/gestión de claves y exclusión de backups/exportación; no afirmar confidencialidad por cambiar el nombre de archivo. Nunca guardar JWT dentro del paquete.

## Decisiones abiertas antes de activar

1. Duración máxima sin conexión y tratamiento al expirar; debe fijarse explícitamente, no deducirse del JWT ni de H3.
2. Cuota local por cuenta y política de eliminación/retención. Límites editoriales existentes: 2 MiB WEBP y dimensiones máximas del recurso; no bastan para una cuota global.
3. Qué experiencia offline se permite al reiniciar sin poder verificar la sesión; hoy el flujo online puede limpiar tokens al fallar la restauración. No ampliar autenticación por accidente dentro del caché de imágenes.

## Matriz mínima antes de habilitar

Dos cuentas; logout y descarga tardía; contexto editado/archivado; imagen reemplazada/revocada; hashes/bytes corruptos; cuota/disco lleno; publicación incompleta; caducidad/reloj; reinicio offline; reconexión con 200/401/403/404/410/503; limpieza interrumpida; visores abiertos; ausencia de soluciones o metadatos de otra cuenta. SQL/HTTP, Flutter y Android se documentan por separado.

Secuencia recomendada: cerrar decisiones P3-A → P3-B contrato servidor/manifiesto → P3-C almacenamiento/lectura Flutter → P3-D ensayo integrado. No se abre Storage remoto ni se activa producción para desarrollar este contrato.
