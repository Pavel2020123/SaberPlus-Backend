# Continuación después de instituciones — espejo backend

**21 de octubre — C5-C1 cerrada localmente:** [acta5/5 Android](C5C_FLUTTER.md),
3/3 Flutter VM/HTTP/PostgreSQL repetidas,57/57 dirigidas tras corregir el recorte,
análisis limpio y APK instalada. La regresión global950/13 del20 no se repitió.
Siguiente: consolidar código A/B/C1 y preparar C5-C2, imágenes en opciones.
C5-C restante y C5-D abiertos. Rama feat/c5-archivos-base; solo la documentación
móvil52a3488 está publicada. Sin merge/despliegue ni cambios OV-1.

**20 de octubre, continuación vigente:** [C5-A/B](C5_ARCHIVOS.md), imágenes del
panel validadas23/23 PostgreSQL/HTTP y recorrido Chromium;69 migraciones
solo temporales. Sigue C Flutter y D integración.
Rama feat/c5-archivos-base, sin merge/despliegue. Cambios aditivos de schema,
migración y app.module.ts deben conciliarse con OV-1 al integrar ambas ramas.

**19 de octubre, actualización que prevalece:** [MA-1R/R4](MA1R_R4_VALIDACION_LOCAL.md)
con12/12 humanos y45/45 HTTP/PostgreSQL, carrera ADMIN P2010/40001 corregida y
regresiones/remate visual según acta: R4 cerrada localmente e integrada en main
por [backend PR #9](https://github.com/Pavel2020123/SaberPlus-Backend/pull/9) (`eef0d40`)
y [app PR #6](https://github.com/Pavel2020123/saber_plus/pull/6) (`21757a1`).
CI backend del PR aprobado; QA-1 Flutter remoto pendiente. Sigue preparación local C5,
no repetir fases.
Bases temporales limpiadas; sin producción/SQL remoto ni cambios OV-1.

17 de octubre de2026. Fuente maestra en repo Flutter:
`docs/ESTADO_Y_ORDEN_2026_10_17.md`, vista del inventario
`docs/ETAPAS_PENDIENTES.md`; no son archivos de este árbol.

Instituciones locales consolidadas: app6bab6be, backend7ba93d7/lockbfce42e.
Auditoría inicial documental sin pruebas nuevas. **Entrega posterior completada:**
[app PR #5](https://github.com/Pavel2020123/saber_plus/pull/5) integrado como e679c50;
[backend PR #8](https://github.com/Pavel2020123/SaberPlus-Backend/pull/8) como388bb18.
[CI del PR](https://github.com/Pavel2020123/SaberPlus-Backend/actions/runs/39071235627)
y [CI de main](https://github.com/Pavel2020123/SaberPlus-Backend/actions/runs/39071411694)
aprobados: admin/verify, instalación/build,119 suites/1470 pruebas, controles y auditoría.
Flutter analyze sin incidencias y102 pruebas dirigidas aprobadas; sin workflow
Flutter remoto. No se repitieron893 globales ni ensayos físicos/SQL; sin despliegue.
[Acta](CIERRE_INSTITUCIONES_LOCAL.md). OV-1 no se incorporó ni modificó.

Compañero: OV-1 en curso según propietario, sin nueva entrega recibida/verificada.
No editar su checkpoint/código ni asumir cierre de A/B/C/D. Sabi inicial por seis
familias, no cada carrera, sin assets/lógica productiva nueva ni XP/ranking/certificados.

## Bloque del propietario: MA-1R integrada, sigue C5

MA-1R: reportes académicos de preguntas. La cobertura base ya existe: ver
[BANK_COVERAGE](../BANK_COVERAGE.md) y `src/admin/bank-coverage.service.ts`, con
false/null por defecto, opt-in reportesVersion=1 con conteos nuevos. No inventarlos
ni rehacer el panel; R3 consume ambos contratos de forma compatible.

R1 auditar/confirmar quién reporta, motivos/estados/versiones/dedupe/permisos;
R2 backend/persistencia; R3 app/ADMIN/cobertura; R4 pruebas separadas y acta.
R1–R4 cerradas localmente: [acta R4](MA1R_R4_VALIDACION_LOCAL.md),12/12 humanos,
45/45 HTTP/PostgreSQL y regresiones. Código/documentación integrados por PR #9/#6;
CI backend del PR aprobado. Migraciones solo en bases temporales, sin despliegue remoto.

Orden restante compartido: instituciones y MA-1R integradas → C5 → académico/profesor/
panel (P5→D3 autorizados, C4/C6 editorial, MA-2/3, contratos/certificados) →
PR-I3/4 insignias/perfiles → PR-I6/6-T/7 ranking/ensayo social → seguridad/comercial/
contenido/privacidad → UI-F → beta/validación → Play/operación. OV-1 paralelo.
Seguridad/CI/contenido se trabajan durante cada bloque, no solo al final.
Competición pendiente de Trivia/Duelo/Tira/IC-2/IC-3 queda posterior, sin borrar normales.

Antes de nuevo código, integrar base aprobada/crear rama del módulo y coordinar
schema, app.module, sesión, navegación y lockfiles con OV-1. P5/D3/servicios reales
siguen pausados; no push/merge/despliegue automático ni nuevas credenciales.

Antecedente de la auditoría del17: 29 documentos seleccionados, 609 destinos de
enlaces locales y ninguno inexistente; no incluye anchors ni páginas externas.
Diff sin errores de whitespace en ambos repos. Actualización solo Markdown,
sin editar CHECKPOINT_OV1. El auditado inicial fue documental; la entrega posterior
ejecutó las comprobaciones descritas e integró PR. La documentación se entrega
separada en rama local `docs/estado-post-instituciones` desde origin/main, sin descartar cambios.
Mensaje documental común: `docs: actualizar etapas tras integrar instituciones`.
Hash con `git log -1 --oneline`; publicación manual/PR pendientes, sin push/merge automáticos.
