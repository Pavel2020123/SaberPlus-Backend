# C5-H — Autorización de imágenes históricas

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md).
92/92 SQL/HTTP,78 migraciones temporales y178 unitarias editoriales. Sigue preparar
H3 y sus4 guiones humanos pendientes; quedan6 entregas C5. Evidencia anterior debajo.

## Checkpoint — 23 de octubre de 2026

**Continuación24/oct: [H2B1 — Trivia/Fantasma y Tira local](C5_H2B1_TRIVIA_LOCAL.md).**
Consultar allí la evidencia vigente y la continuación H2B2/Tira online.
H2 sigue abierta; quedan3 partes de H2 y7 entregas C5 al cerrar ese incremento.

**Continuación del24/oct: [H2A validada localmente](C5_H2_SNAPSHOTS.md).**
Cima/Guardián/Rescate:68/68 SQL/HTTP,75 migraciones solo temporales,159 dirigidas
y build. Sigue H2B (otros formatos); H2 no se cierra ni cambia el total7 de C5.

**24/oct: H1 cerrada en su alcance backend local.**
Ver [código, límites, pruebas y continuación H1](C5_H1_HISTORIAL_REVOCACION.md):
58/58 PostgreSQL/HTTP con74 migraciones exclusivamente temporales en Docker;
9 suites/150 dirigidas repetidas y build correcto. Sin Android ni despliegue.
17 panel corresponde al23/oct; Chromium sí se repitió el24. Sigue H2 y luego H3;
quedan7 entregas C5, el propietario continúa y OV-1 no cambia.

### Antecedente H0 — contrato antes de implementar

**H0: contrato preparado; entonces sin implementación.** C2 conserva su
[cierre local](C5C2_CIERRE_LOCAL.md). Este bloque prepara permisos históricos
antes de PDF/offline; no cambia hoy endpoints, esquema, bytes o pantallas.
No se usaron Docker, USB, credenciales ni bases de datos para esta preparación.
El propietario retoma el trabajo; OV-1 mantiene su compañero y checkpoint.

### Decisión de producto confirmada por Pavel en este turno

> Para preguntas ya respondidas, conservar la imagen original en el historial
> propio aunque la pregunta se archive, salvo revocación por seguridad o derechos
> de uso. Pavel confirmó: «Sí, conservarla salvo revocación».

Esto aprueba esa regla de acceso, no un plazo legal de conservación, proveedor,
gasto, despliegue o migración remota. Las decisiones técnicas inferiores son
diseño para la siguiente entrega; todavía no existen en producción ni en código.

## 1. Estado real inspeccionado

| Pieza | Comportamiento verificado en código | Consecuencia |
| --- | --- | --- |
| EditorialResourceController | GET /recursos/editoriales/:id, JWT, correo verificado, PlanVigenteGuard y runtime local; sin usuario pasado al servicio | Hoy solo puede decidir por publicación, no por dueño del historial. |
| EditorialFileService.publishedContent | DISPONIBLE y algún uso publicado con padres publicados; incluye pregunta, opción, caso y lección | Si solo quedan usos archivados devuelve404 aunque exista un historial propio. |
| EditorialFileService.content | Valida estado, tamaño y SHA antes de devolver WEBP | Conservar integridad y fallo de almacenamiento; no saltarlo para servir históricos. |
| EditorialFileService.retire | Bloquea archivo y rechaza referencias incluso archivadas; marca RETIRADO antes de borrar bytes | Es limpieza normal protegida, no una revocación especial de un archivo todavía referenciado. |
| EstadoArchivoEditorial | PREPARADO, DISPONIBLE, RETIRADO | No existe estado/operación específica de revocación por seguridad/derechos. |
| PlanVigenteGuard | Comprueba sesión/cuenta existente; el estudio es gratuito con anuncios | El nombre no implica exigir suscripción Premium. No introducir un cobro nuevo para historial. |
| HistorialRespuesta | Propietario, pregunta y IDs seleccionada/correcta; no snapshot completo de medios | La prueba de propiedad existe; preservar la versión requiere validar la relación histórica exacta. |
| Edición directa de pregunta | Crea nueva pregunta/opciones y archiva la anterior | Conservar IDs originales; no seguir automáticamente a la nueva versión publicada. |
| Caso y lección | Pueden actualizarse en la misma fila si sus reglas de edición lo permiten | No afirmar que todo contexto o lección tenga snapshot inmutable por tener un ID. |
| Cuaderno de errores | Derivado del historial propio, con metadatos de nota/estado | Una nota o fila CuadernoError sola no debe conceder permisos sobre archivos. |
| Flutter AcademicImage | Ruta estable, descarga privada autenticada, autoDispose por sesión, sin caché global/disco | Intentar mantener el transporte; no resolver históricos con URLs públicas o tokens en enlaces. |

