# C5-C2-D — Ensayo local de imágenes en opciones

## D8a — APK4005 instalada; espera de confirmación humana

23/oct/2026,15:16 America/Bogota. Flutter9b115c7/backend3fe82d9 guardan la
integración local y pausa; no publicados. Build ARM64/4005 aprobado243.3s,
exit0; instalación en CPH2577 Success y versionCode4005 comprobado. Solo
configuración pública API/contenido127.0.0.1:43187; no claves compiladas.
Emulador conserva4004, suficiente para la evidencia D8b ya aprobada.

Nueva sesión desechable **IRImJ5**, fixture05e7ba3a:73 migraciones,12 preguntas,
cuatro opciones/dos ilustradas, guardado y recarga automáticos. API ready
OK/database UP; login HTTP de student201/token presente, sin imprimirlo.
Panel4173 sigue demo:false/API43187; reverse del teléfono restablecido.
Clave nueva solo en flutter-private.json temporal de IRImJ5. SQL de preparación
20:12:45 UTC no tenía intentos TUG_LOCAL. No usar la clave de7olT5v retirada.

Próximo paso humano: confirmar Inicio como student en teléfono, abrir Tira local
con Matemáticas/Básico y dejar vencer la primera ronda sin tocar opciones.
Observar feedback y continuar a otra pregunta si duelo abierto; después comprobar
pausa/reanudación y respuesta. Conciliar con SQL propio tras cada confirmación.
Todavía **sin aprobación visual del timeout corregido**, C2 abierta.

## Timeout local — integración en curso, sin aprobación humana todavía

23/oct/2026. Se conecta Tira local a su proveedor `/tira-local/intentos`,
separado del proveedor de Trivia/Fantasma. La ronda comienza con confirmación
del servidor; vencer sin respuesta espera un recibo antes de habilitar avance.
Una respuesta en vuelo o con ACK desconocido reintenta la misma operación y no
se transforma en timeout. CPU conserva su resolución; al acabar antes del banco
se abandona el intento propio. Demo conserva su banco local anterior.

Conservación de pausa: nueva migración específica
20261023150000_tug_local_pause, dos campos en IntentoTriviaRush limitados por
CHECK a TUG_LOCAL; pausa/reanudación autenticadas con reloj del servidor y
versión. Repetir una petición no amplía dos veces la ventana ni cambia el TTL
global600s. También se corrige EXPIRADO local para fijar finalizadoEn en venceEn
y limpiar pausa; antes podía incumplir la restricción temporal al caducar.

Evidencia automática: primera suite HTTP/SQL48/50, dos pruebas nuevas fallidas;
faltaba versión/contrato de pausa y el segundo caso encontraba el campo Prisma
aún inexistente. Tras implementación/regeneración: **50/50 aprobadas**,73
migraciones en PostgreSQL16 propio; recursos del ejecutor retirados. Cubre pausa
real de10.1s, reintento/versiones atrasadas, respuesta posterior, última pregunta,
caducidad incluso pausada y exclusión de Trivia/Fantasma. TypeScript aprobado.

Flutter: dos intentos iniciales no cargaron el test por referencias estáticas
incorrectas en el fake; se calificaron con la clase propietaria. Suite posterior
**19/19 aprobada**: incluye la reproducción original, timeout/reintento, última
pregunta, respuesta en vuelo/ACK perdido y pausa. Es evidencia de widgets/fakes,
no nueva observación Android ni garantía de ACK perdido real por red. Análisis
inicial encontró cuatro avisos de estilo, corregidos; repetición pendiente.

La sesión humana7olT5v se retiró ordenadamente después de guardar D8b, para
regenerar Prisma/compilar sin bloquear su DLL. Su contraseña ya no es vigente.
Comprobaciones ampliadas: cliente HTTP Flutter3/4 iniciales (el rechazo de
potenciador lanzaba excepción síncrona); corregido para devolver Future con error.
Después25/25 dirigidas aprobadas, incluidas recuperación de ACK de pausa y
respuesta confirmada durante segundo plano. Análisis dirigido final limpio;
dos avisos adicionales de estilo del fake se corrigieron antes de repetirlo.
Regresión Flutter completa: **1.016 aprobadas,16 opt-in omitidas,0 fallidas**.
No se ejecutaron las16 integraciones que requieren sus variables propias.

Regresión HTTP/SQL final50/50,73 migraciones, añadiendo reintento de respuesta
confirmada y restricciones SQL de pausa en Trivia. Backend128 suites/1.675
aprobadas según resumen Jest; la envoltura PowerShell devolvió1 al capturar stderr,
por lo que se confirma el código del proceso mediante captura estructurada antes
de dar ese comando por resuelto. `npm run build` completo aprobado, exit0.
Confirmación posterior del proceso Jest: **exit0, success:true,128 suites y
1.675 pruebas aprobadas,0 fallidas**, recibo JSON local. La salida1 anterior
correspondía a la captura PowerShell de stderr; no a una prueba fallida.
Se prepara APK ARM64/4005 solo con URLs públicas; falta instalación y regresión
humana D8a con nueva sesión. **C2 sigue abierta**; D8b no se reabre por esta corrección.

## D8b — retorno tras final aprobado; C2 sigue abierta por timeout local

23/oct/2026,14:45 America/Bogota. Evidencia humana con APK4004: el emulador
muestra «ganaste el duelo» tras responder algunas preguntas; el teléfono vuelve
desde Recientes después del final y muestra que ganó el jugador A (emulador).
**La regresión de retorno tras final queda aprobada visualmente**, sin cerrar
la app ni crear otra partida. Ya no permanece en la última ronda registrada.

Conciliación automática19:45:33 UTC en la base desechable7olT5v:
partida23f89c68-12c5-4a69-b533-9e586489daa3, FINALIZADA/JUGADOR_A,
zero=A/emulador y student=B/teléfono, cuerda4, ronda4, versión10. Finalizó
19:44:07.077 UTC. Dos respuestas, ambas de zero, dos pares ronda/usuario
únicos,11 eventos y cero XP de partida. Student no tiene respuestas: no se
registró una selección al regresar. competitiveRulesVersion:null;
presenciaVersion:1. El resultado del servidor concuerda con ambas observaciones.

**D8b aprobado dentro del alcance documentado**, combinando esta regresión con
las observaciones anteriores de sala, figuras coincidentes, contención, selección
independiente y retorno breve. No repetir los bloques aprobados. Límites:
este último duelo no tuvo selecciones ilustradas registradas y no sustituye
la evidencia visual anterior de imágenes en Pixel_8_2; el emulador vigente es
Pixel_7. No acredita cierre forzado, ACK perdido, modo competitivo ni concesión
de XP. No afirmar que se probaron esas variantes.

**Siguiente paso:** terminar la integración Flutter del timeout exclusivo de
Tira local, conservar pausa, probar reintentos/última pregunta y repetir solo la
regresión D8a afectada con el humano. D1–D7 y D8b/c/d/e conservan aprobación;
D8a permanece reabierto por timeout. C2 sigue abierta y no avanza el resto de C5.

## Reanudación del ensayo — 23 de octubre de 2026

Servicios montados de nuevo, solo locales. La sesión anterior zFyDcK ya no
está disponible; se creó PostgreSQL/API desechable propio con72 migraciones,
opciones ilustradas habilitadas y modo solo desactivado. Nueva sesión7olT5v,
fixture c1aa3534:12 preguntas, cuatro opciones y dos imágenes por pregunta.
No reutilizar la contraseña anterior. La clave nueva permanece únicamente en
flutter-private.json de esa sesión temporal; no se copia al acta ni a la APK.

Evidencia automática de preparación: /health/ready OK/database UP; login de
student y zero HTTP201 con token presente (sin imprimirlo). Panel4173 sigue
configurado con demo:false y API127.0.0.1:43187. Teléfono conserva APK4004 y
reverse43187 restablecido. El emulador actual es **Pixel_7**, x86_64, serial5554,
distinto del Pixel_8_2 de las observaciones históricas. Instalación x64/4004
Success y versión comprobada; API/contenido mediante10.0.2.2:43187.
Las dos APK usan solo configuración pública, sin credenciales compiladas.

Pendiente humano: entrar con student en teléfono y zero en este emulador y
repetir únicamente el retorno después del final que falló en D8b. La instalación,
el login HTTP y las19 pruebas automáticas previas no aprueban ninguna pantalla.
D8b y la integración Flutter/pausa del timeout local siguen pendientes; C2 abierta.

23/oct,14:41 America/Bogota: el humano confirma «Sí» a Inicio en ambos,
student en teléfono y zero en Pixel_7. API ready OK/database UP; lectura SQL
19:41:50 UTC todavía sin partidas en esta sesión. Se inicia únicamente la
regresión de retorno tras final; no repetir D1–D7 ni otros subcasos aprobados.

## D8b — fallo al volver al teléfono después del final; no aprobado

22 de octubre de2026. Aclaración humana posterior: el empate aparece **solo en
uno**; si sale en el celular y la partida acaba, queda en la última ronda que
registró, sin mostrar nada más. «La cuerda terminó exactamente en el centro»
es **texto**, no observación de la posición gráfica. Esta aclaración prevalece
sobre cualquier interpretación anterior de retorno correcto en ambos clientes.

- Se conserva aprobación de contención y selección; reanudación completa y
  resultado en ambos **fallidos/pendientes**. No cerrar D8b ni C2.
- SQL partida23e4e1f7… finalizó EMPATE/cuerda0/ronda20/versión42 a03:28:01.142
  UTC, cuatro respuestas únicas/dos por cuenta y cero XP de partida. Servidor
  terminó; no demuestra actualización de la pantalla que quedó atrasada.
- Inspección localizada: TugOnlinePage no observa lifecycle; el controlador solo
  sincroniza por eventos socket o fallback tras desconexión. Una conexión que
  parece activa no provoca lectura al volver. Además un terminal puede conservar
  animación de ronda antes de mostrar resultado. No cambiar resolución del juego.
- Regresión nueva: pausar desde ACTIVA, finalizar servidor sin nueva conexión y
  volver; variantes con evento terminal recibido o perdido durante el fondo.
  Debe mostrar resultado confirmado, sin responder ni buscar otro rival por sí solo.

Regresión previa:0/2 aprobadas; ambas variantes permanecen sin tug-online-result.
Corrección en curso: observer de lifecycle llama recover al volver; cliente hace
GET autenticado al estado de la partida, independiente del socket. El controlador
omite animación histórica en recuperación y rechaza versiones atrasadas del mismo
id. Si falla la lectura, muestra aviso y reintenta lectura, sin responder, inventar
final o buscar otro rival. Pruebas iniciales15/15; se añaden HTTP403, solo GET,
reintento tras fallo y protección contra snapshot atrasado. Suite ampliada19/19 aprobada.
Análisis dirigido de módulo y test sin incidencias; primera ejecución encontró
solo llaves faltantes en un if del test, corregidas. APK4004 por cliente en preparación.

Preparación posterior: commit Flutterbf5d363 (backend documental bfb2fc8).
Build ARM64/4004 aprobado89.7s, API/contenido127.0.0.1:43187; instalación
telefónica Success y reverse restablecido. API ready OK/database UP; clave sin
renovar. Build x64/4004 con10.0.2.2:43187 en curso, sin claves compiladas.
Todavía no se aprobó visualmente el retorno corregido tras final.

**Siguiente paso:** validar sincronización al volver y regresión
incluyendo snapshot terminal, instalar APK y repetir solo retorno tras final en
los dos clientes. Timeout local Flutter/pausa continúa pendiente.
## D8b — selección independiente aprobada; reanudación en curso

22 de octubre de2026,22:24 America/Bogota. Humano confirma «Sí» a teléfono
azul, emulador sin marca heredada y luego elección propia naranja, conservando
figuras junto a sus textos. **Selección independiente aprobada visualmente**;
falta reanudación y conciliación SQL, no cerrar D8b todavía.

- Lectura SQL03:24:31 UTC: partida23e4e1f7-9d13-4f57-9907-41c08459b834 ACTIVA,
  ambos Listo, student A/zero B, ronda2/versión4,20 preguntas/dos respuestas
  (una por cuenta), dos pares ronda/usuario únicos, una selección ilustrada y
  cero eventos XP de partida. No convertir una selección ilustrada registrada
  en prueba automática de dos respuestas ilustradas. competitiveRulesVersion:null.
- Se pide Inicio Android del emulador2–3s y Recientes sin cerrar ni volver a
  responder. Observar misma partida/ronda vigente o resultado, imágenes correctas
  y ausencia de respuesta automática. Reloj del servidor continúa, no prometer
  congelación de ronda. Teléfono permanece en la misma partida.
- Esta prueba cubre segundo plano breve; no acredita cierre forzado, pérdida
  de ACK, desconexión larga ni modo competitivo. Esperar observación humana.

Confirmación humana de reanudación: «Sale bien, me muestra que se pasó a la otra
ronda por el tiempo». **Retorno a ronda vigente aprobado**, con reloj continuo;
solo segundo plano breve, no cierre forzado ni recuperación de pérdida de ACK.
Se pide esperar resultado de esta misma partida y describir ambas perspectivas,
sin crear otra ni jugar de nuevo, antes de cerrar la entrada D8b.

Lectura detallada03:25:40 UTC: misma partida ACTIVA/ronda8/versión16, tres
respuestas y tres pares únicos, una selección ilustrada registrada como
azul de student en ronda1. Zero respondió sumas en rondas2 y7. El guion humano
azul/naranja se confirmó visualmente, pero SQL **no corrobora dos selecciones
ilustradas en la misma ronda**; conservar este límite y no inventar esa evidencia.
Cero eventos XP de partida. No atribuir la tercera respuesta a la reanudación:
no se capturó el instante exacto de cada acción humana. No hay pares duplicados.

Conciliación adicional03:28:01 UTC: la partida de contención b9d44a87… tiene
seis rondas con selecciones ilustradas en ambos clientes, tres con imágenes
seleccionadas distintas;40 pares únicos/40 respuestas. Complementa la evidencia
de selección, sin inventar un par azul/naranja en la ronda1 de23e4e1f7….
La partida vigente23e4e1f7… llegó a ronda20/versión40 con cuatro respuestas,
cuatro pares únicos (dos por cuenta) y cero eventos XP. Se espera resultado.

Resultado humano descrito: «Solo dice partida empatada con las manos; la cuerda
terminó exactamente en el centro», seguido de Buscar otro rival/Jugar contra PC.
No informa cifras en esa pantalla; no atribuirle los conteos SQL. Se pregunta si
lo vio en ambos dispositivos, porque su respuesta no especifica cada cliente.

SQL03:29:11 UTC:23e4e1f7… FINALIZADA/EMPATE/cuerda0, ronda20/versión42,
finalizado03:28:01.142 UTC. Cuatro respuestas (dos por cuenta), cuatro pares
ronda/usuario únicos,43 eventos y cero XP de partida. Concuerda con el empate
informado; falta confirmación visual explícita de ambos clientes para cerrar D8b.

**Siguiente paso:** confirmar resultado en ambos clientes y cotejar respuestas
sin duplicados y resultado en ambas perspectivas. Timeout local Flutter/pausa
continúa pendiente. C2 abierta; no avanzar al resto de C5.
## D8b — borde corregido aprobado visualmente en ambos clientes

22 de octubre de2026,22:21 America/Bogota. Tras APK4003, el humano responde
«Listo, todo bien» a texto/figuras completos dentro de sus botones en teléfono y
Pixel_8_2. **Contención visual aprobada en ambos**. No ampliar esa confirmación
a selección independiente o reanudación; D8b todavía pendiente de esos pasos.

- SQL propio de lectura03:21:26 UTC: partida b9d44a87-34e9-449b-8d51-ea6297978671
  FINALIZADA/ronda20/versión42,20 preguntas,40 respuestas (20 por cuenta),40
  pares ronda/usuario únicos,13 selecciones ilustradas,43 eventos y cero eventos
  XP de esa partida. Finalizado03:20:47.310 UTC. Student A/zero B, ambos Listo;
  competitiveRulesVersion:null/presenciaVersion1. No certifica modo competitivo.
- Búsqueda64705f2e… CANCELADA antes de Listo, sin respuestas; partida anterior
  fb5034b9… conserva8 respuestas/versión12/finalizado03:03:45.458. No atribuir
  esas filas a una prueba humana de reanudación. Recibos timestamped locales
  c5-c2-d8b-readonly-<timestamp>.json preservan las lecturas.
- Se pide nueva partida solo para selección independiente, pues la anterior
  terminó: teléfono azul; verificar que el emulador no hereda marca, luego naranja
  en emulador. Esperar confirmación antes de aprobar aislamiento de selección.

**Siguiente paso:** observar selección independiente y después reanudación en
segundo plano sin duplicación. No repetir otros bloques. Timeout local Flutter/
pausa sigue pendiente, C2 abierta y sin publicación nueva.
## D8b — borde corregido, APK4003 instalada en ambos; falta observación humana

