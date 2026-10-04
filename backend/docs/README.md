# Documentación backend

Entrada vigente para colaboradores. [README de la API](../README.md) contiene
desarrollo local y contratos generales; [README del repositorio](../../README.md)
describe su estructura. Las referencias a documentación Flutter corresponden
a otro repositorio, no a archivos dentro de este árbol.

## PR-I1 competitivo V1

Rama `feat/pr-i1-competitive-infrastructure`, HEAD `83d53da`: quince checkpoints
confirmados/publicados. Ronda 16 local: ACTIVA exacta, countdown y temporalidad
µs para nuevas búsquedas Tira admitidas. Contrato compartido/ledger y A3–A8
siguen bloqueados; rol/RLS, WAL y capacidad productivos pendientes. TUG_MATCH
no registrado ni habilitado. PR-I1 no fusionado. Código local no acredita
migraciones remotas, despliegue ni activación.

- [Infraestructura competitiva](PR_I1_COMPETITIVE_INFRASTRUCTURE.md): resumen
  vigente, checkpoints, flags, arquitectura/ledger, migraciones y gate de despliegue.
- [Auditoría de Trivia Rush y Duelo](PR_I1_TRIVIA_DUELO_AUDITORIA.md): evidencia,
  decisiones aprobadas, implementación local, historial de pruebas e incidencias.
- [Auditoría de Tira y afloja](PR_I1_TIRA_AFLOJA_AUDITORIA.md): autoridad actual,
  snapshot/R durables, compatibilidad, privacidad, brechas y precedencia; sin XP.

Los tres flags servidor (`COMPETITIVE_SOLO_ENABLED`, `COMPETITIVE_TRIVIA_ENABLED`,
`COMPETITIVE_GHOST_ENABLED`) están apagados por defecto. El nuevo
`COMPETITIVE_TUG_ENABLED=false` prepara únicamente admisión Tira, sin verificador
ni XP. La política aprobada es automática por servidor y separa las colas por
clasificación persistida. Solo nuevas admisiones
consultan el flag de su grupo/modo; apagarlo no detiene recuperación o pagos
pendientes. Tira, Memoria y Batallas siguen sin integrar; PR-I2 no ha comenzado.
Mantener abiertos rol/RLS de producción, causa histórica de los 34 fallos y
vencimiento intermitente de Rescate. Migraciones remotas no aplicadas por estas
rondas; no inferir su aplicación a partir del código versionado.

Los documentos especializados comienzan con estado vigente; los registros
anteriores se conservan como historial explícito, con fechas/bases y resultados
de cada ejecución. Las decisiones posteriores superan las propuestas antiguas.

## Evidencia académica

- [Catálogo académico](ACADEMIC_CATALOG.md).
- [Evidencia de aprendizaje](LEARNING_EVIDENCE.md).

Otros contratos de la API se enlazan desde el README backend. Los informes
editoriales de indexación describen datos/procedimientos editoriales, no son
índices generales de documentación ni determinan el estado de PR-I1.