Archivos revisados en backend: schema.prisma; editorial-resource.controller.ts,
editorial-file.service.ts, editorial-file-association.ts, editorial-file.store.ts,
editorial-image-reference.ts y módulo; auth/plan-vigente.guard.ts; servicios y
controladores de simulacro/cuaderno; question-editor.service.ts y
lesson-editor.service.ts. En Flutter: core/media, academic_image.dart y modelos
de historial. No se afirma auditoría nueva de cada línea de toda la aplicación.

## 2. Reglas obligatorias del permiso

1. **Solo cuenta propia:** la identidad procede del JWT y de los permisos del
   servidor, nunca de usuarioId/correo enviado por el cliente.
2. **Una referencia no es un permiso:** conocer el UUID, pegar una ruta en notas,
   reportes o Markdown, enviar una lista desde Flutter o declarar progreso no
   autoriza a leer un archivo archivado.
3. **Versión original:** enlazar el registro confirmado y sus IDs originales.
   Editar/publicar otra versión no cambia las imágenes de una respuesta pasada.
   No reescribir respuestas, snapshots, puntuación, XP o certificados.
4. **Estado del recurso prevalece:** archivo revocado/retirado/no disponible no
   se sirve, aunque la cuenta tenga un historial válido o exista otro uso público.
5. **Publicación no equivale a pertenencia:** conservar acceso publicado actual
   como hoy; si el mismo archivo está publicado legítimamente, otra cuenta puede
   verlo por ese uso público autenticado, no por el historial ajeno.
6. **No anticipar soluciones ni preguntas futuras:** un intento que contiene un
   snapshot privado no autoriza todo su JSON. Solo referencias de la vista pública
   que el usuario ya tiene derecho a consultar en esa fase del intento.
7. **Sin prueba suficiente, denegar:** no deducir imágenes antiguas a partir de la
   versión actual ni inventar permisos retrospectivos para registros incompletos.
   El texto/resultado permanece visible según su contrato; imagen no disponible.
8. **Conservar guards e integridad:** autenticación, correo verificado, cuenta
   existente, capacidad de almacenamiento, límites y SHA siguen aplicándose.
   El rol docente/institucional no concede por sí mismo acceso al historial ajeno.

## 3. Matriz de acceso prevista (no implementada)

| Caso | Decisión |
| --- | --- |
| Archivo DISPONIBLE con uso publicado y padres publicados | Permiso existente, sin cambio. |
| Solo uso archivado, imagen original seleccionada/correcta de historial propio confirmado | Permitir una vez implementada H1 con prueba del servidor. |
| Solo uso archivado, registro perteneciente a otro alumno | Denegar. |
| Solo uso archivado y UUID/cadena local/nota/progreso declarado | Denegar. |
| Nueva versión publicada usa otra imagen | No reemplazar la original en el registro pasado. |
| Recurso original retirado o revocado | Denegar incluso con historial; no sustituir silenciosamente por otro recurso. |
| Imagen de pregunta/contexto/lección sin evidencia de versión exacta | No autorizar por asociación mutable; requiere H2. |
| Pregunta futura de snapshot privado o intento ajeno | Denegar hasta que su contrato público permita verla. |
| Mismo archivo también está publicado en otra pregunta | Puede accederse por la publicación actual; no revela registros o identidades ajenos. |
| Cuenta eliminada/token inválido/correo sin verificar | Conservar rechazo de guards; historial no los elude. |
| Archivo autorizado pero bytes ausentes/alterados | Error de disponibilidad/integridad, no permiso falso ni archivo alternativo. |

### Primer incremento H1: historial normalizado

Empezar por imágenes de las opciones seleccionada y correcta que ya aparecen en
HistorialRespuesta propio y en el cuaderno derivado. Verificar en servidor:
propietario del registro, pregunta exacta, respuesta exacta perteneciente a esa
pregunta y asociación original al archivo. No basta que alguna opción de esa
pregunta use el archivo; no ampliar la vista histórica a otras opciones ocultas.

