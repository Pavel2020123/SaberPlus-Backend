# C5-B — Imágenes desde el panel y asociaciones seguras

## Estado del 20 de octubre de 2026

**Actualización posterior:** [C5-C1 Flutter](C5C_FLUTTER.md) ya implementa lectura
online autenticada, validada automáticamente y después en Android5/5 el21.
Continuación vigente: [C5-C2-A/B](C5C2_OPCIONES.md) base y selector por opción
validados localmente, con activación apagada por defecto. Sigue C2-C consumidores.
Push A/B/C1+C2-A confirmado en app2ee714a/backend7995201; sin merge ni despliegue.
El resto de C5-C/D permanece abierto.
Las afirmaciones inferiores sobre Flutter pendiente describen el cierre de B,
no sustituyen el checkpoint C1 más reciente.

**Implementado y validado localmente.** Rama `feat/c5-archivos-base` en ambos
repositorios. Al cerrar el20, C5-A y B estaban sin commit/PR/merge; ese estado
histórico fue superado por los commits y push registrados arriba.
Fuente del alcance global y de la continuación: [C5_ARCHIVOS](C5_ARCHIVOS.md).
El propietario mantiene este bloque; OV-1 del compañero no se modificó.

Sigue **C5-C: Flutter y consumidores**. Todavía no instalar APK ni repetir pruebas
Android: primero implementar lectura autenticada de recursos, resolver las rutas
estables y ampliar las opciones con imágenes. El celular se necesitará cuando
esa implementación tenga una APK lista para el recorrido físico. Docker sí se
usó aquí para la validación PostgreSQL del panel.

## Uso del panel

1. Elegir área, tema y subtema; abrir Preguntas o Contenido. Los casos conservan su sección.
2. Seleccionar PNG/JPG/WEBP desde el equipo y comprobar la vista previa.
3. Completar título, descripción accesible, fuente, autor/titular y permiso de uso.
   Si corresponde, indicar la referencia documental que autoriza la imagen.
4. Pulsar **Subir y usar imagen**. La imagen queda preparada para el formulario.
5. Pulsar el botón habitual **Guardar pregunta**, **Guardar texto compartido** o
   **Guardar explicación**: se asocia la imagen y se conserva publicación inmediata.

Los enlaces HTTPS existentes siguen funcionando. Los videos mantienen su campo
HTTPS. Las imágenes gestionadas usan una referencia interna generada por el panel;
no se pide al editor copiar rutas, códigos ni URLs privadas.

**Quitar imagen de este contenido** solo modifica el formulario; Guardar confirma
que deja de usarse allí. No elimina el archivo ni otras preguntas, versiones o lecciones.
Si un archivo tiene cualquier referencia, incluidas preguntas archivadas, su
retirada por API devuelve409. No hay eliminación en cascada.

La demostración mantiene sus datos locales y permite el flujo previo de enlaces.
La carga de archivos se muestra deshabilitada en DEMO con un aviso explícito;
no simula que una imagen llegó a PostgreSQL o al almacenamiento.

## Errores, sesión y accesibilidad

Una selección pendiente se conserva al fallar y debe subirse o quitarse antes
de guardar el contenido. Ante carga incierta aparecen **Consultar carga** y
**Reintentar la misma carga**. Se conservan archivo, metadatos y UUID de operación;
el reintento envía exactamente lo mismo. No se ejecuta automáticamente.

Una respuesta400/413 permite corregir la selección. Una consulta fallida o un
recibo PREPARADO conserva el envío. Si se descarta una carga incierta, se avisa
que el archivo podría existir; no se afirma que se borró. Los huérfanos siguen
en la política operativa pendiente de C5-D.

Durante la petición se bloquean navegación/edición incompatibles y el doble clic.
La sesión usa el mecanismo existente del panel, token solo en memoria. Logout
aborta solicitudes, limpia borradores, invalida respuestas tardías y libera
las URLs Blob de vista previa. No hay token en URLs ni nuevo almacenamiento del navegador.
La vista previa de archivos gestionados obtiene bytes con Bearer y crea un Blob
local. CSP admite imágenes self/blob, no imágenes externas arbitrarias.
Etiquetas vinculadas, descripción de imagen y estado anunciado con role=status.

## Persistencia y permisos del servidor

Nueva migración aditiva `20261020150000_editorial_image_links`: FK/index
`archivoImagenId` en Pregunta, CasoPregunta y Subtema. Los registros anteriores
conservan su enlace y FKnull. No se editaron migraciones previas.

