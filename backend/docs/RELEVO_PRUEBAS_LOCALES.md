# Relevo de pruebas locales para compañeros

Actualizado: 9 de octubre de 2026. Se necesitan **ambos repositorios**.
Guía completa y prompt operativo: `docs/RELEVO_PRUEBAS_LOCALES.md` del repositorio
Flutter `Pavel2020123/saber_plus`; no es un archivo dentro de este árbol backend.
Punto vivo: `docs/ETAPAS_PENDIENTES.md`, bloque «Checkpoint de relevo de pruebas».
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

1. Acceso privado, main y pull fast-forward con worktree limpio; revisar cambios
   y contratos afectados. No reset/force-push ni cambios ajenos automáticos.
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
6. Tras CADA prueba: acta backend del juego + acta/checkpoint del repo Flutter;
   registrar humano/HTTP/SQL, resultados/límites y siguiente paso, sin secretos.
7. Juego completo: documentación actualizada, tests y commit por repo afectado
   autorizado; dar rutas/hash/comando push. Push no automático. La guía operativa
   de soporte puede ir en commit documental separado para no mezclar código de juegos.
8. Stop por control propio, esperar confirmación, retirar solo reverse USB del
   ensayo. No prune ni limpieza amplia. Si se interrumpe, guardar acta antes de cerrar.

Si falta el repo Flutter, pedir clonarlo; no continuar solo con esta nota ni
asumir que el siguiente juego ya tiene cliente competitivo por tener servicio backend.
