# C5-C2 — Imágenes en opciones de respuesta

## Checkpoint — 21 de octubre de 2026

**C2-A implementada y validada localmente: base de datos y permisos.**
No es el cierre completo de C5-C2 ni habilita imágenes en opciones desde el panel.
El editor todavía rechaza `respuestas[].imagenUrl`; la prueba HTTP comprueba ese
rechazo. No cargar estas asociaciones manualmente en una base existente.

Entrega anterior A/B/C1 guardada: app `af73039`, backend `0bfaaba`.
No se hizo push funcional, PR, merge ni despliegue. El push documental anterior
`52a3488` no publicaba el código funcional C5. Esta continuación C2-A queda
en el árbol de trabajo, separada de esos commits. Rama: `feat/c5-archivos-base`.
OV-1 y su checkpoint siguen siendo responsabilidad del compañero.

## División y continuación

| Paso | Alcance / estado |
| --- | --- |
| C2-A — Base y seguridad | Validada localmente. Modelo Respuesta, relaciones, consistencia SQL, lectura publicada, protección de retirada y resolución por lotes. |
| C2-B — Contrato editorial y panel | **Siguiente.** DTO, detalle/guardado/versiones, huellas de duplicados y selector por opción con carga/recibo/reintento. Mantener texto obligatorio. No habilitar publicación con imágenes hasta tener listos todos los consumidores afectados de C2-C. |
| C2-C — Contratos de consumo y Flutter | Pendiente. Transportar referencias por opción en práctica, diagnóstico, simulacro/repaso, juegos y snapshots. Compatibilidad con registros/intentos antiguos sin imagen. Renderizar con AcademicImage, proporción original y descripción accesible, sin filtrar la correcta. Puede prepararse antes de habilitar el editor. |
| C2-D — Ensayo del flujo completo | Pendiente. Panel → API/SQL → app Android, imágenes en opciones correctas e incorrectas, historial/versiones, sesión/conexión, texto grande y recuperación. Es validación de C2, no sustituye C5-D de operación global. |

Después continúan PDF/offline, autorización de recursos históricos,
fotos/evidencias y C5-D. C1 permanece cerrada dentro de sus cinco pruebas humanas;
no se repitió ese guion Android en esta entrega.

## Qué incorpora C2-A

- Migración nueva y aditiva `20261021180000_editorial_option_image_links`:
  `Respuesta.imagenUrl` y `Respuesta.archivoImagenId` anulables, FK RESTRICT e índice.
  El texto sigue siendo obligatorio. No se modificaron migraciones anteriores.
- Restricción SQL: una referencia privada debe tener FK y ruta canónica
  `/recursos/editoriales/:uuid` coincidentes; permite ausencia de imagen.
  La alternativa HTTPS no sustituye la validación de URL de la futura API.
- Relación inversa `ArchivoEditorial.opciones`.
- Retirada bloqueada por respuestas asociadas, incluidas preguntas archivadas.
  Desvincular no borra bytes. La conservación histórica sigue pendiente de contrato;
  proteger la retirada no concede acceso estudiantil a versiones archivadas.
- Lectura autenticada de bytes solo con archivo DISPONIBLE y una opción cuya
  pregunta, subtema y tema estén publicados. El permiso no consulta si la opción
  es correcta. No entrega metadatos de derechos, claves, disco ni recibos.
- `editorialImagesData` valida todo el lote antes de adquirir locks, deduplica
  UUID y los bloquea en orden estable; devuelve asociaciones en el orden original.
  Usarla una sola vez con enunciado y opciones en la transacción editorial futura.
  Reutilizar el mismo archivo no causa locks repetidos.
- La asociación individual C5-B reutiliza ese resolver y conserva su contrato.
- Ambos ejecutores locales permiten explícitamente la nueva migración.
  No enumeran ni aplican migraciones ajenas no versionadas.

Los fixtures de opciones de esta entrega se crean únicamente en transacciones del
ensayo desechable. No hay nueva carga UI, DTO, serialización pública de opciones
ni cambios de puntaje, XP, certificados, ranking o reglas de respuesta.

## Evidencia realmente ejecutada

El 21 de octubre de 2026, en este PC:

