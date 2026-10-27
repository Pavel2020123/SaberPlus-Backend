# MA-1 — Cobertura básica del banco

**19 de octubre — MA-1R/R1–R4 integrada:** PR backend #9/app #6 (eef0d40/21757a1),
CI backend del PR aprobado. [Acta R4](docs/MA1R_R4_VALIDACION_LOCAL.md):12/12 humanos,
45/45 HTTP/PostgreSQL y regresiones. Resolver reportes actualiza conteos sin modificar
preguntas ni XP. Migraciones solo temporales; staging/despliegue siguen pendientes.
El panel pide opt-in, acepta legacy y enlaza la bandeja por subtema.
Contrato legacy intacto; GET con reportesVersion=1 opta por conteos nuevos.

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
**Reportes académicos:** R2 añadió registros/rutas locales. Sin reportesVersion=1,
la API legacy devuelve `reportesDisponibles:false` y `reportes:null`, no cero.
El consumidor nuevo solicita la versión para abiertos y preguntas distintas afectadas.
Los reportes de batallas no se mezclan con el banco académico.

## API y seguridad

`GET /admin/cobertura?area=MATEMATICAS&pagina=1&limite=20`, protegido por AdminGuard.
Cinco áreas del catálogo, página 1–10000, límite 1–100 (por defecto 50).
Consulta parametrizada y agrupada para la página seleccionada, transacción de
lectura RepeatableRead. No devuelve enunciados, respuestas ni datos estudiantiles.
La cobertura legacy no requiere nuevas migraciones; el opt-in depende de la
migración R2 de reportes, validada solo en bases temporales. Al salir del panel se limpia la vista; respuestas
tardías de una consulta anterior no reemplazan el filtro vigente. Los errores no
se presentan como banco vacío y se pueden reintentar con Actualizar cobertura.

## Prueba manual

Desde `SaberPlus-Backend/admin`, ejecutar `npm run demo`, entrar a la demostración
y abrir **Cobertura**. Seleccionar un área, crear/publicar una pregunta desde
Preguntas y volver a actualizar la cobertura. Comprobar dificultad, explicación
y paginación. La demo cuenta registros reales en memoria, no los números
ilustrativos de `_count` del catálogo inicial: puede mostrar cero correctamente.
Al reiniciar la demo se pierden los cambios; no llegan a Supabase.

## Verificación original del24 de septiembre

- `npm run build` en backend: aprobado.
- `npm test -- --runInBand`: 827 pruebas, 83 suites aprobadas.
- ESLint de los tres archivos nuevos TypeScript: aprobado.
- `node tool/test_editorial_postgres.mjs --coverage`: 4 pruebas aprobadas con
  PostgreSQL temporal aislado y las 48 migraciones existentes; instancia eliminada
  tras detenerla, sin modificar bases del usuario.
- En admin, `npm run check` y `npm test`: 19 módulos y 79 pruebas aprobados.

La revisión visual del flujo de reportes/cobertura con API local se confirmó en R4.
Falta ensayo con backend desplegado (D3/P5 permanecen pausados).
MA-2 como siguiente entrega era la secuencia del 24 de
septiembre: mapa y repaso ya tienen implementaciones locales posteriores.

Antecedente documental del 17 de octubre: se propuso MA-1R, reportes de preguntas
integrados con esta cobertura, como siguiente bloque independiente de OV-1.
R1 tiene [auditoría/contrato](docs/MA1R_REPORTES_PREGUNTAS.md); el propietario autorizó
el flujo inicial y se implementó R2 local, según la actualización superior.
False/null se conserva por compatibilidad legacy, no significa cero incidencias.
Ver [orden y límites](docs/ESTADO_Y_ORDEN_2026_10_17.md).
