# Limpieza de ESLint del backend — 25 de octubre de 2026

## Alcance y continuidad

Pavel autorizó una limpieza por bloques después de revisar los avisos del editor.
Es una tarea técnica adicional, no una nueva funcionalidad ni un cierre de C5.
H3 queda en espera: H3-1 aprobada, H3-2 en curso. La segunda cuenta ya mostró
historial y cuaderno vacíos; falta volver a la primera y confirmar sus imágenes.
H3-3 y H3-4 siguen pendientes. OV-1 conserva su responsable independiente.

Rama de trabajo inspeccionada: `fix/c5-c2-cierre-local`. Ambos repositorios
contienen cambios anteriores de H1/H2/H3 todavía sin confirmar; conservarlos.
No hacer un commit global, reset, stash, push, merge o despliegue automáticamente.

## Diagnóstico anterior a esta limpieza

No confundir tres verificaciones:

- TypeScript 5.9.3 del proyecto: 383 archivos, cero diagnósticos.
- TypeScript 6.0.3 del editor: reglas/defaults diferentes; se documentó selección
  del SDK de proyecto en el README backend. No es una migración a TypeScript 6.
- ESLint local: **723 errores y 195 advertencias** en 383 archivos inspeccionados.
  Los avisos del editor son parciales y no representan el total del repositorio.

Reglas iniciales más frecuentes: formato 189; conversiones redundantes 98;
acceso inseguro a miembros 234; argumentos inseguros 193 (advertencias);
asignaciones inseguras 83; retornos inseguros 51; llamadas inseguras 40.
No afirmar que todos sean cosméticos, vulnerabilidades confirmadas o fallos
reales de ejecución: cada regla requiere su revisión.

## L1 — Formato y conversiones redundantes

**L1 cerrada localmente; la limpieza global sigue abierta.**

1. Se formatearon 13 archivos con Prettier y la política existente de saltos
   `endOfLine: auto`. Se comparó la estructura TypeScript antes y después,
   normalizando paréntesis redundantes; sin cambio estructural del código.
2. Se aplicó autofix exclusivamente a Prettier y
   `@typescript-eslint/no-unnecessary-type-assertion` en una segunda pasada
   de 20 archivos (puede haber solapamiento con los 13 anteriores).
   Se comparó el árbol del JavaScript emitido antes y después, ignorando
   paréntesis redundantes: sin cambio de comportamiento ejecutable detectado.
3. Las dos comprobaciones iniciales demasiado estrictas del comparador no
   guardaron cambios. Se corrigió el comparador: no debe tratar SourceFile.text,
   que incluye todo el archivo, como si fuera el valor de un literal.
4. Se añadió `npm run lint:check`, un comando de auditoría **sin --fix**.
   El comando `npm run lint` existente conserva su comportamiento y sí escribe
   correcciones. No usarlo como si fuera una consulta de solo lectura.

Resultado final conciliado: **436 errores y 195 advertencias** en 383 archivos.
Reducción neta: **287 errores**. Cero avisos de Prettier y de conversiones
redundantes. No se cambiaron reglas, dependencias, migraciones,
reglas de XP ni autenticación. El resultado es parcial, no ESLint limpio.

La comprobación TypeScript posterior detectó un efecto de tipado del autofix:
en competitive.tug-replay, quitar una conversión exterior dejaba un snapshot
como unknown. Se corrigió manteniendo una única conversión directa al tipo Row
ya utilizado, sin el paso intermedio unknown y sin tocar validaciones de ejecución.
El contador intermedio de esa pasada fue 437; después de la corrección es 436.

Verificación final L1: ambos proyectos TypeScript (general y build), con noEmit
e incremental desactivado, aprobaron. Jest completo: **133/133 suites y
1.755/1.755 pruebas aprobadas**, 94,40 s. Revisión ESLint completa posterior:
436 errores/195 advertencias, sin modificar reglas. diff --check correcto.
No se repitieron pruebas físicas o PostgreSQL en L1 ni se ejecutó commit/push.

## Orden de los bloques restantes

### L2-A — Primer conjunto de mocks, imports y promesas: verificado

- Guardian: callbacks de transacción y operaciones del harness tipados,
  validación de IDs en JSON de ensayo y métodos con comprobación de lock
  explícita. Se mantiene clonación, contrato Promise y serialización del harness;
  no se sustituye la comprobación PostgreSQL real por este doble.
- Health: parámetros de mocks tipados y excepción capturada como unknown,
  comprobando su clase antes de usar getResponse.
- Certificados: dobles de página/navegador tipados y callback de petición con
  parámetros explícitos; se conservan aislamiento de recursos, cierre, fallos
  y exclusión de renderizados simultáneos.
- Se esperan las promesas de las dos consultas de cobertura del test.
  Los marcadores running/renewing opcionales se comparan explícitamente con
  undefined; no se espera una promesa para preguntar si ya existe un escaneo.
- Imports namespace equivalentes para Supertest/Sharp bajo el CommonJS/SDK 5.9
  del proyecto. Se añadió una declaración .d.cts para el helper CommonJS de
  resumen de pruebas, sin cambiar su implementación.
- Se retiró un import de guard no usado. Los DTO @Query vacíos territoriales
  permanecen vinculados para que ValidationPipe rechace parámetros extra;
  no eliminar esos parámetros como una supuesta limpieza.

