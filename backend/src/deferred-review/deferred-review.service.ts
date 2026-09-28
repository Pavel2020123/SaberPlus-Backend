import {
  ConflictException,
  GoneException,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { RepasoDiferido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CARD_IDS, CARD_VERSION } from './card-registry';
import { ReviewEventDto } from './deferred-review.dto';

export const intervals = [1, 3, 7, 14, 30] as const;
export function reviewState(
  previous: RepasoDiferido | null,
  input: ReviewEventDto,
  now: Date,
) {
  if (input.revision !== (previous?.revision ?? 0))
    throw new ConflictException('Revisión desactualizada; recarga la agenda.');
  if (previous && previous.venceEn > now)
    return { estado: 'tooEarly', agenda: previous };
  const paso =
    !previous || input.resultado === 'needsPractice'
      ? 0
      : Math.min(previous.paso + 1, 4);
  return {
    estado: 'scheduled',
    agenda: {
      tarjetaId: input.tarjetaId,
      contenidoVersion: CARD_VERSION,
      paso,
      revision: (previous?.revision ?? 0) + 1,
      revisadoEn: now,
      venceEn: new Date(now.getTime() + intervals[paso] * 86400000),
    },
  };
}
function view(row: Omit<RepasoDiferido, 'usuarioId'>) {
  return {
    tarjetaId: row.tarjetaId,
    contenidoVersion: row.contenidoVersion,
    paso: row.paso,
    revision: row.revision,
    revisadoEn: row.revisadoEn.toISOString(),
    venceEn: row.venceEn.toISOString(),
  };
}
@Injectable()
export class DeferredReviewService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: string) {
    const rows = await this.prisma.repasoDiferido.findMany({
      where: { usuarioId: userId, contenidoVersion: CARD_VERSION },
      orderBy: { tarjetaId: 'asc' },
    });
    return {
      version: 1,
      contenidoVersion: CARD_VERSION,
      agenda: rows.filter((r) => CARD_IDS.has(r.tarjetaId)).map(view),
    };
  }
  async record(userId: string, input: ReviewEventDto) {
    const huella = createHash('sha256')
      .update(
        JSON.stringify([
          input.version,
          input.tarjetaId,
          input.contenidoVersion,
          input.revision,
          input.resultado,
        ]),
      )
      .digest('hex');
    return this.prisma.$transaction(async (tx) => {
      // Per-account serialization covers both card revision and event identity.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`deferred:${userId}`}, 0))`;
      const key = {
        usuarioId_eventoId: { usuarioId: userId, eventoId: input.eventoId },
      };
      const old = await tx.eventoRepasoDiferido.findUnique({ where: key });
      if (old) {
        if (old.huella !== huella)
          throw new ConflictException(
            'ID de evento reutilizado con otro contenido.',
          );
        return old.resultado;
      }
      if (
        input.contenidoVersion !== CARD_VERSION ||
        !CARD_IDS.has(input.tarjetaId)
      )
        throw new GoneException('Tarjeta o versión no disponible.');
      // Bound ledger growth without deleting idempotency receipts.
      const [{ now }] = await tx.$queryRaw<
        { now: Date }[]
      >`SELECT clock_timestamp() AS now`;
      const count = await tx.eventoRepasoDiferido.count({
        where: {
          usuarioId: userId,
          creadoEn: { gte: new Date(now.getTime() - 86400000) },
        },
      });
      if (count >= 500)
        throw new HttpException(
          'Límite diario de sincronización.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      const identity = {
        usuarioId: userId,
        contenidoVersion: CARD_VERSION,
        tarjetaId: input.tarjetaId,
      };
      const previous = await tx.repasoDiferido.findUnique({
        where: { usuarioId_contenidoVersion_tarjetaId: identity },
      });
      const decision = reviewState(previous, input, now);
      if (decision.estado === 'scheduled') {
        await tx.repasoDiferido.upsert({
          where: { usuarioId_contenidoVersion_tarjetaId: identity },
          create: { ...identity, ...decision.agenda },
          update: decision.agenda,
        });
      }
      const result = {
        version: 1,
        eventoId: input.eventoId,
        estado: decision.estado,
        agenda: view(decision.agenda),
      };
      await tx.eventoRepasoDiferido.create({
        data: {
          usuarioId: userId,
          eventoId: input.eventoId,
          huella,
          resultado: result,
        },
      });
      return result;
    });
  }
}
