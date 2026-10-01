import { Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  EventoXpCompetitivo,
  FuenteXpCompetitivo,
  Prisma,
  TipoEventoXpCompetitivo,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompetitiveSource,
  CompetitiveVerifierRegistry,
  SOURCE_FOR_GAME,
  VerifiedTerminal,
} from './competitive.contracts';
import {
  ABANDONMENT_PENALTY,
  abandonmentWinXp,
  applyDelta,
  gameId,
  integer,
  normalXp,
  requireEvidence,
  XP_RULES_VERSION,
} from './competitive.rules';
import { competitiveSeason, validDate } from './competitive.policy';
import { canonicalSourceId } from './competitive.source';

function canonical(value: unknown): string {
  if (value instanceof Date) {
    validDate(value);
    return JSON.stringify(value.toISOString());
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return JSON.stringify(value);
  if (typeof value === 'number') {
    requireEvidence(Number.isFinite(value));
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  requireEvidence(typeof value === 'object' && value !== null);
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}
export const competitiveHash = (value: unknown): string =>
  createHash('sha256').update(canonical(value)).digest('hex');
function uuid(value: string): void {
  requireEvidence(
    typeof value === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        value,
      ),
  );
}
function validateSource(source: CompetitiveSource): void {
  uuid(source.participantId);
  requireEvidence(
    Object.values(FuenteXpCompetitivo).includes(source.sourceType),
  );
  requireEvidence(
    typeof source.sourceId === 'string' &&
      source.sourceId.trim().length > 0 &&
      source.sourceId.length <= 120,
  );
  requireEvidence(
    source.sourceType !== 'MEMORY_ATTEMPT',
    'MEMORY_COMPETITIVE_DISABLED',
  );
}
export interface CompetitiveCorrection {
  operationId: string;
  originalEventId: string;
  actorId: string;
  reason: string;
  nominalDelta: number;
  kind: 'CORRECCION';
}
type Posting = {
  source: CompetitiveSource;
  gameId: VerifiedTerminal['gameId'];
  season: number;
  effectiveAt: Date;
  institutionId: string | null;
  key: string;
  hash: string;
  settlement: string;
  kind: TipoEventoXpCompetitivo;
  nominal: number;
  originalId?: string;
  actorId?: string;
  reason?: string;
};

/** Internal application service; no endpoint, only trusted registered verifiers. */
@Injectable()
export class CompetitiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly verifiers: CompetitiveVerifierRegistry,
  ) {}

  async settle(
    source: CompetitiveSource,
    rulesVersion: number = XP_RULES_VERSION,
  ): Promise<EventoXpCompetitivo> {
    requireEvidence(
      rulesVersion === XP_RULES_VERSION,
      'UNSUPPORTED_RULES_VERSION',
    );
    validateSource(source);
    source = {
      ...source,
      participantId: source.participantId.toLowerCase(),
      sourceId: canonicalSourceId(source.sourceType, source.sourceId),
    };
    const verifier = this.verifiers.get(source.sourceType);
    // Shared TRIVIA_ATTEMPT identity prevents paying the same attempt as Trivia and Duelo.
    const key = competitiveHash([
      source.sourceType,
      source.sourceId,
      source.participantId,
      'SETTLEMENT',
    ]);
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `source:${key}`);
        const prior = await tx.eventoXpCompetitivo.findUnique({
          where: { idempotencyKey: key },
        });
        await this.lockStudent(tx, source.participantId);
        const terminal = await verifier.loadTerminal(tx, source);
        this.validateTerminal(source, terminal);
        const hash = competitiveHash(terminal);
        if (prior) {
          requireEvidence(prior.evidenciaHash === hash, 'IDEMPOTENCY_CONFLICT');
          return prior;
        }
        const resolution = terminal.resolution;
        let nominal: number;
        if (resolution.kind === 'RESULTADO') {
          requireEvidence(resolution.facts.gameId === terminal.gameId);
          nominal = normalXp(resolution.facts);
        } else if (resolution.kind === 'ABANDONO') {
          requireEvidence(
            resolution.definitive === true,
            'ABANDONMENT_NOT_DEFINITIVE',
          );
          nominal = ABANDONMENT_PENALTY[terminal.gameId];
        } else {
          requireEvidence(
            resolution.kind === 'VICTORIA_POR_ABANDONO' &&
              resolution.facts.gameId === terminal.gameId,
          );
          requireEvidence(resolution.facts.bothAbsent === false, 'NO_WINNER');
          nominal = abandonmentWinXp(resolution.facts);
        }
        const membership = await tx.historialInstitucionCompetitiva.findFirst({
          where: {
            usuarioId: source.participantId,
            desde: { lte: terminal.terminalAt },
          },
          orderBy: [{ desde: 'desc' }, { id: 'desc' }],
        });
        requireEvidence(membership, 'HISTORICAL_MEMBERSHIP_UNKNOWN');
        return this.post(tx, {
          source,
          gameId: terminal.gameId,
          season: competitiveSeason(terminal.terminalAt),
          effectiveAt: terminal.terminalAt,
          institutionId: membership.institucionId,
          key,
          hash,
          settlement: 'SETTLEMENT',
          kind: resolution.kind,
          nominal,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
  }

  async correct(request: CompetitiveCorrection): Promise<EventoXpCompetitivo> {
    uuid(request.operationId);
    uuid(request.originalEventId);
    uuid(request.actorId);
    // PostgreSQL UUIDs are case-insensitive; idempotency must use the same identity.
    request = {
      ...request,
      operationId: request.operationId.toLowerCase(),
      originalEventId: request.originalEventId.toLowerCase(),
      actorId: request.actorId.toLowerCase(),
    };
    integer(request.nominalDelta, -2_147_483_647, 2_147_483_647);
    requireEvidence(
      request.kind === 'CORRECCION',
      'UNSUPPORTED_CORRECTION_KIND',
    );
    requireEvidence(
      typeof request.reason === 'string' &&
        request.reason.trim().length > 0 &&
        request.reason.length <= 500,
    );
    const key = competitiveHash(['CORRECTION', request.operationId]);
    const hash = competitiveHash(request);
    return this.prisma.$transaction(
      async (tx) => {
        await this.lock(tx, `source:${key}`);
        const actor = await tx.$queryRaw<
          { rol: string }[]
        >`SELECT rol FROM "Usuario" WHERE id = ${request.actorId}::uuid FOR SHARE`;
        requireEvidence(actor[0]?.rol === 'ADMIN', 'ADMIN_REQUIRED');
        const prior = await tx.eventoXpCompetitivo.findUnique({
          where: { idempotencyKey: key },
        });
        if (prior) {
          requireEvidence(prior.evidenciaHash === hash, 'IDEMPOTENCY_CONFLICT');
          return prior;
        }
        const original = await tx.eventoXpCompetitivo.findUnique({
          where: { id: request.originalEventId },
        });
        requireEvidence(original, 'ORIGINAL_EVENT_NOT_FOUND');
        await this.lockStudent(tx, original.usuarioId);
        requireEvidence(
          original.gameId !== 'MEMORY_MATCH',
          'MEMORY_COMPETITIVE_DISABLED',
        );
        return this.post(tx, {
          source: {
            sourceType: original.sourceType,
            sourceId: original.sourceId,
            participantId: original.usuarioId,
          },
          gameId: original.gameId,
          season: original.temporada,
          effectiveAt: original.fechaEfectiva,
          institutionId: original.institucionId,
          key,
          hash,
          settlement: request.operationId,
          kind: request.kind,
          nominal: request.nominalDelta,
          originalId: original.id,
          actorId: request.actorId,
          reason: request.reason,
        });
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 20_000,
      },
    );
  }

  private validateTerminal(
    source: CompetitiveSource,
    terminal: VerifiedTerminal,
  ): void {
    requireEvidence(
      competitiveHash(source) === competitiveHash(terminal.source),
      'SOURCE_MISMATCH',
    );
    gameId(terminal.gameId);
    requireEvidence(
      terminal.gameId !== 'MEMORY_MATCH',
      'MEMORY_COMPETITIVE_DISABLED',
    );
    requireEvidence(
      SOURCE_FOR_GAME[terminal.gameId] === source.sourceType,
      'SOURCE_MISMATCH',
    );
    requireEvidence(
      terminal.competitiveOnline === true && terminal.validParticipant === true,
      'INELIGIBLE_SOURCE',
    );
    validDate(terminal.startedAt);
    validDate(terminal.terminalAt);
    requireEvidence(
      terminal.startedAt <= terminal.terminalAt &&
        terminal.terminalAt.getTime() <= Date.now(),
    );
    requireEvidence(/^[a-f0-9]{64}$/.test(terminal.evidenceHash));
  }
  private async lock(tx: Prisma.TransactionClient, key: string): Promise<void> {
    await tx.$queryRaw`SELECT 1::int FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
  private async lockStudent(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<void> {
    const user = await tx.$queryRaw<
      { rol: string }[]
    >`SELECT rol FROM "Usuario" WHERE id = ${id}::uuid FOR UPDATE`;
    requireEvidence(user[0]?.rol === 'ESTUDIANTE', 'STUDENT_REQUIRED');
  }
  private async post(
    tx: Prisma.TransactionClient,
    p: Posting,
  ): Promise<EventoXpCompetitivo> {
    await this.lock(
      tx,
      `balance:${p.source.participantId}:${p.gameId}:${p.season}`,
    );
    const where = {
      usuarioId_gameId_temporada: {
        usuarioId: p.source.participantId,
        gameId: p.gameId,
        temporada: p.season,
      },
    };
    await tx.balanceCompetitivo.upsert({
      where,
      update: {},
      create: { ...where.usuarioId_gameId_temporada },
    });
    // Explicit row lock also serializes with maintenance writers using PostgreSQL row locks.
    await tx.$queryRaw`SELECT xp FROM "BalanceCompetitivo" WHERE "usuarioId" = ${p.source.participantId}::uuid AND "gameId" = ${p.gameId}::"JuegoCompetitivo" AND temporada = ${p.season} FOR UPDATE`;
    const locked = await tx.balanceCompetitivo.findUniqueOrThrow({ where });
    const delta = applyDelta(locked.xp, p.nominal);
    integer(locked.version + 1, 1, 2_147_483_647);
    const [clock] = await tx.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp()::timestamptz(3) AS now`;
    const event = await tx.eventoXpCompetitivo.create({
      data: {
        id: randomUUID(),
        usuarioId: p.source.participantId,
        gameId: p.gameId,
        temporada: p.season,
        xpRulesVersion: XP_RULES_VERSION,
        tipo: p.kind,
        deltaNominal: delta.nominal,
        deltaAplicado: delta.applied,
        saldoAntes: delta.before,
        saldoDespues: delta.after,
        secuencia: locked.version + 1,
        sourceType: p.source.sourceType,
        sourceId: p.source.sourceId,
        liquidacion: p.settlement,
        idempotencyKey: p.key,
        evidenciaHash: p.hash,
        institucionId: p.institutionId,
        fechaEfectiva: p.effectiveAt,
        fechaRegistro: clock.now,
        eventoCorregidoId: p.originalId,
        actorId: p.actorId,
        motivo: p.reason,
        metadata: { evidenceContract: 1 },
      },
    });
    await tx.balanceCompetitivo.update({
      where,
      data: {
        xp: delta.after,
        version: locked.version + 1,
        updatedAt: clock.now,
        ...(delta.applied !== 0 ? { alcanzadoEn: clock.now } : {}),
      },
    });
    return event;
  }
}
