# LIC-0 — Contrato funcional de licencias institucionales

Confirmación posterior del propietario, 2/nov: horario Colombia, meses calendario con ajuste al último día cuando no exista el día original; primera entrega con renovaciones completas, sin reducción automática de cupos. Para diagnóstico/simulacro iniciado con cobertura activa, conservar el vencimiento original con máximo de24 horas después del fin de licencia; si no tenía plazo, usar ese máximo. El límite es exclusivo: al alcanzarlo ya no se entrega. No iniciar intentos nuevos ni dar gracia por suspensión o revocación. Estas decisiones actualizan los pendientes históricos inferiores. La implementación y sus pruebas locales se registran en [LIC-1](LIC_1_NUCLEO_VIGENCIA.md); este contrato funcional no acredita despliegue ni una licencia real.

2 de noviembre de 2026. Decisiones del propietario recogidas en conversación, después del cierre local editorial C5-D. Diseño previo a implementación: no acredita API, web, migraciones, cobros ni despliegue. Actualiza las decisiones de producto de #14 sin modificar el PR histórico. Fuente vigente de LIC-0; precios y aspectos marcados pendientes no están aprobados.

## 1. Producto y titularidad

La licencia pertenece a la institución. Una persona ejerce como propietario/coordinador, con transferencia administrativa controlada sin perder grupos, cuentas ni resultados. No conceder rol global ADMIN al propietario institucional. SaberPlus confirma externamente el pago y registra activación, cupos, fechas y referencia administrativa; registrar un acuerdo no constituye integración de pagos.

Periodos previstos: 6, 12, 18 y 24 meses desde una fecha acordada, no necesariamente el año escolar. Precios y tamaños de paquetes pendientes: 75 estudiantes/3 docentes y los importes conversados son ejemplos, no tarifas. El propietario institucional es independiente del cupo docente. Incluye áreas, juegos y cuadernillos; material resuelto y claves bajo control docente, con publicación posterior para estudiantes. No implica integrar automáticamente el proyecto independiente de cuadernillos.

Compra individual mensual, Google Play Billing, becas con anuncios y traslado de progreso son entregas separadas. No reintroducir Wompi/ePayco ni diseñar cobro automático institucional en este bloque.

## 2. Identidad y vinculación

Separar identidad, origen de cuenta, pertenencia institucional, grupo/asignación docente y derecho de acceso. No deducir el origen solo de `institucionId` ni convertir una cuenta personal en propiedad del colegio.

| Origen | Durante licencia | Salida y vencimiento |
| --- | --- | --- |
| Personal previa, vinculada mediante aceptación del estudiante | Consume cupo; cobertura institucional sustituye temporalmente la necesidad de pagar acceso individual. | No se retira por sí misma durante vigencia; propietario gestiona desvinculación. Al vencer puede desvincularse y volver a modalidad personal. Días individuales pagados restantes se conservan para reanudación al terminar la cobertura. |
| Gestionada, creada por la institución | Consume cupo; sin búsqueda/unión libre a instituciones ni compra mensual propia. | No se transforma sola en personal ni se traslada por autoservicio. Desactivar vínculo libera cupo pero no borra resultados. Tras vencimiento solo consulta histórica permitida. |

Traslado académico de gestionada a personal: fase posterior aprobada como idea, con código temporal y verificación de ambas cuentas. No copiar notas internas, asignaciones, licencias ni datos de otros alumnos; reglas exactas y prevención de duplicación pendientes antes de implementarlo.

Los días personales preservados son derecho de acceso interno: no prometen pausar el cobro o renovar/cancelar automáticamente una suscripción de Google Play. Billing deberá definir el manejo comercial y evitar mensajes engañosos antes de ofrecer esa combinación.

Decisión confirmada el 2/nov/2026: el saldo personal permanece pausado hasta volver a modalidad personal, no comienza a correr al vencer la licencia. La conservación se registra una sola vez al aceptar la vinculación; renovar o consultar historial no lo consume. La reanudación requiere que ya no exista vinculación institucional activa, membresía ni origen gestionado. Este núcleo no implementa la pantalla ni el procedimiento de desvinculación o traslado de progreso (LIC-4).

## 3. Identificador institucional y correo

