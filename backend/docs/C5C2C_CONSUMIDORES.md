# C5-C2-C — Imágenes en opciones: contratos y Flutter

**Estado vigente del23/oct: [C5-C2 cerrada localmente y auditada](C5C2_CIERRE_LOCAL.md).**
D1–D8 y D8a–e cubiertos según actas y límites. Entrega funcional integrada y
publicada: app PR #10/`44635ae`, backend PR #12/`9c225cb`.
Los estados/órdenes de ejecución fechados antes de este cierre se conservan como
antecedentes; no reiniciar C2 ni D8b por esas notas. Sin nuevo ensayo físico,
Docker o despliegue en los remates C2.
**Continuación del24/oct:** [H1 cerrada localmente](C5_H1_HISTORIAL_REVOCACION.md),
58/58 SQL/HTTP con Docker y74 migraciones solo temporales. Sigue H2, luego H3
y PDF/offline; resto C5 abierto, sin Android/despliegue y OV-1 separado.

## Checkpoint — 21 de octubre de 2026

Implementación local lista y validada automáticamente. **No se habilitó
la carga para estudiantes ni se hizo una nueva prueba física Android.**
La activación local de opciones sigue apagada por defecto. C2-D es el siguiente
paso del propietario, con Docker y celular USB cuando se acuerde la sesión.

Base publicada al iniciar este bloque: app `c69a5e9`, backend `e1c4d18`.
Entrega C2-C y relevo guardados: app `e833d6b`, backend `cfba7cd`.
Integración posterior en main local: app `f912880`, backend `09c763b`.
Sin push nuevo, CI remoto ni despliegue; OV-1 no se modificó.

## Implementación

- Backend: proyección `publicAnswerOption` que solo expone id, texto y referencia
  opcional de imagen. Nunca copia esCorrecta, solución, FK, recibos o autoría.
- Selecciones públicas de práctica, simulacro/personalizado, diagnóstico, repaso
  adaptativo y prioridades del profesor incorporan la imagen sin pedir la correcta.
  Corrección, historial y cuaderno la conservan bajo sus permisos ya existentes.
- Cima, Rescate y Guardián guardan la imagen de cada opción en su snapshot público
  de pregunta. Trivia/Fantasma y Tira la conservan en su evidencia privada y solo
  proyectan los datos públicos al cliente. Batallas usa la misma proyección segura.
- Las imágenes son aditivas y opcionales. Snapshots antiguos sin el campo siguen
  legibles; no se reescriben intentos, versiones de reglas ni balances.
- Flutter: siete modelos de opción/respuesta admiten la referencia opcional.
  PracticeOption la conserva al serializar/reabrir una sesión; si no hay imagen,
  mantiene el JSON antiguo de id/texto sin añadir claves de solución.
- `AcademicOptionContent` mantiene el texto visible y reutiliza AcademicImage para
  la imagen proporcional, descripción accesible y reintento. Solo limita a240px
  los píxeles decodificados; no limita ni recorta los avisos de error.
- Se integró en práctica/simulacro y corrección, diagnóstico, Cima, Rescate,
  Guardián, Trivia/Fantasma, Tira local/online, Batallas, historial, errores diarios
  y cuaderno. No reemplaza los botones ni decide selección, corrección o XP.
- Memoria usa parejas de flashcards, no estas opciones de pregunta. No se rehizo
  ese juego ni se añadió un contrato de imágenes de flashcards en este bloque.
- La ruta administrativa heredada también respeta el bloqueo de publicación de
  opciones ilustradas; su huella incluye la imagen. El panel C2-B se conserva.

No se añadieron dependencias, migraciones ni permisos nuevos. No se cambió el
backend de OV-1, ranking, concesión de XP, anuncios o certificados.

## Seguridad y límites que siguen abiertos

AcademicImage conserva la descarga privada autenticada, sin tokens en la URL,
sin redirecciones ni caché global de bytes. Las imágenes públicas heredadas no
reciben cabeceras de autenticación. C2-C solo serializa referencias; no implementa
descarga de bytes privados para PDF/offline.

**No se amplió la autorización histórica:** si el único uso de una imagen está
archivado, el endpoint estudiantil puede devolver404. Añadir la referencia al
historial no concede permiso sobre cualquier recurso ni garantiza que todas las
imágenes históricas sean descargables. Ese contrato de C5 permanece pendiente.
No resolverlo abriendo el bucket o desactivando autenticación.

La activación `EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED` permanece apagada fuera de
los ensayos temporales. No activarla para estudiantes antes de C2-D; el proveedor
persistente y la operación productiva siguen pendientes de C5.

## Evidencia automática

- Análisis Flutter sin incidencias y **99 pruebas dirigidas aprobadas**, incluidas
  **18 nuevas** de modelos/componente. Cubre opciones antiguas, referencia opcional,
  serialización, recurso compartido sin ImageCache y error completo a320px/texto2x.
  Pulsar Reintentar imagen dentro del botón no selecciona la respuesta.
- Regresión Flutter completa: **969 aprobadas /16 opt-in omitidas**. No contar las
  omitidas como aprobadas ni confundirlas con ensayos Android o API en Flutter VM.
- Backend completo: **128 suites /1.675 aprobadas**, cinco nuevas sobre C2-B.
- Compilación backend y análisis Flutter finales aprobados. ESLint dirigido de
  la proyección, tests nuevos y consumidores sin deuda previa aprobado;
  las27 incidencias anteriores se detallan abajo, no se declara lint global limpio.
