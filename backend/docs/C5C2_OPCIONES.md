# C5-C2 — Imágenes en opciones de respuesta

## Checkpoint — 21 de octubre de 2026

**C2-A y C2-B implementadas y validadas localmente. Sigue C2-C, consumidores y Flutter.**
C2-B incorpora DTO/guardado y selector por opción, pero su activación está apagada
por defecto. Solo se habilitó dentro del ensayo desechable. No es el cierre completo
de C5-C2 ni una autorización para publicar preguntas con imágenes a estudiantes.
No cargar estas asociaciones manualmente en una base existente.

Entrega anterior A/B/C1 guardada: app `af73039`, backend `0bfaaba`.
Push de A/B/C1 y C2-A confirmado en app `2ee714a` y backend `7995201`.
El push documental anterior `52a3488` no incluía el código funcional C5.
C2-B es la entrega actual de esta acta; consultar git log de la rama para su commit.
No se creó PR ni se hizo merge o despliegue. Rama: `feat/c5-archivos-base`.
OV-1 y su checkpoint siguen siendo responsabilidad del compañero.

## División y continuación

| Paso | Alcance / estado |
| --- | --- |
| C2-A — Base y seguridad | Validada localmente. Modelo Respuesta, relaciones, consistencia SQL, lectura publicada, protección de retirada y resolución por lotes. |
| C2-B — Contrato editorial y panel | Validada localmente. DTO, detalle/guardado/versiones, huellas y selector por opción con carga/recibo/reintento. Texto obligatorio; protección de editores antiguos. Activación local apagada por defecto, no habilitar antes de C2-C/D. |
| C2-C — Contratos de consumo y Flutter | **Siguiente.** Transportar referencias por opción en práctica, diagnóstico, simulacro/repaso, juegos y snapshots. Compatibilidad con registros/intentos antiguos sin imagen. Renderizar con AcademicImage, proporción original y descripción accesible, sin filtrar la correcta. |
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

En C2-A los fixtures se crearon únicamente mediante transacciones del ensayo.
C2-B ya prueba el contrato editorial y la carga UI reales en ese entorno aislado,
con activación temporal explícita. No añade aún referencias a los serializadores
públicos ni snapshots de consumidores. Sin cambios de puntaje, XP, certificados,
ranking o reglas de respuesta.

## C2-B — Contrato y panel, validación del 21 de octubre

- Campo opcional `respuestas[].imagenUrl`, hasta2000 caracteres, sin aceptar null
  ni conversiones numéricas. El texto y su unicidad siguen siendo obligatorios.
- Resolución conjunta de enunciado y opciones con locks ordenados, dentro de la
  misma transacción. Una referencia inexistente/retirada o URL insegura revierte
  el guardado completo; no se publican padres ni preguntas parcialmente.
- El detalle ADMIN conserva referencias por opción. Las ediciones directas crean
  nueva versión y conservan las respuestas/FK históricas. Un cliente que omita
  los campos al editar una pregunta ilustrada recibe409, no borra imágenes.
- Las huellas incorporan la imagen de cada opción, conservando huellas antiguas
  sin imagen y la identidad `imagen` del importador. Se actualizaron editor,
  revisión, índice heredado y comparación del importador; no cambió su formato.
- Selector desplegable por opción: enlace HTTPS o carga privada con datos de
  derechos, vista previa proporcional, recibo/reintento y retirada del formulario.
  Agregar/quitar otras opciones conserva archivo, operación y vista previa.
  Quitar una opción con carga pendiente/incierta pide confirmación y no borra bytes.
  Guardar exige resolver todas las cargas. Cerrar/cambiar registro invalida callbacks
  y libera las vistas previas. Sin HTML insertado ni tokens persistentes.
- La capacidad se obtiene del listado/detalle ADMIN, no de una bandera del navegador.
  Demo y backend sin capacidad no ofrecen la nueva carga.

### Activación todavía restringida

`EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED=false` por defecto en .env.example.
Para el ensayo exige, además, archivos locales habilitados y NODE_ENV development
o test; production, staging o entorno ausente siguen bloqueados.
No se activó en un servicio humano ni remoto. Los tests la encienden temporalmente
dentro de su propio proceso y restauran el valor al terminar.

