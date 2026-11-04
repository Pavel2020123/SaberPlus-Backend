# LIC-3 — Portal institucional y estados de la app

## Estado vigente · 3 de noviembre de 2026

Implementación y verificación **locales** completadas sobre LIC-0/LIC-1/LIC-2.
Este documento sustituye las notas parciales de LIC-3. No equivale a despliegue,
publicación Android, migraciones remotas ni integración de ramas. Los cambios
permanecen sin commit en `feat/lic3-institution-portal` y, en Flutter,
`feat/lic3-institution-app`; existen modificaciones anteriores ajenas a esta etapa.

Portal: `http://127.0.0.1:4173/institucion`; API local: `http://127.0.0.1:43187`.
Los ensayos usan bases y cuentas sintéticas desechables, no datos de clientes.

## Entrega y contratos

### Portal institucional

`admin/public/institution.html`, `institution.css`, `institution-app.mjs`,
`institution-groups.mjs` e `institution-learning.mjs` reutilizan el servidor web,
CatalogApi y la autenticación existentes. No se incorporó framework, dependencia,
segundo login backend ni almacenamiento persistente de tokens en navegador.
La entrada editorial `/` continúa siendo exclusiva de ADMIN; ser propietario
no convierte a nadie en ADMIN de SaberPlus. `/cuentas` conserva la utilidad LIC-2.

- Vista general con institución, rol, licencia, grupos autorizados y cupos
  contratados. Los cupos contratados no se presentan como ocupación medida.
- Propietario/administrador institucional: crear grupos de décimo/once, renombrar,
  asignar docentes existentes e invitar una cuenta personal docente. La invitación
  se registra; no se afirma que se haya enviado un correo o creado un buzón.
- Docente: solo grupos y estudiantes asignados. No puede crear/renombrar grupos,
  asignar responsables ni consultar la administración general. Retirar su cupo
  invalida el acceso aunque queden filas históricas de membresía/asignación.
- Seguimiento con búsqueda/paginación, diagnóstico inicial separado de simulacros
  y evidencia por temas. Sin intentos/evidencia no significa cero rendimiento ni
  falencia confirmada. No se exponen claves o identificadores de preguntas del diagnóstico.
- Prioridades por grupo, catálogo publicado y filtro por área, tema completo o
  subtema, plazo explícito Colombia UTC−5, cumplimiento paginado y retirada.
  La meta sigue siendo cinco preguntas distintas; completarla no acredita dominio.
- Cuentas LIC-2 incrustadas con la misma sesión: alta/CSV, temporales y reset por
  ámbito existente. Confirma al salir si se perderá una entrega de claves visible.
- Actualizar estado consulta backend: vencimiento conserva historial autorizado,
  deshabilita nuevas gestiones y no cierra sesión por un 403 institucional. Una
  renovación confirmada vuelve a habilitar formularios. Un 401 sí cierra sesión.

Los permisos no dependen de ocultar botones: los servicios revalidan identidad,
institución, rol, grupo y cupo. Crear, renombrar y asignar grupo usan transacción,
bloqueo compartido de institución y auditoría. No se agregó eliminación de cuentas
o grupos, reasignación destructiva ni un CRUD de LIC-4.

### Regla de prioridades aprobada por el usuario

Una cuenta gestionada recibe prioridades sin fingir aceptación personal cuando
el servidor confirma origen gestionado del mismo colegio, cupo ESTUDIANTE activo
y pertenencia al grupo. Prisma, SQL de conteo y revalidación aplican la misma regla.
Una aceptación antigua no elude una retirada. Las cuentas personales siguen
requiriendo aceptación explícita. El ensayo real recorre importación LIC-2,
prioridad, cinco respuestas únicas y exclusión tras retirar el cupo.

### Flutter

Contrato y archivos detallados en el repositorio Flutter,
`docs/LIC_3_ACCESO_INSTITUCIONAL.md`.

- `UserSession` conserva usuario institucional separado del correo real, sin
  inventar correo verificado. Login, recuperación y cambio obligatorio explican
  alias sin buzón y consumo de la temporal en el primer inicio correcto.
