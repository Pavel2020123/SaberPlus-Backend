// Real ledger/transaction tests of an ISOLATED kernel. The adapter below is a
// synthetic protocol fixture, NOT an authoritative TUG verifier or admission.
require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const {
  CompetitivePairProtocol,
} = require('../src/competitive/competitive.pair-protocol');
const {
  competitiveHash,
  CompetitiveService,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, other;
const clients = [];
function client() {
  const c = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  clients.push(c);
  return c;
}
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  db = client();
  other = client();
  await db.$executeRaw`CREATE TABLE "CompetitivePairProtocolFixture" (id uuid PRIMARY KEY, a uuid, b uuid, terminal_at timestamp, started_at timestamp, facts jsonb)`;
});
after(async () => {
  if (db) await db.$executeRaw`DROP TABLE "CompetitivePairProtocolFixture"`;
  await Promise.all(clients.map((c) => c.$disconnect()));
});
const normal = (correct, presentedRounds, outcome) => ({
  kind: 'RESULTADO',
  facts: { gameId: 'TUG_OF_WAR', correct, presentedRounds, outcome },
});
const abandoned = { kind: 'ABANDONO', definitive: true };
const special = (correct, participated) => ({
  kind: 'VICTORIA_POR_ABANDONO',
  facts: {
    gameId: 'TUG_OF_WAR',
    correct,
    snapshotQuestions: 4,
    acceptedAnswers: participated ? Math.max(1, correct) : 0,
    bothAbsent: false,
    activeCompetitiveMatch: true,
    validParticipants: true,
    definitiveAbandonment: true,
    sufficientEvidence: true,
  },
});
const adapter = {
  async originalParticipants(tx, id) {
    const [r] =
      await tx.$queryRaw`SELECT a,b FROM "CompetitivePairProtocolFixture" WHERE id=${id}::uuid`;
    assert.ok(r);
    return [r.a, r.b];
  },
  async loadLockedPair(tx, id) {
    // Fixture lock only; full source/certificate/replay verification is pending.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'partida:' + id}))::text`;
    const [r] =
      await tx.$queryRaw`SELECT * FROM "CompetitivePairProtocolFixture" WHERE id=${id}::uuid FOR UPDATE`;
    return [r.a, r.b].map((u, i) => ({
      source: { sourceType: 'TUG_MATCH', sourceId: id, participantId: u },
      gameId: 'TUG_OF_WAR',
      startedAt: r.started_at,
      terminalAt: r.terminal_at,
      competitiveOnline: true,
      validParticipant: true,
      evidenceHash: competitiveHash(r.facts),
      resolution: r.facts[i],
    }));
  },
};
async function fixture(
  facts = [normal(1, 4, 'VICTORIA'), normal(0, 4, 'DERROTA')],
) {
  const users = [];
  for (let i = 0; i < 2; i++)
    users.push(
      await db.usuario.create({
        data: {
          nombre: 'Owned pair protocol',
          correo: randomUUID() + '@example.invalid',
          contrasenaHash: 'none',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          xpTotal: 777,
        },
      }),
    );
  // The actual DB clock is sampled AFTER membership coverage was inserted.
  const [clock] =
    await db.$queryRaw`SELECT timezone('UTC',clock_timestamp())::timestamp(3) AS t`;
  const id = randomUUID();
  await db.$executeRaw`INSERT INTO "CompetitivePairProtocolFixture" VALUES(${id}::uuid,${users[0].id}::uuid,${users[1].id}::uuid,${clock.t},${clock.t},${JSON.stringify(facts)}::jsonb)`;
  return { id, users, service: new CompetitivePairProtocol(db, adapter) };
}
async function assertPair(f, nominal) {
  const events = await f.service.settlePair(f.id);
  assert.equal(events.length, 2);
  for (let i = 0; i < 2; i++) {
    const e = events.find((e) => e.usuarioId === f.users[i].id);
    assert.equal(e.deltaNominal, nominal[i]);
    assert.ok(e.saldoDespues >= 0);
    const balance = await db.balanceCompetitivo.findUniqueOrThrow({
      where: {
        usuarioId_gameId_temporada: {
          usuarioId: e.usuarioId,
          gameId: e.gameId,
          temporada: e.temporada,
        },
      },
    });
    assert.equal(balance.xp, e.saldoDespues);
    assert.equal(balance.version, e.secuencia);
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: e.usuarioId } }))
        .xpTotal,
      777,
    );
  }
  return events;
}
test('pair kernel: production registry rejects TUG and individual settlement remains unavailable', async () => {
  const f = await fixture();
  await assert.rejects(
    new CompetitiveService(
      db,
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()),
    ).settle({
      sourceType: 'TUG_MATCH',
      sourceId: f.id,
      participantId: f.users[0].id,
    }),
    /SOURCE_NOT_INTEGRATED/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    0,
  );
});
test('pair kernel: real ledger victory/defeat, half-up and R denominator; exact retry and restart reuse both events', async () => {
  const f = await fixture([
    normal(1, 16, 'VICTORIA'),
    normal(1, 16, 'DERROTA'),
  ]);
  const initial = await assertPair(f, [44, 4]); // 60/16=3.75; this is arithmetic, not a verified snapshot.
  const restarted = new CompetitivePairProtocol(other, adapter);
  for (let i = 0; i < 3; i++)
    assert.deepEqual(
      (await restarted.settlePair(f.id.toUpperCase())).map((e) => e.id).sort(),
      initial.map((e) => e.id).sort(),
    );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    2,
  );
});
test('pair kernel: exact .5 and tie; normal R=0 gives no bonuses', async () => {
  await assertPair(
    await fixture([normal(1, 8, 'EMPATE'), normal(1, 8, 'EMPATE')]),
    [28, 28],
  );
  await assertPair(
    await fixture([normal(0, 0, 'VICTORIA'), normal(0, 0, 'DERROTA')]),
    [0, 0],
  );
});
async function assertBlockedPair(f, error) {
  await assert.rejects(f.service.settlePair(f.id), error);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) } },
    }),
    0,
  );
  for (const user of f.users)
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: user.id } })).xpTotal,
      777,
    );
}
test('pair kernel: definitive abandonment alone cannot prove ACTIVA, regardless of rival reward facts', async () => {
  for (const reward of [special(1, true), special(0, false), special(4, true)])
    for (const facts of [
      [abandoned, reward],
      [reward, abandoned],
    ])
      await assertBlockedPair(
        await fixture(facts),
        /PAIR_ABANDONMENT_PHASE_UNVERIFIED/,
      );
});

