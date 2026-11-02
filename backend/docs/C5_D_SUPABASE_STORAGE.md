# C5-D — adaptador Supabase Storage privado, desarrollo local

1/nov/2026. Proveedor confirmado expresamente por el propietario. **Incremento en desarrollo, no cierre C5-D.** Sin conexión a un proyecto Supabase real, nuevas migraciones, despliegues ni gastos.

## Implementación

`SupabaseEditorialFileStore` implementa la abstracción existente mediante REST del servidor. `editorialFileProvider` selecciona `local` por defecto o `supabase` explícitamente; selección desconocida o configuración incompleta falla sin recurrir silenciosamente al disco. El módulo mantiene el token de inyección y las rutas/DTO/permisos existentes. No se cambia el runtime: producción sigue bloqueada.

Configuración solo backend, documentada en `.env.example`:

| Variable | Uso |
| --- | --- |
| `EDITORIAL_FILE_PROVIDER` | `local` (predeterminado) o `supabase`. No activa las rutas. |
| `EDITORIAL_SUPABASE_STORAGE_URL` | Base de la API Storage, por ejemplo `https://proyecto.supabase.co/storage/v1`. En ensayos directos puede ser `http://127.0.0.1:puerto`. No admite credenciales/query/hash en URL; HTTP no loopback se rechaza. |
| `EDITORIAL_SUPABASE_BUCKET` | Identificador del bucket privado existente. El adaptador no crea ni modifica buckets. |
| `EDITORIAL_SUPABASE_SERVICE_KEY` | Clave privilegiada solo en servidor; no introducir en Flutter, panel, catálogo, manifiestos, Git, logs o enlaces. |

El bucket se consulta antes de cada operación y se exige `public === false` e identidad exacta. Las claves de objeto son `editorial/v1/<UUID-canónico>.webp`, no nombres de usuario ni rutas proporcionadas por clientes. Upload POST sin upsert; un duplicado se reconcilia comparando bytes y jamás se sobrescribe. Incluso después de upload exitoso se releen los bytes antes de confirmar persistencia.

Lecturas autenticadas, sin URL pública/firmada. Respuesta WEBP hasta2MiB, lectura streaming limitada, deadline10s y redirects rechazados para no reenviar la clave a otro origen. El servicio conserva su verificación SHA-256 y comprobación de revocación posterior a IO. Errores del proveedor se convierten en un mensaje genérico, sin devolver cuerpo, URL o clave. Borrado masivo restringido a una clave exacta; se conserva el contrato de retirada y la retención de revocados para auditoría.

## Verificación actual

- Primeras30 pruebas nuevas de contrato con doble de fetch aprobadas. Una regresión editorial del incremento pasó14 suites/222 pruebas. No son pruebas de Supabase real.
- Verificación final tras los ajustes de tipos/validación:30/30 dirigidas nuevamente aprobadas, ESLint dirigido sin incidencias y `npx nest build` aprobado (salida0). Ninguno de estos resultados acredita Storage real o Android sobre el nuevo proveedor.
- `tool/test_editorial_supabase.mjs` prepara exclusivamente PostgreSQL y Storage propios desechables, red/volumen con nonce/labels, loopback, claves aleatorias y bucket privado sintético. Es código de ensayo pendiente de ejecución real; no se atribuyen sus escenarios como aprobados.
- Imagen oficial descargada `supabase/storage-api:v1.81.0`, digest del índice `sha256:98ffec5d0678803783c30e404c27f4ec65e97efbe014088f2a86b4b8b54b9f54`. La imagen ocupa aproximadamente1,43GB según Docker. El runner no descarga imágenes por sí mismo y elimina solo recursos propios tras comprobar labels.
- Se detectó poco espacio libre en C: (aproximadamente1,4GB después de la descarga). Se pidió al propietario liberar espacio antes de continuar la batería real y nuevas compilaciones grandes. No se borraron PDFs, archivos personales ni imágenes Docker preexistentes.

## Pendiente para cumplir el objetivo

Ejecutar y ajustar contra Storage real: permisos anónimos/públicos, reintentos/concurrencia, ausencia de overwrite, persistencia/reinicio y borrado repetido. Después: conciliación/recuperación, respaldo/limpieza conservadora y recorrido integrado panel → app → PDF → caché72h/revocación con Android. Preparar entrega/operación sin activar producción. Las fotos de perfil y evidencias institucionales no se habilitan mediante rutas editoriales.

## Fuentes primarias consultadas

- [Supabase REST Storage](https://supabase.com/docs/reference/self-hosting-storage): rutas de bucket, objetos autenticados y borrado.
- [Uploads y concurrencia](https://supabase.com/docs/guides/storage/uploads/standard-uploads): duplicados y comportamiento de upsert.
- [Control de acceso](https://supabase.com/docs/guides/storage/security/access-control): RLS y claves del servidor; no conceder acceso directo a clientes.
- [Composición oficial Docker](https://github.com/supabase/supabase/blob/master/docker/docker-compose.yml): imagen versionada y configuración de Storage. No se ejecuta la pila completa ni se copian sus credenciales de ejemplo.