- `/auth/perfil.accesoInstitucional` presenta versión, institución, origen,
  estado, asignación, permisos, fechas y validación del servidor. No incluye
  contratos completos, otros alumnos o secretos. Es una fotografía de presentación,
  no un permiso offline. Estados/orígenes/versiones incoherentes se rechazan.
- Inicio del estudiante/docente y Practicar muestran programada, activa, vencida,
  suspendida o sin cupo, fechas Colombia y última validación. Actualizar y reanudar
  consultan backend; prevalece la lectura más reciente. Un fallo conserva el estado
  anterior e informa, sin extender permisos offline ni restaurar una sesión cerrada.
- El router no se reconstruye por actualizar licencia. No se reinician respuestas,
  historial o borradores por ese cambio; una entrega denegada por licencia conserva
  respuestas/borrador. No se promete modificar todos los casos históricos de error
  de red ajenos a este alcance.
- Backend sigue autorizando inicios y entregas. Diagnóstico/simulacro comenzado
  con cobertura activa respeta plazo original con tope de 24h tras vencimiento;
  suspensión o retirada no conceden esa gracia. No se decide por reloj del equipo.
- Reportar preguntas sin correo requiere alias, origen gestionado y acceso activo
  en la presentación; backend vuelve a validar antes de escribir.

## Diseño y experiencia

Se aplicó UI/UX Pro Max: jerarquía clara, navy/turquesa de SaberPlus, tokens
semánticos, tarjetas redondeadas, etiquetas visibles, foco y navegación por teclado,
controles táctiles, estados de carga/error/vacío y respeto de reduced-motion.
Python/python3/py no estaban disponibles para el buscador de la skill; se usaron
sus guías locales leídas, sin instalar Python ni inventar resultados de búsqueda.

Navegación lateral en escritorio y compacta en móvil. Sin gráficas decorativas,
cifras ficticias, fuentes externas ni secretos en URL/localStorage/sessionStorage.
Contraste calculado en navegador para texto normal/botón (≥4.5:1), borde de campo
(≥3:1) y foco visible. Formularios conservan campos ante errores; confirmación al
descartar borradores. No hay reintentos automáticos de escritura: UUID estable en
prioridades y revisión explícita de resultados inciertos en grupos.
Generaciones de navegación/sesión descartan respuestas tardías; logout limpia
referencias, credenciales visibles y contenido privado.

Capturas locales inspeccionadas: `.tmp/lic3-login-desktop.png`,
`lic3-overview-desktop.png`, `lic3-overview-mobile.png`, `lic3-tracking-mobile.png`
y `lic3-priority-mobile.png`. Son fixtures sintéticos, no capturas de Android.

## Auditoría de aceptación y evidencia

| Requisito | Evidencia inspeccionada |
| --- | --- |
| Misma identidad/API; cuentas LIC-2 reutilizadas | CatalogApi, shell, pruebas del panel y login/cuentas HTTP+navegador reales |
| Propietario/docente, grupos y aislamiento | `institucion-acceso`, `grupo`, tests unitarios y `lic3_groups_browser_assertions.mjs`: creación, renombrado, asignación, invitación; docente sin gestión, evidencia ajena 404 y cupo retirado 403 |
| Seguimiento, diagnóstico y prioridades reales | `analitica-detallada`, `teacher-priorities`, pruebas de componentes y SQL/HTTP/navegador; diagnóstico separado, ausencia de promedio no convertida en cero |
| Vigencia, renovación, historial y errores | Ensayo real de periodo vencido, lecturas históricas 200, escritura 403, refresh solo lectura y renovación; tests de 403/401 y respuestas tardías |
| Flutter: identidad, estados, historial/intentos | Parseo/roundtrip, revalidación concurrente/logout, router estable, rechazo por licencia conservando borrador; SQL/HTTP LIC-1 de gracia/entrega |
| Interfaz accesible y adaptable | Navegador Edge 1440/375/390px, teclado/skip-link/foco, contraste, reduced-motion, sin overflow; widget tests claro/oscuro 375px y texto 2.5 |
| Respeto de arquitectura y límites | Extensión de servidor/CatalogApi/servicios/router existentes; sin dependencias nuevas de LIC-3 ni migración propia; solo recursos locales etiquetados y limpieza por propietario |

