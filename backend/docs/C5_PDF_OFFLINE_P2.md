# C5-PDF P2 — HTTP/PostgreSQL y Android USB

31/oct/2026, continuación de [P1](C5_PDF_OFFLINE_P1.md). Verificación local; no despliegue ni cierre de todo C5. No es el proyecto independiente de cuadernillos.

## Pruebas integradas

Se agregaron tres casos al ejecutor PostgreSQL propio existente, sin crear un ejecutor menos restrictivo ni aceptar bases externas:

1. JWT obligatorio; descarga HTTP 200 con imagen realmente incrustada, MIME PDF, nombre, longitud, `private, no-store` y `nosniff`. Revocación ADMIN real y una nueva exportación denegada 404/JSON, sin respuestas ni XP añadidas.
2. Tema archivado 404; un subtema archivado no entra en el PDF y su imagen tampoco.
3. Runtime editorial apagado 503, sin emitir un PDF incompleto.

`npm run test:editorial-files:postgres`: **95/95 aprobadas**, cero omitidas/fallos, 109,895 s. Las 78 migraciones se aplicaron solo a PostgreSQL16 temporal en Docker, tmpfs, loopback. El runner confirmó `c5-owned-resources-removed`. Incluyó la regresión del panel Chromium/H3. No se suman estos casos a los 92 anteriores como si fueran ejecuciones distintas de funcionalidades nuevas.

El controlador añade los dos encabezados de no caché y tipo seguro. `npx nest build` y ESLint dirigido del controlador aprobados.

## Teléfono físico

API adicional temporal en loopback 43188, AppModule compilado actual, JWT propio y base sintética ya autorizada de la jornada. Directorio temporal, marcador, nonce y etiqueta Docker comprobados antes de usarla. No se cambió la API original ni se usaron cuentas reales. Reverse del teléfono 43187→43188 durante el ensayo; credenciales sintéticas escritas sin imprimirlas y con foco de contraseña verificado.

Fixture nuevo `PDF P2 USB - figuras`: lección con rectángulo azul 400×200, sin preguntas/respuestas fabricadas. Desde SaberPlus Pruebas: Estudiar → Matemáticas → descargar tema → selector Android → Files de Google, solo una vez (sin cambiar predeterminados). El visor mostró encabezado, aviso de copia descargada, imagen 2:1, texto y pie legibles.

Se revocó únicamente la imagen de este fixture por API ADMIN y se comprobó su recibo. La copia existente abrió con el reverse retirado: comportamiento esperado del PDF exportado, no una fuga de la futura caché privada. Se restauró el reverse y se eliminó **solo esa descarga sintética** desde la app (4,1 KB, de una a cero descargas). No se borraron documentos del usuario. Al pedir una copia nueva, la API la denegó.

## Defecto de presentación encontrado y corregido

Con `ResponseType.bytes`, el JSON de error llega como bytes y la traducción genérica mostraba «error inesperado». Flutter ahora usa mensajes públicos por estado solo en las dos descargas PDF: 401 requiere sesión; 403/404/410 no disponible; 503 temporal; red conserva el mensaje existente. No decodifica ni publica razones internas.

Hot reload aplicado. Android repitió la descarga denegada y mostró «Este PDF no está disponible. Consulta el contenido vigente en la app.». Sin errores nuevos en DTD. Regresión Flutter dirigida **14/14**, análisis de cinco archivos sin incidencias; incluye que un intento fallido de reemplazo conserva archivo y metadatos previos.

Ver [acta Flutter y capturas](<../../../SaberPLus/saber_plus/docs/C5_PDF_OFFLINE_P2.md>). El estado final de APK/servicios se registra allí; no se presume por iniciar el build.

## Límites

P2 acredita este alcance local HTTP/Android, no validación humana independiente, exhaustividad visual de todo el catálogo, almacenamiento productivo ni todas las variantes de dispositivo. La revisión final del baseline H3 conservó XP 0, cinco respuestas, diez referencias históricas y cero filas CuadernoError.

Sigue P3: contrato/manifiesto y caché privada separada por cuenta con revalidación al reconectar. No convertir el PDF descargado en esa caché ni prometer revocación remota de copias impresas. Proveedor persistente, fotos/evidencias, retención/huérfanos y C5-D siguen abiertos.
