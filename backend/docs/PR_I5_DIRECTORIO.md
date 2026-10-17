# PR-I5A — Base del directorio institucional

**17 de octubre, continuación vigente:** T5/C1/C2/C3 probadas localmente y
[C4-C cubierto con evidencia mixta](PR_I5_C4_CODIGO.md). Sigue consolidación integrada
institucional, no despliegue. El próximo T5 indicado debajo es histórico del11.

Continuación del 11 de octubre: [PR-I5-T1/T2/T3/T4](PR_I5_T_TERRITORIO.md)
implementadas. Próximo bloque T5 ensayo conjunto. El contrato actual añade
ubicación pública opcional y filtros territoriales; la evidencia inferior es PR-I5A/B.
No cambia el contrato del directorio descrito en esta acta.

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
No se ejecutó la suite global ni una base real en la implementación inicial PR-I5A.

Ensayo posterior del 10 de octubre: `tool/test_local_institution_directory.mjs`
aprobado contra AppModule/PostgreSQL de la sesión temporal propia (61 migraciones).
25 instituciones sintéticas APROBADA y4 ocultas: páginas20/5, búsqueda, vacío,
proyección pública, detalle oculto404, parámetros inválidos400 y anónimo401.
Fixture SQL directa: no acredita la revisión ADMIN. Cliente Flutter implementado
PR-I5B; suite762/10 opt-in y analyze limpios. APK instalada con Success; usuario
confirma login, primera pantalla, búsqueda única/vacío y Página2 con cinco
instituciones21–25 y detalle informativo de ensayo01 en Android. Usuario confirma
error/Reintentar tras retirar reverse43187 (API PC HTTP200) y recuperación del
listado tras restaurarlo. Ensayo01 suspendida en la base propia; helper confirma
detalle404, búsqueda0 y24 aprobadas restantes. Usuario confirma ficha no disponible
y ausencia de ensayo01 en el listado/búsqueda. PR-I5A/B aprobada localmente en este
alcance; no acredita P4-C/P5, grupos, iOS ni despliegue remoto.
Ejecutar el script con `SABERPLUS_LOCAL_SESSION` apuntando a SU sesión; valida
loopback/owner y etiqueta del contenedor. `--suspend` suspende solo ensayo01 de
esa sesión, para comprobar ficha y recarga en Android tras aprobación humana.

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

1. Listado/búsqueda/detalle mínimo Flutter PR-I5B implementado y aprobado en
   Android/API/PostgreSQL local: carga, vacío, error, reintento y paginación.
2. PR-I5-T: catálogo oficial versionado, departamento → municipio, validación
   servidor, revisión ADMIN y migración sin adivinar ubicación de registros viejos.
3. Perfil institucional y permisos del propietario; C5 antes de archivos reales.
4. Contrato estudiantil separado de solicitudes docentes: estados, aceptación,
   rechazo, cancelación y aviso; código privado sin reemplazar códigos de grupos.
5. Integración PostgreSQL y recorrido Android con propietario, estudiante y ADMIN.
   Documentar cada prueba. PR-I6/PR-I6-T y ranking territorial son posteriores.

No publicar, migrar ni cambiar servicios remotos por esta entrega.
