# C5-H2B2 — Imágenes originales de Tira y afloja online

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md).
Sigue H3. La evidencia inferior corresponde a H2B2 y conserva sus conteos originales.

## Alcance — 24 de octubre de 2026

Continuación del propietario en `fix/c5-c2-cierre-local`, tras
[H2B1](C5_H2B1_TRIVIA_LOCAL.md). OV-1 conserva compañero y checkpoint independientes.
No cambia emparejamiento, tiempos, presencia, puntuación, XP ni contratos Flutter.
No añade pantallas de historial, descarga offline o acceso público a imágenes.
**H2B2 implementada y validada localmente. H2 completa sigue abierta.**

## Evidencia de acceso

- La copia `PartidaTiraAfloja.snapshotInicial` V1 ya conserva preguntas y opciones
  originales, participantes y configuración. Su admisión e inmutabilidad ya se
  validan en PostgreSQL; no se reconstruye desde el banco que se edite después.
- Ser participante no autoriza todas las imágenes. Se exige la fila individual
  `TiraAflojaRondaPresentada` de esa ronda/pregunta y la fila coherente del rival.
  Ambas son evidencia del servidor de habilitación, no de que el usuario miró
  físicamente la pantalla. No se confía en un timestamp o contador del cliente.
- Si la partida está inscrita en certificación R V1, exige además el certificado
  `TugRoundVisibility` de esa pareja/origen, observado antes del límite. Una copia
  en una transacción no confirmada no concede permiso a otra conexión.
- Formatos, propietarios, IDs, orden y fechas deben coincidir. En countdown,
  antes de presentación, preguntas futuras, otro estudiante o profesor sin
  participación, versión desconocida o legado sin evidencia: denegar.
- Una ronda habilitada conserva permiso sobre sus imágenes originales al cerrar,
  incluso si un participante no respondió. Eso no crea respuesta, historial,
  puntos o XP: se conserva la prueba de habilitación existente. No se fabrican
  presentaciones para rondas futuras o plazos ya vencidos.
- La proyección online muestra imagen de enunciado y opciones. Su `contexto`
  interno no se muestra como fallback; por eso su imagen no concede lectura
  por este adaptador. Proteger sus bytes en una copia no equivale a publicarlos.
- Revocación por seguridad/derechos, estado del archivo, autenticación, SHA,
  WEBP privado/no-store y guards H1 siguen prevaleciendo.

## Implementación

`backend/src/editorial-files/editorial-tug-access.ts` consulta SQL parametrizado
por participante, presentación y copia original. No recorre JSON arbitrario ni
carga todas las partidas en Node. Se integra como alternativa de autorización
en `EditorialFileService`, tras las rutas publicadas e históricas anteriores.
La retirada normal comprueba referencias de Tira online independientemente del
flag, estado o presentación: conserva incluso imágenes futuras sin dar lectura.

Migración `20261024200000_editorial_tug_snapshot_access`: **solo un índice GIN
jsonb_path_ops**, sin nueva evidencia, backfill ni cambios de reglas de juego.
Los runners editorial y de ensayo humano incluyen la migración local pendiente.
Las tablas de evidencia, RLS, roles y triggers anteriores no se modifican.

`EDITORIAL_TUG_SNAPSHOT_IMAGES_LOCAL_ENABLED=false` por defecto; independiente
de H2A/H2B1, exige archivos habilitados y NODE_ENV development/test. Production
y staging no habilitan esta capacidad. Sin despliegue ni migraciones remotas.

## Validación

- Compilación con Prisma aprobada antes del ensayo y repetida correctamente
  después de finalizar PostgreSQL y Jest, sin generar la DLL durante su uso.
- Jest dirigido:15 suites /196 pruebas aprobadas, incluidas9 nuevas unitarias
  de SQL/retención/errores y activación local.
- ESLint dirigido del adaptador/spec, runtime y servicio editorial aprobado.
- PostgreSQL16/HTTP: **80/80 aprobadas**,0 omitidas,121,34s.75 regresiones y5
  casos H2B2 nuevos,77 migraciones aplicadas solo al contenedor propio temporal.
- Jest completo backend: **132 suites /1.744 pruebas aprobadas**,144,62s.
  Las196 dirigidas anteriores son un subconjunto; no sumar ambos conteos.
- Primera pasada: los4 guiones funcionales nuevos pasaron, pero la acumulación
  de pools del fixture agotó conexiones en el quinto y en casos posteriores.
  Se cerraron las aplicaciones/testigos propios tras cada guion y se registran
  para limpieza incluso si listen falla. No se elevó max_connections ni se
  relajaron permisos, certificados o reglas para obtener la pasada80/80.
- Índice GIN comprobado y EXPLAIN ANALYZE/BUFFERS de la consulta real:
  ejecución1,288ms, planificación5,442ms en el fixture final. No garantiza
  latencia productiva ni sustituye pruebas de carga.
- Chromium escritorio/390px aprobado dentro de las80; capturas locales ignoradas
  en `backend/.tmp/c5b-qa/run-e6yYR8`. No hubo Android/USB ni pruebas manuales.
- El runner confirmó eliminación del contenedor y directorio temporal propios.
  Ninguna migración se aplicó a bases existentes o remotas.
- Documentación:46 Markdown modificados/nuevos,741 destinos de enlaces locales
  sin ausencias y6 actas/guías espejo exactas. Las guías generales backend
  conservan sus rutas propias. Sin afirmar revisión de anclas o páginas externas.

Los casos nuevos recorren API con dos cuentas y presencia real del servidor:
emparejamiento, listo, countdown, presentación/certificación, imágenes distintas
de enunciado y opciones, propietario/futura/ajena/contexto, flag apagado, retiro
protegido, recuperación, inmutabilidad, respuesta y reintento, cierre sin respuesta,
revocación, legado y comprobación de índice/plan SQL. No es un ensayo WebSocket
manual, Android ni prueba de carga productiva.

Reproducir desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
npx jest --runInBand --testPathPatterns="editorial-files|trivia-rush|simulacro.service.spec|cuaderno-errores.service.spec|public-answer-option.spec"
npm run test:editorial-files:postgres
```

El runner usa solo PostgreSQL16 propio temporal, loopback,512MiB y tmpfs con
credenciales efímeras. No generar Prisma mientras esté en ejecución en Windows.
No se necesita USB en este incremento; H3 conserva la validación Android posterior.

## Siguiente paso y cantidad pendiente

Al cerrar H2B2 quedaban **2 partes para cerrar H2** (antecedente):

1. **H2B3 — Batallas:** comprobar versión original y evidencia por participante,
   sin equiparar una relación a pregunta mutable con una copia completa.
2. **H2B4 — Fuentes mutables:** lecciones/casos sin prueba suficiente; versionar
   donde corresponda o registrar la denegación exacta, sin inventar el pasado.

Después seguía H3. **Entonces quedaban7 entregas C5:** H2, H3, PDF/offline, fotos de
estudiante/profesor, evidencias privadas, proveedor/biblioteca/cuotas/versiones/
limpieza/respaldos y C5-D integrado. Son entregas, no cantidad de pruebas.
No hay commit, push, merge o despliegue de este incremento.
