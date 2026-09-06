# 7F-C2-B1 — Catálogo académico

Implementación local del backend, sin despliegue ni cambios en Supabase.
No añade migraciones ni dependencias. Panel visual: 7F-C3. Diagnóstico por
evidencia acumulada: 7F-C2-B2.

## Modelo y contrato

`Área ICFES > Tema > Subtema > Preguntas`

La lección es el contenido del subtema (`contenido`, `videoUrl`, `imagenUrl`,
interactivo). No hay tabla independiente de lecciones. Las preguntas exigen
`subtemaId`; el tema y área se deducen de esa relación. Las áreas conservan
sus cinco identificadores existentes. Estas rutas no cambian el padre ni los
identificadores del contenido previo.

Todas las rutas requieren `AdminGuard` y rol editorial `ADMIN`, no profesor
ni administrador de una institución.

| Método y ruta | Contrato |
| --- | --- |
| `GET /admin/catalogo/areas` | Lista `{id, nombre}` de las cinco áreas |
| `GET /admin/catalogo/temas?area=MATEMATICAS&pagina=1&limite=50` | Área obligatoria; `{pagina, limite, hayMas, items}` |
| `GET /admin/catalogo/subtemas?temaId=UUID&pagina=1&limite=50` | Padre obligatorio; añade `tema: {id, nombre, area, estadoContenido}` |
| `POST /admin/temas` | `{nombre, area}`; crea en `BORRADOR` |
| `POST /admin/subtemas` | `{nombre, temaId}`; crea en `BORRADOR` |
| `POST /admin/preguntas` | Contrato existente: subtema obligatorio y dificultad explícita |
| `POST /admin/preguntas-aleatorias` | **Cambio:** además de área exige `subtemaId`; dificultad `MEDIO` |

Página: entero 1–10000, por defecto 1. Límite: entero 1–100, por defecto 50.
Orden por nombre e ID. `hayMas` consulta un elemento adicional, no cuenta todos
los resultados. Se incluyen todos los estados editoriales. `_count.subtemas`
y `_count.preguntas` incluyen los no publicados. Las páginas no contienen
enunciados, respuestas, lecciones completas ni datos de estudiantes.

`GET /admin/temas` conserva su respuesta previa por compatibilidad; el panel
nuevo debe usar las consultas paginadas. Campos ajenos al DTO se rechazan.

Ejemplo: crear `Proporcionalidad` en `MATEMATICAS`, crear debajo `Regla de tres
directa`, guardar su lección y preguntas usando el ID del subtema. Revisar y
publicar tema, subtema y preguntas en ese orden, mediante las rutas editoriales
existentes. Cada elemento pasa por `EN_REVISION`.

## Validaciones y compatibilidad

- Nombres de 1 a 120 caracteres: Unicode y espacios normalizados; sin nombres
  vacíos ni caracteres invisibles/de control restantes.
- Nombres repetidos por mayúsculas, tildes en vocales y espacios devuelven 409
  en la misma área (temas) o mismo tema (subtemas). Se conserva la ñ. Un nombre
  archivado también se reserva: revisar/reutilizar el registro existente.
- Las creaciones del mismo ámbito comparten un bloqueo transaccional PostgreSQL.
  La creación de subtema bloquea también la fila del padre mientras lo valida.
  No es una restricción SQL de unicidad: SQL manual y futuros importadores deben
  respetar esta política. No se fusionan duplicados preexistentes.
- No se crean contenedores `Banco General`. Preguntas, lecciones e interactivos
  rechazan clasificaciones genéricas o archivadas; también se valida al publicar.
- La carga rápida comprueba que el subtema pertenezca al área. Clientes antiguos
  que solo envían área recibirán 400 hasta adaptar el formulario. Flutter no usa
  esta ruta administrativa.
- La vista previa Excel/ZIP informa `CLASIFICACION_INVALIDA` por hoja, fila y
  columna; continúa sin escribir contenido.
- El legado se conserva. `requiereClasificacion` señala el nombre `Banco General`
  o su padre; no certifica que los demás nombres sean académicamente adecuados.
  No se modifica el historial ni se reclasifican preguntas automáticamente.

## Pendiente y verificación

7F-C2-B2 definirá evidencia mínima y agregación por IDs de tema/subtema antes
de presentar fortalezas o falencias. Esta entrega no cambia el diagnóstico ni
convierte un error aislado en una conclusión sobre el estudiante.

Edición de nombres y reclasificación del legado: panel 7F-C3 y auditoría 7F-C6,
con protección para contenido ya utilizado. No mover historial manualmente en SQL.

Las pruebas usan repositorios simulados: verifican validaciones, ámbito de
bloqueos, paginación, protección editorial y configuración del guard. No prueban
concurrencia PostgreSQL real ni sustituyen una prueba HTTP autenticada. Queda
para staging comprobar dos creaciones simultáneas y cuentas ADMIN reales.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm test -- --runInBand
npm run build
```

No ejecutar `migrate deploy` por esta entrega. Las migraciones anteriores,
incluido Guardián, mantienen su procedimiento pendiente independiente.
