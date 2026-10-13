# SaberPlus backend — incorporación y coordinación del equipo

13 de octubre de 2026. Esta nota acompaña la [guía operativa completa del repo Flutter](https://github.com/Pavel2020123/saber_plus/blob/main/docs/INICIO_Y_TRABAJO_EN_EQUIPO.md) **propuesta en una rama documental**. Hasta integrar los PR, consultar la guía en la rama de revisión `docs/guia-incorporacion-equipo-20261013`, no asumir que ese enlace a `main` existe. El [reparto](TRABAJO_PARALELO.md) sigue siendo la fuente del acuerdo.

## Frentes activos

- **Propietario:** PR-I5-C2C de logos, después solicitudes/avisos/códigos. [Acta backend](PR_I5_C2_LOGO.md) y acta Flutter del mismo nombre.
- **Compañero:** OV-1A de orientación, después B/C/D. [Checkpoint backend](CHECKPOINT_OV1.md), espejo `docs/CHECKPOINT_OV1.md` en Flutter; no modificar instituciones.

Ambos pueden trabajar en API y Flutter dentro de su módulo. No dividir el equipo por tecnología ni reutilizar la base temporal del otro PC. Los repos son públicamente legibles, pero **hacer push requiere permisos o un fork/PR coordinado**.

## Inicio seguro en backend

1. Clonar `SaberPlus-Backend` aparte de `saber_plus`. Verificar `git status --short`, HEAD, rama, README y `backend/package.json`.
2. Crear/seleccionar una rama por frente **tras actualizar main y comprobar árbol limpio**: `feat/instituciones-c2c` para el propietario o `feat/orientacion-vocacional` para el compañero. No hacer push directo a main.
3. Leer `AGENTS.md` si existe, contrato y tests del módulo; comprobar permisos antes de cambiar entidades. Para OV-1A redactar primero las reglas y pedir aprobación de decisiones no cerradas. No instalar Docker para solo redactar contenido.
4. No editar `schema.prisma`, `app.module.ts`, dependencias, locks o migraciones sin coordinar con el otro responsable. Cada cambio de modelo requiere migración nueva; no alterar migraciones aplicadas. Probar el esquema combinado en PostgreSQL **local aislado**.
5. Registrar fecha, HEAD y rama de ambos repos, comandos y evidencia PASS/FAIL/SKIP, SQL/HTTP/humano, límites y siguiente acción. Actualizar acta propia por prueba; el propietario consolida el roadmap al integrar.
6. Abrir PR revisado hacia main, enlazando el correspondiente de Flutter si hay contratos cruzados; explicar compatibilidad y orden de migraciones/API/cliente. Sin merge, deploy, cambio de visibilidad, push o migración remota automáticos.

## Revisión al terminar

- Verificar tipos, build y tests reales de backend; usar los comandos de `backend/package.json`. No ejecutar `npm run lint` como auditoría de solo lectura sin revisar si corrige archivos.
- Tests con Prisma simulado **no equivalen** a PostgreSQL; APIs HTTP locales no acreditan Android; ensayos locales no acreditan producción.
- Un PR requiere revisión del otro responsable si toca contratos compartidos, permisos, autenticación, migraciones o configuración.
- En la ronda posterior se **propone**, sujeto a nueva aprobación, que el propietario se concentre en académico/profesor/panel y el compañero en insignias/perfiles. No reanudar P5/D3 remotos sin autorización ni conceder insignias no verificadas.

Esta nota no acredita pruebas nuevas ni cambios funcionales.
