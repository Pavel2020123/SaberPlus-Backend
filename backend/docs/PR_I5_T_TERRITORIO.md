# PR-I5-T — Ubicación institucional

## Estado del 11 de octubre de 2026

**T1, T2, T3 y T4 implementadas localmente.** Catálogo/API, persistencia y revisión
administrativa de ubicación. Migración probada solo en PostgreSQL temporal.
T3 incorpora selectores Flutter/ADMIN y T4 filtros. **T5 cerrado localmente** con
API/PostgreSQL/panel/Android. No acredita despliegue, iOS ni toda PR-I5. Siguiente:
perfil institucional y solicitudes estudiantiles. PR-I5A/B conserva su alcance.

### Cierre vigente T5 — 11 de octubre

Usuario confirma aprobación final de segunda solicitud: Aprobada inmediatamente
en panel, ficha e historial conservados; Android muestra Institución aprobada.
Ensayo local acredita filtros/paginación/red/reintento/legado/suspensión,
solicitud, petición de información/restauración, reenvío sin duplicados,
aprobación y corrección territorial auditada con reflejo público en directorio.
Panel: 95 pruebas aprobadas y 23 módulos de sintaxis correcta. Flutter: regresión
final 769 aprobadas/10 opt-in omitidas, formato comprobado y analyze sin incidencias.
Límites: ficha suspendida HTTP 404 sin mensaje humano independiente; códigos
privados de profesor no confirmados individualmente; directorio público sí.
Sin despliegue, migración remota ni iOS; push manual pendiente del propietario.
Consultar `git log` para los commits del cierre. Checkpoints inferiores
son históricos; no repetir T5 por instrucciones antiguas.

## T2 — Persistencia y revisión administrativa

### Checkpoint T5 — 11 de octubre, ensayo local iniciado

