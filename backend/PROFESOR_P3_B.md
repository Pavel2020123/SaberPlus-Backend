# P3-B — inicio seguro de práctica dirigida

Entrega local del 13 de septiembre de 2026. El cliente Flutter integra catálogo,
asignación, retiro, consulta docente, prioridades propias y práctica. Continúa P4,
después P5 y D3. **No se desplegó ni se migró Supabase.**

## Contrato añadido

`POST /prioridades-docentes/:prioridadId/practica`, con UUID válido, JWT y correo
verificado. Sin cuerpo necesario; identidad solo de sesión. Cabecera no-store.

El servicio verifica rol ESTUDIANTE, institución y matrícula explícita actual,
prioridad activa, pertenencia, ingreso dentro de plazo y meta pendiente. El plan
del alumno no limita el acceso. Selección publicada del snapshot y área original,
sin las preguntas ya practicadas desde asignación/ingreso. Devuelve hasta las
preguntas faltantes para 5/5; si algunas se archivaron, permite practicar las
restantes, pero no sustituye IDs por contenido nuevo.

Respuesta: `version=1`, `prioridadId`, `area`, `intentoId`, `expira`, `preguntas`.
Cada pregunta usa el formato público de práctica: enunciado, imagen, dificultad,
caso/contexto si existe, opciones sin clave, subtema (incluido ID) y tema/área.
No hay `esCorrecta` ni explicación anticipada.

Se crea `IntentoSimulacro` normal, origen `PRACTICA`, área y lista exacta de IDs,
propiedad del alumno y expiración mínima entre dos horas y plazo. La calificación
existente `POST /simulacros/calificar` valida respuestas/propiedad, consume intento
y escribe historial/XP. No hay otra vía de calificación ni porcentajes del cliente.
Iniciar de nuevo requiere nueva autorización; no retoma contenido local.

Retiro/salida del grupo bloquean nuevos inicios y detienen el conteo docente.
El intento ya entregado puede calificarse como práctica normal hasta su expiración,
sin sumar cumplimiento fuera de la ventana o recuperar acceso al grupo.
El inicio no tiene UUID idempotente propio: un reintento manual puede crear otro
intento no calificado; no concede XP. Las asignaciones conservan idempotencia P3-A.

## Verificación

- Compilación y lint TypeScript aprobados.
- Jest completo: 725 pruebas en 71 suites. HTTP verifica UUID, sesión y no-store
  con guards sustituidos; no equivale a login JWT real.
- PostgreSQL desechable: 13 pruebas. Incluye inicio dirigido, conjunto congelado,
  calificación existente, lectura de cumplimiento, exclusión de respuestas previas,
  rechazo de otros alumnos/roles, retiro, vencimiento y salida del grupo.
- No migración nueva; usar P3-A antes de desplegar este código, únicamente después
  de revisar autorización, destino, respaldo y migraciones ajenas pendientes.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run build
npx eslint src/institucion/teacher-priorities*.ts
npm test -- --runInBand --silent
node tool/test_editorial_postgres.mjs --teacher-priorities
```

La documentación del flujo Flutter y sus verificaciones está en
`C:\Users\LENOVO 14ALC6\Desktop\SaberPLus\saber_plus\docs\PROFESOR_P3_B.md`.

## Commit

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend"
git add backend/PROFESOR_P3_A.md backend/PROFESOR_P3_B.md backend/src/institucion/teacher-priorities.service.ts backend/src/institucion/teacher-priorities.controller.ts backend/src/institucion/teacher-priorities.controller.spec.ts backend/test/teacher-priorities-postgres.test.cjs
git diff --cached --stat
git commit -m "feat: iniciar practica dirigida de prioridades docentes P3-B"
```

Preservados los cambios previos de Guardián (esquema, app.module, probe_database,
directorio y migración). No incluirlos accidentalmente. No hay commits ni push
automáticos en esta entrega.
