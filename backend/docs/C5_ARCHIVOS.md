# C5 — Archivos y recursos persistentes

## Checkpoint vigente — 21 de octubre de 2026

**C5-A/B y C5-C1 validadas localmente.** [C5-C1](C5C_FLUTTER.md) cierra5/5
comprobaciones humanas Android,3/3 Flutter VM/HTTP/PostgreSQL repetidas y57/57
dirigidas tras corregir el recorte del aviso. Análisis limpio y APK instalada.
Estos contadores no se suman como una sola suite. Conservar la evidencia del20
inferior; no atribuirle una nueva regresión global ni nuevo despliegue.

Push A/B/C1+C2-A/B confirmado: app `c69a5e9`, backend `e1c4d18`.
[C5-C2-C](C5C2C_CONSUMIDORES.md) validada automáticamente:44/44 PostgreSQL/HTTP,
128 suites/1.675 backend y969 Flutter aprobadas/16 opt-in omitidas.
70 migraciones temporales, ninguna nueva de C2-C; cambios aún sin commit/push.
Sigue C2-D, ensayo Android. Activación apagada por defecto; opt-in solo en la
sesión desechable propia de C2-D. Después siguen
PDF/offline, autorización histórica, fotos/evidencias y C5-D. C1 no cierra toda C5.
OV-1 separado; sin merge/despliegue ni SQL remoto.

## Antecedente — checkpoint del 20 de octubre de 2026

**Avance posterior C5-C1:** [lectura online Flutter](C5C_FLUTTER.md) implementada,
30/30 nuevas y3/3 con HTTP/PostgreSQL real aprobadas; regresión950/13 omitidas.
Siguen cinco comprobaciones Android. Esto no cierra opciones, PDF/offline,
autorización histórica, fotos/evidencias ni C5-D. A/B inferiores son antecedentes
validados; la continuación inmediata es la revisión C1, no empezar Flutter de cero.

**C5-A y C5-B implementadas y validadas localmente. Sigue C5-C, Flutter.**
[Acta del panel C5-B](C5B_PANEL.md):23/23 PostgreSQL/HTTP,69 migraciones temporales,
panel124/124 y recorrido Chromium de escritorio/adaptable aprobados. No prueba Android.
La evidencia A inferior conserva el primer cierre15/15 y68 migraciones.
Rama local de ambos repositorios: `feat/c5-archivos-base`.
Bases de esta entrega: app `041cbd1`, backend `d5ec9f1`.
No confundir este código local con integración en main, despliegue o prueba Android.

El propietario mantiene C5. El compañero continúa OV-1 y su checkpoint no cambia.
Archivos compartidos modificados: `backend/prisma/schema.prisma` (relación nueva
y modelo independiente), migración nueva y dos líneas de `src/app.module.ts`.
Conciliar estos cambios al integrar OV-1; conservar las migraciones de ambos frentes.
No se cambiaron dependencias, locks, sesión, navegación, logo institucional ni
certificados. Se añadió un script npm y el control del ejecutor a CI; no se
ha ejecutado CI remoto ni integrado esta rama.

## División acordada de C5

| Bloque | Entrega y cierre |
|---|---|
| C5-A — Base backend | Cerrado en su alcance local: contrato, validación, permisos, recibos y adaptador privado. 70 pruebas nuevas dentro de la regresión 1.637; ensayo posterior PostgreSQL/HTTP 15/15 y controles del ejecutor 8/8 aprobados. Sin despliegue ni almacenamiento externo. |
| C5-B — Panel | [Validada localmente](C5B_PANEL.md): selector, vista previa, recibo y asociación segura a preguntas/casos/lecciones. Publicación inmediata, protección de usos y lectura autenticada de recursos publicados.23/23 integradas A+B y recorrido Chromium real. |
| C5-C — Flutter y consumidores | C1 online validada5/5 Android; C2-A/B/C validadas automáticamente, sigue C2-D humano según su acta. Carga por opción apagada por defecto. Después PDF/offline, autorización histórica y fotos/evidencias con contratos propios. No cerrar todo C5-C por esos ensayos. |
| C5-D — Integración y operación | Pruebas por flujo, recuperación, permisos, proveedor persistente autorizado, respaldo/limpieza y validación final. Las pruebas de seguridad se hacen también en A/B/C. |

