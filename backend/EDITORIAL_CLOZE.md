# 7F-C3-D2-D — Edición y revisión especializada de CLOZE

Implementación local: 7 de septiembre de 2026. API ADMIN, sin pantalla nueva
en el panel, migración, despliegue ni operación sobre Supabase. D2 sigue abierta.
El siguiente paso de interfaz es **D2-E: herramientas editoriales en el panel**
(CLOZE, indexación y reclasificación), con pruebas de interacción/demo. Después
quedan concurrencia PostgreSQL, operación autorizada y el ensayo real D3.

## Contrato compatible con Flutter

```json
{
  "textoConEspacios": "Dos más dos es ___ y tres más tres es ___.",
  "espacios": [
    { "opciones": ["4", "5"], "correctaIndex": 0 },
    { "opciones": ["5", "6"], "correctaIndex": 1 }
  ]
}
```

- Texto obligatorio de hasta 12000 caracteres; 1–20 espacios.
- Exactamente un marcador `___` por espacio, de izquierda a derecha. Cuatro o
  más guiones bajos seguidos no son marcadores válidos.
- Cada espacio tiene 2–6 opciones de texto, de hasta 500 caracteres cada una,
  y un índice correcto entero basado en cero. No se convierten cadenas ni booleanos.
- Opciones no vacías ni repetidas tras normalización Unicode NFKC, mayúsculas
  y espacios. Se conservan tildes, orden e índices; solo se recortan bordes.
- Se rechazan campos desconocidos, caracteres de control (salvo tabulación y
  saltos de línea) y caracteres invisibles de formato. No se descartan opciones
  o espacios inválidos silenciosamente ni se adivinan respuestas.
- Es texto, no HTML ejecutable. No hay archivos, imágenes en opciones ni audio.

Flutter ya consume `tipoInteractivo: "CLOZE"` y `datosInteractivo` con este formato.
El ejercicio es **autocorrección**: la aplicación recibe las respuestas correctas.
No sirve como calificación autoritativa, prueba diagnóstica ni evidencia de dominio.
No se endureció el parser de contenido antiguo en Flutter ni se reescribieron
datos existentes; estas reglas se aplican al nuevo editor y a revisión/publicación.

## API (solo ADMIN editorial)

```text
GET   /admin/editor/subtemas/:id/cloze
PATCH /admin/editor/subtemas/:id/cloze
PATCH /admin/editor/subtemas/:id/cloze/retirar
```

GET devuelve la revisión SHA-256 actual, `editable`, `motivo`, tipo,
`datosInteractivo` validado o null y `errores`. No expone progreso ni alumnos.
Un JSON heredado inválido se señala; no se envía como ejercicio válido.

Guardar recibe `{ "revision": "<hash del GET>", "datosInteractivo": <contrato> }`.
Retirar recibe `{ "revision": "<hash del GET>", "confirmado": true }`.
La confirmación debe ser el booleano JSON true, nunca texto o un número.
La respuesta contiene el detalle y la revisión posterior dentro de la transacción.

Solo se permite crear, sustituir o retirar el ejercicio de un subtema BORRADOR,
nunca publicado, sin progreso ni actividades de plan, con clasificación específica
y tema padre no archivado. Otros tipos de interactivo se rechazan. Un CLOZE roto
o datos sin tipo se pueden reemplazar/retirar únicamente si se cumplen estas reglas.
Tener preguntas asociadas no impide redactar el ejercicio; sí impide renombrar
ese subtema en el editor de nombres. No se cambia de área, tema o subtema.

Guardar solo escribe tipo y JSON. Retirar solo limpia esos dos campos (SQL NULL),
conservando texto, imágenes, video, clasificación y estado. No hay historial ni
restauración automática: copiar el ejercicio antes de retirarlo si se quiere guardar.
Por ahora la ruta general de prosa mantiene los interactivos en solo lectura:
para cambiar la prosa de un borrador con CLOZE, conservar el ejercicio, retirarlo
explícitamente, editar la prosa y volver a añadirlo con revisiones frescas. La futura
interfaz debe guiar este flujo sin pérdida silenciosa de datos.

## Concurrencia y publicación

Se comparte la revisión con el editor de prosa y los bloqueos: área → catálogo
del tema → fila Tema → fila Subtema. Se relee después del bloqueo. Una edición
simultánea del padre, texto, JSON, estado o uso incluido en el snapshot produce
409; no hay reintento automático. Las pruebas usan persistencia simulada: falta
probar consultas/concurrencia en PostgreSQL, y SQL externo no sigue este protocolo.

La revisión editorial usa exactamente el mismo validador para nuevo y legado.
Muestra enunciado, opciones y clave por espacio; bloquea publicar JSON inválido,
tipos no admitidos, datos huérfanos o un padre no publicado. Una nueva clave
invalida la revisión anterior. Revisar no guarda ni publica.

`EDITORIAL_PUBLICATION_ENABLED` sigue apagada; no se activa en esta entrega.
El guardado de borradores no usa esa bandera, como el editor de lecciones existente.
La ruta heredada `/admin/subtemas/:id/interactivo` continúa respondiendo 410;
no se reabre ni se ofrece como alternativa. Contenido utilizado exige versiones C6.

## Verificar sin base real

Resultado local: 202 pruebas focalizadas y suite completa de 605 pruebas en
63 suites aprobadas con detección de recursos abiertos. Compilación y lint
focalizado correctos. Flutter: 4 pruebas de modelos/compatibilidad aprobadas.

Desde `backend/`:

```powershell
npm test -- --runInBand cloze-activity lesson-editor editorial-review legacy-editorial-write
npm test -- --runInBand --detectOpenHandles
npm run build
```

En Flutter: `flutter test --no-pub test/study_models_test.dart`.
Cubren formato, límites, índices sin coerción, confirmación estricta con la
ValidationPipe de producción, retiro explícito, protección de uso/publicación,
revisiones obsoletas, guard ADMIN heredado del controlador y bloqueo de la ruta
antigua. No equivalen a validación visual ni a un despliegue real.
