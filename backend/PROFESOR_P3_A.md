# Profesor P3-A — prioridades docentes: persistencia y API

Actualización posterior: P3-B ya integra el cliente y el inicio de práctica.
Ver `PROFESOR_P3_B.md`. Sigue P4; esta guía conserva el contrato y la entrega P3-A.
El despliegue/migración real y el ensayo P5 siguen pendientes.

Entrega local del 13 de septiembre de 2026. **P3 está dividida: P3-A backend,
P3-B integración Flutter y práctica dirigida. P3 no está terminada completa.**
Sigue P3-B, después P4, P5 y D3. No se desplegó ni se modificó Supabase.

## Comportamiento acordado para implementar el cliente

- El profesor elige un tema publicado completo o un subtema de ese tema para
  uno de sus grupos. Se conserva área, tema, subtema opcional y sus nombres.
- Meta fija: practicar **cinco preguntas distintas**, correctas o incorrectas,
  de la selección asignada. Esto acredita práctica, **no dominio del tema**.
  La ficha P2 sigue siendo quien interpreta la evidencia académica.
- Plazo futuro de hasta 30 días; hasta 10 prioridades activas por grupo.
  No se modifican los límites comerciales de grupos/estudiantes.
- Al crear se congelan los IDs de las preguntas publicadas elegibles (5–2000).
  No se guarda en este snapshot texto ni claves. Los nombres genéricos se excluyen;
  para selecciones mayores de 2000 se pide un subtema más específico.
- Añadir preguntas al catálogo después no cambia una tarea asignada. Dos tareas
  distintas pueden compartir preguntas; una respuesta puede contar en ambas si
  cumple sus ventanas. No hay XP adicional por cumplir una prioridad.
- El conteo procede únicamente de `HistorialRespuesta`, con área coincidente.
  Pueden contar las actividades que ya generan ese historial validado por el
  servidor; una marca local de lección leída no cuenta. No hay endpoint para
  enviar porcentajes, marcar cumplida ni comunicar respuestas correctas.
- Inicio inclusivo: máximo entre creación e ingreso actual al grupo con
  aceptación explícita. Final exclusivo: mínimo entre vencimiento, retiro y ahora.
  Repetir una pregunta no aumenta el conteo, mostrado como máximo 5/5.
- Si el alumno ingresó después de vencer/retirar la tarea: `NO_APLICA`, no una
  falta académica. Si sale del grupo/institución pierde acceso; el reporte usa
  alumnado actualmente vinculado, no una lista histórica de alumnos expulsados.
  Reingresar inicia una nueva ventana de pertenencia.
- Retirar es idempotente, conserva la asignación y su práctica anterior al retiro;
  no borra respuestas ni reactiva tareas. Para corregir selección/plazo se retira
  y crea otra prioridad con un nuevo UUID.
- Archivar contenido no borra la práctica ya registrada. Se avisa si quedan menos
  de cinco preguntas publicadas del snapshot. Este aviso no es una conclusión
  de dominio ni un cálculo exacto de las preguntas que faltan a cada estudiante.

## API v1

Todas las rutas exigen sesión y correo verificado; la familia docente además usa
`ProfesorInstitucionGuard`. `Cache-Control: private, no-store` en cada respuesta.

Prefijo docente: `/instituciones/me/grupos/:grupoId/prioridades`.

| Método/ruta | Uso |
| --- | --- |
| `GET /catalogo?area=MATEMATICAS&pagina=1` | Subtemas publicados con tema/área, cantidad publicada y `asignable`; filtro área opcional. |
| `GET ?pagina=1` | Listado de prioridades del grupo, incluidas vencidas/retiradas. |
| `POST` | Crear o recuperar una solicitud idempotente. |
| `POST /:prioridadId/retirar` | Retiro idempotente. |
| `GET /:prioridadId/cumplimiento?pagina=1` | Alumnado actual y práctica de esa prioridad. |
| `GET /prioridades-docentes/me?pagina=1` (fuera del prefijo) | Solo las prioridades y cumplimiento de la propia sesión estudiante. |

Cuerpo de creación:

```json
{
  "id": "UUID-v4-generado-una-sola-vez-por-el-cliente",
  "temaId": "id-del-catalogo",
  "subtemaId": "opcional-id-del-subtema",
  "venceEn": "2026-09-20T23:59:00-05:00"
}
```

El ejemplo de fecha no se debe dejar fijo en el cliente. La fecha debe incluir
zona horaria. Conservar exactamente UUID y cuerpo ante resultado incierto;
repetir la petición recupera la misma prioridad, incluso vencida/retirada.
Otro actor, grupo o cuerpo con ese UUID produce 409, sin revelar la solicitud previa.
No enviar creador, lista de preguntas, meta, estado ni porcentajes.

Respuesta de creación: `version`, `reutilizada`, `prioridad`. Listados incluyen
`politica`, `pagina`, `hayMas` y `prioridades`/`subtemas`/`estudiantes`, según ruta.
Páginas de 20; `pagina` entre 1 y 1000. Un catálogo filtrado puede tener una página
vacía y `hayMas=true` si excluyó nombres genéricos: respetar la paginación.
El catálogo pagina subtemas, con su tema, y permite seleccionar el padre; al crear
el tema completo se revalida su conjunto de preguntas en el servidor.

