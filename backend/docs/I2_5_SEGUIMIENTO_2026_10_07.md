# Seguimiento I2-5 — 7 de octubre de 2026

## Continuación del 8 de octubre

Revisados criterios funcionales del lector con recorrido Android del propietario
y evidencia HTTP/SQL documentada. Reejecutados Flutter ranking 66/66 y backend
ranking 43/43, dos suites. Limpieza/cierre operativo y deuda QA-1 conservados.
[IC-1A Cima](IC1_CIMA.md) comienza localmente en Flutter; pendiente IC-1A2 real.
No cambios funcionales backend ni activación competitiva.

API/panel reactivados con base temporal nueva; 61 migraciones y panel HTTP 2/2.
Edición manual desde ADMIN aparece en Android y progreso guarda 100 %.
Tras responder 9 (correcta 6), la edición de explicación creó nueva pregunta
publicada. SQL confirmó dos intentos: anterior conserva explicación y pregunta
archivada; nuevo usa la explicación nueva y versión publicada. Propietario
confirma explicación actualizada en la app. Sin captura visual independiente.
El conflicto inicial EDITOR_STALE desapareció tras recargar; revisión que incluye
contadores de uso sigue como hallazgo, no corregida. No cierra P5/D3 productivos.

La limpieza de la sesión del 7 inferior no acredita cierre de esta sesión nueva.
API y panel de ensayo tienen seguimiento independiente y límite temporal.

## Resultado posterior del recorrido

Propietario confirma Android: login/cambio de cuenta, TOP 50 y propio 51,
filtros/años, vacío/no disponible, cuentas cero/sin balance, privacidad visual,
profesor sin acceso, corrección propia a 1/2100 XP, red/reintento, fondo/retorno,
texto grande y teclado. Nueva API aislada rechaza token previo; nuevo login
recupera propio 51/100 XP. No acredita revocación individual ni expiración por reloj.
ADMIN permanece verificado por HTTP; ranking general físico solo estado vacío.
Auth/ranking HTTP 6/6 en las ejecuciones documentadas y panel real 2/2.

Supervisor de última sesión confirmó cierre y retirada de API/base/directorio;
reverse USB retirado. Dos carpetas antiguas de ensayo pendientes de limpieza
por restricción del entorno. Sin eliminación global ni secretos publicados.
Detalle en Flutter `docs/I2_5_RECORRIDO_ANDROID.md`. I2-5 en revisión final
de criterios; recorrido funcional confirmado, QA-1 y producción separados.
Los impedimentos iniciales inferiores se conservan como antecedentes.

Base `b122d91`, main limpio al iniciar. Flutter `c2b9b54`.
Sin cambios funcionales, dependencias, migraciones ni servicios remotos.

## Panel: comprobación repetida

Desde admin, `node --test test/*.test.mjs` (mismo comando de npm test):

| Ejecución | Aprobadas | Fallos/omitidas/canceladas | Duración |
| --- | --- | --- | --- |
| 1 | 88/88 | 0/0/0 | 1567,9195 ms |
| 2 | 88/88 | 0/0/0 | 1462,7863 ms |
| 3 | 88/88 | 0/0/0 | 1388,4937 ms |

Concurrencia predeterminada; sin cambiar código, aserciones o timeouts.
El fallo del PC del compañero no se reprodujo. Causa sigue sin confirmar;
estas repeticiones no lo declaran resuelto. Si reaparece, conservar nombre del
test, stack, tiempo, versiones y recursos antes de modificar su sincronización.

## Lint: clasificación sin autoarreglo

Node 24.11.1/npm 11.6.2 del PC de Pavel; manifest fija 24.14.1/11.11.0.
ESLint sin --fix, patrón `{src,apps,libs,test}/**/*.ts`, formato JSON:
exit 1, 603 errores y 150 avisos. No se cambian reglas ni baseline.

| Grupo de errores | Cantidad | Tratamiento propuesto en QA-1 |
| --- | --- | --- |
| prettier | 192 | Cambios de formato separados de lógica y revisados por módulo |
| no-unsafe-member-access | 172 | Tipar entradas/fixtures; validar unknown, no ocultar con any |
| no-unnecessary-type-assertion | 98 | Revisar inferencia y eliminar aserciones realmente redundantes |
| no-unsafe-assignment | 69 | Contratos/tipos explícitos y validación de respuesta |
| no-unsafe-call / return | 54 | Revisar límites y retornos, sin desactivar reglas |
| no-misused-promises / unbound-method | 10 | Priorizar revisión de callbacks, errores y receptor this |
| require-await / no-base-to-string / no-require-imports | 8 | Revisar por caso, preservar contratos asíncronos |

Mayor concentración: competitive.tug-replay.ts (93), certificado-html.service.spec.ts
(47), competitive.solo.ts (45), competitive.tug-visibility.spec.ts (34).
Son hallazgos estáticos, no bugs funcionales demostrados ni culpa atribuida a una entrega.
No se autoriza un arreglo masivo; abordar por módulo con sus pruebas. La diferencia
frente al informe de 567 no tiene causa establecida; alinear entorno antes de comparar.

## Antecedente: impedimento inicial y siguiente acción de aquella ejecución

ADB no detectó celular y no había API local escuchando en 43187. No se intentó
usar credenciales remotas ni se reejecutó la regresión PostgreSQL ya documentada.
En Flutter: `docs/I2_5_RECORRIDO_ANDROID.md` contiene la matriz pendiente.
Conectar Android y acordar equipo/entorno de API antes del recorrido. I2-5 abierto.
