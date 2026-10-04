import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AreaIcfes,
  Dificultad,
  IntentoGuardian,
  Prisma,
  RolUsuario,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';
import { PrismaService } from '../prisma/prisma.service';
import { assertSoloCompetitiveCreationAllowed } from '../competitive/competitive.activation';
import { GUARDIAN_RULES, guardianScore } from './guardian.rules';

type Config = {
  competitive?: boolean;
  area: AreaIcfes;
  dificultad: Dificultad;
  subtemaId?: string;
};
type Submission = {
  preguntaId: string;
  respuestaId: string;
  idempotencyKey: string;
};
type Answer = Submission & { esCorrecta: boolean };
type Snapshot = {
  question: Prisma.JsonObject;
  correctAnswerId: string;
  explanation: string | null;
};

@Injectable()
export class GuardianService {
  constructor(private readonly prisma: PrismaService) {}

  private async locked<T>(
    userId: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    const user = await this.prisma.usuario.findUnique({
      where: { id: userId },
      select: { rol: true },
    });
    if (user?.rol !== RolUsuario.ESTUDIANTE)
      throw new ForbiddenException('Este desafío es para estudiantes.');
    return this.prisma.$transaction(
      async (tx) => {
        // Return a scalar Prisma can deserialize instead of PostgreSQL's void.
        await tx.$queryRaw(
          Prisma.sql`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`guardian:${userId}`}))`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Usuario" WHERE id = ${userId}::uuid FOR UPDATE`,
        );
        const currentUser = await tx.usuario.findUnique({
          where: { id: userId },
          select: { rol: true },
        });
        if (currentUser?.rol !== RolUsuario.ESTUDIANTE)
          throw new ForbiddenException('Student required.');
        return action(tx);
      },
      { timeout: 15000 },
    );
  }

  async start(userId: string, config: Config) {
    if (
      config.competitive !== undefined &&
      typeof config.competitive !== 'boolean'
    )
      throw new BadRequestException('competitive must be boolean');
    return this.locked(userId, async (tx) => {
      const existing = await tx.intentoGuardian.findFirst({
        where: { usuarioId: userId, estado: 'ACTIVO' },
      });
      if (existing) {
        const current = await this.expire(tx, existing);
        if (current.estado === 'ACTIVO') {
          if (
            config.competitive !== undefined &&
            (current.competitiveRulesVersion === 1) !== config.competitive
          )
            throw new ConflictException(
              'Competitive mode cannot change during an attempt.',
            );
          if (
            current.area !== config.area ||
            current.dificultad !== config.dificultad ||
            current.subtemaId !== (config.subtemaId ?? null)
          ) {
            throw new ConflictException(
              'Tienes un desafío en curso. Continúalo o abandónalo antes de cambiar la configuración.',
            );
          }
          return this.publicState(current);
        }
      }
      assertSoloCompetitiveCreationAllowed(config.competitive);
      const candidates = await tx.pregunta.findMany({
        where: preguntaPublicadaWhere({
          dificultad: config.dificultad,
          ...(config.subtemaId ? { subtemaId: config.subtemaId } : {}),
          subtema: { tema: { area: config.area } },
        }),
        include: {
          respuestas: true,
          subtema: { include: { tema: true } },
          caso: true,
        },
        take: 300,
        orderBy: { id: 'asc' },
      });
      const valid = candidates.filter(
        (q) =>
          q.respuestas.length >= 2 &&
          (!config.competitive ||
            (q.respuestas.length <= 6 &&
              q.enunciado.trim().length > 0 &&
              q.respuestas.every((a) => a.texto.trim().length > 0))) &&
          q.respuestas.filter((a) => a.esCorrecta).length === 1,
      );
      if (valid.length < GUARDIAN_RULES.questions)
        throw new BadRequestException(
          'Se necesitan al menos 8 preguntas publicadas y válidas para esta área, dificultad y subtema. Prueba otra selección.',
        );
      for (let i = valid.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [valid[i], valid[j]] = [valid[j], valid[i]];
      }
      const snapshots: Snapshot[] = valid
        .slice(0, GUARDIAN_RULES.questions)
        .map((q) => ({
          question: {
            id: q.id,
            enunciado: q.enunciado,
            imagenUrl: q.imagenUrl,
            dificultad: q.dificultad,
            ordenEnCaso: q.ordenEnCaso,
            respuestas: q.respuestas.map((a) => ({ id: a.id, texto: a.texto })),
            subtema: {
              id: q.subtema.id,
              nombre: q.subtema.nombre,
              tema: {
                id: q.subtema.tema.id,
                nombre: q.subtema.tema.nombre,
                area: q.subtema.tema.area,
              },
            },
            caso: q.caso
              ? {
                  id: q.caso.id,
                  titulo: q.caso.titulo,
                  contexto: q.caso.contexto,
                  imagenUrl: q.caso.imagenUrl,
                }
              : null,
          },
          correctAnswerId: q.respuestas.find((a) => a.esCorrecta)!.id,
          explanation: q.explicacion,
        }));
      const now = new Date();
      const attempt = await tx.intentoGuardian.create({
        data: {
          usuarioId: userId,
          competitiveRulesVersion: config.competitive === true ? 1 : null,
          area: config.area,
          dificultad: config.dificultad,
          subtemaId: config.subtemaId,
          preguntas: snapshots as unknown as Prisma.InputJsonValue,
          creadoEn: now,
          venceEn: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        },
      });
      return this.publicState(attempt);
    });
  }

