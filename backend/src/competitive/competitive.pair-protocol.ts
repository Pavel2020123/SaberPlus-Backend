import { Prisma, EventoXpCompetitivo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitiveService, competitiveHash } from './competitive.service';
import {
  CompetitiveSource,
  CompetitiveVerifierRegistry,
  VerifiedTerminal,
} from './competitive.contracts';
import { canonicalSourceId } from './competitive.source';
import {
  abandonmentWinXp,
  normalXp,
  requireEvidence,
  XP_RULES_VERSION,
} from './competitive.rules';
import { competitiveSeason } from './competitive.policy';

/** Preparatory ledger kernel, NOT a sports verifier or an admission API.
 * Not registered in Nest, the verifier registry, controllers, sockets or workers.
 * A future adapter must prove admission, full sports replay and ALL R certificates.
 * Tests supply a trusted protocol fixture; this does not authorize live TUG XP.
 */
export interface CompetitivePairEvidence {
  originalParticipants(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<[string, string]>;
  loadLockedPair(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<[VerifiedTerminal, VerifiedTerminal]>;
}
export class CompetitivePairProtocol extends CompetitiveService {
  constructor(
    private readonly database: PrismaService,
    private readonly evidence: CompetitivePairEvidence,
  ) {
    super(database, new CompetitiveVerifierRegistry([]));
  }

  async settlePair(
    sourceId: string,
    version: number = XP_RULES_VERSION,
  ): Promise<EventoXpCompetitivo[]> {
    requireEvidence(version === XP_RULES_VERSION, 'UNSUPPORTED_RULES_VERSION');
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    return this.database.$transaction(
      async (tx) => {
        await this.lock(
          tx,
          `source:pair:${competitiveHash(['TUG_MATCH', id, 'SETTLEMENT'])}`,
        );
        const original = await this.evidence.originalParticipants(tx, id);
        requireEvidence(
          original.length === 2 && original[0] !== original[1],
          'PAIR_PARTICIPANTS_INVALID',
        );
        const participants = original
          .map((u) => canonicalSourceId('TUG_MATCH', u))
          .sort();
        for (const user of participants) await this.lockStudent(tx, user);
        // The adapter now locks the source/evidence AFTER both original users.
        const terminals = await this.evidence.loadLockedPair(tx, id);
        requireEvidence(terminals.length === 2, 'PAIR_INCOMPLETE');
        const ordered = participants.map((user) => {
          const matches = terminals.filter(
            (t) => t.source.participantId === user,
          );
          requireEvidence(matches.length === 1, 'PAIR_PARTICIPANTS_CHANGED');
          const terminal = matches[0];
          const source: CompetitiveSource = {
            sourceType: 'TUG_MATCH',
            sourceId: id,
            participantId: user,
          };
          this.validateTerminal(source, terminal);
          requireEvidence(terminal.gameId === 'TUG_OF_WAR');
          return {
            source,
            terminal,
            key: competitiveHash(['TUG_MATCH', id, user, 'SETTLEMENT']),
            hash: competitiveHash(terminal),
          };
        });
        requireEvidence(
          ordered[0].terminal.terminalAt.getTime() ===
            ordered[1].terminal.terminalAt.getTime() &&
            ordered[0].terminal.startedAt.getTime() ===
              ordered[1].terminal.startedAt.getTime(),
          'PAIR_TIMELINE_CONFLICT',
        );
        const [a, b] = ordered.map((p) => p.terminal.resolution);
        requireEvidence(
          !(a.kind === 'ABANDONO' && b.kind === 'ABANDONO'),
          'PAIR_DOUBLE_ABANDONMENT_UNAPPROVED',
        );
        // VerifiedTerminal.definitive proves neither activation nor the phase of
        // an EXPLICIT abandonment. Until the adapter contract can prove that
        // history, reject the WHOLE pair before idempotency/posting, not just its
        // negative delta. Do not infer activation from the rival's reward facts.
        requireEvidence(
          a.kind !== 'ABANDONO' && b.kind !== 'ABANDONO',
          'PAIR_ABANDONMENT_PHASE_UNVERIFIED',
        );
        if (a.kind === 'RESULTADO' && b.kind === 'RESULTADO') {
          requireEvidence(
            a.facts.gameId === 'TUG_OF_WAR' && b.facts.gameId === 'TUG_OF_WAR',
          );
          if (
            a.facts.gameId === 'TUG_OF_WAR' &&
            b.facts.gameId === 'TUG_OF_WAR'
          ) {
            requireEvidence(
              a.facts.presentedRounds === b.facts.presentedRounds,
              'PAIR_R_CONFLICT',
            );
            requireEvidence(
              (a.facts.outcome === 'EMPATE' && b.facts.outcome === 'EMPATE') ||
                (a.facts.outcome === 'VICTORIA' &&
                  b.facts.outcome === 'DERROTA') ||
                (a.facts.outcome === 'DERROTA' &&
                  b.facts.outcome === 'VICTORIA'),
              'PAIR_OUTCOME_CONFLICT',
            );
          }
        } else {
          // No approved neutral terminal is representable by this contract.
          requireEvidence(false, 'PAIR_TERMINAL_CLASSIFICATION_UNSUPPORTED');
        }
        const prior = await Promise.all(
          ordered.map((p) =>
            tx.eventoXpCompetitivo.findUnique({
              where: { idempotencyKey: p.key },
            }),
          ),
        );
        requireEvidence(
          prior.every(Boolean) || prior.every((p) => !p),
          'PAIR_PARTIAL_SETTLEMENT',
        );
        if (prior.every(Boolean)) {
          ordered.forEach((p, i) =>
            requireEvidence(
              prior[i]!.evidenciaHash === p.hash,
              'IDEMPOTENCY_CONFLICT',
            ),
          );
          return prior as EventoXpCompetitivo[];
        }
        // Validate both calculations and historical coverage BEFORE the first post.
        const postings = [];
        for (const p of ordered) {
          const r = p.terminal.resolution;
          let nominal: number;
          if (r.kind === 'RESULTADO') {
            requireEvidence(r.facts.gameId === 'TUG_OF_WAR');
            nominal = normalXp(r.facts);
          } else if (r.kind === 'ABANDONO') {
            throw new Error('PAIR_ABANDONMENT_PHASE_UNVERIFIED');
          } else {
            requireEvidence(
              r.facts.gameId === 'TUG_OF_WAR' && r.facts.bothAbsent === false,
            );
            nominal = abandonmentWinXp(r.facts);
          }
          // Transition log, not independent open-ended memberships: the latest
          // (desde, id) supersedes the previous row, including explicit null.
          const membership = await tx.historialInstitucionCompetitiva.findFirst(
            {
              where: {
                usuarioId: p.source.participantId,
                desde: { lte: p.terminal.terminalAt },
              },
              orderBy: [{ desde: 'desc' }, { id: 'desc' }],
            },
          );
          requireEvidence(membership, 'HISTORICAL_MEMBERSHIP_UNKNOWN');
          postings.push({
            source: p.source,
            gameId: p.terminal.gameId,
            season: competitiveSeason(p.terminal.terminalAt),
            effectiveAt: p.terminal.terminalAt,
            institutionId: membership.institucionId,
            key: p.key,
            hash: p.hash,
            settlement: 'SETTLEMENT',
            kind: r.kind,
            nominal,
          });
        }
        const events: EventoXpCompetitivo[] = [];
        for (const posting of postings)
          events.push(await this.post(tx, posting));
        return events;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10000,
        timeout: 20000,
      },
    );
  }
}