Docker y Android USB autorizados comprobados. Sesión local nueva, **62 migraciones**
y API43187/panel4173 HTTP200. `test_local_institution_directory.mjs --territory`
**aprobado contra API/PostgreSQL reales**: nacional20/5, Amazonas20/1, Cesar2,
Bogotá1, vacío, nombre+territorio, legado, estados ocultos y códigos inválidos.
Archivo privado de sesión `directory-territory-evidence.json`, sin credenciales
en repositorio. APK ARM64 actual de ensayo compilada e instalada (Success),
paquete i2validation comprobado y actividad abierta. Usuario confirma en Android
login y directorio nacional con instituciones de ensayo, Página 1, Siguiente y
Filtrar por ubicación. Amazonas/Leticia y Página 2 con una sola institución
confirmados en Android con captura. Ajuste visual localizado solo en Flutter:
usuario confirma etiquetas legibles y funcionamiento conservado. Usuario también
confirma que cambiar a Cesar limpia municipio y vuelve a Página 1; Valledupar
muestra dos instituciones sin siguiente página. Usuario confirma Bogotá con una
institución y Antioquia sin municipio con búsqueda vacía, sin error de conexión.
Usuario confirma búsqueda «ensayo 22» con Cesar/Valledupar y limpieza de ubicación
conservando nombre y resultado. Usuario confirma que vaciar nombre recupera
Página 1 nacional y ensayo 25 muestra ubicación pendiente de clasificar sin datos
inventados. Tras retirar reverse43187, usuario confirma error «No pudimos cargar
el directorio» al actualizar. Enlace restaurado; usuario confirma recuperación
con Reintentar sin cerrar la app ni iniciar sesión otra vez. Usuario confirma
«Reintentar departamentos» sin opciones inventadas al reabrir filtros sin
conexión. Enlace USB restaurado; usuario confirma recuperación del catálogo y
las dos instituciones de Cesar/Valledupar. Usuario confirma que cambiar
rápidamente Amazonas → Cesar mantiene Cesar y que Valledupar muestra dos
instituciones. Ocultación tras suspensión local y revisión ADMIN pendientes;
T5 no cerrada. Usuario confirma ficha ensayo 01 abierta; suspendida únicamente
esa institución ficticia en base temporal propia. Guion --suspend aprobado:
detalle HTTP 404, búsqueda 0, 24 aprobadas restantes y Página 2 nacional con 4.
Usuario confirma que ensayo 01 ya no aparece en Android tras actualizar. Detalle
no disponible comprobado por HTTP 404, sin confirmación humana separada del mensaje.
Usuario confirma formulario de solicitud abierto con profesor ficticio.
Próximo paso: enviar solicitud ficticia Amazonas/Leticia; comprobar persistencia
y revisión ADMIN. Todavía no se registra un envío ni aprobación.
Usuario reporta encabezado inicial redundante tras enviar. Corrección solo Flutter:
ocultar invitación inicial si existe solicitud, conservar estado y detalles.
Cinco pruebas Flutter de aprobación aprobadas; comprobación visual pendiente.
Usuario reporta timeout móvil al reabrir solicitud. API health/ready 200,
panel escuchando y PostgreSQL activo; ADB no detecta dispositivos. Requiere
reconectar Android y restaurar reverse43187 antes de continuar el ensayo ADMIN.
Android reconectado y autorizado; reverse43187 restaurado/verificado y API
health/ready 200. Usuario confirma carga de solicitud/estado y corrección del
encabezado tras restablecer enlace. Panel local HTTP 200. Próximo paso:
ADMIN ficticio abre solicitud para pedir información; revisión no ejecutada aún.
Usuario confirma solicitud visible en panel ADMIN local. Próximo paso: guardar
Requiere información y comprobar conservación de territorio en formulario móvil.
Usuario eligió APROBADA, no REQUIERE_INFORMACION, y confirma institución aprobada
en Android. Petición de información/restauración editable no acreditada todavía.
Defecto panel confirmado: listado/filtro quedaban Pendiente tras guardar.
Corregido: estado guardado sincroniza filtro, vuelve a Página 1, recarga listado
y ficha sin perder protección de respuestas tardías. Panel 95 pruebas aprobadas
y sintaxis 23 módulos correcta; incluye aprobar y pedir información. Confirmación
humana del ajuste pendiente; no revertir aprobación solo para repetir el guion.
Usuario confirma Aprobada en panel tras recargar. Próxima prueba: corregir ubicación
aprobada a Cesar/Valledupar, historial y reflejo móvil/directorio. Confirmación de
estado tras recarga no acredita una nueva transición visual al guardar.
Usuario confirma corrección ADMIN a Cesar/Valledupar: conserva Aprobada, ficha
abierta e historial de cambio. Reflejo móvil/directorio pendiente de confirmación.
Usuario confirma presencia móvil de institución; faltan códigos 20/20001 y
ausencia bajo Amazonas/Leticia para cerrar el reflejo territorial completo.
Desde estudiante, usuario confirma institución presente en Cesar/Valledupar y
ausente en Amazonas/Leticia, con otras instituciones visibles allí. Traslado del
listado acreditado; búsqueda vacía por nombre y códigos en ficha profesor no
confirmados. Petición de información sigue pendiente de ensayo humano.
Usuario confirma búsqueda exacta bajo Amazonas/Leticia vacía. Reflejo territorial
del directorio acreditado. Próximo paso: profesor ficticio adicional para probar
petición de información/restauración editable sin revertir aprobación existente.
Guion --review-teacher crea idempotentemente teacher-review@example.invalid solo
en sesión temporal propia validada; verifica identidad/rol si ya existe. Cuenta
creada en ensayo actual, sintaxis correcta. Usuario confirma formulario abierto
y finalización de envío de SaberPlus Ensayo Corrección con Amazonas/Leticia;
usuario confirma ADMIN guarda REQUIERE_INFORMACION, filtro/listado actualizados
inmediatamente y ficha abierta. En Android confirma formulario editable con
Amazonas/Leticia conservados. Próximo paso: corregir evidencia y reenviar; comprobar
mismo registro PENDIENTE, territorio y texto corregido en ADMIN. Misma
contraseña privada de sesión, no publicada ni impresa. Aprobación previa intacta.
Usuario confirma reenvío de evidencia corregida: una sola solicitud PENDIENTE,
evidencia nueva y Amazonas/Leticia conservados. Próximo paso: aprobación final,
actualización inmediata del panel, historial completo y estado móvil aprobado.

