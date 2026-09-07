# 7F-C3-D2-A — Una sola vía de escritura editorial

Implementación local: 7 de septiembre de 2026. **No desplegada en esta entrega.**
No requiere migración. No activa `EDITORIAL_PUBLICATION_ENABLED`.

## Cambio de compatibilidad

Se retiran 15 rutas de escritura del controlador ADMIN antiguo. Tras comprobar
autenticación y rol ADMIN, responden **410 Gone**, código
`LEGACY_EDITORIAL_WRITE_RETIRED`, mensaje y `replacement` orientativo. No hay
redirección ni reenvío automático: el cuerpo antiguo no acredita revisión del
registro ni confirmación de publicación. El panel nuevo ya usa las rutas vigentes.

| Ruta retirada (prefijo `/admin`) | Vía vigente |
| --- | --- |
| `PATCH temas/:id/estado` | `GET/PATCH editor/revision/temas/:id` |
| `PATCH subtemas/:id/estado` | `GET/PATCH editor/revision/subtemas/:id` |
| `PATCH preguntas/:id/estado` | `GET/PATCH editor/revision/preguntas/:id` |
| `PATCH casos-preguntas/:id/estado` | `GET/PATCH editor/revision/casos/:id` |
| `POST preguntas` / `POST preguntas-aleatorias` | `POST editor/preguntas`, con clasificación específica |
| `POST casos-preguntas` | `POST editor/casos` |
| `PATCH casos-preguntas/:id` | `GET/PATCH editor/casos/:id`, con revisión |
| `PATCH preguntas/:id/caso` | `GET/PATCH editor/preguntas/:id`, borrador completo y revisión |
| `PATCH subtemas/:id/contenido` | `GET editor/subtemas/:id` y `PATCH editor/subtemas/:id/leccion` |
| `PATCH subtemas/:id/interactivo` | Sin reemplazo de escritura todavía: contrato CLOZE pendiente en D2 |
| `DELETE temas/:id`, `subtemas/:id`, `preguntas/:id`, `casos-preguntas/:id` | Archivo mediante revisión; sin borrado físico por HTTP |

También se retira la inserción demostrativa `POST /simulacros/poblar`: conserva
sus guardias, pero el servicio responde 410 sin consultar/escribir contenido.
Esto no elimina datos existentes ni altera la demo aislada en memoria del panel.

Las lecturas, vista previa de importación, cuentas e instituciones conservan
sus contratos. `POST /admin/temas` y `/admin/subtemas` siguen usando el mismo
servicio de catálogo que el panel. Los métodos internos antiguos permanecen por
ahora para limpieza posterior, pero sus handlers HTTP no los ejecutan. No se
deben reutilizar como una segunda vía de escritura.

## Concurrencia

Catálogo, nombres/lecciones, preguntas/casos y estados usan ahora el mismo
bloqueo transaccional `editor:area:<área>` antes de bloqueos de nombres y filas.
Orden: área → ámbito del catálogo si aplica → tema → subtema → pregunta → caso.
Se conserva la relectura del registro y la comprobación de revisión. La creación
de subtemas relee su padre después del bloqueo y rechaza cambio de área/archivo.

Esto coordina los escritores editoriales de la API, no scripts SQL externos ni
operaciones académicas ajenas al editor. Las pruebas locales con dobles verifican
el protocolo, **no sustituyen la prueba de concurrencia en PostgreSQL**.

## Antes de desplegar/activar

1. Identificar cualquier cliente administrativo que use rutas retiradas. Migrarlo
   al editor y su revisión explícita; no desplegar esperando compatibilidad silenciosa.
2. No modificar ni desplegar la web Icfes_Vida por esta entrega. Este cambio pertenece
   solo al repositorio independiente SaberPlus-Backend.
3. Conservar la bandera de publicación apagada. Faltan indexación/reclasificación
   del legado, contrato CLOZE y concurrencia PostgreSQL para cerrar D2.
4. Ensayar con ADMIN y contenido autorizado en D3 antes de habilitar la operación.

## Verificación local

- Pruebas HTTP de las 15 rutas con ADMIN y bandera tanto false como true; ninguna
  invoca el escritor anterior. Sin sesión devuelve 401; profesor/estudiante, 403.
- Las pruebas usan Nest y AdminGuard reales con JWT/Prisma simulados. No acceden
  a Supabase ni demuestran revocación real de sesiones.
- Inventario automático de mutaciones: una nueva ruta del controlador antiguo
  requiere una decisión explícita para que la prueba pase.
- Pruebas de orden de bloqueos, relectura del padre y retiro de la carga demo.

Ejecutar en `backend`: `npm test -- --runInBand` y `npm run build`.

Resultado de esta entrega: **449 pruebas aprobadas en 60 suites**, compilación
correcta y lint focalizado correcto. No se ejecutaron migraciones ni pruebas
con PostgreSQL real. El código visual del panel y Flutter no cambió.
