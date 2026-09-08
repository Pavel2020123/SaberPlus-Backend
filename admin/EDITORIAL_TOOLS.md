# 7F-C3-D2-E — Formularios CLOZE y revisión del banco antiguo

Implementación local: 8 de septiembre de 2026. Panel y demo; sin migraciones,
despliegue, escritura en Supabase ni activación de banderas reales. Las rutas
utilizadas son las API ADMIN D2-B/C/D, no los escritores heredados retirados.
No se modifica la web antigua Icfes_Vida ni el código de la aplicación Flutter.

## Abrir y probar

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\admin"
npm run demo
```

Abrir `http://127.0.0.1:4173` y pulsar **Explorar demostración**. Detener con
Ctrl+C. No utiliza credenciales reales. Reiniciar el servidor descarta la demo.
Si ese puerto ya está ocupado, detener tu demo anterior o elegir `ADMIN_PORT`;
no cerrar procesos ajenos. Los servidores de las pruebas usan puertos temporales.

### Completar espacios

1. Matemáticas → Proporcionalidad → Porcentajes → **Completar espacios (CLOZE)**.
2. Enunciado: `El 10 % de 200 es ___.` Primer espacio: opciones `20` y `10`,
   correcta «Opción 1». No tienes que escribir JSON ni índices manualmente.
3. Guardar CLOZE en borrador. Recargar y comprobar enunciado, opciones y correcta.
4. Añadir/quitar espacios u opciones: se mantienen las demás opciones y la clave
   correspondiente. Si se quita la correcta, hay que elegirla de nuevo. Los
   marcadores del texto no se alteran automáticamente: revisa su orden.
5. «Revisar publicación de CLOZE» exige guardar primero; la revisión muestra
   texto, opciones y claves. Publicación solo en demo mientras el gate real esté apagado.
6. «Retirar ejercicio guardado» pide confirmación, limpia únicamente el ejercicio
   y conserva prosa/recursos. Descarta también cambios CLOZE locales tras confirmar.
   No hay recuperación automática: copiarlo antes si quieres conservarlo.

La ruta general de prosa sigue siendo de solo lectura mientras exista CLOZE:
conserva una copia del ejercicio, retíralo, vuelve a la lección, edita y vuelve a
añadirlo. El panel lo explica; no automatiza operaciones destructivas intermedias.
Publicado, en revisión, archivado, con uso o sin clasificación específica se
mantiene protegido por backend. CLOZE es autocorrección; no una nota diagnóstica.
Los límites y formato completos están en [contrato CLOZE](../backend/EDITORIAL_CLOZE.md).

### Lotes y coincidencias

1. Con Matemáticas seleccionada, pulsar **Revisar banco antiguo**.
2. «Consultar lote» muestra los IDs, estados, coincidencias y pendientes. Tamaño
   configurable de 1 a 100; por defecto 25. Consultar no escribe.
3. La demo trae dos preguntas equivalentes propias en **Banco General**:
   `demo-legacy-q1` (borrador) y `demo-legacy-q2` (archivada). No tienen huella inicial.
4. Confirmar solo el lote revisado. No hay botón «indexar todo» ni bucle automático.
   Consultar de nuevo para el siguiente lote; una confirmación consumida no se reutiliza.
5. Consultar duplicados desde el inicio. Abrir un grupo para ver las preguntas.
   Los grupos se paginan de 10 en 10 y las coincidencias de 25 en 25, únicamente
   con el cursor devuelto por el servidor. Reiniciar informes después de cambios.

Esto no es detección semántica/OCR, no verifica derechos ni calidad y **no elimina,
fusiona, archiva o publica duplicados**. Otras coincidencias pueden aparecer al
indexar lotes posteriores. La demo mantiene todo en memoria; no simula SQL,
microsegundos de PostgreSQL ni bloqueo transaccional real.
[Contrato y operación autorizada](../backend/EDITORIAL_LEGACY_INDEX.md).

### Reclasificación

1. Seleccionar una coincidencia o, desde una pregunta abierta, pulsar
   **Revisar clasificación**. También se puede copiar su ID en el formulario.
2. Cargar temas de destino, elegir **Proporcionalidad** y después **Porcentajes**.
   Ambos selectores paginan de 20 en 20 dentro del área actual. Los destinos
   archivados/genéricos no se ofrecen como seleccionables.
3. Revisar reclasificación: comparar origen y destino, enunciado, opciones,
   correcta, explicación, caso y referencias. Las imágenes no se descargan.
4. Confirmar el destino revisado. Se muestra un comprobante con IDs y estado.
   La pregunta archivada permanece archivada. No publica ni edita el contenido.
5. Actualizar el catálogo antes de continuar. El comprobante no sustituye el
   historial persistente ni permite restaurar; eso pertenece a C6.

Cambiar pregunta, tema o subtema invalida la revisión anterior. Preguntas usadas
o publicadas no se mueven: el backend comprueba relaciones e intentos históricos.
La demo solo puede simular uso; no certifica las comprobaciones contra PostgreSQL.
[Contrato de reclasificación](../backend/EDITORIAL_RECLASSIFICATION.md).

## Seguridad y fallos

- Conserva acceso ADMIN y token en memoria del cliente existente. Cierre de
  sesión limpia la herramienta y descarta respuestas tardías. No usa almacenamiento
  persistente del navegador ni guarda claves de base de datos.
- Solo texto mediante nodos DOM; no ejecuta HTML ni descarga recursos externos
  para construir la vista previa. Etiquetas en los campos y controles de teclado
  nativos; falta revisión manual visual/accesible en navegador real.
- Operación en curso bloquea controles para evitar doble envío. Conflictos o
  pérdida de respuesta conservan el borrador CLOZE y obligan a revisar de nuevo
  lote/destino antes de repetir esas escrituras. Nunca reintenta automáticamente.
- Botones de indexación/reclasificación respetan `habilitado` y bloqueos devueltos.
  Las tres banderas reales siguen apagadas: `EDITORIAL_LEGACY_INDEX_ENABLED`,
  `EDITORIAL_RECLASSIFICATION_ENABLED`, `EDITORIAL_PUBLICATION_ENABLED`.
  Un 503 no se evade. El panel no modifica banderas ni usuarios.
- Guardar borradores CLOZE usa la política ADMIN existente, no la bandera de
  publicación. Conectar a una API real sigue requiriendo preparar/autorizar el
  ambiente según el README; no es lo mismo que explorar la demo.

## Verificación y siguiente paso

`npm run check` y `npm test` desde `admin/`: **54 pruebas aprobadas**. Incluyen
recorridos HTTP demo y lógica DOM: CRUD CLOZE, conflictos, retiro, cursores,
selección/confirmación de destino, gates, fallos, cierre de sesión y navegación
catálogo → CLOZE → lección. Son pruebas de lógica, no una validación de diseño.
La habilidad de navegador no encontró navegadores disponibles; **no hubo prueba
visual en esta entrega**. No se sustituyó por una captura ni se afirmó haberla hecho.

**D2-E implementada localmente; D2 no está cerrada.** Sigue D2-F: preparar y
ejecutar pruebas de consultas, bloqueos, rollback y concurrencia en una base
PostgreSQL de ensayo explícitamente autorizada, y completar revisión visual.
Después, operación autorizada del legado y D3 (ensayo editorial real con ADMIN).
No usar automáticamente Supabase de trabajo para las pruebas.
