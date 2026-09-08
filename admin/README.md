# Panel editorial de SaberPlus — 7F-C3-D2-D

D2-D incorpora edición/retiro y revisión de CLOZE en la API ADMIN. Conserva
el formato Flutter y bloquea ejercicios inválidos al publicar. No hay pantalla
nueva ni operación en Supabase. [Contrato CLOZE](../backend/EDITORIAL_CLOZE.md).
Sigue **D2-E: integrar en este panel CLOZE y las herramientas de legado**;
después quedan pruebas PostgreSQL y ensayo real. Publicación sigue apagada.

D2-C agrega una API ADMIN de reclasificación con destino/revisión/confirmación
y bloqueo de preguntas con uso registrado. No hay pantalla nueva ni cambios
automáticos en la base. [Contrato y activación pendiente](../backend/EDITORIAL_RECLASSIFICATION.md).

D2-B incorpora una API ADMIN de indexación por lotes y reportes del legado,
sin cambios visuales en este panel. No se ha ejecutado contra la base real.
[Procedimiento y bandera independiente](../backend/EDITORIAL_LEGACY_INDEX.md).

El backend retira las escrituras antiguas con HTTP 410 y concentra las activas
en los servicios del editor con bloqueo común por área. El panel ya usa esas
rutas; no hay cambio visual. [Compatibilidad y pendientes de D2](../backend/EDITORIAL_LEGACY_RETIREMENT.md).

Primera entrega funcional: acceso ADMIN, navegación por las cinco áreas ICFES,
catálogo paginado, estados editoriales y creación de temas/subtemas en borrador.
Incluye revisión y cambios de estado en la demo. Las nuevas escrituras reales
están desactivadas por defecto hasta completar D2 y preparar el ensayo D3.
No elimina ni reclasifica contenido desde esta interfaz todavía.
Ahora incluye lecciones, preguntas y casos en borrador, vista previa del texto,
corrección protegida de nombres y control de preguntas repetidas. El cierre
editorial real sigue en C3-D2/D3; carga de archivos en C5.
El panel usa la API NestJS, nunca tablas ni credenciales de Supabase.

## Probar sin cuenta ni base de datos

Requiere Node 24. No necesita `npm install`: utiliza HTML, CSS y módulos JavaScript
nativos, con servidor HTTP y pruebas integrados en Node. No hay librerías remotas,
CDN, cookies ni telemetría. Los archivos se sirven directamente, sin compilación.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\admin"
npm run demo
```

Abrir `http://127.0.0.1:4173` y pulsar **Explorar demostración**. Elegir Matemáticas,
seleccionar Proporcionalidad y consultar sus subtemas. Crear un tema/subtema y
repetir el nombre para verificar el aviso de duplicado. Cambiar entre áreas,
probar el teclado, cerrar sesión y recargar la página.

Para probar C3-B: abre **Matemáticas > Proporcionalidad > Porcentajes**. Escribe
una lección con títulos `#` y viñetas `-`, guarda y vuelve a abrirla. Prueba el
aviso de cambios sin guardar al cambiar de tema. **Regla de tres directa** es un
ejemplo publicado, de solo lectura. Selecciona **Álgebra** y pulsa **Corregir
nombre del tema seleccionado**: puede renombrarse mientras siga vacío.

La demo muestra avisos visibles, usa datos en memoria y escucha solo en loopback.
No carga `.env.local` mediante su comando, no conecta a la API real y no acepta
credenciales reales. Reiniciar el servidor descarta sus cambios. No es un sistema
de autenticación de producción ni una réplica completa del backend editorial.
El puerto puede cambiarse con `ADMIN_PORT` si 4173 está ocupado.

## Conectar con el backend real

1. Usar un backend que incluya 7F-C3-C y una cuenta editorial ADMIN existente.
   No sirven cuentas de profesor ni administradores de institución. No se crea
   ni promueve automáticamente ningún usuario. Si no tienes cuenta ADMIN, hay
   que preparar ese acceso de forma autorizada antes de probar el flujo real.
2. Copiar `.env.example` a `.env.local` dentro de **admin**, sin sobrescribir un
   archivo propio existente. No copiar el `.env` del backend ni claves de base.
3. Configurar `API_BASE_URL` con un origen sin ruta, por ejemplo:

   ```dotenv
   ADMIN_PORT=4173
   ADMIN_HOST=127.0.0.1
   API_BASE_URL=https://saberplus-api-staging.onrender.com
   ```

