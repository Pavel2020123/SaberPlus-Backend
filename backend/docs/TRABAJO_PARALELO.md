# Reparto paralelo — 12 de octubre de 2026

**21 de octubre — [C5-C2-A/B validadas localmente](C5C2_OPCIONES.md):** base, contrato
y selector por opción;37/37 PostgreSQL/HTTP,130/130 panel y127 suites/1.670 backend
aprobadas.70 migraciones temporales; navegador escritorio/390px sin desbordes.
La nueva carga está desactivada por defecto y solo se ensaya en desarrollo/test.
**Sigue C2-C: contratos/snapshots y Flutter.** No activar para estudiantes antes
de cerrar consumidores y C2-D. C1 conserva su cierre Android5/5.
Push A/B/C1+C2-A confirmado: app `2ee714a`, backend `7995201`; C2-B es la
entrega actual de esta rama, consultar git log para su commit. Sin merge a main,
despliegue ni cambios OV-1. Rama `feat/c5-archivos-base`.

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
  [MA-1R/R1–R4](MA1R_R4_VALIDACION_LOCAL.md) cerrada localmente e integrada por
  PR API #9/app #6 (eef0d40/21757a1); CI backend del PR aprobado.12/12 humanos,
  45/45 HTTP/PostgreSQL y regresiones en acta. SQL solo temporal, sin despliegue.
  **20 de octubre: [C5-A/B](C5_ARCHIVOS.md)** validadas23/23 PostgreSQL/HTTP y recorrido Chromium;
  sigue C5-C Flutter. Rama feat/c5-archivos-base,
  sin tocar OV-1. Conciliar schema/migración y app.module.ts al integrar.
- **Compañero:** OV-1, orientación vocacional, en curso según el propietario;
  sin entrega nueva verificada en estos clones. Retomar su checkpoint para A
  contenido/reglas → B persistencia → C cliente → D validación, no reiniciarlo.

Ambos pueden trabajar ahora. Cada frente modifica Flutter/backend cuando lo
necesite, sin dividir responsabilidades únicamente por tecnología.
Ramas actuales: propietario `feat/c5-archivos-base` y compañero `feat/orientacion-vocacional`; main recibe
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
