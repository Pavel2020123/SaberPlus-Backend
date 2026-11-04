# Retoma de desarrollo y viabilidad de la propuesta #14

Revisión: 31 de octubre de 2026. Auditoría documental y lectura dirigida de código; no certifica pruebas completas actuales, despliegue ni base de datos real. La presentación del 28/oct es un antecedente concluido según el propietario, no la siguiente etapa técnica. Este documento no autoriza implementar la propuesta completa.

## 1. Copias y cambios que deben conservarse

- Backend de desarrollo revisado: `C:/Users/LENOVO 14ALC6/Desktop/SaberPlus-Backend`, HEAD inicial `b67f067`, con modificaciones locales de ESLint y documentación. Rama de esta revisión: `chore/retoma-pagos-licencias-20261031`, creada desde la rama de trabajo anterior sin borrar sus cambios.
- El worktree `Desktop/ov1-backend-audit` figura prunable: no se puede presumir disponible ni integrado. La copia `Desktop/SaberPLus/SaberPlus-Backend` está en `main`, HEAD `5e55b79`: no es la copia de los avances C5/H3 revisados.
- Flutter: `Desktop/SaberPLus/saber_plus`, HEAD inicial `edf40cb`, con numerosos cambios sin commit de presentación, lecciones, actividades y pruebas. No reset, stash automático, mezcla de worktrees ni pull sobre cambios sin conciliar.
- La propuesta [PR #14](https://github.com/Pavel2020123/SaberPlus-Backend/pull/14), rama `docs/propuesta-licencias-institucionales-2026-10-29`, está fusionada; merge `2497780e17ef68ab030fb14dd74a0af9e353647b`. Cambia únicamente `backend/docs/PROPUESTA_COMERCIAL_CUENTAS_INSTITUCIONALES_2026_10_29.md`. Se leyó remotamente: no se hizo pull/merge local ni se implementó código.

## 2. Etapa real al volver

| Frente | Evidencia documental vigente | Retoma / límite |
|---|---|---|
| C5-C2, imágenes en opciones | Cierre local y entrega funcional integrada según actas | No reconstruir C2 ni repetir D8b por notas antiguas. |
| C5-H1/H2, históricos | Cerrados en alcance local | No confundir con toda C5 ni producción. |
| C5-H3 | Última acta: 1/4 guiones Android aprobado | Retomar H3-2 (cuenta/sesión), H3-3 (revocación) y H3-4 (red/recuperación), preparando primero sesión temporal nueva. No reutilizar credenciales/puertos antiguos. |
| ESLint backend L2-B/L3 | Última acta: 229 errores/116 advertencias; 135 suites/1786 pruebas históricas | Recontar antes de corregir. No afirmar que esos números sean resultados nuevos. |
| Profesor e instituciones | Grupos, analíticas, prioridades P3, Pomodoro P4 y aprobaciones tienen implementación local documentada | P5 integrado/staging sigue abierto; la demostración no sustituye el cierre completo. |
| Presentación y mejoras recientes | El propietario confirma presentación satisfactoria; hay cambios locales posteriores al checkpoint | Revisar y respaldar por entregas antes de integrarlos. No declarar todas las incidencias cerradas por el guion demo. |
| Competencias | Requisito documentado, clasificación del prototipo independiente | Analítica por competencias/afirmaciones/evidencias aún pendiente en app/API. No asignar niveles oficiales a porcentajes propios. |
| OV-1 | Responsable independiente; checkpoint local antiguo | Solicitar/revisar entrega real antes de declarar integración. |
| Cuadernillos/PDF | Proyecto separado con editor y tres salidas; propietario probó dos preguntas | No confundir con PDF/offline de C5 ni banco importado a la app. |
| D3 / despliegue / comercial | Abiertos según roadmap | No ejecutar migraciones remotas, publicar ni configurar cobros por esta auditoría. |

Tras H3, C5 conserva PDF/offline, fotos persistentes, evidencias institucionales privadas, almacenamiento/cuotas/versionado/limpieza/respaldos y C5-D integrado. P5, D3 y las demás etapas no se cancelan al introducir licencias.

## 3. Viabilidad técnica de #14: viable por entregas, no un cambio pequeño

| Necesidad | Código existente inspeccionado | Diferencia que debe resolverse |
|---|---|---|
| Institución/cupos/roles | `Institucion`, `Usuario`, membresías, clases; `institucion-acceso.service.ts` | Hoy cupos cuentan usuarios vinculados. Hace falta separar identidad, vínculo y asignación de licencia; no basta cambiar un límite. |
| Vencimiento | `institucion-plan.util.ts` convierte SIN_ANUNCIOS vencido a capacidades GRATIS | #14 pide suspensión educativa de cuentas gestionadas sin conversión automática. Nueva política explícita, compatible con cuentas personales y gestión docente limitada. |
| Autorización | JwtGuard relee usuario/rol y exige cambio de clave inicial; PlanVigenteGuard solo comprueba existencia | Falta verificar derecho institucional en todas las rutas educativas aplicables, no solo login; definir perfil, recuperación, logout y gestión permitidos tras expiración. Considerar sesiones abiertas y descargas/cachés existentes. |
| CSV | `estudiante-import.service.ts`: nombre/correo/contraseña, omisiones, bcrypt, transacción Serializable, cupos; límite 2 MiB | Reutilizar base; faltan previsualización/confirmación, límites de filas y CPU, identificadores generados, claves aleatorias, entrega única y recibos de lote idempotentes. Retentar serialización/concurrencia de forma definida. |
| Usuario institucional | Login DTO valida correo y auth busca `correo` único; `debeCambiarContrasena` ya existe | Añadir identificador/tipo/origen/autoridad explícitos, resolver colisiones y cuentas previas. No inventar correos ni inferir propiedad de cuenta desde `institucionId`. |
| Contratos/renovación parcial | Hay plan/fecha/límites básicos | Faltan contrato, asignaciones por periodo, estados y eventos auditables; renovación/reasignación atómica, sin borrar progreso ni licencias duplicadas. |
| Panel web docente | Hay API de gestión y panel ADMIN/editorial | Panel institucional nuevo/reutilizado con permisos propios. No dar acceso ADMIN al docente ni duplicar su identidad. |
| Eliminación definitiva | Hay retirar estudiante de grupo, no equivale a suprimir su identidad | Operación separada para cuentas gestionadas del ámbito autorizado, revocación, auditoría y política de retención. No implementar `usuario.delete` indiscriminado ni cascadas sin mapa de dependencias. |
| Becas/anuncios | Idea adicional de #14 | Bloque posterior: código de un uso atómico/idempotente, vencimiento y políticas separadas; anuncios no conceden derechos. Viabilidad comercial/financiación no demostrada. |

Las secciones 12-14 de #14 actualizan la sección 6: la intención sí incluye eliminación definitiva por docente autorizado, bajo sus condiciones. No reducirla silenciosamente a desvinculación, pero tampoco confundir la intención de producto con un permiso ya implementado. La revisión jurídica/privacidad para menores sigue siendo requisito externo; esta auditoría no emite dictamen legal.

## 4. Wompi/ePayco y Prisma

Decisión del propietario: no usar estas pasarelas en la app; compras Android por Google Play Billing. Una futura pasarela web se elegirá y diseñará aparte.

Ya estaban retirados los servicios de cobro: `PagosModule` no tiene proveedores ni dependencias de Prisma, y tres rutas heredadas responden 410 sin consultar facturas ni aceptar confirmaciones. Flutter no tiene referencias encontradas a esas pasarelas en lib/test/pubspec. Se conservan rutas de retiro para rechazar clientes/webhooks viejos; no son una integración activa.

Se corrigieron solamente comentarios engañosos de `schema.prisma`. `PagoOrden`, `EstadoPago`, `TipoPlan`, `refPayco`, relaciones de `Usuario`, `Cupon` y `Referido` son legado persistente; su existencia no habilita cobros. No se modificaron migraciones ya escritas, no se creó DROP, no se consultó producción ni se ejecutó Prisma migrate/db push/reset. No se sabe si existen registros reales en cada entorno.

Para retiro físico futuro: inventariar por entorno sin exponer datos, revisar relaciones/retención, acordar respaldo y restauración, decidir archivo/anonimización, preparar migración revisada y solo aplicarla con autorización. Borrar modelos hoy podría perder historial y romper replay de migraciones o relaciones. No reutilizar cupones/referidos monetarios para becas o Play por semejanza de nombre.

Google Play Billing NO se implementó aquí. Necesita productos, cliente Flutter, validación backend de compras y cuenta, restauración, eventos de renovación/reembolso/revocación, idempotencia y pruebas de licencia. Los derechos deben ser neutrales al proveedor, no concedidos por un callback del móvil. No se implementa checkout web alternativo dentro de la app.

## 5. Retoma recomendada para la próxima semana (sin ejecución automática)

1. **R0 — Conciliar estado:** identificar worktree responsable, cambios de presentación/diagnóstico, entrega OV-1 y remoto; respaldar/commits selectivos por frente. No arrastrar todos los cambios locales a un PR comercial.
2. **R1 — Cierre técnico pendiente:** actualizar recuento ESLint, cerrar bloques acotados y preparar/completar H3-2/3/4 en entorno temporal autorizado. Las pruebas antiguas son antecedente, no se inventa repetición.
3. **LIC-0 — Diseño aprobado de #14:** decidir cuenta personal vs gestionada, corte de acceso/vigencia, plazos y reasignación de cupos, importaciones/cuentas previas, borrado/retención y quién puede comprar/administrar. Matriz endpoints × rol × licencia × estado; casos de aceptación antes del SQL.
4. **LIC-1 — Contratos/cupos/vigencia backend:** modelos aditivos compatibles, evaluación autoritativa, renovaciones parciales e idempotencia; pruebas de concurrencia y aislamiento institucional. Empezar con activación administrativa autorizada, sin inventar pago real.
5. **LIC-2 — Altas/CSV/credenciales:** ampliar importador existente, login institucional compatible y recuperación. Verificar que un lote repetido no consuma más plazas.
6. **LIC-3 — Web docente y Flutter:** mismo usuario/API; web para gestión, app para estados educativos. Reutilizar seguimiento/prioridades. Definir experiencia al vencer sin perder borradores/resultados.
7. **LIC-4 — Bajas y supresión:** cuando tipo de cuenta/autoridad/retención estén resueltos, implementar separación suspender/desvincular/eliminar y pruebas de no reactivación.
8. **Billing / becas / competencias:** entregas independientes, no mezclar con una migración enorme; acordar prioridad comercial. Competencias tiene su contrato pedagógico separado, no se pierde del backlog.
9. **P5 y cierre de lanzamiento:** ensayar profesor-estudiante en staging/dispositivos con estados nuevos, revisar migraciones/despliegue/D3 y límites del roadmap. No publicar por haber pasado unitarias.

Primer trabajo al regresar: R0, después R1; se puede redactar LIC-0 mientras se prepara la prueba humana. Cambiar esa prioridad necesita acuerdo, no se asume que aprobar la idea #14 cancele C5.

## 6. Alcance de esta revisión

Se leyeron README e índices, ruta de etapas, actas H3/ESLint, presentación, actividades de inglés, competencias, checkpoint OV-1, propuesta remota #14 y archivos de código citados. No se revisaron íntegramente todos los documentos históricos ni todas las rutas del servidor. La evaluación es preliminar, basada en lectura estática; no es auditoría exhaustiva de seguridad ni certificación de producción. Resultados de pruebas nuevas de pagos/Prisma se registran al terminar la comprobación, aparte de las cifras históricas.

### Comprobaciones ejecutadas en esta revisión

- Jest dirigido: `pagos-retirados.spec.ts`, `institucion-plan.util.spec.ts`, `plan-vigente.guard.spec.ts`: **3 suites, 13 pruebas aprobadas**. Comprueban retiro 410 sin módulos de cobro, capacidades actuales y acceso actual; no prueban la futura propuesta #14.
- `prisma validate`: primer intento no validó por ausencia de `DIRECT_URL`; repetición aprobada con URLs ficticias locales a puerto 1, sin conexión ni secretos reales. No se ejecutó generate/migrate/db push.
- Comparación del esquema contra HEAD eliminando comentarios: tokens funcionales idénticos; tablas/campos/enums/relaciones intactos.
- `git diff --check` sin errores de espacios; advertencias CRLF preexistentes. En Flutter se comprobaron 322 enlaces Markdown de los documentos de entrada revisados, sin destinos faltantes.
- Sin suite global Flutter/backend, recuento ESLint nuevo, Android, PostgreSQL, despliegue, commits ni push. Los resultados antiguos conservan su fecha y alcance.