22 de octubre de2026. Corrección Flutter9234a57: padding16 y rectángulo de
radio16 solo en botones de Tira online. Regresión de contorno: antes0/4; después
suite online completa13/13 y análisis dirigido de2 archivos sin incidencias.
No cambia selección, permisos, tiempos, snapshots, XP o reglas del juego.

- Build ARM64/4003/API127.0.0.1:43187: aprobado120.0s; instalación teléfono
  Success y reverse43187 restablecido. Ready API OK/database UP.
- Build x64/4003/API10.0.2.2:43187: aprobado95.1s; instalación nuevo emulador
  Pixel_8_2 Success mediante streaming/no-incremental. Se mantienen datos y clave
  actual87a75d92/zFyDcK; no archivos privados compilados. APK copiadas a output
  local ignorado c5-c2-d8b-borde-arm64-4003.apk y c5-c2-d8b-borde-x64-4003.apk.
- Nueva partida solicitada solo para observar el borde tras fix: la anterior
  ya terminó y las instalaciones reinician procesos. No se repiten D1–D7/D8c/d/e.
  Humano debe abrir, emparejar y Listo en ambos; observar texto y figuras dentro
  de los botones. Todavía no hay aprobación visual del borde corregido.

SQL de lectura posterior a instalaciones (03:15:34 UTC): partida anterior
fb5034b9… conserva FINALIZADA/ronda5/versión12 y finalizado03:03:45.458. Ocho
respuestas (cuatro por cuenta), ocho pares ronda/usuario únicos, tres selecciones
ilustradas y cero eventos XP de esa partida. No hay partida nueva todavía.
Recibo local ignorado c5-c2-d8b-readonly-<timestamp>.json. Esto no acredita una
reanudación humana ni pérdida de ACK; solo registra el estado real sin mutarlo.

**Siguiente paso:** confirmar contención visual en los dos clientes; después
selección independiente y reanudación sin duplicación para completar D8b.
Timeout local Flutter/pausa sigue pendiente. C2 abierta; no push/merge/despliegue.
## D8b — inicio con figuras confirmado; falla el borde de las respuestas

22 de octubre de2026. Humano confirma sala en ambos y después: «Aparecen las
mismas preguntas en ambos, las mismas figuras con sus enunciados, pero están
fuera del globo de texto en ambos dispositivos». Se acredita pregunta/figuras
coincidentes; **contención visual fallida en teléfono y Pixel_8_2**. D8b no aprobado.

- No se informa otro error de Listo. SQL de lectura,03:03:58 UTC: partida
  fb5034b9-8f49-4f62-977f-ec75ab42db76 FINALIZADA, ambos Listo:true, ronda5/
  versión12,20 preguntas y8 respuestas entre student A/zero B. Finalizado
  03:03:45.458 UTC. competitiveRulesVersion:null/presenciaVersion1. El resultado
  SQL no acredita observación humana de su pantalla ni recuperación.
- Inspección localizada: TugOnlinePage usa OutlinedButton con altura mínima52,
  sin padding/shape propios; hereda borde tipo cápsula al aumentar altura por
  imágenes. Tira local ya fijó padding16 y radio16; no trasladó ese estilo a online.
- Se añade regresión de contorno real (Material.shape.getOuterPath), texto y
  píxeles160x80/80x160, anchos320/412 y texto1.0/2.0. Primero ejecutar sin fix
  para reproducir; después corrección localizada del botón y regresión online.

Regresión previa al fix:0/4 aprobadas; las cuatro fallan por contenido fuera de
StadiumBorder a320/412 y texto1.0/2.0. El primer auxiliar contaba también imágenes
de la arena y falló por exceso; se limitó a AcademicOptionContent antes de
atribuir el fallo al contorno. Log local output/c5-c2-d8b-borde-reproducido.log.
Corrección localizada aplicada: padding16 y RoundedRectangleBorder/radio16 en
los botones online, igual que Tira local. Suite online completa13/13 aprobada;
análisis dirigido de2 archivos sin incidencias. APK4003 por cliente en preparación;
falta APK actualizada y nueva observación humana, no se aprueba aún la pantalla.

Preparación posterior: build ARM64/4003 aprobado (assembleDebug120.0s),
API y contenido127.0.0.1:43187, sin credenciales; copia local ignorada
output/c5-c2-d8b-borde-arm64-4003.apk. Instalación en teléfono termina Success,
reverse43187 restablecido y API ready OK/database UP. Build x64/4003 con
10.0.2.2:43187 en curso. No atribuir todavía observación del borde corregido.

**Siguiente paso:** validar borde de Tira online, instalar APK por
cliente y repetir solo observación afectada antes de selección/reanudación D8b.
No cambiar reglas, permisos, tiempos, XP ni snapshots por el fallo visual.
## D8b — Inicio confirmado en teléfono y nuevo emulador

22 de octubre de2026,22:01 America/Bogota. El humano confirma «Sí» a Inicio en
ambos dispositivos: student@example.invalid/teléfono y zero@example.invalid/
Pixel_8_2, sesión87a75d92. Se acredita únicamente acceso visual a Inicio, no
emparejamiento, imágenes, respuestas o reanudación de la nueva partida.

Se solicita en ambos Práctica → Tira y afloja → Matemáticas → Rival en línea →
Buscar rival, sin pulsar Estoy listo; esperar confirmación de sala sin error.
Se conservan aprobaciones históricas y correcciones previas; no se repiten
bloques ajenos a D8b. C2 sigue abierta y timeout local Flutter/pausa pendiente.

Confirmación humana posterior: «Sí» a sala con dos jugadores y botón Estoy listo
sin error en ambos clientes de la sesión87a75d92/Pixel_8_2. **Sala aprobada
visualmente en ambos**, sin dar D8b por terminado. Se solicita Listo en los dos y
comparar enunciado/opciones ilustradas; si aparecen sumas, responder hasta figuras.
Pendiente saber si reaparece el error y observar imágenes, selección y reanudación.

**Siguiente paso:** comprobar inicio tras ambos Listo y la observación
integrada de figuras, selección independiente y reanudación.
## D8b — sustitución del emulador e instalación en Pixel_8_2

22 de octubre de2026,21:57 America/Bogota. El humano aclara «cambié el emulador,
entonces tienes que instalarle el apk». La instalación anterior correspondía al
AVD previo; no demuestra instalación o acceso en el emulador nuevo. Se conserva
la evidencia histórica sin atribuir al código los cambios de dispositivo.

- ADB: nuevo AVD Pixel_8_2, serial emulator-5554/transport26, ABI x86_64,
  boot_completed1. Teléfono NFWKHYIZKVLF8LKJ/transport27 sigue autorizado.
- APK pública de desarrollo x64/build4002, acceso directo a10.0.2.2:43187:
  adb -s emulator-5554 install --streaming --no-incremental -r
  build/app/outputs/flutter-apk/app-debug.apk termina Success. No se recompila,
  desinstala o borra datos; sin secretos compilados ni operación productiva.
- Ready de API propia OK/database UP, sesión zFyDcK y su clave actual presentes.
  Teléfono había perdido reverse tras reconexión; se restablece43187. El emulador
  usa acceso directo del host, sin depender de reverse. Contraseña sin renovar.
- Se pide apertura manual y login zero en nuevo emulador, student en teléfono;
  confirmar ambos Inicio antes de buscar rival. Esta preparación automática no
  aprueba Inicio, sala ni D8b en el nuevo dispositivo. No se reabre ningún otro bloque.

**Siguiente paso:** esperar confirmación visual de ambos Inicio; luego D8b con
ambas cuentas: emparejar, Listo, opciones ilustradas, selección independiente y
reanudación. Timeout local Flutter/pausa continúa pendiente; C2 sigue abierta.
## D8b — APK del emulador con acceso directo instalada; falta confirmar Inicio

22 de octubre de2026,21:42 America/Bogota. Teléfono: el humano confirma que
permite entrar. Emulador: aún no permite entrar con la APK anterior; su reverse
se pierde al reconectarse ADB. API/credenciales propias comprobadas y sin cambios.

- Build solo x64 aprobado con --build-number=4002 (assembleDebug95.1s),
  APP_ENV=dev/DEMO_MODE=false y API_BASE_URL/CONTENT_BASE_URL=http://10.0.2.2:43187.
  Sin claves, tokens ni archivos privados compilados. No modifica pubspec.yaml
  ni la APK instalada del teléfono. Se preservan datos y sesiones locales.
- Instalación emulator-5554 con adb install --streaming --no-incremental -r:
  Success. Corrige el bloqueo previo por versión1 frente a4001 instalada.
- Revisión automática rechazó el comando posterior que combinaba dumpsys de
  versión, am start y health («blocked by policy»). No se reintenta la apertura
  mediante otra vía. No atribuir comprobación de versión ni lanzamiento a ese
  comando. Se pide al humano abrir manualmente y confirmar Inicio como zero.
- Clave actual sin renovar: AUTH_E2E_PASSWORD en flutter-private.json de zFyDcK.
  Student permanece en teléfono. No buscar rival antes de confirmar ambos Inicio.

**Siguiente paso:** confirmación visual del acceso en el emulador; después
emparejar ambos y repetir Listo por la regresión concreta de snapshot, continuando
figuras/selección/reanudación D8b. Timeout local Flutter/pausa sigue pendiente.
C2 abierta, sin push, merge, despliegue o cambios OV-1.
## Reanudación D8b — acceso fallido antes del emparejamiento

22 de octubre de2026,21:32 America/Bogota. Tras comunicar la nueva sesión
zFyDcK/fixture87a75d92, el humano informa «No pudimos conectar con SaberPlus»;
aún no indica qué cliente. No se aprueba Inicio ni se inicia otra partida.

- Comprobación automática: ready OK/database UP; directorio y clave de la sesión
  actual presentes. ADB reconoce teléfono y emulador; teléfono conserva reverse
 43187, emulador lo perdió al reconectarse (transport_id19). Se restablecen ambos.
- Host: login protegido student/zero HTTP201 y token presente, sin imprimirlo ni
  publicar la clave. No demuestra acceso visual desde Android.
- Humano tras reintento: teléfono permite entrar; emulador no. Se confirma nuevo
  reverse vacío en emulador incluso sin otra instalación. No atribuirlo a contraseña.
- Se prepara APK solo x64 con API_BASE_URL/CONTENT_BASE_URL públicos
  http://10.0.2.2:43187 para evitar dependencia de reverse en emulador. Teléfono
  conserva su APK/USB. Sondeos nc de Android devolvieron HTTP400 o sin respuesta;
  no cuentan como ready aprobado ni demuestran fallo del login. El acceso real
  de la nueva APK aún requiere confirmación humana.
- Build x64 con acceso directo aprobado (assembleDebug118.8s). Primer intento
  de instalación falló sin detalle; segundo informa INSTALL_FAILED_VERSION_DOWNGRADE:
  emulador conserva versionCode4001 y APK nueva tenía1. No desinstalar ni borrar datos.
  Se recompila solo emulador con --build-number=4002 y las mismas URLs públicas;
  no hay cambio de versión del producto en Git ni credenciales en la APK.
- Se solicita reintentar con la clave actual y confirmar resultado por dispositivo.
  D8b sigue pendiente; no repetir bloques anteriores por este incidente.
- Inspección dirigida: ApiError confirma que el mensaje corresponde a error de
  conexión; auth/login real de ambas cuentas es correcto. Manifest debug permite
  HTTP de desarrollo y mantiene permiso INTERNET. Emulador boot_completed1,
  modo avión0 y proxy global null. No se audita toda la app por estas lecturas.
## D8b — validador corregido y regresión aprobada; sesión anterior retirada

22 de octubre de2026. Segundo ensayo de snapshot:48/48 pruebas HTTP/PostgreSQL,
cero omitidas,72 migraciones aplicadas únicamente en base propia desechable.
Incluye inicio con dos cuentas, imágenes en pregunta actual, imagen alterada y
campo extra rechazados, formato antiguo aceptado y tercero sin autorización.
También conserva las3 regresiones de timeout local y los demás44 casos C5.
No equivale a dos pantallas Android observadas: falta repetir Listo y continuar
D8b con el humano. Reproducción del fallo previo conserva sus evidencias abajo.

Nueva sesión propia: directorio C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-zFyDcK,
fixture «Opciones C2-D - ensayo87a75d92»,12 preguntas/cuatro opciones/dos imágenes,
72 migraciones, API43187/ready OK y database UP. Reverse activo en ambos clientes;
solo-on no habilitado. APK corregida conservada, sin credenciales compiladas.
Se comunicó ruta de AUTH_E2E_PASSWORD nueva y se pidió login manual student en
el teléfono/zero en el emulador, ambos Inicio antes de volver a buscar rival.
Contrato backend documentado en backend/docs/C5C2_TIMEOUT_LOCAL.md; integración
Flutter y pausa siguen pendientes. No dar D8b por aprobado por el ensayo automático.

La sesión6263e056 se cerró ordenadamente mediante su control.json/stop tras
verificar propietario; runner confirmó retirada de su API/PostgreSQL. Estaba
cerca del límite original de dos horas; no se extiende ni se reutiliza su clave.
npm run build completo aprobado (Prisma generate y Nest) al liberar su DLL. Preparar
sesión nueva con fixture/clave nueva antes de pedir login manual en ambos clientes.

## D8b — fallo al marcar segundo Listo; snapshot con imágenes rechazado

22 de octubre de2026,21:22–21:25 America/Bogota. Humano: emulador muestra Listo
con rival preparándose; teléfono muestra «No fue posible procesar la acción del
juego» y luego timeout. No hay aprobación de figuras, respuestas o reanudación.

- SQL real, partida4a35dc0d-b9c1-4873-a18d-fa517e95b502: PREPARANDO,
  zero A listo:true/student B listo:false, ronda0/version1,20 preguntas/cero
  respuestas. No se fuerza ACTIVA ni se suprimen controles para continuar.
- Reproducción de solo lectura con buildTugSnapshot y función PostgreSQL real:
 20 opciones ilustradas; tug_snapshot_original_valid(snapshot,partida):false.
  El mismo objeto sin imagenUrl en opciones da true. No se cambió la partida.
  Evidencia local backend/output/c5-c2-d8b-snapshot-readonly.json.
- Causa: validador SQL original compara cada opción con exactamente los campos
  anteriores y rechaza imagenUrl. Necesita migración aditiva específica C2,
  reemplazando la función y preservando todos sus controles originales. La nueva
  comparación admite el campo opcional solo si coincide con la Respuesta original;
  JSON antiguo sin campo sigue permitido; otros campos extra siguen rechazados.
- Nueva regresión HTTP/SQL: dos cuentas, emparejamiento/Listo, snapshot con imágenes,
  rechazo de imagen alterada/metadatos extra/tercer propietario y JSON antiguo.
  Ensayo en otro PostgreSQL propio en curso, sin alterar la sesión humana.
- Compilación Nest del contrato local aprobada. npm run build completo aún debe
  repetir Prisma generate al cerrar la API que mantiene la DLL ocupada.

**Siguiente paso:** terminar regresión de snapshot, preparar API/PostgreSQL propios
con la migración comprobada y volver a observar Listo/figuras en ambos clientes.
La sesión actual tiene límite original de dos horas; no extenderlo ni reutilizar
su clave al crear otra. D8b y timeout Flutter pendientes; C2 abierta.
## D8b — sala confirmada en ambos clientes tras la corrección

22 de octubre de2026, posterior a la instalación corregida. El humano confirma:
«Ya aparecen en la sala con el botón estoy listo». **Preparación de sala aprobada
visualmente en ambos clientes**, student/teléfono y zero/emulador; aún faltan
preguntas/figuras, selección propia, reanudación y resultado. Se pide Listo en
ambos y comparar opciones ilustradas. No se aprueba D8b completo.

Análisis dirigido de Flutter:2 archivos, sin incidencias. Regresión online9/9.

Timeout local, evidencia automática posterior en otro PostgreSQL propio:
primer ensayo con71 migraciones:44/47 aprobadas y3 nuevas fallidas al crear
TUG_LOCAL (HTTP500). La restricción trivia_evidence_context solo admite modos
anteriores. Se amplía la migración no publicada con una rama exclusiva local,
sin retirar las condiciones existentes de Trivia/Fantasma; local exige ausencia
de evidencia/competición/presencia, sin asistencias y vigencia600s. Segundo
ensayo:47/47 aprobadas, cero omitidas,71 migraciones/PostgreSQL16 propio. Incluye
10.1s de espera real, tres reintentos concurrentes con una sola fila, rechazo de
otro propietario/Trivia/Fantasma y cierre de última pregunta sin duplicar ni XP.
Recursos de ambos ensayos retirados por su runner propietario.
No se modifica ni migra la sesión humana D8b por ejecutar esas pruebas.

