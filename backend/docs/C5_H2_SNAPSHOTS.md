# C5-H2A — Imágenes de snapshots propios: Cima, Guardián y Rescate

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md).
Sigue H3. La evidencia inferior corresponde a cada incremento fechado.

## Checkpoint — 24 de octubre de 2026

**Antecedente: H2A implementada y validada localmente; entonces H2 seguía abierta.**
Continuación: [H2B1 — Trivia/Fantasma y Tira local](C5_H2B1_TRIVIA_LOCAL.md).
La evidencia inferior corresponde al cierre H2A; no sumar ambas suites.
Rama `fix/c5-c2-cierre-local` en ambos repositorios. Backend/editorial y documentación;
sin cambios funcionales Flutter, Android, OV-1, commit, push o despliegue.
[Contrato histórico](C5_HISTORICOS.md), [cierre H1](C5_H1_HISTORIAL_REVOCACION.md).

## Inventario y límites por origen

| Origen | Evidencia y alcance actual |
| --- | --- |
| Cima | `IntentoCima.preguntas`, formato1,12 preguntas; dueño de la fila, respuestas por posición. Soportado en H2A. |
| Guardián | `IntentoGuardian.preguntas`, formato1,8 preguntas; pregunta actual y revisión confirmada. Soportado en H2A. |
| Rescate | `IntentoRescateEstrellas.preguntas`, formato1,10 preguntas; dueño y avance confirmado. Soportado en H2A. |
| Trivia/Fantasma y Tira local | [H2B1](C5_H2B1_TRIVIA_LOCAL.md): Trivia/Fantasma con snapshotInicial V1 y confirmaciones finales; nuevas CPU con snapshotLocal privado, legado null sin backfill. No hereda la regla por longitud de H2A. |
| Tira online | [H2B2 validada localmente](C5_H2B2_TIRA_ONLINE.md): copia V1, presentación por participante/pareja y certificación R cuando corresponde. No basta pertenecer a la partida. |
| Batallas | [H2B3 validada localmente](C5_H2B3_BATALLAS.md): nuevas asignaciones con copia privada V1, avance/respuesta propia, corrección e historial originales. Legado null sin backfill. |
| Lecciones y casos sin snapshot | [H2B4 validada localmente](C5_H2B4_FUENTES_MUTABLES.md): publicación actual o denegación sin prueba; progreso/ID/FK mutable no otorgan permiso histórico. Un caso de copia soportada conserva la política de su adaptador. |

No reactivar juegos retirados. No convertir esta tabla en una declaración de validación
de todos los formatos, endpoints o partidas competitivas productivas.

## Implementación

- Nuevo adaptador acotado `backend/src/editorial-files/editorial-snapshot-access.ts`.
  Tres tablas constantes del servidor; nombres SQL nunca proceden del cliente.
- Conserva `GET /recursos/editoriales/:id`, guards, JWT como propietario, integridad,
  WEBP privado/no-store y revocación H1. Publicación vigente e historial H1 siguen
  sus rutas de autorización; el adaptador solo se consulta si no conceden acceso.
- Solo reconoce imagen de enunciado, opciones y caso de la pregunta original.
  No busca URLs recursivamente en claves internas, soluciones, notas o texto libre.
- Formato1 y longitud exacta12/8/10. Pregunta/ID/enunciado/opciones/ID de correcta
  deben tener forma reconocida. Se valida todo el prefijo de respuestas:
  pregunta por posición, opción perteneciente a esa pregunta y corrección consistente.
  Un contador, una posición o un array rellenado con respuestas ajenas no bastan.
- Permite la pregunta actual únicamente con estado ACTIVO y plazo vigente, o una
  pregunta de ese prefijo confirmado. Tras expirar/abandonar/finalizar, no abre
  preguntas que quedaron sin responder. Nunca concede por una pregunta futura.
- No añade pantallas de historial ni revela correctas/explicaciones nuevas:
  solo autoriza bytes de imágenes originales cuyo permiso se comprobó.
- La identidad del archivo sigue ligada a su UUID y bytes/SHA registrados; no se
  sobrescriben en los reintentos. El snapshot guarda la ruta original. No se
  reconstruye desde el banco editado ni se copia una nueva imagen al pasado.
