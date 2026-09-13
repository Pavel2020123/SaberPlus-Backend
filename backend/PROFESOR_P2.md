# P2 — seguimiento individual por temas

Entrega local, 12 de septiembre de 2026. Sin migraciones nuevas, escrituras en
Supabase ni despliegue a Render. Se preservan los cambios preexistentes de Guardián.

## Contrato

`GET /instituciones/me/estudiantes/:estudianteId/evidencia`

- ID UUID; sesión autenticada, correo verificado y guarda docente institucional.
- Exige membresía y capacidad `nivelAnalitica: DETALLADA`; no cambia el modelo
  gratuito ni activa planes comerciales.
- Profesor: estudiante de su institución en al menos uno de sus grupos asignados.
  Propietario/administrador institucional: estudiantes de su institución.
- Retorna el mismo 404 para estudiante inexistente o fuera del alcance. Si falla
  el plan/membresía se rechaza antes de consultar su evidencia.
- Revalida alcance y plan tras la consulta. No devuelve los grupos ajenos al
  alcance docente. La respuesta lleva `Cache-Control: private, no-store`.

Respuesta: `{ version: 1, estudiante: { id, nombre, grupos: [{id, nombre}] }, evidencia }`.
No incluye correo, texto/opciones de preguntas, claves, IDs de intentos o respuestas.
`evidencia` reutiliza el contrato y `LearningEvidenceService` del estudiante,
sin abrir a profesores la ruta personal `/diagnostico-evidencia`.

## Interpretación compartida

- Últimos 90 días; primera respuesta por pregunta dentro de esa ventana.
- Subtema: al menos 5 preguntas únicas. Tema: al menos 10. Ambos requieren
  2 sesiones y 2 días distintos en America/Bogota.
- Menos de 60 %: refuerzo; desde 80 %: fortaleza en lo evaluado; entre ambos:
  en proceso. Solo con evidencia suficiente. Un error aislado no es una falencia.
- Contenido no publicado o clasificado genéricamente queda fuera, igual que en
  el diagnóstico del estudiante. No se cambia su historial.
- Más de 10 000 registros: informe parcial sin conclusiones. El límite no es
  una paginación de conclusiones; se comunica explícitamente la muestra incompleta.
- Campo aditivo `ultimaEvidencia` por tema/subtema: fecha más reciente entre
  las primeras respuestas válidas contabilizadas, NO última apertura de la app.
  Las repeticiones posteriores no desplazan esa fecha. El resto de v1 no cambia.

## Verificación y límites

Verificación local: 94 pruebas relacionadas aprobadas en 16 suites, compilación
y lint de los siete archivos TypeScript modificados/añadidos sin incidencias.
Suite completa backend: 691 pruebas aprobadas en 68 suites. La aplicación Flutter
aprueba 445 pruebas, con 4 remotas omitidas; su análisis no reporta incidencias.

Pruebas de servicio con dobles de Prisma: alcance de roles, institución/grupos,
rechazos previos a leer historial, cambio de permisos/plan durante lectura,
reutilización de reglas y ausencia de campos sensibles. Prueba HTTP aislada:
UUID, actor autenticado y no-store; las guardas se sustituyen en ese ensayo de
transporte, por lo que no equivale a autenticar contra Render.

```powershell
cd "C:\Users\LENOVO 14ALC6\Desktop\SaberPlus-Backend\backend"
npm test -- --runInBand --silent "student-evidence|learning-evidence|institucion"
npm run build
```

Falta desplegar y ensayar con cuentas y PostgreSQL reales en P5. No activar planes
ni publicar contenido automáticamente para probar. P3 añade prioridades elegidas
por el profesor; esta ficha es de consulta, no un sistema de tareas.
