# MA-1R-UX1 — Visibilidad personal y Deshacer, pendiente

**18 de octubre de2026. Propuesta UX, no implementación.** Fuente de experiencia
y criterios: `docs/MA1R_UX1_OCULTAR_DESHACER.md` en Flutter. Orden propuesto: después
de R4, antes del acabado UI-F/beta. No cambia el contrato R2 ni los ensayos actuales.

El propietario pide X para quitar elementos de su lista y una barra inferior
«Reporte ocultado · Deshacer» con progreso de cinco segundos. Deshacer devuelve
el mismo elemento; pasado el plazo no aparece en la lista normal. Se propone
Ocultos/Restaurar para recuperarlo después sin pérdida irreversible.

Interpretación segura: ocultación **solo personal**, no DELETE de ReportePregunta,
retiro de denuncia ni cambio de estado ADMIN. Los pendientes ocultos pueden seguir
atendiéndose. Conservar ID/autor/permisos, snapshot, detalle, recibos, auditoría,
deduplicación, cuotas y cobertura. No alterar XP ni banco ni permitir otra creación
por haber ocultado una anterior. Retención/baja de cuenta son acuerdos separados.

Antes de código, acordar almacenamiento persistente por cuenta, contrato de lectura/
ocultar/restaurar, confirmación/reconciliación, idempotencia/revisiones, cambios de
estado mientras está oculto y acciones consecutivas. Aislar temporizadores por
cuenta e ID; probar cierre/fondo/red/401/cambio de cuenta/respuestas tardías.
Los cinco segundos no autorizan borrar datos ni suprimir evidencia.

Extensión a avisos u otros listados solo tras revisar su reversibilidad/contratos;
no aplicarla por defecto a instituciones, solicitudes, contenido publicado,
identidad, certificados, insignias, XP o auditorías. UI-F dará estilo/accesibilidad,
pero la visibilidad debe tener implementación y pruebas propias antes de beta.

Sin endpoints nuevos, cambios de schema/migraciones, borrados, despliegue o pruebas
funcionales de este comportamiento. R4 sigue con la UI existente.