El harness local ahora admite por ruta explícita únicamente la migración
`20261010193000_institution_territory` pendiente. Previas se copian de HEAD;
arranque probado con `pendingTerritoryMigration:true`. Sustituye el requisito
de commit previo para este ensayo. Sin migraciones remotas, commit ni push.

### Actualización T4 — 11 de octubre

`GET /instituciones/directorio` acepta opcionalmente `departamentoCodigo` (dos
dígitos como string) y `municipioCodigo` (cinco, exige departamento). Los códigos
y pertenencia se validan contra DIVIPOLA. Inválidos/pareja incompleta devuelven
400 antes de consultar instituciones. Se combinan con nombre y APROBADA **antes**
de skip/take (20 + centinela), manteniendo orden nombre/id y `private, no-store`.

Lista/detalle exponen exclusivamente `id`, `nombre`, `ubicacion`. Esta última es
null para legado o clasificación que ya no se resuelve; si válida contiene
`departamentoCodigo`, `departamentoNombre`, `municipioCodigo`, `municipioNombre`,
`tipo`. No expone ciudad libre, código de ingreso, contactos, miembros ni evidencia.
Nacional incluye legado; filtro por códigos lo excluye sin inventar ubicación.
No migra ni modifica instituciones para buscar. Flutter conserva códigos y
rechaza resultados fuera del filtro; cambiar filtros reinicia página y aísla
respuestas tardías. T4 no modifica rankings, XP ni solicitudes de membresía.

Guion T5: `node tool/test_local_institution_directory.mjs --territory`, solo con
`SABERPLUS_LOCAL_SESSION` apuntando a sesión propia, marcador/nonce/contenedor
local validados. Crear sesión nueva; guardar antes T1/T2 porque el harness usa
migraciones de HEAD. Prepara 21 Amazonas, 2 Cesar, 1 Bogotá y 1 sin clasificar;
comprueba nacional 20/5 y Amazonas 20/1, nombre+territorio, código inválido y
privacidad. Guarda `directory-territory-evidence.json` privado de sesión.
Guion preparado/sintaxis verificada, **no ejecutado en T4**. El recorrido manual
de formularios/revisión está en `docs/PR_I5_T_TERRITORIO.md` del repo Flutter.
Siguiente T5: API/PostgreSQL propios + panel + celular, confirmar cada caso.

Validación T4: **54 pruebas dirigidas** (24 directorio + 30 catálogo),
**1.319 pruebas / 114 suites backend aprobadas**, Prisma generate y Nest build
correctos. Prettier conforme y sintaxis del guion local comprobada. Pruebas HTTP
de este bloque usan dobles de base/autenticación; no equivalen al ensayo T5 SQL.
T4 no requiere una nueva migración, pero sí la migración T2 todavía no desplegada.
Regresión Flutter T4: **769 aprobadas / 10 opt-in omitidas**, analyze limpio.
No se hicieron commits ni push; T5 y despliegue conservan sus gates separados.

### Actualización T3 — 11 de octubre

Formulario Flutter conectado al catálogo autenticado y editor ADMIN en
`admin/public/institution-territory.mjs`. Selectores dependientes, restauración
de códigos, validación de versión, reintento y descarte de respuestas tardías.
ADMIN exige ubicación para aprobar; permite corregir una aprobación existente
sin suspender. Las otras decisiones no dependen del catálogo. Conserva bloqueo
de doble envío y consulta de estado tras escritura incierta. Demo explícita de
tres departamentos, nunca fallback automático. El catálogo completo sigue en API.

