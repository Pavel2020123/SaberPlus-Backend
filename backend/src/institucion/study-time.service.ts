import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentEvidenceService } from './student-evidence.service';
import { POMODORO_EVENT_ID, SyncPomodorosDto } from './study-time.dto';
import {
  STUDY_TIME_LIMIT,
  STUDY_TIME_ORIGINS,
  STUDY_TIME_POLICY,
  studyWindow,
  summarizeStudyTime,
} from './study-time.rules';

@Injectable()
export class StudyTimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: StudentEvidenceService,
  ) {}

  private async requireRole(
    actorId: string,
    role: RolUsuario,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await db.usuario.findUnique({
      where: { id: actorId },
      select: { rol: true },
    });
    if (user?.rol !== role)
      throw new ForbiddenException(
        'La sesión no tiene acceso a este registro de estudio.',
      );
  }

  async synchronize(actorId: string, dto: SyncPomodorosDto) {
    if (
      dto.version !== 1 ||
      !Array.isArray(dto.eventos) ||
      dto.eventos.length < 1 ||
      dto.eventos.length > 50
    ) {
      throw new BadRequestException('Lote de Pomodoros inválido.');
    }
    const ids = new Set<string>();
    const events = dto.eventos.map((event) => {
      const endedAt = new Date(event.finalizadoEn);
      if (
        !POMODORO_EVENT_ID.test(event.eventoId) ||
        ids.has(event.eventoId) ||
        event.duracionSegundos !== 1500 ||
        !Number.isFinite(endedAt.getTime()) ||
        !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(event.finalizadoEn)
      ) {
        throw new BadRequestException(
          'El bloque requiere ID estable, 25 minutos y fecha con zona; no repitas IDs en el lote.',
        );
      }
      ids.add(event.eventoId);
      return { id: event.eventoId, endedAt };
    });
    for (let retry = 0; retry < 3; retry++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            // Serializa todos los bloques del mismo alumno, incluso con IDs distintos.
            // Consulta parametrizada: nunca aceptar un usuario enviado por el cliente.
            await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${actorId}::uuid FOR UPDATE`;
            await this.requireRole(actorId, RolUsuario.ESTUDIANTE, tx);
            const now = new Date();
            const oldest = new Date(now.getTime() - 90 * 86400000);
            const confirmed: {
              eventoId: string;
              finalizadoEn: string;
              duracionSegundos: number;
              reutilizado: boolean;
            }[] = [];
            for (const event of events) {
              const existing = await tx.pomodoroRegistrado.findUnique({
                where: {
                  usuarioId_eventoId: {
                    usuarioId: actorId,
                    eventoId: event.id,
                  },
                },
              });
              if (existing) {
                if (
                  existing.finalizadoEn.getTime() !== event.endedAt.getTime()
                ) {
                  throw new ConflictException(
                    'Ese ID de Pomodoro ya se registró con otra fecha. Conserva la solicitud original.',
                  );
                }
                // Se reconoce un reintento aun después de vencer la ventana de subida.
                confirmed.push({
                  eventoId: event.id,
                  finalizadoEn: existing.finalizadoEn.toISOString(),
                  duracionSegundos: 1500,
                  reutilizado: true,
                });
                continue;
              }
              if (event.endedAt > now || event.endedAt < oldest) {
                throw new BadRequestException(
                  'El Pomodoro debe haber terminado en los últimos 90 días, sin fechas futuras. Revisa el reloj del dispositivo.',
                );
              }
              const overlaps = await tx.pomodoroRegistrado.findFirst({
                where: {
                  usuarioId: actorId,
                  finalizadoEn: {
                    gt: new Date(event.endedAt.getTime() - 1500000),
                    lt: new Date(event.endedAt.getTime() + 1500000),
                  },
                },
                select: { eventoId: true },
              });
              if (overlaps)
                throw new ConflictException(
                  'No se pueden registrar dos Pomodoros completos separados por menos de 25 minutos.',
                );
              await tx.pomodoroRegistrado.create({
                data: {
                  usuarioId: actorId,
                  eventoId: event.id,
                  finalizadoEn: event.endedAt,
                  duracionSegundos: 1500,
                },
              });
              confirmed.push({
                eventoId: event.id,
                finalizadoEn: event.endedAt.toISOString(),
                duracionSegundos: 1500,
                reutilizado: false,
              });
            }
            return {
              version: 1,
              confirmados: confirmed,
              politica: STUDY_TIME_POLICY,
            };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          ['P2034', 'P2002'].includes(error.code)
        ) {
          if (retry < 2) continue;
          throw new ConflictException(
            'Hubo otra sincronización. Reintenta conservando los mismos IDs.',
          );
        }
        throw error;
      }
    }
    throw new ConflictException('Reintenta la sincronización.');
  }

  private async summary(studentId: string, days: number) {
    if (![7, 30, 90].includes(days))
      throw new BadRequestException('Elige 7, 30 o 90 días.');
    const now = new Date();
    const { start, end } = studyWindow(now, days);
    return this.prisma.$transaction(
      async (tx) => {
        const [answers, pomodoros] = await Promise.all([
          tx.historialRespuesta.findMany({
            where: {
              usuarioId: studentId,
              origen: { in: STUDY_TIME_ORIGINS },
              fechaRespuesta: { gte: start, lte: end },
            },
            orderBy: [{ fechaRespuesta: 'asc' }, { id: 'asc' }],
            take: STUDY_TIME_LIMIT + 1,
            select: {
              id: true,
              sesionId: true,
              preguntaId: true,
              origen: true,
              esCorrecta: true,
              tiempoRespuestaSegundos: true,
              fechaRespuesta: true,
            },
          }),
          tx.pomodoroRegistrado.findMany({
            where: {
              usuarioId: studentId,
              finalizadoEn: { gte: start, lte: end },
            },
            select: {
              eventoId: true,
              finalizadoEn: true,
              duracionSegundos: true,
            },
            orderBy: { finalizadoEn: 'asc' },
          }),
        ]);
        return summarizeStudyTime(answers, pomodoros, now, days);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async ownSummary(actorId: string, days: number) {
    await this.requireRole(actorId, RolUsuario.ESTUDIANTE);
    const result = await this.summary(actorId, days);
    await this.requireRole(actorId, RolUsuario.ESTUDIANTE);
    return result;
  }

  async teacherSummary(actorId: string, studentId: string, days: number) {
    await this.requireRole(actorId, RolUsuario.PROFESOR);
    await this.scope.estudianteAutorizado(actorId, studentId);
    const evolucion = await this.summary(studentId, days);
    await this.requireRole(actorId, RolUsuario.PROFESOR);
    const student = await this.scope.estudianteAutorizado(actorId, studentId);
    return {
      version: 1,
      estudiante: {
        id: student.id,
        nombre: student.nombre,
        grupos: student.ClaseEstudiante.map((item) => item.Clase),
      },
      evolucion,
    };
  }
}
