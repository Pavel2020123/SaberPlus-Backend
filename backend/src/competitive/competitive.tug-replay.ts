import { Prisma } from '@prisma/client';
import { CompetitivePairEvidence } from './competitive.pair-protocol';
import { VerifiedTerminal } from './competitive.contracts';
import { competitiveHash } from './competitive.service';
import { requireEvidence } from './competitive.rules';
import { canonicalSourceId } from './competitive.source';
import { readTugAdmission } from '../tira-afloja/tira-afloja.admission';
import { replayTugPresence } from './competitive.tug-presence-replay';
import { resolverRondaExacta } from '../tira-afloja/tira-afloja.rules';

// Private evidence reader only. Deliberately absent from Nest/registry/workers.
// The caller owns the sorted original Usuario locks before loadLockedPair.
type Row = Record<string, any>;
const check = (ok: unknown, code: string) =>
  requireEvidence(ok, `TUG_REPLAY_${code}`);
const us = (value: string): bigint => {
  check(typeof value === 'string' && /^-?\d+$/.test(value), 'TIME_INVALID');
  return BigInt(value);
};
const min = (a: bigint, b: bigint) => (a < b ? a : b);
export function tugIsoUs(value: string): bigint {
  check(
    typeof value === 'string' &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3,6}Z$/.test(value),
    'TIME_INVALID',
  );
  const fraction = value.split('.')[1].slice(0, -1).padEnd(6, '0');
  const millis = Date.parse(value.replace(/\.\d+Z$/, '.000Z'));
  check(Number.isFinite(millis), 'TIME_INVALID');
  return BigInt(millis) * 1000n + BigInt(fraction);
}

/** Exact PostgreSQL timestamp(6) comparison, independent of JS Date rounding. */
export function replayTugRound(
  a?: { esCorrecta: boolean; atUs: string },
  b?: { esCorrecta: boolean; atUs: string },
) {
  if (a) us(a.atUs);
  if (b) us(b.atUs);
  const r = resolverRondaExacta(a, b);
  return { movement: r.movimiento, reason: r.motivo };
}

export interface TugReplayEvidence {
  classification:
    | 'NORMAL'
    | 'GRACE_ABANDONMENT'
    | 'SIMULTANEOUS_CANCELLED'
    | 'EXPLICIT_PRE_ACTIVE'
    | 'EXPLICIT_ACTIVE'
    | 'GLOBAL_EXPIRED';
  phase: 'PRE_ACTIVE' | 'ACTIVE';
  participants: [string, string];
  terminalUs: string;
  winner: string | null;
  correct: number[];
  actions: number[];
  presentedRounds: number;
  qPartida: number | null;
  abandonment: { userId: string; reason: string; effectiveUs: string }[];
  evidenceHash: string;
  terminals?: [VerifiedTerminal, VerifiedTerminal];
}

export class TugSportsReplay implements CompetitivePairEvidence {
  async originalParticipants(
    tx: Prisma.TransactionClient,
    sourceId: string,
  ): Promise<[string, string]> {
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    const m = await tx.partidaTiraAfloja.findUnique({ where: { id } });
    check(m, 'NOT_FOUND');
    check(readTugAdmission(m!) === 'ADMITTED', 'NOT_ADMITTED');
    check(
      await tx.tugMatchIdentity.findUnique({ where: { id } }),
      'IDENTITY_MISSING',
    );
    check(m!.competitiveOriginalBId, 'PARTICIPANTS_INCOMPLETE');
    return [m!.competitiveOriginalAId!, m!.competitiveOriginalBId!];
  }

  async loadLockedPair(
    tx: Prisma.TransactionClient,
    sourceId: string,
  ): Promise<[VerifiedTerminal, VerifiedTerminal]> {
    // Preserve the shared contract's explicit barrier independently of how much
    // private evidence can now be reconstructed. No new payout classifications.
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    await tx.$queryRaw`SELECT tug_presence_lock(${id}::uuid)::text`;
    check(
      (await tx.tugAbandonment.count({ where: { matchId: id } })) === 0,
      'ABANDONMENT_CONTRACT_UNSUPPORTED',
    );
    const evidence = await this.replayLockedPair(tx, sourceId);
    check(
      evidence.classification === 'NORMAL',
      'ABANDONMENT_CONTRACT_UNSUPPORTED',
    );
    check(evidence.terminals, 'TERMINAL_PRECISION_UNSUPPORTED');
    const m = await tx.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
    check(m.temporalVersion !== 1, 'TEMPORAL_CONTRACT_UNSUPPORTED');
    return evidence.terminals!;
  }

