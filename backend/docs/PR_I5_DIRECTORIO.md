# PR-I5A — Base del directorio institucional

Inicio: 10 de octubre de 2026. Entrega incremental de PR-I5, no cierre de toda
la etapa. No modifica migraciones, aprobación P4-C, códigos, XP ni rankings.

## Contrato implementado

- `GET /instituciones/directorio?q=nombre&pagina=1`: sesión JWT requerida;
  búsqueda opcional por nombre, sin distinguir mayúsculas; página de 20 elementos.
  Respuesta `{ instituciones: [{ id, nombre }], pagina, hayMas }`.
- `GET /instituciones/directorio/:id`: UUID válido; respuesta `{ id, nombre }`.
  Una institución ausente o no aprobada devuelve el mismo 404.
- Solo se consultan instituciones con `estadoVerificacion = APROBADA`.
  Legado en revisión, pendientes, rechazadas y suspendidas no son directorio.
- Acceso de lectura para cuentas autenticadas, incluso estudiantes sin institución.
  No requiere ser propietario, profesor o miembro; tampoco concede membresía.
- Selección explícita de campos: sin código, correo, contacto, solicitante,
  evidencia, notas internas, miembros, datos académicos ni plan de pago.
- `Cache-Control: private, no-store`; el detalle vuelve a comprobar aprobación.
- Paginación estable por nombre e ID; página entre 1 y 10000, consulta hasta
  120 caracteres. Se rechazan parámetros desconocidos en lugar de ignorarlos.
- Ubicación, tipo, logo y descripción pública todavía no forman parte del
  contrato. No reutilizar ciudad declarada como municipio DIVIPOLA verificado.

## Auditoría del punto de partida

P4-C ya recibe solicitudes de alta y permite revisión ADMIN. Se conserva.
Las solicitudes de `VinculoInstitucionService` y la administración actual son
docentes: no reutilizarlas convirtiendo estudiantes en profesores.
Las coincidencias del registro sirven para prevenir duplicados; no equivalen
al directorio público aprobado y mantienen su contrato independiente.

## Validación y límites

Resultado del 10 de octubre: **29 pruebas aprobadas en 2 suites** (16 del
directorio y 13 de aprobación), `tsc --noEmit` sin errores y Prettier conforme.
No se ejecutó la suite global ni una base real en esta entrega.

`institution-directory.spec.ts` ejecuta peticiones HTTP contra Nest con el guard
JWT real y dobles de Prisma/JwtService. Comprueba autenticación, validación,
paginación, proyección pública, restricción APROBADA y detalle 404.
No sustituye una prueba con PostgreSQL ni acredita despliegue o uso en Android.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npx jest --runInBand institution-directory.spec.ts institution-approval.spec.ts
npx tsc --noEmit
```

## Continuación acordada

1. Integrar listado/búsqueda/detalle mínimo en Flutter: carga, vacío, error,
   reintento y paginación; no mostrar botones de ingreso ficticios.
2. PR-I5-T: catálogo oficial versionado, departamento → municipio, validación
   servidor, revisión ADMIN y migración sin adivinar ubicación de registros viejos.
3. Perfil institucional y permisos del propietario; C5 antes de archivos reales.
4. Contrato estudiantil separado de solicitudes docentes: estados, aceptación,
   rechazo, cancelación y aviso; código privado sin reemplazar códigos de grupos.
5. Integración PostgreSQL y recorrido Android con propietario, estudiante y ADMIN.
   Documentar cada prueba. PR-I6/PR-I6-T y ranking territorial son posteriores.

No publicar, migrar ni cambiar servicios remotos por esta entrega.
