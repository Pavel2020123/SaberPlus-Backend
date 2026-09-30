# MA-3B — Agenda de repaso diferido

> Documento de entrega MA-3B y contrato v1. Conciliación del 29 de septiembre
> de 2026: MA-3C ya implementa agenda, flashcards y ciclo de sincronización en
> Flutter. Las instrucciones futuras de este documento conservan contexto
> histórico; no definen la siguiente etapa global. Falta ensayo real de red,
> reinstalación y persistencia; no se acredita despliegue. Consultar la Ruta
> vigente del equipo en Flutter (`docs/ETAPAS_PENDIENTES.md`).

Implementada y probada localmente. No desplegada, no migrada en Supabase.
La pantalla y conexión a botones de flashcards corresponden a MA-3C.

## Contrato v1

JWT + correo verificado, usuario derivado exclusivamente de la sesión. Sin plan
de pago requerido. No concede XP, dominio, certificados ni evidencia independiente.

- `GET /repasos-diferidos/me`: `{version:1, contenidoVersion:"library-v1", agenda:[]}`.
  Cada fila: `tarjetaId`, `contenidoVersion`, `paso` (0–4), `revision`,
  `revisadoEn` y `venceEn` ISO UTC. Solo registros propios de tarjetas vigentes.
- `POST /repasos-diferidos/me/eventos`: `{version:1, eventoId:"UUID-v4",
  tarjetaId:"ID-del-registro", contenidoVersion:"library-v1", revision:0,
  resultado:"remembered"}`. Alternativa: `needsPractice`. Campos extra prohibidos.
- Respuesta: `{version:1, eventoId, estado:"scheduled"|"tooEarly", agenda:{...}}`.
  No enviar usuario, fechas ni intervalo desde el cliente.

IDs permitidos: registro congelado de 130 flashcards de
`saber_plus/assets/data/reference_library.json`, generado con el algoritmo actual
de IDs Flutter (minúsculas; secuencias no ASCII alfanuméricas a guion). El registro
solo contiene IDs, no respuestas ni datos personales. `library-v1` es una versión
inmutable: al editar contenido habrá que versionar registro y cliente, migrar la
clave local y definir si empieza agenda nueva. No reasignar un ID a otra tarjeta.
No reutilizar automáticamente contadores históricos de `FlashcardProgress`.

## Tiempo e idempotencia

1/3/7/14/30 días de 24 horas. Inicio y fallo pendiente: un día. Acierto de
autoevaluación pendiente: avanzar un paso hasta 30. Antes del vencimiento:
`tooEarly`, no modificar agenda. Retraso: solo un paso, no recuperar aciertos ficticios.

La fecha efectiva es `clock_timestamp()` de PostgreSQL al confirmar el evento,
no la hora del dispositivo. Offline se guarda una predicción local, NO un hecho
confirmado. Una tarjeta admite un evento pendiente local; no puede fabricar varios
intervalos offline. Al sincronizar se recalcula con el reloj del servidor. Esto
no verifica retención en el momento exacto del vencimiento: es autoevaluación,
no prueba académica ni puntuación. MA-3C debe explicarlo sin prometer lo contrario.

Transacción + lock por cuenta + revisión optimista. Recibo único por cuenta/UUID
y SHA-256 del cuerpo normalizado. Reenvío idéntico devuelve el recibo original;
mismo ID con otro cuerpo: 409. Recibo buscado antes de revisión/límite/retiro.
Revisión desactualizada: 409, no se escribe evento ni se aplica parcialmente.
500 eventos nuevos por cuenta/24 horas, 429 después; reintentos conocidos no
consumen otro cupo. Los recibos no se purgan sin diseñar antes retención compatible
con reintentos. Límite y retención son operativos, no restricciones de contenido.

400 DTO inválido; 401/403 sesión/permisos; 409 conflicto; 410 tarjeta retirada o
desconocida; 429 esperar. Flutter conserva errores inciertos para reenviar el mismo
ID/cuerpo. No asignar UUID nuevo tras timeout. No rebasar revisiones automáticamente.

## Persistencia y pruebas

Migración `20260927180000_deferred_review`: agenda por usuario/versión/tarjeta y
recibos por usuario/evento; FK con borrado de cuenta, CHECK de intervalos y revisión,
RLS activada, sin permisos para PUBLIC/anon/authenticated. Acceso por backend.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run build
npm test -- --runInBand deferred-review
npx --no-install eslint "src/deferred-review/*.ts" --max-warnings=0
node tool/test_editorial_postgres.mjs --deferred-review
```

El runner usa PostgreSQL temporal loopback; migraciones de HEAD + únicamente la
nueva migración local si falta en HEAD. No lee `.env` ni modifica bases existentes.
Resultado: 10 pruebas Jest y 5 PostgreSQL, incluyendo HTTP, DTO, permisos, conflictos,
concurrencia, aislamiento e RLS. La aplicación en Supabase requiere autorización
y respaldo cuando se retome P5/D3; no ejecutar `migrate deploy` por esta entrega.

Flutter: esquema local 10, agenda confirmada/provisional y evento durable juntos;
reintentos inmutables, descarte explícito de bloqueados y restauración de confirmados
tras reinstalar. Eventos que nunca salieron del equipo no se recuperan al desinstalar.
Integrar ciclo de sincronización/acciones y estados de UI en MA-3C, no arrancar un
segundo sistema de notificaciones.
