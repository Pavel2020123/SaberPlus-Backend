# P4-A — API de tiempo registrado y evolución

Entrega local del 14 de septiembre de 2026. **P4 no está completa:** sigue P4-B
(sincronización y pantallas Flutter), luego P5 y D3. No se desplegó Render, no se
migró Supabase ni se importaron contadores de dispositivos.

## Decisiones de medición

- Evaluaciones: se lee `HistorialRespuesta` ya confirmado para PRACTICA,
  SIMULACRO, PERSONALIZADO, DIAGNOSTICO y ADAPTATIVO. No hay un POST de tiempo
  de evaluación: reenviarlo desde Flutter duplicaría información existente.
- Primera fila por sesión/pregunta, ordenada por fecha e ID. Otra sesión sí
  cuenta como nueva práctica, no como evidencia nueva de dominio automáticamente.
- El tiempo de respuesta sigue siendo **declarado por el dispositivo** aunque
  la respuesta esté confirmada. No demuestra atención ni excluye por sí mismo
  que el estudiante dejara una pregunta abierta. Valores ausentes o fuera de
  0–7200 segundos se contabilizan como respuestas sin tiempo, no como cero.
- Pomodoro: bloques completados de 25 minutos declarados por el dispositivo,
  separados del tiempo en evaluaciones. No se calcula un total sumando ambas
  fuentes: pueden coincidir. No se inventan intervalos de actividad a partir de
  un total, porque el Pomodoro permite pausas.
- Una separación menor de 25 minutos entre dos finales no puede representar dos
  bloques distintos completos de esta cuenta; se rechaza incluso con IDs nuevos.
  Bloques separados exactamente 25 minutos sí son válidos.
- No se conceden XP, rachas, premios, certificaciones ni conclusiones académicas
  mediante estos endpoints. Para falencias se conserva el diagnóstico P2.
- Lecturas, apertura de pantallas y juegos no se incorporan como tiempo medido
  en esta versión. Las actividades sin confirmación no aparecen.

## API autenticada v1

Todos los endpoints requieren JWT y correo verificado y devuelven
`Cache-Control: private, no-store`. El servicio comprueba también el rol actual.

### POST /tiempo-estudio/me/pomodoros

Solo ESTUDIANTE, sin restricciones del plan del estudiante/colegio.

```json
{
  "version": 1,
  "eventos": [{
    "eventoId": "pomodoro:11111111-1111-4111-8111-111111111111",
    "duracionSegundos": 1500,
    "finalizadoEn": "2026-09-14T15:00:00.000Z"
  }]
}
```

La fecha del ejemplo debe sustituirse por la finalización real, nunca futura.
Acepta 1–50 eventos por lote. ID estable `pomodoro:<UUID v4 en minúsculas>` o
`pomodoro:<13–20 dígitos>` para el contador actual. No se aceptan IDs repetidos
dentro del lote, otras fuentes, otras duraciones, IDs de usuario o campos extra.
Fechas ISO con zona, canonizadas a milisegundos UTC. Bloques nuevos deben estar
dentro de los últimos 90 días y no en el futuro; revisar reloj ante HTTP 400.

Respuesta: `{version:1, confirmados:[{eventoId, finalizadoEn, duracionSegundos:1500,
reutilizado}], politica}`. Coincidencia usuario/ID/fecha reconoce el mismo evento
sin insertar otra fila, incluso si al reintentarlo ya transcurrieron 90 días.
Cambiar la fecha de un ID conocido da 409. No regenerar un ID para saltar un error.

El lote es atómico: si uno falla no se incorpora ninguno de los nuevos. Se usa
transacción SERIALIZABLE, bloqueo parametrizado de la fila de usuario y hasta
tres intentos internos ante concurrencia. IDs distintos también pasan el control
de separación temporal. Tras conflicto, conservar la cola y mostrar la causa;
P4-B puede aislar eventos para no bloquear otros, nunca borrar datos sin confirmar.

### GET /tiempo-estudio/me?dias=30

Solo el estudiante propietario. Ventanas admitidas: 7, 30 o 90, por defecto 30.
No recibe un usuario por query/body. Consulta coherente REPEATABLE READ y nueva
comprobación del rol al terminar. Respuesta:

- `version`, `politica`, `desde`, `hasta`, `dias`, `parcial` y
  `registrosEvaluacionLeidos`.