Confirmación LIC-2 del propietario, 2/nov/2026: usuario institucional completo globalmente único (no código+usuario). Altas/importación exclusivamente por propietario y SaberPlus ADMIN; docente limitado al reset de sus estudiantes gestionados asignados. Quedan resueltos esos pendientes históricos. Implementación en curso: [LIC-2](LIC_2_CUENTAS_GESTIONADAS.md), sin disponibilidad productiva aún.

El propietario quiere identificadores como `juanito@ispecan.com`, con nombre institucional configurable. **Son usuarios de acceso, no buzones creados ni dominios de correo verificados**. Mostrar “Usuario institucional”; no “correo verificado”. No enviar confirmaciones, recuperación, notificaciones o recibos a estas cadenas ficticias. Correo real opcional del estudiante y contacto real verificado del responsable van separados.

Decisión aprobada: el colegio solicita el sufijo y SaberPlus lo aprueba antes de habilitarlo, comprobando duplicados y confusión con otras instituciones. La forma visual no otorga propiedad sobre cuentas personales ni sobre dominios externos. Reservar un espacio de nombres por institución y tratar el sufijo como alias, sin apropiarse de correos personales. Definir antes de LIC-2 si el login usa código de institución + usuario o alias global único. No permitir duplicados ambiguos ni acreditar dominios reales de terceros por escribir su nombre.

Compatibilidad actual: login valida `correo` como email y busca identidad única; el importador existente usa nombre/correo/contraseña. No introducir correos inventados en esos campos para eludir el cambio de modelo. Reutilizar importador y autenticación con evolución aditiva y compatibilidad explícita.

## 4. Credenciales y recuperación

SaberPlus ADMIN puede crear cuentas y auxiliar a la institución. Propietario puede crear/importar cuentas gestionadas y asignar docentes; el proceso principal lo realiza la institución desde una web con instrucciones y previsualización.

Decisión aprobada: docente puede restablecer la contraseña de cuentas gestionadas de estudiantes bajo su grupo/responsabilidad; no de otra institución, propietario ni docente. Las cuentas personales vinculadas conservan recuperación mediante su canal personal: ni docente ni propietario institucional pueden restablecer su contraseña personal.

Generar contraseña temporal aleatoria, entregarla una sola vez y exigir cambio al primer ingreso. Guardar hash, nunca texto recuperable; no exponer contraseñas nuevas al docente/propietario. Restablecer invalida sesiones y credenciales temporales previas. No incluir secretos en logs/auditoría ni permitir suplantación desde el panel. Registrar quién hizo el reset, a quién y cuándo, con límites de intentos y controles de ámbito. Las cuentas gestionadas sin correo real recuperan acceso mediante docente/propietario autorizado, no por un buzón ficticio.

## 5. Cupos, grupos y vigencia

Se cuentan estudiantes con asignación activa, no toda fila histórica de Usuario. Desactivar a un estudiante libera un cupo reutilizable y conserva historial. Docentes cuentan por separado; un propietario aparte. Reasignar debe ser atómico y auditable, sin doble consumo al repetir solicitudes o confirmar un CSV de nuevo. Dos altas concurrentes en el último cupo no pueden aprobarse ambas.

Cada grupo tiene un docente responsable; el propietario puede cambiarlo. Los docentes solo consultan estudiantes/grupos asignados. El propietario consulta el conjunto institucional. No se fija límite arbitrario de alumnos por docente ni se implementa asignación aleatoria sin acordar su criterio.

Estados funcionales propuestos: PROGRAMADA antes del inicio, ACTIVA dentro del periodo, VENCIDA al finalizar y SUSPENDIDA por acción administrativa. La cuenta y sus datos no se borran al vencer. El backend es autoridad temporal; JWT vigente no sustituye el derecho vigente. Límites temporales recomendados: inicio inclusivo y final exclusivo, almacenados como instantes UTC y mostrados en zona del acuerdo. Zona y cómputo de meses requieren especificación antes de LIC-1.

Renovación aprobada: si se acuerda antes del vencimiento, el nuevo periodo comienza al finalizar el actual, sin perder los días restantes. Si ya venció, comienza en una nueva fecha acordada; no se cobra ni habilita retroactivamente el intervalo sin cobertura por defecto.

Fechas acordadas y sus cambios quedan auditados. No extender desde el dispositivo ni reutilizar recibos antiguos para revivir cobertura. Al renovar no duplicar cupos, grupos ni progreso. Renovación parcial, reducción de cupos y contratos superpuestos quedan pendientes antes de LIC-1.