## D8b — corrección del transporte, pendiente confirmación visual

22 de octubre de2026,21:13 America/Bogota. Humano: ambos clientes vuelven a
conectar; al reintentar Buscar rival los dos quedan cargando. D8b sigue pendiente.

- Causa reproducida con el cliente Flutter real contra la API propia: Socket.IO
  con recuperación entrega [Map del estado, String offset]. El adaptador aceptaba
  únicamente Map, lo convertía en objeto vacío y fallaba al leer servidorAhora.
  Diagnóstico de tipos sin valores; no falta el reloj en el contrato del servidor.
- Corrección en tug_realtime_client.dart: extraer solo el objeto de la forma
  exacta [Map,String]; conservar Map directo y las validaciones del decoder.
  También sirve para conectado/actualizada/presencia/error con el mismo offset.
  No desactivar recuperación, inventar reloj o cambiar permisos/contrato online.
  Instrumentación temporal retirada del código entregable.
- Regresión persistente: WebSocket local emite protocolo Socket.IO con offset y
  pasa por la librería real, sin clientes/partidas humanos simulados. Comprueba
  sala y rival; casos de forma inválida conservan rechazo. Suite online:9/9.
- Sondeo de lectura de la partida humana anterior: EXPIRADA desde21:07:39,
  listoA/listoB:false, ronda0/version2,20 preguntas/cero respuestas/tres eventos.
  Intento diagnóstico de sincronizarla devuelve409 «Partida terminal o cierre
  pendiente»; no se cuenta como validación integrada aprobada. Un primer sondeo
  tras corrección quedó sin evento al no haber partida activa (timeout20s).
- APK por arquitectura compilada: assembleDebug124.4s, ARM64/x86_64. Teléfono
  instalado correctamente. Emulador: primer push falló EOF al reconectar ADB;
  segundo intento streaming terminó Success. Reverse43187 restablecido y apps
  abiertas por ADB. Preparación automática, sin atribuir observación humana.
- Solicitado al humano Buscar rival en ambos, una sola vez y sin Estoy listo,
  para observar la sala. Esta búsqueda nueva se justifica por expiración anterior.
- Borrador de timeout local: TypeScript --noEmit aprobado tras explicitar la
  allowlist competitiva existente. Jest5/62 aprobado; HTTP/SQL y build completo
  pendientes. Falta integrar Flutter y conservar su comportamiento de pausa;
  no instalar el borrador incompleto en la sesión D8b actual.

**Siguiente paso:** esperar confirmación visual de sala en ambos clientes; después
Listo, imágenes, selección independiente y reanudación siguiendo D8b. Completar
contrato/Flutter y regresiones del timeout local antes de nueva revisión de Pavel.
## D8b — diagnóstico de estado inválido y conexión del emulador

22 de octubre de2026, continuación posterior al emparejamiento. Evidencia humana:
el teléfono sigue mostrando «El servidor envió un estado de partida inválido»;
el emulador vuelve a mostrar «No pudimos conectar con SaberPlus». No se aprueba
sala, imágenes ni respuestas. Se conserva la observación de apariencia extraña
del emulador sin atribuirle una causa ni aprobar su interfaz.

- API propia sana; el emulador perdió reverse43187 tras reconectarse ADB durante
  instalación. Se restablece el túnel. Instalación ARM64 de diagnóstico en teléfono
  aprobada por ADB; pendiente confirmación visual del nuevo reintento.
- HTTP y captura Socket.IO de lectura entregan estado PREPARANDO con reloj ISO,
  referencias de jugadores A/B y cero respuestas. El decoder Flutter interpreta
  esa captura:1/1. Esto no valida el transporte Android ni sustituye dos clientes.
- Log del teléfono localiza TypeError al leer servidorAhora como String. Se agrega
  diagnóstico temporal de tipos/claves, sin valores, credenciales ni payload.
  Aún no se conoce el formato que ocasiona el fallo; no se inventa un reloj local.
- Borrador backend del contrato exclusivo TUG_LOCAL y regresiones HTTP/SQL en
  curso, todavía sin desplegar en esta sesión ni usarlo desde Flutter. No se
  declara corregido el timeout. Jest afectado:5 suites/62 pruebas aprobadas.
  Primera comprobación TypeScript detectó ampliación del enum en el verificador
  competitivo; se mantiene su allowlist Trivia/Fantasma y se explicita el tipo.
- npm run build bloqueado por EPERM al reemplazar DLL de Prisma utilizada por
  nuestra API activa. No se borran dependencias ni se detienen procesos ajenos.
  Falta repetir build y pruebas reales tras cerrar ordenadamente esta sesión.
- Artefactos diagnósticos y capturas privados conservados en output local y
  excluidos de staging; no incluir APK, logs crudos, tokens o secretos en commits.

**Siguiente paso:** comprobar el reintento del teléfono con diagnóstico de formato
y acceso del emulador; corregir el transporte con regresión si procede. Después
completar D8b con observación humana y terminar timeout local autorizado. C2 abierta.
## D8b — acceso confirmado y fallo durante emparejamiento

22 de octubre de2026,20:38 America/Bogota. El humano confirma ambos Inicio:
student en teléfono y zero en emulador, sesión6263e056. Se pide Matemáticas →
Buscar rival en ambos, sin marcar Estoy listo. Informa **«Hay un error o no
emparejan»**; se solicita texto exacto y cliente afectado antes de aprobar nada.

- SQL real: partida a4bdc8f0-f353-4ac5-9a21-05970a7ce0c9 PREPARANDO,
  Matemáticas, student A/zero B, listoA/listoB:false, ronda0/version1.20 preguntas,
  cero respuestas y dos eventos. competitiveRulesVersion:null. El emparejamiento
  ocurrió en servidor; no demuestra que ambas pantallas hayan mostrado la sala.
  Evidencia ignorada: backend/output/c5-c2-d8b-emparejamiento-fallo.json.
- ADB reconoce ambos clientes y confirma ambos túneles43187 activos. Sin
  respuestas, flags solo, pasos de Listo automáticos ni simulación de presencia.
  No crear otra partida ni pulsar repetidamente Buscar rival durante investigación.

**Siguiente paso:** identificar aviso exacto/cliente, reproducir y corregir el
fallo si procede; observar sala/figuras, selección propia y reanudación con dos
clientes antes de aprobar D8b. Timeout local específico sigue autorizado y pendiente
de implementar, sin alterar la partida online activa durante la investigación.

## Reanudación — 22 de octubre de2026, 20:29 America/Bogota

El humano pidió detener todo y luego reanudar. Se respeta la pausa: no se
implementó el contrato nuevo durante ella. La API/PostgreSQL propios de19f60066
fueron retirados por el runner; su directorio ya no existe. Se conserva evidencia.

**Decisión de Pavel ya recibida y autorizada:** al vencer Tira local, registrar
«sin respuesta», conservar la resolución de la ronda frente a CPU y avanzar a
la siguiente pregunta si quedan preguntas y el duelo no terminó. Sin consumir
comodines/anuncios/recompensas. Ampliar contrato exclusivo de Tira local con
tiempo validado por servidor, autorización e idempotencia; no crear salto gratuito
para Trivia/Fantasma ni modificar sus reglas. Añadir regresiones de timeout,
reintento y última pregunta. **Implementación pendiente, no pedir la decisión otra vez.**

- Ramas fix/c5-c2-timeout-d8b conservadas, HEAD Flutterf8a606d/backend65b4190.
  Flutter conserva analysis_options.yaml ajeno y el test de timeout que reproduce
  el fallo; no está corregido ni se cuenta aprobado. Backend sin cambios runtime.
  No push, merge, despliegue o cambios OV-1 nuevos.
- Último acceso humano: «No pudimo conectar con SaberPlus. Revisa tu conexión».
  API estaba sana; los túneles se habían perdido al reconectarse ADB. Se
  restablecieron, pero el humano pidió pausa antes de confirmar acceso. D8b no
  ejecutado ni aprobado. No se reutilizan credenciales de aquella sesión.
- Al reanudar: teléfono NFWKHYIZKVLF8LKJ y emulador5554 autorizados/con APK ya
  instalada; emulador boot_completed1 y teléfono escala1.0. Panel4173 heredado
  activo, config demo:false/API43187. API43187 inicialmente sin listener. Docker
  responde; contenedor histórico5548e14c… conservado sin operarlo.
- Se inicia otra sesión propia con el runner y opt-in de imágenes, usando el
  build backend ya validado (sin cambios de runtime desde esa compilación).
- Sesión nueva lista:70 migraciones, optionImagesLocal:true y solo admission
  sin habilitar. Directorio
  `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-hjVNQZ`, nonce6263e056….
  Clave nueva únicamente en flutter-private.json/AUTH_E2E_PASSWORD. Fixture
  «Opciones C2-D - ensayo6263e056»12 preguntas/cuatro opciones/dos ilustradas,
  guardado/recargado por API. Límite original de dos horas conservado.
- Reverse43187 configurado para ambos clientes. am start -W OK: teléfono COLD
  y emulador UNKNOWN, sin atribuir vista humana. Pruebas de sondeo HTTP por nc
  desde Android no dieron una respuesta ready válida (sin salida/HTTP400 por
  solicitud de sondeo); no se cuentan como comprobación de login ni como fallo
  observado de la app. Sigue pendiente comprobar acceso en ambas pantallas.
- Host: health ready OK/database UP y login protegido de student/zero aprobado
  con las credenciales nuevas, HTTP201. Primer auxiliar asumía200 y falló esa
  aserción; corregido para aceptar éxito2xx y exigir token sin imprimirlo.
  Evidencia ignorada: backend/output/c5-c2-reanudacion-dos-clientes.json.
- Ruta de clave comunicada al humano; cerrar sesiones anteriores y entrar como
  student en teléfono/zero en emulador. No hay emparejamiento, respuesta ni
  aprobación humana D8b por preparar estos servicios. Contrato de timeout aún
  no implementado; regresión roja anterior conservada.

**Siguiente paso:** confirmar login manual student en teléfono y zero en
emulador, ambos Inicio antes de emparejar D8b. Continuar después con
implementación y regresiones del timeout específico autorizado. C2 sigue abierta.

## Revisión de Pavel — continuación desde main integrado

22 de octubre de2026. Pavel auditó la entrega parcial y pide reproducir/corregir
el vencimiento de Tira local y completar D8b con dos clientes. **C2 sigue abierta**;
se conservan D1–D7/D8c/d/e aprobados; D8a tiene una regresión concreta de timeout
en revisión. No se repiten los demás bloques ni se toca OV-1.

- git fetch origin en ambos repos: Flutter PR#9 integrado en b8253e2 y backend
  PR#11 integrado en3eb3f59. Revisados commits/diff/checkpoint respecto de las
  referencias publicadas anteriores; son los cambios entregados más sus merges.
  main actualizado con pull --ff-only. Ramas nuevas fix/c5-c2-timeout-d8b desde
  esos main; analysis_options.yaml ajeno preservado con stash y restaurado,
  respaldo conservado. Sin push/merge/despliegue nuevo.
- Lectura focal: acta/relevo/README actuales, TugOfWarPage, modelos/reglas/tests,
  repositorio remoto y contrato Trivia, controlador/servicio de Trivia, admisión
  y flujo Tira online. No AGENTS aplicables encontrados. Auditoría acotada al fallo.
- Regresión nueva: banco remoto de dos preguntas, ninguna respuesta, CPU también
  deja vencer10 s; después de Continuar aparece tug-result-view aunque servidor
  permanece activo. **Reproducido,0/1 aprobada** por final prematuro. Log ignorado
  Flutter/output/c5-c2-timeout-reproducido.log. Primer auxiliar tenía un int nulo;
  corregido. La espera fake inicial no avanzaba DateTime.now; se espera el reloj
  real usado por la pantalla y se reproduce el fallo específico, sin cambiar runtime.
- Causa: solo se incorpora la próxima pregunta cuando answer devuelve serverState;
  timeout no hace esa petición y Continuar incrementa el índice local hasta un
  falso fin del banco. Contrato Trivia no avanza por timeout de pregunta; SALTAR
  consume una concesión válida y el vencimiento global del intento es distinto.
  **Decisión pedida a Pavel**, antes de implementar regla nueva: sincronizar y
  repetir la pendiente conservando ronda vencida, o ampliar contrato con timeout
  validado por servidor. No se fabrican respuestas/recompensas ni se quitan guards.
- El humano está preparando emulador. ADB ya reconoce teléfono NFWKHYIZKVLF8LKJ
  y emulator-5554/Pixel8 arrancado. D8b aún sin observación humana. Dos intentos
  install streaming del emulador fallan sin detalle; instalando sin streaming
  para obtener resultado, sin borrar sus datos ni cambiar dependencias.
- Sesión propia nueva: backend build aprobado, log c5-c2-timeout-backend-build.log;
  runner70 migraciones/optionImagesLocal:true, solo admission sin habilitar.
  Directorio `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-y2rj6c`,
  nonce19f60066…, API43187. Clave nueva solo flutter-private.json/AUTH_E2E_PASSWORD.
  Banco «Opciones C2-D - ensayo19f60066»12 preguntas/cuatro opciones/dos imágenes,
  guardado/recargado por API. No se reutilizan claves/datos antiguos ni producción.
- Reproducción de contrato con HTTP/SQL reales, cuenta ficticia absent separada
  de los dos clientes: intento0ad375eb-2b5c-4534-9c7c-041fd1351846 con12 preguntas.
  Tras10500ms sin respuesta y GET protegido de sincronización conserva ACTIVO,
  misma pregunta/índice0, cero respuestas/aciertos/errores/saltos/potenciadores y
  ninguna liquidación competitiva. Evidencia ignorada:
  backend/output/c5-c2-timeout-http-sql.json. No es prueba humana ni se envió
  respuesta ficticia. Confirma que el timeout local no avanza el contrato actual.
- D8b preparación automática: install --no-streaming -r termina Success en
  emulator-5554, conservando datos. APK previa c19bd1a coincide con el runtime
  de main actualizado (solo documentación/test nuevos hasta decidir timeout),
  define dev/API43187 y sin credenciales. App abierta en ambos: am start OK;
  emulador UNKNOWN/Wait3271ms y teléfono HOT, sin atribuir aprobación de pantalla.
  Health ready OK/database UP; panel4173 demo:false/API43187. Teléfono reverse
  activo; emulador reconectó su transporte y perdió reverse, se restableció y
  --list confirmó host-15 tcp:43187. Sin borrar datos ni cambiar SDK.
- Se comunicó la ruta de la clave nueva y se pidió login manual: teléfono
  student@example.invalid/emulador zero@example.invalid; no buscar rival aún.
  Confirmación humana de ambos Inicio y decisión de timeout pendientes.

**Siguiente paso:** esperar decisión de Pavel para transición de timeout;
en paralelo terminar instalación/conexión de dos clientes y login de cuentas
distintas para D8b. Registrar cada confirmación física y evidencia SQL por separado.

## Entrega parcial — 22 de octubre de 2026, 11:00 America/Bogota

**7/8 bloques aprobados. D8a/c/d/e aprobados; D8b pendiente por falta de segundo
cliente. C2 no está completamente terminada.** Ver [entrega y comandos](C5C2_ENTREGA_PARCIAL.md).
Esta entrada prevalece sobre los checkpoints y contadores históricos inferiores.

- D8e humano: desde la entrada propia Duelo fantasma, Matemáticas/60 s, informa
  «Se ve bien»,3200 puntos/mejor combo12/12 correctas y «Venciste a tu fantasma».
  Acredita presentación y avance de opciones en esta pantalla física; no se
  infiere solo de que comparta código con Trivia. **D8e aprobado** en el flujo
  legado disponible, sin certificar admisión/presencia competitiva de Ghost.
- SQL posterior: intento6f1960ea-b98c-4a0e-a7a0-20405c0d0e22 FINALIZADO,12
  preguntas ilustradas/dos imágenes por pregunta y12 respuestas correctas,
  cero errores,3200 puntos/mejor combo12, asistido:false. Intento Trivia previo
  62162133… conservado. Ambos modalidad:null/competitiveSettledAt:null;
  student/zero XP académico0 y único evento competitivo sintético del runner.
  Evidencia ignorada: backend/output/c5-c2-d8e-fantasma-confirmado.json.
- El récord consultado por el flujo existente elige el intento nuevo ante
  igualdad de puntos/aciertos/combo por fecha final más reciente. Por eso muestra
  «Venciste a tu fantasma» aunque ambos tienen3200; no prueba una mejora de
  puntaje. Es comportamiento previo ajeno al contrato de imágenes C2, documentado
  para Pavel sin modificar reglas, rankings ni textos del juego en este encargo.
