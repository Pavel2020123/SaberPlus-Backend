import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrioridadDocente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  preguntaPublicadaWhere,
  subtemaPublicadoWhere,
  temaPublicadoWhere,
} from '../common/contenido-publicado';
import { isGenericCatalogName } from '../admin/academic-classification';
import { InstitucionAccesoService } from './institucion-acceso.service';
import {
  CreateTeacherPriorityDto,
  TeacherPriorityCatalogDto,
} from './teacher-priorities.dto';
import {
  PRIORITY_POLICY,
  priorityApplies,
  priorityDeadline,
  priorityFingerprint,
  priorityProgress,
  prioritySummary,
} from './teacher-priorities.rules';

type Client = Prisma.TransactionClient;

// Prisma guarda estos Timestamp(6) en UTC. Evitar el cast directo de Date a
// timestamp: PostgreSQL podría aplicar la zona local del servidor al parámetro.
const utcTimestamp = (date: Date) =>
  Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

@Injectable()
export class TeacherPrioritiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acceso: InstitucionAccesoService,
  ) {}

  private async teacher(
    actorId: string,
    groupId: string,
    tx: Client,
    requirePlan = true,
  ) {
    const user = await tx.usuario.findUnique({
      where: { id: actorId },
      select: { rol: true, institucionId: true },
    });
    if (!user || !['PROFESOR', 'ADMIN'].includes(user.rol)) {
      throw new ForbiddenException('Se requiere una cuenta docente.');
    }
    const access = await this.acceso.obtenerGrupoGestionable(
      actorId,
      groupId,
      tx,
    );
    if (
      user.institucionId !== access.membresia.institucionId ||
      !['PROFESOR', 'PROPIETARIO', 'ADMINISTRADOR'].includes(
        access.membresia.rol,
      )
    ) {
      throw new ForbiddenException('Membresía docente no disponible.');
    }
    if (requirePlan) {
      const plan = await this.acceso.obtenerCapacidadesInstitucion(
        access.membresia.institucionId,
        tx,
      );
      if (!plan.prioridadesHabilitadas) {
        throw new ForbiddenException(
          'Las prioridades docentes requieren el plan institucional sin anuncios.',
        );
      }
    }
    return access;
  }

  private async student(actorId: string, tx: Client) {
    const user = await tx.usuario.findUnique({
      where: { id: actorId },
      select: { rol: true, institucionId: true },
    });
    if (user?.rol !== 'ESTUDIANTE')
      throw new ForbiddenException('Se requiere una cuenta de estudiante.');
    return user;
  }

  private enrollmentWhere(
    institutionId: string | null,
    studentId?: string,
  ): Prisma.ClaseEstudianteWhereInput {
    // Una cuenta desvinculada no recupera grupos antiguos por un JOIN residual.
    return {
      ...(studentId && { usuarioId: studentId }),
      aceptacionExplicita: true,
      Clase: {
        institucionId: institutionId ?? '00000000-0000-0000-0000-000000000000',
      },
      Usuario: {
        rol: 'ESTUDIANTE',
        institucionId: institutionId ?? '00000000-0000-0000-0000-000000000000',
      },
    };
  }

  private async write<T>(operation: (tx: Client) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        const code =
          error instanceof Prisma.PrismaClientKnownRequestError
            ? error.code
            : null;
        // Colisiones de ID también reintentan: la siguiente lectura valida la huella.
        if ((code === 'P2034' || code === 'P2002') && attempt < 2) continue;
        if (code === 'P2034' || code === 'P2002') {
          throw new ConflictException(
            'Hubo otro cambio simultáneo. Consulta las prioridades antes de reintentar con el mismo ID.',
          );
        }
        throw error;
      }
    }
  }

  async create(
    actorId: string,
    groupId: string,
    dto: CreateTeacherPriorityDto,
  ) {
    return this.write(async (tx) => {
      const { grupo } = await this.teacher(actorId, groupId, tx);
      const now = new Date();
      const fingerprint = priorityFingerprint(actorId, groupId, dto);
      const previous = await tx.prioridadDocente.findUnique({
        where: { id: dto.id },
      });
      if (previous) {
        if (
          previous.huellaSolicitud !== fingerprint ||
          previous.claseId !== groupId
        ) {
          throw new ConflictException('El ID de solicitud ya fue utilizado.');
        }
        // También funciona después del plazo o retiro; no crea ni reactiva nada.
        return {
          version: 1,
          reutilizada: true,
          prioridad: prioritySummary(previous, now),
        };
      }
      const deadline = priorityDeadline(dto.venceEn, now);
      const activeWhere = {
        claseId: groupId,
        retiradoEn: null,
        venceEn: { gt: now },
      };
      const [duplicate, count] = await Promise.all([
        tx.prioridadDocente.findFirst({
          where: {
            ...activeWhere,
            temaId: dto.temaId,
            subtemaId: dto.subtemaId ?? null,
          },
          select: { id: true },
        }),
        tx.prioridadDocente.count({ where: activeWhere }),
      ]);
      if (duplicate)
        throw new ConflictException(
          'Ya hay una prioridad activa para esta selección.',
        );
      if (count >= PRIORITY_POLICY.maximoActivasGrupo)
        throw new ConflictException(
          'El grupo ya tiene diez prioridades activas.',
        );

      const topic = await tx.tema.findFirst({
        where: temaPublicadoWhere({ id: dto.temaId }),
        select: { id: true, nombre: true, area: true },
      });
      if (!topic || isGenericCatalogName(topic.nombre))
        throw new BadRequestException(
          'Selecciona un tema publicado y específico.',
        );
      const subtopic = dto.subtemaId
        ? await tx.subtema.findFirst({
            where: subtemaPublicadoWhere({
              id: dto.subtemaId,
              temaId: topic.id,
            }),
            select: { id: true, nombre: true },
          })
        : null;
      if (
        dto.subtemaId &&
        (!subtopic || isGenericCatalogName(subtopic.nombre))
      ) {
        throw new BadRequestException(
          'El subtema no pertenece al tema publicado.',
        );
      }
      const questions = await tx.pregunta.findMany({
        where: preguntaPublicadaWhere({
          subtema: { temaId: topic.id, ...(subtopic && { id: subtopic.id }) },
        }),
        select: { id: true, subtema: { select: { nombre: true } } },
        orderBy: { id: 'asc' },
        take: PRIORITY_POLICY.maximoPreguntasCatalogo + 1,
      });
      if (questions.length > PRIORITY_POLICY.maximoPreguntasCatalogo) {
        throw new BadRequestException(
          'Esta selección supera 2000 preguntas; elige un subtema más específico.',
        );
      }
      const ids = questions
        .filter((q) => !isGenericCatalogName(q.subtema.nombre))
        .map((q) => q.id);
      if (ids.length < PRIORITY_POLICY.metaPreguntas)
        throw new BadRequestException(
          'Se necesitan al menos cinco preguntas publicadas y clasificadas.',
        );
      const priority = await tx.prioridadDocente.create({
        data: {
          id: dto.id,
          claseId: groupId,
          creadoPorId: actorId,
          huellaSolicitud: fingerprint,
          area: topic.area,
          temaId: topic.id,
          temaNombre: topic.nombre,
          subtemaId: subtopic?.id ?? null,
          subtemaNombre: subtopic?.nombre ?? null,
          preguntaIds: ids,
          metaPreguntas: PRIORITY_POLICY.metaPreguntas,
          creadoEn: now,
          venceEn: deadline,
        },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: grupo.institucionId,
          actorId,
          accion: 'PRIORIDAD_DOCENTE_CREADA',
          detalle: { prioridadId: priority.id, grupoId: groupId },
        },
      });
      return {
        version: 1,
        reutilizada: false,
        prioridad: prioritySummary(priority, now),
      };
    });
  }

  async withdraw(actorId: string, groupId: string, priorityId: string) {
    return this.write(async (tx) => {
      // Se permite retirar después de vencer el plan, pero no crear ni ver informes.
      const { grupo } = await this.teacher(actorId, groupId, tx, false);
      const priority = await tx.prioridadDocente.findFirst({
        where: { id: priorityId, claseId: groupId },
      });
      if (!priority) throw new NotFoundException('Prioridad no disponible.');
      const now = new Date();
      if (priority.retiradoEn)
        return { version: 1, prioridad: prioritySummary(priority, now) };
      const updated = await tx.prioridadDocente.update({
        where: { id: priority.id },
        data: { retiradoEn: now },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: grupo.institucionId,
          actorId,
          accion: 'PRIORIDAD_DOCENTE_RETIRADA',
          detalle: { prioridadId: priorityId, grupoId: groupId },
        },
      });
      return { version: 1, prioridad: prioritySummary(updated, now) };
    });
  }

  async catalog(
    actorId: string,
    groupId: string,
    query: TeacherPriorityCatalogDto,
  ) {
    await this.teacher(actorId, groupId, this.prisma);
    const rows = await this.prisma.subtema.findMany({
      where: subtemaPublicadoWhere({
        ...(query.area && { tema: { area: query.area } }),
      }),
      orderBy: [{ temaId: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * PRIORITY_POLICY.tamanoPagina,
      take: PRIORITY_POLICY.tamanoPagina + 1,
      select: {
        id: true,
        nombre: true,
        tema: { select: { id: true, nombre: true, area: true } },
        _count: { select: { preguntas: { where: preguntaPublicadaWhere() } } },
      },
    });
    await this.teacher(actorId, groupId, this.prisma);
    return {
      version: 1,
      politica: PRIORITY_POLICY,
      pagina: query.pagina,
      hayMas: rows.length > PRIORITY_POLICY.tamanoPagina,
      subtemas: rows
        .slice(0, PRIORITY_POLICY.tamanoPagina)
        .filter(
          (s) =>
            !isGenericCatalogName(s.nombre) &&
            !isGenericCatalogName(s.tema.nombre),
        )
        .map((s) => ({
          id: s.id,
          nombre: s.nombre,
          tema: s.tema,
          preguntasPublicadas: s._count.preguntas,
          asignable: s._count.preguntas >= 5 && s._count.preguntas <= 2000,
        })),
    };
  }

  async listForTeacher(actorId: string, groupId: string, page: number) {
    // Lista de títulos disponible aun sin plan para poder retirar pendientes.
    await this.teacher(actorId, groupId, this.prisma, false);
    const rows = await this.prisma.prioridadDocente.findMany({
      where: { claseId: groupId },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * 20,
      take: 21,
    });
    await this.teacher(actorId, groupId, this.prisma, false);
    return {
      version: 1,
      politica: PRIORITY_POLICY,
      pagina: page,
      hayMas: rows.length > 20,
      prioridades: rows.slice(0, 20).map((p) => prioritySummary(p, new Date())),
    };
  }

  private async counts(
    tx: Client,
    priority: PrioridadDocente,
    studentIds: string[],
    now: Date,
  ) {
    if (!studentIds.length) return new Map<string, number>();
    // IDs parametrizados. PostgreSQL cuenta únicos, no carga historiales ni claves
    // en Node. El límite de cinco expresa cumplimiento, no actividad ilimitada.
    const rows = await tx.$queryRaw<
      { usuarioId: string; cantidad: number }[]
    >(Prisma.sql`
      SELECT ce."usuarioId", evidencia.cantidad
      FROM "ClaseEstudiante" ce
      JOIN "Clase" c ON c.id = ce."claseId"
      JOIN "Usuario" u ON u.id = ce."usuarioId" AND u."institucionId" = c."institucionId"
      CROSS JOIN LATERAL (
        SELECT COUNT(*)::integer AS cantidad FROM (
          SELECT DISTINCT h."preguntaId" FROM "HistorialRespuesta" h
          WHERE h."usuarioId" = ce."usuarioId"
            AND h."preguntaId" IN (${Prisma.join(priority.preguntaIds)})
            AND h."area" = ${priority.area}::"AreaIcfes"
            AND h."fechaRespuesta" >= GREATEST(${utcTimestamp(priority.creadoEn)}, ce."fechaIngreso")
            AND h."fechaRespuesta" < LEAST(${utcTimestamp(priority.venceEn)}, ${utcTimestamp(priority.retiradoEn ?? now)}, ${utcTimestamp(now)})
          LIMIT 5
        ) unicas
      ) evidencia
      WHERE ce."claseId" = ${priority.claseId}::uuid
        AND ce."usuarioId" IN (${Prisma.join(studentIds.map((id) => Prisma.sql`${id}::uuid`))})
        AND ce."aceptacionExplicita" = true AND u.rol = 'ESTUDIANTE'
    `);
    return new Map(rows.map((r) => [r.usuarioId, r.cantidad]));
  }

  private async contentAvailable(tx: Client, priority: PrioridadDocente) {
    const rows = await tx.pregunta.findMany({
      where: preguntaPublicadaWhere({ id: { in: priority.preguntaIds } }),
      select: { id: true },
      take: 5,
    });
    return rows.length >= 5;
  }

  async report(
    actorId: string,
    groupId: string,
    priorityId: string,
    page: number,
  ) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const { grupo } = await this.teacher(actorId, groupId, tx);
        const priority = await tx.prioridadDocente.findFirst({
          where: { id: priorityId, claseId: groupId },
        });
        if (!priority) throw new NotFoundException('Prioridad no disponible.');
        const rows = await tx.claseEstudiante.findMany({
          where: {
            ...this.enrollmentWhere(grupo.institucionId),
            claseId: groupId,
          },
          orderBy: { usuarioId: 'asc' },
          skip: (page - 1) * 20,
          take: 21,
          select: {
            usuarioId: true,
            fechaIngreso: true,
            Usuario: { select: { nombre: true } },
          },
        });
        const now = new Date();
        const members = rows.slice(0, 20);
        const counts = await this.counts(
          tx,
          priority,
          members.map((m) => m.usuarioId),
          now,
        );
        return {
          version: 1,
          politica: PRIORITY_POLICY,
          prioridad: prioritySummary(priority, now),
          contenidoPublicadoSuficiente: await this.contentAvailable(
            tx,
            priority,
          ),
          pagina: page,
          hayMas: rows.length > 20,
          estudiantes: members.map((m) => ({
            id: m.usuarioId,
            nombre: m.Usuario.nombre,
            ...priorityProgress(
              counts.get(m.usuarioId) ?? 0,
              priorityApplies(priority, m.fechaIngreso),
            ),
          })),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const currentAccess = await this.teacher(actorId, groupId, this.prisma);
    // Revalidar también alumnos, no solo docente, después de la consulta privada.
    const stillEnrolled = await this.prisma.claseEstudiante.findMany({
      where: {
        claseId: groupId,
        usuarioId: { in: result.estudiantes.map((s) => s.id) },
        aceptacionExplicita: true,
        Usuario: {
          rol: 'ESTUDIANTE',
          institucionId: currentAccess.grupo.institucionId,
        },
      },
      select: { usuarioId: true },
    });
    const allowed = new Set(stillEnrolled.map((m) => m.usuarioId));
    return {
      ...result,
      estudiantes: result.estudiantes.filter((s) => allowed.has(s.id)),
    };
  }

  async listForStudent(actorId: string, page: number) {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const user = await this.student(actorId, tx);
        const rows = await tx.prioridadDocente.findMany({
          where: {
            clase: {
              ClaseEstudiante: {
                some: this.enrollmentWhere(user.institucionId, actorId),
              },
            },
          },
          orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
          skip: (page - 1) * 20,
          take: 21,
          include: {
            clase: {
              select: {
                nombre: true,
                ClaseEstudiante: {
                  where: this.enrollmentWhere(user.institucionId, actorId),
                  select: { fechaIngreso: true },
                },
              },
            },
          },
        });
        const now = new Date();
        const priorities: Array<
          ReturnType<typeof prioritySummary> &
            ReturnType<typeof priorityProgress> & {
              grupoNombre: string;
              contenidoPublicadoSuficiente: boolean;
            }
        > = [];
        for (const priority of rows.slice(0, 20)) {
          const counts = await this.counts(tx, priority, [actorId], now);
          priorities.push({
            ...prioritySummary(priority, now),
            grupoNombre: priority.clase.nombre,
            contenidoPublicadoSuficiente: await this.contentAvailable(
              tx,
              priority,
            ),
            ...priorityProgress(
              counts.get(actorId) ?? 0,
              priority.clase.ClaseEstudiante.some((m) =>
                priorityApplies(priority, m.fechaIngreso),
              ),
            ),
          });
        }
        return {
          version: 1,
          politica: PRIORITY_POLICY,
          pagina: page,
          hayMas: rows.length > 20,
          prioridades: priorities,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 15000,
      },
    );
    const current = await this.student(actorId, this.prisma);
    const groups = await this.prisma.claseEstudiante.findMany({
      where: this.enrollmentWhere(current.institucionId, actorId),
      select: { claseId: true },
    });
    const allowed = new Set(groups.map((g) => g.claseId));
    return {
      ...result,
      prioridades: result.prioridades.filter((p) => allowed.has(p.grupoId)),
    };
  }
}