Panel: **93 pruebas aprobadas**, incluidas rutas HTTP de demo, corrección con
auditoría, pareja obligatoria y controles bloqueados tras respuesta tardía;
`npm run check`: **23 módulos** correctos. Flutter: 8 pruebas territoriales/solicitud
y 8 del profesor aprobadas; regresión **765 aprobadas / 10 opt-in omitidas** y
analyze sin incidencias. Se corrigió fixture del profesor que omitía simular el
nuevo catálogo; primera regresión falló allí, repetición completa aprobada.
Evidencia completa de Flutter en su acta territorial.
Node local 24.11.1 (no acredita reproducibilidad con versión CI 24.14.1).
No se repitió PostgreSQL T2 en T3 ni se desplegó. Revisión física navegador/Android
pendiente en T5. T4 implementada posteriormente. T1–T4 sin commit/push.

### Esquema de T2

Migración aditiva `20261010193000_institution_territory`: agrega
`departamentoCodigo`, `municipioCodigo` y `territorioVersion`, todos anulables,
a `SolicitudAltaInstitucion` e `Institucion`. No completa ubicaciones por nombre,
no cambia estados, ciudad libre, historial anterior, miembros, XP ni rankings.
Los CHECK SQL exigen tupla completa o completamente nula y prefijos coherentes;
la pertenencia al catálogo oficial se comprueba en el servicio. No hay grants
nuevos. Se conserva RLS de solicitudes y restricción de lectura directa.

### Compatibilidad y significado

- La ubicación representa la sede declarada para ese registro institucional;
  no agrega sedes ni duplica instituciones. El modelo multisede y las instantáneas
  territoriales por temporada siguen pendientes para PR-I6-T.
- Ambos códigos omitidos: contrato anterior compatible, ubicación sin clasificar.
  Incluso si el texto dice Leticia no se convierte automáticamente en `91/91001`.
  Una aprobación antigua puede seguir sin ubicación: aprobación institucional
  **no equivale** a clasificación territorial.
- Ambos códigos presentes: strings exactos; municipio debe pertenecer al
  departamento. Solo el servidor asigna `territorioVersion`. No se admiten
  números, null, pareja parcial, nombres en lugar de códigos ni versión del cliente.
- En una corrección del solicitante, omitir códigos conserva la clasificación
  existente; cambiar la ciudad libre de una solicitud ya codificada exige enviar
  también una pareja válida. `ciudad` conserva el texto declarado, no es la fuente
  para filtros. Los selectores T3 muestran nombres oficiales a partir de códigos.
- La solicitud guarda la ubicación declarada sin crear institución o membresía.
  Solo ADMIN, al aprobar, la copia a `Institucion`. No se publica automáticamente
  una corrección del solicitante. Los endpoints actuales del directorio siguen
  devolvían únicamente id/nombre en T2; T4 añade ubicación pública y filtros.

### Contrato extendido, mismas rutas

`POST /instituciones/registro` y
`POST /admin/instituciones/solicitudes/:id/revision` aceptan opcionalmente:

```json
{"departamentoCodigo":"91","municipioCodigo":"91001"}
```

Se añaden a los campos ya requeridos, no los sustituyen. ADMIN puede confirmar
los códigos declarados al aprobar sin reenviarlos, o enviar otra pareja para
corregirlos. En una solicitud ya APROBADA, otra revisión con estado APROBADA
solo sirve para una **ubicación diferente**, con revisión vigente, mensaje,
nota interna y confirmación existentes. No exige suspender previamente.
Se mantiene prohibida la autorrevisión (solicitante o misma institución).
Rechazar, suspender o pedir información no acepta nuevos códigos en la revisión.

Lectura propia, listado ADMIN y detalle ADMIN incluyen los tres campos anulables.
No se añaden notas internas al contrato del profesor. El historial privado registra
actor, fecha, justificación y `ubicacionAnterior`/`ubicacionNueva`; la corrección
de una aprobada usa `accion: UBICACION_CORREGIDA`. Todos los cambios de solicitud,
historial e institución son una transacción Serializable con revisión optimista.
Una revisión vencida/concurrente devuelve 409, sin cambios parciales.

