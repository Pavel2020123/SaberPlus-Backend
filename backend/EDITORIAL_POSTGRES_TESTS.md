# 7F-C3-D2-F — Verificación editorial con PostgreSQL desechable

Entrega local: 8 de septiembre de 2026. Se añade un ejecutor y pruebas de los
servicios editoriales contra PostgreSQL real, no Prisma simulado. **No conecta
a Supabase, no usa la base local habitual y no despliega nada en Render.**

## Ejecutar en este equipo

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
node --test tool/test_editorial_postgres.test.mjs
npm run test:editorial:postgres
```

Requisitos: dependencias del backend instaladas, Prisma Client generado para
el código actual, Git y PostgreSQL 16 con `initdb`, `pg_ctl`, `psql`. En este equipo
se verificó PostgreSQL **16.13** en `C:\Program Files\PostgreSQL\16\bin`.
No hace falta iniciar Docker ni entregar la contraseña de PostgreSQL/Supabase.
Si los binarios están en otra carpeta, indicar `EDITORIAL_PG_BIN` con esa ruta;
esta variable elige ejecutables, **no una URL de base de datos**.

## Aislamiento

1. Crea un directorio exclusivo mediante `mkdtemp` en la carpeta temporal del
   sistema y una instancia PostgreSQL nueva. Puerto libre, escucha `127.0.0.1`,
   usuario y contraseña aleatorios de ensayo, autenticación SCRAM.
2. No lee `.env`, `.env.local` ni `.env.staging.local`. Sustituye las variables
   de conexión solo en sus procesos hijos; no cambia archivos de configuración.
3. Rechaza destinos externos, usuarios habituales, bases de trabajo, opciones
   de host escondidas y marcadores ajenos. El trabajador comprueba el destino
   contra el marcador creado por el ejecutor antes de instanciar Prisma.
4. Aplica el **SQL de las migraciones comprometidas en HEAD** a esa instancia
   vacía, en orden. No toma migraciones pendientes del directorio de trabajo.
   En la ejecución de esta entrega fueron 40; Guardián seguía sin commit y no
   se aplicó su migración. El código de servicios bajo prueba sí es el local actual.
5. Ejecuta pruebas con fixtures propios: temas, ejercicios y un usuario ficticio
   `example.invalid`. No hay estudiantes reales, correos enviados ni contenido ICFES copiado.
6. Detiene su propio clúster. Antes de eliminarlo valida ruta absoluta, directorio
   temporal padre y marcador de propiedad. Si no puede confirmar el cierre, lo
   conserva y muestra su ruta; nunca elimina datos de un servidor no verificado.

La limpieza normal elimina únicamente el directorio y los datos ficticios de esa
ejecución. Una interrupción forzada del proceso/equipo puede dejar el directorio
temporal y su servidor: revisar el caso antes de borrar o detener nada. No usar
comandos globales sobre procesos `postgres` ni sobre carpetas de PostgreSQL.

El ejecutor no usa `prisma migrate deploy`, no crea un ledger `_prisma_migrations`
y no verifica el historial de migraciones de staging. Comprueba la aplicación
del SQL versionado desde cero y las consultas de los servicios. Esa distinción
es importante: no es autorización para desplegar migraciones sobre otra base.

## Qué se comprueba

- Dos creaciones simultáneas de un mismo nombre académico: solo una se guarda.
- Dos guardados CLOZE con la misma revisión: uno se guarda y el otro recibe 409.
- Retiro CLOZE: `datosInteractivo` queda SQL NULL, no JSON null.
- Bloqueo real por área: se observa `pg_stat_activity.wait_event = advisory`,
  y se verifica que el escritor relee el padre después de liberarse el bloqueo.
- Indexación concurrente: solo un envío procesa el lote, sin avanzar a otro
  lote silenciosamente. Conserva `fechaActualizacion` hasta los microsegundos.
- Agregación de duplicados y cursor de coincidencias ejecutados por PostgreSQL.
- Rollback real: un trigger de prueba fuerza el fallo en la segunda actualización;
  también se revierte la huella de la primera pregunta. El trigger se retira.
- Reclasificación concurrente, conservación de opciones/IDs/estado y revisión vieja.
- Consultas JSON de diagnósticos terminados y simulacros vencidos: bloquean mover
  preguntas con uso, incluso sin respuestas calificadas.
- Publicación CLOZE desde revisión y conservación de fecha al archivar/volver
  a borrador: no permite editar como nuevo el historial publicado.
- Gates apagados: las tres escrituras protegidas rechazan la operación sin cambios.
- Consulta opcional de Guardián: prueba su filtro JSON con una tabla mínima de
  ensayo que se crea y retira solo en la instancia desechable. **No es prueba
  del módulo Guardián ni de su migración completa.** Si esa migración se incorpora
  a HEAD, adaptar el fixture; el test falla explícitamente en vez de tocar sus datos.

Las pruebas Node de seguridad del ejecutor no abren ninguna conexión.
La suite PostgreSQL usa los servicios TypeScript mediante `ts-node`, clientes
Prisma reales y dos conexiones independientes. No usa HTTP ni simula permisos ADMIN.

## Límites y estado de la etapa

Resultado inicial D2-F: **10 pruebas PostgreSQL**, **11 pruebas de seguridad del
ejecutor** y **605 pruebas generales en 63 suites** aprobadas. La suite general
se ejecutó con detección de recursos abiertos. Ambas instancias temporales usadas
durante el desarrollo se detuvieron y eliminaron correctamente al terminar.

Las banderas se habilitan únicamente dentro del proceso de pruebas, sobre la
instancia desechable. No se habilitaron las banderas del backend de trabajo.
Se utiliza el administrador del clúster de ensayo: no se verifican aquí RLS,
roles mínimos, pooler, red, CORS o límites propios de Supabase/Render.

La parte PostgreSQL local de **D2-F** queda verificable y reproducible. D2 aún
necesita revisión visual/accesibilidad del panel y decisiones/operación autorizada
del legado. La herramienta de navegador no pudo iniciarse en esta sesión; no
se afirma una comprobación visual. Después sigue **D3: ensayo editorial real**
con cuenta ADMIN, respaldo y entorno expresamente autorizado.

No cambió la lógica productiva de Nest ni Flutter, no se modificaron archivos
de Guardián y no hacen falta audios ni credenciales para repetir estas pruebas.