  /** Private classification only; new variants cannot enter the pair kernel. */
  async replayLockedPair(
    tx: Prisma.TransactionClient,
    sourceId: string,
  ): Promise<TugReplayEvidence> {
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    // Same user -> advisory -> parent order as every durable presence writer.
    await tx.$queryRaw`SELECT tug_presence_lock(${id}::uuid)::text`;
    const m = await tx.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
    const participants = await this.originalParticipants(tx, id);
    const [time] = await tx.$queryRaw<Row[]>`SELECT
      (extract(epoch FROM "fechaFinalizacion")*1000000)::bigint::text AS terminal,
      (extract(epoch FROM "expiraEn")*1000000)::bigint::text AS deadline,
      (extract(epoch FROM "competitiveAdmissionAt")*1000000)::bigint::text AS admission
      ,(extract(epoch FROM "activaEn")*1000000)::bigint::text AS activation
      FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
    // to_jsonb preserves timestamp(6); Prisma Date would truncate event µs even
    // if they are used only in the canonical evidence hash.
    const events = (
      await tx.$queryRaw<{ row: Row }[]>`SELECT to_jsonb(e) AS row
      FROM "TiraAflojaEvento" e WHERE "partidaId"=${id}::uuid ORDER BY version`
    ).map((e) => e.row);
    check(time.terminal, 'NEUTRAL_OR_OPEN_UNSUPPORTED');
    check(
      events.length > 0 &&
        events.every((e, i) => e.version === i) &&
        events[events.length - 1].version === m.version,
      'EVENT_SEQUENCE',
    );
    check(
      events.filter((e) =>
        ['FINALIZADA', 'CANCELADA', 'ABANDONO'].includes(e.tipo),
      ).length === 1,
      'MULTIPLE_TERMINALS',
    );
    const abandonments = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(a) || jsonb_build_object(
      'effectiveUs',(extract(epoch FROM "effectiveAt")*1000000)::bigint::text) AS row
      FROM "TugAbandonment" a WHERE "matchId"=${id}::uuid ORDER BY "userId"`
    ).map((e) => e.row);
    const connections = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(c) || jsonb_build_object(
      'connectedUs',(extract(epoch FROM "connectedAt")*1000000)::bigint::text,
      'lastUs',(extract(epoch FROM "lastSeenAt")*1000000)::bigint::text,
      'leaseUs',(extract(epoch FROM "leaseUntil")*1000000)::bigint::text,
      'closedUs',(extract(epoch FROM "closedAt")*1000000)::bigint::text,
      'authUs',(extract(epoch FROM "authUntil")*1000000)::bigint::text) AS row
      FROM "TugConnection" c WHERE "matchId"=${id}::uuid ORDER BY id`
    ).map((e) => e.row);
    const presenceEvents = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(e) || jsonb_build_object(
      'id',id::text,'atUs',(extract(epoch FROM "observedAt")*1000000)::bigint::text) AS row
      FROM "TugPresenceEvent" e WHERE "matchId"=${id}::uuid ORDER BY id`
    ).map((e) => e.row);
    const activation =
      m.temporalVersion === 1 && time.activation
        ? { atUs: time.activation, presenceId: m.activaPresenceId!.toString() }
        : undefined;
    check(
      m.temporalVersion !== 1 ||
        !events.some((e) => e.tipo === 'RONDA_INICIADA') ||
        (activation &&
          m.activaVersion ===
            events.find((e) => e.tipo === 'RONDA_INICIADA')!.version &&
          tugIsoUs(m.snapshotInicial['config']['activaEn']) ===
            us(time.activation) &&
          m.snapshotInicial['config']['activaPresenceId'] ===
            activation.presenceId &&
          m.snapshotInicial['config']['temporalVersion'] === 1),
      'ACTIVATION_CONFLICT',
    );
    const presence = replayTugPresence(
      participants,
      connections,
      presenceEvents,
      time.terminal,
      events.some((e) => e.tipo === 'RONDA_INICIADA')
        ? (
            BigInt(
              Date.parse(
                events.find((e) => e.tipo === 'RONDA_INICIADA')!.datos.iniciaEn,
              ),
            ) * 1000n
          ).toString()
        : undefined,
      activation,
    );
    const active = events.some((e) => e.tipo === 'RONDA_INICIADA');
    const final = events[events.length - 1];
    const terminal = us(time.terminal),
      deadline = us(time.deadline);
    const pendingGraces = presence.graceAt(terminal);
    const earliestGrace = pendingGraces.reduce<bigint | null>(
      (at, g) => (at === null || g.end < at ? g.end : at),
      null,
    );
    const base = {
      participants,
      terminalUs: time.terminal,
      winner: m.ganadorId,
      phase: active ? ('ACTIVE' as const) : ('PRE_ACTIVE' as const),
      correct: [0, 0],
      actions: [0, 0],
      presentedRounds: 0,
      qPartida: m.qPartida,
      abandonment: abandonments.map((a) => ({
        userId: a.userId,
        reason: a.reason,
        effectiveUs: a.effectiveUs,
      })),
    };
    check(
      m.preguntaActualId === null &&
        m.rondaIniciaEn === null &&
        m.rondaVenceEn === null,
      'TERMINAL_OPEN_ROUND',
    );
    // A later observer refresh may be legitimate; a second/unpaired abandonment
    // never is. Validate terminal events even outside the canonical time cut.
    const ended = presenceEvents.filter((e) => e.kind === 'ABANDONED');
    check(
      ended.length === abandonments.length &&
        abandonments.every(
          (a) =>
            participants.includes(a.userId) &&
            a.effectiveUs === time.terminal &&
            ended.filter(
              (e) => e.userId === a.userId && e.atUs === a.effectiveUs,
            ).length === 1,
        ),
      'ABANDONMENT_EVENT',
    );
    let classification: TugReplayEvidence['classification'] = 'NORMAL';
    if (final.tipo === 'ABANDONO') {
      check(
        abandonments.length >= 1 &&
          abandonments.length <= 2 &&
          abandonments.every((a) => a.reason === final.datos.motivo) &&
          final.datos.abandonoUsuarioId ===
            (abandonments.length === 1 ? abandonments[0].userId : null),
        'ABANDONMENT_CAUSE',
      );
      if (final.datos.motivo === 'GRACE') {
        check(
          active && earliestGrace === terminal && terminal < deadline,
          'GRACE_PRECEDENCE_UNPROVEN',
        );
        const absent = pendingGraces
          .filter((g) => g.end === terminal)
          .map((g) => g.userId)
          .sort();
        check(
          competitiveHash(absent) ===
            competitiveHash(abandonments.map((a) => a.userId).sort()),
          'GRACE_PARTICIPANTS',
        );
        classification =
          absent.length === 2 ? 'SIMULTANEOUS_CANCELLED' : 'GRACE_ABANDONMENT';
        check(
          m.ganadorId ===
            (absent.length === 2
              ? null
              : participants.find((u) => !absent.includes(u))),
          'ABANDONMENT_WINNER',
        );
      } else {
        check(
          final.datos.motivo === 'EXPLICIT' &&
            abandonments.length === 1 &&
            terminal < deadline &&
            (earliestGrace === null || terminal < earliestGrace),
          'EXPLICIT_PRECEDENCE_UNPROVEN',
        );
        classification = active ? 'EXPLICIT_ACTIVE' : 'EXPLICIT_PRE_ACTIVE';
        const rival = participants.find((u) => u !== abandonments[0].userId)!;
        const winner =
          presence.openAt(rival, terminal) &&
          !pendingGraces.some((g) => g.userId === rival)
            ? rival
            : null;
        check(m.ganadorId === winner, 'EXPLICIT_WINNER');
      }
      check(
        final.datos.ganadorId === m.ganadorId &&
          m.estado === (m.ganadorId ? 'FINALIZADA' : 'CANCELADA') &&
          m.resultado ===
            (m.ganadorId === participants[0]
              ? 'JUGADOR_A'
              : m.ganadorId === participants[1]
                ? 'JUGADOR_B'
                : 'CANCELADA'),
        'TERMINAL_CONFLICT',
      );
    } else if (final.tipo === 'CANCELADA') {
      check(
        active &&
          final.datos.motivo === 'EXPIRADA' &&
          m.estado === 'EXPIRADA' &&
          m.resultado === 'CANCELADA' &&
          m.ganadorId === null &&
          terminal === deadline &&
          (earliestGrace === null || deadline <= earliestGrace) &&
          abandonments.length === 0,
        'GLOBAL_PRECEDENCE_UNPROVEN',
      );
      classification = 'GLOBAL_EXPIRED';
    } else {
      check(
        final.tipo === 'FINALIZADA' &&
          abandonments.length === 0 &&
          m.estado === 'FINALIZADA',
        'NEUTRAL_OR_OPEN_UNSUPPORTED',
      );
    }
    const presenceHash = {
      connections: connections
        .filter((c) => us(c.connectedUs) <= terminal)
        .map((c) => ({
          id: c.id,
          userId: c.userId,
          instanceId: c.instanceId,
          connectedUs: c.connectedUs,
          authUs: c.authUs,
        })),
      events: presence.events,
    };
    if (!active) {
      check(
        classification === 'EXPLICIT_PRE_ACTIVE' &&
          m.evidenciaVersion === null &&
          m.snapshotInicial === null &&
          presence.graces.length === 0 &&
          m.posicionCuerda === 0 &&
          (await tx.tiraAflojaRespuesta.count({ where: { partidaId: id } })) ===
            0 &&
          (await tx.tiraAflojaRondaPresentada.count({
            where: { partidaId: id },
          })) === 0 &&
          (await tx.tugRoundVisibility.count({ where: { partidaId: id } })) ===
            0,
        'PRE_ACTIVE_EVIDENCE',
      );
      return {
        ...base,
        classification,
        evidenceHash: competitiveHash({
          version: 1,
          admission: m.competitivePolicy,
          time,
          events,
          abandonments,
          presence: presenceHash,
          participants,
        }),
      };
    }
    check(
      m.evidenciaVersion === 1 &&
        m.presenciaVersion === 1 &&
        m.certificacionRVersion === 1 &&
        m.versionReglas === 1,
      'VERSIONS',
    );
    const s = m.snapshotInicial as unknown as Row;
    check(
      s?.version === 1 &&
        s.qPartida === m.qPartida &&
        Number.isInteger(s.qPartida) &&
        s.qPartida >= 4 &&
        s.qPartida <= 20,
      'SNAPSHOT',
    );
    check(
      s.participants?.A === participants[0] &&
        s.participants?.B === participants[1],
      'SNAPSHOT_PARTICIPANTS',
    );
    const c = s.config;
    check(
      c &&
        c.area === m.area &&
        c.versionReglas === 1 &&
        c.segundosPorRonda === 10 &&
        c.pausaMs === 1500 &&
        c.cuentaRegresivaMs === 3000 &&
        c.posicionMeta === 4 &&
        c.empateRapidezMs === 200 &&
        tugIsoUs(c.expiraEn) === us(time.deadline),
      'CONFIG',
    );
    const assigned = await tx.tiraAflojaPregunta.findMany({
      where: { partidaId: id },
      orderBy: { orden: 'asc' },
    });
    check(
      Array.isArray(s.questions) &&
        s.questions.length === s.qPartida &&
        assigned.length === s.qPartida,
      'SNAPSHOT_CARDINALITY',
    );
    const questionIds = new Set<string>();
    s.questions.forEach((q: Row, i: number) => {
      const options = q.pregunta?.respuestas;
      check(
        q.orden === i + 1 &&
          assigned[i].orden === i + 1 &&
          q.preguntaId === assigned[i].preguntaId &&
          q.pregunta?.id === q.preguntaId &&
          !questionIds.has(q.preguntaId),
        'QUESTION_ORDER',
      );
      questionIds.add(q.preguntaId);
      check(
        typeof q.pregunta.enunciado === 'string' &&
          q.pregunta.enunciado.trim() &&
          typeof q.pregunta.dificultad === 'string' &&
          typeof q.pregunta.tema === 'string' &&
          typeof q.pregunta.subtema === 'string' &&
          typeof q.pregunta.area === 'string' &&
          (q.pregunta.imagenUrl === null ||
            typeof q.pregunta.imagenUrl === 'string') &&
          (q.pregunta.explicacion === null ||
            typeof q.pregunta.explicacion === 'string') &&
          (q.pregunta.contexto === null ||
            (typeof q.pregunta.contexto?.id === 'string' &&
              typeof q.pregunta.contexto.contexto === 'string')),
        'QUESTION_CONTENT',
      );
      check(
        Array.isArray(options) &&
          options.length >= 2 &&
          options.every(
            (o: Row) =>
              typeof o.id === 'string' &&
              o.id.length > 0 &&
              typeof o.texto === 'string' &&
              o.texto.trim() &&
              typeof o.esCorrecta === 'boolean',
          ) &&
          options.filter((o: Row) => o.esCorrecta).length === 1 &&
          new Set(options.map((o: Row) => o.id)).size === options.length,
        'OPTIONS',
      );
      check(
        competitiveHash(options.map((o: Row) => o.id)) ===
          competitiveHash(q.opcionesOrden) &&
          competitiveHash(q.opcionesOrden) ===
            competitiveHash(assigned[i].opcionesOrden),
        'OPTIONS_ORDER',
      );
    });
    const presented = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(r) || jsonb_build_object(
      'startUs',(extract(epoch FROM "programadaEn")*1000000)::bigint::text,
      'shownUs',(extract(epoch FROM "presentadaEn")*1000000)::bigint::text,
      'registeredUs',(extract(epoch FROM "registradaEn")*1000000)::bigint::text,
      'endUs',(extract(epoch FROM "venceEn")*1000000)::bigint::text) AS row
      FROM "TiraAflojaRondaPresentada" r WHERE "partidaId"=${id}::uuid ORDER BY ronda,"usuarioId"`
    ).map((r) => r.row);
    const certificates = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(r) || jsonb_build_object(
      'seenUs',(extract(epoch FROM "observadaEn")*1000000)::bigint::text,
      'limitUs',(extract(epoch FROM "limiteEn")*1000000)::bigint::text) AS row
      FROM "TugRoundVisibility" r WHERE "partidaId"=${id}::uuid ORDER BY ronda`
    ).map((r) => r.row);
    const answers = (
      await tx.$queryRaw<
        { row: Row }[]
      >`SELECT to_jsonb(r) || jsonb_build_object(
      'atUs',(extract(epoch FROM "recibidaEn")*1000000)::bigint::text) AS row
      FROM "TiraAflojaRespuesta" r WHERE "partidaId"=${id}::uuid ORDER BY ronda,"usuarioId"`
    ).map((r) => r.row);
    const starts = events.filter((e) => e.tipo === 'RONDA_INICIADA');
    const resolved = events.filter((e) => e.tipo === 'RONDA_RESUELTA');
    const finals = events.filter((e) => e.tipo === 'FINALIZADA');
    check(
      events.length > 0 &&
        events.every((e, i) => e.version === i) &&
        events[events.length - 1].version === m.version,
      'EVENT_SEQUENCE',
    );
    check(
      starts.length ===
        resolved.length + (classification === 'NORMAL' ? 0 : 1) &&
        starts.length >= 1 &&
        starts.length <= s.qPartida &&
        finals.length === (classification === 'NORMAL' ? 1 : 0),
      'ROUND_SEQUENCE',
    );
    let position = 0;
    let r = 0;
    const correct = [0, 0];
    const keys = new Set<string>();
    let lastEnd = 0n;
    let started = 0n;
    let finalEligibleAt = 0n;
    for (let i = 0; i < starts.length; i++) {
      const begin = starts[i].datos as Row,
        result = resolved[i]?.datos as Row | undefined;
      check(
        begin.ronda === i + 1 &&
          (!result ||
            (result.ronda === i + 1 &&
              starts[i].version < resolved[i].version)) &&
          (i === 0 || resolved[i - 1].version < starts[i].version),
        'ROUND_ORDER',
      );
      // ISO event windows are server-frozen milliseconds; pair times retain µs.
      const start = tugIsoUs(begin.iniciaEn);
      const end = tugIsoUs(begin.venceEn);
      check(
        end - start === 10000000n &&
          (i === 0 || start === lastEnd + 1500000n) &&
          start >= us(time.admission),
        'ROUND_WINDOW',
      );
      if (i === 0) started = start;
      check(
        i !== 0 || !activation || start === us(activation.atUs) + 3000000n,
        'ACTIVATION_WINDOW',
      );
      // No exact activation timestamp exists across the two event streams.
      // A disconnect during countdown cannot be ordered against activation
      // independently: retain fail-closed until a future immutable phase marker.
      check(
        presence.graces.every(
          (g) =>
            g.start >=
            (activation
              ? us(activation.atUs)
              : tugIsoUs(starts[0].datos.iniciaEn)),
        ),
        'GRACE_PHASE_UNPROVEN',
      );
      const rows = presented.filter((p) => p.ronda === i + 1);
      const certs = certificates.filter((p) => p.ronda === i + 1);
      check(rows.length === 0 || rows.length === 2, 'PAIR_INCOMPLETE');
      check(
        certs.length === (rows.length ? 1 : 0),
        'CERTIFICATE_MISSING_OR_ORPHAN',
      );
      if (rows.length) {
        r++;
        const cert = certs[0];
        check(
          new Set(rows.map((p) => p.usuarioId)).size === 2 &&
            participants.every((u) => rows.some((p) => p.usuarioId === u)),
          'PAIR_PARTICIPANTS',
        );
        check(
          rows.every(
            (p) =>
              p.preguntaId === s.questions[i].preguntaId &&
              us(p.startUs) === start &&
              us(p.endUs) === end &&
              us(p.shownUs) >= start &&
              us(p.registeredUs) >= us(p.shownUs) &&
              us(p.registeredUs) < min(end, us(time.deadline)) &&
              p.origenXid === cert.origenXid &&
              p.origenPid === cert.origenPid,
          ),
          'PAIR_ORIGIN',
        );
        check(
          /^\d+$/.test(cert.origenXid) &&
            /^\d+$/.test(cert.testigoXid) &&
            cert.origenXid !== cert.testigoXid &&
            Number.isInteger(cert.origenPid) &&
            cert.origenPid > 0 &&
            Number.isInteger(cert.testigoPid) &&
            cert.testigoPid > 0 &&
            cert.origenPid !== cert.testigoPid &&
            us(cert.limitUs) === min(end, us(time.deadline)) &&
            rows.every((p) => us(cert.seenUs) >= us(p.registeredUs)) &&
            us(cert.seenUs) < us(cert.limitUs),
          'CERTIFICATE_INVALID',
        );
      }
      const roundAnswers = answers.filter((a) => a.ronda === i + 1);
      check(
        roundAnswers.length <= 2 &&
          new Set(roundAnswers.map((a) => a.usuarioId)).size ===
            roundAnswers.length,
        'ANSWER_DUPLICATE',
      );
      for (const a of roundAnswers) {
        const p = rows.find((p) => p.usuarioId === a.usuarioId);
        const option = s.questions[i].pregunta.respuestas.find(
          (o: Row) => o.id === a.respuestaSeleccionadaId,
        );
        check(
          p &&
            option &&
            a.preguntaId === p.preguntaId &&
            !keys.has(a.claveIdempotencia) &&
            /^[a-f0-9-]{36}$/.test(a.claveIdempotencia) &&
            a.esCorrecta === option.esCorrecta &&
            us(a.atUs) >= us(p.shownUs) &&
            us(a.atUs) >= start &&
            us(a.atUs) < min(end, us(time.deadline)),
          'ANSWER_INVALID',
        );
        keys.add(a.claveIdempotencia);
        check(
          us(a.atUs) <= terminal && presence.openAt(a.usuarioId, us(a.atUs)),
          'ANSWER_PRESENCE',
        );
        if (option.esCorrecta) correct[participants.indexOf(a.usuarioId)]++;
      }
      const decisionAt =
        roundAnswers.length === 2
          ? roundAnswers.reduce((t, a) => (t > us(a.atUs) ? t : us(a.atUs)), 0n)
          : end;
      check(
        !result || classification === 'NORMAL' || decisionAt <= terminal,
        'RESOLVED_AFTER_EXCEPTIONAL_TERMINAL',
      );
      check(
        !result ||
          (decisionAt < deadline &&
            presence.graceAt(decisionAt).every((g) => decisionAt < g.end)),
        'GRACE_PRECEDENCE_UNPROVEN',
      );
      if (!result) {
        check(
          i === starts.length - 1 &&
            (classification === 'EXPLICIT_ACTIVE'
              ? decisionAt > terminal
              : decisionAt >= terminal),
          'NORMAL_PRECEDENCE_UNPROVEN',
        );
        continue;
      }
      const a = roundAnswers.find((a) => a.usuarioId === participants[0]);
      const b = roundAnswers.find((a) => a.usuarioId === participants[1]);
      const { movement, reason } = replayTugRound(a as any, b as any);
      position = Math.max(-4, Math.min(4, position + movement));
      check(
        result.movimiento === movement &&
          result.motivo === reason &&
          result.posicionCuerda === position &&
          result.respuestaCorrectaId ===
            s.questions[i].pregunta.respuestas.find((o: Row) => o.esCorrecta)
              .id,
        'SPORTS_CONFLICT',
      );
      finalEligibleAt =
        roundAnswers.length === 2
          ? roundAnswers.reduce((t, a) => (t > us(a.atUs) ? t : us(a.atUs)), 0n)
          : end;
      check(
        finalEligibleAt < us(time.deadline) &&
          (i === starts.length - 1 || Math.abs(position) < 4),
        'TERMINAL_PRECEDENCE',
      );
      lastEnd = finalEligibleAt;
    }
    check(
      answers.length === keys.size &&
        presented.length === r * 2 &&
        certificates.length === r &&
        correct.every((c) => c <= r),
      'UNACCOUNTED_EVIDENCE',
    );
    if (classification !== 'NORMAL') {
      check(
        Math.abs(position) < 4 &&
          resolved.length < s.qPartida &&
          m.posicionCuerda === position &&
          m.rondaActual === starts.length,
        'NO_NORMAL_PRECEDENCE',
      );
      return {
        ...base,
        classification,
        correct,
        actions: participants.map(
          (u) => answers.filter((a) => a.usuarioId === u).length,
        ),
        presentedRounds: r,
        evidenceHash: competitiveHash({
          version: 1,
          admission: m.competitivePolicy,
          time,
          snapshot: s,
          presented,
          certificates,
          answers,
          events,
          abandonments,
          presence: presenceHash,
          participants,
        }),
      };
    }
    check(
      Math.abs(position) === 4 || starts.length === s.qPartida,
      'NO_NORMAL_TERMINAL',
    );
    const result =
      position > 0 ? 'JUGADOR_A' : position < 0 ? 'JUGADOR_B' : 'EMPATE';
    const winner =
      position > 0 ? participants[0] : position < 0 ? participants[1] : null;
    const f = finals[0].datos as Row;
    check(
      m.preguntaActualId === null &&
        m.rondaIniciaEn === null &&
        m.rondaVenceEn === null &&
        !events.some((e) => e.tipo === 'CANCELADA') &&
        m.resultado === result &&
        m.ganadorId === winner &&
        m.posicionCuerda === position &&
        m.rondaActual === starts.length &&
        f.resultado === result &&
        f.ganadorId === winner &&
        f.posicionCuerda === position &&
        us(time.terminal) >= finalEligibleAt &&
        us(time.terminal) < us(time.deadline),
      'TERMINAL_CONFLICT',
    );
    check(
      pendingGraces.every((g) => terminal < g.end),
      'GRACE_PRECEDENCE_UNPROVEN',
    );
    const hash = competitiveHash({
      version: 1,
      admission: {
        at: time.admission,
        policy: m.competitivePolicy,
        participants,
      },
      snapshot: s,
      time,
      presented,
      certificates,
      answers,
      events,
      presence: presenceHash,
    });
    const terminals = participants.map((user, index) => ({
      source: { sourceType: 'TUG_MATCH', sourceId: id, participantId: user },
      gameId: 'TUG_OF_WAR',
      startedAt: new Date(Number(started / 1000n)),
      terminalAt: new Date(Number(us(time.terminal) / 1000n)),
      competitiveOnline: true,
      validParticipant: true,
      evidenceHash: hash,
      resolution: {
        kind: 'RESULTADO',
        facts: {
          gameId: 'TUG_OF_WAR',
          correct: correct[index],
          presentedRounds: r,
          outcome:
            winner === null
              ? 'EMPATE'
              : winner === user
                ? 'VICTORIA'
                : 'DERROTA',
        },
      },
    })) as [VerifiedTerminal, VerifiedTerminal];
    return {
      ...base,
      classification,
      correct,
      actions: participants.map(
        (u) => answers.filter((a) => a.usuarioId === u).length,
      ),
      presentedRounds: r,
      evidenceHash: hash,
      terminals: terminal % 1000n === 0n ? terminals : undefined,
    };
  }
}
