# Relevo de pruebas locales para compañeros

**19 de octubre, propietario en MA-1R/R4:** [acta vigente](MA1R_R4_VALIDACION_LOCAL.md),
12/12 humanos,45/45 HTTP/PostgreSQL y corrección de carrera ADMIN P2010/40001
probados. `npm run test:question-reports:postgres` crea su propia base, no requiere
celular ni credenciales externas. La sesión humana anterior se cerró/limpió; no
reutilizar archivo privado ni repetir12. Remate visual confirmado en sesión
posterior: R4 cerrada localmente. Código guardado en API `a747c32`/app `418c291`,
documentación separada; siguen push manual y PR/CI. OV-1 sigue con el compañero, no se le
transfiere este frente. Sin push/merge/despliegue automático.
Los guiones inferiores de instituciones/juegos son históricos, no pasos nuevos.

**17 de octubre, continuación vigente:** instituciones cerradas localmente, commits
app6bab6be/API7ba93d7/lockbfce42e integrados a main por PR app #5/API #8,
e679c50/388bb18. CI backend PR/main aprobado; Flutter analyze/102 dirigidas aprobados.
La auditoría previa fue documental; la entrega posterior comprobó GitHub y pruebas.
Sin nuevos ensayos físicos/SQL ni despliegue; documentación separada en
`docs/estado-post-instituciones`, publicación manual/PR pendientes.
[Orden posterior](ESTADO_Y_ORDEN_2026_10_17.md): MA-1R/R1–R3 locales;
[app/panel y pruebas](MA1R_R3_APP_PANEL.md),18 de octubre. Sigue R4 con PostgreSQL
y HTTP Nest temporal, después Android. SQL R2 sin aplicar; no repetir UI ni instituciones.
Compañero → OV-1A/B/C/D en curso según el propietario; sin entrega nueva verificada aquí.
Ver [responsables, ramas y entrega](TRABAJO_PARALELO.md). Este acuerdo sustituye
la secuencia estricta de OV-1 y el trabajo individual directo en main.

## Antecedente — 12 de octubre de 2026, no continuar por este paso

**Siguiente: PR-I5-C2C, ensayo integrado del logo institucional.**
C2A/backend y C2B/Flutter implementadas: 79 pruebas backend y 45 Flutter
aprobadas, build y análisis correctos. APK debug compilada, no instalada en C2.
Migración C2 no aplicada; seis casos reales HTTP/PostgreSQL y ocho pruebas
humanas Android pendientes. No se acredita despliegue remoto ni validación iOS.
C1C ya completó 15 HTTP/SQL, 3 Flutter/API y 10/10 pruebas humanas locales.
Territorio T5 también cerrado localmente. No repetir esos recorridos salvo regresión.

[Contrato y guion C2](PR_I5_C2_LOGO.md). La ruta maestra está en el repo Flutter.
Las notas inferiores son antecedentes; no reiniciar Rescate, territorio ni C1.

Actualizado: 12 de octubre de 2026. Se necesitan **ambos repositorios**, públicos según API GitHub el 13 de octubre;
permisos de escritura se coordinan sin cambiar visibilidad.
Guía completa y prompt operativo: `docs/RELEVO_PRUEBAS_LOCALES.md` del repositorio
Flutter `Pavel2020123/saber_plus`; no es un archivo dentro de este árbol backend.
Puntos vivos en Flutter: CIERRE_INSTITUCIONES_LOCAL.md y ESTADO_Y_ORDEN_2026_10_17.md
(propietario) y CHECKPOINT_OV1.md
(compañero). Roadmap general: consolidación del propietario al entregar/integrar bloques.
No duplicar aquí una ruta independiente: verificar siempre ese bloque actualizado.

## Estado al entregar esta guía

- Cima y Guardián tienen actas locales Android/API/ledger. Ver
  [Cima](IC1_CIMA.md) y [Guardián](IC1_GUARDIAN.md); no implica producción.
- **IC-1C Rescate de estrellas**: cliente competitivo integrado localmente,
  [tests y recorrido Android/API/SQL aprobados localmente](IC1_RESCATE.md),
  incluido contraste100→90→80. Guardado autorizado, push manual/cierre operativo
  separados; no repetir batería.
  Después instituciones PR-I5/P4-C/PR-I5-T, no Trivia. Releer checkpoint al continuar.
- Competición V1: Cima, Guardián y Rescate. Trivia/Duelo/Tira/IC-2/IC-3 se aplazan,
  sin borrar motores, migraciones ni modos normales. OV-1, perfiles, insignias,
  territorio y demás funciones permanecen; leer `docs/ALCANCE_V1_NOVIEMBRE_2026.md`
  del repo Flutter. Sustentación de noviembre no equivale a lanzamiento productivo.
- Unitarias no usan contraseña real. HTTP opt-in/login físico usan únicamente
  credenciales ficticias de la nueva sesión del harness, nunca las de otro PC.

## Preparación mínima en este repositorio

1. Confirmar acceso y permisos de los dos repositorios, rama/HEAD y worktree antes
   de actualizar. Trabajar por rama/PR; main recibe cambios revisados. No cambiar
   visibilidad ni hacer reset/force-push o descartar cambios ajenos automáticamente.
2. Docker Desktop LOCAL Linux abierto; Node/npm según `backend/package.json`.
   En `backend/`: `npm ci --include=dev`, `npm run build`, después
   `node tool/local_ranking_validation.mjs`. Revisar cada resultado y recursos.
3. Leer [guía del harness](../tool/LOCAL_RANKING_VALIDATION.md). Crea base propia,
   migraciones locales y API loopback43187. No sustituir por .env/Supabase/Render.
   Mantener terminal abierta; plazo2h. Cada nueva sesión cambia login/JWT/IDs.
4. En Flutter seguir guía USB/pantalla encendida y APK separada .i2validation;
   comprobar Success. No pasar flutter-private.json a compilación ni compartirlo.
5. Flags solo mediante control.json propio/ACK IPC; nunca endpoints de prueba
   públicos ni variables productivas. Ledger real por partida; fixtures sintéticos
   de Trivia no acreditan liquidación de otro juego.
6. Tras CADA prueba: acta backend del módulo + checkpoint propio en Flutter;
   registrar humano/HTTP/SQL, resultados/límites y siguiente paso, sin secretos.
   No editar roadmap general simultáneamente: propietario consolida por bloque.
7. Entrega completa: documentación actualizada, tests y commit por repo afectado
   autorizado; dar rutas/hash/comando push. Push no automático. La guía operativa
   de soporte puede ir en commit documental separado para no mezclar código de juegos.
8. Stop por control propio, esperar confirmación, retirar solo reverse USB del
   ensayo. No prune ni limpieza amplia. Si se interrumpe, guardar acta antes de cerrar.

Si falta el repo Flutter, pedir clonarlo; no continuar solo con esta nota ni
asumir que el siguiente juego ya tiene cliente competitivo por tener servicio backend.