El cierre global de C5 incluye recursos académicos, fotos y evidencia privada.
La primera entrega A cubre **imágenes editoriales preparadas por ADMIN**.
No admite PDF, audio, vídeo, SVG, archivos animados ni adjuntos institucionales.
Las fotos de estudiantes/profesores no se cargan todavía mediante estas rutas.
El logo C2 en PostgreSQL conserva su implementación y sus pruebas.

## Contrato de C5-A

Todas las rutas exigen ADMIN mediante la guarda existente, incluido el bloqueo
por cambio inicial de contraseña. Ningún estudiante o profesor descarga estos bytes.
Un ADMIN puede consultar/retirar recursos editoriales de otro ADMIN;
el recibo por operación solo se consulta desde la cuenta que lo creó.

| Método | Ruta | Comportamiento |
|---|---|---|
| POST | `/admin/archivos` | Multipart con `archivo` y metadatos; devuelve el recurso preparado. |
| GET | `/admin/archivos/operaciones/:operacionId` | Recupera recibo propio; 404 si no existe o pertenece a otra cuenta. |
| GET | `/admin/archivos/:id` | Metadatos del recurso; no contiene ubicación del disco ni secretos. |
| GET | `/admin/archivos/:id/contenido` | WEBP privado con autenticación, `no-store` y `nosniff`. |
| DELETE | `/admin/archivos/:id` | Retira el recurso preparado; repetible. Conserva recibo y metadatos. |

Campos: `operacionId` UUID v4 creado una sola vez por envío,
`titulo` (1–120), `textoAlternativo` (1–500), `fuente` (1–500),
`titular` (1–255), `autorizacion` y `referenciaAutorizacion` opcional
(1–2000 cuando se incluye). Se recortan espacios externos y se rechazan
controles/caracteres invisibles. El nombre original del archivo no se almacena.

Autorización: `ORIGINAL`, `LICENCIA`, `DOMINIO_PUBLICO` o
`AUTORIZACION_ESCRITA`. Las tres últimas exigen referencia documental.
Registrar esa declaración no verifica por sí solo los derechos de una imagen.
La referencia es texto: el servidor no descarga enlaces proporcionados por el editor.

PNG/JPEG/WEBP estático, hasta **5 MiB y 20 megapíxeles**. Se comprueban firma,
decodificación y páginas; se aplica orientación EXIF, se elimina metadata embebida
y se convierte a WEBP. Máximo 2560×2560 dentro de la proporción original, sin
recortar ni ampliar imágenes pequeñas; salida hasta 2 MiB. Comprobar legibilidad
de diagramas en la integración. No se usa el recorte cuadrado del logo.

Estados técnicos del recurso: `PREPARADO` (recibo reservado, falta confirmar bytes),
`DISPONIBLE` y `RETIRADO`. No son estados de revisión académica.
En A el recurso no se incorporaba a contenido publicado. B ya lo asocia mediante
FK y referencia estable `/recursos/editoriales/:id`, generada por el panel.
No pegar rutas privadas ADMIN en campos externos. La lectura backend exige
publicación y autenticación; integrarla en Flutter sigue pendiente de C5-C.

Errores principales: 400 metadatos/imagen inválidos, 401 sin sesión, 403 sin rol,
404 recurso/recibo no accesible, 409 mismo identificador con otro envío,
410 operación retirada, 413 límite multipart y 503 almacenamiento deshabilitado
o no disponible. Un envío aceptado devuelve 201; retirada y consultas, 200.

## Persistencia y recuperación

`ArchivoEditorial` guarda metadatos, huella de solicitud, SHA-256, dimensiones,
tamaño, autor, estado y tiempos en PostgreSQL. Migración:
`20261020120000_editorial_files_base`. Hay límites de bytes/dimensiones en SQL.
La FK del creador usa RESTRICT; la futura eliminación de cuentas deberá definir
la conservación/anonimización de esta atribución antes de borrar al usuario.