Duplicados con ubicación: compara código de municipio, no solo texto de ciudad;
también considera la ubicación aprobada vigente si la solicitud está cambiando.
El legado sin códigos mantiene el control conservador por ciudad normalizada y
ciudad vacía. La normalización de texto no resuelve ambigüedades territoriales:
ADMIN debe clasificar el legado. Una actualización de catálogo exige reconfirmar
los códigos si la versión declarada ya no coincide.

### Validación T2 y reproducción

- **66 pruebas Jest dirigidas**, 4 suites, aprobadas (incluye 7 casos DTO nuevos).
- **1.311 pruebas / 114 suites** de regresión Jest aprobadas.
- Prisma generado, compilación Nest y `tsc --noEmit` aprobados.
- **16 pruebas reales en PostgreSQL 16** aprobadas usando el ejecutor siguiente.
  Aplica 61 migraciones previas, inserta registros antiguos, aplica T2 y prueba
  preservación, persistencia/reconexión, parejas inválidas, compatibilidad,
  autorización/autorrevisión, auditoría, legado, duplicados, reactivación,
  correcciones y altas concurrentes, versión y CHECK/RLS.
- El ejecutor verificó 62 migraciones aplicadas y eliminó su contenedor/base
  temporal propios. No hubo pruebas Android, cambios en Render/Supabase ni
  ejecución de migraciones sobre bases persistentes.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npx prisma generate
npx jest --runInBand
npx nest build
node tool/test_competitive_postgres.mjs --institution-territory
```

El último comando requiere Docker local con PostgreSQL 16. No acepta una URL
externa ni lee `.env`; aplica HEAD y solo las migraciones locales explícitamente
permitidas, incluida T2. Es un modo dirigido territorial: no acredita la batería
competitiva Linux/backup completa, cuyas comprobaciones se mantienen en el modo
sin opciones. El ejecutor nativo `test_editorial_postgres --institution-approval`
también incluye T2 pendiente, pero no se ejecutó esa variante nativa en este turno.

**Despliegue futuro:** aplicar esta migración antes de arrancar el backend que
usa los campos nuevos. No copiar solo el código sin su migración/catálogo.
El harness de la prueba móvil lee migraciones de HEAD: guardar primero T1/T2
antes del siguiente ensayo móvil. No arrancarlo con un esquema generado nuevo
y migraciones antiguas. La sesión móvil previa se cerró para liberar Prisma;
sus datos/credenciales ficticios eran efímeros y no se recuperan tras la limpieza.
El siguiente ensayo requerirá sesión y credenciales nuevas.

## Fuente e integridad

- Fuente: [DANE, servicio DIVIPOLA MGN 2025](https://geoportal.dane.gov.co/mparcgis/rest/services/Divipola/Serv_DIVIPOLA_MGN_2025/MapServer).
- Capas 319 (Departamento) y 317 (Municipio), solo atributos, sin geometría.
- Copia: `src/institucion/catalogs/divipola-2025.json`; versión
  `DANE-DIVIPOLA-MGN-2025`. Fecha exacta de consulta UTC dentro del archivo.
- 33 unidades del nivel departamental (incluye Bogotá D.C.) y 1.122 unidades
  territoriales: 1.103 registros con tipo fuente `MUNICIPIO`, 18 `ÁREA NO
  MUNICIPALIZADA` y 1 `ISLA`. No describir todos como municipios ordinarios.
- Se preservan nombres, tildes, tipo y año por registro tal como los publica
  esta edición. Hay registros de 2024 y 2025 dentro del servicio MGN 2025:
  `anioFuente` no se reemplaza artificialmente por el año del servicio.
- Códigos como texto: departamento de 2 dígitos y municipio concatenado de 5.
  Antioquia `05`, Medellín `05001`, Bogotá `11/11001`, Amazonas/Leticia `91/91001`,
  Cesar/Valledupar `20/20001`, Vichada/Puerto Carreño `99/99001`.
- SHA-256 de los datos normalizados:
  `cf2c9ebc616427c0ab91a9199243368db6df473ce29d5c072b4346c5e4055c95`.
  Es control de integridad, no una firma digital del DANE.
- El importador contrasta el conteo de cada capa y rechaza respuestas truncadas,
  duplicados, códigos mal formados y relaciones padre/hijo inválidas antes de
  escribir. La aplicación vuelve a verificar la copia al iniciar.
- Nest copia el JSON a `dist/institucion/catalogs` durante la compilación. La API
  no consulta Internet al atender solicitudes ni mantiene un catálogo alterno
  inventado si falla la validación. No se toca la base de datos.

## Contrato autenticado

| Ruta GET | Respuesta |
| --- | --- |
| `/instituciones/territorio/departamentos` | Metadatos y `departamentos: [{codigo, nombre, anioFuente}]` |
| `/instituciones/territorio/departamentos/:departamentoCodigo/municipios` | Metadatos, `departamentoCodigo` y `municipios: [{codigo, departamentoCodigo, nombre, tipo, anioFuente}]` |

Metadatos: `version`, `fuente`, `consultadoEn`, `sha256`. Listas completas para
ese nivel, ordenadas por código; no paginación ni parámetros query. JWT requerido
incluso sin pertenencia institucional, igual que el directorio. Respuesta privada
sin caché. Formato incorrecto o query desconocida: 400; departamento inexistente
en esta edición: 404; sin sesión válida: 401. El código `99` **sí es válido**.

`InstitutionTerritoryService.resolveLocation` resuelve una pareja exacta y
rechaza municipios ajenos al departamento. T2 deberá usarlo al guardar/revisar;
su existencia todavía no significa que el alta actual lo utilice.

## Mantenimiento manual

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
node tool/update_divipola_catalog.mjs
npx jest --runInBand institution-territory.spec.ts institution-directory.spec.ts institution-approval.spec.ts
npx nest build
```

