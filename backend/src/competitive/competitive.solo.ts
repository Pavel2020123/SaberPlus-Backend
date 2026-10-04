import { Prisma } from '@prisma/client';
import {
  CompetitiveSource,
  CompetitiveVerifier,
  VerifiedTerminal,
} from './competitive.contracts';
import { competitiveHash } from './competitive.service';
import { NormalEvidence, requireEvidence } from './competitive.rules';
import { canonicalSourceId } from './competitive.source';
import { summitScore } from '../summit/summit.rules';
import { guardianScore } from '../guardian/guardian.rules';
import { starRescueScore } from '../star-rescue/star-rescue.rules';

export const SOLO_GAMES = [
  {
    gameId: 'SUMMIT',
    sourceType: 'SUMMIT_ATTEMPT',
    table: 'IntentoCima',
    questions: 12,
  },
  {
    gameId: 'GUARDIAN',
    sourceType: 'GUARDIAN_ATTEMPT',
    table: 'IntentoGuardian',
    questions: 8,
  },
  {
    gameId: 'STAR_RESCUE',
    sourceType: 'STAR_RESCUE_ATTEMPT',
    table: 'IntentoRescateEstrellas',
    questions: 10,
  },
] as const;
export type SoloGame = (typeof SOLO_GAMES)[number];
export interface SoloAttempt {
  id: string;
  usuarioId: string;
  area: string;
  dificultad: string | null;
  temaId?: string | null;
  subtemaId: string | null;
  version: number;
  estado: string;
  preguntas: Prisma.JsonValue;
  respuestas: Prisma.JsonValue;
  creadoEn: Date;
  venceEn: Date;
  finalizadoEn: Date | null;
  competitiveRulesVersion: number | null;
  competitiveSettledAt: Date | null;
  competitiveRetryAt: Date;
}
/** Identifier is selected exclusively from the closed, internal table catalogue. */
export function soloTable(game: SoloGame): Prisma.Sql {
  requireEvidence(
    SOLO_GAMES.some(
      (g) =>
        g.table === game.table &&
        g.sourceType === game.sourceType &&
        g.gameId === game.gameId,
    ),
  );
  return Prisma.raw(`"${game.table}"`);
}
export async function lockSoloAttempt(
  tx: Prisma.TransactionClient,
  game: SoloGame,
  id: string,
): Promise<SoloAttempt> {
  const [row] = await tx.$queryRaw<SoloAttempt[]>(
    Prisma.sql`SELECT * FROM ${soloTable(game)} WHERE id = ${id}::uuid FOR UPDATE`,
  );
  requireEvidence(row, 'SOURCE_NOT_FOUND');
  return row;
}
function object(value: unknown): any {
  requireEvidence(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'INVALID_SOLO_EVIDENCE',
  );
  return value;
}
function textId(value: unknown): asserts value is string {
  requireEvidence(
    typeof value === 'string' && value.trim().length > 0,
    'INVALID_SOLO_EVIDENCE',
  );
}
/** Validate private snapshot and replay accepted choices, not stored totals or client booleans. */
export function soloFacts(
  game: SoloGame,
  row: SoloAttempt,
): { facts: NormalEvidence; state: string } {
  requireEvidence(
    Array.isArray(row.preguntas) && row.preguntas.length === game.questions,
    'INVALID_SOLO_SNAPSHOT',
  );
  requireEvidence(
    Array.isArray(row.respuestas) && row.respuestas.length <= game.questions,
    'INVALID_SOLO_EVIDENCE',
  );
  const questionIds = new Set<string>();
  for (const raw of row.preguntas) {
    const snapshot = object(raw),
      q = object(snapshot.question);
    textId(q.id);
    textId(q.enunciado);
    textId(snapshot.correctAnswerId);
    requireEvidence(!questionIds.has(q.id), 'INVALID_SOLO_SNAPSHOT');
    questionIds.add(q.id);
    requireEvidence(
      Array.isArray(q.respuestas) &&
        q.respuestas.length >= 2 &&
        q.respuestas.length <= 6,
      'INVALID_SOLO_SNAPSHOT',
    );
    const options = q.respuestas.map((a: unknown) => {
      const option = object(a);
      textId(option.id);
      textId(option.texto);
      return option.id;
    });
    requireEvidence(
      new Set(options).size === options.length &&
        options.includes(snapshot.correctAnswerId),
      'INVALID_SOLO_SNAPSHOT',
    );
    const sub = object(q.subtema),
      topic = object(sub.tema);
    requireEvidence(
      topic.area === row.area &&
        (!row.temaId || topic.id === row.temaId) &&
        (!row.subtemaId || sub.id === row.subtemaId) &&
        (!row.dificultad || q.dificultad === row.dificultad),
      'INVALID_SOLO_SNAPSHOT',
    );
  }
  const accepted: { esCorrecta: boolean }[] = [];
  const keys = new Set<string>();
  const score = () =>
    game.gameId === 'SUMMIT'
      ? summitScore(accepted)
      : game.gameId === 'GUARDIAN'
        ? guardianScore(accepted)
        : starRescueScore(accepted);
  for (let i = 0; i < row.respuestas.length; i++) {
    requireEvidence(score().estado === 'ACTIVO', 'ANSWERS_AFTER_TERMINAL');
    const answer = object(row.respuestas[i]),
      snapshot = object(row.preguntas[i]);
    textId(answer.idempotencyKey);
    requireEvidence(
      !keys.has(answer.idempotencyKey) &&
        answer.preguntaId === snapshot.question.id,
      'INVALID_SOLO_EVIDENCE',
    );
    keys.add(answer.idempotencyKey);
    requireEvidence(
      snapshot.question.respuestas.some(
        (a: any) => a.id === answer.respuestaId,
      ),
      'INVALID_SOLO_EVIDENCE',
    );
    const correct = answer.respuestaId === snapshot.correctAnswerId;
    requireEvidence(answer.esCorrecta === correct, 'INVALID_SOLO_EVIDENCE');
    accepted.push({ esCorrecta: correct });
  }
  if (game.gameId === 'SUMMIT') {
    const s = summitScore(accepted);
    return {
      state: s.estado,
      facts: {
        gameId: 'SUMMIT',
        maxHeight: s.maximoEscalon,
        victory: s.estado === 'VICTORIA',
      },
    };
  }
  if (game.gameId === 'GUARDIAN') {
    const s = guardianScore(accepted);
    return {
      state: s.estado,
      facts: {
        gameId: 'GUARDIAN',
        correct: s.aciertos,
        shields: s.escudo,
        victory: s.estado === 'VICTORIA',
      },
    };
  }
  const s = starRescueScore(accepted);
  return {
    state: s.estado,
    facts: {
      gameId: 'STAR_RESCUE',
      stars: s.estrellas,
      constellations: s.constelaciones,
      victory: s.estado === 'VICTORIA',
    },
  };
}