- D8b no ejecutado: el humano solo tiene el teléfono USB. No se simuló un segundo
  jugador ni se usó solo-on para acreditar Tira online. Siguiente prueba exacta:
  segundo Android/emulador compatible, dos cuentas y misma ronda ilustrada;
  selección propia y reanudación sin duplicación, según RELEVO_C5_C2.md.
- Regresión Flutter final del código c19bd1a: **992 aprobadas/16 opt-in omitidas,
  cero fallidas**,4min27s; output/c5-c2-entrega-regresion-flutter.log. Las omitidas
  requieren credenciales/harness/fixtures o captura opt-in no habilitados en esa
  orden; no son aprobadas. No sustituye lo observado
  por el humano. La entrega conserva límites de red antes de POST, recuperación
  desde segundo plano en Trivia, accesibilidad sin TalkBack y resto de C5 fuera.
- Documentación: ocho espejos idénticos,263 enlaces locales en14 documentos
  revisados sin destinos ausentes; git diff --check limpio en ambos repos.
- Recursos al preparar entrega: tras validar ruta temporal, marcador de dueño,
  contexto Docker local y etiqueta de1282b217…, se escribe action:stop en el
  control.json permitido del runner. Este confirma «Owned local ranking API and
  PostgreSQL removed»; carpeta pZbcak ausente, API43187 sin listener y contenedor
  propio ausente. No se operó el contenedor histórico5548e14c… ni su directorio.
  Panel4173 heredado/PID7108 permanece activo, sin API; túnel USB43187 queda
  registrado para retirada manual por el rechazo previo de mutación adb.
  No quedan credenciales activas de esta sesión; siguiente ensayo requiere
  nueva sesión/clave y recurso segundo cliente, según relevo.

## Reanudación de servicios — 22 de octubre de 2026, 10:37 America/Bogota

**D1–D7 aprobados (7/8); D8a/c/d aprobados; D8b/e pendientes.** El humano pide
remontar servicios antes de repetir Trivia. El ajuste de contorno de Trivia/
Fantasma c19bd1a está instalado. Al remontar faltaba confirmación visual;
la repetición humana posterior confirma el contorno corregido de Trivia.
La recuperación desde segundo plano también quedó confirmada posteriormente.

- Ramas fix/c5-c2-validacion, HEAD Flutter4d0de2c/backendc7b1f04. Solo permanece
  ajeno analysis_options.yaml en Flutter; backend limpio. Sin fetch/push/merge,
  despliegue ni intervención OV-1. Sesión y2k4pR ya no existe y API43187 no escucha;
  su contenedor tampoco aparece. Evidencias anteriores conservadas en esta acta.
- Docker responde; contenedor histórico5548e14c… conservado, sin operar su
  limpieza rechazada anteriormente. Panel4173 sigue activo y config.js declara
  demo:false/API43187. Android USB autorizado, escala1.0. No se borran datos.
- npm run build backend aprobado; log ignorado
  backend/output/c5-c2-reinicio-trivia-build.log. Se inicia el mismo runner propio
  con SABERPLUS_C5_OPTION_IMAGES_LOCAL=true, sin alterar su límite de dos horas
  ni heredar servicios productivos. local-ranking-ready:70 migraciones,
  optionImagesLocal:true. Sesión propia nueva:
  `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-pZbcak`, nonce1282b217….
  Contraseña nueva solo en flutter-private.json/AUTH_E2E_PASSWORD, sin imprimir
  ni incorporar al APK. Fixture «Opciones C2-D - ensayo1282b217» creado,
  guardado/recargado por API:12 preguntas/cuatro opciones/dos ilustradas.
- Health ready OK/database UP. Baseline SQL: student/zero XP académico0, cero
  intentos Trivia y único evento competitivo sintético del runner. Evidencia
  ignorada: backend/output/c5-c2-reinicio-trivia-baseline.json. No se importan
  resultados, XP o credenciales de la sesión anterior; su evidencia no se pierde.
- El control automático rechazó el comando combinado de health, adb reverse y
  am start: «blocked by policy». No se reintentan las mutaciones por otro medio.
  Comprobaciones posteriores solo de lectura: health ready OK y adb reverse
  --list vacío. **Túnel USB pendiente**, app no abierta por el agente. APK
  c19bd1a ya instalada de la sesión anterior; no hay código nuevo que compilar.

- D8d repetición humana22/10 a10:54 America/Bogota: informa «12 correctas, y
  el texto y las imagenes salen bien». Confirma avance de la ronda y presentación
  corregida en USB; no se atribuye esa observación todavía a Fantasma.
  SQL: intento62162133-8d76-4195-9ba5-27d7d292dba8 FINALIZADO, Matemáticas/60 s,
  doce preguntas/respuestas correctas, cero errores,3200 puntos/mejor combo12,
  asistido:false; fin15:53:20.095Z al agotar banco, no al consumir60 segundos.
  Puntaje respaldado por SQL, no informado expresamente por el humano. Student/
  zero XP académico0 y único evento competitivo sintético conservados; sin
  liquidación competitiva de esta ronda. Evidencia ignorada:
  backend/output/c5-c2-d8d-contorno-confirmado.json. adb reverse --list confirma
  ahora tcp:43187 activo; se resuelve el pendiente de túnel, sin que el agente
  reintente la mutación rechazada. **Contorno corregido aprobado humanamente**;
  recuperación D8d y entrada propia de Fantasma aún pendientes.

- D8d recuperación humana22/10 a10:55 America/Bogota: confirma el mismo
  resultado3200 puntos/12 correctas después de Inicio → Recientes, sin cerrar
  la app ni iniciar otra ronda. SQL compara exactamente el mismo intento,
  fecha final, doce respuestas, puntaje y XP/ledger: sin cambios ni duplicación.
  Evidencia ignorada: backend/output/c5-c2-d8d-recuperacion-segundo-plano.json.
  **D8d aprobado con recuperación desde segundo plano**; no se ensayó cierre
  de proceso ni se atribuye restauración en frío a esta pantalla. Compatible
  con el alcance representativo C2; no se amplía el contrato de persistencia.

**Siguiente paso:** Volver a practicar → Duelo fantasma (su entrada propia),
Matemáticas/60 s; observar récord anterior3200 y progreso, opciones ilustradas,
toque/avance y resultado. Registrar lo observado y comprobar SQL/API. D8b sigue
pendiente por segundo cliente; no cerrar C2 completo.

## Reanudación — 22 de octubre de 2026, America/Bogota

**Se mantienen D1–D7 aprobados (7/8); D8a/c aprobados, D8b/d/e pendientes.** Al detener el ensayo,
el humano informó «Ganaste el duelo 3 rondas 3 aciertos 2 aciertos CPU» y que
texto/imágenes quedaban desalineados y fuera del globo. Se detuvo toda operación
por su petición expresa, sin actualizar archivos después de ella. Al retomar
precisa que el defecto está **en los botones de respuesta**, no en el enunciado.
Esto acredita avance de varias rondas tras69e48e5, pero falla la presentación.

- Repositorios en fix/c5-c2-validacion; Flutterd7ae366/backend146c28a. Cambio
  ajeno analysis_options.yaml conservado. Sin push/merge/despliegue o cambios OV-1.
- Regresión que quedó ejecutándose: **971 aprobadas/16 opt-in omitidas**, cero
  fallidas, log Flutter output/c5-c2-d8a-regresion-flutter-completa.log. No acredita
  corrección visual; esa prueba anterior comprobaba avance/referencias, no la
  geometría del borde con píxeles decodificados.
- API43187 ya no escucha; sesión Kb3AT3/owner.json ya no existe y su contenedor
  no aparece. Panel4173 sigue escuchando. Android USB autorizado. No se reutilizan
  claves anteriores. Contenedor histórico5548e14c… sigue presente y no se opera
  su limpieza, que quedó rechazada/documentada en el checkpoint anterior.

- Nueva sesión propia y servicios: API43187 ready/database UP,70 migraciones,
  optionImagesLocal:true; panel4173 conserva demo:false/API43187. Sesión temporal
  `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-y2k4pR`, nonce41a7744d…;
  contraseña nueva solo en flutter-private.json, AUTH_E2E_PASSWORD. No imprimir
  ni compilar credenciales. Fixture estándar guardado/recargado por API:
  «Opciones C2-D - ensayo41a7744d»,12 preguntas/cuatro opciones/dos figuras.
  Android autorizado, reverse43187 restaurado, escala1.0. No se importa el
  historial/XP de sesiones previas ni se repiten D1–D7 por recrear esta base.

- Reproducción automática de presentación: cuatro casos a anchos320/412 y
  escalas1.0/2.0, imágenes decodificadas160×80 y80×160. Se comprueba que las
  esquinas del texto y los píxeles quedan dentro del contorno real del Material
  del botón. **0/4 aprobados antes del arreglo**: forma predeterminada StadiumBorder
  y contenido superior cerca del borde, fuera del contorno curvo. Log ignorado:
  output/c5-c2-d8a-bordes-reproducido.log. La espera inicial del auxiliar contaba
  además RawImage de la arena; se acotó a AcademicOptionContent para reproducir
  el defecto real, sin cambiar runtime para acomodar el test.
- Corrección localizada en Tira local: forma rectangular con esquinas de16 y
  padding16 explícitos para cada opción. El contenido ilustrado conserva su
  altura natural, proporciones y área de toque dentro del borde. Sin tocar
  AcademicOptionContent compartido, reglas, sesión, CPU, XP, contratos o dependencias.
  Regresión dirigida **85/85 aprobadas**, incluidos los cuatro casos geométricos;
  output/c5-c2-d8a-bordes-regresion.log. Flutter analyze --no-pub sin incidencias
  (output/c5-c2-d8a-bordes-analyze.log). La regresión completa971/16 anterior
  corresponde al arreglo de avance69e48e5, no se atribuye al nuevo ajuste visual.
  Commit Flutterdfb05dc. Build debug aprobado (assembleDebug201,1s), defines
  públicos del relevo y ninguna credencial; mismos avisos conocidos de KGP/Java.
  Log output/c5-c2-d8a-bordes-build.log. adb install -r: Success; am start -W
  OK/WARM, reverse43187 activo, sin reinstalación destructiva ni borrado de datos.
  Sin aprobación humana del ajuste. Baseline de la sesión nueva: XP académico0,
  historial0/resultados0, ningún intento Trivia; evento sintético1/Trivia100.
  Evidencia ignorada backend/output/c5-c2-d8a-bordes-baseline.json.

- D8a confirmación humana del arreglo: responde «Sí» a que texto y ambas figuras
  quedan completos dentro de sus botones sin desbordarse, después de responder
  y avanzar. SQL: intento4d85a4c4-c9cf-4944-a92d-302e839e79e4 no competitivo,
 12 preguntas y tres respuestas correctas; índice3, cero incorrectas. Historial3,
  resultados0, XP académico0 y único evento competitivo sintético conservados.
  No se atribuye a Tira local XP de ranking ni se afirma aislamiento offline total:
  la CPU es local y preguntas/evaluaciones usan API. Evidencia ignorada:
  backend/output/c5-c2-d8a-bordes-confirmado.json. **D8a aprobado.** D8 completo
  sigue pendiente; el contador global permanece7/8.

- D8c paso1 humano: en Crear invitación observa «right overflowed by 0.850 pixels»;
  después Crear código sí muestra código para compartir. Fallo visual registrado,
  no se aprueba el diálogo ni las opciones ilustradas de Batallas todavía.
  SQL: batalla3f19b9b3-0099-4659-8bea-07c45e64d707 DUELO_RELAMPAGO/Matemáticas,
  PENDIENTE, ocho preguntas, cero respuestas, solo student LISTO y sin rival;
  sin liquidación ni cambio de XP. Código no publicado en acta/chat.
  Evidencia ignorada: backend/output/c5-c2-d8c-invitacion-overflow.json.
  Android1080px/densidad480 equivale a360dp; escala1.0. Se conserva esta
  invitación para usarla después de corregir; no crear otra por el mismo ensayo.

- D8c reproducción automática: tres casos320/360/412 con SaberPlusTheme.light,
  abrir invitación, seleccionar Duelo relámpago y área de etiqueta larga, cancelar
  sin escribir en API. Antes del ajuste0/3 aprobados: selectores de modo/área
  exceden su ancho y fila de racha/mejor también desborda en estos tamaños.
  Log output/c5-c2-d8c-dialogo-reproducido.log. Primer ajuste solo de selectores
  deja91 aprobadas/3 fallidas en regresión dirigida por la fila de estadísticas;
  no se atribuye aprobación a esa ejecución (c5-c2-d8c-dialogo-regresion.log).
- Corrección localizada en async_battles_page.dart: isExpanded:true en ambos
  selectores y fila de racha/mejor adaptable con Wrap. Sin modificar campos
  enviados, selección de modo/área, invitaciones, reglas o XP. Repetición focal
  **9/9 aprobadas**, incluidos los tres anchos y pruebas existentes de privacidad,
  repositorio y revisión: output/c5-c2-d8c-dialogo-focal.log. Las otras85 pruebas
  de opciones/imágenes/Tira pasaron en la ejecución intermedia y su código no
  cambió por el último ajuste de Wrap; no se repiten sin una razón nueva.
  Análisis aprobado sin incidencias (c5-c2-d8c-dialogo-analyze.log).
  Commit Flutterc94add3; build debug aprobado (assembleDebug46,7s), defines
  públicos de dev/API local sin credenciales y avisos KGP/Java conocidos.
  Log output/c5-c2-d8c-dialogo-build.log. adb install -r Success; am start -W
  OK/COLD, reverse43187 restaurado, sin borrar datos ni claves en APK.
  SQL confirma misma invitación PENDIENTE, ocho preguntas/cero respuestas y
  mismos metadatos/participante: backend/output/c5-c2-d8c-invitacion-conservada.json.
  Falta vista humana del ajuste.

- D8c confirmación humana del diálogo corregido: informa «Sale sin el aviso»
  después de abrir Crear invitación y seleccionar los filtros indicados. Confirma
  ausencia del overflow observado, no el juego ni sus imágenes todavía. Se pide
  cancelar esa ventana para conservar la invitación anterior, sin crear otra.

- D8c paso2 humano: como zero usa el código y observa «Tu rival ya está listo»;
  entre Unirme y esa pantalla vio unos segundos una pantalla roja con letras
  amarillas y referencia a Flutter, sin alcanzar a leer el error. No se inventa
  mensaje exacto ni se da por resuelto porque la siguiente pantalla cargó.
  SQL confirma misma batalla3f19b9b3… ACTIVA, student/zero LISTO, ninguno iniciado,
  ocho preguntas/cero respuestas y sin liquidación. Evidencia ignorada:
  backend/output/c5-c2-d8c-zero-unido-pantalla-roja.json.
  Se pide no comenzar mientras se investiga el fallo de transición del diálogo.

- D8c investigación: logcat filtrado flutter vacío; registro del proceso propio
  no conserva stack identificable del incidente. No se atribuye un texto exacto
  al error que vio el humano. Archivos brutos ignorados y privados en output/;
  no se publican logs del teléfono ni datos del campo.
- Reproducción automática nueva, con GoRouter real y animación de cierre:
  Unirme y Cancelar fallan2/2 con «A TextEditingController was used after being
  disposed» en battle-invitation-code y errores posteriores del árbol de foco.
  El controlador se destruía inmediatamente al devolver showDialog, antes de
  desmontar el TextField. Log output/c5-c2-d8c-transicion-reproducido.log.
- Corrección localizada: usar onChanged para leer el código; el TextField
  conserva su controlador interno durante su ciclo de vida. Se elimina el
  dispose prematuro, sin cambiar validación, formato o petición de Unirme.
  Regresión en curso. La relación con la pantalla roja humana es consistente
  con el flujo/código, pero no se recuperó su stack físico; repetir cierre USB.
  Primer auxiliar de regresión dio10 aprobadas/1 fallida porque usaba SABER123:
  el formato del campo elimina1 y queda un código de siete caracteres que no
  debe enviarse. Se corrigió el dato ficticio a SABER234 con doble de repositorio,
  sin modificar validación productiva ni datos reales del ensayo. Con dato válido
  se repitió el código previo y ambos cierres reproducen el error del controlador
  (0/2). La nueva repetición comprueba además qué código se envía o se cancela.
  Regresión final del archivo de Batallas: **11/11 aprobadas**, incluidos ambos
  cierres, layout estrecho y privacidad/revisión. Log ignorado:
  output/c5-c2-d8c-transicion-regresion.log. Análisis/build iniciados; aún falta
  instalar y confirmar cierre en Android, sin afirmar prueba física de Unirme otra vez.
  Primer análisis detectó dos avisos por llaves faltantes en el if/else del test
  nuevo; corregidos sin cambiar sus aserciones ni runtime. Se repite análisis
  antes de compilar; no se etiqueta la primera ejecución como limpia.
  Repetición de análisis sin incidencias; build debug aprobado (assembleDebug43,2s),
  mismos defines públicos/sin claves y avisos KGP/Java conocidos. Commit Flutter
  02c774c. Logs c5-c2-d8c-transicion-analyze.log/build.log. adb install -r
  Success; am start -W OK/WARM y reverse43187 activo, sin borrar datos.
  SQL confirma misma batalla ACTIVA, ambos participantes LISTO/no iniciados,
  cero respuestas y sin liquidación: c5-c2-d8c-transicion-batalla-conservada.json.

