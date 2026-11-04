# Piloto — objetivo de pruebas automatizadas de capacidad

2/nov/2026. Objetivo solicitado expresamente por el propietario: completar los ensayos locales y avisar si hace falta ayuda. No equivale a contratar infraestructura ni certificar un número de alumnos en producción. Complementa [costos y capacidad](PILOTO_FUNDADOR_COSTOS_CAPACIDAD.md).

## Entorno y alcance

Fixtures I2 en PostgreSQL Docker propio validado mediante marcador temporal, URL loopback y etiquetas; filas nuevas sintéticas con prefijo de ejecución. Worker NestJS en proceso separado, bind127.0.0.1 y puerto aleatorio; no se utiliza API remota ni `.env`. Storage oficial Supabase fijado por digest con bucket privado propio, red/volumen y credenciales aleatorias, retirados por su runner tras comprobar propiedad. No cambiar datos del colegio ni cuentas personales.

El worker carga AppModule compilado y replica ValidationPipe y el límite global de1000 solicitudes/IP/15min del bootstrap de producción. **No es `main.ts` completo ni NODE_ENV production**: los recursos editoriales se habilitan solo en test, no replica todos los middleware de seguridad. No se relajan límites para hacer pasar carga; separar escenarios mediante procesos nuevos reinicia el contador en memoria y JWT, lo cual se declara explícitamente. Nunca extrapolar esa separación a una jornada escolar continua.

CPU/RAM del worker se muestrean por IPC cada segundo; CPU expresada como porcentaje de un núcleo puede superar100% por bcrypt/libuv. Los picos son acumulados desde el inicio del worker de cada grupo de escenarios, no necesariamente de una única ruta. No suman RAM de Windows, generador, Docker, PostgreSQL o Storage; no representan un límite de memoria impuesto equivalente a Render. La base es sintética y pequeña, con cuatro conexiones por cliente Prisma según la URL del fixture, no cuatro conexiones totales garantizadas. Se muestrea `pg_stat_activity` del rol propio: incluye conexiones de todos los procesos contra ese fixture; se descuenta el observador de la cifra activa. Muestreo1s, potencialmente sesgado por la espera del propio pool: cero esperas observadas no demuestra ausencia de contención ni picos cortos.

## Matriz de ejecución

| Escenario | Demanda acotada | Validación |
| --- | --- | --- |
| Autenticación | 75 cuentas,15 solicitudes concurrentes | HTTP201 e identidad exacta; bcrypt real del fixture. |
| Navegación con imagen privada | 30 clientes,4 rondas espaciadas30s, duración mínima120s | Temas/perfil/ranking, imagen original sintética de ruido640×360; hash exacto contra lectura de referencia. Sin caché HTTP cliente. |
| Diagnóstico | 75 inicios y75 entregas,15 preguntas/5 áreas | Resultado completo y correcto;75 diagnósticos,1125 respuestas y375 resultados por área; reenvíos secuenciales sin duplicación. |
| Juegos individuales | 30 jugadores por Cima/Guardián/Rescate | Inicio y respuestas HTTP hasta victoria; estado recuperable. Competitivo false, no inferir validez de economía competitiva. |
| PDF | 3 solicitudes concurrentes | Cabecera PDF y tamaño no vacío; imagen servida por proveedor real local. No representa descarga masiva ni impresiones. |
| Presencia Trivia | 30 sockets,10 reconexiones,45s de observación | Autenticación/propiedad, observación activa, consulta y abandono; lease/heartbeat del servidor. No promete victoria ni carga de respuestas en tiempo real. |
| Tira y afloja | 30 conexiones,5 parejas preparadas por HTTP y150 latidos | Autenticación socket, emparejamiento/listos, latidos y abandono; no simula una partida completa ni certifica entrega de eventos de sala en cada cliente. |

Estos son objetivos de prueba: registrar la evidencia al concluir, no marcarlos aprobados porque exista el script. Login/lecturas iniciales anteriores siguen en el documento de costos; no se confunden con esta batería.

## Controles y riesgos

`tool/pilot_capacity_extended.mjs <owner.json>`: máximo9000 solicitudes HTTP por ejecución,15s timeout por solicitud, partida individual máximo12 respuestas y parada por error. `tool/pilot_capacity_worker.cjs`: parada automática12min, cierre por IPC/desconexión y telemetría acotada. Los sockets se desconectan en finally; el worker se cierra antes de retirar Storage. Nunca imprimir tokens, claves, URL de BD ni cuerpos con información privada. Los recursos I2 pertenecen a su runner, no se eliminan por aproximación.

La ruta GET de preguntas crea intento: se excluye de lecturas puras; escrituras se ensayan mediante escenarios explícitos. No afirmar idempotencia concurrente del diagnóstico por reenvíos secuenciales: se comprueba aparte si se incluye una doble entrega simultánea. No interpretar429 como capacidad de CPU agotada: es protección por IP, especialmente importante en colegios con salida compartida.

## Resultado

**Batería local completada**, no autorización comercial de capacidad. Evidencia `.tmp/pilot-capacity-extended-final.log`: salida0,9 escenarios/1823 operaciones medidas, cero errores inesperados. Incluye operaciones HTTP y confirmaciones socket; no son1823 solicitudes HTTP. Operaciones de preparación/login entre escenarios no forman parte de esa suma. Percentiles nearest-rank incluyen todas las muestras de cada escenario.