`prioridad` contiene `id`, `grupoId`, `area`, `tema`, `subtema`, `metaPreguntas`,
`creadoEn`, `venceEn`, `retiradoEn`, `estado` (`ACTIVA`, `VENCIDA`, `RETIRADA`).
El reporte añade `contenidoPublicadoSuficiente`; cada estudiante solo tiene
`id`, `nombre`, `aplica`, `estadoCumplimiento` (`NO_APLICA`, `PENDIENTE`, `CUMPLIDA`),
`preguntasPracticadas`, `metaPreguntas`, `cumplida`, `acreditaDominio=false`.
La lista propia añade esos campos y `grupoNombre`, nunca las fichas de compañeros.
No serializar directamente el modelo Prisma: contiene metadatos privados.

## Seguridad, persistencia y concurrencia

- Profesor regular: solo grupos asignados; propietario/administrador: solo su
  institución. Se comprueban rol real, membresía y coincidencia de institución.
- Crear, catálogo y reporte detallado requieren `prioridadesHabilitadas` del plan
  institucional vigente. Listar títulos y retirar siguen disponibles al docente
  autorizado si vence el plan. Estudiantes no necesitan comprar un plan.
- Escrituras y auditoría en la misma transacción serializable. Hasta tres intentos
  internos solo por colisiones/serialización. No reenvío ciego de otros fallos.
  Duplicado activo de la misma selección produce 409 aun con dos UUID diferentes.
- Lecturas de cumplimiento en snapshot consistente y revalidación de acceso
  antes de entregar; se filtran alumnos/grupos retirados durante la lectura.
- SQL parametrizado, agrega únicos en PostgreSQL y limita a cinco. Fechas
  convertidas explícitamente a UTC: no dependen de la zona del servidor.
- Tabla `PrioridadDocente` con FK al grupo, restricciones de plazo/meta, índices,
  RLS sin políticas públicas y revocación a `anon`/`authenticated` si existen.
  Solo conexión privada del backend. No nuevas credenciales para Flutter.
- Los IDs de creador/catálogo del snapshot son referencias históricas, sin FKs
  a usuario/catálogo. No se utilizan como autorización. Auditoría institucional
  conserva las relaciones existentes; el borrado del grupo elimina sus prioridades.

## Verificación local

- Compilación y lint de archivos TypeScript de P3-A sin incidencias.
- Suite Jest completa: **724 pruebas, 71 suites** (33 nuevas de P3-A).
- PostgreSQL temporal: **11 pruebas** con migración real, restricciones/RLS,
  consultas, conteo, límites, concurrencia, idempotencia, roles, grupos, plan,
  vencimiento, retiro, contenido archivado y protección de campos privados.
- Las pruebas HTTP sustituyen guards para verificar transporte/DTO/cabeceras;
  los permisos del servicio se ejercitan con la base temporal. Esto **no sustituye
  un login JWT real ni P5**.
- Flutter no cambió en esta entrega; únicamente su documentación de continuidad.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run build
npx eslint src/institucion/teacher-priorities*.ts src/institucion/institucion-acceso.service.ts src/institucion/institucion.module.ts
npm test -- --runInBand --silent
node --test tool/test_editorial_postgres.test.mjs
node tool/test_editorial_postgres.mjs --teacher-priorities
```

El ejecutor necesita binarios PostgreSQL 16 (o `EDITORIAL_PG_BIN`), crea un servidor
loopback con puerto/usuario aleatorios y borra solo su instancia desechable tras
verificar cierre y propiedad. No lee `.env`, no acepta una URL externa ni usa
Supabase/base habitual. Aplica SQL de migraciones de HEAD y la ruta fija de P3-A
si aún no está versionada; no incorpora migraciones ajenas pendientes.

## Migración y continuación pendientes

Migración preparada: `20260913090000_teacher_priorities`. Aplicada solo a la base
temporal, **no a la base real ni Render**. No ejecutar `migrate deploy` a ciegas:
el repo contiene además cambios previos de Guardián fuera de esta entrega.
Antes del despliegue revisar conjunto de commits/migraciones, respaldo y destino.

**P3-B debe implementar** repositorio remoto/demo, modelos y proveedores ligados
a sesión; selector por grupo/área/tema/subtema/plazo; UUID estable y confirmación
de retiro; reporte paginado; sección propia estudiante con carga/error/vacío;
acceso a práctica dirigida usando exactamente el snapshot autorizado (extender
el contrato de inicio de práctica existente, no enviar claves ni una lista libre
de preguntas para marcar cumplimiento). Reutilizar validación/calificación e
historial del servidor. No basta con abrir práctica aleatoria de un tema cuyo
catálogo pudo crecer. Incluir reintentos, revocación, red, tipografía ampliada y demo.

P4: tiempo/evolución; P5: ensayo integrado y teléfonos; D3: panel editorial real.

## Commit sin mezclar los cambios anteriores de Guardián

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend"
git add -p backend/prisma/schema.prisma
```

En el selector aceptar **solo** los bloques de `prioridadesDocentes` y
`model PrioridadDocente`. Responder `n` a `intentosGuardian`/`IntentoGuardian`.
No usar `git add .` ni añadir el esquema entero en este estado.

```powershell
git add backend/PROFESOR_P3_A.md backend/prisma/migrations/20260913090000_teacher_priorities backend/src/institucion/teacher-priorities* backend/src/institucion/institucion-acceso.service.ts backend/src/institucion/institucion.module.ts backend/tool/test_editorial_postgres.mjs backend/test/teacher-priorities-postgres.test.cjs
git diff --cached --stat
git commit -m "feat: guardar prioridades docentes y cumplimiento seguro P3-A"
```

No se hicieron commits ni push automáticamente.
