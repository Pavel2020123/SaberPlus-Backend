# OV-1B — contrato privado de intereses declarados

Implementación independiente de orientación académica, instituciones y gamificación.
`rulesVersion = 1`: 30 preguntas estáticas, seis familias, cinco preguntas por familia.
El catálogo en código conserva los textos del contrato. Antes de publicar, su contenido
y cualquier futura recomendación requieren revisión. No se afirma validación científica,
diagnóstico, aptitud, certeza vocacional ni probabilidad de éxito.

## Acceso y API

Todas las rutas usan `JwtGuard` y `EmailVerificadoGuard`, según la política existente
de verificación del correo. El servicio verifica nuevamente el rol actual `ESTUDIANTE`
bajo lock de usuario. Profesores y administradores no obtienen acceso especial.
La identidad procede exclusivamente de `req.usuario.sub`. No se exige plan pago.
Un recurso ajeno y un UUID inexistente producen el mismo 404.

| Método y ruta bajo `/orientacion-vocacional` | Contrato |
| --- | --- |
| GET `/` | `{ intento: ... }` o `{ intento: null }` |
| GET `/cuestionario` | Catálogo, escala, naturaleza, versión y revisión de contenido pendiente |
| POST `/intentos` | Cuerpo vacío; crea o reanuda el único intento activo |
| PATCH `/intentos/:id/respuestas` | `{ "respuestas": [{ "preguntaId": "T1", "valor": 4 }, { "preguntaId": "S1", "valor": "NO_SE" }] }` |
| POST `/intentos/:id/finalizar` | Cuerpo vacío; calcula en servidor; reintentar devuelve el mismo resultado |
| GET `/historial?pagina=1` | `{ pagina, porPagina: 20, total, intentos }`, orden de inicio descendente e ID estable |
| GET `/intentos/:id` | Intento propio con respuestas y snapshot si está completado |
| DELETE `/intentos/:id` | 204; elimina intento, respuestas y resultado propio |

PATCH admite 1–30 preguntas distintas y modifica solamente las indicadas. Los valores
son enteros JSON 0–4 o la cadena exacta `NO_SE`; no se convierte la cadena `"4"` a número.
No admite campos de identidad, puntajes ni versión elegidos por el cliente.
Las respuestas omitidas en PATCH conservan su valor; una pregunta no respondida y `NO_SE`
son evidencias diferentes aunque ninguna aporte al denominador. Un intento completado
rechaza ediciones con 409. Una repetición crea otro intento sin sobrescribir el anterior.

## Cálculo, cobertura y conservación

Por familia: `suma / (cantidadValidas * 4) * 100`. Cero es evidencia válida;
`NO_SE` no suma, no penaliza y no entra al denominador. Finalizar exige al menos
24 valores numéricos y al menos tres por familia. De lo contrario se devuelve 409
`COBERTURA_INSUFICIENTE`, con los conteos, sin resultado; se puede seguir corrigiendo.

La selección de principales compara productos cruzados de las fracciones exactas,
sin ordenar por un puntaje redondeado. Incluye todas las familias empatadas con la
tercera. La posición de serialización de familias empatadas no indica una prioridad
adicional. Un puntaje sin evidencia es nulo, no cero.

El snapshot almacena versión, preguntas/textos/familias, respuestas, sumas,
denominadores, conteos, puntajes, principales y fecha de finalización. La cobertura
se representa por numerador `cantidadValidas` y `totalPreguntas`, global y por familia.
El historial devuelve ese snapshot; no lo recalcula con el catálogo de una versión futura.
Los intentos activos de una versión desconocida se conservan pero su edición/cierre
se rechazan hasta contar con su motor versionado. V2 requerirá un cambio explícito del
catálogo, evaluador y guard de creación SQL; nunca se promocionan intentos anteriores.

Política de retención V1: sin TTL ni borrado automático. Se conserva hasta eliminación
por su propietario (o borrado de la cuenta por la relación existente). DELETE retira
la fila principal y las respuestas en cascada; el resultado reside en la fila principal.
Esto no pretende definir una política regulatoria definitiva ni modificar respaldos.

## Persistencia y límites operativos

La migración nueva `20261014120000_vocational_orientation_v1` sigue a
`20261012180000_institution_logo`. No modifica migraciones anteriores.
Agrega `IntentoVocacional`, `RespuestaVocacional` y `EstadoIntentoVocacional`.
Solo añade a `Usuario` la relación inversa.

