# PR-I5-C4 — Código institucional privado para estudiantes

## Checkpoint — 17 de octubre de 2026

**C4-C:10/10 guiones locales cubiertos, Android más HTTP/SQL; no10 exclusivamente manuales.**
Guiones2/6/9 cerrados con19 controles complementarios. Regresión Flutter global final
893 aprobadas/13 opt-in omitidas; [cierre local consolidado](CIERRE_INSTITUCIONES_LOCAL.md),
sigue revisión/commits pendientes, no despliegue.
C3C ya cerró10/10 humanos locales, con límites en [acta C3](PR_I5_C3_SOLICITUDES.md).
C4 ya tiene pantallas locales; C4-C humano está en curso y no está desplegado.
OV-1 sigue a cargo del compañero, sin cambios en este bloque. Commits locales
autorizados por el propietario el17; publicación/revisión pendientes, sin push,
merge o despliegue automático. Notas intermedias conservan decisiones anteriores.

## Decisiones y límites

- Código **nuevo y separado** para ingreso de estudiantes. `Institucion.codigoUnico`
  conserva su uso docente/administrativo; códigos de grupo siguen independientes.
- Solo PROPIETARIO vigente, cuenta PROFESOR vinculada coherentemente a una institución
  APROBADA puede consultar o renovar. Ni ADMINISTRADOR institucional ni ADMIN global
  obtienen acceso mediante estas rutas. Consultar no genera un código automáticamente.
- Código `SPI-` seguido de32 caracteres hexadecimales,128 bits de aleatoriedad criptográfica.
  Sin caducidad automática en esta versión; renovación invalida inmediatamente el anterior.
- Al compartir el código se concede ingreso directo a estudiantes que cumplan las reglas.
  Quien lo posea puede reenviarlo; el propietario debe renovarlo si se difunde.
- Consultar como alumno es una vista previa mínima, no ingreso. Confirmar ingreso
  solo modifica `Usuario.institucionId`: conserva ESTUDIANTE, sin grupo ni membresía docente.
- No hay traslado automático entre instituciones. Estar ya en la misma institución
  no vuelve a consumir cupo. Cupo y estado se comprueban en servidor al confirmar.
- Si hay solicitud estudiantil PENDIENTE, se exige cancelación explícita antes de
  entrar por código. No se aprueba/cancela silenciosamente el historial de C3.
- GET propio no tiene efectos secundarios; todas las respuestas privadas usan no-store.
  Código en body POST, nunca en query/URL, directorio, perfil público o auditoría.

## Contrato HTTP

Base `/instituciones/codigo-estudiantes`. JWT y correo verificado en las cuatro rutas.
Rol/membresía/vínculo/estado se releen de PostgreSQL, no se confía en el rol del JWT.

| Método/ruta | Entrada | Respuesta de éxito |
|---|---|---|
| GET `/propio` | Sin body, solo propietario | `{institucion:{id,nombre}, codigo:null|string, revision, operacionId:null|UUID}`; sin código, revisión0. |
| POST `/renovar` | `{id:UUIDv4, revision:enteroJSON0..2147483646}` | `{codigo,revision,operacionId}`; primera emisión o renovación confirmada. |
| POST `/consultar` | `{codigo}` | `{institucion:{id,nombre},revision,yaVinculado}`. |
| POST `/ingresar` | `{id:UUIDv4,codigo,institucionId:UUIDv4,revision:enteroJSON1..2147483647}` | `{institucion:{id,nombre},estado:'VINCULADO',yaVinculado}`. |

Código se normaliza con trim/mayúsculas, solo si era string JSON. Booleanos/números
no se convierten en código. Revisiones no admiten strings, null, booleanos o fracciones.
Campos ajenos se rechazan con la ValidationPipe existente. Errores401/403 de acceso;
404 para código inexistente, renovado o institución no aprobada sin revelar cuál;
409 de revisión/cuerpo/solicitud pendiente/vínculo;400 de formato o cupo agotado.

## Versiones, reintentos y transacciones

- Renovar genera UUID de operación una sola vez en el cliente y conserva la revisión
  consultada. Reintento inmediato devuelve el mismo código sin nueva escritura/auditoría.