- `totales`: `segundosEvaluaciones`, `segundosPomodoroDeclarados`, `respuestas`,
  `aciertos`, `errores`, `respuestasSinTiempo`, `sesionesEvaluacion`,
  `bloquesPomodoro`. **No existe `totalSegundos` entre ambas fuentes.**
- `evolucion`: una fila por fecha colombiana con las mismas métricas, `fecha`,
  `estado` y `porcentajeAciertos` (null cuando no hay respuestas o la muestra es
  parcial). Los porcentajes son descriptivos, no comparan dificultad entre bancos.

La ventana empieza a medianoche America/Bogota del primer día y termina en el
instante de consulta. Se atribuye tiempo al día de confirmación/finalización, no
se reconstruyen minutos de cada día atravesado por una sesión. Se excluye futuro.
Un día vacío significa `SIN_REGISTROS`, no «no estudió» ni falta de motivación.
Una misma sesión que aparece en varios días se cuenta una sola vez en el total.

Más de 10 000 respuestas produce `parcial:true`: se muestra una muestra inicial
limitada, los días dicen `MUESTRA_PARCIAL` y los porcentajes quedan null. No se
afirma que días vacíos de esa muestra sean días sin actividad. Los Pomodoros no
dependen de ese límite de historial. No se exponen filas, IDs de preguntas,
claves, opciones, sesiones o tiempos individuales. Archivar contenido no borra
tiempo histórico; eliminar una cuenta elimina sus bloques por FK en cascada.

### GET /instituciones/me/estudiantes/:estudianteId/evolucion?dias=30

UUID validado, guardas docentes y rol PROFESOR actual. Reutiliza el alcance P2
`StudentEvidenceService.estudianteAutorizado` antes y después de consultar:

- membresía institucional y capacidad DETALLADA;
- profesor: estudiante de su institución en un grupo asignado;
- propietario/administrador: alcance institucional, nunca global;
- mismo 404 para inexistente/fuera de alcance; 403 al faltar rol, membresía o plan.

Respuesta `{version:1, estudiante:{id,nombre,grupos:[{id,nombre}]}, evolucion}`.
`evolucion` tiene exactamente el resumen personal descrito arriba. No se copia la
lógica de diagnóstico ni se abre el endpoint personal a profesores.

## Persistencia y despliegue pendiente

Migración `20260914090000_study_time_pomodoros`: tabla PomodoroRegistrado, PK
usuario/evento, unique usuario/finalización, FK en cascada, duración fija y patrón
de ID verificados en SQL. RLS habilitada sin políticas de cliente; se revocan
permisos de anon/authenticated cuando existen. Solo la API usa credenciales DB.

Antes de desplegar, revisar destino, permisos del rol Prisma, respaldo y orden
de migraciones. **No ejecutar migrate deploy a ciegas:** hay una migración previa
de Guardián fuera de este trabajo. El HEAD ya referencia `IntentoGuardian`, pero
su modelo/directorio/migración siguen como cambios locales previos. Las pruebas
y compilación corresponden al árbol local que los conserva; P4-A no resuelve
esa entrega pendiente ni certifica que un checkout limpio compile por sí solo.

## Verificación local

- Reglas puras, HTTP con guards sustituidos, autorización/revalidación y reintentos.
- 11 pruebas PostgreSQL desechable: persistencia/reconexión, concurrencia de IDs
  iguales/distintos, atomicidad, límites, aislamiento, planes, historial, RLS y FK.
- El ejecutor aplica las migraciones versionadas y exclusivamente la migración
  P4-A pendiente. No descubre ni ejecuta otras migraciones locales.
- El servidor temporal se detuvo y su directorio propio se eliminó al terminar;
  las bases existentes quedaron intactas.
- Jest completo: 769 pruebas aprobadas en 74 suites; 58 pruebas enfocadas en P4/P2
  aprobadas. Compilación y lint sin errores. Flutter no se ejecutó: solo cambió
  documentación en el repositorio móvil.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run build
npx eslint src/institucion/study-time*.ts src/institucion/student-evidence.service.ts src/institucion/institucion.module.ts
npm test -- --runInBand --silent
node tool/test_editorial_postgres.mjs --study-time
```

HTTP aislado no sustituye JWT real, teléfonos o ensayo P5. No hay commits, push,
instalación de paquetes, audios, despliegues ni escrituras de negocio externas.
