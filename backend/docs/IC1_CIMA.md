# IC-1A — Continuidad del cliente competitivo de Cima

## Estado — 8 de octubre de 2026

El recorrido Android del lector de rankings y sus criterios funcionales fueron
revisados, sin cierre productivo. Cierre operativo/limpieza y QA-1 conservados.
Flutter implementa localmente el cliente IC-1A; siguiente IC-1A2: partida real
app/API/ledger con liquidación única. No está validada todavía esa integración.
Fuente global: `docs/ETAPAS_PENDIENTES.md` y `docs/IC1_CIMA.md` del repo Flutter.

No se cambió código backend, esquema, migraciones, fórmulas o flags. Se reutiliza
`SummitController`/`SummitService`: creación con `competitive?: boolean`, respuesta
pública con `competitive: boolean`, recuperación activa/por ID, respuesta
idempotente y abandono autenticado. El cliente no envía XP ni identidad ajena.

Con `COMPETITIVE_SOLO_ENABLED` ausente/false se rechaza solo la creación
competitiva nueva mediante `COMPETITIVE_SOLO_DISABLED`. No inventar un endpoint
de activación, un canal de presencia para Cima ni una fórmula distinta. Cima
conserva vencimiento a las 24 horas y recuperación; Trivia/Tira tienen sus propios
protocolos de presencia y no se copian a este juego.

El lector de ranking permite consultar balances existentes aun con admisión OFF.
Un terminal de Cima no significa que la liquidación ya haya ocurrido: la concede
el reconciliador/verificador del servidor y debe comprobarse en el ledger, una
sola vez. No sustituirlo por balances sintéticos de `local_ranking_validation`.

## Siguiente ensayo IC-1A2

1. Entorno local desechable con propiedad validada; banco de doce preguntas
   sintéticas distintas/publicadas de un área. No usar `.env` real, Supabase,
   Render ni imágenes/recursos personales.
2. Habilitar admisión exclusivamente en esa API local de ensayo y ejecutar el
   cliente Flutter real. No habilitar competición en servicios desplegados.
3. Crear, responder, alcanzar terminal y esperar liquidación autoritativa;
   comprobar un evento/balance y ranking, no XP calculada por Flutter.
4. Repetir lectura terminal/reintento/cierre/red y comprobar que no duplica
   liquidación ni cambia la modalidad del mismo intento.
5. Apagar admisión: nuevas competitivas rechazadas sin fallback; recuperación y
   cierre de aceptadas siguen válidos, modo normal conserva el contrato previo.
6. Registrar qué se comprobó por Android, HTTP y SQL y qué continúa pendiente.
   Limpiar solo los procesos, contenedor, directorio y reverse propios.

## Evidencia de la continuación

El 8 de octubre se repitieron pruebas dirigidas de ranking: Flutter 66/66;
backend 43/43, dos suites (controller/rules). No nueva regresión PostgreSQL.
Los nuevos tests IC-1A usan dobles HTTP/widgets; no certifican liquidación real.
Resultados Flutter finales registrados en su documento de entrega.
Suite final Flutter: 707 aprobadas, 9 opt-in omitidas y analyze sin incidencias.
Incluye 13 nuevas pruebas de Cima. Sin nueva APK, liquidación competitiva real
ni prueba física IC-1A en esta entrega; no confundir con el ensayo académico.

El ensayo académico separado confirmó edición manual de lección, progreso
100 % y dos versiones de pregunta con intentos históricos preservados en SQL.
EDITOR_STALE inicial se resolvió recargando. La revisión editorial incluye
contadores de uso: hallazgo pendiente de evaluación, sin cambio funcional aquí.