## 6. Matriz mínima de capacidades

| Capacidad | ADMIN SaberPlus | Propietario institucional | Docente asignado | Estudiante |
| --- | --- | --- | --- | --- |
| Registrar/activar/cambiar licencia | Sí, auditable | Consultar; solicitar cambio | No | No |
| Gestionar docentes y grupos | Soporte autorizado | Sí, solo su institución | Consultar asignación | No |
| Crear/importar alumnos | Soporte autorizado | Sí, sujeto a cupos | Permiso de altas por confirmar | No |
| Ver resultados | Ámbito autorizado | Su institución | Su asignación | Los propios |
| Reset de cuenta gestionada | Ámbito autorizado | Su institución | Solo estudiantes asignados | Cambiar la propia / solicitar recuperación |
| Consultar al vencer | Soporte | Historial de su ámbito | Historial de su ámbito | Historial propio |
| Iniciar práctica institucional al vencer | No concede excepción | No | No | No |

Permitir autenticación, cambio obligatorio de clave, recuperación, perfil, logout, consulta histórica y renovación según actor sin reabrir prácticas. Bloquear contenido educativo nuevo, intentos/juegos nuevos y uso de licencia vencida; definir aparte intento en curso y publicación de material después del vencimiento. No bloquear toda la cuenta de forma que impida recuperar acceso.

Revocación o suspensión confirmada bloquean derechos privados; no garantizan borrar PDF exportado. Integrar licencia con caché privada72h sin ampliar su plazo. Pendiente técnico LIC-1: limitar el permiso offline también al vencimiento conocido de la licencia; el modo avión no debe extender un contrato vencido. Los PDF exportados conservan su política separada.

## 7. Casos de aceptación antes de SQL

1. Contrato programado no habilita práctica antes del inicio; inicio/fin se evalúan en servidor y límite exacto.
2. Vencimiento conserva racha/resultados como datos y permite consulta; no promete mantener racha activa sin actividad ni concede prácticas nuevas.
3. Liberar/reasignar cupo conserva historial, no cambia identidad y resiste repetición/concurrencia.
4. CSV con errores se previsualiza antes de confirmar; reintento no duplica cuentas ni plazas. Excel nativo no se asume soportado por el importador CSV actual.
5. Cuenta personal solo se vincula con aceptación; no se apropia por coincidencia de correo. Días restantes se conservan una sola vez.
6. Gestionada no compra acceso propio ni se desvincula sola; personal puede recuperar independencia tras vencimiento.
7. Reset de docente fuera de grupo o institución se deniega; temporal es de un uso, obliga cambio y revoca sesiones anteriores.
8. Identificador ficticio no recibe correo ni acredita dominio real; colisiones se detectan antes del alta.
9. Propietario sustituye docente sin perder grupo ni habilitar acceso al anterior.
10. API aplica matriz de ámbito/licencia en rutas y sesiones abiertas, no solo botones/login. Histórico no filtra contenido nuevo.
11. Restablecer bytes, reinstalar app o cambiar reloj no reactivan licencia ni amplían caché privada.

## 8. Entregas y estado

- LIC-0: acuerdos principales aprobados, incluidas aprobación del sufijo, recuperación personal independiente y continuidad de renovación. Antes de cerrar el contrato técnico LIC-1 siguen pendientes zona/cómputo temporal, reducción/renovación parcial, superposición de contratos e intentos en curso; antes de LIC-2, resolución inequívoca del login y permisos docentes de altas. No inferir aprobación de estas decisiones a partir de los tres acuerdos.
- LIC-1: contratos/cupos/periodos y evaluación de derechos; pruebas de aislamiento, límites y concurrencia antes de rutas educativas.
- LIC-2: identificadores, importación guiada y credenciales; reutilizar código existente, no simular correo real.
- LIC-3: web institucional/docente y estados Flutter; mismo backend e identidad. Aplicar skill de UI/UX revisada como ayuda, no imponer framework nuevo.
- LIC-4: bajas y retención; desactivación distinta de eliminación definitiva. Supresión exige mapa de dependencias y política aprobada; no `usuario.delete` indiscriminado.
- Posteriores: traslado de progreso, billing individual, becas/anuncios, competencias y preparación productiva.

No se ejecutaron migraciones, no se usaron secretos remotos y no se cambió lógica por este documento.