- UUID de una renovación antigua detectado por auditoría no vuelve a renovar después
  de otra operación:409 y consultar el vigente. Una revisión obsoleta tampoco sobrescribe.
- Ingreso conserva UUID, código y snapshot de institución/revisión del momento de
  confirmar. Recibo idempotente asocia actor, institución, revisión y SHA-256 del código.
  No guarda el código en claro en el recibo. UUID ajeno o body cambiado devuelve409.
- Reintento del mismo ingreso ya confirmado puede reconciliarse aunque el propietario
  haya renovado después; no es un ingreso nuevo. Requiere seguir vinculado a esa
  institución: un recibo antiguo no repone un vínculo retirado ni traslada a nadie.
- SERIALIZABLE con reintento acotado para P2034/P2002. Cambios condicionales y auditoría
  en la misma transacción; si auditoría falla no persisten vínculo ni recibo.
  Ingresos simultáneos no pueden ocupar el mismo último cupo.

## Persistencia y seguridad

Migración `20261016180000_student_institution_codes`: tablas
`CodigoIngresoEstudiantil` (secreto consultable solo por propietario autorizado) e
`IngresoInstitucionCodigo` (recibos privados). FK/cascade, formatos y revisiones
con CHECK, unicidad de código y UUID de operación; índice de recibos por cuenta/fecha.
RLS habilitada y permisos revocados a PUBLIC/anon/authenticated; API accede con su
conexión privilegiada y autorización explícita. No exponer por Supabase REST.

En bootstrap productivo `main.ts`, límite por IP de60 solicitudes/minuto al prefijo
de C4 (200 en desarrollo), además del global. Es límite en memoria por instancia,
no distribuido; no sustituye controles perimetrales si se escala. El harness local
usa otro entrypoint: **no se acreditó el429 del bootstrap real** con estas pruebas.
No hay servicio externo ni dependencia nueva.

## Evidencia ejecutada

- Prisma validate con URLs ficticias loopback: válido, sin conectar a bases externas.
- Prisma generate y Nest build: correctos. Se detuvo la API previa para liberar la DLL
  Windows tras EPERM; no se cambió SDK ni se descartó trabajo del usuario.
- Jest dirigido C4+C3:96/96 (59 nuevas C4 y37 C3).
- Regresión Jest completa:119 suites/1.470 pruebas aprobadas.
- Sesión propia `saberplus-i2-local-aWVg0Z`:66 migraciones. Allowlist del harness
  amplía solo la nueva ruta SQL explícita, sin enumerar migraciones locales arbitrarias.
- `node --test tool/test_student_institution_codes_local.cjs`:16/16 reales HTTP/SQL.
  Incluyen aislamiento, validación, renovación/replay, secreto fuera de auditoría,
  consulta sin vínculo, ingreso/reconciliación tras rotación, cupo/concurrencia,
  suspensión, solicitud pendiente, traslado bloqueado, rollback y roles anon/authenticated.
- Regresión HTTP/SQL de C3 tras C4:14/14 aprobadas.
- Guiones sintácticamente válidos y `git diff --check` sin errores de espacios
  en archivos seguidos; avisos LF/CRLF no son fallos funcionales.

Nada de esto acredita pruebas humanas C4, iOS, carga, despliegue o configuración de
Render/Supabase. Fixtures nuevos sintéticos, no evidencia de una acción humana.

## Integración Flutter C4-B — implementación local

Frontend incorpora modelos estrictos, repositorio Dio y pantallas privadas de
propietario/alumno. Accesos desde panel propietario y Mi institución y grupos,
respectivamente. Copiar para compartir usa portapapeles solo por gesto; envío manual,
sin hoja nativa/dependencia nueva. UUID/snapshot conservados ante red incierta,
consulta antes de reintentar, refresco de perfil/atajos tras confirmar ingreso.
Sesión/cuenta/rol invalidan secretos, borradores, respuestas tardías y confirmaciones.
No cambia códigos de grupo ni solicitudes docentes ni decide C3 automáticamente.
C4 aporta42 pruebas Flutter;88 dirigidas del grupo C4/C3/atajos/grupos y regresión
final888 aprobadas/13 opt-in omitidas. Análisis limpio. Incluye pantalla320×640/
texto200%, desplazamiento y confirmaciones ligadas a cuenta. No es HTTP Flutter
real ni Android humano C4. El bloque C4-B terminó sin instalar APK ni desplegar.
Backend no cambió durante C4-B. La preparación posterior se registra debajo.

