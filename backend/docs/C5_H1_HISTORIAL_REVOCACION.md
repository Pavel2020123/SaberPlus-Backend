# C5-H1 — Historial propio y revocación de imágenes

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md),
después H3. Las cifras inferiores conservan la evidencia de cada fecha.

**Continuación del24/oct:** [H2A validada localmente](C5_H2_SNAPSHOTS.md):
Cima/Guardián/Rescate,68/68 SQL/HTTP,75 migraciones temporales y159 dirigidas/build.
La evidencia H1 inferior conserva sus conteos originales; sigue H2B, no repetir H1.

## Checkpoint — 24 de octubre de 2026

**H1 cerrada en su alcance backend local en la rama `fix/c5-c2-cierre-local`.**
58/58 PostgreSQL/HTTP aprobadas:8 casos H1 y50 de regresión,74 migraciones aplicadas
exclusivamente en PostgreSQL16 temporal propio con Docker. Recursos temporales
eliminados al terminar. No hubo ensayo Android, despliegue, commit o push.
C2 conserva su [cierre local](C5C2_CIERRE_LOCAL.md); OV-1 sigue independiente.

Regla aprobada por Pavel: conservar la imagen original de una respuesta confirmada
en el historial propio tras archivar la pregunta, salvo revocación por seguridad
o derechos. [Contrato y matriz completa](C5_HISTORICOS.md).

## Qué se implementó

- Migración aditiva `20261023200000_editorial_history_revocation`, aplicada y validada
  únicamente en la base desechable; no aplicada a bases existentes o remotas.
  Crea `ImagenHistorialRespuesta` y `RevocacionArchivoEditorial`; no cambia migraciones
  anteriores ni genera un backfill aproximado.
- Un trigger transaccional captura, al insertar un historial confirmado, las imágenes
  administradas de las opciones seleccionada y correcta: propietario, respuesta,
  archivo, rol y SHA original. Verifica que pertenecen a esa pregunta, la ruta canónica,
  el estado disponible y que no exista revocación; la opción correcta debe ser correcta.
  Cubre INSERT/createMany de los escritores existentes, sin modificar sus resultados.
- Las capturas no pueden actualizarse; al eliminar el historial se eliminan por FK.
  No dependen de que la asociación editorial siga apuntando al mismo archivo.
  Su índice es archivo/propietario. El retiro normal cuenta también estas referencias.
- `GET /recursos/editoriales/:id` mantiene JWT, correo, cuenta existente y runtime.
  Usa el sujeto del JWT: publicación vigente **o** captura propia con SHA coincidente
  y el mismo propietario en el historial. No acepta usuarioId como autorización.
- Historial y cuaderno consultan las capturas cuando H1 está habilitada y proyectan
  la ruta original por rol/respuesta. No cambian el resultado, la XP ni las soluciones
  permitidas por esos endpoints. No dan acceso a otras opciones/preguntas.
- `POST /admin/archivos/:id/revocaciones`, exclusivo ADMIN habilitado, recibe
  `operacionId` UUIDv4, `motivo` SEGURIDAD/DERECHOS y `detalle` de 1–500 caracteres.
  Rechaza claves extra/control; registra actor, fecha y huella de archivo/payload.
  Reintento idéntico recupera el recibo; otro actor/payload/archivo no lo reutiliza.
- `GET /admin/archivos/:id/revocaciones/:operacionId` recupera el recibo del ADMIN
  emisor. Detalle/motivo quedan en esa ruta administrativa, no en el recurso estudiantil.
- Revocar conserva bytes y resultados. La existencia del recibo prevalece incluso
  con usos publicados/históricos; metadatos ADMIN exponen estado efectivo REVOCADO,
  sin URL de contenido ni reintento de carga. No se puede deshacer con otra carga.
- Confirmación de carga, asociación, retiro y revocación usan el mismo lock por archivo.
  No se mantiene el lock SQL durante IO. Una carga tardía no puede confirmar DISPONIBLE
  tras revocación; no borra esos bytes de auditoría. La lectura comprueba revocación
  antes y después de leer/verificar bytes. No promete borrar imágenes ya emitidas.
- Tablas nuevas con RLS y sin acceso PUBLIC/anon/authenticated. El recibo de revocación
  no admite UPDATE/DELETE; restauración y borrado definitivo requieren otro diseño.
- Panel compatible con el recibo REVOCADO: no lo vincula como imagen disponible.
  La pantalla administrativa completa de revocación queda para H3.
- Lectura y retirada usan el UUID canónico del registro para acceder al disco;
  revocación normaliza el identificador antes de calcular su huella y comparar
  el recibo. UUID en mayúsculas no rompe lecturas Linux ni el reintento idéntico.

## Activación y límites

`EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED=false` por defecto. Solo permite lectura
histórica si además están activos los archivos locales y NODE_ENV es development/test.
La captura SQL comienza al aplicar la migración: no depende de la bandera de lectura.
Las consultas ordinarias del historial/cuaderno no incluyen la tabla nueva si H1
está apagada. Todo el módulo de archivos sigue limitado al entorno local.

