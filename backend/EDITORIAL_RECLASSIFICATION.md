# 7F-C3-D2-C — Reclasificación de preguntas sin uso registrado

Implementación local: 7 de septiembre de 2026. API ADMIN, sin pantalla nueva en
el panel y **sin ejecución sobre Supabase ni despliegue automático**. No requiere
migración ni modifica los cambios pendientes de Guardián.

## Por qué no se mueve cualquier pregunta

Los resultados por tema/subtema y la evidencia de diagnóstico consultan la
clasificación actual de la pregunta. Mover una pregunta respondida podría cambiar
la interpretación de resultados anteriores aunque no se editara ninguna respuesta.

Por eso este flujo solo cambia la clasificación cuando no hay uso registrado,
la pregunta está en `BORRADOR` o `ARCHIVADO` y no tiene fecha de publicación.
Una pregunta ya publicada o utilizada queda bloqueada; su corrección requiere
versiones y conservación de clasificación histórica en C6. No se clona para
esquivar la detección de duplicados ni se inventa un tema automáticamente.

## API

Todas las rutas requieren rol ADMIN, no profesor ni administrador institucional.

```text
GET   /admin/editor/reclasificacion/preguntas/:id?destinoSubtemaId=<id-existente>
PATCH /admin/editor/reclasificacion/preguntas/:id
```

Primero elegir un destino existente usando el catálogo área → tema → subtema.
El GET muestra contenido, referencias de imágenes/contexto, opciones, origen,
destino, bloqueos, advertencias y revisión. No descarga recursos ni confirma
exactitud académica. Las respuestas correctas solo son visibles para ADMIN.

Cuerpo de confirmación del PATCH:

```json
{
  "destinoSubtemaId": "<destino-revisado>",
  "revision": "<SHA-256 de 64 caracteres devuelto por GET>",
  "confirmado": true
}
```

`confirmado` debe ser el booleano JSON `true`. No se aceptan cadenas o números
convertidos implícitamente, origen enviado por el cliente, campos adicionales ni
listas de preguntas para movimientos masivos. Una revisión antigua devuelve
`409 RECLASSIFICATION_STALE`; volver a consultar, no reintentar a ciegas.

## Condiciones

- Origen distinto de destino, ambos dentro de la misma área. No se cambia área.
- Destino específico, con tema/subtema válidos y no archivados. Puede estar en
  borrador; esto no publica la pregunta ni su destino.
- No se exige clasificación específica en origen: permite salir de Banco General.
- No permite preguntas en revisión/publicadas o con fecha de publicación previa,
  aunque después se hayan archivado.
- Bloquea relaciones académicas de la pregunta, excepto sus propias opciones
  de respuesta: historial, cuaderno, preguntas/respuestas de juegos y las demás
  relaciones incluidas en `_count`, también si se agregan relaciones futuras.
- Comprueba además `preguntaIds` JSON de diagnóstico inicial e intento de
  simulacro, incluyendo registros terminados, consumidos o vencidos. No basta
  comprobar solo respuestas calificadas ni solo intentos activos.
- Si existe `IntentoGuardian`, comprueba su snapshot `question.id` con consulta
  parametrizada. La ausencia de esa tabla opcional no exige instalar Guardián;
  un error de permisos/consulta no se interpreta como ausencia de uso.
- Bloquea estadísticas retenidas de aciertos/tiempo distintas de cero, aunque ya
  no haya respuestas vinculadas, y casos asociados con área incompatible.

Ausencia de registros no demuestra que un legado con historial incompleto nunca
haya sido utilizado. Revisar su procedencia; ante dudas, conservarlo y usar el
flujo de versiones. No borrar intentos, fechas ni relaciones para desbloquearlo.

## Escritura y concurrencia

La transacción toma primero `editor:area:<área>`, luego temas/subtemas ordenados,
pregunta y caso. Relee origen, destino y uso bajo esos bloqueos, compara la revisión
y valida otra vez. Peticiones entre áreas se rechazan antes de bloquear filas
de un área ajena. Límite: 5 s de espera y 15 s de transacción.

La única modificación explícita es `Pregunta.subtemaId`; Prisma actualiza
`fechaActualizacion` porque sí hay una edición real. Se conservan ID, contenido,
opciones e IDs de respuestas, explicación, caso/orden, estado y fecha de publicación.
La huella v1 no contiene tema/subtema: se conserva al moverse dentro de la misma
área. Si era nula, sigue nula y necesita la indexación D2-B.

No modifica resultados, no cambia lecciones/padres, no fusiona duplicados ni
publica. Una pregunta archivada sigue archivada. Las revisiones abiertas en
otras pantallas caducarán; recargar antes de guardar.

Este protocolo coordina escritores editoriales de la API. No protege frente a
SQL externo que ignore los bloqueos ni certifica la completitud de todos los
historiales importados. Las pruebas PostgreSQL y el ensayo real siguen pendientes.

## Activación pendiente

`EDITORIAL_RECLASSIFICATION_ENABLED` está ausente/false por defecto. GET puede
usarse para revisar; PATCH devuelve 503 sin iniciar la escritura. No activar
automáticamente al habilitar indexación ni publicación: son banderas distintas.

Antes de una prueba real: confirmar base/ambiente y respaldo, desplegar D2-A/B/C,
verificar consultas y concurrencia en PostgreSQL, elegir contenido autorizado y
cuenta ADMIN, autorizar la operación y habilitar temporalmente solo lo necesario.
Al terminar, desactivar la bandera. No modificar usuarios ni secretos por este flujo.

El resultado devuelve origen y destino como comprobante de la operación; no es
todavía un historial editorial persistente ni una restauración automática. Guardar
el comprobante en el registro privado del equipo. Auditoría/versiones completas
se implementan en C6. La integración visual de estas herramientas de legado se
prepara antes del ensayo editorial D3, sin exigir Excel.

## Verificación

Pruebas con persistencia simulada: condiciones de uso, referencias JSON,
Guardián opcional, fallos de consulta, bloqueo por área/filas, revisión antigua,
doble envío, publicación preservada, confirmación estricta y DTO/ADMIN.
No equivalen a ejecutar las consultas en PostgreSQL real.

Resultado local: **48 pruebas específicas** aprobadas; suite completa de
**533 pruebas en 62 suites** aprobada con `--detectOpenHandles`, sin recursos
abiertos informados. Compilación y lint de los archivos cambiados correctos.
No se ejecutaron migraciones, cambios de clasificación reales ni pruebas en
Supabase; no se activó ninguna bandera editorial.
