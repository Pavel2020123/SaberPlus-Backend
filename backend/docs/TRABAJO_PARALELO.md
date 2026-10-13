# Reparto paralelo — 12 de octubre de 2026

**Punto de entrada backend:** [INICIO_Y_TRABAJO_EN_EQUIPO.md](INICIO_Y_TRABAJO_EN_EQUIPO.md), resumen de ramas, migraciones, actas y PR. Fuente completa: guía del repo Flutter.

Fuente del acuerdo: `docs/TRABAJO_PARALELO.md` del repo Flutter `saber_plus`.
Leerlo completo antes de empezar; no es un archivo de este árbol backend.
Incluye primera sesión paso a paso, archivos Flutter existentes, criterios de
aceptación A/B/C/D, comandos de prueba, coordinación Git y prompt copiable.
Ambos repositorios son públicos según API GitHub el 13 de octubre de 2026;
clonar no concede permiso para push. No cambiar visibilidad automáticamente.
Confirmar primero que el propietario publicó la documentación de ambos repos;
un cambio local no está disponible automáticamente en el PC del compañero.

- **Propietario:** instituciones. Sigue C2C, pruebas del logo; después solicitudes
  de ingreso, aprobación/rechazo, avisos y código institucional privado.
- **Compañero:** OV-1, orientación vocacional. Empieza por contenido y reglas A,
  después persistencia privada B, cliente C y accesibilidad/validación D.

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

Instituciones: propietario mantiene backend/docs/PR_I5_C2_LOGO.md y el acta
Flutter PR_I5_C2_LOGO.md. OV-1: compañero mantiene [checkpoint](CHECKPOINT_OV1.md)
y su equivalente Flutter. Actualizar evidencia propia después de cada caso;
propietario consolida roadmap/índices al entregar o integrar bloques.
