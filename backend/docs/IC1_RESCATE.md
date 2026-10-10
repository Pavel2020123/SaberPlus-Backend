# IC-1C — Cliente competitivo de Rescate

**Cierre funcional local, 10 de octubre:** recorrido Android/API/SQL aprobado en
el alcance registrado al final. Sin activación productiva. Siguiente: commits de
esta entrega e instituciones. Las entradas pendientes inferiores son históricas.

9 de octubre de 2026. Cliente Flutter integrado contra el backend existente;
sin cambios de lógica del servidor ni migraciones en esta entrega.
Acta principal: `docs/IC1_RESCATE.md` del repo Flutter `Pavel2020123/saber_plus`.

- Creación opt-in booleana, modalidad confirmada y guardada por cuenta/API,
  UUID pendiente persistido, reintentos, recuperación y enlace al ranking.
- Flutter dirigido: 62 aprobadas (40 anteriores +22 nuevas). Backend: 32/32
  en tres suites de Rescate/solo competitivo. Suite global Flutter aprobada,
  detalle al final; no confundir checks automáticos con recorrido humano.
- HTTP real mediante repositorio Flutter y cuenta zero de la base Docker propia:
  dos ejecuciones aprobadas (1 normal y1 competitiva). Seis aciertos, restauración
  tras la primera respuesta, final recuperado y reenvío HTTP terminal idempotente.
- SQL: normal `3db0a027-5c65-453b-9a4a-ac6e37184f5f` VICTORIA, sin evento;
  competitivo `d2bac1d6-c9ff-427a-aa09-f788eb964fec` VICTORIA, único evento+100,
  saldo100. Relectura/reenvío no duplicaron XP. Student del teléfono sin intentos
  de Rescate en esa comprobación. No copiar IDs ni saldos a otra sesión.
- Admisión SOLO devuelta a OFF con ACK después del ensayo automático.
- Test reproducible: `test/star_rescue_local_api_test.dart` en Flutter, archivo
  privado del harness solo para tests, y `RESCUE_LOCAL_COMPETITIVE=true` únicamente
  para ejecución con SOLO ON propio. Zero comparte contraseña efímera del harness.

APK Flutter separada compilada/verificada, instalada USB con Success y abierta;
analyze final limpio. Suite global Flutter: 754 aprobadas/10 opt-in omitidas,
cero fallos (6 min 4 s). Las omitidas no acreditan ensayos reales.
Primer caso físico aprobado: usuario confirma el rechazo de admisión OFF en
Android; SQL posterior conserva 0 intentos de Rescate para student. API health200.
Admisión local habilitada después con `solo-on`, ACK `enabled:true`; usuario
confirma pregunta «11+1». SQL: intento `a6ec3648-24ee-47d0-91f8-e59b2b68b9ab`,
ACTIVO, MATEMATICAS/BASICO, competitivo v1, 0 respuestas, sin evento XP.
Admisión ON aprobada. No se activó producción.
Recuperación Android aprobada: usuario confirma «11+1» tras cerrar/reabrir;
SQL conserva el mismo intento ACTIVO competitivo con 0 respuestas y sin evento
XP ni intentos adicionales. Siguiente: corte USB reverse antes de responder.
Corte USB reverse aprobado: usuario confirma error de conexión al enviar 12
para «11+1»; SQL mantiene mismo intento ACTIVO, 0 respuestas y sin evento XP.
Reverse43187 restablecido y API health200. Reintento aprobado: usuario ve
«Liberaste una estrella»; SQL confirma mismo intento competitivo ACTIVO con
exactamente 1 respuesta guardada y sin evento XP. UUID cubierto por tests, no
extraído del dispositivo. Siguiente: OFF de nuevas admisiones sin invalidar intento.
SOLO OFF confirmado con ACK enabled:false; continuidad aprobada: usuario confirma
segunda estrella, SQL mantiene mismo intento ACTIVO competitivo con 2 respuestas
y ningún evento XP. Siguiente: completar cuatro estrellas restantes y comprobar
victoria/ledger/ranking. Mantener OFF; no crear otra partida competitiva.
Victoria confirmada por SQL tras finalización indicada por usuario: mismo intento
VICTORIA, 6 respuestas, competitivo v1, competitiveSettledAt no nulo. Exactamente
1 evento STAR_RESCUE del intento, delta+100, saldo Rescate100. No equivale al
balance de otros juegos. Siguiente: consulta visual del ranking y reapertura.
Ranking Android aprobado: usuario confirma su posición con 100 XP y otra cuenta
con 100 XP (zero, ensayo automático). SQL posterior conserva un único evento
+100 del intento físico. Siguiente: cerrar/reabrir resultado y consultar ranking.
Reapertura Android aprobada: usuario confirma victoria recuperada y ranking100.
SQL posterior conserva mismo intento VICTORIA con 6 respuestas y exactamente
1 evento +100/saldo100; sin intentos adicionales ni XP duplicados.
Victoria normal Android aprobada: intento 9322a923-cece-46a8-b840-fe3dc76e497c,
VICTORIA, 6 respuestas, MATEMATICAS/sin filtro dificultad, competitiveRulesVersion
y competitiveSettledAt nulos. Sin evento de este intento; permanece exactamente
1 evento previo +100/saldo100. SOLO sigue OFF. Siguiente: agotamiento parcial y
abandono competitivos, habilitando admisión local antes de cada nuevo intento.
Admisión ON habilitada con ACK enabled:true para siguiente ensayo parcial:
Matemáticas/Básica competitivo, 3 aciertos y 7 errores deliberados; 10 respuestas.
Guion original: AGOTADO con 3 estrellas/1 constelación, +40; no fue ejecutado así.
Variante real aprobada: usuario obtuvo 2 estrellas; SQL confirma 2 aciertos/8 errores,
10 respuestas, AGOTADO competitivo v1 liquidado. Intento
0f5c72cd-6dca-49b2-9fb6-831be4310bf2: evento único +20, saldo Rescate120.
Siguiente: otro intento competitivo, abandono explícito sin respuestas. Admision
local habilitada durante el ensayo. Resultado real: 2 abandonos separados sin
respuestas, competitivos v1 liquidado. ed4cbb92-08d4-4c25-9ad5-6dad41bcfd48:
evento único −10/saldo110; 11bb64f0-7e1c-4b20-846d-916970aacb27: evento único
−10/saldo100. SQL correcto: −20 total por 2 intentos diferentes, no repetición.
Usuario cree ver solo −10; pendiente reabrir ranking/confirmar saldo100 visible.
No atribuir causa a caché sin verificar. Al solicitar SOLO OFF, harness terminó
con «Unexpected end of JSON input» y confirmó eliminación de API/PostgreSQL propios;
no hubo ACK OFF. SQL documentado se leyó antes del cierre. Contraste visual final
pendiente; base efímera eliminada, no recrear saldos/IDs como evidencia nueva.
HTTP automático usa almacenamiento en memoria; no acredita plugin seguro ni USB.
No probado: pérdida real del acuse tras persistir, TTL24h físico, audio/iOS,
producción. Actualizar actas/checkpoint tras cada caso; después instituciones.

