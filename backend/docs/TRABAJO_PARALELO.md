# Reparto paralelo — 12 de octubre de 2026

**Relevo vigente del21:** otro compañero termina C5-C2 del propietario según
[su guía](RELEVO_C5_C2.md) y [acta C2-D](C5C2D_VALIDACION_LOCAL.md),0/8 humanos.
No es el compañero de OV-1. Puede corregir Flutter/API/panel dentro de C2;
OV-1 conserva su responsable, rama y checkpoint. Ver README para estado Git.

**21 de octubre — [C5-C2-C validada automáticamente](C5C2C_CONSUMIDORES.md):**
contratos/snapshots y Flutter incorporan imágenes opcionales sin cambiar XP ni
romper JSON antiguo.969 Flutter aprobadas/16 opt-in omitidas,128 suites/1.675
backend y44/44 PostgreSQL/HTTP;70 migraciones temporales, ninguna nueva de C2-C.
**Sigue C2-D:0/8 guiones humanos propuestos**, con Docker/USB al preparar la sesión.
Activación apagada por defecto; sin nuevo ensayo Android ni despliegue. C1 conserva5/5.
Entrega C2-C/relevo: app `e833d6b`, backend `cfba7cd`.
Deuda ESLint previa:27 incidencias verificadas en HEAD, descritas en el acta.
Integrada en main local: app `f912880`/backend `09c763b`; sin push nuevo ni cambios OV-1.

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