### Preparación C4-C — 16 de octubre de 2026

Sesión propia `saberplus-i2-local-gJ5KOg`,66 migraciones; API43187 y panel4173
responden200. Credenciales solo en el archivo privado temporal, nunca en Git.
Se reutilizó `prepare_student_requests_resume.cjs`: dos instituciones con nombres C3,
propietario, lector y alumno sin vínculo, con una solicitud cancelada sintética.
No acredita nuevas pruebas humanas C3 y no genera el código estudiantil C4.
APK C4-B compilada e instalada por USB (`Success`) en el paquete aislado
`com.example.saber_plus.i2validation`, sin sustituir la app normal ni borrar datos.
Primer envío cortado por USB; segundo correcto. Al acabar la preparación **C4-C estaba0/10**; apertura
manual de app y primera consulta/emisión pendientes. Apertura automática bloqueada
por el entorno. Sin despliegue/commit.

### Confirmaciones humanas C4-C — 16 de octubre de 2026

En sesión `saberplus-i2-local-gJ5KOg`, usuario confirmó guion1 completo: consulta
sin código inicial y generación explícita posterior. Guion2 parcial: docente lector
no ve la opción privada; no implica por sí solo verificación de autorización HTTP.
Guion3 parcial: aviso de copia y pegado funcional mediante consulta posterior;
falta directorio público. Guion4 completo: estudiante ve Institucion de ensayo C3
antes de confirmar. Se aclaró confusión inicial con campo de grupo de12 caracteres;
sin cambio de formato del código institucional. Guion5 parcial: ingreso confirmado,
aviso sin grupo automático y vínculo conservado al actualizar, ocultando entrada
institucional y conservando entrada a grupo. Falta cotejar rol/SQL.
Guion6 parcial: alumno `zero@example.invalid` confirmó rechazo de código con un
carácter modificado y consulta válida del original. Guion7 parcial: propietario
renovó explícitamente; alumno confirmó rechazo del anterior y consulta válida del
nuevo, sin ingresar. Faltan códigos grupo/docente, renovación incierta y cotejo SQL.
Guion8 parcial: zero confirmó solicitud pendiente y su cancelación con estado
CANCELADA; al volver al código reportó ayuda de pendiente persistente y falta de
actualización. No se comprobó inconsistencia del estado almacenado en backend.
Balance:2/10 completos (1 y4),2,3,5,6,7 y8 parciales. Sigue repetir el regreso desde
solicitudes con APK corregida, sin nuevo ingreso automático. Cupo/suspensión pendientes.

### Corrección Flutter al regresar de solicitudes

Se sustituyó ayuda incondicional de pendiente por texto neutral. Al retornar se
consulta el vínculo real y, si no hay vínculo ni intento incierto, se refresca la
institución del código válido. Intentos inciertos conservan UUID/código/snapshot;
fallo de consulta mantiene bloqueo y aprobación ya guardada se reconcilia sin POST.
Cuatro pruebas nuevas:46/46 C4,46/46 solicitudes/atajos/grupos y analyze limpio.
Regresión global888/13 corresponde al bloque anterior, no repetida tras este fix.
APK corregida y confirmación humana estaban pendientes al registrar. Sin cambios de lógica
backend, migraciones, SQL adicional, commit o despliegue.

### Reanudación acotada — 17 de octubre