SQL adicional que Prisma no expresa: índice parcial único de un intento EN_PROGRESO
por usuario, checks de preguntas/valores y coherencia terminal, triggers de identidad
inmutable e inmutabilidad tras completar. El borrado del padre permite la cascada de
respuestas completadas. Todos los métodos usan una transacción con lock `Usuario`
y luego, al operar un intento, lock del intento. Dos instancias comparten esos locks.
Inicio concurrente se serializa y además queda protegido por el índice parcial.
Edición y finalización se serializan; el cálculo y el cierre ocurren en una transacción.
No se conecta a ledger, XP, ranking ni datos académicos.

Ambas tablas habilitan RLS y revocan acceso de PUBLIC, anon y authenticated cuando
estos roles existen. La API utiliza el rol privado del backend y aplica autorización
por cuenta; no se crean policies para acceso directo de clientes. Antes de despliegue
deben verificarse privilegios del rol real (owner/BYPASSRLS o acceso privado aprobado),
aplicar la migración autorizadamente y revisar contenido. No hay evidencia productiva.

## Validación reproducible

- `node --test test/orientacion-vocacional-rules.test.cjs`: ocho comprobaciones
  del contrato puro usando Node 24 y su soporte nativo de TypeScript, sin dependencias.
  Permite comprobar ejemplos/cobertura cuando Nest/Jest no están disponibles;
  no sustituye las pruebas HTTP, build ni la base real.
- `npm test -- --runInBand orientacion-vocacional`: reglas puras y contrato HTTP con
  JWT/guards/servicio reales y un doble de persistencia; no demuestra PostgreSQL.
- `node tool/test_editorial_postgres.mjs --orientacion-vocacional`: runner existente
  ampliado con selección OV-1. Verifica binarios antes de crear recursos; instancia
  propia en loopback, puerto aleatorio, usuario y directorio temporales. No lee `.env`.
  Aplica SQL de migraciones de HEAD y esta migración local si aún no está confirmada.
  Prueba dos clientes independientes, HTTP privado, historial, cobertura, inmutabilidad,
  constraints, cascada y RLS. No usa una base remota ni una instancia preexistente.
- `npm run db:validate`, `npm run build`, `git diff --check`.

Las validaciones ejecutadas y sus límites se entregan en el informe de esta ronda.
La existencia de las pruebas no equivale a haberlas ejecutado ni autoriza producción.

## Evidencia de cierre local OV-1B — 2026-10-14

Validación realizada antes del commit local:

- `prisma validate`: PASS.
- `prisma generate`: PASS con Prisma Client 5.22.0.
- `npm run build`: PASS.
- Reglas puras con Node: 8/8 PASS.
- Jest de reglas OV-1: 18/18 PASS.
- Jest de contrato HTTP OV-1: 13/13 PASS.
- Suite PostgreSQL real OV-1: 9/9 PASS sobre PostgreSQL 17 desechable en loopback.
- Suite Jest global del backend: 119/119 suites y 1405/1405 pruebas PASS.
- Cadena completa de 65 migraciones aplicada desde cero en PostgreSQL 17:
  PASS, incluida `20261014120000_vocational_orientation_v1`.
- Confirmados en PostgreSQL real:
  constraints, triggers, RLS e índice parcial `ov1_un_activo_por_usuario`.
- Confirmados mediante pruebas PostgreSQL reales:
  aislamiento entre cuentas, roles, persistencia, reanudación, repetición,
  historial, concurrencia, snapshot, cobertura, `NO_SE`, inmutabilidad,
  eliminación propia y cascada.

Limitaciones que permanecen fuera del cierre funcional de OV-1B:

- `npm ci` reproducible sigue bloqueado por problemas preexistentes del lockfile /
  resolución de dependencias. Para la validación se reutilizó un `node_modules`
  local y `sharp@0.35.5` se instaló únicamente de forma temporal con `--no-save`
  y sin cambios en `package.json` ni `package-lock.json`.
- La instalación temporal de dependencias reportó vulnerabilidades del árbol
  general; no se ejecutó `npm audit fix` ni se atribuyen a OV-1B.
- El contenido vocacional continúa pendiente de revisión antes de publicación.
- No existe evidencia de producción, despliegue ni migración en base remota.
- No se realizó push, merge ni deploy.

Siguiente paso del frente: integrar el contrato OV-1B desde Flutter en OV-1C,
manteniendo separada la orientación vocacional de la orientación académica existente.
