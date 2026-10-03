import { Prisma } from '@prisma/client';
import { CompetitivePairEvidence } from './competitive.pair-protocol';
import { VerifiedTerminal } from './competitive.contracts';
import { competitiveHash } from './competitive.service';
import { requireEvidence } from './competitive.rules';
import { canonicalSourceId } from './competitive.source';
import { readTugAdmission } from '../tira-afloja/tira-afloja.admission';

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

/** Exact PostgreSQL timestamp(6) comparison, independent of JS Date rounding. */
export function replayTugRound(
  a?: { esCorrecta: boolean; atUs: string },
  b?: { esCorrecta: boolean; atUs: string },
) {
  if (a?.esCorrecta && !b?.esCorrecta)
    return { movement: 2, reason: 'SOLO_A_CORRECTA' };
  if (b?.esCorrecta && !a?.esCorrecta)
    return { movement: -2, reason: 'SOLO_B_CORRECTA' };
  if (!a?.esCorrecta || !b?.esCorrecta)
    return { movement: 0, reason: 'NINGUNA_CORRECTA' };
  const difference = us(a.atUs) - us(b.atUs);
  if (difference >= -200000n && difference <= 200000n)
    return { movement: 0, reason: 'EMPATE_RAPIDEZ' };
  return {
    movement: difference < 0n ? 1 : -1,
    reason: difference < 0n ? 'A_MAS_RAPIDO' : 'B_MAS_RAPIDO',
  };
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
    const id = canonicalSourceId('TUG_MATCH', sourceId);
    // Same user -> advisory -> parent order as every durable presence writer.
    await tx.$queryRaw`SELECT tug_presence_lock(${id}::uuid)::text`;
    const m = await tx.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
    const participants = await this.originalParticipants(tx, id);
    check(
      m.evidenciaVersion === 1 &&
        m.presenciaVersion === 1 &&
        m.certificacionRVersion === 1 &&
        m.versionReglas === 1,
      'VERSIONS',
    );
    const [time] = await tx.$queryRaw<Row[]>`SELECT
      (extract(epoch FROM "fechaFinalizacion")*1000000)::bigint::text AS terminal,
      (extract(epoch FROM "expiraEn")*1000000)::bigint::text AS deadline,
      (extract(epoch FROM "competitiveAdmissionAt")*1000000)::bigint::text AS admission
      FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
    // to_jsonb preserves timestamp(6); Prisma Date would truncate event µs even
    // if they are used only in the canonical evidence hash.
    const events = (
      await tx.$queryRaw<{ row: Row }[]>`SELECT to_jsonb(e) AS row
      FROM "TiraAflojaEvento" e WHERE "partidaId"=${id}::uuid ORDER BY version`
    ).map((e) => e.row);
    const abandonments = await tx.tugAbandonment.findMany({
      where: { matchId: id },
    });
    check(
      abandonments.length === 0 && !events.some((e) => e.tipo === 'ABANDONO'),
      'ABANDONMENT_CONTRACT_UNSUPPORTED',
    );
    check(
      m.estado === 'FINALIZADA' &&
        m.fechaFinalizacion &&
        ['JUGADOR_A', 'JUGADOR_B', 'EMPATE'].includes(m.resultado!),
      'NEUTRAL_OR_OPEN_UNSUPPORTED',
    );
    // Full grace/reconnection interval replay requires a separate proof. Do not
    // certify a normal result while bypassing a possibly earlier grace terminal.
    const graceEvents = await tx.tugPresenceEvent.count({
      where: { matchId: id, kind: { in: ['GRACE', 'ABANDONED'] } },
    });
    check(graceEvents === 0, 'GRACE_PRECEDENCE_UNPROVEN');
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
        BigInt(Date.parse(c.expiraEn)) * 1000n === us(time.deadline),
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
      starts.length === resolved.length &&
        starts.length >= 1 &&
        starts.length <= s.qPartida &&
        finals.length === 1 &&
        events[events.length - 1].id === finals[0].id,
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
        result = resolved[i].datos as Row;
      check(
        begin.ronda === i + 1 &&
          result.ronda === i + 1 &&
          starts[i].version < resolved[i].version &&
          (i === 0 || resolved[i - 1].version < starts[i].version),
        'ROUND_ORDER',
      );
      // ISO event windows are server-frozen milliseconds; pair times retain µs.
      const start = BigInt(Date.parse(begin.iniciaEn)) * 1000n;
      const end = BigInt(Date.parse(begin.venceEn)) * 1000n;
      check(
        end - start === 10000000n &&
          (i === 0 || start === lastEnd + 1500000n) &&
          start >= us(time.admission),
        'ROUND_WINDOW',
      );
      if (i === 0) started = start;
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
        if (option.esCorrecta) correct[participants.indexOf(a.usuarioId)]++;
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
    check(us(time.terminal) % 1000n === 0n, 'TERMINAL_PRECISION_UNSUPPORTED');
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
    });
    return participants.map((user, index) => ({
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
  }
}