export class SoloCompetitiveVerifier implements CompetitiveVerifier {
  readonly sourceType;
  constructor(private readonly game: SoloGame) {
    this.sourceType = game.sourceType;
  }
  async loadTerminal(
    tx: Prisma.TransactionClient,
    source: CompetitiveSource,
  ): Promise<VerifiedTerminal> {
    requireEvidence(source.sourceType === this.sourceType, 'SOURCE_MISMATCH');
    const id = canonicalSourceId(source.sourceType, source.sourceId);
    const row = await lockSoloAttempt(tx, this.game, id);
    requireEvidence(row.usuarioId === source.participantId, 'SOURCE_MISMATCH');
    requireEvidence(
      row.competitiveRulesVersion === 1 && row.version === 1,
      'INELIGIBLE_SOURCE',
    );
    requireEvidence(
      row.estado !== 'ACTIVO' && row.finalizadoEn instanceof Date,
      'SOURCE_NOT_TERMINAL',
    );
    requireEvidence(
      +row.venceEn - +row.creadoEn === 86_400_000 &&
        row.finalizadoEn >= row.creadoEn &&
        row.finalizadoEn <= row.venceEn,
      'INVALID_SOLO_TIME',
    );
    const replay = soloFacts(this.game, row);
    const abandoned = row.estado === 'ABANDONADO' || row.estado === 'EXPIRADO';
    requireEvidence(
      abandoned ? replay.state === 'ACTIVO' : row.estado === replay.state,
      'INVALID_SOLO_TERMINAL',
    );
    if (row.estado === 'EXPIRADO')
      requireEvidence(+row.finalizadoEn === +row.venceEn, 'INVALID_SOLO_TIME');
    return {
      source: { ...source, sourceId: id },
      gameId: this.game.gameId,
      startedAt: row.creadoEn,
      terminalAt: row.finalizadoEn,
      competitiveOnline: true,
      validParticipant: true,
      evidenceHash: competitiveHash({
        id: row.id,
        user: row.usuarioId,
        area: row.area,
        dificultad: row.dificultad,
        temaId: row.temaId ?? null,
        subtemaId: row.subtemaId,
        version: row.version,
        rules: row.competitiveRulesVersion,
        snapshot: row.preguntas,
        answers: row.respuestas,
        state: row.estado,
        start: row.creadoEn,
        deadline: row.venceEn,
        terminal: row.finalizadoEn,
      }),
      resolution: abandoned
        ? { kind: 'ABANDONO', definitive: true }
        : { kind: 'RESULTADO', facts: replay.facts },
    };
  }
}
export const createSoloVerifiers = () =>
  SOLO_GAMES.map((g) => new SoloCompetitiveVerifier(g));
