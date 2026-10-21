# C5-C2-D — Ensayo local de imágenes en opciones

## Checkpoint — 21 de octubre de 2026

**Nuevo responsable de C2:** otro compañero sustituye al propietario, sin tocar
el frente OV-1. Seguir [relevo completo](RELEVO_C5_C2.md): usuarios/clave temporal,
Docker/USB, auditoría, pruebas paso a paso y cambios permitidos Flutter/API/panel.
La tabla inferior conserva0/8; D8 se desglosa en D8a–e, todos pendientes.

**Preparación lista; 0/8 bloques humanos confirmados.** La evidencia automática
de [C2-C](C5C2C_CONSUMIDORES.md) no sustituye este recorrido Android.
Se inició PostgreSQL16 propio en Docker,70 migraciones, API AppModule en
127.0.0.1:43187 y panel real local en127.0.0.1:4173. Son servicios temporales:
verificar disponibilidad al retomar, no asumir que siguen activos.

Se compiló una APK debug nueva con los cuatro defines públicos de desarrollo,
sin contraseñas integradas. Al preparar este checkpoint, adb no detectaba
ningún dispositivo; no se afirma instalación ni ejecución física de esta APK.
La compilación advierte compatibilidad futura de KGP/flutter_timezone;
no se cambiaron dependencias para silenciarla.

### Preparación del relevo (no cuenta como prueba humana)

El propietario delegó C2 a otro compañero, distinto del responsable de OV-1.
Se preparó la guía operativa completa y se repitió análisis Flutter sin incidencias,
49 tests dirigidos Flutter,12 Jest de proyección/publicación y12 controles locales:
todos aprobados. Se comprobaron84 enlaces locales de seis documentos de entrada
en Flutter, sin destinos ausentes; guía espejo idéntica en ambos repos.
No se ejecutó de nuevo la regresión global ni PostgreSQL en este relevo documental;
su evidencia anterior permanece en C2-C. No hay confirmación humana nueva.

Cierre posterior: código integrado en main local mediante los merges registrados
en RELEVO_C5_C2.md, sin diferencias funcionales respecto a los commits probados.
Verificación documental final:354 enlaces locales en diez documentos Flutter y
129 en ocho documentos backend, sin destinos ausentes; siete documentos espejo
idénticos. Sin push nuevo, CI remoto, instalación USB nueva ni despliegue.

## Datos de ensayo y seguridad

- Sesión creada por local_ranking_validation.mjs, nunca una base existente.
- Opt-in explícito SABERPLUS_C5_OPTION_IMAGES_LOCAL=true solo para esa API
  desechable; ausencia/false mantiene la carga por opción apagada. Otros valores
  se rechazan antes de crear recursos. No se heredan flags productivos.
- prepare_editorial_options_local.mjs comprueba dueño, directorio temporal,
  contexto Docker local y etiqueta antes de autenticarse con la cuenta ficticia.
- Banco sintético: tema «Opciones C2-D - ensayo …», Matemáticas; subtema
  «Opciones con imágenes»;12 preguntas básicas, cuatro opciones cada una.
- Azul horizontal160×80 y naranja vertical80×160; dos opciones adicionales
  solo de texto. La correcta es «Rectángulo azul horizontal».
- Preparador ejecutado correctamente: guardado y recarga por API comprobados,
  dos referencias de imagen conservadas. Esto no confirma la vista física del panel.
- Credenciales únicamente en flutter-private.json del directorio temporal.
  No imprimirlas, copiarlas a documentación, Git o defines del APK.
- Preparador sin cambios en producción, Supabase/Render, OV-1 o permisos históricos.
  La integración posterior del código en main local se registra en el relevo.

## Guion humano

| Bloque | Comprobación | Estado |
| --- | --- | --- |
| 1 | Panel: editar/guardar/recargar las imágenes; cancelar selección no publica. | Pendiente |
| 2 | Práctica: figuras distintas y proporcionales, texto legible y selección correcta. | Pendiente |
| 3 | Finalizar/revisar y reabrir: opción, explicación, figura y resultado conservados. | Pendiente |
| 4 | Corte/recuperación: aviso completo y reintento sin seleccionar ni duplicar respuesta. | Pendiente |
| 5 | Logout/reingreso: no acceder a contenido privado con la sesión anterior; demo aislada. | Pendiente |
| 6 | Texto grande/pantalla estrecha: controles legibles sin recortes ni estiramiento. | Pendiente |
| 7 | Cima o Rescate: recuperar intento/snapshot con figuras; sin XP duplicado. | Pendiente |
| 8 | Tira/Batallas y Trivia/Fantasma: registrar cada subcaso y sus límites. | Pendiente |

Son ocho bloques con varios pasos, no ocho toques. Registrar confirmaciones reales
y subcasos pendientes; no cerrar8/8 por probar un solo juego. Antes de juegos,
comprobar banco y reglas de admisión: el preparador no fuerza victorias ni XP.
No retirar/archivar recursos para fingir autorización histórica; sigue pendiente.

## Reanudar en otro momento

Desde backend/, tras compilar el backend y con Docker local:

```powershell
$env:SABERPLUS_C5_OPTION_IMAGES_LOCAL = 'true'
node tool/local_ranking_validation.mjs
```

En otra terminal, copiar solo la ruta que devuelve local-ranking-ready:

```powershell
$env:SABERPLUS_LOCAL_SESSION = '<directorio temporal de esta sesión>'
node tool/prepare_editorial_options_local.mjs
```

El preparador reconoce su manifiesto al repetirse. Si una preparación falla
antes de escribirlo, revisar el banco sintético o abrir una sesión nueva;
no afirmar que hubo rollback de cargas HTTP parciales.
La API tiene límite de dos horas y limpieza de sus recursos propios al terminar.
El panel se inicia desde admin/ con API_BASE_URL=http://127.0.0.1:43187.
Conectar Android por USB, depuración/instalación permitidas y pantalla desbloqueada;
comprobar adb devices y configurar adb reverse tcp:43187 tcp:43187.
Instalar la APK nueva conservando los datos, sin dar por válido un binario anterior.

**Siguiente acción:** detectar el celular, instalar y comenzar por el bloque1.
No hay confirmaciones humanas nuevas; código y relevo integrados en main local
según [guía](RELEVO_C5_C2.md), sin push nuevo ni despliegue.
