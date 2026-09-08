# D2-F — Eliminación de borradores vacíos

Ajuste solicitado durante la revisión del panel. Implementado localmente;
no desplegado en Render, sin migraciones ni operaciones sobre Supabase.

## Alcance

- Solo ADMIN mediante `DELETE /admin/editor/temas/:id` o
  `DELETE /admin/editor/subtemas/:id`.
- Cuerpo JSON: `revision` (SHA-256 del detalle actual) y `confirmado: true`.
  Cadenas como `"true"` no se aceptan, incluso con conversión implícita de DTO.
- El detalle GET existente añade `eliminable` y `motivoEliminacion`.
- Solo BORRADOR, nunca publicado, con clasificación específica.
- Un tema debe estar sin subtemas, incluidos archivados.
- Un subtema debe estar sin preguntas (de cualquier estado), progreso,
  actividades de plan, texto, video, imagen ni datos/tipo interactivo.
  Su tema no puede estar archivado. Incluso texto de espacios cuenta como contenido.
- No elimina preguntas, casos, recursos externos ni dependientes en cascada.
  Para contenido usado/publicado se conserva el camino de Archivar.

La eliminación es definitiva; no es una papelera. No hay restauración ni
historial editorial persistente en esta entrega: siguen en C6. No borrar una
lección para eludir una protección de uso. El servicio verifica sus propias reglas
aunque se invoque sin el panel.

## Concurrencia y respuesta

La transacción toma el bloqueo editorial por área, el bloqueo de ámbito del
catálogo y `FOR UPDATE` del tema, seguido del subtema cuando corresponde.
Relee el registro y todos sus contadores antes de comprobar la revisión y
eliminar. Los bloqueos de fila impiden insertar nuevas referencias FK durante
la comprobación. Las rutas antiguas retiradas siguen devolviendo 410.

Responde `{ id, tipo, area, temaId, eliminado: true }`. Falta de confirmación
o registro no elegible: 400; revisión cambiada: 409; registro ausente: 404.
El cliente verifica el comprobante, no reintenta y bloquea otro envío tras
un error hasta recargar/consultar. Una respuesta perdida no permite inferir
que el registro siga existiendo.

Esta operación usa la autorización ADMIN de edición de borradores; no depende
de la bandera de publicación. No se activan banderas reales ni se autoriza
operar un entorno externo por ejecutar estas pruebas.

## Probar en demo

Reiniciar `npm run demo` desde `admin/` carga las nuevas rutas de demostración.
**El reinicio descarta los datos temporales anteriores**: conservar antes cualquier
texto propio que se quiera reutilizar. Después, Ctrl+F5 en el navegador.

1. Crear un tema de prueba; abrir su editor de nombre.
2. Pulsar **Eliminar borrador vacío**. Cancelar primero: debe seguir existiendo.
3. Confirmar con nombre/ID/clasificación visibles: vuelve al catálogo actualizado.
4. Crear otro tema con un subtema: el tema queda bloqueado y explica el motivo.
5. Eliminar primero el subtema vacío, después el tema.
6. Agregar texto, preguntas o CLOZE a otro subtema: no se permite eliminarlo.
7. Cambios locales sin guardar bloquean Eliminar hasta guardar o descartar.

La demo usa memoria, no Supabase. Para API real primero desplegar el backend
actualizado con autorización. Ante un servidor anterior, Eliminar queda desactivado
si no devuelve `eliminable: true`; no se recurre a las rutas antiguas.

## Verificación

Resultado local de este ajuste: **61 pruebas del panel, 623 del backend y
12 de PostgreSQL temporal aprobadas**. Comprobación TypeScript y sintaxis del
panel correctas. La instancia temporal se detuvo y eliminó al terminar.

- Pruebas backend: elegibilidad, confirmación estricta, revisión y relectura.
- Pruebas panel: CRUD HTTP demo, protección de hijos/contenido, permisos,
  comprobante incorrecto, pérdida de respuesta, cancelación, doble envío y sesión.
- PostgreSQL temporal: borrado real de fixtures vacíos, protección de hermanos,
  eliminación simultánea y creación concurrente de un hijo antes de la relectura.
- No sustituye revisión visual/accesible ni ensayo D3 en entorno real.
