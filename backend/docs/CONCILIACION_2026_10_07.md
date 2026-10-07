# Conciliación backend — 7 de octubre de 2026

## Estado y fuente de verdad

La fuente única del orden global es `docs/ETAPAS_PENDIENTES.md` del repositorio
Flutter, no un archivo de este repositorio. Ver allí también
`docs/CONCILIACION_2026_10_07.md` y `docs/PROMPT_RELEVO.md`.
Aquí se conservan contratos backend y evidencia; los históricos no ordenan nuevas etapas.

PR-I1 integrado por `5216383`; PR-I2 I2-1/2/3 por `66b5aa2` y Flutter I2-4
por `1921ba9`. **I2-5 abierto**: falta recorrido Android y cerrar sus criterios.
La regresión PostgreSQL completa e integración HTTP ya tienen evidencia; no
presentarlas como totalmente pendientes ni confundirlas con despliegue.

## Resultados y procedencia

- [Informe del compañero del día 6](VALIDACION_LOCAL_I2_5_2026-10-06.md) y
  [resumen sanitizado](validacion-local-2026-10-06/resultados.json): 347/347
  competitivas PostgreSQL, otros nueve modos 102; Jest 1.258; Flutter 694 pass,
  9 opt-in skip; login/ranking 6/6 y repetición 5/5. Evidencia revisada, no toda
  reejecutada el día 7. Datos sintéticos, no partidas físicas verificadas.
- Día 7 en el PC de Pavel: `admin/npm run check` 22 módulos; `admin/npm test`
  88/88 con configuración normal. El fallo previo del otro PC no se reprodujo;
  causa no confirmada. No declararlo corregido por una repetición favorable.
- Día 7: `npm audit --omit=dev` 0 vulnerabilidades. `cb14338` actualizó
  proxy-addr 2.0.7 a 2.0.8. No acredita ausencia de deuda de desarrollo, seguridad
  completa ni estado actual de CI remoto. Los resultados del día 6 son históricos.
- ESLint sin `--fix`, patrón `{src,apps,libs,test}/**/*.ts`: 603 errores,
  150 avisos. Incluye formato/tipado; no son 603 bugs funcionales demostrados.
  No atribuir la diferencia frente a 567 al compañero sin diagnóstico.
- Node/npm local 24.11.1/11.6.2 frente a 24.14.1/11.11.0 del manifest;
  alinear/registrar versiones al reproducir comparaciones.
- Android: compilación/instalación documentadas, recorrido humano incompleto.
  Certificados: siete muestras, seis tipos; descarga física e iOS no acreditados.

La validación ya tiene commits `8bf32aa` y `cc6e158`; HEAD previo a esta
conciliación `cb14338`, main y árbol limpio. No usar «sin commit/push» para describir
esa entrega. No se autoriza publicación automática de entregas nuevas.

## Pendientes con etapa explícita

| Etapa | Alcance y aceptación |
| --- | --- |
| I2-5 | Completar recorrido Android de ranking, permisos, filtros, estados, errores, privacidad y criterios del contrato; registrar intermitencias/deuda y evidencia existente sin rehacer lo validado. |
| IC-1 | Integrar/verificar clientes de Cima, Guardián, Rescate, Trivia, Duelo y Tira: admisión, presencia, reconexión y terminal. Partida app/API produce XP una sola vez; reintentos/desconexiones no inventan XP/abandono. Reutilizar motores y contratos. |
| IC-2 | Memoria competitiva autoritativa y cliente. Resolver explícitamente reglas faltantes; permisos, fraude, idempotencia, resultado/XP/ranking probados. NO_DISPONIBLE hasta integrar y validar. |
| IC-3 | Batallas competitivas sobre el flujo asíncrono existente: ambos participantes, vencimientos/empates, permisos y liquidación única. No inventar fórmulas ni rehacer batallas normales. |
| QA-1 | CI Flutter en el otro repo y tratamiento explícito de deuda lint/intermitencia del panel. No desactivar pruebas para poner checks verdes; baseline solo revisada y sin ocultar nuevos errores. |
| DOC-1 | Higiene de artefactos/acceso con el propietario. No borrar entregables deliberados ni cambiar visibilidad/protección de GitHub automáticamente. |

Ruta local: I2-5 → IC-1 → IC-2 → IC-3 → PR-I3 y bloque social según dependencias.
PR-I3 puede prepararse contra contratos comunes; premios de cada juego requieren
integración verificada. P5 → D3 siguen pausadas; C5 antes de archivos persistentes.
Implementación no equivale a activación: B1/B2, migraciones/despliegues y flags
productivos requieren autorización/evidencia aparte. No se inspeccionó estado remoto.

## Política vigente

Main por decisión del propietario, coordinación previa y conservación de cambios.
Rama/PR puede acordarse para concurrencia; no imponerlo como instrucción vigente.
No reset, force-push, commit/push/merge automático, secretos ni operaciones reales.
Visibilidad/protección de GitHub no comprobadas en esta revisión local.
Esta entrega modifica solo documentación; conserva informes y contratos originales.