| Escenario final | Operaciones medidas | p95 | p99 | Resultado |
| --- | ---: | ---: | ---: | --- |
| 75 logins en15 carriles | 75 | 711ms | 877ms | Identidades correctas |
| 30 clientes,124,5s de navegación | 480 | 1617ms | 1885ms | Cero errores; imagen195.506 bytes verificada por hash |
| 75 inicios/entregas diagnóstico | 150 | 2712ms | 2717ms | 75 completos,1125 respuestas,375 resultados por área |
| Cima30 | 240 | 563ms | 737ms | 30 victorias,5 respuestas únicas cada una, reenvío final idempotente |
| Guardián30 | 270 | 486ms | 547ms | 30 victorias,6 respuestas únicas cada una, reenvío final idempotente |
| Rescate30 | 270 | 402ms | 560ms | 30 victorias,6 respuestas únicas cada una, reenvío final idempotente |
| PDF con imagen,3 concurrentes | 3 | 704ms | 704ms | Firma PDF, tamaño>10KB; total2.020.581 bytes |
| Trivia30 y10 reconexiones | 130 | 1365ms | 1404ms | 30 conexiones activas tras reconexión, consulta/abandono |
| Tira30 conexiones/5 parejas | 205 | 337ms | 344ms | 150 latidos confirmados, parejas activas y abandono |

Las subrutas explican el resultado: imagen p95 1877ms e inicio de diagnóstico p95 2716ms, frente a perfil119ms y ranking246ms. No se cumple de forma general el umbral candidato1,5s; no declarar todo “rápido” por tener cero errores. RSS máximo muestreado290MiB, heap96MiB, CPU pico673% de un núcleo (trabajo nativo/múltiples hilos), hasta29 conexiones del rol de prueba, sin fallos del muestreador. No significa que un servidor0,5CPU/512MiB alcance este rendimiento.

### Límites y reenvíos

`.tmp/pilot-capacity-edges-final.log`: salida0.75 logins simultáneos, p95 3578ms/p99 3728ms. Después1125 consultas desde la misma IP:925 permitidas y200 rechazadas con429, además de los75 logins que agotaron el presupuesto total1000/15min. El escenario aprueba que la protección funciona; **reprueba la hipótesis de uso escolar continuo con ese presupuesto por IP**. No se cambió ni desactivó el límite global: revisar diseño por usuario autenticado más defensa por IP y pruebas de seguridad antes de producción. Escalar CPU no elimina este bloqueo.

La primera doble entrega produjo5 errores entre10 peticiones aunque persistió una sola copia. Se corrigió exclusivamente `DiagnosticoService`: recuperar la fila ganadora tras el conflicto único exacto al iniciar, y recuperar el resultado ya completado de la misma identidad tras el conflicto por diagnóstico/área al entregar. Fallos ajenos/no verificados se propagan; no se usa `skipDuplicates`, no se reescriben puntuaciones y se conserva la transacción original. Repetición final:5 estudiantes,10 inicios simultáneos por pares con mismo conjunto guardado,10 entregas por pares aprobadas y75 respuestas persistidas. Siete regresiones unitarias nuevas comprueban recuperación y rechazo de fallos no correspondientes.

### Incidencias y límites del ensayo

- Primer escenario de sockets devolvió400 al crear Trivia porque el banco sintético tenía dos opciones; Trivia exige cuatro. Se corrigió el fixture, no se relajó la validación productiva. La repetición con cuatro opciones pasó.
- Primer PDF de control solo contenía texto. Se asoció la imagen a la lección sintética para el ensayo final, además de preguntas, y se elevó el mínimo comprobado. No se atribuye la carga PDF de control a la imagen final.
- Una ejecución preliminar de sockets coincidió brevemente con el inicio del probe de bordes; las cifras autoritativas son de la repetición completa posterior, ejecutada sin otro benchmark paralelo.
- Recursos Storage y workers propios cerrados/retirados al finalizar; fixtures/filas I2 siguen bajo el ciclo de vida del runner temporal que los creó. No se borraron archivos ni datos reales. Logs/capturas temporales no se versionan ni son garantía de auditoría remota.
- No hay benchmark sostenido de horas,75 navegando continuamente, ráfaga de imágenes/PDF75, victoria Trivia/Tira completa, roles docentes concurrentes, navegadores/teléfonos, WAN, varias instancias ni hardware equivalente a planes cloud. Estos ensayos externos/de mayor alcance requieren preparación y autorización propias antes de prometer capacidad.

### Entrega y siguiente decisión

Verificación de código: `npx jest src/diagnostico --runInBand`,4 suites/38 pruebas aprobadas; incluye7 nuevas de recuperación concurrente y la regresión de evidencia diagnóstica. `node --test tool/pilot_capacity_local.test.mjs tool/pilot_capacity_controls.test.mjs`,8/8. ESLint dirigido al servicio y test nuevo, `npx nest build`, sintaxis de scripts y `git diff --check`: aprobados. No se ejecutó la suite global ni lint global de cambios ajenos; no hay cambios Dart/Android. Validación final de limpieza: cero workers `pilot_capacity_worker.cjs` vivos y ningún container Storage de estos ensayos; los containers I2 existentes permanecen bajo su runner.

La prueba local termina con hallazgos, no con una capacidad comercial certificada. No elegir todavía el servidor mínimo ni dar por rentable el contrato candidato solo con este PC. Primero revisar límite por IP y validar en staging con recursos/red comparables dentro de un presupuesto autorizado; todavía no se contrata ni se despliega. La corrección del diagnóstico está en código local y workers de ensayo, no acredita actualización del backend de una instalación remota ni reinicio de todas las sesiones dev antiguas.