- D8c cierre físico del campo corregido: como zero, tras abrir Tengo un código,
  escribir PRUEBA22 y Cancelar sin enviar, confirma «Sí» a que se cierra sin
  pantalla roja. No se creó otra batalla ni se atribuye una segunda unión válida
  por USB; Unirme correcto quedó cubierto automáticamente en el test con router.
  La unión real original sigue vigente en la batalla3f19b9b3….
- Regresión completa Flutter del código actual, tras ajustes de layout y ciclo
  de vida: **980 aprobadas/16 opt-in omitidas, cero fallidas**, completada.
  Log output/c5-c2-regresion-tras-batallas.log. Las omitidas requieren entornos
  particulares no habilitados; no sustituyen pruebas humanas ni se cuentan aprobadas.

- D8c primera pregunta zero humana: confirma ambas figuras junto a sus textos
  correctos, buenas proporciones y ninguna opción seleccionada tras Comenzar.
  SQL confirma batalla ACTIVA, zero EN_JUEGO/iniciado, ocho preguntas: cinco
  ilustradas con dos imágenes cada una y tres sumas heredadas solo de texto;
  cero respuestas y sin liquidación, zero XP0. El primer auxiliar asumía que
  todas eran ilustradas y falló esa aserción; se inspeccionó la muestra real y
  se corrigió la expectativa, sin modificar el banco ni las reglas. Evidencia
  ignorada: backend/output/c5-c2-d8c-zero-primera-pregunta.json.

- D8c parte de zero completada: el humano confirma «Terminaste tu parte» y el
  aviso de resultado/explicaciones cuando termine el rival. SQL: ocho respuestas
  correctas, zero FINALIZADO; student LISTO/no iniciado. Batalla sigue ACTIVA,
  resultados PENDIENTE, xpLiquidadoEn:null y XP0 para ambos, sin adelantar premio.
  Evidencia ignorada: backend/output/c5-c2-d8c-zero-finalizado.json.
  Primera pregunta común del banco: «Ensayo C2-D 9», ba7e6a09….

- D8c primera pregunta student humana: tras cambiar de cuenta y Comenzar confirma
  «Ensayo C2-D 9» con ambas figuras bien asociadas y ninguna selección. SQL
  confirma student EN_JUEGO, zero FINALIZADO/8 aciertos, mismas ocho preguntas
  y orden, ocho respuestas totales/sin liquidación. Evidencia ignorada:
  backend/output/c5-c2-d8c-student-primera-pregunta.json.

**Siguiente paso:** terminar regresión/análisis/build del arreglo de contorno
en Trivia/Fantasma, instalar conservando datos y repetir Trivia Matemáticas/60 s
sin potenciadores. Confirmar botones, avance y resultado; después recuperación
y entrada propia de Duelo fantasma.

- Hallazgo de código C2 antes del cierre student: _CorrectionCard de Batallas
  usa Text para respuesta elegida/correcta aunque BattleAnswerOption ya conserva
  imageUrl. Las imágenes sí se dibujan en _QuestionCard, no en esta revisión.
  No se presenta como fallo observado por el humano todavía; se pide observar
  el resultado/revisión mientras se prepara corrección localizada y regresión.
  Se conservará la batalla y no se repetirán respuestas por modificar la revisión.
- D8c cierre real: el humano informa texto «Tu respuesta: Rectángulo azul
  horizontal» y explicación de dimensiones. No informa expresamente el título
  del resultado ni presencia/ausencia de figuras; no se inventa esa observación.
  SQL: FINALIZADA,16 respuestas; **ambos8/8** y primera9 azul correcta para ambos.
  Student GANADA/50 XP (167s), zero PERDIDA/25 XP (214s), según desempate de tiempo
  existente. No se registró el error naranja propuesto; no atribuir caso incorrecto
  humano a D8c. xpLiquidadoEn fijado una vez, ledger competitivo conserva solo
  el evento sintético inicial. Evidencia: c5-c2-d8c-finalizada-sin-imagen-revision.json.
- Revisión de imágenes reproducida automáticamente en cuatro casos:
  correcta/incorrecta y antigua/ilustrada. Antes del arreglo pasan2 antiguas y
  fallan2 ilustradas (sin referencias renderizadas); log
  output/c5-c2-d8c-revision-reproducido.log. Corrección localizada de _CorrectionCard:
  reutilizar AcademicOptionContent para elegida/correcta, manteniendo textos,
  fallbacks y explicación. La correcta solo se añade si procede según la misma
  regla anterior; sin soluciones anticipadas, cambios de API/XP o nuevas cargas.
  Regresión del archivo **15/15 aprobadas**, incluidos los cuatro casos de revisión
  y las correcciones previas (output/c5-c2-d8c-revision-regresion.log). Análisis/
  build aprobados sin incidencias (assembleDebug44,1s), commit Flutter1716e21;
  logs c5-c2-d8c-revision-analyze.log/build.log. Defines dev/API local públicos,
  sin credenciales; avisos KGP/Java conocidos. adb install -r Success y am start
  ejecutado, reverse43187 activo, sin borrar datos ni recrear la batalla.
  am start -W agotó su espera (Status:timeout, LaunchState:UNKNOWN); comprobación
  posterior confirmó proceso vivo y MainActivity reanudada en primer plano,
  API ready/database UP. No se presenta esa espera como pantalla aprobada.
  Falta observar la revisión nueva. La regresión
  global980/16 anterior corresponde a02c774c, no se atribuye al último cambio.
  Regresión completa del código nuevo completada: **984 aprobadas/16 opt-in
  omitidas, cero fallidas**, output/c5-c2-regresion-revision-batallas.log.
  Las omitidas conservan sus requisitos de entorno; no cuentan aprobadas.
- D8c revisión corregida student humana: confirma Victoria/+50 XP y primera9
  con respuesta azul, su figura y explicación. SQL posterior: misma batalla
  FINALIZADA,16 respuestas, xpLiquidadoEn/fecha final idénticas y XP50/25 sin
  cambios; solo un evento competitivo sintético. Evidencia ignorada:
  backend/output/c5-c2-d8c-student-revision-recuperada.json. Falta observar
  resultado/revisión recuperados por zero y repetir comparación sin duplicación.
- D8c revisión recuperada zero humana: confirma Derrota/+25 XP y primera9 con
  figura azul, texto y explicación. SQL de22/10 a09:10 America/Bogota conserva
  exactamente16 respuestas, estado FINALIZADA, fecha final/xpLiquidadoEn
  13:51:29.633Z, student50/zero25 XP y único evento competitivo sintético.
  Evidencia ignorada: backend/output/c5-c2-d8c-zero-revision-recuperada.json.
  **D8c aprobado**: creación/unión real, ambas cuentas, resultado y recuperación
  sin liquidación duplicada. Caso incorrecto de revisión cubierto automáticamente,
  no humanamente; Unirme posterior al arreglo cubierto en widget, Cancelar en USB.
- D8d primer ensayo humano: Matemáticas/60 s, sin potenciadores. Informa que
  las figuras mantienen su proporción, pero **el texto se sale del globo de
  respuesta**; no aparecieron sumas. No se aprueba D8d. SQL de09:13 confirma
  intento e22700f5-d007-4bf2-8564-b9f350ee5089 FINALIZADO por agotar sus12
  preguntas ilustradas,12 correctas/cero errores,3200 puntos/mejor combo12,
  asistido:false y sin liquidación competitiva. No se inventa lectura humana
  del puntaje ni duración completa: terminó en18,7 s al agotar el banco.
  Evidencia ignorada: backend/output/c5-c2-d8d-texto-fuera-boton.json.
  Se reproduce el contorno del botón antes de una corrección localizada.
- D8d reproducción automática del botón compartido Trivia/Fantasma: ocho casos
  (dos modos ×320/412 px ×escala1.0/2.0), figuras decodificadas160×80/80×160,
  esquinas del texto/píxeles dentro del contorno Material real. El primer dato
  ficticio no era UUID válido: se mostraba error de dirección y fallaron8/8 por
  esa preparación, no por el defecto investigado. Corregidas solo referencias
  de test, **0/8 aprobadas** por contenido fuera de StadiumBorder; log ignorado
  output/c5-c2-d8d-bordes-reproducido-valido.log. Ajuste localizado de _AnswerButton:
  RoundedRectangleBorder de radio16, sin cambiar padding, carga de imagen,
  toque, reglas, puntos, API, dependencias ni componente compartido de imágenes.
  Regresión dirigida **36/36 aprobadas**, incluidos ocho casos geométricos y
  pruebas existentes de preguntas, respuestas, sincronización, puntos, ghost y
  presentación: output/c5-c2-d8d-bordes-regresion.log. Flutter analyze --no-pub
  sin incidencias (c5-c2-d8d-bordes-analyze.log). Commit Flutterc19bd1a; build
  debug aprobado (assembleDebug43,7s), defines públicos dev/API local sin claves,
  mismos avisos KGP/Java conocidos; c5-c2-d8d-bordes-build.log. adb install -r
  Success, am start -W OK/COLD y reverse43187 activo, datos conservados.
  Falta vista humana del arreglo y Fantasma USB. La regresión completa984/16 anterior
  corresponde a1716e21; no se atribuye al último cambio de contorno.
D8b pendiente por falta de segundo cliente; D8d/e pendientes. No repetir
D1–D7 ni D8a sin regresión concreta.

## Reanudación de servicios — 21 de octubre de 2026, 23:10–23:15 America/Bogota

**D1–D7 aprobados (7/8). Sigue D8 por subcasos; Tira online pendiente de segundo cliente.**
Antes de pedir remontar servicios, el humano confirmó la primera pregunta
«Ensayo red C2-D…» con ambas figuras y ninguna opción seleccionada. Esa preparación
corresponde a la sesión anterior; no acredita todavía desconexión o reintento.

- Repositorios conservados en `fix/c5-c2-validacion`, HEAD Flutter27afc9c y
  backendda2a2b0. Cambios documentales pendientes y analysis_options.yaml ajeno
  preservados. Sin cambios funcionales nuevos, fetch/push, merge o intervención OV-1.
- API/panel anteriores ya no escuchaban y no había procesos Node vivos.
  Quedaba el contenedor anterior5548e14cf1e3fcd9 y su directorio temporal.
  Se validaron marcador, URL loopback y etiqueta de propiedad; resumen SQL antes
  del cambio: XP académico190, historial10, resultados2, un evento sintético y
  un intento D4 no consumido4c7f272a-8d87-4b69-84f6-5ca117b7f80e (cinco preguntas).
  Resumen técnico ignorado: backend/output/c5-c2-sesion-anterior-resumen.json.
- Se solicitó parada mediante control.json. El control automático rechazó el
  comando de retirar ese contenedor y borrar su directorio: «blocked by policy».
  **Ambos recursos anteriores quedan conservados, limpieza pendiente**; no se
  eludió el rechazo ni se reutilizaron sus credenciales. La propiedad anterior
  está identificada; no operar contenedores ajenos.
- Nueva sesión propia: `saberplus-i2-local-Kb3AT3`, nonce5db53a0f07d51a09;
  PostgreSQL16 tmpfs propio y70 migraciones. local-ranking-ready con
  optionImagesLocal:true. Límite original de dos horas conservado.
- Contraseña nueva únicamente en el campo AUTH_E2E_PASSWORD de
  `C:\Users\modaf\AppData\Local\Temp\saberplus-i2-local-Kb3AT3\flutter-private.json`.
  Ruta comunicada al humano, sin imprimir la clave, tokens o URL de base.
  Cuentas ficticias admin@example.invalid y student@example.invalid; cerrar
  sesiones anteriores e introducir manualmente la clave nueva. No recompilarla.
- API43187: health/live y health/ready OK/database UP; panel4173 real, demo:false.
  ADB reconoce CPH2577 autorizado y reverse tcp:43187 restaurado.
  Se conserva la APK ya instalada: mismo endpoint/código, sin reinstalación.
- Fixture estándar nuevo: «Opciones C2-D - ensayo 5db53a0f»,12 preguntas.
  Fixture D4 reconstruido por las APIs ADMIN reales: mismo tema, subtema
  «Recuperacion de imagenes C2-D»1aefae91…, cinco preguntas con cuatro opciones,
  dos figuras nuevas36f1a6b8…/5fdd5b48… y descripciones veraces. Guardado y recarga
  API comprobados. No se crearon intentos student ni respuestas para esta preparación.
  Los resultados anteriores permanecen como evidencia del ensayo anterior;
  esta base nueva no importa sus usuarios/IDs, historial o XP.

- D4, 23:18 America/Bogota: el humano confirma «Sí» a la primera pregunta
  de la sesión nueva con ambas figuras y ninguna opción seleccionada.
  SQL independiente: intento249ae115-c6a5-48d4-b191-3fdf65245ec2 PRACTICA,
  cinco preguntas, consumidoEn:null; XP académico0, historial0, resultados0,
  un evento competitivo sintético inicial. Evidencia automática ignorada:
  backend/output/c5-c2-d4-baseline-nueva-sesion.json. No acredita aún el corte.

- D4: el humano confirma que volvió a la lección con Atrás y dejó de verse
  la pregunta. Se retiró únicamente `adb reverse tcp:43187`; la lista de túneles
  ya no contiene ese puerto. API local sigue ready/database UP. No se cerró
  sesión ni se detuvo PostgreSQL/API/panel. Se prepara reabrir el borrador local;
  todavía no hay observación humana del fallo de descarga o de su recuperación.

- D4: tras reabrir Practicar sin túnel, el humano confirma que se conserva
  el texto y aparecen los avisos con «Reintentar imagen» para ambas figuras,
  sin opción seleccionada. Es observación humana del fallo de descarga.
  Se restauró únicamente reverse tcp:43187. Comparación SQL con el baseline:
  mismo intento249ae115… no consumido y mismas cinco preguntas; XP0,
  historial0, resultados0, evento competitivo sintético1, sin intentos nuevos.
  Evidencia automática ignorada: backend/output/c5-c2-d4-corte-sin-respuestas.json.
  La primera comparación auxiliar falló al comparar Date de Prisma con cadenas
  JSON del baseline; se normalizaron ambas representaciones y la repetición
  confirmó cero diferencias. Sin fallo de producto ni modificación de datos.
  El reintento y su ausencia de selección accidental aún requieren observación.

- D4 cierre: el humano confirma «Sí» tras pulsar únicamente los reintentos:
  vuelven ambas figuras con proporciones correctas y ninguna opción seleccionada.
  SQL posterior normalizado confirma el mismo intento no consumido, cinco
  preguntas, XP académico0, historial0, resultados0 y evento sintético1.
  Evidencia automática: backend/output/c5-c2-d4-recuperacion-d5-baseline.json.
  **D4 aprobado; total4/8.** Se ensayó fallo de descarga antes de enviar y
  recuperación del mismo borrador; no se simuló pérdida de confirmación de un
  POST ya persistido ni se afirma haber cubierto ese subcaso.
  Baseline D5 zero: sin intentos, historial, resultados, XP ni eventos competitivos.

- D5 paso1 humano: confirma «Sí» a que, tras Más → Cerrar sesión y Atrás,
  la pregunta y las imágenes privadas permanecen inaccesibles. Acredita la
  salida de la sesión anterior; no acredita aún el aislamiento de zero ni
  la reanudación de student. No se borraron datos de la app ni el borrador.

- D5 paso2 humano: tras entrar como zero@example.invalid, confirma en Practicar
  → Ver historial ambos avisos: «Aún no has completado simulacros» y «No hay
  respuestas que coincidan con estos filtros». Vista de historial vacío confirmada;
  no se atribuyen a esta base nueva los resultados de D3 de la sesión anterior.

- D5 paso3 humano: como zero confirma «Aparecen las imagenes bien, sin ninguna
  opcion seleccionada y no aparece el aviso de intento reanudado» al abrir
  Practicar del mismo subtema. SQL confirma intento propio9c460388-6402-405a-9602-dc9bc7d9db28,
  distinto del intento student249ae115…; ambos no consumidos y con cinco preguntas.
  Student conserva exactamente su intento/orden/fechas; ambas cuentas XP0,
  historial0 y resultados0, ledger student1 sintético y zero0. Evidencia ignorada:
  backend/output/c5-c2-d5-zero-intento-propio.json. No se enviaron respuestas.

