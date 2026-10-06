# Documentación backend

Entrada vigente para colaboradores. [README de la API](../README.md) contiene
desarrollo local y contratos generales; [README del repositorio](../../README.md)
describe su estructura. Las referencias a documentación Flutter corresponden
a otro repositorio, no a archivos dentro de este árbol.

## PR-I1 y PR-I2 competitivos V1

PR-I1 está integrado a main por PR #5, merge `5216383`: 22 checkpoints funcionales
y seis juegos integrados localmente (Cima, Guardián, Rescate, Trivia, Duelo, Tira).
Memoria y Batallas no están integradas competitivamente. Flags apagados por defecto;
merge no equivale a despliegue. Esquema compatible aun con flags OFF y B1/B2
productivos pendientes; incidencias históricas conservadas.

- [PR-I2 — I2-1/2/3 integrados](PR_I2_RANKINGS.md): contrato, lector PostgreSQL
  y API autenticada; merge `66b5aa2`. Flutter I2-4 fusionada en `1921ba9`.
  Sigue I2-5: validación integrada y regresión PostgreSQL completa pendientes.
  El ranking general permanece vigente.
- [Relevo PR-I1](PR_I1_RELEVO.md).
- [Infraestructura y evidencia PR-I1](PR_I1_COMPETITIVE_INFRASTRUCTURE.md).
- [Auditoría Trivia/Duelo](PR_I1_TRIVIA_DUELO_AUDITORIA.md).
- [Auditoría Tira](PR_I1_TIRA_AFLOJA_AUDITORIA.md).

Los apartados históricos no sustituyen el merge confirmado ni autorizan operación.

## Evidencia académica

- [Catálogo académico](ACADEMIC_CATALOG.md).
- [Evidencia de aprendizaje](LEARNING_EVIDENCE.md).

Otros contratos de la API se enlazan desde el README backend. Los informes
editoriales de indexación describen datos/procedimientos editoriales, no son
índices generales de documentación ni determinan el estado de PR-I1.