Apagada: una nueva imagen por opción devuelve503 sin escribir. Las preguntas solo
de texto siguen funcionando. Una pregunta ilustrada conserva su detalle pero queda
de solo lectura; la revisión editorial también bloquea su publicación.
Esto sustituye el rechazo del DTO de C2-A por un contrato válido con bloqueo
explícito de capacidad. No cambiar la bandera en un servidor con estudiantes:
antes faltan C2-C y C2-D. El adaptador privado de C5 también sigue sin proveedor
productivo autorizado.

### Evidencia C2-B realmente ejecutada

- Build backend y ESLint dirigido aprobados.
- Regresión backend: **127 suites /1.670 pruebas aprobadas** (13 nuevas sobre C2-A).
- Seis suites dirigidas: **115/115**; incluidas en la regresión, no sumarlas.
- Panel: **130/130** (seis nuevas); sintaxis de28 módulos correcta.
- PostgreSQL/HTTP: **37/37, cero omitidas**,70 migraciones en Docker/PostgreSQL16
  temporal propio (sin migración nueva en B). Seis casos nuevos y recorrido Chromium
  ampliado: imágenes distintas, fallo atómico, cliente antiguo, versiones,
  duplicados y bloqueo al desactivar.
- Chromium real: carga de enunciado y opción, proporción2:1, agregar/quitar otra
  opción sin perder la imagen y recarga del registro publicado. Escritorio1280
  y viewport390. Captura de opción390 inspeccionada: textos/controles legibles,
  proporción conservada y sin desbordes. Cero errores JS capturados.
- Sin nueva compilación Android, ensayo físico C2, CI remoto o despliegue.
  No confundir el navegador adaptable con un test Android de Flutter.

Captura local excluida de Git:
`backend/.tmp/c5b-qa/run-yHGyXJ/c5c2b-opcion-390.png`.
El ejecutor retiró su propio contenedor y directorio temporal al terminar.
Usó la imagen PostgreSQL16 ya existente y no tocó una base remota.

## Antecedente — evidencia C2-A

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

La primera ejecución C2-A tuvo30/31: el test8 usaba el cliente del panel, que elimina
campos desconocidos antes del envío. Se corrigió el test para usar HTTP directo
y se repitió todo el recorrido:31/31. C2-B amplió el DTO y ahora comprueba503
con la activación apagada, sin perder la comprobación de ausencia de escrituras.
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
2. Mantener texto obligatorio y único en cada opción; la imagen lo complementa.
   El texto debe describir la opción sin revelar la correcta.
3. Resolver enunciado y opciones juntos dentro de la misma transacción, con
   revisionado/versiones existentes. Si una imagen falla, no guardar ninguna parte.
4. Preservar las huellas de imágenes incorporadas en C2-B y la compatibilidad
   antigua; no reinventar la detección de duplicados al añadir consumidores.
5. Preparar serializadores y snapshots sin añadir `esCorrecta`, explicaciones de
   solución, FK privadas ni metadatos administrativos a respuestas no contestadas.
   Leer snapshots antiguos sin campos nuevos; no reescribir intentos guardados.
6. Conservar el comportamiento del panel C2-B: asociaciones al recargar/editar,
   quitar del formulario sin borrar bytes y recuperación de cargas inciertas.
   Ampliar las pruebas, no rehacer ese selector al implementar Flutter.
7. No habilitar el nuevo campo editorial hasta que consumidores y pruebas cubran
   todos los flujos afectados. Registrar la decisión de activación en C2-B/C.
8. Celular requerido cuando exista la interfaz C2 completa para el ensayo C2-D;
   Docker se usa para pruebas PostgreSQL, no para justificar controles sin ejecutarlos.
   No publicar, migrar remotamente ni integrar main sin autorización.

Referencias: [contrato general](C5_ARCHIVOS.md), [panel C5-B](C5B_PANEL.md),
[lectura online y cierre C1](C5C_FLUTTER.md).