Revisar qué orígenes escriben ese historial para no contar dos veces ni conceder
un permiso por un registro fabricado por cliente. Un metadata CuadernoError sin
HistorialRespuesta válido no es prueba. Pregunta/seleccionada/correcta de otra
sesión o alumno no se pueden mezclar.

No extrapolar este incremento a todas las imágenes de juegos, casos o lecciones.
H1 aprobada no cierra todo C5-H; H2 conserva sus propios criterios y pendientes.

## 4. Forma técnica propuesta

Mantener GET /recursos/editoriales/:id y su ruta canónica sin token ni URL firmada.
El controlador deberá pasar la identidad autenticada a una política de lectura.
La decisión propuesta es:

```text
guards y capacidad válidos
  → recurso DISPONIBLE y no revocado
  → uso publicado actual O prueba histórica propia y exacta soportada
  → leer/verificar bytes
  → WEBP privado, no-store
```

No añadir un bypass «historico=true», no aceptar usuarioId como autorización ni
recibir URLs del proveedor. Mantener por separado contenido ADMIN y contenido
del estudiante. Un ADMIN conserva sus rutas protegidas, no suplanta alumnos.

Crear una política/servicio acotado dentro del módulo editorial existente, no un
servicio genérico de descarga ni una reconstrucción de la arquitectura. Evitar
leer todos los historiales/snapshots en memoria en cada GET; usar filtros de
propietario/archivo y los índices reales. La implementación debe explicar y medir
su consulta. Si necesita índice o evidencia persistida, migración nueva; no editar
migraciones aplicadas ni prometer «sin migración» antes de ese análisis.

H2 añadirá adaptadores explícitos para tipos de intento con reglas distintas.
Los snapshots Cima/Guardián/Rescate, Trivia/Fantasma, Tira y Batallas tienen
formas/propietarios diferentes. Para cada uno revisar estado/progreso, recursos
publicables y participantes autorizados; no hacer búsqueda recursiva de cualquier
cadena parecida a una URL dentro de un JSON privado. No materializar permisos a
partir de un payload del cliente ni otorgarlos sobre preguntas futuras.

### Respuestas y privacidad

- Sin sesión/correo permitido: respuestas actuales de guards, sin saltárselos.
- ID malformado: validación existente400.
- No existe/no hay permiso/solo historial ajeno/retirado/revocado:404 estudiantil
  genérico, sin explicar cuál fue la causa ni revelar dueño, estado o licencia.
- Capacidad local deshabilitada/almacenamiento o integridad fallidos: conservar
 503 y mensaje controlado; no filtración de Prisma, rutas de disco o credenciales.
-200 con image/webp, límites e integridad actuales; private,no-store y nosniff.
  No exponer metadatos ADMIN, soluciones futuras ni tokens en cuerpos/URLs/logs.

Si conservar la ruta permite reutilizar AcademicImage sin cambios, no rehacer
todos sus consumidores. Cambiar solo el manejo accesible de imagen no disponible
que se necesite; texto/resultado siguen legibles. La caché por cuenta y cancelación
de sesión deben seguir funcionando como en C1/C2.

## 5. Revocación por seguridad o derechos

La regla de producto y el mecanismo ya están implementados/validados en
[H1](C5_H1_HISTORIAL_REVOCACION.md). La descripción inferior conserva su diseño:
estado específico REVOCADO o equivalente, distinto de RETIRADO,
con operación ADMIN explícita, motivo interno SEGURIDAD/DERECHOS, actor y fecha.
H1 materializa la revocación en su recibo propio, sin cambiar el enum de almacenamiento.

No reutilizar DELETE/retire quitando su protección de referencias. Revocar debe
permitir bloquear un recurso con usos históricos sin borrar pregunta, respuesta,
snapshot, historial o bytes como efecto secundario. El borrado físico/retención
pertenece a la política operativa, no al permiso de lectura de este incremento.

La operación propuesta usa identificador idempotente y recibo ligado al archivo,
actor y payload. Repetir exactamente no duplica auditoría; reutilizar clave con
datos distintos se rechaza. Debe coordinarse con el mismo bloqueo del archivo
que carga/asociación/retirada, para que un upload tardío no lo reactive y una
asociación nueva no confirme como disponible tras la revocación. No implementar
restauración automática; una recuperación futura requiere decisión/autorización
explícita, no reintentar la carga original para publicarlo de nuevo.

