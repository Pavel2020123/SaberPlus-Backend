# P4-C — Aprobación de instituciones

Entrega local del 17 de septiembre de 2026. **No desplegada ni migrada en Supabase.**
P5 probará el recorrido real; conectar esta bandeja no cierra el ensayo editorial D3.

## Flujo

1. Profesor con correo personal verificado envía nombre, ciudad, contacto,
   correo institucional, referencia HTTPS opcional y explicación de su autorización.
   Acepta una declaración explícita. Su correo verificado no prueba su representación.
2. Se guarda `SolicitudAltaInstitucion`, no una institución ni privilegios.
3. ADMIN abre **Instituciones** en el panel, filtra solicitudes y consulta evidencia.
   Debe verificar el establecimiento y autorización por una fuente independiente.
   La app no verifica automáticamente que el colegio exista.
4. ADMIN selecciona decisión, respuesta visible, nota privada de comprobaciones y
   confirma. Puede aprobar, pedir información o rechazar; posteriormente suspender
   y reactivar. No puede revisar su propia solicitud ni su institución vinculada.
5. Aprobar crea institución gratuita y membresía propietaria dentro de una única
   transacción. El profesor actualiza su estado y vuelve al espacio institucional.
6. Rechazo/información permiten corregir usando la revisión actual. Las notas
   internas nunca forman parte de la respuesta al profesor.

## Contrato y seguridad

- `GET /instituciones/registro/me`: estado, evidencia autorizada y posibilidad de editar.
- `GET /instituciones/registro/coincidencias?nombre=...`: máximo diez nombres/ciudades;
  nunca códigos, correos o identidades. Si ya existe, solicitar invitación.
- `POST /instituciones/registro`: revisión 0 para primera solicitud; revisión actual
  para corregir. Identidad/estado/institución no se aceptan del cliente.
- `GET /admin/instituciones/solicitudes?estado=...&pagina=1`: ADMIN, páginas de 20.
- `GET /admin/instituciones/solicitudes/:id`: detalle y auditoría privada.
- `POST /admin/instituciones/solicitudes/:id/revision`: revisión, decisión, mensaje,
  notaInterna y confirmado=true. Guarda actor, fecha y anteriores envíos/decisiones.
- `POST /instituciones` y `POST /admin/instituciones-desde-lead`: retirados (410).
- Control central de institución operativa en controladores de grupos, miembros,
  estadísticas, prioridades, evidencia, exportaciones y gestión de anuncios;
  controles sobre institución destino al solicitar/aceptar una vinculación.
- Se releen los permisos desde la cuenta y la base; no basta un JWT viejo ni el UI.
  Suspensión bloquea nuevas peticiones institucionales sin borrar cuentas/historial.
  El estudio individual y su tiempo propio no quedan bloqueados.
- Transacciones Serializable, revisión optimista y bloqueo por nombre normalizado
  impiden dobles aprobaciones. Conflictos requieren consultar de nuevo, no reenviar
  a ciegas. Nombre/ciudad normalizados ayudan con duplicados, no sustituyen revisión
  humana de sedes, abreviaturas o nombres parecidos.
- Nombre de institución verificada no se cambia libremente desde ajustes; solicitar
  revisión al equipo. Baja institucional con historial tampoco borra datos en cascada.
- Evidencia de texto y referencias se muestran como texto, no HTML, sin descargas
  automáticas del servidor. Referencias con credenciales no se aceptan.
- Panel conserva sesión solo en memoria, elimina evidencia al salir y descarta
  respuestas tardías. No guarda credenciales ni notas en localStorage.

## Evidencia, transición y límites

No hay adjuntos en esta entrega. Si una referencia/contacto no basta, ADMIN pide
información; no se solicitan cédulas ni datos de alumnos. Cartas/PDF privados,
política de retención y acceso temporal se coordinarán con 7F-C5 antes de habilitarlos.
La interfaz permite indicar cómo contactar al solicitante; no inventa un número de
soporte. No hay correo/push automático: el resultado se consulta al actualizar.

La migración `20260917130000_institution_approval` añade solicitudes para colegios
existentes y los marca **LEGADO_EN_REVISION**, no aprobados. Reciben **30 días desde
la aplicación de la migración**; después dejan de estar operativos si no se aprueban.
La app muestra el aviso y la fecha límite en verificación. No se eliminan datos.
Antes de migrar, inventariar propietarios, comunicar el plazo y organizar revisión
ADMIN. Si no hay propietario, resolver el caso manualmente con autorización; no
asignar propiedad a quien simplemente conozca el nombre del colegio.

La demo web y la demo Flutter son independientes, en memoria y sin Supabase.
No se simula una aprobación remota entre ambas. La demo Flutter queda pendiente;
la web ofrece una solicitud ficticia para recorrer la moderación.

## Verificación local

Resultado del 17 de septiembre: **782 pruebas Jest**, **11 pruebas PostgreSQL
temporal** y **65 del panel**, todas aprobadas. Compilación backend y sintaxis de
16 módulos del panel correctas. Flutter: 502 aprobadas, 4 remotas omitidas y análisis
sin avisos. Son comprobaciones del árbol local, no de un checkout sin Guardián.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm run build
npm test -- --runInBand
node tool/test_editorial_postgres.mjs --institution-approval
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\admin"
npm run check
npm test
npm run demo
```

El ejecutor PostgreSQL crea y elimina solo su propia instancia temporal loopback;
no lee `.env`, no utiliza bases existentes y no aplica migraciones locales ajenas.
Cubre aprobación concurrente, rollback, duplicados, privacidad, legado y persistencia.
No confundir estas pruebas con el despliegue ni un ensayo real de login/dispositivos.
La revisión visual en navegador quedó pendiente por herramientas no disponibles.

## Antes de desplegar

1. Revisar Git: existe una dependencia **previa** de Guardián. HEAD ya contiene
   `Usuario.intentosGuardian`, pero el modelo `IntentoGuardian` seguía sin commit.
   También estaban pendientes su migración, módulo y comprobador. P4-C los conserva
   sin modificarlos. No desplegar un checkout que omita el modelo referenciado:
   revisar y guardar el trabajo de Guardián por separado antes del push/despliegue.
   La compilación local usa el árbol de trabajo, no certifica un checkout incompleto.
2. Confirmar URL exacta, base de ensayo, backup y migraciones pendientes. No ejecutar
   `prisma migrate deploy` a ciegas: también aplicaría otras migraciones pendientes.
3. Acordar el plazo de transición antes de aplicar la migración y desplegar API,
   panel y app compatibles. No desplegar cliente contra API sin estos endpoints.
4. Preparar ADMIN y profesor con credenciales privadas, configurar origen CORS del
   panel y ensayar permisos, rechazo/corrección/aprobación/suspensión desde navegador
   y Android. Registrar la prueba iOS o la limitación. Luego cerrar P5, no D3.
