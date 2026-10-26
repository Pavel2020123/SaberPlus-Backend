# C5-H2B4 — Lecciones, casos y fuentes sin versión histórica verificable

## Alcance — 24 de octubre de 2026

Último incremento de H2 del propietario, rama `fix/c5-c2-cierre-local` en ambos
repositorios. [H2B3/Batallas](C5_H2B3_BATALLAS.md) conserva su evidencia anterior.
OV-1 permanece independiente. No se necesita USB en este incremento.
**H2B4 y H2 cerradas en su alcance backend local. Sigue H3.**

## Decisión: denegar sin evidencia original

H2 permitía versionar donde fuera necesario **o registrar la denegación exacta**.
Aquí se valida la segunda opción. No se crea un historial ficticio de lecciones
o casos ni se da por implementado su versionado general.

| Fuente | Qué acredita | Regla de imagen |
| --- | --- | --- |
| `Subtema` y su imagen actual | Estado vigente, no lo que vio antes un alumno | Permitir por publicación de lección y tema; archivar cualquiera elimina esa vía. |
| `ProgresoTema` completado/100% | Progreso del subtema, sin versión ni archivo original | No concede acceso histórico. Conservar progreso aunque la imagen deje de estar disponible. |
| `CasoPregunta` mutable, también asociado a una pregunta de historial | Caso actual, sin copia de su imagen al responder | Solo publicación vigente del caso y alguna pregunta con padres publicados; su FK no acredita la versión anterior. |
| `IntentoSimulacro.preguntaIds` | Preguntas asignadas, sin copia completa de sus medios | No concede imágenes históricas de lección, enunciado o caso por ese ID. |
| Markdown, texto del caso, notas del cuaderno o un JSON con una ruta | Referencia textual, sin prueba del servidor | No crea permiso. No interpretar URLs recursivas como evidencia. |
| Imagen original seleccionada/correcta capturada en H1 | Archivo/SHA y respuesta propia confirmada | Conservar permiso H1, aunque el mismo archivo también se use en una lección/caso archivado. |
| Caso dentro de un snapshot soportado | Versión original y fase/propietario verificados | Aplicar el adaptador de ese juego y su proyección pública, no el caso mutable. |
| Filas legadas de juegos retirados | No son un nuevo contrato público activo | No activar adaptadores ni módulos por encontrar una ruta en su JSON. |

No se sustituye una imagen histórica sin prueba por la nueva del banco. Si la
nueva imagen está publicada legítimamente, puede leerse por esa publicación,
pero eso no acredita que fuera la imagen antigua. El recurso antiguo no tiene
un permiso nuevo por compartir ID de lección/caso o historial de progreso.

Una imagen aún referenciada por FK editorial, incluso archivada, sigue protegida
frente al retiro normal. Un recurso sin referencia/prueba conservada se trata
según la política de archivos; no se promete retención de un pasado no capturado.
La política operativa de biblioteca/limpieza sigue pendiente en C5.

Revocación por seguridad/derechos y estado del recurso prevalecen incluso sobre
publicación o pruebas históricas válidas. Mantener JWT/guards, SHA y no-store.

## Archivos revisados y cambios

- Schema: Subtema, ProgresoTema, CasoPregunta, IntentoSimulacro, HistorialRespuesta,
  ImagenHistorialRespuesta y tabla legada IntentoEscudoConocimiento.
- `lesson-editor.service.ts`: restricciones de edición con progreso/actividades;
  guardar usa la fila de Subtema. No se flexibiliza ese bloqueo.
- `question-editor.service.ts`/`admin.service.ts`: casos y rutas editoriales;
  un registro actual no se convierte en una prueba histórica por su asociación.
- `editorial-file.service.ts`: comentario de seguridad junto a la política actual.
  No se añade una rama por progreso, casos mutables o IDs de intentos.
- `editorial-files-postgres.test.cjs`: cinco guiones nuevos de integración,
  con todos los flags históricos habilitados para comprobar que ningún adaptador
  dé un permiso por aproximación. Fixtures y perturbaciones solo en base temporal;
  no son autorización para editar lecciones con progreso en el producto.

**Sin cambio de lógica productiva, dependencias, migraciones o reglas académicas.**
No se reactivan juegos. No se añaden pantallas ni una modalidad de almacenamiento.

## Validación

- Jest editorial dirigido:11 suites /178 pruebas aprobadas.
- ESLint dirigido del servicio editorial y sintaxis del test aprobados.
- Build con Prisma repetido correctamente después de finalizar PostgreSQL.
- PostgreSQL16/HTTP: **92/92 aprobadas**,0 omitidas,101,55s.87 regresiones y5
  guiones H2B4 nuevos;78 migraciones temporales, sin migración nueva en este bloque.
- Pasó la primera ejecución completa de esta ampliación; no sumar los178 unitarios
  a los92 integrados como si fueran el mismo tipo de prueba.
- Chromium escritorio/390px aprobado dentro de las92; capturas locales ignoradas
  en `backend/.tmp/c5b-qa/run-qSdfOK`. Sin ensayo Android ni nuevo PASS humano H3.
- El runner confirmó eliminación del contenedor/directorio temporal propios.
  No se mantienen credenciales de ensayo ni se dejan servicios manuales abiertos.
- Documentación:50 Markdown modificados/nuevos,765 destinos locales sin ausencias
  y8 actas/guías espejo exactas. Diff sin errores de whitespace; no se afirma
  comprobación de anclas ni páginas externas.
- La suite completa backend de H2B3 conserva su evidencia previa:133 suites/1.755.
  No se cuenta como una repetición de este incremento solo por referenciarla.

Guiones nuevos: lección/progreso100% y reemplazo/revocación; caso/historial/IDs y
publicación de todos los padres; referencias textuales/JSON sin metadatos privados;
excepción H1 exacta para un archivo compartido; tabla legada de juego retirado.

Desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npx jest --runInBand --testPathPatterns="editorial-files"
npm run test:editorial-files:postgres
```

Docker solo para PostgreSQL16 propio temporal, loopback,512MiB y tmpfs. No usa
URL externa ni credenciales reales. No ejecutar build/generate mientras se usa
la DLL Prisma en Windows. No se probó Android ni se desplegó en producción.

## Qué sigue

Al validar estos guiones queda **H2 cerrada en su alcance backend local**:
H2A, H2B1, H2B2, H2B3 y H2B4, con denegación explícita para fuentes sin prueba.
Eso no significa que cada lección/caso tenga historial de versiones ni cierra H3.

**Sigue H3:** preparar la integración panel/Flutter y después los cuatro guiones
humanos ya propuestos en [el contrato histórico](C5_HISTORICOS.md#cuatro-guiones-humanos-propuestos-para-h3).
La pantalla administrativa completa de revocación y el comportamiento visual
deben revisarse antes de pedir el ensayo con USB. Avisar a Pavel cuando haga falta.
Los cuatro guiones siguen pendientes, sin aprobaciones humanas nuevas.

Tras cerrar H2 quedan **6 entregas C5**: H3, PDF/offline, fotos de estudiante/profesor,
evidencias privadas institucionales, proveedor/biblioteca/cuotas/versiones/limpieza/
respaldos y C5-D integrado. Mantener flags apagados por defecto, sin cambios OV-1.
No se hace commit, push, merge, habilitación productiva o migración remota aquí.
