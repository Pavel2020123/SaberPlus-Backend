# OV-1: auditoría de integración del 27 de octubre de 2026

## Entrega examinada

- Flutter: PR #11 integrado en `main` mediante `48a44cc`; pruebas sobre `d1860c9`.
- Backend: PR #13, cabeza examinada `d9bb0b8`.
- Se utilizaron worktrees independientes. No se sobrescribieron los cambios de UI/C5 del propietario.

## Revisión funcional y de contrato

El cliente Flutter y la API coinciden en las rutas de cuestionario, intento actual,
inicio, guardado, finalización, historial, consulta y eliminación del intento propio.
La API obtiene la identidad del JWT y comprueba el rol vigente de estudiante.
No acepta resultados ni identidades calculados por el cliente.

Se conservan 30 preguntas, seis familias, escala 0–4 y `NO_SE`. Finalizar requiere
24 respuestas numéricas y al menos tres por familia. `NO_SE` no equivale a cero.
Los empates se preservan y los resultados completados son snapshots inmutables.
El resultado es orientación exploratoria de intereses, no diagnóstico profesional.
No concede XP, ranking ni certificados y no se mezcla con el diagnóstico académico.

## Verificaciones ejecutadas en esta auditoría

- Flutter: cinco archivos de pruebas OV-1, 77 PASS y 3 SKIP. Las omitidas no se consideran aprobadas.
- `flutter analyze --no-pub`: sin problemas.
- Backend entregado: `prisma validate`, generación de cliente y compilación correctas.
- Backend entregado: dos suites Jest OV-1, 31/31 PASS.
- Reglas con Node: 8/8 PASS, también repetidas tras la corrección de dependencias.
- Panel: sintaxis correcta en 28 módulos y 132/132 pruebas PASS.
- Controles locales aislados del workflow: 20/20 PASS.
- Tras actualizar dependencias: compilación correcta y Jest global, 130/130 suites y 1706/1706 pruebas PASS.

## Hallazgo de seguridad previo a integrar

GitHub aprobó compilación, pruebas y controles locales del PR #13, pero rechazó
la auditoría de dependencias de producción. Se reprodujeron nueve vulnerabilidades
(siete altas y dos moderadas). El PR OV-1 no modifica `package.json` ni su lockfile:
esas versiones también estaban en su base `main`.

Se preparó una corrección separable sin subir de versión principal NestJS:
`body-parser ^2.4.0`, `multer ^2.5.0`, `nodemailer 10.2.1`,
`puppeteer 25.16.0` y override `qs 6.17.0`, regenerando el lockfile con npm.
`npm audit --omit=dev --json` posterior: cero vulnerabilidades.
No se desactiva ni se relaja la comprobación de seguridad del workflow.

## Límites y puesta en servicio local

Esta auditoría no acredita una nueva prueba Android ni PostgreSQL integrado.
El servicio Docker local estaba apagado y no se aplicaron migraciones a ninguna base.
La evidencia PostgreSQL/Android del compañero se conserva como evidencia previa,
no como pruebas repetidas en esta revisión.

El entorno local usa Node 24.11.1/npm 11.6.2; el repositorio y CI requieren
Node 24.14.1. La advertencia de versión no debe confundirse con un resultado de CI.
No se realizó actualización del SDK ni migración productiva.

Después de integrar: incorporar las ramas preservando los cambios locales,
aplicar la migración `20261014120000_vocational_orientation_v1` únicamente
en la base local aprobada, regenerar Prisma y reiniciar la API. Comprobar el
recorrido con una cuenta de estudiante verificada. El modo DEMO de Flutter no
ofrece persistencia OV-1 y no sustituye esta comprobación integrada.

El contenido del cuestionario sigue pendiente de revisión editorial especializada;
integrar código no constituye validación científica ni despliegue productivo.