Revocación prevalece en todas las descargas nuevas, incluso si existe uso
publicado. La comprobación debe evitar servir desde una autorización cacheada
de otra cuenta o de un estado antiguo. Definir en H1 el punto de decisión frente
a revocación concurrente y probarlo; no prometer retirar bytes ya emitidos por
HTTP ni borrar remotamente una imagen ya decodificada en una pantalla.

No existe invalidación push de todas las pantallas abiertas ni borrado remoto
de PDFs/dispositivos: eso no se declara implementado aquí. Las futuras descargas
offline requieren contrato propio de revocación/retención; por eso van después.
No comunicar el motivo interno a alumnos ni publicarlo en perfiles/instituciones.

## 6. Conservación y versiones

- Conservar la asociación original mientras exista prueba histórica legítima;
  no limpiarla como huérfana por no tener una publicación activa.
- No fijar un plazo universal ni prometer conservación perpetua en este contrato.
  Antes de limpieza/borrado de cuenta se definirá retención, dependencia de usos,
  atribución, respaldo y eliminación en su bloque operativo.
- Casos/lecciones mutables necesitan evidencia de versión o snapshot preciso
  antes de autorizar la imagen antigua; una FK al estado actual no reconstruye el
  pasado. No asignar retrospectivamente la imagen nueva a un intento viejo.
- Si se materializan referencias históricas para snapshots, deben quedar
  vinculadas a fuente/propietario/archivo verificables y protegidas de cambios
  arbitrarios. La limpieza tendrá que contarlas además de los FK editoriales.
- No migrar todos los registros antiguos creando derechos por aproximación.
  Un backfill futuro debe ser determinista, auditable y fallar cerrado sin prueba.

## 7. Secuencia de entregas del bloque (plan, no pruebas ejecutadas)

| Paso | Entrega | Estado/recurso necesario |
| --- | --- | --- |
| H0 | Inventario, decisión de producto, límites y matriz de acceso | Preparado en este documento; regla confirmada. Sin Docker/USB. |
| H1 | Permiso histórico normalizado y revocación explícita/segura | Cerrada localmente el24/oct:58/58 PostgreSQL/HTTP,74 migraciones temporales,150 dirigidas y build. [Acta H1](C5_H1_HISTORIAL_REVOCACION.md). Sin Android, activación real o despliegue. |
| H2 | Evidencia/versiones y adaptadores para snapshots y otros medios históricos | [Cerrada en backend local24/oct](C5_H2B4_FUENTES_MUTABLES.md): H2A y H2B1–4,92/92 SQL/HTTP,78 migraciones temporales,178 unitarias editoriales. Denegación explícita para fuentes sin prueba; no implica versionado general de lecciones/casos. |
| H3 | Recorrido integrado Flutter/panel y cierre de este bloque | Pendiente: Docker y Android USB para permisos, versiones, revocación y aislamiento. Avisar a Pavel antes de requerirlos. |
| Después | Contrato e implementación PDF/offline | Fuera de H0; no guardar bytes privados ahora. |

H1 no se publica sin poder revocar de forma efectiva dentro de su alcance.
H2/H3 no se omiten por pasar pruebas de opciones. Mantener flags/capacidades
existentes apagados por defecto y su límite development/test; habilitación
operativa/proveedor productivo requieren otra autorización y cierre C5-D.

## 8. Matriz de validación a implementar

No es un resultado PASS: son casos obligatorios que se convertirán en tests.

### Unitarias y contratos

1. Publicado actual mantiene su comportamiento; no exige Premium nuevo.
2. Dueño de historial y versión exacta recibe permiso sobre seleccionada/correcta.
3. Otro alumno, una nota local o un UUID sin prueba no reciben permiso histórico.
4. Opción no expuesta, pregunta futura, fuente no soportada o prueba incompleta
   no amplían acceso; no se devuelven soluciones ni metadatos internos.
5. Nueva versión y bytes originales conservan sus identidades, sin cambiar XP.
6. Recurso revocado/retirado deniega tanto por publicación como por historial.
7. Retiro normal conserva protección de referencias; revocar no borra resultados.
8. Operación de revocación exacta idempotente; payload/actor ajeno no se reutiliza.
9. Errores de tipo, estado, cuenta, SHA y tamaño conservan respuestas controladas.

