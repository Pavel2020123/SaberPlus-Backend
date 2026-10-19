# Instituciones — espejo del cierre técnico local

17 de octubre de2026. Fuente maestra en repo Flutter:
`docs/CIERRE_INSTITUCIONES_LOCAL.md`. No es un archivo de este árbol backend.

**Alcance local consolidado:** directorio/territorio, presentación C1, logo C2,
solicitudes C3 y código C4. No es producción, P5/D3 ni ranking institucional.

**Entrega posterior integrada:** [backend PR #8](https://github.com/Pavel2020123/SaberPlus-Backend/pull/8)
en main `388bb18`, [app PR #5](https://github.com/Pavel2020123/saber_plus/pull/5)
en main `e679c50`. CI backend del PR y main aprobado, incluida instalación Linux,
119 suites/1470 pruebas y auditoría; Flutter analyze limpio y102 dirigidas aprobadas.
[Evidencia y enlaces CI](ESTADO_Y_ORDEN_2026_10_17.md). Se resuelve la observación
CI/lockfile inferior en ese alcance; JPEG original, QA-1 Flutter remoto y despliegue
siguen abiertos. No nuevas migraciones remotas ni ensayos físicos/SQL.

- [C4](PR_I5_C4_CODIGO.md):10/10 guiones integrados locales cubiertos con Android
  y19 HTTP/SQL complementarias, no10 manuales independientes. [C3](PR_I5_C3_SOLICITUDES.md)
  conserva10 humanas/14 HTTP/SQL, [C2](PR_I5_C2_LOGO.md)8 humanas/6 HTTP/SQL.
- Consolidación: Flutter893 aprobadas/13 opt-in omitidas, análisis limpio;
  backend119 suites/1.470 aprobadas en el cierre; panel95/95 y23 módulos correctos.
  TypeScript `tsc --noEmit` correcto.
-66 migraciones solo temporales; ningún despliegue/migración remota ejecutado.
- Código estudiantil privado, rol ESTUDIANTE preservado, sin grupos automáticos,
  sin traslados/duplicados en alcance. Institución APROBADA/límite null/USB restaurado.
  Sesión6fFUQb efímera; no incorporar sus secretos a Git ni reutilizar si expiró.
- Límites: no iOS/carga/producción ni429 del entrypoint principal. Fallos humanos
  C3/C4 previos al POST, no ack perdido tras guardar; pruebas automáticas separadas.
  Captura JPEG pequeña original no reproducida, sin afirmar causa/corrección.

## Revisión del lockfile y entrega Git

Lockfile preexistente modificado: registros opcionales emnapi y metadatos peer,
sin package.json cambiado. Dry-run de npm ci aprobado en Windows con aviso
EBADENGINE: Node24.11.1/npm11.6.2 frente a Node24.14.1/npm11.11.0 fijados. No prueba
instalación real ni CI Linux: conservar observación y validar antes de integrar.
No modificar versiones ni desactivar controles por este cierre.

Ruta backend: `C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend`.
Rama de la entrega `feat/instituciones-c2c`. Commit funcional creado `7ba93d7`:
`feat: completar ingreso estudiantil seguro a instituciones`.
Incluir C3/C4, módulo/limitador, schema/dos migraciones, tests/helpers y documentos.
Lockfile aparte `bfce42e`: `chore: normalizar lockfile de dependencias opcionales`.
En Flutter `6bab6be`: `feat: completar solicitudes y codigo institucional estudiantil`.

Commits creados con autorización del propietario el17 de octubre. HEAD coincide
con las referencias locales origin de esta rama en ambos clones. No se consultó
GitHub para confirmar PR/CI/merge durante la auditoría documental posterior;
no se ejecutaron pruebas nuevas ni push/merge/despliegue en esa auditoría.
No stage amplio, reset, push, merge, despliegue o modificación OV-1 automáticos.

## Ensayos posteriores

Local sigue en cada cambio. Staging autorizado P5→D3 probará configuración real,
persistencia/migraciones/archivos/CORS/sesiones/roles y panel→API→app con datos de
ensayo y respaldo. Funciones/integraciones→UI-F→8F/8G/beta antes de publicar;
seguridad/pruebas no se posponen hasta el final. No repetir manualmente cada unitaria.
Producción autorizada solo smoke breve/controlado, no pruebas destructivas sin permiso.
P5/D3 pausadas; entrega PR/CI/main completada. Guardar documentación pendiente, no desplegar.
[Orden posterior](ESTADO_Y_ORDEN_2026_10_17.md): MA-1R reportes de preguntas,
propuesto y no iniciado; OV-1 sigue con el compañero.