- D5 cierre humano: tras volver a student y abrir la misma práctica confirma
  «Aparece intento reanudado sin ninguna opcion seleccionada». SQL conserva
  exactamente los intentos propios249ae115…/9c460388… y su orden/fechas,
  sin intentos adicionales, respuestas, resultados, cambios de XP o eventos.
  Evidencia ignorada: backend/output/c5-c2-d5-student-reanudado.json.
  **D5 aprobado; total5/8.** Aislamiento demo/ausencia de token/retiro de bytes
  privados: evidencia automática de editorial_image_test.dart ya ejecutada
  (incluida en las49 dirigidas aprobadas), no observación demo física.
- D6 preparación: CPH2577 Android15, resolución física1080×2400; escala inicial
  consultada1.0 y cambiada mediante ADB a2.0, valor releído2.0. Accesibilidad
  del sistema inicialmente desactivada (accessibility_enabled:0); no atribuir
  lectura TalkBack aún. Se conservará/restaurará escala1.0 al terminar D6.

- D6 paso1 humano: con escala2.0, tras recorrer la pregunta y todas sus opciones,
  confirma «Sí a todo»: textos completos, ambas figuras proporcionadas y todos
  los controles alcanzables sin recortes ni solapamientos. No acredita todavía
  revisión, aviso de error ni lectura por TalkBack a esta escala.
  Se obtuvo árbol de accesibilidad Android mediante uiautomator dump/pull en
  backend/output/c5-c2-d6-semantica.xml (ignorado); TalkBack está instalado,
  sin activar todavía. Es evidencia automática, no confirmación auditiva humana.
  El árbol contiene «Imagen de la opción: Rectángulo naranja vertical» y
  «Imagen de la opción: Rectángulo azul horizontal», unidas al texto respectivo;
  ambas selected:false y Siguiente no pulsable mientras no hay respuesta.

- D6 aclaración: a la petición de volver a la lección el humano responde
  «La pregunta sigue viendose bien». Confirma legibilidad, pero no confirma
  haber salido de la práctica. Se mantiene el túnel activo; no se cuenta un
  segundo corte ni aviso de error observado a escala2.0.

- D6 preparación de error: el humano confirma que ahora ve la lección con el
  botón Practicar y no la pregunta. Se retira solo reverse tcp:43187; lista
  de túneles vacía, escala releída2.0 y API sigue ready/database UP en el PC.
  Pendiente observación del aviso a texto grande.

- D6 aviso humano: confirma que aparecen los avisos de las imágenes y alcanza
  ambos botones Reintentar imagen con texto grande. Los pulsó durante el corte
  y las figuras no aparecieron: resultado esperado sin túnel, no fallo probado
  de recuperación. Se explicó ese estado y se restauró reverse tcp:43187;
  lista confirma el túnel y API ready/database UP. No se dio por recuperado aún.

- D6 recuperación humana: confirma «Exacto» a que, restaurado el túnel, ambos
  reintentos muestran las figuras proporcionadas sin seleccionar respuesta.
  SQL posterior coincide con baseline D5 de ambas cuentas: mismo intento
  student249ae115… no consumido, XP0/historial0/resultados0/evento sintético1.
  Evidencia ignorada: backend/output/c5-c2-d6-reintento-texto-grande.json.
  Pregunta y error/reintento grandes confirmados; descripción accesible expuesta
  verificada automáticamente en Android, sin afirmar lectura TalkBack humana.

- D6 revisión humana: tras completar el intento con naranja primero y azul en
  las otras cuatro, informa que se ve todo bien, pero señala números pegados
  en la explicación: «mide160», «y80», «naranja80», «y160».
  SQL y árbol Android coinciden exactamente con ese texto ya almacenado por
  el preparador auxiliar del fixture de recuperación; no se perdieron espacios
  en Flutter. El preparador estándar prepare_editorial_options_local.mjs sí
  contiene espacios correctos. No se cambia renderer, fuentes o arquitectura.
  Evidencia ignorada: backend/output/c5-c2-d6-revision-y-texto.json y
  backend/output/c5-c2-d6-revision.xml. La consulta SQL auxiliar inicial falló
  por usar la relación opciones en vez de respuestas; corregida y repetida.
  Intento consumido: cuatro correctas/una incorrecta, historial5, resultado1,
  XP académico90 (4×10+50), evento competitivo sintético1 sin nuevas liquidaciones.
- Corrección del contenido sintético local por las APIs ADMIN reales: cinco
  nuevas versiones publicadas con «La azul mide 160 de ancho y 80 de alto;
  la naranja mide 80 de ancho y 160 de alto.». Opciones, imágenes, clasificación
  y correcta conservadas. Versiones previas archivadas conservan la explicación
  original y las referencias históricas; no se reescribe la corrección ya vista.
  Primera solicitud auxiliar de guardado rechazada409 por omitir imagenUrl en
  opciones solo de texto. Se siguió el contrato con imagenUrl:'' en esas opciones,
  sin debilitar el guard; guardado/recarga API aprobados5/5. Comparación SQL
  antes/después: intentos, historial, resultados y eventos inalterados.
  Evidencia: backend/output/c5-c2-d6-correccion-texto-fixture.json; manifest
  temporal actualizado con IDs nuevos y archivedQuestionIds. Corrección de texto
  comprobada automáticamente; no se afirma vista humana del texto nuevo.
- **D6 aprobado; total6/8:** pregunta/revisión y error/reintento con texto grande
  observados por el humano; etiquetas accesibles de ambas figuras comprobadas
  en árbol Android. TalkBack no se activó y no se atribuye prueba auditiva humana.
  Escala restaurada mediante ADB a1.0 y releída1.0.

- D7 configuración humana: observa «Partida en línea», «Llega al escalón5»,
  filtros de área/dificultad/tema, ranking y Comenzar ascenso; se confirma que
  es la configuración esperada, sin atribuir inicio ni imágenes observadas.
  SQL verifica las12 preguntas estándar PUBLICADO/BASICO, cada una con cuatro
  opciones, dos imágenes y una correcta; subtemae4d6f9dc… «Opciones con imágenes».
  Baseline student: ningún intento Cima, XP académico90/historial5/resultados1,
  un evento competitivo sintético. Evidencia: backend/output/c5-c2-d7-baseline.json.
  Se escribió solo control.json de la sesión propia Kb3AT3 con action:solo-on;
  runner confirmó local-solo-admission enabled:true. Sin cambios en guards,
  configuración productiva ni presencia Tira online. Desactivar con solo-off
  al terminar el ensayo de juegos o antes de detener esta sesión.

- D7 paso1 humano: tras configurar y comenzar confirma ambas figuras junto a
  sus textos correctos y ninguna opción seleccionada. SQL: intento Cima
  c792ead8-4b21-46a2-8a52-0934cfe114dd ACTIVO, versión1, competitivo1,
  Matemáticas/Básico y tema/subtema estándar esperados;12 snapshots y cero
  respuestas, competitiveSettledAt:null. Hash SHA256 del snapshot completo
  ff0f9eca61708a682b95510f93a464c20abf82416f91fa6b15eff55991ad7954.
  XP académico90 y evento competitivo sintético1 conservados. Snapshot privado
  guardado solo en evidencia ignorada backend/output/c5-c2-d7-snapshot-inicial.json;
  no se publica la solución futura ni se entrega al cliente como evidencia pública.

- D7 paso2 humano: confirma «¡Acierto! Subes un escalón» y progreso al escalón1
  tras azul horizontal y una pulsación de Confirmar respuesta. SQL registra una
  sola respuesta correcta, mismo intento ACTIVO/snapshot SHA256, sin liquidación
  todavía; XP académico90 y único evento sintético conservados. Evidencia ignorada:
  backend/output/c5-c2-d7-tras-primer-acierto.json. No se afirma reanudación aún.

- D7 punto previo a reabrir humano: confirma «Ensayo C2-D 2» con ambas figuras
  y ninguna opción seleccionada tras Siguiente pregunta. Corresponde a snapshot
  pregunta1da4e035-faa0-4898-8bb3-55a2b373268e, respondidas1/escalón1.
  Se ejecutó am force-stop y am start -W únicamente de com.example.saber_plus,
  sin borrar datos, reinstalar, cerrar sesión ni mutar el intento por API.
  Falta observar la partida tras este arranque.

- D7 reanudación humana: tras arranque COLD (PID25821→4957), confirma una
  respondida/escalón1 y «Ensayo C2-D 2» con ambas figuras y ninguna selección.
  SQL compara mismo intento c792ead8…, snapshot completo con idéntico SHA256,
  pregunta actual1da4e035… y opciones idénticas. Sigue una sola respuesta correcta,
  ACTIVO/no liquidado, ningún intento nuevo, XP académico90 y evento sintético1.
  Evidencia ignorada: backend/output/c5-c2-d7-reanudado.json. Reabrir no duplicó
  ni perdió el acierto; todavía falta cierre y recuperación del resultado final.

- D7 cierre de juego humano: informa «5/12 respondidad 5 aciertos 0 errores».
  SQL confirma VICTORIA, cinco respuestas correctas y snapshot SHA256 idéntico;
  finalizado/competitiveSettledAt presentes. Un único SETTLEMENT para esta fuente
  Cima (además del evento sintético inicial); XP académico permanece90.
  Evidencia ignorada: backend/output/c5-c2-d7-finalizado.json. Consulta auxiliar
  inicial usó nominalDelta/appliedDelta en vez de deltaNominal/deltaAplicado;
  se ajustó al esquema y se repitió sin modificar datos. Falta recuperar resultado
  y confirmar visualmente que se conserva, con SQL sin liquidaciones duplicadas.

- D7 recuperación final humana: tras Recuperar / sincronizar partida confirma
  mismo resultado, escalón5/cinco respondidas/cinco aciertos/cero errores.
  SQL compara mismo intento/snapshot/fechas terminales y cinco respuestas,
  sin intento nuevo ni evento adicional: un único SETTLEMENT SUMMIT de100 XP,
  saldo Cima100, más el sintético Trivia100 inicial; XP académico90 conservado.
  Evidencia ignorada: backend/output/c5-c2-d7-resultado-recuperado.json.
  Se escribió solo-off en control.json propio; runner confirmó
  local-solo-admission enabled:false. **D7 aprobado; total7/8.** Se probó Cima
  por USB; Rescate conserva solo su evidencia automática, no otra prueba humana.

- D8a preparación humana: confirma el botón «Comenzar partida local» tras
  Matemáticas/Rival CPU → Entrenamiento. Sin inicio ni figuras acreditadas aún.
  Dependencia revisada: Tira local utiliza triviaRushRepositoryProvider para
  preguntas/evaluación; CPU/cuerda/reloj de diez segundos se calculan localmente.
  La configuración no tiene filtro de tema/subtema ni dificultad académica.
  Baseline API/SQL guardado en backend/output/c5-c2-d8a-baseline.json (ignorado).
  La revisión está acotada al consumidor, no acredita juego por compartir repositorio.

- D8a fallo humano: informa «ganaste el duelo 1 ronda 1 acierto 1 acierto cpu»
  después de comenzar/responder. No confirma expresamente figuras/proporciones.
  SQL: intento Trivia no competitivo c8590ab9-3055-44b5-8d1c-0808136346e9
  aún ACTIVO,17 preguntas asignadas y solo una respuesta correcta; índice1 y
  siguiente pregunta dff7d473… disponible. La UI terminó tras una sola ronda.
  XP académico90 y eventos2 (sintético+Cima) conservados. Evidencia ignorada:
  backend/output/c5-c2-d8a-termina-una-ronda.json.
  Causa acotada identificada: RemoteTriviaRushRepository expone únicamente la
  pregunta actual; Tira local ignora evaluation.serverState al responder e
  incrementa el índice sobre la lista inicial de un elemento, interpretándolo
  como fin del banco. No corregir reglas de CPU/cuerda ni proyección privada.

- D8a reproducción/corrección automática: nueva prueba de pantalla con dos
  preguntas/imágenes distintas, en variantes banco antiguo y remoto. Ajustado
  el viewport del test para tocar controles visibles, el banco antiguo pasa
  y el remoto falla al buscar la segunda opción: reproduce el fin prematuro.
  Corrección localizada en tug_of_war_page.dart: aceptar la siguiente pregunta
  de evaluation.serverState, conservar el contenido de la ronda actual hasta
  acabar su feedback y añadir la siguiente pregunta solo una vez. Sin alterar
  CPU/cuerda, selección, XP o contrato API; sesiones antiguas siguen su banco.
  Regresión dirigida:81/81 aprobadas (Tira local/animación/online, repositorio
  Trivia y opciones/imágenes académicas); log output/c5-c2-d8a-regresion.log.
  Reproducción previa: output/c5-c2-d8a-reproducido.log,1 aprobada/1 fallida.
  No acredita aún la corrección física; tampoco se atribuyen subcasos de
  timeout o respuesta tardía no ejecutados a la prueba de avance aceptado.

- D8a entrega local de corrección: commit Flutter69e48e5, análisis sin incidencias
  y build debug aprobado (assembleDebug134,9s). Avisos KGP/flutter_timezone y
  acceso nativo Java ya conocidos; sin cambios de dependencias o configuración.
  Defines solo APP_ENV=dev, DEMO_MODE=false y API_BASE_URL/CONTENT_BASE_URL
  loopback43187. Ningún archivo privado o contraseña compilados.
  adb install -r: Success; am start ejecutado, reverse43187 restaurado, sin
  desinstalar ni borrar datos. Regresión Flutter completa iniciada después
  del arreglo: output/c5-c2-d8a-regresion-flutter-completa.log, todavía en curso;
  no declarar971/971 ni omisiones antes de consultar su resultado.

**Siguiente paso exacto:** repetir D8a humano en la APK corregida: Practicar →
  Tira y afloja, Matemáticas, CPU Entrenamiento, Comenzar partida local.
  Responder azul horizontal, pulsar Siguiente pregunta y comprobar segunda
  pregunta con sus figuras/textos; responder antes de vencer el reloj si procede.
  Confirmar proporciones/selección/avance; D8a sigue sin aprobar hasta observarlo.
  D8a/c/d/e pendientes; D8b requiere segundo cliente. C2 sigue abierta.

## Continuación en otro PC — 21 de octubre de 2026, America/Bogota

Responsable: asistente de C5-C2 en sustitución de Pavel, con confirmación visual
del compañero humano. **3/8 bloques humanos aprobados: D1 panel, D2 práctica y D3 corrección/persistencia.**
Rama en ambos repositorios: `fix/c5-c2-validacion`.
HEAD inicial actualizado: Flutter `3513b44`, backend `8444b9a`; `fetch` no encontró
commits posteriores en `origin/main`. `pull --ff-only` completado en ambos.
No se abrió ni modificó el frente OV-1 ni se retomaron los PR cerrados #4/#7.

### Auditoría inicial acotada y recursos

- Rutas: `C:\Users\modaf\saber_plus` y `C:\Users\modaf\SaberPlus-Backend`.
  No se encontraron AGENTS.md en los repositorios ni en sus directorios padres.
- Cambio previo ajeno en Flutter: cuatro exclusiones de plataformas en
  `analysis_options.yaml`. Se preservó con stash y se restauró después de crear
  la rama; el stash sigue como respaldo. Excluir ese archivo de los commits C2.
  Backend estaba limpio.
- Lectura: README de entrada, backend/README, admin/README, índice backend,
  arquitectura, funcionalidades, ruta vigente de etapas, trabajo paralelo y las
  guías C5_ARCHIVOS, C5B_PANEL, C5C_FLUTTER, C5C2_OPCIONES,
  C5C2C_CONSUMIDORES, RELEVO_C5_C2 y esta acta. Se conserva la evidencia anterior;
  no se declara una auditoría de todas las líneas del proyecto.
- Código inspeccionado: referencia/lector privado y AcademicImage/
  AcademicOptionContent; cliente Dio/tokens/salida de sesión; modelos de opciones
  y ubicación de sus consumidores; botones de práctica/Cima; proyección pública
  de opciones, asociación transaccional y lectura/retirada editorial, gate local,
  migración aditiva C2 y guardado/versionado del editor; selector por opción del
  panel y sus pruebas; puntos de snapshots Cima/Rescate/Trivia/Tira; ejecutores
  local_ranking_validation, local_ranking_api y prepare_editorial_options_local.
- Dependencias conservadas: sesión/Dio y Riverpod autoDispose para bytes privados;
  publicación y padres publicados para lectura; Prisma/locks y versiones para
  asociaciones; snapshots y proyección explícita para evitar soluciones previas.
  Autorización histórica y proveedor productivo mantienen sus límites documentados.
- Entorno detectado: Flutter 3.47.0/Dart 3.13.0, Node 24.21.0/npm 11.19.0.
  El manifiesto pide Node 24.14.1/npm 11.11.0; npm avisó EBADENGINE, sin cambiar
  manifests, locks ni SDK. Docker Linux y postgres:16 disponibles.
- Android USB autorizado: CPH2577, Android 15; escala inicial consultada 1.0.
  Se detectó pantalla sin bloqueo. Esto no acredita instalación ni vista de C2.
