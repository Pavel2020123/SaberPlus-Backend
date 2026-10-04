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
  IntentoCima,
  Prisma,
  RolUsuario,
} from '@prisma/client';
import { randomInt } from 'node:crypto';
import { preguntaPublicadaWhere } from '../common/contenido-publicado';
import { PrismaService } from '../prisma/prisma.service';
import { assertSoloCompetitiveCreationAllowed } from '../competitive/competitive.activation';
import { SUMMIT_RULES, summitScore } from './summit.rules';

type Config = {
  competitive?: boolean;
  area: AreaIcfes;
  dificultad?: Dificultad;
  temaId?: string;
  subtemaId?: string;
};
type Submission = {
  preguntaId: string;
  respuestaId: string;
  idempotencyKey: string;
};
type Answer = Submission & { esCorrecta: boolean };
type Snapshot = { question: Prisma.JsonObject; correctAnswerId: string };
const include = {
  respuestas: true,
  subtema: { include: { tema: true } },
  caso: true,
} as const;
type Candidate = Prisma.PreguntaGetPayload<{ include: typeof include }>;

@Injectable()
export class SummitService {
  constructor(private readonly prisma: PrismaService) {}

  private locked<T>(
    userId: string,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        // A scalar avoids Prisma's unsupported PostgreSQL void return type.
        await tx.$queryRaw(
          Prisma.sql`SELECT 1::int AS locked FROM pg_advisory_xact_lock(hashtext(${`summit:${userId}`}))`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM "Usuario" WHERE id = ${userId}::uuid FOR UPDATE`,
        );
        const user = await tx.usuario.findUnique({
          where: { id: userId },
          select: { rol: true },
        });
        if (user?.rol !== RolUsuario.ESTUDIANTE)
          throw new ForbiddenException('Este juego es para estudiantes.');
        return action(tx);
      },
      { timeout: 20000 },
    );
  }

  async start(userId: string, config: Config) {
    if (
      config.competitive !== undefined &&
      typeof config.competitive !== 'boolean'
    )
      throw new BadRequestException('competitive must be boolean');
    return this.locked(userId, async (tx) => {
      const existing = await tx.intentoCima.findFirst({
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
            current.dificultad !== (config.dificultad ?? null) ||
            current.temaId !== (config.temaId ?? null) ||
            current.subtemaId !== (config.subtemaId ?? null)
          ) {
            throw new ConflictException(
              'Continúa o abandona tu partida actual antes de cambiar los filtros.',
            );
          }
          return this.publicState(current);
        }
      }
      assertSoloCompetitiveCreationAllowed(config.competitive);
      const picked = await this.pickQuestions(tx, config);
      if (picked.length < SUMMIT_RULES.questions) {
        throw new BadRequestException(
          'Se necesitan 12 preguntas distintas, publicadas y válidas para estos filtros. No se creó una partida.',
        );
      }
      // Randomize both the sample and its order; never send future snapshots.
      for (let i = picked.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [picked[i], picked[j]] = [picked[j], picked[i]];
      }
      const now = new Date();
      return this.publicState(
        await tx.intentoCima.create({
          data: {
            usuarioId: userId,
            competitiveRulesVersion: config.competitive === true ? 1 : null,
            area: config.area,
            temaId: config.temaId ?? null,
            subtemaId: config.subtemaId ?? null,
            dificultad: config.dificultad ?? null,
            preguntas: picked.map((q) => this.snapshot(q)),
            creadoEn: now,
            venceEn: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        }),
      );
    });
  }

  private async pickQuestions(tx: Prisma.TransactionClient, config: Config) {
    const sample: Candidate[] = [];
    let cursor: string | undefined;
    let seen = 0;
    // Scan pages instead of silently ignoring all questions after the first 300.
    // Reservoir sampling keeps only 12 candidates in memory across a large bank.
    for (;;) {
      const page = await tx.pregunta.findMany({
        where: preguntaPublicadaWhere({
          ...(config.dificultad ? { dificultad: config.dificultad } : {}),
          ...(config.subtemaId ? { subtemaId: config.subtemaId } : {}),
          subtema: {
            tema: {
              area: config.area,
              ...(config.temaId ? { id: config.temaId } : {}),
            },
          },
        }),
        include,
        orderBy: { id: 'asc' },
        take: 200,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      for (const q of page) {
        if (
          !q.enunciado.trim() ||
          q.respuestas.length < 2 ||
          q.respuestas.length > 6 ||
          q.respuestas.some((a) => !a.texto.trim()) ||
          q.respuestas.filter((a) => a.esCorrecta).length !== 1
        )
          continue;
        seen++;
        if (sample.length < SUMMIT_RULES.questions) sample.push(q);
        else {
          const index = randomInt(seen);
          if (index < SUMMIT_RULES.questions) sample[index] = q;
        }
      }
      if (page.length < 200) break;
      cursor = page[page.length - 1].id;
    }
    return sample;
  }

  private snapshot(q: Candidate): Snapshot {
    return {
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
      correctAnswerId: q.respuestas.find((a) => a.esCorrecta).id,
    };
  }

  async active(userId: string) {
    return this.locked(userId, async (tx) => {
      const attempt = await tx.intentoCima.findFirst({
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
            'La clave de envío ya corresponde a otra respuesta.',
          );
        return this.publicState(attempt);
      }
      if (attempt.estado === 'EXPIRADO') return this.publicState(attempt);
      if (attempt.estado !== 'ACTIVO')
        throw new ConflictException('La partida ya terminó.');
      const current = (attempt.preguntas as unknown as Snapshot[])[
        answers.length
      ];
      if (!current || current.question.id !== input.preguntaId)
        throw new ConflictException(
          'Esa no es la pregunta actual. Recupera la partida.',
        );
      if (
        !(current.question.respuestas as Prisma.JsonObject[]).some(
          (a) => a.id === input.respuestaId,
        )
      )
        throw new BadRequestException(
          'La opción no pertenece a esta pregunta.',
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
      const score = summitScore(next);
      return this.publicState(
        await tx.intentoCima.update({
          where: { id },
          data: {
            respuestas: next,
            estado: score.estado,
            finalizadoEn: score.estado === 'ACTIVO' ? null : new Date(),
          },
        }),
      );
    });
  }

  async abandon(userId: string, id: string) {
    return this.locked(userId, async (tx) => {
      const attempt = await this.owned(tx, userId, id);
      if (attempt.estado !== 'ACTIVO') return this.publicState(attempt);
      return this.publicState(
        await tx.intentoCima.update({
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
    const attempt = await tx.intentoCima.findFirst({
      where: { id, usuarioId: userId },
    });
    if (!attempt) throw new NotFoundException('Partida no encontrada.');
    if (attempt.version !== SUMMIT_RULES.version)
      throw new ConflictException('Versión de partida no compatible.');
    return this.expire(tx, attempt);
  }

  private async expire(tx: Prisma.TransactionClient, attempt: IntentoCima) {
    if (
      attempt.estado === 'ACTIVO' &&
      attempt.venceEn.getTime() <= Date.now()
    ) {
      return tx.intentoCima.update({
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

  private publicState(attempt: IntentoCima) {
    if (attempt.version !== SUMMIT_RULES.version)
      throw new ConflictException('Versión de partida no compatible.');
    const answers = attempt.respuestas as unknown as Answer[];
    const score = summitScore(answers);
    const last = answers[answers.length - 1];
    return {
      id: attempt.id,
      competitive: attempt.competitiveRulesVersion === 1,
      area: attempt.area,
      temaId: attempt.temaId,
      subtemaId: attempt.subtemaId,
      dificultad: attempt.dificultad,
      reglas: SUMMIT_RULES,
      venceEn: attempt.venceEn,
      ...score,
      estado: attempt.estado,
      pregunta:
        attempt.estado === 'ACTIVO'
          ? (attempt.preguntas as unknown as Snapshot[])[answers.length]
              .question
          : null,
      ultimaRespuesta: last
        ? {
            preguntaId: last.preguntaId,
            respuestaId: last.respuestaId,
            esCorrecta: last.esCorrecta,
            movimiento: score.ultimoMovimiento,
          }
        : null,
      // No explanations/solutions during play; no unpublished bank or idempotency keys.
    };
  }
}