- **44/44 PostgreSQL/HTTP, cero omitidas**, con70 migraciones en PostgreSQL16
  temporal de Docker; sin migración nueva de C2-C. Son las37 anteriores más
  siete escenarios nuevos, no44 pruebas nuevas de este bloque.
- HTTP real verifica práctica, simulacro personalizado, corrección, historial,
  cuaderno, diagnóstico, repaso, Cima, Rescate, Guardián, Trivia y Batallas.
  En Cima/Rescate/Guardián se perturbó el banco del ensayo y se recuperó la misma
  pregunta admitida con sus imágenes desde el snapshot.
- Trivia y Fantasma comparten el contrato/proyección; el nuevo HTTP prueba
  Trivia normal. No constituye otra certificación de admisión/presencia de Ghost.
  Tira conserva su evidencia mediante pruebas de proyección/snapshot y regresión
  existente; no se ejecutó aquí un nuevo duelo HTTP/USB completo de Tira.
- Se repitió el recorrido Chromium del panel (incluido en44), escritorio/390px.
  No equivale al guion físico de Flutter C2-D.
- Los fixtures son preguntas/cuentas ficticias, fuera de una base real; el
  escenario de corrección respondió mal y comprobó cero eventos XP competitivos.
  El ejecutor retiró su propio contenedor y directorio temporal al terminar.
- La primera pasada integrada dio42/44: el banco de ensayo tenía dos opciones,
  pero Trivia exige cuatro, y faltaban preguntas de Matemáticas para diagnóstico.
  Se corrigieron los fixtures y se repitieron44/44; no se flexibilizaron reglas.
- El primer test de reintento requería completar el scroll antes del toque.
  Corregido el test y repetidas las99 dirigidas; no se silenció el hit-test.

### ESLint: no confundir deuda anterior con esta entrega

La proyección y los demás archivos de consumo revisados no añaden incidencias
nuevas en el control dirigido. Se verificaron **27 incidencias preexistentes**
contra los mismos archivos de HEAD `e1c4d18` usando lintText sobre su contenido:

| Archivo anterior | Cantidad | Regla |
| --- | --- | --- |
| guardian.service.ts | 3 | no-unnecessary-type-assertion |
| tira-afloja.evidence.ts | 1 | no-unnecessary-type-assertion |
| tira-afloja.service.ts | 17 | no-unsafe-assignment / no-unsafe-member-access |
| trivia-rush.service.ts | 6 | no-unnecessary-type-assertion |

No se desactivó ESLint ni se suprimieron reglas. Esta acta no declara un lint
global limpio; registrar esta deuda para la auditoría de calidad antes de entregar.
Una aserción innecesaria del nuevo test de snapshot sí se corrigió.

## Siguiente — C2-D, guion propuesto de ocho comprobaciones Android

Preparación posterior registrada en [C2-D](C5C2D_VALIDACION_LOCAL.md).
La APK compilada y los servicios temporales de ese bloque no cambian la evidencia
automática de C2-C ni acreditan una prueba humana.

Todavía **0/8 humanas**. Preparar una API/PostgreSQL nuevos, banco sintético con
cuatro opciones por pregunta y dos imágenes distinguibles, sin secretos en Git.
La sesión anterior no se reutiliza ni se presume activa.

1. Panel: guardar una pregunta con imágenes en dos opciones y comprobar que se
   conserva al recargar; selección/cancelación no debe publicar por sí sola.
2. App/práctica: ver texto e imágenes distintas, proporción original y selección
   de la opción correcta al tocarla. Reintentar una imagen no debe seleccionarla.
3. Finalizar y revisar: correcta/incorrecta, explicación e imágenes corresponden
   a la misma pregunta/opción; conservar el resultado al salir y reabrir.
4. Recuperación de conexión: aviso completo, restaurar y reintentar sin reiniciar
   ni reenviar una respuesta ya confirmada; no mostrar imágenes de otra opción.
5. Sesión: cerrar/reingresar no deja bytes privados visibles de la cuenta previa;
   cuenta demo no descarga recursos privados.
6. Texto grande y pantalla estrecha: texto, imágenes y controles accesibles,
   sin estiramiento, recorte de avisos ni desbordes.
7. Juego con snapshot (Cima o Rescate): iniciar, salir/reabrir y conservar pregunta,
   selección/envío pendiente y figuras; sin volver a otorgar XP al recuperar.
   No implica retirar/archivar el recurso: su autorización histórica sigue aparte.
8. Tira/Batallas y Trivia/Fantasma: recorrido representativo de sus opciones y
   controles, con el modo disponible en el banco de ensayo. Si se divide entre
   sesiones, registrar subcasos pendientes; no cerrar8/8 por probar un solo juego.

Este guion es propuesta de preparación: C2-D fijará los datos y separará subcasos
si hace falta, sin inventar confirmaciones humanas. USB con depuración/instalación
habilitadas y celular desbloqueado; Docker para la base temporal propia.
No se necesita Supabase/Render para esos ensayos. No publicar ni migrar remotamente.

Referencias: [C2 completo](C5C2_OPCIONES.md), [lectura online C1](C5C_FLUTTER.md),
[contrato general C5](C5_ARCHIVOS.md).