No reconstruye imágenes anteriores a la migración ni imágenes ausentes en una
confirmación. El legado conserva su proyección habitual y la lectura publicada;
una cadena de imagen por sí sola no concede permiso sobre contenido archivado.
No se congelan con esto textos/contextos/lecciones ni JSON completos de juegos.
H2 revisará sus versiones/snapshots; H3 hará el recorrido integrado. No hay archivos
offline, PDF, URLs públicas nuevas, Premium obligatorio ni cambio de XP.

`actorId` del recibo es una instantánea de auditoría sin FK a Usuario para conservar
el registro si se elimina esa cuenta. No introduce plazos legales de conservación.
Coordinar la migración aditiva/schema con OV-1 antes de integrar las dos ramas.

## Validación ejecutada en este PC — 24 de octubre

- Build backend y generación Prisma: aprobados.
- Jest dirigido: **9 suites / 150 pruebas aprobadas**, archivos editoriales,
  historial/cuaderno y simulacro. Incluye HTTP Nest/supertest con base simulada:
  guards, DTO, identidad JWT, no-store, revocación/recibo y denegación.
- PostgreSQL/HTTP: **58/58**, sin omitidas ni fallas, con74 migraciones. La primera
  pasada se amplió para comprobar historial/cuaderno tras cambiar la asociación;
  una tercera pasada completa confirmó además los UUID en mayúsculas y el remate
  de lectura/retirada/revocación. Resultado final:58/58 en74,6 segundos de tests;
  las tres pasadas no se suman como174 casos diferentes.
- H1 verificó propietario frente a otro alumno/docente, respuesta/rol/SHA exactos,
  recursos no expuestos, ausencia de backfill, revocación e idempotencia, cargas
  concurrentes, protección de retirada, rollback, RLS/ACL y conservación de XP/bytes.
- Historial y cuaderno HTTP reales devolvieron la ruta original tras cambiar la
  asociación y archivar; no expusieron FK del archivo ni SHA en la opción pública.
- Panel real Chromium: publicación/recarga de imagen de enunciado/opción en
  escritorio y390px; evidencia local generada en `backend/.tmp/c5b-qa/`.
  Este recorrido es regresión del panel existente, no una UI nueva de revocación.
- ESLint dirigido del servicio y sus pruebas H1: sin incidencias; no es lint global.
- Panel17/17 del23/oct sigue como evidencia anterior; no se repitió su suite Node
  el24. La regresión Chromium sí se repitió con la API real.
- Sin Android, Flutter nuevo, proveedor remoto ni producción. Las pruebas globales
  de la auditoría C2 conservan su fecha original.
- Documentación:40 Markdown modificados/nuevos revisados,674 rutas de enlaces
  locales sin destinos ausentes; actas H1/H0/C2 y guía C5 sincronizadas entre repos.
  Diff sin errores de whitespace. No implica comprobar enlaces externos o cada ancla.

## Reproducción del cierre H1

Con Docker local activo, reproducir únicamente mediante el runner temporal propio:

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run test:editorial-files:postgres
```

El runner incluye explícitamente la nueva migración local. Los siguientes **8 tests
integrados H1 están aprobados**, además de los50 casos anteriores de regresión:

1. Captura de ambos roles, archivo/propietario/SHA, archivo de pregunta/padres,
   propietario permitido, otro alumno/docente denegados, 401/403/400 y 404 uniforme.
2. Opción no respondida e imagen incorporada después no heredan permiso;
   la captura original no se sustituye ni admite UPDATE; historial/cuaderno HTTP
   proyectan el archivo original.
3. Asociar después no rellena un historial previo; IDs ajenos/inexistentes
   no generan prueba histórica.
4. Retiro normal rechaza referencias históricas aunque se quiten asociaciones.
5. Revocaciones idénticas concurrentes convergen; bloquean lecturas y reintento
   de carga, mantienen bytes, historial, capturas y XP; recibo privado/inalterable.
6. Revocar mientras termina una carga impide reactivación y conserva auditoría.
7. Una operación concurrente para dos archivos no revoca ambos.
8. Rollback no deja pruebas y las dos tablas tienen RLS/deniegan PostgREST.

Si una repetición falla, diagnosticar antes de ampliar el alcance. El runner no debe apuntar
a bases existentes ni usar credenciales reales; crea/destruye solo su entorno propio.
El celular no fue necesario para H1. **Sigue H2:** inventariar versiones y fuentes
de snapshots/otros medios, definir prueba exacta por origen y preparar su código
y tests sin inferir permisos desde JSON arbitrario. H3 conserva cuatro guiones
humanos propuestos; avisar antes de necesitar USB. No cerrar toda C5 al pasar H1.

## Estado histórico tras H1: siete entregas de C5 abiertas

1. H2: versiones y adaptadores de medios históricos/snapshots.
2. H3: integración visual panel/Flutter y pruebas Android.
3. PDF y descarga/offline con reglas de acceso definidas.
4. Fotos persistentes de estudiantes/profesores.
5. Evidencias institucionales privadas.
6. Proveedor/biblioteca, cuotas, versiones, limpieza y respaldos de archivos.
7. C5-D: validación y cierre operativo integrado.

Antes de validar H1 eran8 entregas abiertas; entonces quedaban7. Es un desglose de
entregas, no siete pruebas ni siete módulos nuevos.
Conservar el trabajo académico/institucional ya validado. OV-1 no pertenece a C5.
