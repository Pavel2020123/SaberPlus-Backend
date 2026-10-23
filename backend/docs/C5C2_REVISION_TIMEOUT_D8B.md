# C5-C2 — Preparación para nueva revisión de Pavel

23 de octubre de2026. **ENTREGA PARCIAL: falta regresión humana del timeout
de Tira local (D8a). C2 no se declara terminada.** Este documento complementa,
sin sustituir sus evidencias históricas, `C5C2_ENTREGA_PARCIAL.md` y el acta
`C5C2D_VALIDACION_LOCAL.md`. No autoriza otra etapa ni publicación.

## Ramas y commits

Ambos repositorios trabajan en `fix/c5-c2-timeout-d8b`, desde main actualizado
Flutterb8253e2/backend3eb3f59. PR Flutter#9/backend#11 ya integrados y auditados;
no reabrir los antiguos Flutter#4/backend#7. No se trabajó sobre main ni OV-1.

| Repositorio | Commit | Comentario |
| --- | --- | --- |
| Flutter | 853a8af | Normalizar Socket.IO con offset de recuperación sin aceptar otro formato. |
| Flutter | 9234a57 | Contener opciones ilustradas de Tira online dentro del borde. |
| Flutter | bf5d363 | Recuperar estado por GET al volver del fondo y mostrar terminal sin animaciones atrasadas. |
| Flutter | 8fe1756 | Conciliar aprobación humana D8b y límites. |
| Flutter | 9b115c7 | Continuar Tira local tras timeout con confirmación idempotente, pausa y regresiones. |
| Backend | adca6d6 | Contrato exclusivo TUG_LOCAL y validador de snapshot online con imágenes. |
| Backend | 601ab95 | Conciliar D8b aprobado con evidencia humana y SQL. |
| Backend | 3fe82d9 | Conservar pausa segura del contrato local, caducidad y regresiones HTTP/SQL. |

La lista destaca cambios funcionales y checkpoints; los commits documentales
intermedios se conservan en `git log --oneline main..HEAD`. Los commits de
observación Android posterior se añadirán al acta cuando exista confirmación.

## Qué cambia y dónde revisar

Flutter mantiene la arquitectura/proveedores existentes. `tug_local_providers.dart`
selecciona demo anterior o `RemoteTugLocalRepository`; solo Tira local usa
`/tira-local/intentos`. `tug_of_war_page.dart` espera confirmación de inicio y
timeout, mantiene el feedback frente a CPU y bloquea avances/selecciones durante
reintentos. Una respuesta con acuse desconocido conserva su selección y UUID.
`tug_local_repository.dart` contiene el contrato temporal. Pruebas en
`test/tug_of_war_test.dart` y `test/remote_tug_local_repository_test.dart`.

Online: revisar `tug_realtime_client.dart`, `tug_of_war_providers.dart`,
`tug_online_page.dart` y `test/tug_online_test.dart`. La recuperación usa lectura
autenticada del mismo partido; no reenvía respuestas, busca otro rival ni inventa
resultados. Rechaza versiones atrasadas y admite el offset Socket.IO real.

Backend: `src/trivia-rush/tug-local.controller.ts` y `trivia-rush.service.ts`.
JWT, correo verificado, estudiante y propietario; bloqueo transaccional de
intento/clave, diez segundos validados por servidor y operación sin respuesta
idempotente. Pausa con versión y tiempo propio del servidor, sin duración
aportada por cliente. Trivia/Fantasma no admiten operaciones locales y sus
récords/activo excluyen TUG_LOCAL. CPU conserva su resolución; el timeout no
crea selección, historial de respuesta, potenciador, anuncio, recompensa ni XP.

Migraciones necesarias, aplicadas **solo a PostgreSQL desechables propios**:

- `20261022203000_tug_local_timeout_scope`: modalidad local aislada, vigencia
  global600s y sin competición/evidencia/asistencias.
- `20261022213000_tug_option_image_snapshot`: imagen opcional coherente con
  Respuesta original; mantiene snapshots antiguos y rechaza alteraciones.
- `20261023150000_tug_local_pause`: dos campos con CHECK exclusivo de TUG_LOCAL;
  pausa/reanudación idempotentes y versiones atrasadas sin efecto repetido.

