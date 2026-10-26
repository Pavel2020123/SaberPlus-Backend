# C5-H2B3 — Copias originales e imágenes de Batallas

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md).
92/92 SQL/HTTP y178 unitarias editoriales. Sigue H3; las cifras inferiores son antecedentes.

## Alcance — 24 de octubre de 2026

Propietario en `fix/c5-c2-cierre-local`, después de
[H2B2/Tira online](C5_H2B2_TIRA_ONLINE.md). OV-1 conserva su frente independiente.
No se necesita celular en este incremento backend. H3 conserva el recorrido
visual integrado posterior; no hay entrega productiva ni migración remota.
**H2B3 implementada y validada localmente. H2 completa sigue abierta.**

## Hallazgo y cambio

Batallas guardaba pregunta/orden/opciones asignadas, pero leía texto, contexto,
imágenes y correcta desde el banco mutable. Una FK no prueba su versión original.
Las nuevas asignaciones guardan `BatallaPregunta.snapshotInicial` V1 privado;
crear, recuperar y corregir usan esa copia. No se rellena el pasado: asignaciones
antiguas conservan null y su contrato previo, sin permisos históricos nuevos.

Se mantienen los tres modos existentes, tamaños de partida, orden de respuestas,
vidas, tiempos, XP, emparejamiento, invitaciones y contratos públicos. No se
reactivan juegos retirados ni se añaden modos. La copia privada no se serializa.
Las correctas/explicaciones siguen ocultas antes del cierre según el contrato
anterior; no se cambia el array de preguntas que ya devuelve la API.

## Autorización y conservación

- `editorial-battle-access.ts`: SQL parametrizado por usuario real del JWT,
  participante/asiento y asignación original. Permite la pregunta actual con
  batalla ACTIVA, plazo vigente e inicio propio confirmado, una vez cerradas
  las anteriores; o una respuesta propia confirmada/coherente con su copia.
- No basta formar parte de la batalla, recibir las rutas del array o que el rival
  avance. Futuras, usuario ajeno, profesor sin participación, antes de iniciar,
  versión desconocida o legado sin copia no reciben permisos adicionales.
- Se reconocen enunciado, opciones de su orden y caso únicamente como fallback
  cuando el enunciado no tiene imagen, igual que la proyección pública existente.
  No se buscan URLs recursivamente en metadatos, notas o soluciones.
- Las confirmaciones y copias nuevas son inmutables; no se trasladan ni se
  completan retrospectivamente. Las referencias conservan bytes aunque la lectura
  esté apagada, la pregunta sea futura o el encuentro ya haya terminado.
- El trigger H1 captura imágenes seleccionada/correcta desde esta copia solo si
  coincide una respuesta de Batallas confirmada del mismo usuario/sesión/pregunta.
  No captura una imagen reemplazada en el banco después de crear la batalla.
  Los demás orígenes y el legado conservan la rama H1 anterior.
- Historial y cuaderno consultan las copias en lote, enlazando cada fila propia
  con su respuesta de Batallas confirmada; conservan enunciado, explicación y
  texto/imagen de opciones. Tema/subtema, dificultad y metadatos de caso mantienen
  su contrato actual: no se declara versionado general de esas tablas mutables.
- Revocación H1 por seguridad/derechos prevalece, conserva resultados/recibos y
  deniega bytes. Se mantienen JWT/guards, SHA y WEBP privado/no-store.

## Archivos y migración

- `backend/src/batallas/batalla.snapshot.ts`: construcción y lectura del formato.
- `backend/src/batallas/batallas.service.ts`: admisión, lectura y corrección original.
- `backend/src/editorial-files/editorial-battle-access.ts` y su spec: política exacta.
- Runtime/servicio editorial: flag y acceso/retención; `.env.example` documenta
  `EDITORIAL_BATTLE_SNAPSHOT_IMAGES_LOCAL_ENABLED=false` por defecto, solo habilitable
  con archivos activos y NODE_ENV development/test.
