# PR-I5-C2 — Logo institucional

Checkpoint del propietario, 13 de octubre: C2C pendiente; no hay pruebas nuevas
por la conciliación documental. Registrar cada resultado API aquí y en el acta
Flutter; el compañero actualiza CHECKPOINT_OV1.md. Roadmap consolidado por bloque.

12 de octubre de 2026. Backend y Flutter implementados; C2C integrado pendiente.
Fuente del orden y acta completa: `docs/PR_I5_C2_LOGO.md` en Flutter.

POST/DELETE `/instituciones/me/logo`: JWT, política de correo, propietario actual
y aprobación. POST multipart `logo` + `revision`; DELETE JSON `{revision}`.
Respuesta `{logoUrl, revision}`. Revisión compartida con presentación; conflicto409
obliga consulta antes de reenviar. PATCH heredado no escribe URLs y exige propietario.

PNG/JPEG/WEBP estático,3 MiB/16 MP; firma, decodificación, orientación, recorte
centrado512×512, WEBP sin EXIF <=200 KiB. Sin escritura a disco. `InstitucionLogo`
con FK, límite SQL, RLS/revocación a roles públicos. Bytes, URL, revisión y
auditoría en una transacción; un logo por institución. Listados sin binario.
GET autenticado `/instituciones/directorio/:id/logo/:revision`: solo URL vigente
y aprobación, sin caché, WEBP/nosniff. Legado no se importa ni se elimina.

Migración `20261012180000_institution_logo` **no aplicada**. `sharp`0.35.5 y lock
actualizados, CommonJS conservado.79 pruebas dirigidas aprobadas:73 de
logo/perfil/directorio +6 HTTP/guardas (Prisma simulado). Build correcto;
npm audit de producción sin vulnerabilidades reportadas.

Preparado, no ejecutado: `tool/test_institution_logo_local.cjs`, seis casos reales
HTTP/PostgreSQL sobre supervisor temporal propio. Primero sesión nueva del harness
y `tool/test_institution_profile_local.cjs` para fixtures; luego guion logo.
Valida privacidad, persistencia, descarga, permisos, concurrencia y rollback real.
Harness admite explícitamente migración pendiente; no usar `.env`/base remota.
Después, ocho pruebas Android de acta Flutter. No declarar C2 cerrada antes.