4. En el backend, añadir el origen exacto del panel a `ALLOWED_ORIGINS`, separado
   por coma y conservando los orígenes existentes. Para la dirección indicada:
   `http://127.0.0.1:4173`. `http://localhost:4173` es otro origen: añadirlo solo si
   vas a abrir el panel con ese nombre. No usar `*` ni modificar Supabase para CORS.
5. Ejecutar `npm start` en **admin**. El formulario mostrará el servidor de acceso.
   Usa solo una cuenta editorial autorizada; crear un borrador aquí sí escribe
   en la base del backend configurado. No se publicará automáticamente en Flutter.

Un 404 del catálogo puede indicar que falta desplegar las rutas. Un fallo CORS
no se corrige pegando tokens o contraseñas en la URL. El servidor admite HTTPS
para API remota y HTTP solamente en loopback; rechaza credenciales en la URL.

El servidor es un punto de partida local, no un despliegue público ya aprobado.
Para publicarlo se necesitarán alojamiento HTTPS, dominio, CORS definitivo,
revisión de seguridad y prueba con sesión real. No se ha modificado Render.

## Seguridad y comportamiento

- `POST /auth/login` seguido de `GET /auth/perfil`; se exige ADMIN confirmado
  por el servidor y contraseña sin cambio inicial pendiente. El backend vuelve
  a comprobar el rol en cada ruta `/admin` mediante `AdminGuard`.
- JWT solo en memoria. No se guarda en localStorage, sessionStorage, cookies,
  URL ni HTML. Recargar o salir de la pestaña descarta la sesión. Cerrar sesión
  cancela solicitudes locales; no revoca en servidor un JWT ya emitido. La
  revocación centralizada sigue en la etapa de seguridad de sesiones.
- Ningún token/clave real está incluido en los archivos. La configuración que
  recibe el navegador contiene únicamente origen API y bandera de demo.
- Contenido remoto insertado como texto, sin `innerHTML`; CSP restrictiva,
  `no-store`, protección contra framing y lista cerrada de archivos servibles.
- No hay reintentos automáticos de escrituras. Si se pierde la confirmación,
  el aviso pide consultar el catálogo antes de reenviar: el borrador podría
  haberse guardado. Nombres repetidos son rechazados por el backend con 409.
- Páginas de 20 registros, sin cargar miles de preguntas. Se distingue error
  de consulta de catálogo vacío. Las respuestas tardías no deben sustituir una
  selección más reciente ni revivir una sesión cerrada.
- Los conteos incluyen todos los estados; no representan solo contenido publicado.
  Los temas archivados o genéricos no permiten crear subtemas desde el formulario.
- El backend sigue siendo autoridad para validación, permisos y ciclo editorial.

## Verificación

```powershell
npm run check
npm test
```

Las pruebas usan el servidor demo local y respuestas simuladas del cliente.
Última ejecución: 37 pruebas aprobadas y comprobación de sintaxis correcta.
Cubren permisos de acceso del cliente, duplicados, paginación, aislamiento,
expiración, respuestas tardías, errores de formato, archivos servidos y cabeceras.
También cubren el editor con dobles DOM: guardado, conflictos, texto pendiente,
solo lectura y respuestas tardías. No validan JWT real, CORS en navegador,
disposición visual ni accesibilidad completa. Queda
pendiente la prueba manual visual tanto en escritorio como en pantalla estrecha.
El flujo CI incorpora un trabajo separado del backend para estas comprobaciones.

## Siguientes partes de 7F-C3

- **C3-B implementada:** editor de lecciones por subtema, vista previa segura y ajustes de nombres.
- **C3-C implementada:** editor de preguntas y casos, opciones de texto, explicaciones, clasificación e imágenes referenciadas en enunciado/caso.
- **C3-D1 implementada:** revisión y estados con confirmación; recorrido completo
  en demo y nuevas escrituras reales apagadas por defecto.
- **C3-D2 pendiente:** legado, unificación de rutas, revisión especializada de
  interactivos y prueba de concurrencia PostgreSQL.
- **C3-D3 pendiente:** despliegue y ensayo editorial con ADMIN y base reales.

Los recursos persistentes de Supabase Storage siguen en 7F-C5 y la auditoría
completa/versiones en 7F-C6. Esta entrega no modifica contenido académico real,
no crea cuentas, no aplica migraciones y no necesita nuevos audios.

## Contrato y límites de C3-B

- Rutas nuevas con `AdminGuard`: `GET /admin/editor/temas/:id`,
  `GET /admin/editor/subtemas/:id`, `PATCH /admin/editor/temas/:id/nombre`,
  `PATCH /admin/editor/subtemas/:id/nombre` y
  `PATCH /admin/editor/subtemas/:id/leccion`.
