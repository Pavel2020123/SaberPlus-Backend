import { Prisma } from '@prisma/client';
import {
  CompetitiveSource,
  CompetitiveVerifier,
  VerifiedTerminal,
} from './competitive.contracts';
import { competitiveHash } from './competitive.service';
import { NormalEvidence, Outcome, requireEvidence } from './competitive.rules';
import { canonicalSourceId } from './competitive.source';
import {
  readTriviaSnapshot,
  TriviaSnapshot,
} from '../trivia-rush/trivia-rush.snapshot';
import {
  resolverRespuestaTriviaRush,
  registrarSaltoTriviaRush,
} from '../trivia-rush/trivia-rush.rules';

export type TriviaEvidence = Prisma.IntentoTriviaRushGetPayload<{
  include: { respuestas: true; potenciadores: true };
}>;
const check = (ok: unknown) => requireEvidence(ok, 'INVALID_TRIVIA_EVIDENCE');

/** Reconstruct score and competitive streak independently; official aids remain legal. */
export function replayTrivia(
  row: TriviaEvidence,
  snapshot: TriviaSnapshot,
  historicalGhost = false,
) {
  check(
    snapshot.version === 1 &&
      snapshot.q >= 10 &&
      snapshot.q <= 30 &&
      snapshot.questions.length === snapshot.q,
  );
  check(
    snapshot.config.modalidad === row.modalidad &&
      snapshot.config.versionReglas === row.versionReglas &&
      snapshot.config.duracionSegundos === row.duracionBaseSegundos &&
      JSON.stringify(snapshot.config.areas) === JSON.stringify(row.areas),
  );
  const ids = new Set<string>();
  snapshot.questions.forEach((q, i) => {
    check(
      q.orden === i && q.preguntaId === q.pregunta.id && !ids.has(q.preguntaId),
    );
    ids.add(q.preguntaId);
    check(
      q.pregunta.respuestas.length === 4 &&
        new Set(q.pregunta.respuestas.map((a) => a.id)).size === 4 &&
        q.pregunta.respuestas.filter((a) => a.esCorrecta === true).length === 1,
    );
    check(
      q.opcionesOrden.length === 4 &&
        new Set(q.opcionesOrden).size === 4 &&
        q.opcionesOrden.every((id) =>
          q.pregunta.respuestas.some((a) => a.id === id),
        ),
    );
  });
  check(!historicalGhost || (row.potenciadores.length === 0 && !row.asistido));
  const actions = [
    ...row.respuestas.map((a) => ({
      kind: 'answer' as const,
      a,
      at: a.respondidaEn,
      seq: a.competitiveActionSeq,
    })),
    ...row.potenciadores.map((a) => ({
      kind: 'helper' as const,
      a,
      at: a.activadoEn,
      seq: a.competitiveActionSeq,
    })),
  ];
  if (historicalGhost)
    actions.sort((x, y) => {
      const order = (id: string | null) =>
        snapshot.questions.findIndex((q) => q.preguntaId === id);
      return (
        order(x.a.preguntaId) - order(y.a.preguntaId) ||
        (x.kind === 'answer' && y.kind === 'answer'
          ? x.a.numeroIntento - y.a.numeroIntento
          : 0)
      );
    });
  else {
    check(actions.every((a) => typeof a.seq === 'bigint' && a.seq > 0n));
    actions.sort((x, y) => (x.seq! < y.seq! ? -1 : x.seq! > y.seq! ? 1 : 0));
    check(new Set(actions.map((a) => String(a.seq))).size === actions.length);
  }
  let score = {
    puntaje: 0,
    comboActual: 0,
    mejorCombo: 0,
    respuestasCorrectas: 0,
    respuestasIncorrectas: 0,
    preguntasSaltadas: 0,
  };
  let index = 0,
    count = 0,
    shield = false,
    second = false,
    skip = false,
    fifty = false,
    extra = 0,
    streak = 0,
    max = 0;
  let last = +row.iniciadoEn,
    questionStart = last;
  const keys = new Set<string>(),
    grants = new Set<string>();
  const checkpoints: { segundosTranscurridos: number; puntaje: number }[] = [];
  for (const action of actions) {
    const q = snapshot.questions[index];
    check(
      q &&
        action.a.preguntaId === q.preguntaId &&
        action.a.intentoId === row.id &&
        +action.at >= last &&
        +action.at >= +row.iniciadoEn &&
        +action.at <
          +row.iniciadoEn + (row.duracionBaseSegundos + extra) * 1000 &&
        row.finalizadoEn &&
        +action.at <= +row.finalizadoEn &&
        !keys.has(action.a.claveIdempotencia),
    );
    keys.add(action.a.claveIdempotencia);
    last = +action.at;
    if (action.kind === 'helper') {
      check(
        row.modalidad === 'TRIVIA_RUSH' &&
          !skip &&
          !grants.has(action.a.concesionId),
      );
      grants.add(action.a.concesionId);
      const grant = action.a.competitiveGrant as {
        id?: string;
        usuarioId?: string;
        expiraEn?: string;
      } | null;
      check(
        grant &&
          grant.id === action.a.concesionId &&
          grant.usuarioId === row.usuarioId &&
          +new Date(grant.expiraEn!) > +action.at,
      );
      switch (action.a.tipo) {
        case 'ESCUDO_COMBO':
          check(!shield);
          shield = true;
          break;
        case 'SEGUNDA_OPORTUNIDAD':
          check(!second);
          second = true;
          break;
        case 'SALTAR':
          skip = true;
          break;
        case 'TIEMPO_EXTRA':
          extra += 10;
          break;
        case 'CINCUENTA_CINCUENTA': {
          check(!fifty);
          fifty = true;
          const eliminated = action.a.opcionesEliminadas;
          check(
            Array.isArray(eliminated) &&
              eliminated.length === 2 &&
              new Set(eliminated).size === 2 &&
              eliminated.every((id) =>
                q.pregunta.respuestas.some((a) => a.id === id && !a.esCorrecta),
              ),
          );
          break;
        }
        default:
          check(false);
      }
      continue;
    }
    const a = action.a;
    check(
      a.numeroIntento === ++count &&
        a.tiempoRespuestaMs ===
          Math.min(3_600_000, Math.max(0, +a.respondidaEn - questionStart)),
    );
    if (a.respuestaSeleccionadaId === null) {
      check(
        skip &&
          a.esFinal &&
          !a.esCorrecta &&
          a.puntosOtorgados === 0 &&
          a.comboResultante === score.comboActual,
      );
      score = registrarSaltoTriviaRush(score);
      streak = 0;
      skip = false;
    } else {
      check(!skip && count <= 2);
      const selected = q.pregunta.respuestas.find(
        (o) => o.id === a.respuestaSeleccionadaId,
      );
      check(selected && selected.esCorrecta === a.esCorrecta);
      const r = resolverRespuestaTriviaRush(score, a.esCorrecta, {
        escudoComboActivo: shield,
        segundaOportunidadActiva: second,
      });
      check(
        a.esFinal === r.esFinal &&
          a.puntosOtorgados === r.puntosOtorgados &&
          a.comboResultante === r.comboActual,
      );
      second = false;
      if (!r.esFinal) continue; // Approved: non-final incorrect answer does not break M.
      score = r;
      if (r.consumioEscudo) shield = false;
      streak = a.esCorrecta ? streak + 1 : 0;
      max = Math.max(max, streak);
    }
    if (a.esFinal) {
      checkpoints.push({
        segundosTranscurridos: Math.min(
          row.duracionBaseSegundos,
          Math.max(0, Math.floor((+a.respondidaEn - +row.iniciadoEn) / 1000)),
        ),
        puntaje: score.puntaje,
      });
      index++;
      count = 0;
      second = false;
      fifty = false;
      questionStart = +action.at;
    }
  }
  check(
    !skip &&
      row.indiceActual === index &&
      row.tiempoExtraSegundos === extra &&
      +row.venceEn ===
        +row.iniciadoEn + (row.duracionBaseSegundos + extra) * 1000 &&
      row.asistido === row.potenciadores.length > 0,
  );
  for (const key of [
    'puntaje',
    'comboActual',
    'mejorCombo',
    'respuestasCorrectas',
    'respuestasIncorrectas',
    'preguntasSaltadas',
  ] as const)
    check(row[key] === score[key]);
  check(
    row.finalizadoEn &&
      +row.finalizadoEn >= last &&
      +row.finalizadoEn <= +row.venceEn,
  );
  check(
    row.estado === 'FINALIZADO'
      ? index === snapshot.q && +row.finalizadoEn === last
      : index < snapshot.q,
  );
  if (row.estado === 'EXPIRADO') check(+row.finalizadoEn! === +row.venceEn);
  return {
    correct: score.respuestasCorrectas,
    maxCombo: max,
    score: score.puntaje,
    checkpoints,
  };
}

