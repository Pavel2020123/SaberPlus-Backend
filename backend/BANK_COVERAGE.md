# MA-1 — Cobertura básica del banco

Implementada localmente el 24 de septiembre de 2026. No desplegada.

El panel incorpora **Cobertura**, una consulta de solo lectura por área, paginada
en grupos de 20 subtemas. No cambia el flujo Área → Tema → Subtema → Preguntas,
ni agrega revisión obligatoria: guardar sigue publicando directamente.

## Qué muestran los conteos

- Total almacenado: todas las preguntas del subtema, incluidos borradores y archivadas.
- Publicadas disponibles: pregunta, subtema, tema y contexto opcional publicados.
- No disponibles: total menos publicadas disponibles.
- Dificultades: básico, medio y avanzado, solo entre las publicadas disponibles.
- Dificultades faltantes: niveles con cero preguntas disponibles.
- Sin explicación: preguntas disponibles con explicación general nula, vacía o
  compuesta solo de espacios. No evalúa la calidad de explicaciones ni medios.

Un subtema vacío también aparece. Tener preguntas no garantiza que alcance el
mínimo o las condiciones de cada juego. No se inventa una puntuación de calidad.
**Reportes académicos pendientes:** no existe aún un registro de reportes de
preguntas; la API devuelve `reportesDisponibles: false` y `reportes: null`, no cero.
Los reportes de batallas no se mezclan con el banco académico.

## API y seguridad

`GET /admin/cobertura?area=MATEMATICAS&pagina=1&limite=20`, protegido por AdminGuard.
Cinco áreas del catálogo, página 1–10000, límite 1–100 (por defecto 50).
Consulta parametrizada y agrupada para la página seleccionada, transacción de
lectura RepeatableRead. No devuelve enunciados, respuestas ni datos estudiantiles.
No requiere nuevas migraciones. Al salir del panel se limpia la vista; respuestas
tardías de una consulta anterior no reemplazan el filtro vigente. Los errores no
se presentan como banco vacío y se pueden reintentar con Actualizar cobertura.

## Prueba manual

Desde `SaberPlus-Backend/admin`, ejecutar `npm run demo`, entrar a la demostración
y abrir **Cobertura**. Seleccionar un área, crear/publicar una pregunta desde
Preguntas y volver a actualizar la cobertura. Comprobar dificultad, explicación
y paginación. La demo cuenta registros reales en memoria, no los números
ilustrativos de `_count` del catálogo inicial: puede mostrar cero correctamente.
Al reiniciar la demo se pierden los cambios; no llegan a Supabase.

## Verificación local

- `npm run build` en backend: aprobado.
- `npm test -- --runInBand`: 827 pruebas, 83 suites aprobadas.
- ESLint de los tres archivos nuevos TypeScript: aprobado.
- `node tool/test_editorial_postgres.mjs --coverage`: 4 pruebas aprobadas con
  PostgreSQL temporal aislado y las 48 migraciones existentes; instancia eliminada
  tras detenerla, sin modificar bases del usuario.
- En admin, `npm run check` y `npm test`: 19 módulos y 79 pruebas aprobados.

Faltan revisión visual en navegador y ensayo con backend desplegado (D3/P5
permanecen pausados). Siguiente entrega funcional: MA-2, mapa de aprendizaje.