- Cada escritura exige la `revision` SHA-256 del detalle leído. El servidor
  bloquea padre/subtema, relee y compara antes de guardar. Un 409 conserva el
  texto local; copiarlo antes de recargar. Es control de concurrencia, no historial.
- Lecciones: solo BORRADOR, nunca publicadas, con clasificación específica,
  sin progreso ni actividades de plan y sin formato interactivo CLOZE. Se
  permiten preguntas asociadas, pero entonces no se puede renombrar el subtema.
- Temas: renombrables solo en borrador, nunca publicados y sin subtemas.
  No se cambian áreas ni relaciones. Duplicados se detectan dentro del mismo
  ámbito, incluyendo archivados; se comparten bloqueos con la creación.
- Texto de hasta 30000 caracteres. Referencias opcionales HTTPS de hasta 2000
  caracteres, sin credenciales. Se guardan referencias, no se descargan archivos.
  Dejar el campo vacío elimina la referencia del borrador. No se incorporan
  recursos privados que necesiten cabeceras de autorización.
- Vista previa simplificada de texto: títulos y viñetas. Otros formatos Markdown
  se muestran literalmente; no pretende reproducir exactamente Flutter. HTML
  permanece texto. Las imágenes/videos solo ofrecen un enlace explícito en otra
  pestaña, sin carga automática ni iframe. Storage/metadatos/accesibilidad en C5.
- Estas restricciones son de las **rutas nuevas del editor**. Las rutas heredadas
  `/admin/subtemas/:id/contenido` e `/interactivo` conservan su contrato anterior;
  no deben usarse simultáneamente para editar el mismo contenido. Unificación y
  prueba editorial completa pendientes en C3-D; versiones/restauración en C6.
- No hay autoguardado ni borradores en almacenamiento del navegador. Al cerrar
  sesión se limpia el editor; recargar pierde los cambios no guardados. El aviso
  de salida del navegador es una ayuda, no una garantía de recuperación.

No hacen falta nuevas migraciones para este editor. La API real debe desplegar
estas rutas antes de probarlo con una cuenta ADMIN. No se desplegó en esta entrega.

## Preguntas y casos: 7F-C3-C

Recorrido demo:

1. Selecciona Matemáticas y pulsa **Casos del área**. Ya hay un ejemplo de
   papelería. Puedes crear otro caso con título, contexto y URL HTTPS opcional.
2. Cierra esa sección. Abre Proporcionalidad > Porcentajes, pulsa **Preguntas de
   este subtema** y luego **Crear nuevo borrador**.
3. Escribe enunciado, 2–6 opciones distintas, marca una correcta y completa la
   explicación general. Las explicaciones de cada opción son opcionales.
4. Elige dificultad y, si corresponde, caso y orden libre dentro de él. Los casos
   se consultan de 20 en 20; no hace falta cargar miles de registros en un selector.
5. Guarda, vuelve a abrir la pregunta y prueba cambiar su explicación. Intenta
   crear otra copia con opciones reordenadas: el servidor debe rechazarla.
6. Para ver los conteos actualizados del catálogo, usa **Actualizar catálogo**.

Rutas nuevas con AdminGuard:

- `GET/POST /admin/editor/preguntas`; GET pagina por `subtemaId`.
- `GET/PATCH /admin/editor/preguntas/:id`.
- `GET/POST /admin/editor/casos`; GET pagina por `area`.
- `GET/PATCH /admin/editor/casos/:id`.

Las listas usan `pagina` y `limite`, con máximo 100 por petición y 20 en la UI.
No contienen respuestas correctas; el detalle privado ADMIN sí las incluye.
Cada PATCH exige `revision` del detalle actual; no se permite mover preguntas de
subtema ni casos de área. Todo se crea en BORRADOR, nunca se publica por guardar.

Reglas:

- Preguntas editables únicamente en borrador, nunca publicadas, con clasificación
  válida y sin ninguna relación de uso académico: historial, cuaderno, partidas,
  respuestas de juegos, etc. Las opciones propias no cuentan como uso. Solo en
  ese estado se reemplazan opciones; no se modifican respuestas históricas.
- Casos editables solo en borrador, nunca publicados y sin preguntas asociadas.
  Casos publicados pueden asociarse a nuevas preguntas, pero no editarse aquí.
  Caso y pregunta deben compartir área; no se admiten casos archivados.
- El orden del caso es explícito (1–10000) y debe estar libre, incluso si las
  otras preguntas pertenecen a diferentes subtemas. Para una pregunta independiente
  no se envía orden. El caso es un contexto compartido; la clasificación sigue
  perteneciendo a cada pregunta.
