# Documentación backend

**8 de octubre:** recorrido Android y criterios funcionales de rankings revisados;
limpieza operativa anterior y QA-1 siguen pendientes. [IC-1A/IC-1A2 Cima](IC1_CIMA.md)
validada localmente en Android/API/ledger: un evento de 100 XP, recuperación,
reintento, OFF y normal sin XP. [IC-1B1 Guardián](IC1_GUARDIAN.md) implementado
en Flutter, 34 tests; IC-1B2 local acredita victoria/100 XP únicos, recuperación,
reintento/ranking y normal sin XP; derrota +30 por 3 aciertos y abandono −10,
saldo final120. IC-1B local validada; siguiente IC-1C Rescate. Ensayo académico
local confirma publicación/progreso y conservación de versiones. Sin cambios del
runtime productivo, migraciones remotas ni activación productiva; solo herramientas
del harness temporal/control IPC modificadas. Prevalece sobre las notas
históricas del día 7 siguientes.

[Seguimiento I2-5](I2_5_SEGUIMIENTO_2026_10_07.md): panel 3 × 88/88,
clasificación de lint y evidencia del recorrido Android (con preparación histórica).

Estado más reciente: [conciliación del 7 de octubre](CONCILIACION_2026_10_07.md).
I2-5 abierto por recorrido físico/cierre de criterios; regresión competitiva e
integración HTTP ya documentadas. Panel normal 88/88, audit producción 0,
lint 603 errores/150 avisos en el PC de Pavel. No acredita producción.
[Informe histórico del día 6](VALIDACION_LOCAL_I2_5_2026-10-06.md).
IC-1/2/3 cubren clientes, Memoria y Batallas; QA-1/DOC-1 son apoyo.

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
  Sigue I2-5: recorrido Android y cierre de criterios; regresión e integración HTTP documentadas.
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
