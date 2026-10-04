import { Injectable } from '@nestjs/common';
import { Prisma, TipoEventoXpCompetitivo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { readTugAdmission } from '../tira-afloja/tira-afloja.admission';
import {
  CompetitiveVerifierRegistry,
  VerifiedTugResolution,
} from './competitive.contracts';
import { CompetitiveService, competitiveHash } from './competitive.service';
import { TugSportsReplay } from './competitive.tug-replay';
import { canonicalSourceId } from './competitive.source';
import {
  integer,
  normalXp,
  requireEvidence,
  roundRatio,
} from './competitive.rules';

export interface TugPairReceipt {
  hash: string;
  terminalUs: string;
  participants: string[];
  decisions: {
    participantId: string;
    kind: string;
    nominal: number;
    eventId: string | null;
  }[];
}

/** Pair-only extension of the preparatory protocol. Reuses ledger/balance posting,
 * but cannot adapt microseconds to VerifiedTerminal or use the individual API.
 * Evidence is always loaded by the real PostgreSQL sports/presence replay. */
@Injectable()
export class CompetitiveTugPairProtocol extends CompetitiveService {
  private readonly replay = new TugSportsReplay();
  constructor(private readonly database: PrismaService) {
    super(database, new CompetitiveVerifierRegistry([]));
  }

  async settlePrecisePair(sourceId: string): Promise<TugPairReceipt> {
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    return this.database.$transaction(
      async (tx) => {
        await this.lock(
          tx,
          `source:pair:${competitiveHash(['TUG_MATCH', id, 'SETTLEMENT'])}`,
        );
        const origin = await tx.partidaTiraAfloja.findUnique({ where: { id } });
        requireEvidence(
          origin && readTugAdmission(origin) === 'ADMITTED',
          'TUG_NOT_ADMITTED',
        );
        requireEvidence(
          origin.temporalVersion === 1,
          'TUG_TEMPORAL_VERSION_REQUIRED',
        );
        const original = [
          origin.competitiveOriginalAId!,
          origin.competitiveOriginalBId,
        ].filter(Boolean) as string[];
        for (const user of [...original].sort())
          await this.lockStudent(tx, user);
        let receipt: TugPairReceipt;
        let resolutions: VerifiedTugResolution[];
        if (original.length === 2) {
          const verified = await this.replay.loadPreciseLockedPair(tx, id);
          requireEvidence(
            verified.participants.every((u, i) => u === original[i]),
            'PAIR_PARTICIPANTS_CHANGED',
          );
          receipt = {
            hash: competitiveHash(verified),
            terminalUs: verified.terminalUs,
            participants: original,
            decisions: [],
          };
          resolutions = verified.resolutions;
        } else {
          // No fictitious second participant and no promotion to the pair verifier.
          await tx.$queryRaw`SELECT tug_presence_lock(${id}::uuid)::text`;
          const m = await tx.partidaTiraAfloja.findUniqueOrThrow({
            where: { id },
          });
          requireEvidence(
            readTugAdmission(m) === 'ADMITTED' &&
              !m.jugadorBId &&
              !m.competitiveOriginalBId &&
              m.temporalVersion === 1 &&
              !m.activaEn &&
              m.rondaActual === 0 &&
              !m.snapshotInicial &&
              ['CANCELADA', 'EXPIRADA'].includes(m.estado) &&
              !m.ganadorId,
            'TUG_INCOMPLETE_ORIGIN_INVALID',
          );
          const [time] = await tx.$queryRaw<
            { terminal: string; valid: boolean }[]
          >`
          SELECT (extract(epoch FROM "fechaFinalizacion")*1000000)::bigint::text AS terminal,
           "fechaFinalizacion" IS NOT NULL AND "competitiveAdmissionAt"<="fechaFinalizacion"
           AND "fechaFinalizacion"<=tug_presence_now() AS valid FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
          requireEvidence(time.valid, 'TUG_INCOMPLETE_TIMELINE_INVALID');
          const events = await tx.tiraAflojaEvento.findMany({
            where: { partidaId: id },
            orderBy: { version: 'asc' },
          });
          const preciseEvents = await tx.$queryRaw<{ row: Prisma.JsonValue }[]>`
            SELECT to_jsonb(e) AS row FROM "TiraAflojaEvento" e
            WHERE "partidaId"=${id}::uuid ORDER BY version`;
          const last = events[events.length - 1];
          const data = last?.datos as
            | Record<string, Prisma.JsonValue>
            | undefined;
          const explicit =
            last?.tipo === 'ABANDONO' &&
            data?.motivo === 'EXPLICIT' &&
            data.abandonoUsuarioId === original[0] &&
            data.ganadorId === null &&
            m.estado === 'CANCELADA';
          const expired =
            last?.tipo === 'CANCELADA' &&
            data?.motivo === 'EXPIRADA' &&
            m.estado === 'EXPIRADA';
          requireEvidence(
            events.length > 0 &&
              last.version === m.version &&
              (explicit || expired) &&
              events.every(
                (e) =>
                  !['RONDA_INICIADA', 'RONDA_RESUELTA', 'RESPUESTA'].includes(
                    e.tipo,
                  ),
              ),
            'TUG_INCOMPLETE_TERMINAL_INVALID',
          );
          if (explicit) {
            const [proof] = await tx.$queryRaw<{ valid: boolean }[]>`
              SELECT count(*)=1 AND bool_and("userId"=${original[0]}::uuid AND reason='EXPLICIT'
               AND (extract(epoch FROM "effectiveAt")*1000000)::bigint=${time.terminal}::bigint) AS valid
              FROM "TugAbandonment" WHERE "matchId"=${id}::uuid`;
            const [presence] = await tx.$queryRaw<{ valid: boolean }[]>`
              SELECT count(*)=1 AND bool_and("userId"=${original[0]}::uuid
               AND (extract(epoch FROM "observedAt")*1000000)::bigint=${time.terminal}::bigint) AS valid
              FROM "TugPresenceEvent" WHERE "matchId"=${id}::uuid AND kind='ABANDONED'`;
            requireEvidence(
              proof.valid && presence.valid,
              'TUG_INCOMPLETE_ABANDONMENT_INVALID',
            );
          } else {
            const [proof] = await tx.$queryRaw<{ valid: boolean }[]>`
              SELECT "fechaFinalizacion">="expiraEn" AND NOT EXISTS(SELECT 1 FROM "TugAbandonment" WHERE "matchId"=${id}::uuid)
               AS valid FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
            requireEvidence(proof.valid, 'TUG_INCOMPLETE_EXPIRY_INVALID');
          }
          requireEvidence(
            (await tx.tiraAflojaRespuesta.count({
              where: { partidaId: id },
            })) === 0 &&
              (await tx.tiraAflojaRondaPresentada.count({
                where: { partidaId: id },
              })) === 0 &&
              (await tx.tugRoundVisibility.count({
                where: { partidaId: id },
              })) === 0 &&
              !!(await tx.tugMatchIdentity.findUnique({ where: { id } })),
            'TUG_INCOMPLETE_EVIDENCE_INVALID',
          );
          receipt = {
            hash: competitiveHash({
              id,
              participant: original[0],
              terminalUs: time.terminal,
              state: m.estado,
              events: preciseEvents.map((e) => e.row),
            }),
            terminalUs: time.terminal,
            participants: original,
            decisions: [],
          };
          resolutions = [
            {
              kind: 'NEUTRAL',
              reason: expired ? 'GLOBAL_EXPIRED' : 'PRE_ACTIVE',
            },
          ];
        }
        // Existing identity keys are shared with the old preparatory pair kernel.
        const keys = original.map((user) =>
          competitiveHash(['TUG_MATCH', id, user, 'SETTLEMENT']),
        );
        const [prior] = await tx.$queryRaw<
          { state: string; decision: TugPairReceipt }[]
        >`
        SELECT state,decision FROM "TugCompetitiveSettlement" WHERE "sourceId"=${id}::uuid FOR UPDATE`;
        const existing = await tx.eventoXpCompetitivo.findMany({
          where: {
            sourceType: 'TUG_MATCH',
            sourceId: id,
            liquidacion: 'SETTLEMENT',
          },
        });
        if (prior && ['SETTLED', 'RESOLVED'].includes(prior.state)) {
          requireEvidence(
            prior.decision &&
              Array.isArray(prior.decision.decisions) &&
              prior.decision.decisions.length === original.length &&
              competitiveHash(prior.decision.participants) ===
                competitiveHash(original) &&
              prior.decision.terminalUs === receipt.terminalUs &&
              prior.decision.decisions.every(
                (d, i) =>
                  d.participantId === original[i] &&
                  d.kind === resolutions[i].kind &&
                  (d.kind !== 'NEUTRAL' ||
                    (d.nominal === 0 && d.eventId === null)),
              ),
            'PAIR_RECEIPT_INVALID',
          );
          requireEvidence(
            prior.decision.hash === receipt.hash,
            'IDEMPOTENCY_CONFLICT',
          );
          requireEvidence(
            existing.length ===
              prior.decision.decisions.filter((d) => d.eventId !== null)
                .length &&
              existing.every(
                (e) =>
                  prior.decision.decisions.some(
                    (d) =>
                      d.eventId === e.id &&
                      d.participantId === e.usuarioId &&
                      d.nominal === e.deltaNominal,
                  ) &&
                  e.evidenciaHash === receipt.hash &&
                  keys.includes(e.idempotencyKey),
              ),
            'PAIR_PARTIAL_SETTLEMENT',
          );
          return prior.decision;
        }
        requireEvidence(existing.length === 0, 'PAIR_PARTIAL_SETTLEMENT');
        // Resolve historical institution and season at the EXACT terminal in PG,
        // never Date.now(), current membership or rounded Date boundaries.
        const postings: {
          index: number;
          nominal: number;
          kind: TipoEventoXpCompetitivo;
          season: number;
          institution: string | null;
        }[] = [];
        for (let i = 0; i < resolutions.length; i++) {
          const r = resolutions[i];
          let nominal = 0,
            kind: TipoEventoXpCompetitivo = 'RESULTADO';
          if (r.kind === 'NORMAL')
            nominal = normalXp({
              gameId: 'TUG_OF_WAR',
              correct: r.correct,
              presentedRounds: r.presentedRounds,
              outcome: r.outcome,
            });
          else if (r.kind === 'PENALIZABLE_ABANDONMENT') {
            nominal = -15;
            kind = 'ABANDONO';
          } else if (r.kind === 'ABANDONMENT_BENEFICIARY') {
            integer(r.correct, 0, r.actions);
            integer(r.qPartida, 4, 20);
            nominal =
              r.actions > 0 && r.eligibility === 'SUFFICIENT'
                ? Math.min(80, roundRatio(60 * r.correct, r.qPartida) + 20)
                : 0;
            kind = 'VICTORIA_POR_ABANDONO';
          }
          receipt.decisions.push({
            participantId: original[i],
            kind: r.kind,
            nominal,
            eventId: null,
          });
          // Neutrals have a durable decision, no fictitious result ledger event.
          if (r.kind === 'NEUTRAL') continue;
          const [history] = await tx.$queryRaw<
            { institution: string | null; season: number }[]
          >`
          SELECT "institucionId" AS institution,
           extract(year FROM competitive_timestamp_us(${receipt.terminalUs}::bigint) AT TIME ZONE 'America/Bogota')::int AS season
          FROM "HistorialInstitucionCompetitiva" WHERE "usuarioId"=${original[i]}::uuid
           AND desde<=competitive_timestamp_us(${receipt.terminalUs}::bigint)
          ORDER BY desde DESC,id DESC LIMIT 1`;
          requireEvidence(history, 'HISTORICAL_MEMBERSHIP_UNKNOWN');
          postings.push({
            index: i,
            nominal,
            kind,
            season: history.season,
            institution: history.institution,
          });
        }
        for (const p of postings) {
          const event = await this.post(tx, {
            source: {
              sourceType: 'TUG_MATCH',
              sourceId: id,
              participantId: original[p.index],
            },
            gameId: 'TUG_OF_WAR',
            season: p.season,
            effectiveUs: receipt.terminalUs,
            institutionId: p.institution,
            key: keys[p.index],
            hash: receipt.hash,
            settlement: 'SETTLEMENT',
            kind: p.kind,
            nominal: p.nominal,
          });
          receipt.decisions[p.index].eventId = event.id;
        }
        await tx.$executeRaw`INSERT INTO "TugCompetitiveSettlement" ("sourceId",state,"terminalUs","evidenceHash",decision,"resolvedAt")
        VALUES (${id}::uuid,${postings.length ? 'SETTLED' : 'RESOLVED'},${receipt.terminalUs}::bigint,${receipt.hash},
          ${JSON.stringify(receipt)}::jsonb,clock_timestamp()) ON CONFLICT ("sourceId") DO UPDATE
        SET state=EXCLUDED.state,"terminalUs"=EXCLUDED."terminalUs","evidenceHash"=EXCLUDED."evidenceHash",
         decision=EXCLUDED.decision,"resolvedAt"=EXCLUDED."resolvedAt","lastError"=NULL`;
        return receipt;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }
}