`EditorialFileStore` separa los bytes del servicio. El adaptador inicial usa
`backend/.tmp/editorial-files` cuando la API se ejecuta desde `backend/`.
No está dentro de `/uploads` ni tiene ruta estática. Es un adaptador de desarrollo:
sobrevive a reinicios del proceso mientras se conserve ese directorio, pero
no acredita persistencia de Render ni almacenamiento externo. Si faltan o se
corrompen los bytes, la descarga devuelve 503; el recibo no inventa su recuperación.

La reserva única por operación precede a la escritura. Reintentar con la misma
cuenta, identificador, bytes originales y metadatos recupera el mismo recurso.
Cambiar el envío requiere otro identificador. Una reserva simultánea P2002 se
reconcilia leyendo el ganador. Un recurso PREPARADO admite reintento idéntico;
si ya está DISPONIBLE se devuelve su recibo sin volver a escribir.
La escritura local publica bytes completos sin sobrescribir otro reintento.
La lectura verifica tamaño y SHA-256.

Desde B, retirar bloquea el recurso en una transacción y rechaza cualquier uso
en preguntas, casos o lecciones, incluidas versiones archivadas. La asociación
usa el mismo bloqueo. Retirar cambia primero el estado y después elimina bytes. Si falla la eliminación,
el acceso sigue revocado y DELETE permite reintentar la limpieza. Una carga que
detecta retirada concurrente no lo reactiva. Una caída del proceso entre pasos puede
dejar bytes temporales/huérfanos: la limpieza y conciliación operativa siguen en D;
no prometer transacción atómica entre PostgreSQL y el sistema de archivos.

## Activación y pruebas

Desactivado por defecto: `EDITORIAL_FILES_LOCAL_ENABLED=false`.
Opciones: `EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED=false`, adicional al anterior.
Solo se activó dentro del ensayo desechable C2-B; no habilitar para estudiantes
antes de C2-D. Ver condiciones y evidencia en [acta C2](C5C2_OPCIONES.md).
Solo acepta `true` junto con `NODE_ENV=development` o `test`; production,
staging y entorno ausente permanecen bloqueados. La guarda actúa antes de multipart.
No activar contra una base existente sin preparar el entorno; la migración se
validó únicamente en la base temporal propia descrita debajo.
Una tabla pendiente o base no disponible devuelve 503 sin detalles internos.

Desde `SaberPlus-Backend/backend`, sin teléfono ni Docker para las unitarias:

```powershell
npm run db:generate
npm run build
npm test -- --runInBand --runTestsByPath src/editorial-files/editorial-image.spec.ts src/editorial-files/editorial-file.store.spec.ts src/editorial-files/editorial-file.service.spec.ts src/editorial-files/editorial-file-http.spec.ts
```

Los tests HTTP usan Nest, guardas, pipes y multipart reales con Prisma simulado.
Los tests del adaptador escriben bytes en un directorio temporal propio y comprueban
persistencia entre instancias y ocho escrituras simultáneas. No equivalen a
concurrencia PostgreSQL ni a un ensayo del panel/app.

Evidencia ejecutada el 20 de octubre en este PC: `npm run build` aprobado y
regresión completa `npm test -- --runInBand`: **125 suites/1.637 pruebas aprobadas**.
Incluye **70 pruebas nuevas** en cuatro suites C5-A (imágenes, disco local,
servicio y HTTP). ESLint dirigido, formato Prettier y TypeScript sin emisión
aprobados. `prisma validate` aprobado con URL ficticia de validación, sin conexión
a base de datos. Revisión documental: 1.061 destinos de enlaces locales en los
documentos versionados, ninguno inexistente; los dos contratos C5 nuevos coinciden.
Las primeras ejecuciones detectaron diferencias de manejo de errores del disco
y del límite multipart; corregidas y cubiertas por la regresión final.
La implementación inicial no ejecutó Docker ni migraciones. El ensayo posterior
descrito debajo sí usó Docker y PostgreSQL local. No hubo ensayos Android.

## Validación integrada C5-A — completada el 20 de octubre

Ejecutor añadido: `backend/tool/test_editorial_files_postgres.mjs` y suite
`backend/test/editorial-files-postgres.test.cjs`. Desde `backend/`:

```powershell
npm run test:editorial-files:postgres
node --test tool/test_editorial_files_postgres.test.mjs
```

