# Panel editorial de SaberPlus — 7F-C3-B

Primera entrega funcional: acceso ADMIN, navegación por las cinco áreas ICFES,
catálogo paginado, estados editoriales y creación de temas/subtemas en borrador.
No publica, archiva, elimina ni reclasifica contenido desde esta interfaz todavía.
Ahora incluye editor de lecciones en borrador, vista previa del texto y corrección
protegida de nombres. Preguntas/casos siguen en C3-C; carga de archivos en C5.
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

1. Usar un backend que incluya 7F-C3-B y una cuenta editorial ADMIN existente.
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
Última ejecución: 23 pruebas aprobadas y comprobación de sintaxis correcta.
Cubren permisos de acceso del cliente, duplicados, paginación, aislamiento,
expiración, respuestas tardías, errores de formato, archivos servidos y cabeceras.
También cubren el editor con dobles DOM: guardado, conflictos, texto pendiente,
solo lectura y respuestas tardías. No validan JWT real, CORS en navegador,
disposición visual ni accesibilidad completa. Queda
pendiente la prueba manual visual tanto en escritorio como en pantalla estrecha.
El flujo CI incorpora un trabajo separado del backend para estas comprobaciones.

## Siguientes partes de 7F-C3

- **C3-B implementada:** editor de lecciones por subtema, vista previa segura y ajustes de nombres.
- **C3-C:** editor de preguntas y casos, opciones, explicaciones, clasificación e imágenes referenciadas.
- **C3-D:** revisión/publicación desde el panel, manejo del legado y prueba editorial de extremo a extremo.

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