- `npm run build`: aprobado, incluye regeneración Prisma.
- `npm test -- --runInBand`: **126 suites / 1.657 pruebas aprobadas**.
  Son siete pruebas nuevas respecto de las 1.650 anteriores.
- Dirigidas de asociación/servicio/HTTP: **68/68 aprobadas**; incluidas en la
  regresión anterior, no sumarlas como pruebas independientes.
- `npm run test:editorial-files:postgres`: **31/31 aprobadas, cero omitidas**,
  con **70 migraciones** en PostgreSQL16/Docker local. Incluye las 23 anteriores
  A/B y ocho nuevas C2-A.
- Regresión Chromium real del panel anterior, escritorio y viewport390, incluida
  en esas31; no prueba un editor de imágenes de opciones que todavía no existe.
- ESLint dirigido, Prettier, sintaxis del ejecutor y controles locales de los dos
  ejecutores editoriales: **19/19 aprobados**.
- Sin nueva compilación/instalación Android, prueba física C2, CI remoto o despliegue.

Las ocho integradas nuevas cubren:

1. Campos anulables sin romper opciones de texto, FK, texto obligatorio y par ruta/FK.
2. Bytes protegidos y permiso idéntico para opciones correctas e incorrectas.
3. Revocación al archivar pregunta, subtema o tema.
4. Retirada bloqueada por referencias archivadas; desvinculación sin borrar bytes.
5. Reversión completa ante fallo dentro de la transacción.
6. Asociación frente a retirada concurrente, sin referencia confirmada a recurso retirado.
7. Dos lotes simultáneos con orden inverso de archivos, sin interbloqueo.
8. Rechazo HTTP del nuevo campo mientras el editor todavía no lo admite.

La primera ejecución tuvo30/31: el test8 usaba el cliente del panel, que elimina
campos desconocidos antes del envío. Se corrigió el test para usar HTTP directo
y se repitió todo el recorrido:31/31. No se desactivó la validación del DTO.
Los dos avisos ESLint de una aserción nueva se corrigieron y se repitió el control.

El ejecutor usa contenedor propio, puerto loopback aleatorio, tmpfs256MiB,
memoria512MiB y una CPU. Se reutilizó la imagen PostgreSQL16 existente.
Verificó propiedad y retiró su contenedor y directorio temporal al terminar.
Las capturas del panel quedan fuera de Git, en `backend/.tmp/c5b-qa/`.
No se consultó ni modificó Supabase/Render ni una base persistente del propietario.

## Para continuar sin romper contenido

1. Revisar esta acta y C5_ARCHIVOS/C5C_FLUTTER, luego diff de ambos repositorios.
   No asumir que la API del ensayo anterior siga activa: se cerró para regenerar
   Prisma en Windows. Usar una sesión temporal nueva al retomar Android.
2. Conservar texto obligatorio y único en cada opción; la imagen lo complementa.
   El texto debe describir la opción sin revelar la correcta.
3. Resolver enunciado y opciones juntos dentro de la misma transacción, con
   revisionado/versiones existentes. Si una imagen falla, no guardar ninguna parte.
4. Incluir la identidad de cada imagen en huellas de duplicados, preservando las
   huellas antiguas de opciones solo de texto y el formato del importador existente.
5. Preparar serializadores y snapshots sin añadir `esCorrecta`, explicaciones de
   solución, FK privadas ni metadatos administrativos a respuestas no contestadas.
   Leer snapshots antiguos sin campos nuevos; no reescribir intentos guardados.
6. El panel debe conservar asociaciones al recargar/editar y permitir quitar una
   imagen sin eliminar físicamente el recurso. Mantener recuperación de cargas
   inciertas y protección frente a cambio de cuenta/registro.
7. No habilitar el nuevo campo editorial hasta que consumidores y pruebas cubran
   todos los flujos afectados. Registrar la decisión de activación en C2-B/C.
8. Celular requerido cuando exista la interfaz C2 completa para el ensayo C2-D;
   Docker se usa para pruebas PostgreSQL, no para justificar controles sin ejecutarlos.
   No publicar, migrar remotamente ni integrar main sin autorización.

Referencias: [contrato general](C5_ARCHIVOS.md), [panel C5-B](C5B_PANEL.md),
[lectura online y cierre C1](C5C_FLUTTER.md).