Sesión propia nueva `saberplus-i2-local-mR98b6`,66 migraciones; sesión anterior
no reutilizable. Paquete Android confirma instalación del fix el16 de octubre17:36:22.
Preparación mediante helpers `prepare_student_requests_resume.cjs` y nuevo
`prepare_student_codes_return.cjs`: solo base temporal con marcador validado,
zero sin vínculo y solicitud PENDIENTE, código creado por API con propietario.
Archivo privado `c4-return-private.json` exclusivamente en sesión temporal;
sin secretos en actas. Guion sintácticamente válido y preparación ejecutada, no
prueba humana. No reejecutar sobre fixtures ya existentes ni rotar sus códigos.
Solo resta hoy comprobar cancelar solicitud y volver a pantalla de código con
institución visible, sin aviso obsoleto ni ingreso automático. Resultado pendiente.
Sin modificación funcional backend, commit, push ni despliegue.

Segundo hallazgo humano del17: la captura mostró que tras rechazo por pendiente
el cliente deshabilitaba también Consultar mis solicitudes de ingreso. Reproducido
con regresión fallida antes del arreglo. Fix solo Flutter: solicitudes accesibles
con `_mustConsult`, excepto mientras `_busy`; regreso sigue consultando vínculo
estrictamente y conserva UUID/snapshot incierto sin reenvío automático.93/93 pruebas
dirigidas (47 C4) y analyze limpio. APK nueva instalada por USB (`Success`). Usuario
confirmó después que al volver se actualiza y muestra Reintentar mismo ingreso.
Comprobación puntual de recuperación de acciones aprobada; no se pulsó el reintento
ni se verificó SQL adicional. Guion8 sigue parcial (cupo/suspensión/cotejos pendientes).
Se cierra trabajo por hoy. Próxima sesión: validar servicios y retomar ingreso tras
cancelación con vínculo único/sin grupo automático. Si caducó la base, reconstruir
fixtures sintéticos sin contarlos como evidencia humana ni esperar secreto persistido
en la app. Sin commit/push/despliegue ni cambios de lógica backend.

### Criterios originales C4-B

**Confirmación posterior del17, sesión6fFUQb:** usuario completó rechazo por pendiente,
acceso a solicitudes, cancelación/regreso y Reintentar mismo ingreso; mostró vínculo
y aviso sin grupo automático. Verificación posterior `verify_student_codes_return.cjs`
solo lectura aprobada: zero ESTUDIANTE, institución esperada, una solicitud CANCELADA
revisión1, un recibo y auditoría coincidente, cero grupos y cero membresías docentes.
Guion5 completo; balance3/10 (1,4,5), guion8 parcial por cupo/suspensión pendientes.
SQL prueba unicidad del recibo, no identidad del UUID con rechazo sin recibo previo;
esa identidad tiene evidencia de widgets. Usuario confirmó posteriormente reapertura
completa: vínculo conservado y entrada a institución con código oculta. Parte de
persistencia del guion10 aprobada; no cierra red/cuentas/texto. Sigue comprobar
ausencia de código/acciones privadas en perfil público institucional (guion3).
El usuario confirmó después esa ausencia: guion3 completo, balance4/10 (1,3,4,5).
Sigue cuenta absent sin vínculo: formato de grupo/docente rechazado en entrada
institucional. Persistencia de guion10 parcial; sin nueva prueba HTTP/SQL en este paso.

Después usuario confirmó rechazo de formato `GRP-12345678` y UUID de ejemplo en
cuenta absent; no son códigos emitidos reales ni HTTP adicional. Preparación de
cupo con `control_student_code_limits.cjs full`, sesión6fFUQb: institución APROBADA,
límite1 ocupado por zero. Absent sin vínculo/pendientes/recibos/auditoría de ingreso.
Backup en `c4-limits-backup.json` temporal. Usuario confirmó rechazo por cupo y
`verify-denied` aprobó: absent sin vínculo/recibos/auditoría de ingreso, ocupado1,
límite1, APROBADA. Luego `suspend` recuperó límite original null y suspendió
solo institución de ensayo. Usuario confirmó rechazo de consulta limpia del código.
`verify-denied` posterior aprobó cero vínculo/recibos/auditoría para absent. Ejecutado
`restore` y cotejo final: **APROBADA/límite original null**, ocupado1 y absent sin
ingreso. Sin condiciones temporales activas. Guion8 completo; balance5/10 (1,3,4,5,8).
Suspensión humana cubrió consulta, no POST porque UI no daba vista previa; rechazo
POST suspendido corresponde a evidencia automática C4-A, no nueva acción humana.
Sigue consulta tras restauración, sin ingreso, para verificar recuperación visible.

