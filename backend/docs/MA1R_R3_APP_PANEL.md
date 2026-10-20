# MA-1R / R3 — Cliente Flutter, ADMIN y demo compatibles

**Continuación del19:** [R4](MA1R_R4_VALIDACION_LOCAL.md) ya registra12/12 humanos
y45/45 PostgreSQL/HTTP, incluyendo corrección reproducida P2010/40001. Remate
visual confirmado en Flutter: cierre local R4 e integración a main por PR API #9/app #6
(eef0d40/21757a1), CI backend del PR aprobado. Sin SQL remoto/producción.
Las menciones inferiores de SQL sin aplicar/no ensayo pertenecen al cierre R3.

**18 de octubre de 2026. Implementación local**, rama `feat/ma1r-reportes-preguntas`
en los dos repositorios, sin commit/push/merge/despliegue de R1–R3.
[Contrato efectivo backend R2](MA1R_R2_BACKEND.md). UX y checkpoint maestro en
`docs/MA1R_REPORTES_PREGUNTAS.md` y `docs/MA1R_R3_APP_PANEL.md` del repo Flutter.
Se conservan los contratos de R2, la migración sin aplicar y el frente OV-1 separado.

## Panel ADMIN

- [Cliente](../../admin/public/api.mjs),
  [contratos](../../admin/public/question-report-fields.mjs),
  [bandeja](../../admin/public/question-reports.mjs), navegación y módulos estáticos
  incorporados a la allowlist del servidor. Ningún token/contraseña se persiste.
- Filtros área/subtema ID/estado/motivo, paginación de20 y detalle privado con
  snapshot/auditoría. Render con textContent: sin ejecutar HTML ni cargar medios.
- Confirmación explícita del estado, motivo interno de1–500 puntos de código,
  UUIDv4 y revisión esperada. Estados y permisos siguen definidos por R2; no
  implica revisar contenido antes de publicarlo ni cambia el editor simple.
- Error incierto conserva UUID/payload; se puede consultar el estado actual y
  reintentar **la misma decisión**, no crear otra ni cambiarla. GET detalle no
  prueba que la decisión propia se guardó. Un429 después de timeout no libera
  el intento. Navegación bloqueada mientras está incierto; logout limpia todo.
- Rechazo definitivo del primer envío conserva motivo y exige detalle vigente
  antes de otra decisión. Tras éxito se consulta detalle actual, no se pinta un
  recibo viejo como estado actual. Respuestas tardías tras logout se descartan.

## Cobertura y demo

[Cobertura](../../admin/public/bank-coverage.mjs) pide `reportesVersion=1` y valida
conteos no negativos, preguntas distintas≤reportes. Incluye originales archivados;
no exige reportes≤publicadas. Mantiene lectura legacy false/null, sin falso cero.
Solo400 al opt-in permite reconsulta legacy; no fallback para503/red/401/403.
Botón por subtema abre la bandeja con área/subtema, inicialmente sin filtrar estado.

[Demo](../../admin/demo-question-reports.mjs) ADMIN sobre `demo-legacy-q2`, original
archivado ya existente, bajo `demo-legacy-sub`. No modifica conteos académicos ni
crea preguntas publicadas. Conserva recibos originales, revisiones y auditoría en
memoria; cobertura responde a sus estados abiertos. Reiniciar borra las decisiones.
No implementa reportes STUDENT en demo ni acredita evidencia/cuotas/RLS/DB reales.

## Flutter del otro repositorio

Feature `lib/features/question_reports/`: dominio, repositorio remoto, controlador
por pregunta/cuenta y formulario/listado. Entrada solo en revisión calificada de
práctica por subtema, aleatorias y simulacro por área; real STUDENT verificado.
No habilitada en prioridades/adaptativo/histórico/jornada/contrarreloj/juegos/demo.
Backend sigue verificando identidad/evidencia; no depende del permiso visual.

Un intento incierto no permite editar; GET recibo o replay conservan payload/UUID.
Duplicado no sustituye detalle original. Mis reportes consulta estado **actual**.
Otro motivo se inicia solo tras confirmar. Borradores solo en memoria de la sesión,
no cola offline ni persistencia tras reiniciar. Cuenta/eligibilidad invalidan estado;
SessionDio fija revisión de sesión antes de interceptores. Sin nuevo router o deps.

## Pruebas ejecutadas

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\admin"
npm run check
npm test
```

- Sintaxis: **26 módulos**. Regresión completa ADMIN: **109/109** aprobadas,
  incluidas14 nuevas de contratos, confirmación cancelada, doble clic, revisión
  obsoleta, retry/429 incierto, logout tardío, texto seguro y cobertura dual.
- HTTP efímero Node/demo en loopback: rutas privadas, assets, autenticación ADMIN,
  reporte archivado, replay original, estado actual y cobertura cambiante. El
  servidor se cierra al terminar; **no es Nest ni PostgreSQL real**.
- Flutter dirigido: **32/32** aprobadas (22 reportes+10 práctica). Consultar el
  acta Flutter para comandos; no representan instalación/pruebas físicas.
- Regresión Flutter del18: **917 aprobadas/13 opt-in omitidas**, sin fallos;
  análisis sin incidencias y formato de siete Dart comprobado. Las13 omitidas no
  acreditan integración. Documentación conjunta:35 archivos/699 destinos locales,
  ninguno inexistente (sin anchors/web); diff sin errores de whitespace en ambos.
- R2 conserva sus121 suites/1.560 y build/TypeScript del17: no se reejecutó Jest
  backend al cambiar solo el consumidor/panel de R3. No adjudicar CI institucional
  a este bloque. Node24.11.1/npm11.6.2 locales; pins de proyecto no modificados.

## Pendiente R4 y operación

Escribir/ejecutar pruebas sobre PostgreSQL local desechable + HTTP Nest autorizado,
aplicar secuencia completa de migraciones solo allí, aislamiento/cuotas/races/RLS,
rollback, permisos, recibos/capturas/conteos reales. Después Android/API/panel con
cuentas ficticias, desconexión y cambios de cuenta; revisión visual y accesibilidad.
La implementación R3 y los mocks no prueban almacenamiento real ni producción.

No servicios persistentes, APK, SQL aplicado, nuevas credenciales, Supabase/Render,
commit/push/merge/despliegue o cambios OV-1 en esta entrega. Antes de integrar:
coordinar migración aditiva R2 y base documental por PR, verificar CI propio;
antes de publicar: retención/anonimización, proxy/multiinstancia y staging.
P5/D3 continúan pausadas. No repetir pruebas institucionales por estos pendientes.