Evidencia L2-A: 27/27 dirigidas Guardian/Health y ESLint cero en esos tres
archivos. Después de los demás ajustes, ambos proyectos TypeScript aprobaron
y Jest completo volvió a pasar: **133 suites/1.755 pruebas**, 68,97 s.
Revisión global final: **365 errores y 186 advertencias** en 383 archivos.
Frente al inicio se corrigieron 358 errores y 9 advertencias. No hay avisos
pendientes de formato, conversiones redundantes, require imports, funciones
async sin await, promesas mal usadas/no atendidas, métodos sin contexto o
variables no utilizadas en esa revisión. Restan retornos inseguros 44, llamadas
inseguras 28, accesos inseguros 213, asignaciones inseguras 78 y conversiones
base-to-string 2; los 186 argumentos inseguros son advertencias.
No se tocaron reglas ESLint, versiones de dependencias o migraciones.

**Siguiente: L2-B (resto de mocks/fixtures y límites de tipos) y L3.** L2-A no
significa que todos los tests estén libres de any ni que la limpieza global
esté cerrada. Mantener H3 en espera en el punto descrito al principio.

1. **L2-B — Pruebas y límites de tipos pendientes:** tipar callbacks y mocks en lugar de propagar any;
   resolver async sin await conservando el contrato Promise, llamadas inseguras,
   promesas mal usadas o no atendidas. No cambiar sincronización, orden de locks,
   excepciones ni expectativas solo para hacer pasar una regla.
2. **L3 — Límites de datos y código productivo:** revisar los Record<string, any>
   y JSON competitivos con modelos/tipos y validaciones reales. Mantener rechazo
   de evidencia inválida, versiones, replay exacto y todas las reglas deportivas.
   Un cast a un tipo confiable no sustituye validación de datos desconocidos.
3. **L4 — Cierre global:** repetir `npm run lint:check`, revisión TypeScript,
   build y suite completa. Si hubo cambios en persistencia/permisos/replay, repetir
   también las integraciones PostgreSQL afectadas en una base temporal propia.
   No declarar cero avisos ni cierre mientras queden errores o advertencias.

Los bloques no son autorización para modificar OV-1, reconstruir arquitectura,
apagar reglas de ESLint, añadir any/as unknown para silenciarlas, modificar
resultados deportivos, relajar permisos o ejecutar SQL sobre una base remota.

## Avance L2-B / L3 — 26 de octubre de 2026

Se corrigió el bloque competitivo señalado en el último listado del editor:
soloFacts ahora lee objetos como Record<string, unknown>, conserva todas las
validaciones del snapshot y reutiliza IDs/opciones ya comprobados al reproducir
respuestas. No cambian puntuación, hashes, orden de respuestas ni terminales.
Los reconciliadores Trivia/Tira leen códigos de errores desconocidos mediante
databaseErrorCodes, validando por separado los códigos Prisma y SQL. Los fallos
sin códigos válidos mantienen la ruta de diagnóstico genérico y reintento.

En pruebas se tiparon callbacks de mutación, mocks SQL/JWT y metadatos reflejados
del controlador/gateways. Se conserva la comprobación del DTO real de crear,
los campos rechazados por ValidationPipe y las expectativas deportivas.
Se añadieron nueve casos del lector de errores (incluidos null, primitivos y
metadatos incorrectos). Los nueve archivos de este bloque tienen cero errores
y cero advertencias ESLint. Pruebas dirigidas: **7 suites / 103 aprobadas**.
Ambos proyectos TypeScript (general/build) aprobaron con noEmit.

Recuento global posterior: **283 errores y 179 advertencias** en 385 archivos
inspeccionados. Reducción de este bloque: 82 errores y 7 advertencias; frente
al inicio: 440 errores y 16 advertencias. Restan retornos inseguros 42,
llamadas inseguras 22, accesos inseguros 157, asignaciones inseguras 60 y
base-to-string 2; argumentos inseguros 179 (advertencias).
La limpieza global sigue abierta; continuar con los demás mocks y límites
JSON, sin apagar reglas ni alterar reglas de negocio. H3 permanece en espera.
No se realizaron pruebas Android, integración PostgreSQL, commit o push
en este bloque. Suite completa posterior aprobada: **134 suites / 1.764
pruebas**, 139,467 s. Es validación unitaria local, no despliegue productivo
ni sustituto de los guiones físicos H3 todavía pendientes.

## Comandos de verificación

Desde la carpeta `backend` de SaberPlus-Backend:

```powershell
npm run lint:check
node node_modules/typescript/bin/tsc --noEmit --incremental false --project tsconfig.json
node node_modules/typescript/bin/tsc --noEmit --incremental false --project tsconfig.build.json
npm test -- --runInBand
```

A día de este checkpoint, lint:check debe señalar los pendientes; no ocultar su
código de salida ni confundirlo con una nueva regresión de ejecución.
## Entrega autorizada — 26 de octubre de 2026

Pavel autorizó commit y push del último bloque competitivo. Se entrega en
fix/c5-c2-cierre-local: los nueve archivos competitivos revisados, el comando
lint:check y esta acta (reflejada también en el repositorio Flutter).
Los cambios anteriores de L1/L2-A que estén en otros archivos, C5/H1/H2/H3,
sus migraciones y los demás cambios locales no forman parte de esta entrega.
Los recuentos globales y suites registrados arriba describen el árbol local
completo validado, no un checkout aislado de este commit parcial.
No se integra main, no se despliega y no se declara cerrada la limpieza.
