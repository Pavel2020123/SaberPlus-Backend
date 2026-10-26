# C5-H3 — Integración de imágenes históricas y revocación

## Checkpoint vigente — 25 de octubre de 2026

**H3 abierta: integración automática aprobada; Android en curso, 1/4 guiones aprobado.**
El propietario pidió guardar el avance y avisar antes de necesitar el celular.
No es un relevo a OV-1 ni una asignación a otro compañero.

H2 conserva su [cierre backend local](C5_H2B4_FUENTES_MUTABLES.md).
No declarar H3 cerrada, instalada en Android o desplegada por las pruebas unitarias.

## Cambios preparados

- Panel ADMIN: sección **Control de imágenes** para consultar una referencia
  editorial y revocar por seguridad o derechos, con motivo y confirmación.
- Un envío incierto conserva el UUID, la referencia y el mismo motivo. Permite
  consultar el recibo o reintentar exactamente la misma operación; un recibo
  ausente no equivale a una revocación fallida ni autoriza otro envío distinto.
- Cerrar sesión limpia el formulario y descarta respuestas tardías.
- Flutter distingue imagen no disponible (403/404/410) de fallo transitorio.
  Permite consultar de nuevo y aconseja no responder si falta una imagen necesaria.
- Actualizar historial/cuaderno invalida las imágenes privadas para revalidar su
  permiso; no conserva los píxeles anteriores cuando la nueva lectura se deniega.
- No cambian puntuación, XP, certificados ni reglas vocacionales.
- Sin nueva migración en H3. Las migraciones históricas H1/H2 siguen pendientes
  de cualquier despliegue autorizado; no ejecutar SQL remoto.

## Evidencia realmente repetida el 25 de octubre

| Comprobación | Resultado |
| --- | --- |
| Panel, `npm test` | 144/144 aprobadas |
| Panel, `npm run check` | Sintaxis correcta: 29 módulos |
| Flutter: editorial_image, daily_mistake_review y progress_models | 39/39 aprobadas |
| Script de sesión temporal: `node --check tool/local_ranking_validation.mjs` | Correcto |
| Flutter, `flutter analyze` | Sin incidencias (17,3 s) |
| Flutter, análisis repetido tras corregir la espera | Sin incidencias (30,3 s) |

La repetición integrada del 25/oct aprobó **92/92 PostgreSQL/HTTP**, sin omitidas,
con 78 migraciones exclusivamente temporales y 140,42 s de pruebas. Incluyó
Chromium: carga/publicación, historial propio tras archivar, revocación desde
el panel, respuesta perdida después de confirmar y recuperación del mismo recibo.
Se verificaron un único recibo, denegación posterior y conservación del historial.
Capturas revisadas visualmente en escritorio/390 px; no son pruebas Android.
El runner confirmó la eliminación de sus recursos propios al terminar.

El primer intento de este turno no cerró correctamente bajo carga simultánea
y no se cuenta como aprobado. La primera suite completa Flutter terminó con
1.019 aprobadas, 16 omitidas y un fallo de sincronización de decodificación
en editorial_image_test. Se sustituyó la espera fija por finalización acotada
del provider: 39/39 dirigidas volvieron a pasar. La segunda suite completa
terminó correctamente: **1.020 aprobadas, 16 omitidas, cero fallos**, en 5 min 20 s.
Las omitidas requieren sesiones de integración específicas; no equivalen a
ensayos Android ejecutados.

Al preparar la pausa anterior Docker no estaba disponible; no se arrancó una sesión
nueva, no se instaló APK ni se necesitó USB. Las credenciales y fixtures de una
sesión antigua no se deben dar por vigentes.

## Antes de pedir el teléfono — trabajo del agente

1. Revisar rama/status de ambos repositorios y conservar los cambios existentes.
   Continuación local: `fix/c5-c2-cierre-local`; no reset, stash automático,
   merge, push ni cambios de OV-1.
2. Con Docker iniciado, ejecutar desde el directorio `backend` del repositorio
   SaberPlus-Backend: `npm run test:editorial-files:postgres`.
   El runner crea y elimina su propia PostgreSQL temporal. Esperar su resultado
   completo; no ejecutar Prisma generate/build simultáneamente en Windows.
