# Reparto paralelo — 12 de octubre de 2026

Fuente del acuerdo: `docs/TRABAJO_PARALELO.md` del repo Flutter `saber_plus`.
Leerlo completo antes de empezar; no es un archivo de este árbol backend.
Incluye primera sesión paso a paso, archivos Flutter existentes, criterios de
aceptación A/B/C/D, comandos de prueba, coordinación Git y prompt copiable.
Ambos repositorios son públicos según API GitHub el 13 de octubre de 2026;
clonar no concede permiso para push. No cambiar visibilidad automáticamente.
Confirmar primero que el propietario publicó la documentación de ambos repos;
un cambio local no está disponible automáticamente en el PC del compañero.

- **Propietario:** instituciones. [C4-C10/10 guiones locales cubiertos](PR_I5_C4_CODIGO.md)
  con Android+19 HTTP/SQL (no10 solo manuales). Regresión final893/13 opt-in omitidas;
  [cierre local consolidado](CIERRE_INSTITUCIONES_LOCAL.md). Commits creados
  app6bab6be/API7ba93d7/lockbfce42e integrados a main por PR app #5/API #8
  (e679c50/388bb18). CI backend PR/main aprobado; Flutter analyze/102 dirigidas aprobados.
  Siguiente recomendado [MA-1R reportes](ESTADO_Y_ORDEN_2026_10_17.md), propuesta
  no iniciada. Sin despliegue remoto.
- **Compañero:** OV-1, orientación vocacional, en curso según el propietario;
  sin entrega nueva verificada en estos clones. Retomar su checkpoint para A
  contenido/reglas → B persistencia → C cliente → D validación, no reiniciarlo.

Ambos pueden trabajar ahora. Cada frente modifica Flutter/backend cuando lo
necesite, sin dividir responsabilidades únicamente por tecnología.
Ramas: `feat/instituciones-c2c` y `feat/orientacion-vocacional`; main recibe
entregas revisadas mediante PR. Sustituye el trabajo individual directo en main.
Este documento no crea ramas ni autoriza push/merge/despliegue automáticos.

Coordinar `schema.prisma`, migraciones, `app.module.ts`, dependencias y locks.
No modificar migraciones ajenas/aplicadas. Bases locales separadas y credenciales
ficticias privadas. El compañero documenta su acta OV-1; el propietario consolida
roadmap general al integrar. Pruebas y compatibilidad entre los dos PR obligatorias.
No cambiar XP, instituciones ni publicar resultados vocacionales a terceros.

## Checkpoints independientes

Instituciones: propietario mantiene actas C2/C3/C4 y [cierre consolidado](CIERRE_INSTITUCIONES_LOCAL.md)
con sus equivalentes Flutter; C2C ya no es un recorrido pendiente por defecto.
OV-1: compañero mantiene [checkpoint](CHECKPOINT_OV1.md)
y su equivalente Flutter. Actualizar evidencia propia después de cada caso;
propietario consolida roadmap/índices al entregar o integrar bloques.
