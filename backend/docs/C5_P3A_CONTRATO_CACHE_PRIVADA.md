# C5-P3-A — borrador de contrato para caché privada de imágenes

1/nov/2026. Continuación de PDF P2, **propuesta técnica aún no implementada**. El propietario aprobó separar PDF exportable de contenido privado offline y revalidar este último al reconectar. No se inventa aprobación de plazos, endpoints ni permisos nuevos.

## Política confirmada posteriormente por el propietario

**72 horas desde la última validación exitosa de permisos con el backend**. Al vencer, revalidación obligatoria antes de consultar contenido privado. Una revocación/suspensión confirmada bloquea inmediatamente, incluso si quedaba plazo. Los PDF exportados quedan fuera. Proteger el contenido local e impedir que el ajuste manual de fecha/hora prolongue la concesión.

No equivale a renovar con un login, ping, HTTP200 genérico, cache hit o fallo de red. El manifiesto debe estar ligado al propietario/contexto y a un nonce aleatorio nuevo de la solicitud, para que una respuesta vieja no renueve el plazo. Respuestas tardías anteriores a logout, suspensión, revocación o cambio de cuenta no pueden restaurar permisos.

La base cliente usa ancla monotónica al inicio de la validación (conservadora ante latencia), no `DateTime.now()`. El adaptador Android deberá usar `SystemClock.elapsedRealtime`, que incluye suspensión del dispositivo; no `uptimeMillis` ni un Stopwatch del proceso. Si se pierde continuidad del arranque o el reloj monotónico retrocede, exigir revalidación en vez de recurrir al reloj manual. Fuente: [Android SystemClock](https://developer.android.com/reference/android/os/SystemClock).

Protección prevista: cifrado autenticado de paquetes, clave no exportable administrada por la plataforma, vinculación cuenta/contexto y exclusión de backups/exportación. No guardar claves junto a los bytes ni prometer protección ante root/instrumentación del proceso. Referencia: [Android Keystore](https://developer.android.com/privacy-and-security/keystore). **Este almacenamiento todavía no está implementado ni activado.**

Primer incremento de código: `private-offline-policy.ts` fija el plazo exacto del contrato servidor, sin crear endpoint ni conceder acceso; Flutter `PrivateOfflineAccessPolicy` implementa la máquina de permisos en memoria. No modifica autorización actual, sesión, imágenes online, disco ni PDF. Pendientes: manifiesto autorizado, reloj nativo, persistencia cifrada, enlace con suspensión/revocación y visores; no declarar P3-B/C/D completos por pruebas de la política pura.

Validación de esta base:17/17 backend (6 política y11 PDF), ESLint dirigido y `npx nest build` correctos;29/29 Flutter (15 política y14 PDF/descargas), análisis limpio y hot reload. Son pruebas de contratos/decisiones, no de cifrado nativo, almacenamiento ni permisos reales de un endpoint nuevo. Se conserva la activación de caché privada apagada/no implementada.

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

1. Plazo resuelto:72 horas, revalidación al vencer, bloqueo al confirmar revocación/suspensión y PDF exportados excluidos, según confirmación superior.
2. Cuota local por cuenta y política de eliminación/retención. Límites editoriales existentes: 2 MiB WEBP y dimensiones máximas del recurso; no bastan para una cuota global.
3. Qué experiencia offline se permite al reiniciar sin poder verificar la sesión; hoy el flujo online puede limpiar tokens al fallar la restauración. No ampliar autenticación por accidente dentro del caché de imágenes.

## Matriz mínima antes de habilitar

Dos cuentas; logout y descarga tardía; contexto editado/archivado; imagen reemplazada/revocada; hashes/bytes corruptos; cuota/disco lleno; publicación incompleta; caducidad/reloj; reinicio offline; reconexión con 200/401/403/404/410/503; limpieza interrumpida; visores abiertos; ausencia de soluciones o metadatos de otra cuenta. SQL/HTTP, Flutter y Android se documentan por separado.

Secuencia recomendada: cerrar decisiones P3-A → P3-B contrato servidor/manifiesto → P3-C almacenamiento/lectura Flutter → P3-D ensayo integrado. No se abre Storage remoto ni se activa producción para desarrollar este contrato.