export function ghostOutcome(score: number, ghostScore: number): Outcome {
  return score > ghostScore
    ? 'VICTORIA'
    : score === ghostScore
      ? 'EMPATE'
      : 'DERROTA';
}

export class TriviaCompetitiveVerifier implements CompetitiveVerifier {
  readonly sourceType = 'TRIVIA_ATTEMPT' as const;
  async loadTerminal(
    tx: Prisma.TransactionClient,
    source: CompetitiveSource,
  ): Promise<VerifiedTerminal> {
    check(source.sourceType === this.sourceType);
    const id = canonicalSourceId(this.sourceType, source.sourceId);
    await tx.$queryRaw`SELECT id FROM "IntentoTriviaRush" WHERE id=${id}::uuid FOR UPDATE`;
    const row = await tx.intentoTriviaRush.findUnique({
      where: { id },
      include: {
        respuestas: { orderBy: { competitiveActionSeq: 'asc' } },
        potenciadores: { orderBy: { competitiveActionSeq: 'asc' } },
      },
    });
    requireEvidence(
      row && row.usuarioId === source.participantId,
      'SOURCE_MISMATCH',
    );
    requireEvidence(
      row.competitiveRulesVersion === 1 &&
        row.competitiveAdmittedAt &&
        row.evidenciaVersion === 1 &&
        row.presenciaVersion === 1,
      'INELIGIBLE_SOURCE',
    );
    requireEvidence(
      row.estado !== 'ACTIVO' && row.finalizadoEn,
      'SOURCE_NOT_TERMINAL',
    );
    if (row.estado === 'ABANDONADO') {
      const event = await tx.triviaPresenceEvent.findFirst({
        where: {
          attemptId: id,
          kind: 'ABANDONED',
          observedAt: row.finalizadoEn,
        },
      });
      requireEvidence(event, 'ABANDONMENT_EVIDENCE_REQUIRED');
    }
    check(
      +row.competitiveAdmittedAt === +row.iniciadoEn &&
        ['TRIVIA_RUSH', 'GHOST_DUEL'].includes(row.modalidad!),
    );
    const s = readTriviaSnapshot(row);
    check(s);
    const replay = replayTrivia(row, s!);
    let facts: NormalEvidence;
    if (row.modalidad === 'TRIVIA_RUSH') {
      check(s!.ghost === null);
      facts = {
        gameId: 'TRIVIA_RUSH',
        correct: replay.correct,
        questions: s!.q,
        maxCombo: replay.maxCombo,
      };
    } else {
      const ghost = s!.ghost;
      if (ghost) {
        const prior = await tx.intentoTriviaRush.findUnique({
          where: { id: ghost.intentoId },
          include: { respuestas: true, potenciadores: true },
        });
        check(
          prior &&
            prior.usuarioId === row.usuarioId &&
            prior.evidenciaVersion === 1 &&
            ['FINALIZADO', 'EXPIRADO'].includes(prior.estado) &&
            prior.finalizadoEn &&
            +prior.finalizadoEn <= +row.iniciadoEn &&
            !prior.asistido,
        );
        const gs = readTriviaSnapshot(prior!);
        check(
          gs &&
            gs.q === s!.q &&
            gs.config.duracionSegundos === s!.config.duracionSegundos &&
            gs.config.versionReglas === s!.config.versionReglas &&
            JSON.stringify(gs.config.areas) === JSON.stringify(s!.config.areas),
        );
        const original = replayTrivia(prior!, gs!, true);
        check(
          competitiveHash(ghost) ===
            competitiveHash({
              intentoId: prior!.id,
              puntaje: original.score,
              respuestasCorrectas: original.correct,
              mejorCombo: prior!.mejorCombo,
              finalizadoEn: prior!.finalizadoEn!.toISOString(),
              q: gs!.q,
              config: gs!.config,
              checkpoints: original.checkpoints,
            }),
        );
      }
      facts = {
        gameId: 'GHOST_DUEL',
        correct: replay.correct,
        questions: s!.q,
        outcome: ghost ? ghostOutcome(replay.score, ghost.puntaje) : null,
        distinctMode: true,
        ghostFixedAtStart: true,
        ghostId: ghost?.intentoId ?? null,
        compatibleConfiguration: true,
      };
    }
    const hashable = (v: unknown): unknown =>
      JSON.parse(
        JSON.stringify(v, (_k, value) =>
          typeof value === 'bigint' ? value.toString() : value,
        ),
      );
    return {
      source: { ...source, sourceId: id },
      gameId: row.modalidad!,
      startedAt: row.iniciadoEn,
      terminalAt: row.finalizadoEn,
      competitiveOnline: true,
      validParticipant: true,
      evidenceHash: competitiveHash(
        hashable({
          snapshot: s,
          respuestas: row.respuestas,
          potenciadores: row.potenciadores,
          admittedAt: row.competitiveAdmittedAt,
          rules: row.competitiveRulesVersion,
          state: row.estado,
          terminalAt: row.finalizadoEn,
        }),
      ),
      resolution:
        row.estado === 'ABANDONADO'
          ? { kind: 'ABANDONO', definitive: true }
          : { kind: 'RESULTADO', facts },
    };
  }
}