### PostgreSQL/HTTP con Docker, cuando H1/H2 estén implementadas

1. Dos estudiantes reales de fixture y JWT, historial propio/ajeno y correo sin verificar.
2. Responder imagen azul, editar/publicar otra versión, archivar la anterior;
   propietario sigue viendo la original, no la nueva ni datos del otro alumno.
3. Archivar padres/pregunta sin historial no concede permiso; con prueba propia
   válida sí. Compartir un archivo publicado se evalúa por publicación, no por PII.
4. Revocar con historial/publicación existentes bloquea nuevas lecturas; filas
   de resultados, archivos y puntuaciones no se eliminan ni se reescriben.
5. Asociación/carga/retirada concurrentes con revocación, acuse perdido y reintento:
   ninguna reactivación silenciosa ni doble auditoría. No falsear el orden de red.
6. Restricciones/FK/índices/migraciones nuevas completas en base propia; rollback
   de una operación fallida, reglas antiguas y lectura de recursos publicados.
7. Cada adaptador de snapshot verifica propietario/progreso y formato legado,
   deniega preguntas futuras y falla cerrado para tipos/versiones desconocidos.
8. Bytes ausentes/alterados y runtime apagado fallan sin devolver ruta de disco,
   token, licencias internas o una imagen distinta como sustituto.

### Cuatro guiones humanos propuestos para H3

1. Historial/cuaderno antes y después de edición/archivo: texto y figura originales,
   sin estiramiento, resultado conservado y sin XP adicional por consultar.
2. Cambiar cuenta/salir: sin imagen privada heredada ni acceso al historial ajeno.
3. Revocación ADMIN: al recargar/reintentar se muestra estado accesible de imagen
   no disponible, conservando textos/resultados; no prometer borrar píxeles ya vistos.
4. Error/restauración y texto grande: controles y explicación legibles, sin una
   selección/envío accidental ni necesidad de reiniciar para un fallo recuperable.

Cada guion tiene subcasos. Los números no son cantidad final de unitarias ni
aprobaciones humanas. Documentar prueba/entorno/evidencia y límites después de
cada paso; no contar omitidas como aprobadas ni repetir C2 sin regresión concreta.

## 9. Inventario histórico de pendientes al preparar H0

La representación, consulta, captura y recibo ya tienen implementación inicial en
[H1](C5_H1_HISTORIAL_REVOCACION.md). Esta lista registra el diseño previo; la
continuación vigente es H2; H1 ya pasó SQL/HTTP real en base temporal propia.

- Elegir representación de revocación, recibo/auditoría, límite de motivo y
  validación de concurrencia; migración nueva y coordinación con OV-1 si toca schema.
- Verificar que cada origen del historial provee IDs/versión confiables y que los
  FK/asociaciones no pueden mutar de una forma que cambie la imagen original.
- Determinar consulta indexada y si basta evidencia existente o hace falta
  persistir referencias; no prometer todo el histórico con una consulta aproximada.
- Definir presentación de indisponibilidad sin filtrar motivos; guardar/exportar
  bytes, restauración de revocación y retención/borrado definitivo siguen fuera.
- Probar H1 en modo local deshabilitado por defecto antes de acordar integración
  y activar capacidades. No se abre ningún proveedor externo durante el contrato.

**Acción vigente:** H2, inventario de versiones/fuentes y adaptadores con prueba exacta.
H1 pasó58/58 PostgreSQL/HTTP reales en base propia, que ya se eliminó. Su migración
no se aplicó a una base existente/remota. Avisar antes de requerir Docker/USB
para pasos posteriores; H3 mantiene el recorrido Android pendiente.

## 10. Verificación de esta entrega documental

Se revisaron código/modelos/rutas existentes y las decisiones anteriores; no
se ejecutaron los guiones de la sección8, no hay nuevos PASS de H1/H2/H3.
Se comprueban rutas de enlaces locales, documentos espejo y diff/whitespace.
Esta preparación no añade dependencias, fuentes externas, SDK, cambios de UI
ni escrituras de base de datos. Permanece junto a los remates C2 sin commit/push
nuevos; al guardar se podrán separar cierre y contrato en commits coherentes.