3. Revisar el caso Chromium H3 de revocación tras guardar y perder la respuesta,
   recuperación del recibo y capturas de escritorio/390 px. Inspeccionar esas
   imágenes; corregir cualquier fallo y repetir antes de marcarlo aprobado.
4. Completar la regresión Flutter pertinente y guardar el resultado exacto.
5. Preparar una sesión humana nueva con el runner existente
   `tool/local_ranking_validation.mjs`, optando explícitamente por
   `SABERPLUS_C5_OPTION_IMAGES_LOCAL=true` y
   `SABERPLUS_C5_HISTORY_IMAGES_LOCAL=true`.
   Las banderas solo afectan la API recién creada y propia; por defecto son
   falsas. Nunca reutilizar una base remota ni heredar banderas productivas.
6. Preparar fixtures sintéticos de imagen y respuesta propia, panel ADMIN y APK
   apuntando a esa sesión mediante `flutter-app.json` (sin contraseña ni claves
   AUTH_E2E). El preparador de opciones genera este archivo con una lista
   explícita de configuración pública; no compilar con `flutter-private.json`.
   El fixture debe distinguir preparación técnica de
   respuestas efectuadas por la persona. No fabricar una aprobación humana.
7. Solo entonces avisar a Pavel para conectar el Android. La contraseña de la
   sesión va en el archivo privado temporal que genera el runner
   (`flutter-private.json`, clave `AUTH_E2E_PASSWORD`), nunca en Git, el acta,
   capturas o la salida del chat. Dar su ruta real cuando exista.

**Sesión humana del 25/oct:** runner iniciado correctamente con 78 migraciones,
opt-in de opciones/históricos y API loopback 43187; panel loopback 4173.
El preparador creó y recargó 12 preguntas sintéticas con dos imágenes por opción,
tema `Opciones C2-D - ensayo b47708f4`. No se han respondido en Android.
Credenciales exclusivamente temporales, no en este documento. La sesión caduca
a las dos horas o al cerrar el runner; verificar disponibilidad antes de usarla.
APK debug compilada correctamente con `flutter-app.json` (sin AUTH_E2E),
en `build/app/outputs/flutter-apk/app-debug.apk` del repositorio Flutter.
La compilación sin sufijo tardó 133,1 s y no se instaló. Posteriormente se
compiló la variante separada con argumento explícito (47,5 s), se comprobó su
identificador con aapt y ADB confirmó instalación **Success** sobre
`com.example.saber_plus.i2validation`. La instalación normal se conserva.
USB autorizado y reverse del puerto 43187 comprobados; API responde OK.
La apertura automática fue bloqueada por la herramienta: Pavel la abre
manualmente. Instalación no equivale a guion aprobado: Android sigue **0/4**.
La compilación advierte compatibilidad futura de Kotlin/`flutter_timezone`;
no actualizar plugins ni dependencias dentro de esta prueba sin evaluar el cambio.

### Preparación del primer guion en el teléfono

Instalar únicamente la APK recompilada con `flutter-app.json`, configurar el
puente USB al puerto 43187 y comprobar que la API sigue respondiendo antes del
login. Entrar con la cuenta sintética estudiante que indica la configuración
privada de esta sesión. No usar una cuenta productiva ni mostrar su contraseña.
Compilar con `--android-project-arg=saberplusValidationApk=true` y comprobar con
`aapt dump badging` que el identificador es `com.example.saber_plus.i2validation`
antes de instalar. La primera APK preparada tenía el identificador normal y
**no se instaló**: se recompila la variante separada para no sustituir la app normal.
La variable de entorno ORG_GRADLE_PROJECT no produjo el sufijo en este PC;
usar el argumento explícito, como ya advertía el antecedente IC1_CIMA.

### Identificación de la app de pruebas