- Límites: enunciado/explicación general 12000 caracteres cada uno, opciones y sus
  explicaciones 4000, título de caso 200, contexto 20000, referencia HTTPS 2000.
  También aplica el límite global de tamaño JSON del backend.
- Las opciones son de texto: el esquema Respuesta todavía no tiene imagenUrl.
  Imágenes dentro de opciones requieren ampliar modelo, contrato y Flutter en C5.
  Por ahora se referencian imágenes en el enunciado o caso; no se suben archivos.
- Duplicados: se reutiliza la huella v1 (área, enunciado, referencia de imagen y
  opciones normalizados; el orden de opciones no importa). Se revisan todos los
  estados, incluso archivados, y se muestra el ID coincidente. No es detección
  semántica/OCR; cambiar una URL puede cambiar la huella y el contexto del caso
  no forma parte de esa huella. Coincidencias deben revisarse, no evadirse.
- Se comparan hasta 2000 candidatos, incluyendo preguntas heredadas sin huella.
  Si hay más, se bloquea el guardado con aviso de indexación pendiente. No se
  acepta contenido con una comprobación incompleta. El backfill del legado queda
  en C3-D, antes del ensayo con un banco real grande.
- Las escrituras de estas rutas comparten bloqueo por área y bloqueos de filas
  para proteger revisiones, duplicados y orden. Esto **no** es una restricción
  única de base: las rutas administrativas heredadas aún no usan ese mismo
  protocolo. No alternar ambas vías; unificación en C3-D antes de habilitar
  edición concurrente real. No se crean migraciones en esta entrega.

Las pruebas del panel incluyen demo HTTP y dobles DOM; las del backend verifican
reglas mediante Prisma simulado. No sustituyen una prueba de concurrencia con
PostgreSQL, JWT real, CORS ni navegación visual. Estas comprobaciones y el
despliegue están pendientes; no se tocó Render/Supabase ni se requieren audios.

## Revisión y publicación: C3-D1

Desde una lección/tema o una pregunta/caso guardado, pulsa **Revisar estado y
publicación**. Si hay texto pendiente, el panel pide guardarlo primero: la
revisión siempre muestra el registro guardado y su versión, no el formulario local.

El recorrido es BORRADOR → EN_REVISION → PUBLICADO. Desde revisión se puede
volver a borrador. Archivar no elimina datos ni archiva dependientes en cascada;
primero hay que archivar los dependientes publicados. Un registro archivado puede
volver a borrador, pero conserva su fecha de publicación y las restricciones de
edición por uso académico. No es una restauración de versiones.

En demo, publica primero el tema, después el subtema, el caso si corresponde y
finalmente la pregunta. Comprueba que una pregunta sin explicación o con padre
sin publicar no ofrece Publicar. Las advertencias de derechos, disponibilidad
de recursos y exactitud requieren revisión humana, no las verifica un algoritmo.

Contrato ADMIN nuevo:

- `GET /admin/editor/revision/:tipo/:id`, tipos `temas`, `subtemas`, `preguntas`, `casos`.
- `PATCH` a la misma ruta con `revision`, `destino` y `confirmado: true`.
- Devuelve estado, revisión SHA-256, contenido, bloqueos, advertencias y destinos.
- La escritura relee bajo bloqueo por área y filas, vuelve a validar dependencias,
  duplicados y orden. La huella de pregunta se recalcula al publicar.
- Los candidatos heredados se acotan a 2000. Interactivos CLOZE requieren la
  revisión especializada pendiente en D2; esta entrega no los publica por esta vía.
- Los recursos se muestran como texto sin cargarlos; no se verifican licencias,
  enlaces disponibles ni el comportamiento final de Flutter.

**Bloqueo de lanzamiento:** `EDITORIAL_PUBLICATION_ENABLED` debe permanecer
ausente o `false` en entornos reales. GET funciona; PATCH devuelve 503 y la UI
desactiva acciones. No activar hasta C3-D2 y el ensayo autorizado C3-D3. La
plantilla `.env.example` documenta el valor, pero no se modificaron secretos,
Render ni Supabase. Esta bandera afecta las rutas nuevas; desde D2-A las
escrituras heredadas se retiran por separado y devuelven 410 incluso con la
bandera activa. D2 sigue incompleta: legado, CLOZE y concurrencia real pendientes.

Verificación de D1: 37 pruebas del panel (HTTP demo y dobles DOM); 359 pruebas en 57
suites del backend; compilación y lint focalizado correctos. El ensayo demo
recorre creación, revisión, publicación y archivo jerárquicos. Sigue pendiente
la prueba real en navegador/PostgreSQL/Flutter. No hubo migraciones ni publicación real.