## Supervisor corregido y sesión nueva focalizada

Lectura control.json extraída a local_control_file.mjs: JSON parcial/inválido no
ejecuta orden ni cierra sesión; errores de disco/permisos no se ocultan.
12 pruebas Node aprobadas (4 archivo/8 IPC), ahora en CI. Runtime real: archivo
parcial ignorado, API health200, luego solo-on ACK enabled:true sin reinicio.
Flutter analyze limpio y 62 dirigidas aprobadas nuevamente; global754/10 anterior.

Sesión nueva propia con 61 migraciones, API43187 y USB reverse. Preparación de
puntos mediante test Flutter opt-in con cuenta student, 1/1 aprobado: intento
e7976df5-80f2-46ed-a062-64e94ec9660c VICTORIA/6 aciertos, único evento +100/saldo100
SQL. Son partidas/verificador reales ejecutados automáticamente, no balances
copiados ni victoria humana. Nunca reutilizar IDs/saldo120 de la sesión anterior.
Siguiente: login nuevo y contraste visual100→90→80 tras dos abandonos diferentes,
con comprobación SQL por paso. SOLO ON, cierre/commits finales aún pendientes.

Checkpoint activo 10 de octubre: usuario informa fin de sesión; API/panel se
reiniciaron, ambos HTTP200, nueva base propia/61 migraciones, reverse USB43187.
SOLO ON confirmado. Nuevo ensayo automático student 1/1 Flutter aprobado:
f41e7c58-6731-480e-80d0-331a04b8874b VICTORIA/6 estrellas, competitivo v1,
evento único+100/saldo100 SQL. Datos y credenciales anteriores no se reutilizan.
Siguiente humano: login nuevo/ranking100, dos abandonos distintos 100→90→80,
SQL por paso. No recompilar APK ni repetir batería aprobada. Directorios anteriores
no eliminados en este reinicio; limpieza propia sigue separada del resultado.

Primer abandono de la sesión10: usuario ve100 XP; SQL confirma intento
6547f9e8-a774-48fe-a755-aca249d98bbf ABANDONADO/v1 liquidado, 0 respuestas,
evento único−10/saldo90. Reconciliador cada30s y cliente con lectura inicial/
refresh manual, sin sondeo automático; posible lectura previa a liquidación,
instante no capturado. No se cambió código en este diagnóstico. Siguiente:
actualización manual del ranking Rescate y confirmar90 antes del segundo abandono.

Cierre del contraste: usuario confirma90 tras refrescar y80 tras segundo abandono.
SQL: nuevo intento 000db488-a45b-4bdd-b8ef-bffa08ce1819 ABANDONADO/v1 liquidado,
0 respuestas, único evento−10/saldo80. Sesión10: 3 intentos/3 eventos (+100,−10,−10),
saldo100→90→80. Sin descuentos perdidos ni duplicados. SOLO OFF ACK enabled:false.
API/panel siguen activos; cierre operativo separado. No se modificó el
refresco automático: el ranking permite actualizar manualmente tras liquidación.
IC-1C cerrado funcionalmente local; no acredita TTL24h, pérdida real de acuse tras
persistir, audio/iOS, producción ni toda IC-1. Guardado autorizado el10 de octubre:
backend `fix: estabilizar entorno local y validar Rescate competitivo`, Flutter
`feat: integrar y validar Rescate competitivo`. Un commit por repo, con código/
tests/documentación afectados; no secretos/temporales. Hash en `git log -1`.
Push manual del propietario. Siguiente: instituciones.
