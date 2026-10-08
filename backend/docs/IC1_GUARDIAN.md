# IC-1B — integración Flutter del Guardián

## Estado — 8 de octubre de 2026

IC-1B1 implementada. IC-1B2 Android/API/ledger acredita localmente victoria,
recuperación/reintento/ranking, 100 XP únicos, normal sin XP, derrota +30 por 3
aciertos y abandono −10, saldo final120. IC-1B local validada; sigue IC-1C Rescate.
No cerrar toda IC-1 ni producción ni repetir checkpoints acreditados.
Fuente de verdad y guion: `docs/IC1_GUARDIAN.md` del repositorio Flutter.
34 pruebas Flutter dirigidas aprobadas; simulación de acuse perdido no acredita
un fallo de transporte real. Cima mantiene su ensayo local previo, no productivo.
Flutter global: 732 aprobadas/9 opt-in omitidas; analyze sin incidencias.
Backend dirigido: 23/23 pruebas existentes del Guardián en tres suites;
control IPC local 8/8. No se repitió regresión PostgreSQL global ni prueba remota.
Decisión vigente: un commit por juego después de pruebas y documentación,
revisando cambios acumulados de Cima/Guardián. Sin push automático.

## Contrato conservado

- POST `/guardian/intentos`: área, dificultad, subtema opcional y `competitive`
  booleano explícito solamente al competir. Flag OFF rechaza nuevas admisiones.
- GET `/guardian/intentos/activo` y `/guardian/intentos/:id`: recuperación del
  estado autoritativo y modalidad. Un intento admitido puede terminar con flag OFF.
- POST `/:id/respuestas`: pregunta, opción y UUID idempotente, nunca XP del cliente.
  Flutter persiste el pendiente cifrado antes del envío, con separación API/cuenta.
- POST `/:id/abandonar`: confirmación visual; no se envía al salir de la pantalla.
- Reglas existentes: 6 aciertos, 3 errores, hasta 8 preguntas, vencimiento 24 horas.
  Sin presencia de Trivia, cronómetro nuevo, fórmulas nuevas ni migraciones.
- Liquidación por reconciliador/ledger vigente GUARDIAN; abrir o actualizar el
  ranking no concede XP. Profesor no jugador y ownership se conservan en servicio.

En esta entrega no se modifica código productivo backend. El harness temporal
existente permite ensayar admisión mediante IPC, solo en su API/base identificada.
No usar Supabase, Render, credenciales reales ni el fixture de Trivia para acreditar
una partida del Guardián. Confirmar un único evento/balance con SQL de solo lectura
después de una victoria física; derrota/abandono y práctica normal deben respetar
las reglas vigentes. La evidencia se agregará cuando se ejecute, no por anticipado.

Preparación local: APK móvil separada `.i2validation` compilada e instalada por
USB con Success; API/panel HTTP 200. Consulta inicial de solo lectura en el
contenedor temporal propio: 0 IntentoGuardian y 0 EventoXpCompetitivo GUARDIAN.
Propietario confirmó rechazo de admisión OFF en Android; consulta posterior
acreditó 0 intentos GUARDIAN. Control IPC local confirmó admisión ON para continuar
el ensayo. Todavía no acredita partida, recuperación, victoria ni liquidación.
Después de corregir Media a Básica, el propietario vio las preguntas sintéticas;
SQL confirmó un único intento ACTIVO MATEMATICAS/BASICO, versión competitiva 1,
0 respuestas y 0 eventos GUARDIAN. Recuperación/victoria/liquidación pendientes.
Recuperación física confirmada por el propietario: tras cerrar/reabrir vuelve a
la partida; SQL mantiene el mismo ID, versión 1 y un único intento, sin respuestas.
Se desconectó solo el reverse USB `43187` para probar el envío pendiente; victoria
y liquidación continúan pendientes.
Envío sin reverse: propietario confirmó error y SQL conservó 0 respuestas en el
mismo intento ACTIVO. Reverse restablecido; reintento pendiente. No acredita
pérdida de acuse después del guardado, sino fallo antes de persistir.
Reintento físico confirmado: SQL acredita una sola respuesta correcta en el mismo
intento ACTIVO, 0 eventos GUARDIAN. Admisión volvió a OFF por IPC local; pendiente
terminar el intento ya admitido y verificar su liquidación real única.
Victoria física confirmada con admisión OFF. SQL: VICTORIA, 6/6 respuestas
correctas, settledAt presente; evento único GUARDIAN_ATTEMPT/RESULTADO/APLICADO,
reglas 1, delta 100, saldo 0 → 100. Balance GUARDIAN/2026=100 y un participante
positivo. No fixture de Trivia. Ranking visual, no duplicación al reabrir y normal
sin XP siguen pendientes; todavía no cerrar toda IC-1B.
Propietario confirmó que el ranking visual muestra únicamente su participante,
coherente con el balance local. Valores visuales 100 XP/puesto 1 y consultas
posteriores sin duplicación pendientes de confirmación.
Propietario confirmó ranking conservado tras reapertura y dos actualizaciones.
SQL acredita un intento, un evento GUARDIAN, delta total 100 y balance 2026=100,
sin duplicación. Práctica normal sin XP pendiente.
Victoria normal 6/6 confirmada y SQL acredita versión competitiva NULL, sin
settledAt ni evento en el segundo intento. Se mantiene un evento GUARDIAN y
balance 2026=100: modo normal sin XP confirmado. Siguiente derrota/abandono físicos.
Admisión ON confirmada por IPC local para ensayar derrota; API HTTP 200 y
reverse USB verificados. Interacción física de derrota todavía pendiente.
Derrota física confirmada; SQL: 6 respuestas, 3 aciertos/3 errores, versión 1,
settledAt presente, evento único +30, saldo 100 → 130. Regla vigente 10 XP/acierto,
sin bonus de victoria. No fue una partida con cero aciertos ni un premio indebido.
Pendiente abandono competitivo; no modificar fórmulas para ajustar una predicción.
Abandono sin responder confirmado por el propietario y SQL: intento
18833652-bed2-4a7e-980b-733b6dd49e83 ABANDONADO, versión1, 0 respuestas,
settledAt presente. Evento ABANDONO/APLICADO único −10, saldo130 →120. Cuatro
intentos totales; tres eventos GUARDIAN reales (+100,+30,−10); normal sin evento.
IC-1B cerrada en su alcance local. No probado TTL24h, acuse perdido posterior al
guardado real, audio/iOS/producción ni regresión SQL global. Sigue IC-1C Rescate.
Al cerrar, control IPC confirmó admisión OFF; ningún flag productivo alterado.
API/base temporales conservadas para continuar dentro del plazo del harness.