El importador usa una URL fija de DANE: no acepta fuentes enviadas por clientes.
No ejecutarlo automáticamente en CI, arranque o compilación. Revisar el diff,
conteos, huella, versión y cambios oficiales antes de aceptar una actualización.
Las pruebas fijan la huella de la edición auditada; no cambiarla solamente para
ponerlas en verde. Una futura edición requiere revisar importador, validación,
pruebas y política de códigos históricos; no migrar ubicaciones a ciegas.

## Validación de T1

- 59 pruebas dirigidas aprobadas: catálogo/HTTP territorial (30), directorio (16)
  y aprobación (13). JWT y base se sustituyen por dobles en los ensayos HTTP;
  Nest, validación DTO, rutas y catálogo son reales.
- `npx nest build` aprobado; carga del servicio desde `dist` confirmada, con
  33 departamentos y resolución de Leticia. Se verificó el empaquetado del JSON.
- Regresión completa `npx jest --runInBand`: **113 suites, 1.304 pruebas
  aprobadas**. Prettier conforme y sintaxis del importador verificada.
- Sin ensayo Android, migración PostgreSQL, despliegue ni modificación de
  credenciales. El catálogo aún no tiene consumidor visual.

## Siguientes entregas, sin cambiar el alcance acordado

1. **T2 — Persistencia y aprobación:** implementada y validada en el alcance
   descrito arriba. No confundir integración de servicio con UI ya disponible.
2. **T3 — Flutter y ADMIN (implementada):** selectores dependientes con estado de carga/error,
   reintento, limpieza del municipio al cambiar departamento y lectura de la
   selección guardada. Revisar/corregir desde ADMIN antes de aprobar. No GPS.
3. **T4 — Filtros del directorio (implementada):** nombre + departamento + municipio, opción
   Todos, filtro antes de paginar, reinicio de página y protección frente a
   respuestas tardías. Sin ubicación: visible en nacional, no inventar región.
   El filtro por tipo de institución sigue pendiente de su catálogo/contrato.
4. **T5 — Ensayo integrado:** PostgreSQL temporal propio + API + panel + Android,
   registrar caso por caso antes del cierre. No repetir toda la batería anterior.

Después continúan perfil institucional, solicitudes estudiantiles y PR-I6/PR-I6-T.
No se cambian XP ni insignias. El ranking territorial y la ubicación histórica
por temporada no están implementados por T1.