El guardado resuelve la referencia `/recursos/editoriales/:uuid`, bloquea
ArchivoEditorial y exige DISPONIBLE. Asocia imagen y contenido en la misma
transacción editorial, conservando revisión, clasificación y versiones anteriores.
La retirada bloquea el mismo registro antes de consultar usos de los tres modelos.
Una carga/retirada/publicación simultánea no puede confirmar un enlace a RETIRADO.
Las revisiones obsoletas no reemplazan la asociación.

`GET /recursos/editoriales/:id` entrega únicamente WEBP con JWT, correo y guardas
académicas existentes; exige un uso publicado con todos sus padres publicados.
Un archivo recién cargado no es visible allí para estudiantes. Un caso exige
preguntas publicadas bajo padres publicados. No devuelve fuente, licencia, autor
ni recibos. Los endpoints ADMIN mantienen su control de rol.
Este contrato de lectura prepara C5-C; **Flutter todavía no consume esos bytes**.

La edición directa de una pregunta crea otra versión y conserva la FK y respuestas
del registro archivado. Esta conservación no acredita todavía lectura móvil de
imágenes en intentos históricos: definir autorización por contexto y caché en C5-C.
Retener los bytes evita destruir esa posibilidad.

## Validación realizada

- **23/23 pruebas PostgreSQL/HTTP**, cero omitidas:15 de C5-A repetidas y8 de C5-B.
- **69 migraciones** aplicadas solo en PostgreSQL16 desechable propio de Docker.
  Contenedor limitado a512 MiB/una CPU, puerto loopback y datos en tmpfs.
- Cliente JavaScript real `CatalogApi`, login real con bcrypt y cuenta ADMIN
  ficticia; API Nest/Prisma y disco reales. MailService sustituido sin envío de correos.
- Asociación a los tres modelos, recursos retirados/inexistentes, sustitución
  versionada, retirada de archivo usado, retirada después de quitar la asociación,
  revisión obsoleta y tres carreras simultáneas entre publicación y retirada.
- Lectura estudiantil antes/después de publicar y al archivar un padre;
  acceso anónimo/rol, controles ACL/RLS y fallos del almacenamiento.
- **Chromium/Edge headless real**, sin instalar ni descargar navegadores:
  panel servido, login, selección de área/tema/subtema, archivo del equipo,
  metadatos, vista previa, carga y Guardar pregunta/publicación verificada por SQL.
- Vista de escritorio1280 y ancho adaptable390; sin errores JavaScript del recorrido,
  imagen decodificada y sin desborde horizontal del componente. Capturas inspeccionadas.
  Es navegador de escritorio con viewport reducido, **no Android ni iOS físicos**.
- Panel: **124/124 pruebas**, incluidas15 nuevas; sintaxis28 módulos correcta.
- Controles del entorno local: **20/20**, con8 de validación del ejecutor C5.
- Build y regresión completa backend: **126 suites/1.650 pruebas aprobadas**.
  Incluye13 pruebas B nuevas (asociación y protección de retirada), además de70 A.
  ESLint dirigido de módulos afectados y TypeScript sin emisión aprobados.

Ejecutor: desde `SaberPlus-Backend/backend`:

```powershell
npm run test:editorial-files:postgres
```

Reutiliza el ejecutor acotado de C5-A y añade solo la migración B explícita.
Si no hay Chromium instalado, el caso de navegador se omite expresamente y queda
pendiente; en esta ejecución **sí se ejecutó y aprobó** usando Edge ya instalado.
No aceptar URL externa, usar Supabase/Render ni iniciar sesión con cuentas reales.
El contenedor, credenciales y perfil temporal del navegador se eliminaron.
Se conservan solo tres capturas de datos ficticios en la carpeta ignorada
`backend/.tmp/c5b-qa/run-3ZIOGJ`; el ejecutor informa una carpeta nueva al repetir.

## Pendientes que no cierra B

- Flutter: lectura autenticada y resolución de referencias, estados de error,
  cambio de cuenta y uso en estudio/práctica/juegos; imágenes en opciones.
- PDF/offline e imágenes de intentos históricos con autorización contextual.
- Fotos de perfil, evidencias institucionales privadas y sus pantallas/reglas.
- Supabase Storage/proveedor persistente autorizado, cuotas, biblioteca/listado,
  conservación/limpieza y operación. El adaptador sigue solo development/test.
- Prueba humana y compilación en Android cuando C5-C esté preparada; iOS separado.
- Commit/PR, compatibilidad con OV-1, CI remoto y despliegue: no realizados aquí.