  async active(userId: string) {
    return this.locked(userId, async (tx) => {
      const attempt = await tx.intentoGuardian.findFirst({
        where: { usuarioId: userId, estado: 'ACTIVO' },
      });
      if (!attempt) return null;
      const current = await this.expire(tx, attempt);
      return current.estado === 'ACTIVO' ? this.publicState(current) : null;
    });
  }

  async get(userId: string, id: string) {
    return this.locked(userId, async (tx) =>
      this.publicState(await this.owned(tx, userId, id)),
    );
  }

  async answer(userId: string, id: string, input: Submission) {
    return this.locked(userId, async (tx) => {
      const attempt = await this.owned(tx, userId, id);
      const answers = attempt.respuestas as unknown as Answer[];
      const repeated = answers.find(
        (a) => a.idempotencyKey === input.idempotencyKey,
      );
      if (repeated) {
        if (
          repeated.preguntaId !== input.preguntaId ||
          repeated.respuestaId !== input.respuestaId
        )
          throw new ConflictException(
            'La clave de envío ya se usó con otra respuesta.',
          );
        return this.publicState(attempt);
      }
      // Devolver el estado vencido permite cerrar la pantalla sin reintentar un envío imposible.
      if (attempt.estado === 'EXPIRADO') return this.publicState(attempt);
      if (attempt.estado !== 'ACTIVO')
        throw new ConflictException('El desafío ya terminó.');
      const snapshots = attempt.preguntas as unknown as Snapshot[];
      const current = snapshots[answers.length];
      if (!current || current.question.id !== input.preguntaId)
        throw new ConflictException(
          'La pregunta ya fue respondida o no es la actual. Sincroniza la partida.',
        );
      const options = current.question.respuestas as Prisma.JsonObject[];
      if (!options.some((a) => a.id === input.respuestaId))
        throw new BadRequestException(
          'La respuesta no pertenece a esta pregunta.',
        );
      const next = [
        ...answers,
        {
          preguntaId: input.preguntaId,
          respuestaId: input.respuestaId,
          idempotencyKey: input.idempotencyKey,
          esCorrecta: current.correctAnswerId === input.respuestaId,
        },
      ];
      const score = guardianScore(next);
      const updated = await tx.intentoGuardian.update({
        where: { id },
        data: {
          respuestas: next as unknown as Prisma.InputJsonValue,
          estado: score.estado,
          finalizadoEn: score.estado === 'ACTIVO' ? null : new Date(),
        },
      });
      return this.publicState(updated);
    });
  }

  async abandon(userId: string, id: string) {
    return this.locked(userId, async (tx) => {
      const attempt = await this.owned(tx, userId, id);
      if (attempt.estado !== 'ACTIVO') return this.publicState(attempt);
      return this.publicState(
        await tx.intentoGuardian.update({
          where: { id },
          data: { estado: 'ABANDONADO', finalizadoEn: new Date() },
        }),
      );
    });
  }

  private async owned(
    tx: Prisma.TransactionClient,
    userId: string,
    id: string,
  ) {
    const attempt = await tx.intentoGuardian.findFirst({
      where: { id, usuarioId: userId },
    });
    if (!attempt) throw new NotFoundException('Desafío no encontrado.');
    return this.expire(tx, attempt);
  }

  private async expire(tx: Prisma.TransactionClient, attempt: IntentoGuardian) {
    if (
      attempt.estado === 'ACTIVO' &&
      attempt.venceEn.getTime() <= Date.now()
    ) {
      return tx.intentoGuardian.update({
        where: { id: attempt.id },
        data: {
          estado: 'EXPIRADO',
          finalizadoEn:
            attempt.competitiveRulesVersion === 1
              ? attempt.venceEn
              : new Date(),
        },
      });
    }
    return attempt;
  }

  private publicState(attempt: IntentoGuardian) {
    const snapshots = attempt.preguntas as unknown as Snapshot[];
    const answers = attempt.respuestas as unknown as Answer[];
    return {
      id: attempt.id,
      competitive: attempt.competitiveRulesVersion === 1,
      area: attempt.area,
      dificultad: attempt.dificultad,
      subtemaId: attempt.subtemaId,
      reglas: GUARDIAN_RULES,
      venceEn: attempt.venceEn,
      ...guardianScore(answers),
      estado: attempt.estado,
      // Solo la pregunta actual; las soluciones se revelan después de responder.
      pregunta:
        attempt.estado === 'ACTIVO'
          ? (snapshots[answers.length]?.question ?? null)
          : null,
      revision: answers.map((answer, index) => ({
        pregunta: snapshots[index].question,
        respuestaId: answer.respuestaId,
        esCorrecta: answer.esCorrecta,
        respuestaCorrectaId: snapshots[index].correctAnswerId,
        explicacion: snapshots[index].explanation,
      })),
    };
  }
}
