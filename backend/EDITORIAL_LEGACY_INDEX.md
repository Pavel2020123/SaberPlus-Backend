# 7F-C3-D2-B — Indexación acotada de preguntas antiguas

Implementación local: 7 de septiembre de 2026. **No ejecutada sobre Supabase ni
desplegada por esta entrega.** No requiere migración: utiliza `huellaContenido`
y su índice existentes. No hay una pantalla nueva en el panel todavía.

## Qué hace y qué no hace

- Completa únicamente huellas nulas, por área y lotes de 1–100 preguntas (25
  por defecto). Incluye borradores, publicadas y archivadas, y Banco General.
- Reutiliza la huella v1 del editor: área, enunciado, referencia de imagen y
  textos de opciones normalizados, sin depender del orden de las opciones.
- No cambia texto, respuestas, estado, clasificación, fechas ni resultados.
  La escritura SQL parametrizada modifica solo `huellaContenido`, conservando
  incluso los microsegundos de `fechaActualizacion` de PostgreSQL.
- No recalcula huellas ya guardadas ni repara huellas incorrectas automáticamente.
  No es comparación semántica/OCR ni verificación de derechos/calidad. La huella
  actual no incluye contexto del caso ni cuál opción es correcta.
- Devuelve coincidencias para revisión humana. **Nunca borra, fusiona, archiva
  ni publica duplicados.** Indexar Banco General tampoco lo reclasifica.

## API protegida con ADMIN

| Método y ruta | Uso |
| --- | --- |
| `GET /admin/editor/legado/indice/lote?area=MATEMATICAS&limite=25` | Vista previa sin escrituras: revisión, IDs, huellas, coincidencias conocidas y pendientes en el área. |
| `POST /admin/editor/legado/indice/lote` | Confirma exactamente el lote revisado, bajo transacción/bloqueo. |
| `GET /admin/editor/legado/indice/duplicados?area=MATEMATICAS&limite=10` | Grupos ya indexados con más de una pregunta, incluyendo archivadas. Hasta 20 grupos por página. |
| `GET /admin/editor/legado/indice/coincidencias/:huella?area=MATEMATICAS&limite=25` | IDs, estado y clasificación de las coincidencias, sin respuestas correctas ni texto académico. Hasta 100 por página. |

Los dos informes usan `despues` como cursor: huella de 64 caracteres para grupos,
ID para coincidencias. Solo enviar el `siguiente` devuelto cuando `hayMas` sea true.
El cursor es de lectura, no una autorización para editar.

Cuerpo de confirmación:

```json
{
  "area": "MATEMATICAS",
  "limite": 25,
  "revision": "<64 caracteres hexadecimales devueltos por la vista previa>",
  "confirmado": true
}
```

No acepta listas arbitrarias de IDs, huellas calculadas por el cliente ni campos
adicionales. La revisión detecta cambios del lote; no reemplaza la autenticación.
La confirmación conserva el valor JSON original antes de la conversión implícita
global: solo acepta `true`, nunca `"true"`, `"false"` ni `1`. Esta protección se
aplicó también al DTO de revisión/publicación editorial existente.

## Reanudación y fallos

Cada vista previa selecciona los primeros registros de esa área con huella nula,
ordenados por ID. Los ya procesados quedan fuera: no se necesita un archivo local
de checkpoint ni un offset que cambie después de cada escritura.

1. Consultar vista previa, revisar su alcance y confirmar su revisión actual.
2. Si termina correctamente, volver a consultar el próximo lote.
3. Si se pierde la respuesta, no confirmar ciegamente: volver a consultar.
   Reenviar una revisión ya procesada devuelve `409 LEGACY_INDEX_STALE` si cambió
   el lote; **no procesa el siguiente sin revisión**. Un lote vacío no escribe nada.
4. Un error o conflicto dentro de la transacción revierte todo ese lote; lotes
   anteriores confirmados se conservan. Límites: espera de transacción 5 s y
   duración 30 s. Reducir el tamaño si el entorno no completa los lotes a tiempo.

La escritura comparte `editor:area:<área>` con los escritores editoriales de
D2-A, bloquea las filas seleccionadas, relee el lote y verifica revisión antes
de actualizar condicionalmente. No coordina escrituras SQL externas que ignoren
ese protocolo. Pausar scripts y cargas ajenas al editor durante la operación.

## Cómo interpretar los resultados

- `coincidenciasIndexadas`: otras preguntas con esa huella ya guardada.
- `coincidenciasEnLote`: otras preguntas equivalentes dentro de esta vista previa.
- No se comparan en memoria todas las preguntas antiguas: otro lote posterior
  puede revelar una coincidencia que todavía no figuraba en la primera vista.
- Al llegar a `pendientesEnArea: 0`, iniciar el informe de duplicados desde el
  principio. Los informes paginados no son una instantánea congelada: reiniciarlos
  si se indexan o editan más preguntas durante la revisión.
- Repetir para las cinco áreas. Los duplicados detectados y la clasificación
  genérica siguen requiriendo decisiones editoriales; cero huellas nulas no
  significa que el banco esté listo para publicar.
- El editor mantiene su protección de más de 2000 candidatos sin indexar. Esta
  herramienta prepara el banco para resolverla; no relaja ni elimina ese control.
  Si hay más de 2000 coincidencias de una misma huella, el límite conservador
  del editor también puede seguir bloqueando; revisar el informe, no forzar la carga.
- Las revisiones de una pregunta abierta en el editor pueden caducar al completar
  su huella: recargar ese registro antes de guardarlo. No se modificó su lección.

## Operación real pendiente y autorización

1. Confirmar repositorio/backend/ambiente y disponer de respaldo recuperable.
2. Desplegar primero D2-A y D2-B; verificar que las rutas antiguas ya no escriban.
3. Preparar una sesión ADMIN autorizada. No pegar JWT ni claves en Git/capturas.
4. Consultar vistas previas. Por defecto, `EDITORIAL_LEGACY_INDEX_ENABLED` está
   ausente/false: lecturas permitidas, confirmación devuelve 503.
5. Solo con autorización para esa base, activar temporalmente la bandera con
   valor literal `true` y procesar lotes revisados. Desactivarla al terminar.
6. Conservar resultados de operación en un lugar privado y revisar duplicados.
   En esta etapa no hay historial editorial persistente completo (previsto en C6).

**No activar `EDITORIAL_PUBLICATION_ENABLED` por haber terminado la indexación.**
Faltan reclasificación revisada, CLOZE, concurrencia PostgreSQL y ensayo D3.

## Pruebas

Las pruebas cubren límite/área, confirmación y bandera, vista previa sin escrituras,
revisión obsoleta, reintentos, rollback, fechas preservadas, duplicados, paginación
y DTO/ADMIN. La persistencia transaccional es un doble de pruebas, no PostgreSQL:
falta validar consultas SQL, agregaciones, rollback y concurrencia en una base
de ensayo autorizada. Ninguna prueba de esta entrega modifica Supabase.

Resultados locales: suite general de **479 pruebas / 61 suites** aprobada con
`--detectOpenHandles`, sin recursos abiertos informados en esa repetición.
Después del endurecimiento final de confirmación: **32 pruebas de indexación**
y **23 de revisión editorial** aprobadas. Compilación y lint focalizado correctos.
Una ejecución general anterior mostró un aviso de cierre tardío; la repetición
diagnóstica terminó correctamente y no reprodujo el aviso.
