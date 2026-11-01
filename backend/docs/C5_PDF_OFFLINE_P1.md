# C5-PDF P1 — imágenes editoriales en material descargable

31/oct/2026. Incremento local posterior a H3; no despliegue ni cierre de todo C5.

## Decisión de producto confirmada

El propietario aprobó separar el PDF exportable del contenido privado offline de la app. El PDF es una copia descargada/imprimible: no puede revocarse a distancia. El futuro almacenamiento privado de imágenes dentro de la app debe revalidar permisos al reconectar. No confundir ambos productos ni prometer borrado remoto de copias externas.

## P1 implementado

- Se amplía `TemaPdfService` existente, sin reconstruirlo. Solo tema/subtemas publicados.
- Las rutas canónicas `/recursos/editoriales/:uuid4` se resuelven dentro del servidor mediante `EditorialFileService.publishedContent`, sin actor histórico: permiso por publicación vigente, estado y revocación existentes. No se usa la lectura administrativa sin autorización.
- WEBP normalizado se convierte con sharp a PNG para PDFKit, conservando proporción. No se hacen peticiones HTTP a URLs externas. El comportamiento legado de enlaces/locales se conserva; no se presenta como imagen remota incrustada.
- Una imagen gestionada denegada, corrupta o con referencia canónica alterada impide exportar un PDF incompleto. No se omite silenciosamente una figura necesaria.
- Recursos repetidos se deduplican solo dentro de la solicitud. Máximo técnico 32 imágenes distintas y 32 MiB de PNG acumulados; límite de decodificación 20 megapíxeles. No es una cuota comercial.
- Se revalida cada imagen tras generar el documento y antes de devolverlo. Una denegación entonces descarta el PDF. No se promete atomicidad entre esa comprobación final y la entrega de bytes ni retirada de documentos anteriores.
- Aviso visible de copia descargada/no actualizable. Sin migración ni flags nuevos; se conserva runtime editorial apagado por defecto fuera de development/test.
- `EditorialFileModule` exporta el servicio; `SimulacroModule` lo importa para reutilizar las reglas existentes.

## Validación y límites

La primera suite PDF pasó 9/9 y la regresión conjunta inicial PDF/servicio/HTTP 76/76. Tras agregar bytes inválidos y límite de 32 imágenes, **regresión final 78/78 en tres suites**, cero fallos (10,265 s). `npx nest build` y ESLint dirigido finales aprobados. La maqueta sintética fue renderizada con Poppler e inspeccionada: título, aviso, figura 2:1, texto y pie legibles; [captura](evidence/c5-pdf-p1/preview.png). No usa base de datos ni archivos reales del alumno.

`npm run build` encontró EPERM al regenerar el motor Prisma, retenido por procesos locales activos. No se mataron servicios ni se cambió el cliente para evitarlo. Se comprueba compilación con `npx nest build` usando el cliente existente; no afirmar que el comando completo con regeneración pasó. Un primer ESLint detectó acceso `any` en la prueba nueva, corregido con matcher estructural.

Pendientes P2: ensayo HTTP/PostgreSQL real de exportación con imagen administrada y revocación, render de varios temas/extremos y Android descarga/apertura. P3: caché privada separada, manifiesto de versiones/permisos, aislamiento por cuenta y revocación/reconexión; no implementados aquí. Proveedor persistente, fotos/evidencias y operación C5-D siguen abiertos.
