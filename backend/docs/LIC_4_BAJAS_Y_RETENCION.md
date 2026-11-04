# LIC-4 — Bajas, retorno personal y retención

**Fuente vigente:** [estado y verificación LIC-4](LIC_4_ESTADO_ACTUAL.md).
Los incrementos inferiores se conservan como antecedentes de implementación;
no representan el inventario de pendientes actual.

3/nov/2026. Objetivo activo, diseño e inventario inicial. No implementación
terminada, supresión realizada, despliegue ni migración remota.
Rama backend: `feat/lic4-institution-lifecycle`, conservando cambios anteriores.

## Contrato confirmado

- Suspender, retirar cupo, desvincular y suprimir son operaciones distintas.
- Retirar cupo conserva identidad y resultados; no borra al usuario.
- La cuenta personal vinculada no pasa a ser propiedad del colegio. Puede volver
  a modalidad personal tras vencer; propietario gestiona su salida durante vigencia.
- Cuenta gestionada no se transforma sola en personal ni se desvincula por sí misma.
- Saldo personal pausado hasta retorno legítimo, reanudado una sola vez. No se
  promete pausar cobros Google Play. Sin traslado de progreso entre identidades.
- Suprimir exige política aprobada y mapa de dependencias, no usuario.delete genérico.

## Inventario inicial inspeccionado

[Mapa de dependencias y rutas](LIC_4_MAPA_DEPENDENCIAS.md): relaciones directas,
cascadas, restricciones y datos indirectos pendientes de contrastar con SQL.

| Componente | Estado y riesgo que debe cubrir LIC-4 |
| --- | --- |
| `LicenciaInstitucionalService.retirar` | Núcleo LIC-1 de revocación/cupo; reutilizar bloqueos, auditoría e idempotencia, no duplicarlo |
| `SaldoPersonalInstitucionalService.reanudarSiPersonal` | Bloquea usuario, consulta reloj SQL y revalida ausencia de institución, membresía, origen gestionado y asignación activa; aún necesita flujo legítimo de salida |
| `AdministracionInstitucionService.retirarMiembro` | En institución controlada delega retirada al núcleo; no equivale a desvinculación completa o supresión |
| `InstitucionService.eliminarMiInstitucion` | Ruta heredada: rechaza instituciones con solicitud de alta, pero conserva rama antigua que desvincula usuarios y elimina institución; auditar autorización y fronteras antes de exponer bajas |
| `GrupoService` | Borrar relaciones de grupo no significa borrar cuenta o liberar cupo; mantener conceptos separados |
| Prisma | Relaciones de usuario, grupos, origen gestionado, saldo, licencias, respuestas, intentos y auditoría necesitan mapa completo antes de supresión |

## Decisiones aprobadas · 3/nov/2026

El usuario respondió «1si,2si,3si»:

1. Cuenta gestionada retirada conserva acceso a su historial, sin prácticas nuevas.
2. Supresión definitiva solo por SaberPlus ADMIN mediante solicitud revisada;
   el colegio solo retira/desactiva, no elimina definitivamente.
3. Conservación sin borrado automático por ahora. No se inventa un plazo de purga.

Esto no autoriza borrar datos reales ni destruir partidas/resultados compartidos.
La revisión de supresión debe determinar dependencias y tratamiento de cada caso;
no se aprobó traslado de progreso.

Confirmación adicional: borrar identidad, credenciales y progreso individual del
titular en la supresión definitiva revisada; conservar resultados compartidos y
auditorías sin nombre, correo ni alias. La baja normal conserva los datos.

## Incremento implementado, cierre todavía pendiente

- Retorno personal transaccional con versión de asignación, recibo idempotente,
  limpieza de pertenencia (no cuenta/resultados) y reanudación exacta de saldo.
  Salida propia tras un vencimiento y sin cobertura activa (una renovación futura
  no extiende la cobertura del intervalo descubierto); propietario/ADMIN
  pueden desvincular personal, nunca transformar gestionadas o retirar propietario.
- El recibo conserva intervalo de vinculación para no revivir intentos retirados
  al limpiar la FK institucional. Borrador/historial no se destruyen.
- Rutas antiguas de delete directo de usuario/institución bloqueadas; falta
  implementar el procedimiento revisado de supresión, no simularlo como terminado.
- Vista de bajas de propietario en desarrollo, con retiro de cupo separado de
  retorno personal, confirmación, paginación y sin reintentos automáticos.
- Primera batería SQL/HTTP/Edge: `.tmp/lic4-first-sql-http-browser.log`, LIC-4
  verifica saldo exacto, historial, replay y salida propia vencida; regresión LIC-1/2/3
  aprobada y recursos propios retirados. 11 unitarias dirigidas de retorno/plazos
  y 2 de protección de rutas aprobadas; no constituyen cobertura final de LIC-4.
- `npm run build` encontró DLL Prisma ocupada por API local; sin cambios de esquema
  se compiló con `npx nest build`, aprobado. No se mataron procesos ajenos ni se
  borró caché para sortearlo. Repetir generación cuando se agregue el esquema de solicitudes.

### Preparación de supresión revisada