test('pair kernel: two definitive abandonments block the complete pair without penalties or balances', async () => {
  await assertBlockedPair(
    await fixture([abandoned, abandoned]),
    /PAIR_DOUBLE_ABANDONMENT_UNAPPROVED/,
  );
});

test('pair kernel: EXPLICIT before ACTIVA cannot be mislabeled as penalizable abandonment', async () => {
  // Simulate the unsafe adapter classification: the existing contract carries
  // only definitive=true and cannot convey the source's pre-ACTIVA phase.
  // No invented wasActive flag or client assertion can authorize this pair.
  const f = await fixture([abandoned, special(0, false)]);
  await assertBlockedPair(f, /PAIR_ABANDONMENT_PHASE_UNVERIFIED/);
  const sourceBefore =
    await db.$queryRaw`SELECT * FROM "CompetitivePairProtocolFixture" WHERE id=${f.id}::uuid`;
  await assertBlockedPair(f, /PAIR_ABANDONMENT_PHASE_UNVERIFIED/);
  assert.deepEqual(
    await db.$queryRaw`SELECT * FROM "CompetitivePairProtocolFixture" WHERE id=${f.id}::uuid`,
    sourceBefore,
  );
});

test('pair kernel: unsupported neutral classification never becomes a tie or abandonment payment', async () => {
  await assertBlockedPair(
    await fixture([special(0, false), special(0, false)]),
    /PAIR_TERMINAL_CLASSIFICATION_UNSUPPORTED/,
  );
});
test('pair kernel: invalid evidence for second participant blocks the entire transaction before posting', async () => {
  const f = await fixture([normal(1, 4, 'VICTORIA'), normal(2, 1, 'DERROTA')]);
  await assert.rejects(f.service.settlePair(f.id));
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) } },
    }),
    0,
  );
});
test('pair kernel: intermediate failure after first real ledger write rolls back BOTH balances and events', async () => {
  const f = await fixture();
  class Failing extends CompetitivePairProtocol {
    async post(tx, p) {
      const result = await super.post(tx, p);
      throw new Error('INJECTED_AFTER_FIRST_LEDGER_WRITE');
    }
  }
  await assert.rejects(
    new Failing(db, adapter).settlePair(f.id),
    /INJECTED_AFTER_FIRST_LEDGER_WRITE/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) } },
    }),
    0,
  );
  await assertPair(f, [55, 0]);
});
test('pair kernel: independent instances serialize concurrent retries with source key and sorted original users', async () => {
  const f = await fixture();
  const outcomes = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      new CompetitivePairProtocol(i % 2 ? other : db, adapter).settlePair(f.id),
    ),
  );
  assert.ok(
    outcomes.every(
      (o) =>
        o.length === 2 &&
        o
          .map((e) => e.id)
          .sort()
          .join() ===
          outcomes[0]
            .map((e) => e.id)
            .sort()
            .join(),
    ),
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    2,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) }, version: 1 },
    }),
    2,
  );
});
test('pair kernel: changed evidence blocks further writes', async () => {
  const f = await fixture();
  await assertPair(f, [55, 0]);
  await db.$executeRaw`UPDATE "CompetitivePairProtocolFixture" SET facts=${JSON.stringify([normal(0, 4, 'VICTORIA'), normal(0, 4, 'DERROTA')])}::jsonb WHERE id=${f.id}::uuid`;
  await assert.rejects(f.service.settlePair(f.id), /IDEMPOTENCY_CONFLICT/);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    2,
  );
});
test('pair kernel: unequal R and incompatible outcomes block both participants', async () => {
  for (const facts of [
    [normal(0, 0, 'VICTORIA'), normal(0, 1, 'DERROTA')],
    [normal(1, 4, 'VICTORIA'), normal(1, 4, 'VICTORIA')],
  ]) {
    const f = await fixture(facts);
    await assert.rejects(
      f.service.settlePair(f.id),
      /PAIR_R_CONFLICT|PAIR_OUTCOME_CONFLICT/,
    );
    assert.equal(
      await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
      0,
    );
  }
});
test('pair kernel: partial legacy writer fixture is detected and never completed silently', async () => {
  const f = await fixture();
  class PartialFixture extends CompetitivePairProtocol {
    async post(tx, p) {
      if (this.first) return this.first;
      this.first = await super.post(tx, p);
      return this.first;
    }
  }
  // Deliberately broken test-only writer creates an existing partial projection.
  await new PartialFixture(db, adapter).settlePair(f.id);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    1,
  );
  await assert.rejects(f.service.settlePair(f.id), /PAIR_PARTIAL_SETTLEMENT/);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    1,
  );
});
test('pair kernel: missing historical coverage blocks BOTH postings without inventing history', async () => {
  const f = await fixture();
  await db.$executeRaw`UPDATE "CompetitivePairProtocolFixture" SET terminal_at=(SELECT min(desde)-interval '1 second' FROM "HistorialInstitucionCompetitiva" WHERE "usuarioId" IN (${f.users[0].id}::uuid,${f.users[1].id}::uuid)), started_at=(SELECT min(desde)-interval '2 seconds' FROM "HistorialInstitucionCompetitiva" WHERE "usuarioId" IN (${f.users[0].id}::uuid,${f.users[1].id}::uuid)) WHERE id=${f.id}::uuid`;
  await assert.rejects(
    f.service.settlePair(f.id),
    /HISTORICAL_MEMBERSHIP_UNKNOWN/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    0,
  );
  assert.equal(
    await db.balanceCompetitivo.count({
      where: { usuarioId: { in: f.users.map((u) => u.id) } },
    }),
    0,
  );
});

