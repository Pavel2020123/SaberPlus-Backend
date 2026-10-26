# C5-H2B1 — Imágenes originales de Trivia, Fantasma y Tira local

**Continuación vigente:** [H2B4 y H2 cerradas localmente](C5_H2B4_FUENTES_MUTABLES.md),
92/92 SQL/HTTP y178 unitarias editoriales. Sigue H3.
Los resultados y conteos inferiores son la evidencia histórica de H2B1.

## Alcance — 24 de octubre de 2026

Incremento backend del propietario, rama `fix/c5-c2-cierre-local` en ambos
repositorios. Continúa [H2A](C5_H2_SNAPSHOTS.md) y el
[contrato histórico](C5_HISTORICOS.md). OV-1 conserva su frente independiente.
No añade pantallas Flutter, caché privada, PDF ni acceso público a archivos.
**Implementado y validado localmente.** H2 completa sigue abierta.

## Decisiones e implementación

- Trivia Rush y Fantasma usan su `snapshotInicial` V1 y las confirmaciones
  relacionales de `TriviaRushRespuesta`. Una segunda oportunidad puede producir
  dos selecciones: contar filas no equivale a contar preguntas terminadas.
- Las nuevas partidas CPU de Tira local guardan `snapshotLocal` V1 al admitirlas.
  Hasta ahora consultaban el banco mutable. La copia conserva pregunta, caso,
  orden, opciones, solución e imágenes originales para responder y recuperar.
  Es privada: no se serializa al cliente ni revela correctas antes de responder.
- CPU admite entre4 y30 preguntas y conserva duración global600s y ronda10s,
  pausa, recuperación, puntuación y contratos existentes. No se inscribe en
  evidencia/presencia competitiva ni introduce XP competitivo.
- Partidas antiguas sin copia siguen sin ella. No hay backfill ni reconstrucción
  a partir del banco actual. Las copias desconocidas no conceden permiso.
- Adaptador `backend/src/editorial-files/editorial-trivia-access.ts`: dos
  columnas constantes, valores SQL parametrizados y consultas por propietario.
  Solo considera las imágenes que proyecta la pregunta pública: enunciado
  (caso como fallback) y opciones incluidas en su orden. No recorre JSON libre.
- Permite imagen de la pregunta actual con intento ACTIVO y plazo vigente,
  identificador/posición coherentes y anteriores cerradas; o de una pregunta
  con confirmación final propia y selección/corrección coherentes con la copia.
  Tras abandonar/expirar no abre preguntas que quedaron sin confirmar.
- Una confirmación final sin selección permite revisar la imagen expuesta
  (salto/timeout admitido por el servidor). No inventa respuesta académica ni XP.
  Una selección no final de segunda oportunidad no abre la pregunta siguiente
  ni conserva por sí sola ese permiso después del cierre.
- La conservación de referencias protege bytes aunque la lectura esté apagada
  o la referencia todavía sea futura; esa protección no concede lectura.
  Revocación por seguridad/derechos H1 sigue prevaleciendo.
- Migración aditiva `20261024180000_editorial_trivia_local_snapshots`: columna
  nullable, dos índices GIN jsonb_path_ops, validación de forma/contexto CPU e
  inmutabilidad de su copia/admisión y confirmaciones. Las confirmaciones CPU no
  se actualizan, eliminan ni trasladan a un intento legado. RLS previo se conserva.

## Activación y reproducción

`EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED=false` por defecto. Requiere
archivos habilitados y NODE_ENV development/test; production/staging no activan
esta capacidad. No se habilitó fuera de la base temporal de pruebas.

Desde `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend`:

```powershell
npm run build
npm test -- --runInBand
npm run test:editorial-files:postgres
```

El runner aplica SQL exclusivamente en PostgreSQL16 propio temporal con Docker,
loopback,512MiB y tmpfs; no lee credenciales reales ni admite una URL externa.
No ejecutar build/generate mientras el runner usa la DLL Prisma en Windows.
Los runners editorial y de ensayo humano incluyen esta migración pendiente;
el runner competitivo también la reconoce para no generar un cliente que
consulte una columna ausente. Eso no afirma haber ejecutado su suite completa.

## Evidencia de este incremento

- PostgreSQL16/HTTP: **75/75 aprobadas**,0 omitidas,98,24s en la pasada final;
  68 anteriores y7 casos H2B1 nuevos.76 migraciones aplicadas solo en el contenedor
  propio temporal. No sumar ejecuciones repetidas ni contarlas como más casos.
- Jest completo backend: **131 suites /1.735 pruebas aprobadas**,166,03s.
  Dirigido previo:14 suites/187 aprobadas; es subconjunto, no sumar al completo.
- ESLint dirigido del adaptador, su spec, runtime, servicio editorial y lector
  de snapshots: aprobado. No equivale a declarar limpio el lint de todo el repo.
- Build con Prisma aprobado antes del ensayo y repetido correctamente después
  de finalizar el runner; no se generó el cliente con su DLL en uso.
- Panel Chromium escritorio y390px aprobado dentro de las75, capturas locales
  ignoradas en `backend/.tmp/c5b-qa/run-rrpaaF`. No hubo prueba Android/USB.
- El runner confirmó la eliminación del contenedor y directorio temporal propios.
- Documentación:44 Markdown modificados/nuevos revisados,723 destinos de enlaces
  locales sin ausencias;5 actas/guías con contenido espejo exacto. Las guías
  generales backend conservan sus propias rutas y antecedentes. Diff sin errores
  de whitespace. No se verificaron enlaces externos ni anclas.
- Las pasadas iniciales detectaron contaminación entre bancos del fixture y una
  simulación que intentaba cambiar la admisión inmutable. Se aisló el área y se
  creó un fixture vencido con sus fechas coherentes desde la inserción; no se
  deshabilitó ningún trigger, constraint ni permiso para hacer pasar el ensayo.
- Las actas H1/H2A conservan sus conteos históricos. No se usaron bases existentes,
  secretos reales, despliegue, commit, push o merge en este incremento.

Los guiones añadidos comprueban cada modo, recuperación con banco archivado y
enlaces originales retirados del banco, actual/futura/ajena, caso oculto, flag,
inmutabilidad, retiro protegido, confirmación/reintento, abandono y revocación;
segunda oportunidad, CPU con cuatro preguntas, legado denegado e índices/plan SQL.
La regresión10s real comprueba además el permiso de timeout sin crear historial.

## Continuación y cantidad restante

Al cerrar H2B1 quedaban **3 partes para cerrar H2**, en este orden histórico:

1. **H2B2 — Tira online:** participante, ronda y exposición confirmada individual;
   pertenecer a una partida no autoriza todas sus imágenes.
2. **H2B3 — Batallas:** verificar la versión original y el registro por usuario,
   sin suponer que una relación a la pregunta mutable es un snapshot completo.
3. **H2B4 — Fuentes mutables:** lecciones/casos sin prueba suficiente; implementar
   el versionado necesario o documentar la denegación exacta, sin inventar pasado.

Después seguía H3 con integración visual y Android. **Entonces C5 conservaba7 entregas
abiertas:** H2, H3, PDF/offline, fotos de estudiante/profesor, evidencias privadas,
proveedor/biblioteca/cuotas/versiones/limpieza/respaldos y cierre operativo C5-D.
Son entregas, no una estimación de siete pruebas. Avisar antes de Docker/USB;
el celular no se necesita para este incremento backend.