- `20261024220000_editorial_battle_snapshots`: columna nullable, índice GIN,
  validación e inmutabilidad y extensión del trigger H1. Protege con RLS y revoca
  acceso directo PUBLIC/anon/authenticated a Batalla, asignaciones, participantes
  y respuestas. Nest mantiene acceso mediante su rol de servidor autorizado.
  La supresión de una batalla padre conserva la semántica FK/cascade; impedir
  reescribir una copia no introduce una prohibición general de eliminar cuentas.
  No se ejecutó un recorrido completo de eliminación de cuentas en este incremento.
- Runners temporales editorial, ensayo humano y competitivo reconocen esta
  migración y sus dependencias locales explícitas. No se afirma ejecución de
  todas las suites independientes por actualizar sus listas.

Aplicar la cadena local completa antes de arrancar la versión nueva del backend;
el flag controla lectura histórica, no evita que Prisma necesite la columna.
No contratar almacenamiento ni ejecutar SQL sobre Supabase/Render por este acta.

## Validación del incremento

Jest dirigido:17 suites /215 aprobadas. Build y ESLint dirigido aprobados tras
corregir la inferencia del tipo de la proyección; sin afirmar lint global limpio.
- Build final con Prisma repetido correctamente después de terminar PostgreSQL
  y Jest; no se regeneró la DLL mientras los ensayos la usaban.
- PostgreSQL16/HTTP: **87/87 aprobadas**,0 omitidas,118,28s;80 regresiones y7
  guiones H2B3 nuevos.78 migraciones exclusivamente en la base propia temporal.
- Jest completo: **133 suites /1.755 pruebas aprobadas**,94,42s. Las215 dirigidas
  son un subconjunto: no sumar los conteos ni las pasadas repetidas.
- Chromium escritorio/390px aprobado dentro de las87; capturas ignoradas en
  `backend/.tmp/c5b-qa/run-XyynIW`. No hubo Android/USB ni nuevas pruebas manuales.
- Primera pasada86:85 aprobadas y un caso de historial con su flag H1 apagado;
  se activó para ese ensayo y se amplió la comprobación a texto y cuaderno.
  Después de reiniciar Docker, otra preparación detectó el postmaster provisional
  de initdb. El runner espera ahora TCP127.0.0.1 para excluir ese servidor interno;
  no se relajaron constraints/permisos ni se apuntó a bases existentes.
- La pasada final confirmó limpieza del contenedor/directorio propios. Sin
  commit, push, merge, despliegue ni SQL remoto; flags apagados por defecto.
- Documentación:48 Markdown modificados/nuevos,752 destinos de enlaces locales
  sin ausencias y7 actas/guías espejo exactas. Diff sin errores de whitespace;
  no se afirma validación de anclas o páginas externas.

Los guiones verifican cada modo, inicio/avance propio, imágenes futuras y ajenas,
flag, retiro protegido, recuperación, inmutabilidad, respuesta duplicada,
edición posterior de texto/imagen/correcta, captura H1, historial y cuaderno HTTP, cierre,
revocación, fallback, legado, índice, ACL y RLS. No son ensayos manuales Android.

Reproducción desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
npx jest --runInBand --testPathPatterns="editorial-files|batallas|trivia-rush|simulacro.service.spec|cuaderno-errores.service.spec|public-answer-option.spec"
npm run test:editorial-files:postgres
```

El runner usa exclusivamente PostgreSQL16 propio temporal en Docker, loopback,
512MiB y tmpfs; credenciales efímeras y eliminación del entorno al terminar.
No ejecutar build/generate mientras esté usando Prisma en Windows.

## Continuación

Al cerrar H2B3 quedaba **1 parte para cerrar H2: H2B4 — fuentes mutables**,
lecciones/casos sin evidencia original suficiente. Versionar lo necesario o
registrar la denegación exacta; no inventar pasado ni deducir permiso de progreso.
Después sigue H3 con integración visual y Android, avisando antes de necesitar USB.

**Entonces C5 conservaba7 entregas abiertas:** H2, H3, PDF/offline, fotos de estudiante/profesor,
evidencias institucionales privadas, proveedor/biblioteca/cuotas/versiones/limpieza/
respaldos y C5-D. Son entregas, no siete pruebas. Sin commit/push/merge/despliegue.