Resultados finales, sin sumar baterías solapadas:

- Backend: **152 suites, 2069 pruebas aprobadas**,
  `.tmp/lic3-final-backend-regression.log`. Build aprobado en
  `.tmp/lic3-group-diagnostic-build.log`; ESLint dirigido a fuentes modificadas
  de LIC-3 aprobado. No implica que el ESLint histórico global esté resuelto.
- Panel: **165 pruebas aprobadas**, `npm test`; `npm run check`: **34 módulos**.
  Repetidas tras el formateo final de archivos nuevos el 3/nov.
- Flutter: **1201 aprobadas y 16 omitidas por entorno**,
  `.tmp/lic3-flutter-full-regression.log`; después del último ajuste de texto,
  **11 pruebas de tarjeta** aprobadas en `.tmp/lic3-final-card-tests.log`.
  Análisis global sin incidencias: `.tmp/lic3-final-app-analysis.log`.
- Integración PostgreSQL/HTTP/Edge:
  `.tmp/lic3-final-completion-browser.log`, termina en retirada de recursos propios
  después de aprobar LIC-1/2, grupos/roles, seguimiento/prioridades, vigencia,
  almacenamiento vacío/logout y prioridades gestionadas con SQL real.
  El indicador `fullLic3Complete:false` del runner significa que esa batería
  aislada no certifica Flutter/documentación; el cierre usa la matriz completa.

Comandos para reproducir (requieren entorno local preparado, Docker y Edge):

```powershell
# backend/
npm run build
npm test -- --runInBand
node tool/lic1_postgres_local.mjs
# admin/
npm run check
npm test
# repositorio Flutter
C:\flutter_sdk\bin\flutter.bat analyze
C:\flutter_sdk\bin\flutter.bat test
```

Tras `npm run build`, el runner integrado usa los servicios compilados reales y crea PostgreSQL desechable
etiquetado con nonce, perfiles propios de navegador y fixtures propios. Solo
limpia esos recursos; no debe dirigirse a bases reales. El runner histórico de
PostgreSQL nativo no arrancó por ausencia de `initdb.exe`; no se afirma que pasara.
La evidencia SQL procede del runner Docker, no de ese comando fallido.

## Límites de validación y siguiente etapa

Hot reload solicitado con DTD conectado pero sin app activa: **no se certifica
Android físico**. El previewer Flutter offline no arrancó porque falta
`webview_flutter_web` en caché; no se descargaron paquetes ni alteraron dependencias
para forzarlo. Las previews puras anotadas quedan disponibles en entorno preparado.
Los widget tests y la inspección web no se presentan como validación nativa visual.

No se desplegó, migró remoto, gastó, hizo push/merge ni borraron datos reales.
Sin LIC-4, supresión de cuentas, billing, transferencia de progreso o dominios y
buzones reales. El siguiente trabajo debe acordarse por separado; no activar
producción ni presentar esta entrega local como comercial ya publicada.

## Arranque local de demostración

Con Docker activo, en `backend/`:

```powershell
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL='true'
$env:SABERPLUS_C5_HISTORY_IMAGES_LOCAL='true'
$env:SABERPLUS_C5_PRIVATE_OFFLINE_LOCAL='true'
node tool/local_ranking_validation.mjs
```

En `admin/`, otra terminal:

```powershell
$env:API_BASE_URL='http://127.0.0.1:43187'
$env:ADMIN_PORT='4173'
node server.mjs
```

Esperar `local-ranking-ready`. El servicio es temporal; no confundir las cuentas
sintéticas del runner integrado (ya retiradas) con credenciales permanentes para
este portal. Para entrar se necesita una cuenta local autorizada de propietario
o docente. No imprimir tokens, hashes, owner.json o contraseñas en documentación.
