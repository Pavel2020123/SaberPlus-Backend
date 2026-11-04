# Protección HTTP para redes escolares compartidas

2/nov/2026. Primer bloque del objetivo IP → LIC-1. Desarrollo y pruebas locales; no despliegue. [Problema reproducido en piloto](PILOTO_PRUEBAS_CAPACIDAD.md):1000 solicitudes/IP/15min rechazaban parte del tráfico de75 alumnos detrás de una sola salida.

## Diseño aplicado

`src/security/shared-network-limits.ts` añade dos niveles: defensa agregada por red/IP y cuota por identidad **verificada**. Un JWT debe tener firma HS256 y expiración válidas, sub UUID y cuenta todavía existente en PostgreSQL. No se usa un ID enviado por el cliente, JWT decodificado sin firma, correo ni `X-User-Id`. La identidad de cuota nunca sustituye los guards de autorización, que siguen revalidando rol/estado; no hay caché de identidad que mantenga usuarios eliminados. Error de DB durante verificación devuelve503 genérico, no una cuota independiente sin verificar.

Valores iniciales revisables, no SLA ni capacidad comercial:1000 solicitudes por usuario/15min en producción,1000 anónimas por IP/15min y20.000 agregadas por IP/15min. Se conserva `RATE_LIMIT_MAX` como fallback de la cuota de usuario; preferir `RATE_LIMIT_USER_MAX`. `RATE_LIMIT_IP_MAX` y `RATE_LIMIT_ANONYMOUS_MAX` separan los demás presupuestos. Configuración inválida no inicia silenciosamente con un límite más permisivo.

Se agregan IPv6 por /64 y se unifican direcciones IPv4 mapeadas con la IPv4 equivalente. IP desconocida usa un único bucket conservador. No saltar el límite por estáticos o porque un cliente tenga token. Los endpoints públicos sensibles no reciben cuota individual por adjuntar un JWT válido; mantienen protección específica por IP.

## Login y recuperación

Los umbrales existentes de login fallido, registro y recuperación no se aumentaron. Los limitadores sensibles también usan la clave IP normalizada. Para que `skipSuccessfulRequests` no bloquee un inicio masivo legítimo por solicitudes aún en vuelo, `boundedLoginQueue` admite como máximo4 logins activos por red y8 globales en un proceso,100 en espera por red y500 globales,10s máximo de espera. La cola va **antes** del limitador existente de10 fallos/15min en producción. Rechazo por cola llena/expirada es429 con reintento; no otorga acceso.

Los finish/close liberan cada plaza una sola vez; se deja ejecutar la devolución de cuota de login exitoso antes de admitir la siguiente petición. La cola solo controla carga y no autentica, no restablece contadores ni omite el limitador. Las solicitudes fallidas conservan el umbral original; un ataque de fallos desde la misma salida puede seguir bloqueando login de esa IP, como protección existente. No se afirma protección completa contra ataques distribuidos.

## Proxy y despliegue futuro

Se retiró la confianza por número de saltos. `TRUST_PROXY=false` usa el peer del socket. `TRUST_PROXY=true` exige `TRUST_PROXY_CIDRS` con IP/redes de proxies administrados; rechaza nombres DNS, atajos como loopback y redes universales /0. La lista la debe proporcionar quien conoce la red; no se inventaron rangos Render ni se usaron credenciales remotas. El proxy confiable debe eliminar/sobrescribir encabezados del cliente.

`render.yaml` añade la variable sin valor automático; **no desplegar sin configurar y verificar los peers reales**. Si falta, startup falla explícitamente antes de crear AppModule. No se reemplaza con `0.0.0.0/0`, ni se confía en un `X-Forwarded-For` de una conexión directa.

Fuentes primarias: [Express y proxies](https://expressjs.com/en/guide/behind-proxies/) y código instalado de express-rate-limit6.8.0, JwtModule y JwtGuard del proyecto. No se cambian dependencias ni servicios.

## Evidencia y límites

35 pruebas nuevas de configuración, cuotas, JWT válido/inválido/expirado, cuenta ausente, caída de DB, spoofing de headers, aislamiento entre usuarios, agregación IPv6, proxy explícito, cola y preservación de10 fallos aprobadas. ESLint dirigido y compilación aprobados. Repetición real del2/nov en `.tmp/ip-shared-network-verified-fresh.log`:5 escenarios completos,2222 operaciones medidas y cero fallos inesperados.75 logins simultáneos aprobados (p95:2842ms);1125 consultas de la misma IP aprobadas, cero429 (p95:453ms), frente a200 rechazos del control anterior. Un usuario con15 consultas previas obtuvo985 respuestas permitidas y15 rechazos esperados; otro usuario siguió autorizado.10 contraseñas incorrectas dieron401 y la undécima petición429.10 entregas concurrentes de5 diagnósticos conservaron75 respuestas persistidas sin duplicarlas. El recurso Storage de esta ejecución se retiró al terminar; la API base de pruebas continúa separada.

Los stores de limitación y colas siguen siendo de memoria por proceso, como el límite anterior: reiniciar los resetea y varias instancias multiplican presupuesto. No acreditar una cuota distribuida ni contratar Redis automáticamente. El worker de carga reutiliza los helpers y validación reales, pero no replica todo main.ts; faltan staging/topología real y varios procesos antes de lanzamiento. No se cambian límites de mensajes socket ni la autorización de juegos.

Continúa LIC-1 después de consolidar este bloque. El objetivo conjunto no está completado por resolver IP.
