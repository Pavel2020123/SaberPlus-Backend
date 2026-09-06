# 7F-C2-B2 — Diagnóstico por evidencia acumulada

## Contrato

`GET /diagnostico-evidencia`: JWT y correo verificado. El servicio exige rol
ESTUDIANTE y usa exclusivamente el ID de la sesión autenticada. No acepta
seleccionar otro estudiante, no requiere plan de pago y no escribe en la base.

Respuesta versión 1:

- `politica`: versión, ventana y mínimos descritos abajo.
- `desde`, `hasta`: límites ISO UTC, calculados con el reloj del servidor.
- `parcial`: historial superior al límite de consulta.
- `registrosExcluidos`, `repeticionesIgnoradas`: conteos dentro de lo consultado.
- `temas`: ID, nombre, área, métricas y lista de `subtemas`, también con ID,
  nombre y métricas. No se devuelven preguntas, respuestas ni identidades de intentos.

Métricas: `preguntasUnicas`, `correctas`, `incorrectas`, `sesiones`, `dias`,
`porcentaje` (un decimal), `estado`.

Estados: `EVIDENCIA_INSUFICIENTE`, `POR_REFORZAR`, `EN_PROCESO`, `FORTALEZA`.
Una lista vacía significa que no hay evidencia evaluable, no que el estudiante
sea fuerte en todo. Un error de base no se convierte en lista vacía.

## Política inicial v1

Esta es una regla de producto orientativa, no un instrumento psicométrico
validado ni una certificación de dominio. Los umbrales pueden revisarse con
evidencia de uso y revisión académica; cualquier cambio de significado debe
versionar el contrato y adaptar los clientes.

1. Ventana móvil de 90 días (90 × 24 horas). Se excluyen fechas futuras.
2. Por cada ID de pregunta cuenta únicamente la primera respuesta calificada
   dentro de la ventana. Las posteriores son práctica, no evidencia adicional;
   tampoco sustituyen un error por un acierto memorizado. Esto no mide la
   mejora obtenida al repetir preguntas; se necesitan preguntas nuevas.
3. Subtema: mínimo 5 preguntas distintas. Tema: mínimo 10. Ambos necesitan
   al menos 2 sesiones y 2 fechas locales distintas en `America/Bogota`.
   Sesiones y días se cuentan sobre las respuestas seleccionadas, no repeticiones.
4. Con evidencia suficiente: menos de 60% → refuerzo; desde 60% hasta menos
   de 80% → en proceso; desde 80% → fortaleza en lo evaluado. Se compara el
   cociente exacto antes de redondear el porcentaje para mostrarlo.
5. Sin alcanzar cualquier mínimo: evidencia insuficiente, incluso con 0% o 100%.
6. Agrupación por IDs, no nombres. La conclusión de un tema solo describe los
   subtemas evaluados: no se extrapola al resto del catálogo o a toda la materia.

Se usa `HistorialRespuesta` (diagnóstico, práctica y simulacros que ya persisten
calificaciones). No se infiere conocimiento de XP, visitas, minutos, Pomodoros
ni de juegos que solo tengan su propio historial. Añadir otra fuente requiere
una regla explícita; no se mezclan estadísticas de distintos juegos a ciegas.

Solo se incluyen preguntas, subtemas y temas actualmente PUBLICADOS, con
nombre no vacío y no `Banco General`. Se excluyen discrepancias entre el área
histórica y el área actual. El esquema no guarda una instantánea histórica de
tema/subtema: no deben moverse preguntas ya usadas manualmente en SQL. La
auditoría editorial y versionado del contenido siguen en 7F-C6.

La consulta trae hasta 10001 filas ordenadas por fecha/ID y procesa 10000.
Si hay más, marca `parcial` y todos los estados son evidencia insuficiente;
los conteos no se anuncian como totales del historial completo. Esto limita
memoria y respuesta, pero no sustituye una prueba de carga ni una futura
agregación en SQL para historiales muy grandes.

## Compatibilidad y despliegue

No cambia el contrato de `diagnostico-inicial` ni el algoritmo del plan/repaso
existente. Su resultado por área sigue siendo una muestra inicial, mientras
que este nuevo informe por temas exige evidencia acumulada. Flutter distingue
errores del cuaderno de falencias confirmadas y enlaza ambos flujos.

La ruta nueva no añade muro de pago. La revisión de los guards comerciales
heredados en otras rutas sigue en la etapa de comercio; no se modificaron aquí.

No hay migración ni nuevas dependencias. La implementación está local; falta
desplegar y probar con cuenta de ensayo y contenido publicado en staging. No
se generó contenido, no se tocó Supabase ni se hicieron solicitudes calificadas.
Las migraciones previas de Guardián mantienen su procedimiento separado.

## Verificación

Última ejecución local: 54 suites y 285 pruebas aprobadas; compilación correcta.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm test -- --runInBand
npm run build
```

Pruebas: error aislado, mínimos, umbrales, días de Bogotá, repetición, ventana,
contenido excluido, agrupación por IDs, truncamiento, ausencia de datos, consulta
por usuario propio, roles y propagación de fallos. Usan repositorios simulados;
no sustituyen pruebas HTTP con JWT real ni carga sobre PostgreSQL.
