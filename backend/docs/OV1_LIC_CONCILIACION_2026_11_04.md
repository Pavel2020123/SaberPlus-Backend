# OV-1 y LIC: consultas privadas y supresión

## Actualización del 5/nov: integración con frontend C5

Tras la verificación, el propietario autorizó commits y push de las ramas
de integración. Esa autorización no incluye merge a main ni despliegue.

Frontend combinado en `feat/ov1-lic-c5-integracion`, sobre `9d7145c` más
`48a44cc` y corrección de consulta retenida. Regresión completa Flutter:
1.388 aprobadas,0 fallos,29 omitidas;análisis lib/test limpio.
Backend completo:164 suites/2.187 Jest aprobadas. SQL privado se repitió:
primera49/50 (falló recepción de descarga Chromium),segunda50/50 sin cambiar
el ensayo ni aserciones,89 migraciones desechables. Recursos propios retirados.
La migración OV-1 conserva hash `1a510a0ef53f61b5b884c104d5a4f7cdc5905006`.

Lint recibido OV-1:419 diagnósticos en producción/tests. Se corrigieron solo
formato/aserciones de producción y callback Promise inmediato, conservando
reglas y contratos. Lint de producción OV-1/política/supresión limpio;
64 Jest dirigidas posteriores aprobadas. Deuda de lint en tests HTTP/rules
heredados separada. Nest build posterior aprobado;SQL privado repetido tras
el ajuste:50/50,0 fallos/omitidas,41,2s;recursos propios retirados. No sumar
los subconjuntos dirigidos a las2.187 pruebas de la ejecución completa.
No se declara lint global limpio ni se relajan pruebas.
Acta del frontend:`docs/OV1_LIC_C5_INTEGRACION_2026_11_05.md` en su worktree.
Sin commit/push ni despliegue;la aceptación física anterior era OV-1 aislado,
no se cuenta como otra ejecución del frontend combinado.

Las secciones inferiores son la evidencia cronológica del primer incremento.

Implementación solicitada por el propietario después de la auditoría OV-1.
Rama aislada `fix/ov1-lic-integration`, sobre el cierre C5 `9cafcff`.
No merge,push,despliegue ni uso del celular. Flutter no cambia en este incremento.

## Dependencia incorporada

El módulo backend OV-1,catálogo,reglas,DTO y sus pruebas se incorporaron desde
`origin/main`,sin cambiar cuestionario ni puntuación. Modelos Prisma y registro
en AppModule mantienen LIC/C5. La migración original
`20261014120000_vocational_orientation_v1` se conserva exactamente:
blob Git `1a510a0ef53f61b5b884c104d5a4f7cdc5905006`,igual al remoto.
No se reescribe ni se vuelve a aplicar en ninguna base existente/remota.
El runner permite explícitamente esa migración pendiente en su base propia.

## Ajustes

1. Política LIC:actual,historial,obtener y eliminar se clasifican CONSULTA;
   cuestionario,iniciar,guardar y finalizar continúan NUEVO. El JWT,rol,
   autorización por propietario y versiones de sesión siguen siendo obligatorios.
2. Supresión revisada:counts incluye intentos/respuestas vocacionales. La huella
   privada incluye contenido ordenado de respuestas y snapshot,además de estado
   y versión:editar una respuesta sin cambiar cantidad invalida la revisión.
   El digest no publica intereses ni respuestas en el panel de revisión.
3. La purga elimina el padre IntentoVocacional del titular;el cascade existente
   retira respuestas y snapshot completado sin deshabilitar las guardas de
   inmutabilidad. El Usuario sigue como tombstone,sin retener esos intereses.

## Verificación

- Prisma validate/generate y Nest build aprobados en worktree aislado.
- Jest:64/64,3 suites (política HTTP y OV-1). Lint dirigido aprobado.
- Pruebas nuevas reales en `test/ov1-lic-postgres.cjs`,registradas en el
  runner C5 privado,con89 migraciones en PostgreSQL16 desechable.
- Primera ejecución:49 aprobadas/1 fallo de fixture. La supresión pasó;
  la licencia de prueba usaba meses=1,pero el contrato solo admite6/12/18/24.
  Se corrigió únicamente el fixture a un semestre pasado.
- Repetición final:50/50 SQL/HTTP aprobadas,0 fallos,0 omitidas;89 migraciones.
  Incluye las dos nuevas OV-1 y48 regresiones C5 privadas. Recursos desechables
  propios retirados por el runner. No se utilizaron bases reales.

Casos exigidos:historial/resultado propios accesibles tras vencimiento;
nuevas respuestas/finalización/inicio denegados;resultado ajeno404;borrado
propio204;huella obsoleta409 incluso con igual número de registros;purga de
completado y borrador propios;otra cuenta sin cambios;JWT anterior revocado.

No se cuenta Android como aprobado. La integración/publicación Git y las pruebas
de celular se mantienen separadas;la aplicación cotidiana aún no utiliza esta
rama aislada. No se instalaron cambios en bases reales.
