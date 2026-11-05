# C5: matriz de comprobación local

4/nov/2026. Rama `feat/c5-cierre-pendientes`. **Cierre del alcance local autorizado.**
No es despliegue, integración Git ni habilitación de producción.
Estado narrativo y ejecuciones: [registro](C5_CIERRE_PENDIENTES_2026_11_03.md).
Operación privada: [runbook](C5_OPERACION_PRIVADA_LOCAL.md).

| Requisito | Implementación/evidencia inspeccionada | Estado |
|---|---|---|
| Conservar abstracción y referencias editoriales | Adaptadores local/Supabase; pruebas integradas de publicación, historial y juegos | Verificado localmente |
| PDF exportado separado de acceso privado offline | Flujo Storage/PDF/manifiesto/revocación; política72h conserva su cierre previo en app | Verificado según actas y regresión integrada; no nueva prueba72h física |
| Foto propia privada | ProfilePhotoService, JWT, versión, recibos, ruta propia; SQL/HTTP y flujo Android real | Verificado localmente |
| No publicar foto en rankings/directorios | Foto privada no utiliza fotoPerfil pública; rechazo de acceso ajeno incluso ADMIN | Verificado en pruebas privadas |
| Evidencia institucional, no documentos personales del alumno | InstitutionEvidenceService, solicitante/ADMIN; PDF attachment y nosniff | Verificado SQL/HTTP/panel/Android |
| Retención90d desde primera resolución | ResolucionEvidenciaInstitucional inmutable2160h, autorización con reloj PostgreSQL y trabajador | Verificado en PostgreSQL, también vencimiento durante IO |
| Límites antes de asignar memoria | Transporte privado5MiB, puente nativo acotado, normalización imágenes | Unitarias backend/Flutter y11 JVM aprobadas |
| Selectores reales, sin URI/cache de la app | Puente Android pick/pickImage/export; cancelación y cambio de cuenta | Flujos físicos registrados; otros sistemas no acreditados |
| Borrado/revocación sin resurrección lógica | Estado monotónico, revisión y autorización posterior al IO; LIC-4 | Verificado SQL/HTTP |
| Respaldo técnico privado | AES-256-GCM, clave/sobre separados, vaultId, registro durable; CLI sin endpoint | Verificado con archivos reales y PostgreSQL propio |
| No recuperar retirados/vencidos/suprimidos | Servicio técnico verifica propietario/estado/plazo antes y después; sin cambiar metadatos | Verificado en pruebas privadas |
| Borrado de copia/clave por ciclo de vida | Trigger de retirada, trabajador opt-in, namespace y confirmación física | Verificado fallo/reintento, supresión y vencimiento |
| Escritura tardía tras timeout y fallo compensatorio | Reconciliación repetida de IDs respaldados retirados, sin resetear primera confirmación |48/48 privadas y150/150 integradas aprobadas |
| Persistencia editorial/privada en Storage real local | Contrato con reinicio/cambio de puerto, buckets separados y acceso público denegado | Verificado con contenedores propios |
| Foto/evidencia HTTP usando bucket privado real local | Override de transporte privado en servidor Nest real; foto propia, ADMIN foto403, PDF ADMIN privado, alumno ajeno404 y recuperación exacta | Aprobado junto al flujo editorial:2/2 Storage seleccionadas |
| Cliente Prisma y compilación | Generación limpia5.22.0 tras cerrar ejecutores propios; Nest build | Aprobados |
| Panel y app |187 panel,83 Flutter dirigidas; análisis10 implementaciones; QA visual claro/oscuro/texto250% | Aprobados en su alcance, no equivalen a TalkBack completo |

## Auditoría final de entrega

1. Regresión completa después del ajuste de reconciliación:150/150 aprobadas,
   ninguna omitida, PostgreSQL88 migraciones y Storage local propios.
2. Escenario HTTP privado añadido después:selección Storage2/2 aprobada,
   sin omisiones. La primera ejecución detectó una expectativa404 equivocada:
   la política bloquea el rol ADMIN con403 antes de buscar fotos. Se corrigió
   el test, no se relajaron permisos. Recursos propios retirados.
3. Lint privado/Auth/aprobación/supresión aprobado; sintaxis de scripts y39
   módulos panel correctos. `git diff --check` en ambos repositorios sin errores
   (avisos LF/CRLF, no correcciones globales de finales de línea).
4. Banderas backend, panel y Flutter apagadas por defecto; no activar producción.
5. Prisma Client regenerado y Nest compilado;11 JVM,83 Flutter dirigidas,
   187 panel y301 unitarias editorial/privadas aprobadas en sus ejecuciones
   registradas. La prueba SQL de escritura tardía cubre el último ajuste de
   limpieza; esos301 unitarios no se presentan como cobertura de ese caso.
6. Al cerrar la validación los cambios estaban sin commit en ambos repositorios.
   Los artefactos independientes de cuadernillos permanecen intactos y fuera
   de esta entrega. No usar `git add .` para incorporarlos accidentalmente.

No quedan puertas del alcance de implementación/pruebas/documentación local
identificadas como pendientes. El propietario autorizó después commits y push:
implementación backend/panel `11bbaa3`, Flutter `b98d65e`, ambos en
`feat/c5-cierre-pendientes`, con documentación en commits separados.
La identidad de los commits documentales y publicación se verifican en Git.
No se autoriza por ello merge a main, despliegue ni migraciones remotas.

## Límites explícitos

No se operaron Supabase/Render remotos, cuentas reales, buckets comerciales,
migraciones remotas ni gastos. La preparación del despliegue necesita otra
autorización y verificación de persistencia, secretos, permisos y capacidad.
La bóveda local no acredita custodia externa de claves, ACL Windows ni respaldo
ante desastre simultáneo de base, claves y bytes. No se eliminan huérfanos sin
registro. Una copia PDF exportada no se revoca ni se borra del equipo del usuario.
Los fallos de IO conservan limpieza pendiente: no se garantiza borrado físico
instantáneo bajo indisponibilidad o acumulación. No presentar una prueba de
componente como recorrido completo de login/navegación, ni un render como prueba
de TalkBack o Android real. Los contadores de suites distintas no se suman.