- El humano confirmó que solo dispone del teléfono conectado. **D8b Tira online
  pendiente por falta de segundo cliente**, sin exclusión de alcance aprobada.
  D8a/c/d/e y D1–D7 siguen pendientes de confirmaciones visuales.

### Comprobaciones automáticas de esta continuación

- `flutter pub get`: completado; sin cambios de pubspec/lock.
- `flutter analyze --no-pub`: aprobado, sin incidencias.
- `flutter test --no-pub --concurrency=2 --reporter=expanded test/academic_option_content_test.dart test/editorial_image_test.dart`:
  **49 aprobadas, cero fallidas/omitidas**. Incluye JSON antiguo, proporción,
  reintento sin selección, logout/demo y transporte privado.
- Desde admin/: `npm test`: **130 aprobadas, cero fallidas/omitidas**;
  `npm run check`: **28 módulos** correctos. No tiene dependencias ni lock;
  no se necesita ejecutar npm ci en esa carpeta.
- Primer `npm ci --include=dev --no-audit --no-fund` backend: falló con
  `UNABLE_TO_VERIFY_LEAF_SIGNATURE` al descargar sharp; aviso adicional EPERM
  durante limpieza de dependencias. Reintento con `NODE_OPTIONS=--use-system-ca`
  solo en el proceso de instalación, sin desactivar TLS ni cambiar configuración
  global. Reintento aprobado: 795 paquetes instalados. `npm run build` aprobado,
  con Prisma 5.22.0 generado explícitamente. Npm 11.19 avisó sobre scripts de
  instalación no autorizados por su política; no se cambió esa política global.
- APK debug compilada con los cuatro defines públicos del relevo, sin credenciales;
  persiste aviso KGP/flutter_timezone y aviso de acceso nativo de Java/Gradle.
  `adb install -r`: Success; `am start` ejecutado para
  `com.example.saber_plus/.MainActivity`, sin desinstalar ni limpiar datos.
- Túnel USB propio `tcp:43187` activo. API `/health/live` y `/health/ready`: OK,
  database UP; panel 200/no-store y `/config.js` con demo:false/API loopback43187.
- Sesión nueva `saberplus-i2-local-1gDJO0`, nonce `5548e14c…`: 70 migraciones
  aplicadas solo a PostgreSQL16 tmpfs propio. Fixture preparado y releído por API:
  «Opciones C2-D - ensayo 5548e14c», subtema «Opciones con imágenes», 12 preguntas,
  cuatro opciones/dos ilustradas. SQL confirma esos conteos y una única correcta.
  Saldo inicial student: Trivia100 XP y un evento sintético del runner; zero:0 XP.
  No atribuir ese evento a una partida humana. Baseline privado de ensayo guardado
  en su directorio temporal; su archivo no se publica.
- Intento de abrir navegador/Bloc de notas automáticamente bloqueado por política
  de ejecución. Se indicó apertura manual de panel/archivo privado al humano;
  no se imprimió ni envió la contraseña y no se intentó evadir el bloqueo.
- D1 paso1 **confirmado por el humano**: «Sí, entré y es API real», acceso
  admin@example.invalid. Acredita login/panel real; todavía no acredita imágenes,
  cancelación ni guardado. D1 permanece parcial, el total sigue 0/8.
  Siguiente comprobación: abrir la pregunta «Ensayo C2-D 1» del tema sintético,
  desplegar sus dos selectores y usar Ver imagen cargada para observar ambas figuras.

### Incidencia automática y corrección localizada

Primera ejecución `npm run test:editorial-files:postgres`: **43/44 aprobadas,
una fallida, cero omitidas**, 70 migraciones; recursos propios limpiados.
Falló Chromium en `questionButton.click()` porque `#bank-list button` era null.
La inspección de QuestionEditor.save confirma que muestra «Guardado y publicado»
antes de esperar loadPage/loadCases. La prueba esperaba solo ese aviso y SQL,
sin esperar la lista ni el desbloqueo; su recarga podía adelantarse a la UI.
Corrección en `backend/test/editorial-files-postgres.test.cjs`: esperar la presencia
y habilitación del botón antes de recargar. No cambia runtime, permisos o XP.
`node --check test/editorial-files-postgres.test.cjs`: aprobado.
Repetición completa `npm run test:editorial-files:postgres`: **44/44 aprobadas,
cero fallidas/omitidas**, 70 migraciones temporales. Chromium real completó
escritorio1280 y viewport390; sus capturas sintéticas están en la carpeta ignorada
`backend/.tmp/c5b-qa/run-la30ZQ`. Esto sigue siendo evidencia automática,
no una confirmación humana ni Android. El runner confirmó limpieza de su propio
contenedor/directorio; la base humana independiente permanece activa.

Regresiones de esta continuación, completadas después de la preparación:

- `npm test -- --runInBand`, backend/: **128 suites /1.675 aprobadas**, cero fallidas.
- `flutter test --no-pub --concurrency=2 --reporter=expanded`: **969 aprobadas,
  16 opt-in omitidas, cero fallidas**. Las omitidas exigen sus entornos/defines
  de integración particulares; no se habilitaron ni se cuentan como aprobadas.
- Logs automáticos locales ignorados: `output/c5-c2-regresion-flutter-local.log`
  en Flutter; `backend/output/c5-c2-regresion-backend-local.log`,
  `c5-c2-postgres-local.log` y `c5-c2-postgres-local-reintento.log` en backend.
  No incorporarlos a Git ni confundir rutas temporales con evidencia permanente.
- No se ejecutó `npm run lint` (incluye --fix) ni se acredita ESLint global limpio;
  permanece la deuda previa documentada de 27 incidencias.

### Registro humano de esta sesión

| Entrada | Evidencia humana | Evidencia automática | Resultado |
| --- | --- | --- | --- |
| D1 paso1, acceso | Confirmó entrada ADMIN y API real. | Panel200/config demo:false y API/SQL disponibles. | Paso aprobado; bloque parcial. |
| D1 paso2, figuras | Tras orientar hacia los desplegables de B/D, el humano confirma: «Si se ven los rectangulos». Acredita ambas vistas previas en el panel. | Detalle ADMIN releído: misma revisión, editable y capacidad activa. Orden real: A «Ninguna…» sin imagen; B naranja con imagen; C «Ambas…» sin imagen; D azul con imagen. | Paso aprobado; D1 todavía parcial. |
| D1 paso3a, carga azul | Tras seleccionar opcion-azul.png, completar metadatos y Subir y usar imagen, confirma: «Listo, se sigue viendo el rectangulo correctamente». | Nuevo archivo fe6e3f16-ee39-4eeb-93c5-1929b6cd8d74 DISPONIBLE,160×80; tres archivos en total. La pregunta original sigue PUBLICADO y conserva su FK azul anterior: cargar no publica la asociación. | Carga/vista aprobadas; falta Guardar pregunta y recargar. |
| D1 paso3b, guardar | Humano informa que no aparece el aviso; precisa «El botón se puede pulsar, pero no veo cambios» y, al subir, «No aparece ningún aviso». Se indica no repetir Guardar ni recargar mientras se comprueba. | SQL confirma guardado: original e08e947b… ARCHIVADO, intermedia 2ad3b450… ARCHIVADO y actual 3e64af95-d6c7-472a-a474-2bff033ddeae PUBLICADO. Ambas nuevas enlazan azul fe6e3f16… y naranja original; cuatro textos y correcta azul conservados. Dos versiones nuevas compatibles con dos pulsaciones, no con pérdida del archivo. | Persistencia comprobada automáticamente; fallo de visibilidad del feedback en corrección, falta repetir visualmente. |
| D1 paso3c, panel corregido | Tras recargar/reingresar y reabrir, confirma el estado junto a Guardar: «Puedes editar y guardar los cambios directamente.». | Corrección backend53b88fb; acta espejo Flutter13101c5. Regresiones130 panel/44 integradas aprobadas. | Ubicación del estado confirmada; falta confirmar aviso tras una pulsación de Guardar. |
| D1 paso3d, aviso de guardado | Tras una pulsación, confirma: «Guardado y publicado. En demostración, el cambio es solo local.». | SQL: cuatro versiones en total, solo c3250713-6d74-4332-8fb0-f779606ceba5 PUBLICADO; azul nuevo fe6e3f16… y naranja d0128fce… conservados, correcta azul. Config del panel demo:false. La coletilla demo era texto incondicional del editor, no un cambio de entorno. | Guardado y visibilidad del aviso aprobados; corregir frase demo y falta recarga visual de figuras. |
| D1 paso3e, recarga | Tras Recargar registro seleccionado y Ver imagen cargada confirma: «Sí, se conservan ambas figuras y sus textos». | ADMIN conserva id c3250713…, revisión243cfe6c…; dos imágenes, cuatro textos y una correcta. Baseline previo a cancelación guardado en la sesión temporal. | Guardado/recarga de imágenes aprobados; D1 aún parcial. |
| D1 paso4, cancelar selección | Tras abrir selector en «Ninguna de las dos figuras», Cancelar y recargar sin guardar, confirma que sigue sin imagen y la correcta sigue azul. | Detalle ADMIN cotejado contra c2d-before-cancel.json: misma revisión243cfe6c…, mismas cuatro opciones/asociaciones, dos imágenes y una correcta. | Cancelación aprobada. |
| D1 paso5, texto obligatorio | Con imagen azul y correcta conservadas, al vaciar solo el texto y Guardar confirma: «Completa los textos requeridos y respeta el límite de 4000 caracteres. Si tienes texto pendiente, cópialo antes de recargar.». | SQL sigue con cuatro versiones y solo c3250713… PUBLICADO. ADMIN conserva revisión243cfe6c…, textos e imágenes originales. No se publicó la respuesta vacía. | Rechazo aprobado; falta restaurar el borrador local deliberadamente inválido. |
| D1 paso5b, restaurar texto | Tras Recargar registro seleccionado confirma: «Vuelve y sigue marcado como respuesta», referido al texto azul y su marca de correcta. | La versión persistida no había sido alterada por el rechazo; se recuperó desde ella. | Restauración confirmada, sin nuevo Guardar. |
| D1 paso6a, quitar naranja | Confirma aviso de guardado y respuesta naranja solo de texto tras Quitar imagen de este contenido y Guardar una vez. | Actual2d05d400… PUBLICADO, naranja sin referencia/FK; azul nuevo correcta. Archivo naranja d0128fce… DISPONIBLE, cuatro referencias en versiones archivadas de esta pregunta; descarga ADMIN110 bytes con SHA-256 coincidente. | Desvinculación y conservación de bytes aprobadas; restauración pendiente. |
| D1 paso6b, carga naranja | Confirma vista vertical y aviso «Imagen lista: Rectángulo naranja vertical. Guarda el contenido para incorporarla.». Aclara que escribió guiones en Descripción para lectores, también en la carga azul anterior. | Nueva naranja28b7a50b… DISPONIBLE80×160, alt «-----»; azulfe6e3f16… alt «--». La versión publicada2d05d400… aún no asocia naranja. Los archivos originales del fixture sí tienen descripción veraz. | Vista/carga confirmadas; metadatos accesibles insuficientes, corregir antes del guardado final. |
| D1 paso6c, descripción naranja | Tras repetir la carga con descripción completa confirma: «Listo, termina y se ve bien». | Archivobd25a43e-67a6-408c-8e92-f407baaf5c3a DISPONIBLE80×160; textoAlternativo exacto «Rectángulo naranja vertical, de 80 píxeles de ancho y 160 de alto.». | Carga y metadatos naranja corregidos; pendiente asociar al guardar. |
| D1 paso6d, descripción azul | Tras cargar opcion-azul.png con descripción completa confirma: «Listo, se ve bien». | Nueva carga azul DISPONIBLE160×80 con descripción que incluye160 de ancho y80 de alto; naranja corregida sigue disponible y conserva su descripción. IDs definitivos registrados en los archivos privados de esta sesión. | Ambas cargas corregidas disponibles; falta guardar asociaciones y recargar. |
| D1 paso6e, guardado y recarga final | Informa primero naranja en una opción distinta y después confirma que, tras volver a subirla donde corresponde, guardar y recargar, «se ven bien y donde es». No se atribuye la causa al humano ni al software sin reproducción. | SQL confirma intermedia dcf4e128… con naranja asociada a «Ambas figuras…»; actual e2826d61-c150-4f91-aef9-533f3821aa26 PUBLICADO, naranja eee6dd70…80×160 en su texto y azul003f5a00…160×80 en el suyo, única correcta azul. Ambas descripciones completas, cuatro textos, dos imágenes y ADMIN coincide. | Restauración y recarga aprobadas; incidencia de asociación corregida en los datos, causa sin confirmar. |
| D1 cierre | Acceso, figuras, carga, guardado/recarga, cancelación, texto obligatorio, quitar/restaurar y feedback confirmados en pasos anteriores. | API/SQL, descripción/dimensiones, bytes conservados y regresiones documentadas. Baseline final privado c2d-final-d1.json; revisión e9ca3b45…. | **D1 aprobado. Total1/8.** |
| D2 paso1, ingreso Android | Tras indicar student@example.invalid y clave temporal confirma: «Listo, estoy en inicio». | API/SQL UP y reverse43187 restaurado antes del ingreso; APK de esta sesión instalada. | Acceso confirmado; imágenes/selección en práctica pendientes. |
| D2 paso2, sesión aleatoria | Configura Matemáticas/Básico/5 y confirma primera pregunta «Ensayo cima». | Intento07c66604-25c7-420d-a335-726282998055: posiciones1/2 sumas11+1 y8+1; posición3 «Ensayo C2-D 5» con dos imágenes; posiciones4/5 sumas9+1 y4+1. Solo una pregunta C2-D en esta muestra: no atribuir dos envíos ilustrados distintos a este intento. | Sesión identificada; falta observar la pregunta3 y su selección. |
| D2 paso3, imágenes Android | En pregunta3 «Ensayo C2-D 5», tras avanzar las dos sumas confirma: «Se ven bien», referido a azul horizontal/naranja vertical, textos, proporción y ausencia de recortes. | HTTP real con absent:5 preguntas/20 opciones; solo id/imagenUrl/texto, sin explicación/solución/FK/autoría. Descarga WEBP autenticada de ambas figuras:160×80 y80×160,110 bytes cada una. No se tocó el intento de student; se creó un intento de lectura separado para absent, sin enviar respuestas ni XP. | Vista y proyección aprobadas; falta toque/selección antes de cerrar D2. |
| D2 paso4 y cierre | Tras tocar directamente el rectángulo azul, confirma que solo «Rectángulo azul horizontal» queda seleccionada. | Proyección HTTP/bytes y pregunta asignada cotejados por separado; envío/resultado se comprobarán en D3. | **D2 aprobado. Total2/8.** |
| D3 preparación | Sin confirmación del resultado todavía. | Antes de enviar intento07c66604…: no consumido, XP académico0, historial0, resultados0; ledger competitivo1 evento sintético/Trivia100, sin eventos nuevos. | Baseline registrado; resultado humano pendiente. |
| D3 paso1, corrección azul | Tras completar sumas4/5 y Finalizar → Enviar, confirma azul correcta con su figura y explicación en «Ensayo C2-D 5». | Intento07c66604… consumido; cinco filas de historial, un resultado y XP académico100. Fila ilustrada correcta, seleccionada=correcta5efc3589… con imagen515c660d…. Sesión historialcb1b878c…. Ledger competitivo conserva un evento sintético y saldoTrivia100, sin liquidación nueva. | Corrección correcta aprobada; falta historial/reapertura y caso naranja incorrecta. |
| D3 paso2, historial | En Practicar → Ver historial → Historial de respuestas → Opciones con imágenes confirma «Si sale», referido a Ensayo C2-D 5, respuesta azul/figura y marca de correcta. | Fila persistida e IDs cotejados en el paso anterior. | Historial correcto confirmado; falta reapertura y caso incorrecto. |
| D3 paso3, reapertura | Tras reinicio COLD, volver a Historial y desplegar la entrada confirma: «Sí, ahí sigue», referido a pregunta5, respuesta azul/figura y correcta. | am force-stop/am start -W solo de com.example.saber_plus, PID13813→6428; sin borrar datos/reinstalar. Tras reapertura: mismas cinco respuestas/un resultado/XP académico100, un evento competitivo sintético/Trivia100; sin duplicaciones. | Persistencia correcta aprobada; falta caso naranja incorrecta y su revisión. |
| D3 paso4, segunda práctica | Desde práctica del subtema confirma: «Aparece Ensayo C2-D 7 con ambas figuras». | Nueva sesión PRACTICA de cinco preguntas, todas con dos imágenes; primera pregunta7. Baseline XP académico100 y sesión previa cerrada, sin cambiar selección productiva. | Segunda sesión preparada; falta enviar naranja en7 y observar resultado. |
| D3 paso5, corrección incorrecta | Tras naranja en7 y azul en las restantes confirma: «Aparece la correcta, la incorrecta y la explicacion de la pregunta donde indica de donde sale la respuesta». | Intento3ff7096d… consumido, sesión historial3a793c44…:4 correctas/1 incorrecta; seleccionada naranja976e3250… con imagend0128fce…, correcta azul8e6f4f62… con imagen515c660d…. Historial10, resultados2, XP académico190 (incremento90 según regla existente4×10+50); ledger competitivo sigue un evento sintético/Trivia100. | Corrección/explicación confirmadas; falta comprobar vista del cuaderno con ambas figuras. |
| D3 paso6 y cierre | En Progreso → Cuaderno confirma pregunta7, naranja seleccionada con figura, azul correcta con figura y explicación. | Tras consulta se conservan historial10/resultados2/XP académico190, un evento sintético y saldoTrivia100; sin duplicaciones. Cuaderno derivado del historial: un pendiente. Corrección correcta/incorrecta, historial y reinicio COLD cubiertos en pasos anteriores. | **D3 aprobado. Total3/8.** |
| D4 preparación | Sin prueba humana nueva todavía. | Fixture por APIs ADMIN reales en la misma base: subtema f369468c… «Recuperacion de imagenes C2-D», mismo tema5548e14c, cinco preguntas «Ensayo red C2-D…», dos imágenes nuevas5d69f697… yb263d640… con descripciones/dimensiones veraces. Guardado/recarga API comprobados. Sin intento student ni respuestas/XP; no se cambiaron reglas ni preguntas anteriores. | Preparado para descarga nueva; falta iniciar práctica y preparar corte USB. |
| D4 primera preparación | Confirma primera pregunta «Ensayo red C2-D…» con ambas figuras y ninguna opción seleccionada. Después solicita remontar servicios/clave nueva. | Sesión anterior con intento no consumido4c7f272a…; base nueva preparada en la entrada de reanudación superior. | Preparación confirmada; corte/recuperación pendientes. |
| D4 corte y recuperación, sesión nueva | Confirma ambas figuras sin selección, vuelve a lección; sin reverse observa texto y avisos de reintento; restaurado el túnel, ambos reintentos recuperan figuras proporcionadas sin seleccionar respuesta. | Mismo intento249ae115… no consumido y cinco preguntas antes/después, XP0/historial0/resultados0/evento sintético1; sin nuevo intento. Ver evidencia superior. | **D4 aprobado. Total4/8.** Corte anterior al envío; sin ensayo de confirmación perdida después de POST. |
| D5 logout y cuentas | Tras logout/Atrás no vuelve contenido privado; zero ve historial vacío y práctica sin reanudación; al volver a student aparece Intento reanudado sin selección. | Dos intentos propios distintos, sin cambios en historial/resultados/XP/eventos al alternar. Demo/sin token solo pruebas automáticas. | **D5 aprobado. Total5/8.** |
| D6 texto grande | Confirma pregunta completa, error/reintentos alcanzables, recuperación sin selección y revisión completa; detecta espacios faltantes en explicación del fixture. | Escala2.0; etiquetas accesibles Android verificadas, sin TalkBack humano. SQL demuestra texto ya guardado sin espacios; corregidas cinco versiones por API, sin reescribir historial. Escala restaurada1.0. | **D6 aprobado. Total6/8.** Texto nuevo verificado automáticamente. |
| D7 Cima | Figuras iniciales, acierto, reinicio COLD, misma pregunta2/figuras/progreso, cierre5/5 y resultado recuperado confirmados. | Mismo intento/snapshot SHA256, cinco respuestas; única liquidación Cima100 XP antes/después de recuperar. Admisión sintética apagada al finalizar. | **D7 aprobado. Total7/8.** Rescate no probado por USB. |
| D8a, Tira local | Tras corregir avance y borde, confirma texto/figuras completos dentro de los botones y avance entre preguntas. | SQL sesión nueva:12 preguntas/tres aciertos, historial3/XP0/evento sintético1;85/85 pruebas dirigidas. No acredita Tira online. | **Aprobado. D8 completo pendiente; total7/8.** |
| D8b, Tira online | Humano confirma un único teléfono disponible. | No se simula segundo cliente ni presencia. | Pendiente: falta segundo cliente. |
| D8c, Batallas | Diálogo sin overflow/cierre Cancelar sin pantalla roja confirmados tras correcciones. Ambas cuentas observan figuras al jugar; zero observa espera sin corrección anticipada. Al terminar student informa respuesta azul y explicación. | Misma batalla FINALIZADA,16 respuestas/ambos8 aciertos; student gana por tiempo, XP50/25. Revisión carecía de imágenes: corregida en1716e21,15/15 pruebas/análisis/build/instalación aprobados. Falta observar resultado/revisión corregida de ambas cuentas y deduplicación. | Pendiente. |
| D8d, Trivia Rush | Sin ejecución humana. | Contrato automatizado no acredita esta pantalla. | Pendiente. |
| D8e, Fantasma | Sin ejecución humana. | Compartir código con Trivia no acredita su pantalla. | Pendiente. |