test('pair kernel: institutional transitions supersede old rows at the exact boundary, including null departure', async () => {
  const f = await fixture();
  const institutions = [];
  for (let i = 0; i < 2; i++) {
    const id = randomUUID();
    institutions.push(
      await db.institucion.create({
        data: { id, nombre: 'Owned history fixture', codigoUnico: id },
      }),
    );
  }
  const sources = [{ id: f.id, institution: null }];
  for (const institution of [...institutions, null]) {
    // Wait only for the next representable PostgreSQL millisecond, so the
    // boundary is distinct from the preceding terminal, not an arbitrary delay.
    await db.$executeRaw`DO $$ DECLARE boundary timestamptz := date_trunc('milliseconds',clock_timestamp()) + interval '1 millisecond'; BEGIN WHILE clock_timestamp() <= boundary LOOP PERFORM pg_sleep(0.001); END LOOP; END $$`;
    await db.usuario.update({
      where: { id: f.users[0].id },
      data: { institucionId: institution?.id ?? null },
    });
    const membership =
      await db.historialInstitucionCompetitiva.findFirstOrThrow({
        where: { usuarioId: f.users[0].id },
        orderBy: [{ desde: 'desc' }, { id: 'desc' }],
      });
    assert.equal(membership.institucionId, institution?.id ?? null);
    const id = randomUUID();
    // Each source closes exactly at the real trigger's transition timestamp.
    await db.$executeRaw`INSERT INTO "CompetitivePairProtocolFixture" SELECT ${id}::uuid,a,b,${membership.desde},started_at,facts FROM "CompetitivePairProtocolFixture" WHERE id=${f.id}::uuid`;
    sources.push({ id, institution: institution?.id ?? null });
  }
  // All settlements run AFTER departure, in reverse order; they must not read
  // Usuario.institucionId or accidentally reuse an ended institutional state.
  for (const source of sources.reverse()) {
    const events = await f.service.settlePair(source.id);
    assert.equal(
      events.find((e) => e.usuarioId === f.users[0].id).institucionId,
      source.institution,
    );
    assert.equal(
      events.find((e) => e.usuarioId === f.users[1].id).institucionId,
      null,
    );
    assert.equal(events.length, 2);
  }
  assert.equal(
    await db.historialInstitucionCompetitiva.count({
      where: { usuarioId: f.users[0].id },
    }),
    4,
  );
});
test('pair kernel: ledger settlement waits for sorted user/source closure locks without deadlock', async () => {
  const f = await fixture();
  const monitor = client();
  let settle;
  await other.$transaction(
    async (tx) => {
      for (const id of f.users.map((u) => u.id).sort())
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'partida:' + f.id}))::text`;
      const before = (
        await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%') AS waiting`
      )[0].waiting;
      assert.equal(before, false);
      settle = f.service.settlePair(f.id);
      settle.catch(() => {}); // Always awaited below; avoid a secondary unhandled rejection if holder fails.
      // Actual PostgreSQL lock wait is the barrier, not an arbitrary delay.
      // An independent autocommit observer avoids pg_stat_activity's transaction snapshot.
      while (
        !(
          await monitor.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%') AS waiting`
        )[0].waiting
      )
        await tx.$queryRaw`SELECT pg_sleep(0.01)::text`;
      const stale = (
        await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%') AS waiting`
      )[0].waiting;
      assert.equal(stale, false);
      await tx.$queryRaw`SELECT pg_stat_clear_snapshot()::text`;
      const refreshed = (
        await tx.$queryRaw`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Usuario%') AS waiting`
      )[0].waiting;
      assert.equal(refreshed, true);
      console.log(
        JSON.stringify({
          diagnostic: 'activity-snapshot-versus-independent-lock-observer',
          before,
          stale,
          refreshed,
        }),
      );
    },
    { maxWait: 10000, timeout: 20000 },
  );
  assert.equal((await settle).length, 2);
  assert.equal(
    await db.eventoXpCompetitivo.count({ where: { sourceId: f.id } }),
    2,
  );
});