Usuario confirmó vista previa recuperada. Para guion10 se retiró solo reverseUSB
tcp43187 con absent en vista previa; API local sigue200 y la institución APROBADA,
límite null. **Restaurar enlace antes de recuperación**. Sigue ingreso humano con
fallo de red y consulta previa a reintento. Corte antes de POST, no después de commit;
no atribuir este escenario a respuesta perdida tras guardado. Sin confirmación aún.

Confirmación posterior: usuario observó reenvío bloqueado y ambos accesos de consulta
habilitados. ReverseUSB43187 restaurado/API200; `verify-denied` aprobó absent sin
vínculo/recibos/auditoría, institución APROBADA/límite null/ocupado1. Sigue consultar
vínculo y reintentar desde celular. Guion10 parcial; no hay nuevo ingreso confirmado.

Luego usuario confirmó consulta→reintento→vínculo/sin grupo. Verificador solo lectura
ampliado a allowlist zero/absent; ejecución para absent aprobada: ESTUDIANTE,
institución esperada, cero solicitudes, un recibo y un único evento de ingreso
coincidente, cero grupos/membresías docentes. Guion10 red aprobado parcialmente
(corte previo a POST, no ack perdido). Guion9 parcial por unicidad, sin replay/traslado.
Sigue cambiar de absent a student sin vínculo para comprobar aislamiento; texto grande
pendiente. No usar controles de cupo que exigen absent sin vínculo después de este paso.

Usuario confirmó después cambio absent→student: sin institución vinculada y campo
de código vacío. Aislamiento visible aprobado, sin probar manualmente respuesta
tardía entre cuentas. Guion10 sigue parcial solo por comprobación de texto grande;
consulta/confirmación/cancelación sin vincular student como siguiente paso humano.

Usuario confirmó consulta/diálogo/botones y cancelación con texto Android ampliado,
sin factor exacto medido. Guion10 completo con límites de red/aislamiento indicados;
balance6/10 (1,3,4,5,8,10). Sigue propietario consulta vigente y renovación con fallo
de red preparada después de confirmar pantalla; no renovar código automáticamente.

Preparación guion7 actual: propietario confirmó vista vigente. Verificador SQL solo
lectura `verify_student_code_rotation.cjs baseline` guardó metadatos temporales,
revisión1/auditoría1. ReverseUSB43187 retirado; **restaurar tras fallo observado**.
Sigue confirmación humana de renovación sin red y consulta previa al reintento.
Sin lectura/impresión del secreto ni renovación automatizada; corte previo al POST.

Usuario confirmó error de renovación y bloqueo. ReverseUSB restaurado/API200;
verificador `unchanged` aprobó revisión1/misma operación/auditoría1. No hubo cambio
por intento offline. Sigue consulta humana del vigente y reintento conservado;
guion7 parcial, sin nuevo POST automático ni código/UUID nuevo generado por herramientas.

Posteriormente usuario confirmó consulta→Reintentar misma renovación→éxito.
Verificador `renewed` aprobó revisión2/auditoría2 contra baseline1/1; incremento
único, sin duplicación. Guion7 completo con límite de corte antes de POST, no ack
perdido tras guardado. Balance7/10 (1,3,4,5,7,8,10), restan2/6/9. El código del
archivo privado inicial ahora es antiguo; contraseña continúa válida. Sigue GET
humano de vigente sin renovar para confirmar estabilidad. Sin secretos en actas.

### Cierre de cobertura del17 — evidencia mixta, sesión6fFUQb

Usuario confirmó estabilidad del código tras GET. `verify_student_code_guards.cjs`
aprobó19/19 HTTP/SQL complementarias, sin nuevos gestos humanos:

- Guion2: anónimo401; lector/ADMIN/alumno403 para GET privado y renovar, sin código
  en respuesta. Complementa opción oculta al lector confirmada en Android.