No se cambiaron dependencias, reglas de XP/rankings/certificados ni OV-1.
El panel no necesitó código nuevo en esta continuación. README/relevos/actas y
`C5C2_TIMEOUT_LOCAL.md` conservan el estado y los límites en ambos repositorios.

## Validación y evidencia

| Comprobación | Resultado / límite |
| --- | --- |
| `flutter test --no-pub --concurrency=2 --reporter expanded` | 1.016 aprobadas,16 opt-in omitidas,0 fallidas. No sumar las omitidas como aprobación. |
| Análisis dirigido de módulo Tira y sus dos tests locales | Sin incidencias. |
| Tira local Flutter + cliente HTTP | 25/25, incluidos timeout, reintento, última pregunta, respuesta en vuelo/ACK perdido y pausa. Widgets/transporte simulado; no pérdida de ACK física observada. |
| Tira online Flutter | 19/19; incluye WebSocket local con librería Socket.IO real, contorno y lifecycle/estado terminal. |
| Jest backend completo | 128 suites/1.675 aprobadas. Proceso confirmado exit0/success:true mediante JSON; primera captura PowerShell de stderr devolvió1 sin pruebas fallidas. |
| `node tool/test_editorial_files_postgres.mjs` | 50/50,73 migraciones, PostgreSQL16 tmpfs propio y Chromium del panel. Tiempo real10.1s para timeout/pausa; última pregunta usa ventana movida solo en fixture propio. |
| `npm run build` | Prisma generate + Nest build aprobados, exit0. |
| APK ARM64/4005 | Build aprobado243.3s, solo APP_ENV/dev, DEMO_MODE/false y URLs loopback públicas. Instalación/observación se registran en acta. |
| D8b humano | Aprobado dentro del alcance del acta; figuras/selección previas y retorno tras final confirmado el23. |
| D8a humano | Reabierto solo por timeout; pendiente prueba con APK4005 y API nueva. |
| D1–D7 y D8c/d/e | Aprobaciones históricas conservadas, sin repetición humana por este cambio. |

D8b final:23f89c68-12c5-4a69-b533-9e586489daa3, FINALIZADA/JUGADOR_A,
zero=A/emulador y student=B/teléfono, cuerda4/ronda4/versión10. Dos respuestas
únicas de zero, ninguna de student y cero XP de partida. Humano observa victoria
en emulador y mismo ganador al volver al teléfono desde Recientes tras el final.
Este último duelo no registra selecciones ilustradas; las imágenes/selección
se sustentan en la evidencia anterior documentada, sin atribuirlas al Pixel_7
del último ensayo. No acredita cierre forzado, ACK perdido real ni competición.

Se conservan fallos previos y correcciones en el acta: snapshot rechazado,
formato Socket.IO, contorno, resultado atrasado, restricción inicial de modalidad,
pausa aún ausente, errores de compilación del fake y rechazo síncrono del booster.
No se repitió ESLint global: deuda previa27 incidencias, sin afirmar que esté limpio.
No se operó producción, Render/Supabase ni se publicó ninguna clave o token.

## Siguiente paso y publicación

Con APK4005 instalada y nueva sesión propia, iniciar Tira local/Matemáticas en el
teléfono. Dejar vencer la primera ronda sin tocar opciones; observar «Sin
respuesta», continuar y comprobar segunda pregunta sin selección accidental.
Comprobar pausa/reanudación en la ronda siguiente y respuesta. Cotejar SQL:
una fila nula para timeout, ninguna repetida, respuestas reales separadas,
sin potenciadores/XP de intento. Actualizar ambas actas después de cada observación.

Después preparar la nueva revisión de Pavel, manteniendo C2 abierta hasta su
auditoría. No iniciar el resto de C5. No se ha hecho push, merge o despliegue.
Solo **cuando Pavel autorice** publicar, ejecutar desde las carpetas indicadas:

```powershell
git -C C:\Users\modaf\saber_plus push -u origin fix/c5-c2-timeout-d8b
git -C C:\Users\modaf\SaberPlus-Backend push -u origin fix/c5-c2-timeout-d8b
```

Crear PR nuevo hacia main en cada repositorio afectado; no usar PR antiguos.
Los APK, recibos de diagnóstico y archivos de sesión permanecen fuera de Git.
El cambio ajeno pendiente de `analysis_options.yaml` se conserva sin incluirlo
en estos commits.
