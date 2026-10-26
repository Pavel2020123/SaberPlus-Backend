# C5-C2 — Cierre local auditado

## Estado vigente — 23 de octubre de 2026

**C5-C2 cerrada en su alcance local.** D1–D7 y D8a–e cubiertos según el
[acta humana/técnica](C5C2D_VALIDACION_LOCAL.md), la
[entrega revisada](C5C2_REVISION_TIMEOUT_D8B.md) y los
[recibos sanitizados](evidencias/C5C2_TIMEOUT_D8B_2026_10_23.json).
Son ocho bloques; D8 contiene cinco subcasos. No significa que se probaron
todas las combinaciones, todos los dispositivos o todos los modos competitivos.

La entrega funcional ya está publicada e integrada en main:

| Repo | PR y merge | Entrega de la rama |
| --- | --- | --- |
| Flutter | PR #10, `44635ae` | `e9ba469` y sus commits anteriores |
| Backend/panel | PR #12, `9c225cb` | `d7b8c82` y sus commits anteriores |

Antes se integró la entrega parcial mediante Flutter PR #9/`b8253e2` y
backend PR #11/`3eb3f59`. Los PR antiguos Flutter #4/backend #7 se cerraron
sin fusionar. No son trabajo pendiente ni deben reabrirse.

Los remates de esta revisión se preparan en **fix/c5-c2-cierre-local**, en ambos
repositorios: retirada de una aserción innecesaria de TypeScript y conciliación
documental. No crean endpoints, migraciones, reglas o dependencias nuevas.
Su guardado/publicación requiere un commit/PR posterior; no asumir que ya se
publicaron por leer los hashes de la entrega funcional de la tabla.

## Qué se cierra

- Base y permisos de imágenes por opción; contrato/editor con texto obligatorio,
  imagen opcional, publicación directa y recuperación de operaciones inciertas.
- Proyecciones/snapshots y lectores Flutter sin soluciones anticipadas,
  compatibilidad con opciones antiguas y presentación proporcional.
- Práctica/corrección/historial, desconexión y reintento, aislamiento de sesión,
  texto grande y recorrido de juego con snapshot, dentro de las actas.
- Tira local: banco remoto independiente `TUG_LOCAL`, timeout confirmado por
  servidor, pausa/reanudación versionada y reintentos idempotentes. No crea una
  respuesta ficticia, no gasta un comodín ni genera XP por dejar vencer una ronda.
- Tira online: imágenes en snapshots, contorno del botón, interpretación del
  offset Socket.IO y recuperación del resultado al volver desde segundo plano.
- Batallas, Trivia y Fantasma: correcciones/presentación y recorridos registrados,
  sin ampliar su certificación competitiva ni cambiar reglas de recompensas.

Las tres migraciones de la entrega funcional son
`20261022203000_tug_local_timeout_scope`,
`20261022213000_tug_option_image_snapshot` y
`20261023150000_tug_local_pause`. Fueron probadas en PostgreSQL temporal por
el compañero; **no fueron aplicadas a una base remota en esta auditoría**.

## Evidencia y procedencia: no mezclar ejecuciones

### Auditoría repetida en el PC de Pavel el 23, antes de estos remates

- Flutter completo: **1.016 aprobadas /16 opt-in omitidas**, análisis global limpio.
- Backend: build aprobado y **128 suites /1.675 pruebas aprobadas**.
- Panel: **132 aprobadas** y sintaxis de **28 módulos** correcta.
- Revisión de código, contratos, migraciones y recibos sanitizados; espejos de
  acta/entregas/contrato/relevo/evidencia coincidentes.

### Evidencia conservada del compañero, no repetida por este cierre

- **50/50 PostgreSQL/HTTP**, Chromium y **73 migraciones** en base propia.
- Confirmaciones humanas D1–D7/D8a–e, con teléfono y emulador según cada sesión.
- D8a: el timeout no agota prematuramente el banco; pausa activa en8s y
  reanudación/acierto observados, sin selecciones inventadas al volver.
- D8b: figuras/selección se apoyan en el ensayo anterior explícito; el último
  duelo comprueba retorno tras final. No atribuirle selecciones ilustradas que
  no ocurrieron en ese último duelo.

### Validación específica de estos remates

La eliminación de `!` no cambia el JavaScript emitido ni el comportamiento.
`npm run build` aprobado (Prisma generate y Nest, sin conexión ni migración de BD).
Cinco suites Jest afectadas de Trivia/reglas/verificador/presencia/frontera:
**62/62 aprobadas**. ESLint dirigido confirma que el controlador nuevo tiene
**0 incidencias** y el servicio vuelve de7 a sus **6 anteriores**: eliminada la
nueva en la pausa, sin suprimir reglas ni ejecutar --fix. El lint dirigido del
servicio sigue devolviendo incidencias históricas; no se declara limpio.
No se repite la batería global Flutter por editar Markdown ni se convierte una
prueba unitaria en una confirmación física.

Verificación documental de los remates C2, antes de H0:418 rutas en19 documentos Flutter
y190 en17 documentos backend, sin destinos ausentes. Se comprueban rutas,
no disponibilidad de enlaces externos ni todos los anchors históricos.
Comprobar espejos y whitespace al entregar; no hubo nuevas pruebas Android/SQL.

## Límites conservados

- No hay nuevo ensayo Docker, Android, instalación USB o base de datos en este
  turno de remates. Las confirmaciones físicas pertenecen a las actas anteriores.
- Las16 pruebas opt-in omitidas no se consideran aprobadas; no se activó staging.
- Cierre local no es despliegue, CI remoto, beta, aprobación iOS o Play Store.
- Segundo plano no acredita cierre forzado. No se provocó pérdida física de ACK;
  reintentos/concurrencia/última pregunta conservan evidencia automática.
- No hay TalkBack humano nuevo ni certificación competitiva adicional de Ghost
  o Tira. La resolución CPU de Tira local no se convierte en evidencia remota.
- Continúa la deuda ESLint anterior; quitar esta incidencia nueva no significa
  declarar lint global limpio ni ejecutar una corrección masiva con --fix.
- Carga por opción apagada por defecto; adaptador de archivos solo development/test.
  No se habilitan flags productivos, buckets públicos ni descargas sin autorización.
- OV-1 conserva su compañero, ramas, código y checkpoint. No se tocó ese frente.
- Observación previa de empate mostrado como victoria en Fantasma permanece
  fuera del contrato de imágenes; no se cambió la regla en esta entrega.

## Siguiente paso exacto — resto de C5, no repetir C2

El propietario retoma el trabajo. [Contrato C5-H0 preparado](C5_HISTORICOS.md)
antes de PDF/offline; regla confirmada por Pavel: conservar la imagen original
en historial propio tras archivar la pregunta, salvo revocación por seguridad o
derechos. Sigue diseñar/implementar H1 (permiso normalizado y revocación segura),
después adaptadores/versiones H2 y validación H3. No hay implementación todavía;
no abrir permisos de forma general para evitar404.

Esta preparación documental no requiere Docker ni celular. La implementación
y sus pruebas integradas/físicas sí necesitarán sus entornos cuando corresponda.
No hay autorización automática para proveedor externo, gastos, migraciones
remotas o despliegue. PDF/offline, fotos/evidencias privadas, biblioteca/cuotas/
limpieza/respaldos y operación C5-D **siguen abiertos**. C2 no cierra toda C5.

Los documentos de entrega parcial y las entradas fechadas anteriores se conservan
como evidencia histórica. Para continuar prevalecen este cierre, el roadmap y
el prompt actualizado, no las órdenes antiguas de ejecutar D8b o empezar C2.