Pavel no puede distinguir los dos iconos con el mismo nombre. En vez de borrar
ambas instalaciones y sus datos locales, se añadió una etiqueta de manifiesto
configurada por Gradle: la variante debug con opt-in se llama **SaberPlus Pruebas**;
el valor predeterminado sigue siendo **SaberPlus**. El identificador de la variante
no cambia, por lo que se actualiza con `adb install -r`, sin desinstalar o limpiar
datos. Cambios limitados a build.gradle.kts y AndroidManifest.xml; no cambian
login, API ni reglas de H3. Verificar etiqueta e identificador con aapt antes
de instalar. Este ajuste de identificación no aprueba ningún guion humano.
Comprobación del 25/oct: build debug correcto (57,6 s), aapt confirmó etiqueta
`SaberPlus Pruebas` e identificador `.i2validation`; instalación con `-r`
confirmada por ADB: **Success**. No se desinstaló ninguna aplicación.
Buscar Matemáticas → `Opciones C2-D - ensayo b47708f4` → `Opciones con imágenes`.
Pavel confirma primero que ve el rectángulo azul horizontal y el naranja vertical;
después se guía la respuesta y la consulta de historial/cuaderno. Ninguna de
estas acciones humanas se declara realizada por haber creado el fixture.
Para verificar acceso exclusivamente histórico, el agente debe retirar los usos
publicados de las referencias de ensayo, conservando las versiones y sus pruebas;
no concluir privacidad mientras la misma imagen siga legítimamente publicada.

## Guiones humanos — 1/4 aprobado

**H3-1 aprobado localmente el 25/oct.** Tras editar y archivar las fuentes,
captura USB del historial reabierto confirma el enunciado original Ensayo C2-D 12,
respuesta naranja vertical, correcta azul horizontal y explicación originales.
Cuaderno actualizado ya había conservado el mismo contenido y proporciones.
La verificación posterior de la sesión propia confirmó XP 90, 5 respuestas,
10 pruebas de imagen, historial/cuaderno sin alteraciones y 12 originales
archivadas con 12 versiones nuevas. Consultar no sumó XP. Los permisos HTTP
siguen 200 para propietario y 404 para otra cuenta; falta el cambio de cuenta
en Android (H3-2). H3-3 y H3-4 también pendientes. No es cierre de toda H3.
Los estados 0/4 de los avances fechados inferiores son antecedentes.

**H3-2 en curso:** Pavel cerró sesión; captura USB confirmó pantalla de acceso
con campos vacíos, sin historial ni figuras de la cuenta anterior visibles.
Pendiente entrar con la segunda cuenta sintética, consultar historial/cuaderno
y regresar a la primera. Este paso aislado no cierra el guion.

Segunda cuenta sintética: Pavel confirma acceso e historial vacío. Captura USB
con filtros Todas/Todas muestra 0 respondidas, 0 correctas, 0 incorrectas y
0% de acierto, sin tarjetas o imágenes de la primera cuenta. Falta comprobar
Cuaderno en esta cuenta y volver a la primera; H3-2 sigue en curso.

Cuaderno de la segunda cuenta comprobado por captura USB con todas las áreas
y todos los estados: 0 errores, 0 pendientes, 0 en repaso y 0 dominados;
sin imágenes ni error de la primera cuenta. Falta volver a la cuenta original
y comprobar que recupera su propio contenido para cerrar H3-2.

### H3-1 en curso — evidencia parcial del 25/oct

Pavel abrió la práctica y confirmó las imágenes de opciones; la captura aportada
mostró azul horizontal y naranja vertical sin deformación. Respondió una opción
naranja incorrecta y las restantes azules. Su captura de corrección muestra
azul como correcta, naranja como su respuesta y explicación de las proporciones.
Captura USB directa posterior: **Resultado de práctica, 80%, 4 correctas de 5,
+90 XP**, pregunta inicial `Ensayo C2-D 12` marcada Por reforzar.
El banco anuncia 12 disponibles, pero esta sesión evaluó 5: registrar el resultado
observado, no afirmar 12 respuestas ni 11/12 aciertos.
Pendiente abrir historial/cuaderno, verificar persistencia y original tras
editar/archivar, y ausencia de XP adicional por consultar. H3-1 no cerrada.

Avance posterior por captura USB: Historial conserva la práctica Matemáticas
del 25/oct con 80%, 4/5 y +90 XP; el historial de respuestas muestra 5 respondidas,
4 correctas y 1 incorrecta. Se ven las tarjetas `Opciones con imágenes`, incluida
la incorrecta. Falta desplegar su detalle y verificar imágenes históricas;
la etiqueta +90 XP no demuestra por sí sola que el saldo global no se duplicó.