- Migración aditiva `20261024130000_editorial_solo_snapshot_access`: tres índices
  GIN jsonb_path_ops y triggers que impiden reescribir preguntas, versión,
  propietario o ID de esas partidas. Responder/expirar conserva el flujo existente.
- El retiro normal consulta referencias en los tres snapshots incluso si son
  futuras o la lectura está desactivada. Protege bytes sin conceder permisos.
  Una versión desconocida puede impedir limpieza por precaución, pero no leer.
  La revocación explícita sigue permitida y prevalece, sin borrar resultados.
- Consultas SQL por propietario y contención indexable; no cargar todos los JSON
  en Node ni cortar arbitrariamente a los primeros intentos de un alumno.
  RLS/permisos previos se conservan; no se añade acceso directo PostgREST.

## Activación

`EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED=false` por defecto, independiente
de la lectura H1. Requiere archivos locales habilitados y NODE_ENV development/test.
Aplicar la migración nueva antes de habilitarla en el entorno de pruebas autorizado.
No se activó en producción ni se usó una base existente.

## Evidencia local del24/oct

- Jest dirigido: **10 suites /159 pruebas aprobadas**, incluidas9 nuevas unitarias
  de SQL parametrizado/allowlist/retención/flag y las regresiones H1/consumidores.
- PostgreSQL16/HTTP: **68/68**, sin omitidas;58 previas y10 H2A nuevas,75 migraciones
  aplicadas solo al contenedor propio limitado a512MiB y datos tmpfs.
- Primera pasada68/68; segunda pasada completa tras añadir reloj vencido sin
  transición de estado y snapshot incompleto: **68/68 en73,9s**. No sumar las pasadas.
- Para cada juego: actual propia, futura denegada, otro alumno/docente, flag apagado,
  plazo vencido, avance legítimo, conservación tras expirar, revocación, retiro de
  archivos aún referenciados, inmutabilidad, prefijo corrupto y metadatos ignorados.
- Índices GIN comprobados en PostgreSQL. EXPLAIN ANALYZE/BUFFERS de la consulta real
  en el fixture final: ejecución1,916ms, planificación7,667ms. No es una garantía
  de latencia productiva ni prueba de carga; el planner puede preferir otro índice
  con pocos registros. No se forzó un plan para fabricar un resultado.
- Regresión del panel Chromium escritorio/390px aprobada dentro de esas68.
  No es prueba física Android ni UI nueva del adaptador.
- ESLint dirigido del adaptador/runtime/servicio y prueba del adaptador: aprobado.
- Un intento de regenerar Prisma mientras el test real mantenía la DLL abierta
  produjo EPERM en Windows. Esperar al cierre del runner y repetir el build;
  no borrar node_modules, interrumpir procesos ajenos ni cambiar dependencias.
- El runner confirmó eliminación del contenedor y directorio temporal propios.
- Build final con generación Prisma aprobado después de terminar el runner;
  el EPERM anterior quedó resuelto sin cambios de dependencias.
- Documentación:42 Markdown con cambios locales revisados (incluidos los previos),
  697 enlaces locales sin destinos ausentes y actas H2A/H1/H0/guía C5 espejo.
  Diff sin errores de whitespace; no se afirmaron enlaces externos o anclas verificadas.

## Reproducción y continuación

Desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
npm run test:editorial-files:postgres
```

Ejecutar build/generate **antes o después** del runner, no durante su uso de Prisma
en Windows. El runner no acepta URL externa, crea credenciales efímeras y elimina
solo los recursos cuyo propietario verifica.

**Continuación H2B:** [H2B1](C5_H2B1_TRIVIA_LOCAL.md) registra Trivia/Fantasma y
Tira local, su implementación y evidencia. [H2B2](C5_H2B2_TIRA_ONLINE.md) cubre
Tira online. [H2B3](C5_H2B3_BATALLAS.md) cubre Batallas. Sigue H2B4 fuentes mutables
sin evidencia suficiente ya validada en [H2B4](C5_H2B4_FUENTES_MUTABLES.md). H2 cerrada
en su alcance backend local; sigue H3 y quedan6 entregas C5.
No copiar a esos módulos el prefijo por longitud de los tres juegos de H2A.

Mantener flags apagados y avisar antes de necesitar Docker/USB. Al cerrar H2A
quedaban7 entregas C5 y H2 solo había avanzado parcialmente. El checkpoint
superior y el acta H2B4 registran el cierre posterior de H2; H3 sigue pendiente.