**Resultados reales: 15/15 PostgreSQL/HTTP, cero omitidas; controles del ejecutor
8/8 aprobados.** PostgreSQL16 en Docker local: puerto loopback aleatorio,
datos en tmpfs, límite512 MiB y una CPU. Se reutilizó la imagen existente,
sin descargar otra. Aplicadas las **68 migraciones** (67 de HEAD + C5 nueva).
La suite utiliza Prisma, guardas, JWT, multipart, servidor HTTP y disco reales.
Los fallos se provocan expresamente en adaptadores, un trigger SQL temporal o
destruyendo el socket de respuesta; no son confirmaciones humanas Android.

La migración nueva incorpora RLS y revoca privilegios directos a PUBLIC,
anon y authenticated. Se comprobó denegación efectiva por ACL y también RLS
con un permiso SELECT temporal revertido. No se modificaron migraciones antiguas.

También pasó el comando de controles usado por CI:20/20 pruebas, de las que8
son nuevas de C5 y12 son controles locales existentes. Formato y sintaxis de
los nuevos ejecutores correctos; diff sin errores de whitespace. Revisión final
de enlaces locales versionados:1.062 destinos, cero inexistentes. CI remoto
no ejecutado en esta rama. Confirmado que no quedaron contenedores propios C5.

Los ocho escenarios previstos quedaron cubiertos por estos 15 casos:

1. Cadena completa de migraciones, FK y límites SQL del modelo nuevo.
2. Carga HTTP y recuperación tras reiniciar API/adaptador, con los mismos bytes.
3. Dos cargas concurrentes idénticas: una fila, un identificador y bytes íntegros.
4. Operación repetida con otro contenido/metadatos: conflicto sin sobrescritura.
5. Permisos de roles y aislamiento del recibo entre dos ADMIN.
6. Fallo de escritura y pérdida de respuesta antes/después de confirmar: recuperación.
7. Retirada repetida/concurrente, lectura bloqueada y limpieza reintentable.
8. Configuración apagada y migración ausente: error controlado y sin escritura.

Además se verificaron conflictos entre dos ADMIN, imágenes corruptas/ausentes
y respuesta503 ante una tabla sin migrar. El reinicio cerró y creó otra instancia
HTTP/Nest con el mismo disco; la prueba concurrente usó dos instancias y ocho POST.
La pérdida de respuesta ocurrió después de confirmar en PostgreSQL; el fallo
antes de confirmar se produjo con un trigger SQL40001 retirado al terminar.

El ejecutor no lee `.env` ni acepta URL externa. Verifica contexto Docker local,
marcador de propiedad y destino temporal; carga SQL versionado y solo la nueva
migración C5 explícita, sin enumerar migraciones ajenas no versionadas.
Se eliminaron el contenedor propio y el directorio temporal al terminar.
No se reutilizó ni se dejó una sesión humana abierta. No se tocó Supabase/Render.

**Actualización posterior: C5-B completada localmente**, según [acta](C5B_PANEL.md).
Sigue C5-C, Flutter/consumidores. Las15 pruebas A y23 integradas A+B no son
gestos humanos ni cierran toda C5. El celular se necesitará al tener lista la APK C.

## Pendientes que se conservan

- Elegir/configurar el adaptador Supabase Storage previsto, buckets privados,
  credenciales solo en servidor, permisos y URLs estables sin tokens en el catálogo.
  Servicio real y despliegue requieren autorización; no están implementados en A.
- Asociación y protección de retirada implementadas en B; ampliar consumidores
  móviles e históricos conservando publicación directa y protección de borradores.
- Biblioteca/listado, sustitución/versiones y limpieza con política de conservación.
- Opciones: base/contrato/panel y consumidores C2-A/B/C listos; falta ensayo Android C2-D. Activación apagada por defecto, según [acta C2](C5C2_OPCIONES.md).
- Incorporar recursos gestionados a PDFs/offline; no descargarlos desde URLs arbitrarias.
- Fotos de perfil y documentos de evidencia con reglas de acceso propias.
- Respaldos, cuotas operativas, huérfanos y comportamiento de archivos ya descargados.
- Revisar coordinación de esquema/app.module con OV-1 antes de integrar ambas ramas.
