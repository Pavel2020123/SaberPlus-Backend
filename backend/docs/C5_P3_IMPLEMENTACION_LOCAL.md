# C5-P3 — manifiesto privado de lecciones

1/nov/2026. Continuación del contrato P3-A; no habilitado en producción, sin migración nueva ni cambios de cuentas institucionales.

`PrivateOfflineLessonController` y `PrivateOfflineLessonService` agregan `POST /recursos/editoriales/lecciones/:id/offline`. JWT/correo/cuenta obligatorios, UUID v4 y DTO estricto con nonce hexadecimal de 256 bits. El cliente no envía propietario, fechas ni URL de imagen. Cabeceras `private, no-store` y `nosniff`.

Opt-in explícito `EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED=true`, `EDITORIAL_FILES_LOCAL_ENABLED=true` y NODE_ENV test/development; en producción siempre denegado. El GET editorial y los generadores PDF conservan sus contratos anteriores.

Para una sesión nueva con el ejecutor desechable existente, usar `SABERPLUS_C5_PRIVATE_OFFLINE_LOCAL=true` antes de `node tool/local_ranking_validation.mjs`. El runner solo transmite ese opt-in validado a su API propia y lo informa sin secretos. No actualiza un proceso ya iniciado: requiere montar una sesión nueva compilada con el backend actual. En la sesión de esta evidencia se usó una API auxiliar43188 sobre la base temporal propia; no se sustituyó el backend original43187.

Solo contexto exacto de subtema/tema publicados. Imagen gestionada y asociación exacta; `publishedContent` verifica publicación/revocación e integridad. Relectura de contexto, archivo y cuenta antes de la concesión. Copia limitada de título/texto/imagen WEBP, hash SHA-256, nonce, propietario, contexto, versión1, reloj PostgreSQL y vencimiento72h. No soluciones, claves, JWT ni metadatos administrativos. Las modificaciones confirmadas durante la preparación impiden conceder el paquete.

El cliente Android cifra/autentica el paquete con Keystore y usa tiempo monotónico/arranque, no la fecha manual. Reinicio o sesión no restaurable requieren conexión. Una denegación confirmada retira la copia privada; un PDF ya exportado no se puede retirar y permanece excluido.

No existe aquí un nuevo estado persistente de suspensión de #14. Los guards y comprobaciones existentes deniegan acceso real; una futura implementación institucional deberá conectarse al mismo punto de concesión, sin sustituirla por validación de cliente.

Pruebas aprobadas: ocho casos unitarios del servicio, seis de política y **98/98 SQL/HTTP**, incluidos tres casos nuevos y navegador Chromium. `npx nest build` y ESLint dirigidos aprobados. En Android USB pasaron cinco escenarios integrados, incluido backend/JWT real y revocación ADMIN. Detalle y límites en `C5_P3_CACHE_PRIVADA.md` de la app. Un primer intento agotó conexiones acumuladas de fixtures; se agregó limpieza de los nuevos servidores y se limitó a4 el pool de cada cliente del ejecutor desechable. Esto no modifica la configuración de producción. El runner eliminó su propio contenedor/base temporal al terminar; no se tocaron bases remotas.