Modelo y migración aditivos en desarrollo para solicitudes explícitas y marca de
identidad suprimida. Mantener una referencia técnica anónima evita cascadas sobre
partidas compartidas; no permite recuperar identidad, claves o progreso borrado.
El trigger propuesto impide reactivar esa referencia mediante actualizaciones
genéricas. Pendientes servicio, revisión ADMIN, ejecución transaccional, aislamiento,
pruebas y contraste de datos indirectos; no se presenta como función terminada.

Para regenerar Prisma se detuvo únicamente el runner local desechable validado
por marker/label; esto retira sus cuentas de demostración temporales. No afecta
datos reales ni documentos. Al remontar se necesitarán nuevas credenciales demo.

## Secuencia de trabajo

1. Resolver decisiones pendientes y mapa de dependencias/roles/operaciones.
2. Salida personal y reanudación atómicas, sin liberar identidad gestionada.
3. Bajas seguras por ámbito y protección de rutas heredadas; replays y concurrencia.
4. Retención/supresión conforme a política aprobada y solo fixtures desechables.
5. Portal/app con explicación y confirmación clara; UI/UX Pro Max si hay interfaces.
6. Pruebas unitarias, SQL/HTTP/navegador propios, Flutter si cambia; documentación
   y auditoría final de aceptación. No declarar completado por cerrar solo un subbloque.

## Incremento de revisión/ejecución en desarrollo

`SupresionCuentaController` y servicio: solicitar, listar por ámbito, revisión
ADMIN con huella del impacto, rechazo y ejecución explícita. Solicitar/revisar
no retira cupos ni borra datos. Propietario solo solicita para gestionadas de su
colegio; las personales solicitan su propia supresión. ADMIN revalida su rol.

Ejecución apagada por defecto (`ACCOUNT_SUPPRESSION_ENABLED=false`), requiere
frase `SUPRIMIR CUENTA`, versión y huella de revisión actual. Una transacción
marca solicitud, borra material individual, redacta identidad en registros
compartidos y deja una referencia técnica sin login; no elimina partidas ajenas.
Si falla, se revierte el conjunto. Esto aún necesita las pruebas descritas abajo.

Puertas de seguridad: no ADMIN/propietario en ejercicio, transferencia previa de
responsabilidad de archivos editoriales, sustitución de un canal institucional
que todavía sea el correo personal del titular y cierre/liquidación de partidas
compartidas. No se fuerza su eliminación para evitar esos controles.

La migración adicional de ámbito revisado conserva los cuerpos de los triggers
existentes y añade una excepción de DELETE solo para datos privados del titular
de una solicitud EJECUTADA por ADMIN dentro de esa transacción. La excepción de
UPDATE compartido solo admite la redacción calculada, sin cambiar puntajes,
secuencias o resultados. No habilita alterar evidencia por un flag arbitrario.
Triggers de escritura privada serializan con Usuario y deniegan reconstruir
progreso cuando una petición autenticada antes termina después de la supresión.

Las dos migraciones LIC-4 son aditivas y solo se aplican en runners locales
propios. No se ejecutó migración remota ni se habilitó eliminación productiva.
Pendientes: contrastar toda la ejecución con SQL real, API, UI y casos de carrera;
integración Flutter de retorno/solicitudes y auditoría global antes del cierre.

### Verificación incremental local · 3/nov/2026

- Regresión Jest: 154 suites y 2082 pruebas aprobadas
  (`.tmp/lic4-backend-full-regression.log`). No acredita Flutter ni despliegue.
- La corrida SQL actual de 85 migraciones superó revisión/supresión, preservación
  de contraparte y resultado compartido, bloqueo de reactivación/escritura tardía
  y retorno personal con saldo exacto (`.tmp/lic4-privacy-browser-full.log`).
  HTTP/navegador todavía en ejecución: no se declara cierre integral.
- Se corrigió la fixture LIC-1 para vincular explícitamente al propietario con su
  institución: una membresía residual no sustituye el vínculo vigente requerido.
- Se añadió una aserción de dos ejecuciones simultáneas de supresión; pendiente
  ejecutar esa revisión de la prueba, sin atribuirle el resultado previo.

Actualización posterior: `.tmp/lic4-concurrent-suppression-regression.log` terminó
con limpieza de recursos propios y controles SQL/HTTP/navegador aprobados. En la
carrera solo una ejecución modifica datos; la otra puede recibir conflicto 409
por cambio de vinculación o recibo repetido. Tras observar el estado confirmado,
repetir el comando devuelve recibo sin nueva mutación. No se exige ocultar un
conflicto concurrente legítimo como éxito.

Flutter: rama `feat/lic4-institution-lifecycle`, repositorio Dio existente,
retorno personal desde aviso institucional y solicitudes propias desde Más y
cabecera docente. El envío solicita revisión, no ejecuta supresión. Confirmación
explícita, ámbito de sesión, motivo conservado ante error y envío incierto sin
reintento automático. Las 14 pruebas iniciales de modelos/interacciones pasaron;
regresión completa iniciada, todavía sin cierre. DTD conecta pero no tiene app
en ejecución: hot reload intentado sin validación nativa ni afirmación de Android.
