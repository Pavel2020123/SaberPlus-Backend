# MA-2A — Reglas y backend del mapa de aprendizaje

Implementación local, 27 de septiembre de 2026. No desplegada ni aplicada a Supabase.
MA-2B (panel) y MA-2C (Flutter) siguen pendientes: esta entrega no agrega pantallas.

## Regla de producto

Una relación `previoId → destinoId` dice «este subtema puede ayudar a comprender el
siguiente». Ejemplo: fracciones → proporciones → regla de tres. No bloquea contenido,
no concede XP, no altera certificados/progreso y no diagnostica falencias.
MA-2C reutilizará evidencia académica existente sin confundir lección leída con dominio.
No hay relaciones creadas automáticamente ni contenido demo en la migración.

Los extremos son subtemas del catálogo (el tema se incluye como etiqueta/contexto),
no existe una segunda jerarquía de temas. Solo relaciones dentro de la misma área.
Hasta 8 bases directas por subtema y 5000 relaciones por área como límites técnicos
iniciales; son límites de edición, nunca requisitos académicos del estudiante.
Si hacen falta otros límites, modificarlos junto con pruebas/contrato, no truncar.

## API versión 1

| Método y ruta | Acceso | Resultado |
|---|---|---|
| GET `/admin/mapa-aprendizaje/subtemas/:id` | ADMIN | Bases directas y recorrido, incluyendo estados no publicados para editar |
| PUT `/admin/mapa-aprendizaje/subtemas/:id` | ADMIN | Reemplaza solo las bases directas del subtema |
| GET `/mapa-aprendizaje/subtemas/:id` | Sesión y correo verificado según reglas existentes | Solo referencias publicadas; sin datos personales ni respuestas |

Cuerpo PUT: `{"revision":0,"previos":["id-base"]}`. `previos: []` elimina las
relaciones entrantes, no contenido ni relaciones de otros destinos. IDs únicos
de hasta 128 caracteres alfanuméricos, guion o guion bajo; revisión entera.
Campos extra se rechazan mediante ValidationPipe existente. No acepta actor desde cliente.

Respuesta: `versionContrato:1`, `area`, `revision`, `orientativo:true`, `subtema`,
`previos` (directos), `recorrido` (antecesores, orden topológico, sin repetir).
Cada referencia lleva `id`, `nombre`, `temaId` y `tema` (nombre). ADMIN recibe además
`estado`, `estadoTema`, `disponible` para referencias; consulta catálogo para editar
el propio subtema. El recorrido excluye el destino y nodos ajenos a sus antecesores.
El orden entre nodos independientes es técnico y estable, no una prioridad de dificultad.
Una lista vacía significa «sin bases publicadas configuradas», no «domina el tema».

El GET no crea registros. Sin mapa guardado, devuelve revisión 0 y listas vacías.
La revisión es del área y controla ediciones de relaciones; no versiona todo el
catálogo académico. Cambiar nombres/publicación no necesariamente cambia revisión:
recargar siempre catálogo y mapa al abrir editor. C4 definirá sincronización global.

## Integridad, permisos y concurrencia

- Al agregar relaciones, tema/subtemas deben estar publicados. Se permite vaciar
  bases de un destino archivado para corregir relaciones sin republicarlo.
- Sin autorreferencias, duplicados ni ciclos directos o indirectos; validación
  iterativa, sin recursión profunda. Incluye relaciones ocultas al detectar ciclos.
- Bloqueo transaccional por área serializa editores, incluso aristas opuestas.
  Escritura ReadCommitted, comparación de revisión y bloqueo compartido de nodos/
  temas durante validación. Todo se guarda o revierte en una transacción.
- Una revisión vieja devuelve 409; no sobrescribe. Incluso tras pérdida de conexión,
  recargar y comparar antes de reenviar. Reenvío idéntico con revisión vigente es
  un no-op (no incrementa versión). Un reenvío con revisión vieja sigue siendo 409.
- 400: relación inválida; 401/403: identidad/permisos; 404: destino inexistente o
  no publicado para estudiantes. Errores de concurrencia conocidos devuelven 409.
- No hay restricciones Premium. Usa los guards existentes, no reinventa sesiones.
- RLS y retirada de privilegios de PUBLIC/anon/authenticated en ambas tablas.
  Acceso solo desde backend autorizado; verificar rol servidor antes de desplegar.
- `actualizadoPor` registra último editor, no se expone en la API. No sustituye
  el historial completo de cambios pendiente en C6.

Archivar intermedio oculta esa ruta para el alumno; no crea atajos ni revela nombres
ocultos. ADMIN conserva las referencias para corregirlas. Borrado de subtema autorizado
por el catálogo elimina sus referencias por FK, nunca elimina lecciones por quitar
una relación. No se debilitan las restricciones existentes de eliminación de contenido.

## Migración y verificación

Nueva migración `20260927120000_learning_map`: tablas MapaAprendizaje y
RelacionAprendizaje, índices, FK, restricción contra autorrelación y privacidad.
No contiene semillas ni modifica registros académicos anteriores. Respaldo, revisión
y autorización obligatorios antes de aplicarla fuera del runner temporal.

Desde `backend/`:

```powershell
npm run build
npm test -- --runInBand
npx --no-install eslint "src/learning-map/*.ts" --max-warnings=0
node tool/test_editorial_postgres.mjs --learning-map
```

Runner: PostgreSQL aislado en loopback, 48 migraciones de HEAD más únicamente la
nueva MA-2A si aún no está en HEAD; no lee `.env`, no usa Supabase ni Postgres habitual.
Tras terminar detiene y elimina su instancia temporal validada.
Resultado local: build y ESLint aprobados, 845 pruebas Jest/84 suites; 7 PostgreSQL
incluyendo llamadas HTTP con roles, DTO, persistencia, ciclos, conflictos y RLS.

## Próximo: MA-2B, no rehacer el backend

Agregar editor simple en panel usando los selectores existentes de área/tema/subtema.
Elegir bases publicadas, ver relaciones directas y recorrido; guardar con revisión
y tratar 409 mostrando recarga, sin reenvío automático. Ofrecer quitar relaciones
sin borrar contenido, confirmar descarte, limpiar al salir y descartar respuestas
tardías. Demo debe seguir mismas reglas en memoria sin usar base real.
Después MA-2C: repositorio/estado/pantalla Flutter, navegación a lecciones sin
bloqueos, evidencia disponible y vacíos honestos. P5/D3 y despliegue siguen pausados.