- Guion6:400 formato GRP válido y código docente real del fixture;404 estudiantil
  anterior,201 vigente. GRP no fue un código emitido por grupo real; validación de formato.
- Guion9: replay guardado tras rotación y nueva operación ya vinculada201 sin
  duplicados; UUID ajeno/código cambiado/snapshot alterado409; consulta e ingreso
  con código válido de institución alternativa409, sin traslado.

Solo código sintético alternativo creado para probar traslado, eliminado por
institucionId/operacionId exactos propios en finally. Sin ingreso ni código adicional
al terminar. Snapshot de perfiles/recibos/auditoría/grupos/membresías/revisión del
código idéntico antes/después. Zero y absent conservan dos recibos en total;
student sigue sin vínculo. No se imprimieron secretos.

Balance10/10 integrados, no10 pruebas manuales independientes. Límites: base
temporal66 migraciones/Android debug, no iOS/carga/producción; cortes humanos antes
de POST, no ack perdido; respuestas tardías y200% exacto solo widgets. No429 probado
del entrypoint principal. Institución APROBADA/límite null, USB restaurado, revisión2.
Regresión Flutter global final893 aprobadas/13 opt-in omitidas y análisis limpio.
Las93 dirigidas se incluyen en893, no se suman; omitidas no son ensayos aprobados.
Jest1470/119 y16 C4+14 C3 son antecedentes no repetidos hoy;19 controles finales nuevos.
Sigue consolidación y decisión de
commits; no push/merge/despliegue ni cambios en OV-1.

Comprobación documental:16 documentos de entrada/actas/relevos de ambos repos,
499 enlaces locales sin destinos ausentes. Cinco helpers C4 sintácticamente válidos,
diff sin errores de espacios. Sin commit/push/merge/despliegue. Cierre institucional
general y selección de commits siguen separados de esta cobertura C4.

Consolidación posterior: Jest119 suites/1.470 aprobadas repetidas, panel95/95 y23
módulos correctos, TypeScript sin emisión aprobado. [Cierre local/propuesta Git](CIERRE_INSTITUCIONES_LOCAL.md).
Dry-run npm ci en Windows Node24.11.1/npm11.6.2 terminó0 con EBADENGINE, no instalación
real ni CI Linux/Node24.14.1/npm11.11.0 aprobado. JPEG original pequeño sigue sin
reproducir. No hubo commit/push/merge/despliegue; sigue revisión/autorización de entrega.
Sin mutaciones del verificador, regresión global nueva, commit/push ni despliegue.

Reanudación posterior del17: nueva sesión propia `saberplus-i2-local-6fFUQb`,66
migraciones; API/panel200, USB activo y segundo fix Android ya instalado.
Helpers reconstruyen zero sin vínculo y solicitud PENDIENTE con código nuevo;
solo preparación sintética. Credenciales en archivo privado de sesión actual,
no usar mR98b6 retirada. Falta ingreso tras cancelar, no repetir evidencia como nueva
ni afirmar continuidad del intento en memoria anterior. Guion8 sigue parcial.

1. Reutilizar cliente Dio/sesión y patrones de C3, modelos estrictos sin fallback demo.
2. Propietario: pantalla de código privado, generar/renovar con confirmación explícita,
   copiar/compartir solo por gesto; aviso de que renovar invalida el anterior.
3. Alumno: entrada por código separada de grupos; consultar, identificar institución
   y confirmar antes de vincular. No enviar mientras cambie código/snapshot ni permitir
   que un teclado grande tape los botones. Solicitud pendiente deriva a su gestión.
4. Red incierta: conservar UUID/body de ingreso o renovación, consultar estado antes
   de nuevas operaciones; reintento mismo payload, no generar UUID por cada tap.
5. Refrescar perfil/grupos/atajos tras ingreso confirmado; sin grupo automático.
6. Cambio de cuenta descarta secreto/snapshot/borrador y resultados tardíos. No guardar
   código compartido en preferencias, logs o analítica. Demo explicita indisponibilidad.
7. Pruebas dirigidas y analyze; después C4-C integrado,10 guiones humanos propuestos
   en acta Flutter. Cierre integrado de instituciones posterior, no desplegar por defecto.
