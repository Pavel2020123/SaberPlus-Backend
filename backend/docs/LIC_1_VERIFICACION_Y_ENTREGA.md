# IP + LIC-1: verificación y entrega local

2/nov/2026. Rama `feat/ip-lic1-server`. Fuente funcional: [LIC-0](LIC_0_CONTRATO_INSTITUCIONAL.md); detalle técnico: [LIC-1](LIC_1_NUCLEO_VIGENCIA.md). No es un despliegue ni una validación comercial.

## Resultado del alcance autorizado

| Bloque | Evidencia | Resultado |
| --- | --- | --- |
| IP escolar e identidad | JWT firmado, usuario existente, IPv4/IPv6, CIDR explícito, login/recuperación por IP y cola acotada | Verificado; límites en memoria por proceso, no distribuidos |
| Red escolar y abuso | `.tmp/lic1-balance-ip-regression.log`:75 logins,1125 perfiles desde una IP sin429, abuso de un usuario aislado,10 fallos de login antes de429, doble entrega sin duplicación |5 escenarios/2222 operaciones/0 fallos inesperados; no acredita capacidad de producción |
| Contratos, fechas y renovación | Meses6/12/18/24 en Colombia, ajuste de fin de mes, intervalos [inicio,fin), fecha acordada sin retroactividad y renovación completa sin reducir cuotas | Servicio y política verificados |
| Cupos, autorización e idempotencia | ADMIN activa/suspende; propietario gestiona; aceptación personal; origen gestionado explícito; recibo ligado a actor/institución/payload; bloqueo institucional y cuota concurrente | PostgreSQL y HTTP verificados |
| Titularidad y retirada | Rutas previas de transferencia y retirada pasan por LIC-1; propietario excluido del cupo docente; retirada conserva cuenta/membresía/historial | HTTP y servicio verificados |
| Vencimiento y entregas | No nuevas prácticas ni fallback gratis; historial conservado; intento propio hasta menor de plazo original y fin+24h; suspensión/retirada sin gracia |18 respuestas guardadas por HTTP; revocación espera commit autorizado; cruzar plazo hace rollback |
| Offline, medios y PDF | Concesión recortada al fin de licencia y nunca más de72h; imágenes propias de gracia/historial con hash; revocación editorial prevalece; PDF ya exportado no se modifica | HTTP real y C5 SQL verificados; Flutter/reloj monotónico sin cambios |
| Saldo personal | Captura al aceptar, un saldo abierto por usuario, episodios conservados, renovación no duplica; solo reanuda al volver a modalidad personal sin institución/membresía/asignación activa/origen gestionado | Tres reanudaciones concurrentes exactas; replay y segundo ciclo verificados; sin billing ni nuevo flujo LIC-4 |
| Rutas y sockets | Inventario AST de producción contra AppModule real:305 rutas/18 públicas; default NUEVO; sockets revalidan identidad y acceso | Coincidencia estricta; socket conectado no inicia partida al vencer |
| Regresión | `.tmp/lic1-balance-all-tests.log`:147 suites/1992 pruebas; Prisma validate/generate, Nest build, ESLint de integración final y diff-check | Aprobado localmente; no sumar baterías solapadas |

## Reproducción y evidencias

- `node tool/lic1_postgres_local.mjs`: Docker PostgreSQL16 propio en tmpfs y loopback,78 migraciones confirmadas+2 aditivas explícitas. `.tmp/lic1-balance-final.log` contiene servicio, saldo, segundo ciclo,305 rutas, HTTP, medios, transferencia/retirada y limpieza de recursos propios.
- `node tool/test_editorial_files_postgres.mjs`: `.tmp/lic1-editorial-sql.log`,101 aprobadas/1 omitida/0 fallidas, incluidos3 probes SQL de onlyHistory. Este fixture C5 usa78 migraciones sin activar LIC-1.
- `node tool/pilot_capacity_extended.mjs <marcador-propio> --edges`: valida propiedad y usa únicamente datos sintéticos; evidencia posterior al saldo en `.tmp/lic1-balance-ip-regression.log`.
- `node tool/lic1_route_inventory.mjs`: inventario de fuentes; `.tmp/lic1-runtime-routes.json` procede del AppModule real por IPC. Controladores embebidos y decoradores compuestos incluidos.
- `npx jest --runInBand`:147 suites/1992 aprobadas,171,06s después del saldo. Los logs están en `.tmp`, no son almacenamiento de producción.

## Alcance de cambios y límites

Núcleo propio: `src/security/`, políticas/servicios/controlador/módulo `licencia-*` y `saldo-personal-institucional`, dos migraciones aditivas y relaciones Prisma, runners/probes `tool/lic1_*`, contrato/documentación IP y LIC. Integraciones localizadas en main/JwtGuard/AppModule, AuthService(perfil), diagnóstico/simulacro, institución/capacidades/gestión, offline/medios y sockets. Los archivos mixtos conservan cambios previos ajenos; no usar `git add .` ni asumir que todo el árbol sucio pertenece a esta entrega.

No se hicieron commit, push, merge, despliegue, migraciones remotas, contratación, gasto, lectura de secretos remotos ni borrado de datos reales. Las limpiezas retiraron exclusivamente contenedores/directorios temporales propios con etiqueta/ruta comprobadas. Los servicios generales locales pueden seguir activos con cuentas sintéticas.

Fuera de alcance: LIC-2/3/4, creación/alias/CSV gestionados, portal institucional nuevo, cobros/Google Play, traslado de progreso, retención/borrado y decisiones comerciales pendientes. El saldo interno no pausa ni cancela una suscripción externa. Su restitución está preparada, pero el flujo legítimo de retorno personal se implementará en LIC-4; las pruebas preparan ese estado solo en fixtures.

Antes de producción: revisar peers de proxy, configuración distribuida de límites, flags, respaldo y orden de migración; aprobar despliegue por separado. No atribuir a este backend pruebas Android ni validación psicométrica/comercial.