Detalle histórico desplegado, comprobado por captura USB: pregunta Ensayo C2-D
12, selección naranja vertical, correcta azul horizontal y explicación completa
de 160/80 y 80/160. Ambas imágenes mantienen sus proporciones. Es la lectura
anterior a editar/archivar; todavía no demuestra conservación tras cambiar la
fuente. Sigue comprobar cuaderno y luego original tras edición/archivo.

Cuaderno antes del cambio, comprobado por captura USB: selección naranja,
correcta azul, imágenes proporcionadas, explicación original y estado Pendiente.
Después se ejecutó `backend/tool/prepare_editorial_history_local.mjs` solo contra
la sesión propia, validando directorio temporal, nonce, etiqueta Docker,
clasificación sintética y coincidencia de la identidad API con la base temporal.
La edición usa la API ADMIN real, sin escribir respuestas, XP ni historial.
Se publicaron 12 versiones nuevas de texto (2 + 2) sin imágenes y se archivaron
las 12 originales. El diario temporal evita repetir las ediciones al retomar.
El primer intento no completó su verificación final; el reintento reutilizó las
12 versiones registradas y terminó correctamente. No atribuir una causa no
confirmada al primer fallo ni contarlo como otra ejecución aprobada.
Verificación posterior: XP 90, 5 respuestas y 10 pruebas de imagen conservadas;
historial/cuaderno SQL sin cambios. Las dos imágenes originales devuelven 200 al
propietario histórico y 404 a la otra cuenta; ya no se depende de usos publicados.
Falta actualizar cuaderno/historial en Android y comprobar visualmente originales
después de esta edición. H3-1 continúa abierta y el total humano sigue 0/4.

Después de actualizar Cuaderno, captura USB confirma que siguen visibles las
figuras originales (naranja vertical seleccionada y azul horizontal correcta),
la explicación de proporciones y estado Pendiente. Esta parte de H3-1 pasó;
falta reabrir el historial tras la edición y comprobar saldo/resultados antes
de cerrar el guion completo.

Son cuatro grupos, no solo cuatro pulsaciones. Registrar cada comprobación y
sus incidencias; una respuesta ambigua requiere aclaración, no un aprobado.

| Guion | Qué hará Pavel | Qué debe comprobar el agente |
| --- | --- | --- |
| H3-1 Original histórico | Responder una pregunta con imagen, consultar historial y cuaderno cuando corresponda; volver tras editar/archivar la fuente | Imagen/texto originales y proporción correcta; resultado conservado sin nueva XP. No extender permisos a lecciones/casos sin prueba exacta. |
| H3-2 Cuenta y sesión | Salir, entrar con la segunda cuenta sintética y regresar a la primera | La segunda no ve historial o imágenes privadas de la primera; logout retira la imagen y no recupera datos por respuestas tardías. |
| H3-3 Revocación ADMIN | Revocar la imagen de ensayo con confirmación y volver a consultar el historial en el celular | Recibo/estado del panel coherentes; al actualizar desaparece la imagen y aparece el aviso legible; se conservan texto y resultado. |
| H3-4 Fallo y recuperación | Consultar con un fallo controlado de red, recuperar conexión y reintentar; revisar texto ampliado | No falso éxito, sin imagen antigua indebida ni envío de respuesta accidental; controles y aviso legibles. |

La revocación impide lecturas nuevas, pero **no borra píxeles que una persona
ya vio o capturó**. No existe una notificación push que elimine al instante la
imagen de todas las pantallas: se comprueba al recargar/reconsultar.

## Orden después de la pausa

Retomar primero las verificaciones automáticas pendientes de esta acta, después
sesión/APK y finalmente H3-1 a H3-4 con USB. Si Pavel todavía está ocupado,
avanzar solo en la preparación verificable y avisar de lo que falta.

Quedan **6 entregas C5**, incluida H3:
H3 → PDF/offline → fotos persistentes estudiante/profesor → evidencias
institucionales privadas → almacenamiento general/cuotas/versionado/limpieza y
respaldos → C5-D operaciones integradas.
Esto no cierra toda C5 ni modifica el trabajo independiente OV-1.