**Estado operativo:** API/panel/base humana y reverse43187 activos, sin solo-on,
sin corte de red, sin cambio de escala y sin credenciales dentro de la APK.
Al comenzar D2, ADB seguía autorizado pero el túnel no aparecía en reverse --list;
se restauró únicamente tcp:43187 y se abrió com.example.saber_plus. No se atribuye
ese hallazgo a una desconexión D4 ensayada ni se afirma login humano todavía.
La sesión humana caduca dos horas después de local-ranking-ready; si caduca,
crear otra sesión y volver a entrar con su clave propia. No reutilizar la anterior.

Consultas auxiliares de solo lectura: se corrigió el nombre del campo temporal
a creadoEn y se cotejaron referencias por UUID en vez de texto con tildes al pasar
JavaScript por PowerShell. Los intentos iniciales no escribieron datos ni implican
un fallo de la app. La comprobación final de archivo/FK quedó aprobada.

### Corrección de feedback del panel durante D1

Reproducción automática de solo lectura en Chromium1280×900, con el banco humano
de12 preguntas: al desplazar hasta Guardar, el mensaje superior quedó entre
y=−2101 e y=−2077, mientras el botón quedó en y=428. No se escribió en el formulario
humano ni se declaró observación visual humana a partir de esta medida.
La posición explica que el aviso no acompañe a la acción; no acredita por sí sola
por qué el humano tampoco lo identificó al subir.

Corrección localizada en `admin/public/question-editor.mjs` e `index.html`:
copia visual del estado junto a Guardar, sincronizada también para errores,
cambio de registro y cierre. La copia es aria-hidden; el role=status/aria-live
superior sigue anunciando una sola vez. Se corrigió además la ayuda antigua que
afirmaba que las imágenes en opciones no estaban implementadas: conserva texto
obligatorio y explica la imagen opcional cuando aparece el selector.
No se cambian permisos, guardado/versionado, API, XP, migraciones o dependencias.

Regresión de `admin/test/question-editor.test.mjs` ampliada: confirmación y error
junto al botón, limpieza al cerrar y ausencia de éxito obsoleto al cambiar registro.
Antes del arreglo:12/14 aprobadas y2 fallidas por ausencia del estado cercano.
Después del arreglo: panel completo130/130 aprobado; sintaxis28 módulos correcta.
Chromium/PostgreSQL ampliado para exigir confirmación visible en viewport390 y
evitar anuncios accesibles duplicados:44/44 aprobadas, cero fallidas/omitidas,
70 migraciones temporales; limpieza de recursos propios confirmada.
Capturas sintéticas ignoradas: `backend/.tmp/c5b-qa/run-10Bipk`; log ignorado
`backend/output/c5-c2-postgres-feedback.log`. Confirmación humana posterior de
estado y éxito junto al botón registrada en D1 paso3c/d; no se necesitó otra APK.
No se repiten las regresiones Flutter/backend sin cambios de esos componentes.

El humano confirmó posteriormente el aviso de éxito junto a Guardar. Detectó
también la coletilla «En demostración…» en una sesión real. Se verificó
`/config.js` con demo:false y persistencia PostgreSQL de la nueva versión.
La causa es texto incondicional en las dos ramas del guardado directo (crear/editar),
no una conexión accidental a demo. Corrección: la coletilla se añade solo si api.demo
es true. Dos casos de regresión del editor distinguen aviso real y demo; antes del
arreglo15/16 aprobadas y1 fallida en modo real. Regresión panel posterior:
132/132 aprobadas, cero fallidas/omitidas; sintaxis28 módulos correcta. Log ignorado:
`backend/output/c5-c2-panel-modo-feedback.log`.
No requiere repetir el bloque de carga/guardado ya observado ni las pruebas API/SQL
por una corrección exclusiva de texto; el aviso exacto nuevo queda pendiente de
observar cuando el panel cargue esa versión.

Comprobación de cuaderno: la consulta inicial asumía que calificar creaba una fila
CuadernoError y se corrigió tras leer el servicio. El cuaderno deriva errores del
historial y usa CuadernoError para notas/estado. Listar con el servicio existente
confirma un error pendiente de pregunta7 con las dos referencias correctas;
no se creó una fila artificial ni se cambió el comportamiento de la app.

**Siguiente paso histórico antes de la reanudación superior:** D4: abrir el nuevo subtema «Recuperacion de imagenes C2-D» y
Practicar; confirmar primera pregunta sin responder. Después salir a la lección
para disponer sus imágenes y retirar solo reverse43187; reabrir el borrador local
(la carga de práctica restaura el borrador antes de consultar API). Confirmar aviso
de imagen y recuperación sin seleccionar/enviar respuestas. StatefulShellRoute
mantiene el cuaderno con referencias anteriores: el fixture nuevo evita ese caché.
Las dos sesiones de D3 ya cubrieron azul correcta y naranja incorrecta.
No repetir D1–D3 aprobados salvo regresión concreta. D4–D7 y D8a–e siguen pendientes;
D8b requiere segundo cliente. Las cargas previas permanecen solo en la sesión
desechable; no borrar archivos con usos históricos. Coletilla demo corregida;
texto exacto nuevo aún sin observación humana tras cargar esa versión del panel.
Sin push, merge, despliegue o SQL remoto. C2 continúa abierta; no preparar cierre8/8.

## Checkpoint — 21 de octubre de 2026

**Nuevo responsable de C2:** otro compañero sustituye al propietario, sin tocar
el frente OV-1. Seguir [relevo completo](RELEVO_C5_C2.md): usuarios/clave temporal,
Docker/USB, auditoría, pruebas paso a paso y cambios permitidos Flutter/API/panel.
La tabla inferior conserva0/8; D8 se desglosa en D8a–e, todos pendientes.

**Preparación lista; 0/8 bloques humanos confirmados.** La evidencia automática
de [C2-C](C5C2C_CONSUMIDORES.md) no sustituye este recorrido Android.
Se inició PostgreSQL16 propio en Docker,70 migraciones, API AppModule en
127.0.0.1:43187 y panel real local en127.0.0.1:4173. Son servicios temporales:
verificar disponibilidad al retomar, no asumir que siguen activos.

Se compiló una APK debug nueva con los cuatro defines públicos de desarrollo,
sin contraseñas integradas. Al preparar este checkpoint, adb no detectaba
ningún dispositivo; no se afirma instalación ni ejecución física de esta APK.
La compilación advierte compatibilidad futura de KGP/flutter_timezone;
no se cambiaron dependencias para silenciarla.

### Preparación del relevo (no cuenta como prueba humana)

El propietario delegó C2 a otro compañero, distinto del responsable de OV-1.
Se preparó la guía operativa completa y se repitió análisis Flutter sin incidencias,
49 tests dirigidos Flutter,12 Jest de proyección/publicación y12 controles locales:
todos aprobados. Se comprobaron84 enlaces locales de seis documentos de entrada
en Flutter, sin destinos ausentes; guía espejo idéntica en ambos repos.
No se ejecutó de nuevo la regresión global ni PostgreSQL en este relevo documental;
su evidencia anterior permanece en C2-C. No hay confirmación humana nueva.

Cierre posterior: código integrado en main local mediante los merges registrados
en RELEVO_C5_C2.md, sin diferencias funcionales respecto a los commits probados.
Verificación documental final:354 enlaces locales en diez documentos Flutter y
129 en ocho documentos backend, sin destinos ausentes; siete documentos espejo
idénticos. Sin push nuevo, CI remoto, instalación USB nueva ni despliegue.

## Datos de ensayo y seguridad

- Sesión creada por local_ranking_validation.mjs, nunca una base existente.
- Opt-in explícito SABERPLUS_C5_OPTION_IMAGES_LOCAL=true solo para esa API
  desechable; ausencia/false mantiene la carga por opción apagada. Otros valores
  se rechazan antes de crear recursos. No se heredan flags productivos.
- prepare_editorial_options_local.mjs comprueba dueño, directorio temporal,
  contexto Docker local y etiqueta antes de autenticarse con la cuenta ficticia.
- Banco sintético: tema «Opciones C2-D - ensayo …», Matemáticas; subtema
  «Opciones con imágenes»;12 preguntas básicas, cuatro opciones cada una.
- Azul horizontal160×80 y naranja vertical80×160; dos opciones adicionales
  solo de texto. La correcta es «Rectángulo azul horizontal».
- Preparador ejecutado correctamente: guardado y recarga por API comprobados,
  dos referencias de imagen conservadas. Esto no confirma la vista física del panel.
- Credenciales únicamente en flutter-private.json del directorio temporal.
  No imprimirlas, copiarlas a documentación, Git o defines del APK.
- Preparador sin cambios en producción, Supabase/Render, OV-1 o permisos históricos.
  La integración posterior del código en main local se registra en el relevo.

## Guion humano

| Bloque | Comprobación | Estado |
| --- | --- | --- |
| 1 | Panel: editar/guardar/recargar las imágenes; cancelar selección no publica. | Aprobado; evidencia humana D1 de esta continuación. |
| 2 | Práctica: figuras distintas y proporcionales, texto legible y selección correcta. | Aprobado; evidencia humana D2 de esta continuación. |
| 3 | Finalizar/revisar y reabrir: opción, explicación, figura y resultado conservados. | Aprobado; evidencia humana D3 de esta continuación. |
| 4 | Corte/recuperación: aviso completo y reintento sin seleccionar ni duplicar respuesta. | Aprobado; D4 sesión5db53a0f, antes del envío; no se ensayó confirmación perdida tras POST. |
| 5 | Logout/reingreso: no acceder a contenido privado con la sesión anterior; demo aislada. | Aprobado; cuentas/logout USB humanos, demo/sin token automáticos; sin demo física. |
| 6 | Texto grande/pantalla estrecha: controles legibles sin recortes ni estiramiento. | Aprobado a escala2.0; semántica Android automática; sin TalkBack humano. Escala restaurada1.0. |
| 7 | Cima o Rescate: recuperar intento/snapshot con figuras; sin XP duplicado. | Aprobado en Cima; snapshot/reinicio/resultado y liquidación única comprobados. |
| 8 | Tira/Batallas y Trivia/Fantasma: registrar cada subcaso y sus límites. | Parcial: D8a/c/d/e aprobados; solo D8b pendiente por segundo cliente. |

Son ocho bloques con varios pasos, no ocho toques. Registrar confirmaciones reales
y subcasos pendientes; no cerrar8/8 por probar un solo juego. Antes de juegos,
comprobar banco y reglas de admisión: el preparador no fuerza victorias ni XP.
No retirar/archivar recursos para fingir autorización histórica; sigue pendiente.

## Reanudar en otro momento

Desde backend/, tras compilar el backend y con Docker local:

```powershell
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL = 'true'
node tool/local_ranking_validation.mjs
```

En otra terminal, copiar solo la ruta que devuelve local-ranking-ready:

```powershell
$env:SABERPLUS_LOCAL_SESSION = '<directorio temporal de esta sesión>'
node tool/prepare_editorial_options_local.mjs
```

El preparador reconoce su manifiesto al repetirse. Si una preparación falla
antes de escribirlo, revisar el banco sintético o abrir una sesión nueva;
no afirmar que hubo rollback de cargas HTTP parciales.
La API tiene límite de dos horas y limpieza de sus recursos propios al terminar.
El panel se inicia desde admin/ con API_BASE_URL=http://127.0.0.1:43187.
Conectar Android por USB, depuración/instalación permitidas y pantalla desbloqueada;
comprobar adb devices y configurar adb reverse tcp:43187 tcp:43187.
Instalar la APK nueva conservando los datos, sin dar por válido un binario anterior.

**Siguiente acción:** detectar el celular, instalar y comenzar por el bloque1.
No hay confirmaciones humanas nuevas; código y relevo integrados en main local
según [guía](RELEVO_C5_C2.md), sin push nuevo ni despliegue.
