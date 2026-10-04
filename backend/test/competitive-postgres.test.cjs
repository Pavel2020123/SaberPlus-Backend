// Run only through tool/test_competitive_postgres.mjs; no .env loading.
require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const {
  CompetitiveService,
  competitiveHash,
} = require('../src/competitive/competitive.service');
const {
  CompetitiveVerifierRegistry,
  SOURCE_FOR_GAME,
} = require('../src/competitive/competitive.contracts');
let db, service;
const {
  InstitucionAccesoService,
} = require('../src/institucion/institucion-acceso.service');
const {
  InstitucionService,
} = require('../src/institucion/institucion.service');
const {
  AdministracionInstitucionService,
} = require('../src/institucion/administracion-institucion.service');
const { EstudianteService } = require('../src/institucion/estudiante.service');
const {
  EstudianteImportService,
} = require('../src/institucion/estudiante-import.service');
const {
  VinculacionGrupoService,
} = require('../src/institucion/vinculacion-grupo.service');
const { GrupoService } = require('../src/institucion/grupo.service');

test('every existing source family canonicalizes equivalent UUIDs before idempotency', async () => {
  for (const gameId of [
    'TRIVIA_RUSH',
    'SUMMIT',
    'TUG_OF_WAR',
    'GUARDIAN',
    'BATTLES',
    'STAR_RESCUE',
  ]) {
    const u = await user();
    const ref = await source(
      u,
      { gameId },
      { resolution: { kind: 'ABANDONO', definitive: true } },
    );
    const [a, b] = await Promise.all([
      service.settle(ref),
      service.settle({ ...ref, sourceId: ref.sourceId.toUpperCase() }),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(a.sourceId, ref.sourceId);
    assert.equal((await events(u)).length, 1);
    await assert.rejects(
      service.settle({ ...ref, sourceId: ref.sourceId.replaceAll('-', '') }),
      /INVALID_SOURCE_ID/,
    );
    const { id, ...data } = a;
    await assert.rejects(
      db.eventoXpCompetitivo.create({
        data: {
          ...data,
          id: randomUUID(),
          sourceId: ref.sourceId.toUpperCase(),
          secuencia: 2,
          idempotencyKey: competitiveHash(randomUUID()),
        },
      }),
    );
  }
});
test('INVALIDACION is unavailable in the service and PostgreSQL enum; current projection stays intact', async () => {
  const u = await user(),
    admin = await user('ADMIN');
  const first = await service.settle(
    await source(u, {
      gameId: 'TRIVIA_RUSH',
      questions: 10,
      correct: 4,
      maxCombo: 4,
    }),
  );
  // -50 is the user's arithmetic counterexample, represented as an explicit
  // administrative correction; it is NOT an approved V1 abandonment nominal.
  await service.correct(correction(first, admin, -50));
  await service.settle(
    await source(u, {
      gameId: 'TRIVIA_RUSH',
      questions: 10,
      correct: 2,
      maxCombo: 2,
    }),
  );
  await assert.rejects(
    service.correct(correction(first, admin, -40, { kind: 'INVALIDACION' })),
    /UNSUPPORTED_CORRECTION_KIND/,
  );
  await assert.rejects(
    db.$queryRawUnsafe(`SELECT 'INVALIDACION'::"TipoEventoXpCompetitivo"`),
  );
  assert.equal((await balances(u))[0].xp, 20);
  assert.equal((await events(u)).length, 3);
});

async function institutionContext() {
  const owner = await user('PROFESOR');
  const access = new InstitucionAccesoService(db);
  const institutions = new InstitucionService(
    db,
    { signAsync: async () => 'test-token' },
    access,
  );
  const school = await institutions.crearInstitucion(
    owner.id,
    `Fixture ${randomUUID()}`,
  );
  await db.institucion.update({
    where: { id: school.id },
    data: { estadoVerificacion: 'APROBADA' },
  });
  return {
    owner,
    school,
    access,
    institutions,
    administration: new AdministracionInstitucionService(db),
  };
}
async function assertMembership(uid, expected) {
  const current = await db.usuario.findUniqueOrThrow({ where: { id: uid } });
  const latest = await db.historialInstitucionCompetitiva.findFirst({
    where: { usuarioId: uid },
    orderBy: [{ desde: 'desc' }, { id: 'desc' }],
  });
  assert.equal(current.institucionId, expected);
  assert.equal(latest.institucionId, expected);
}
test('real student creation, existing-user enrollment and CSV import all update historical membership', async () => {
  const { owner, school, access } = await institutionContext();
  const students = new EstudianteService(db, access);
  const created = await students.crearEstudianteEnMiInstitucion(
    owner.id,
    'Fixture student',
    `${randomUUID()}@example.invalid`,
    'SafeFixture123!',
  );
  const existing = await user();
  await students.agregarEstudianteExistenteAMiInstitucion(
    owner.id,
    existing.correo,
  );
  const email = `${randomUUID()}@example.invalid`;
  const imported = await new EstudianteImportService(
    db,
    access,
  ).importarEstudiantesCsv(owner.id, {
    buffer: Buffer.from(
      `nombre,correo,contrasena\nFixture,${email},SafeFixture123!`,
    ),
  });
  assert.equal(imported.creados, 1);
  const csvUser = await db.usuario.findUniqueOrThrow({
    where: { correo: email },
  });
  for (const u of [created, existing, csvUser]) {
    await assertMembership(u.id, school.id);
    assert.equal(
      await db.miembroInstitucion.count({ where: { usuarioId: u.id } }),
      0,
    );
    assert.equal(
      (await service.settle(await source(u))).institucionId,
      school.id,
    );
  }
});
test('real staff requests, invitations, role changes and removal keep institution synchronized', async () => {
  const { owner, school, administration } = await institutionContext();
  await assertMembership(owner.id, school.id); // nested Usuario.connect in institution creation
  const teacher = await user('PROFESOR');
  const request = await db.solicitudIngresoInstitucion.create({
    data: { institucionId: school.id, solicitanteId: teacher.id },
  });
  await administration.revisarSolicitud(owner.id, request.id, 'APROBAR');
  await assertMembership(teacher.id, school.id);
  const invited = await user('PROFESOR');
  const invitation = await administration.crearInvitacion(
    owner.id,
    invited.correo,
    'PROFESOR',
  );
  await administration.responderInvitacion(invited.id, invitation.id, true);
  await assertMembership(invited.id, school.id);
  const member = await db.miembroInstitucion.findUniqueOrThrow({
    where: { usuarioId: invited.id },
  });
  const historyCount = await db.historialInstitucionCompetitiva.count({
    where: { usuarioId: invited.id },
  });
  await administration.cambiarRol(owner.id, member.id, 'ADMINISTRADOR');
  await administration.transferirPropiedad(
    owner.id,
    member.id,
    school.codigoUnico,
  );
  assert.equal(
    await db.historialInstitucionCompetitiva.count({
      where: { usuarioId: invited.id },
    }),
    historyCount,
  );
  const teacherMember = await db.miembroInstitucion.findUniqueOrThrow({
    where: { usuarioId: teacher.id },
  });
  await administration.retirarMiembro(invited.id, teacherMember.id);
  await assertMembership(teacher.id, null);
  assert.equal(
    await db.miembroInstitucion.count({ where: { usuarioId: teacher.id } }),
    0,
  );
});
test('group enrollment affects membership; removal from group does not; institution deletion clears it', async () => {
  const { owner, school, access, institutions } = await institutionContext();
  const group = await db.clase.create({
    data: {
      nombre: 'Fixture group',
      codigoIngreso: randomUUID(),
      grado: 'ONCE',
      institucionId: school.id,
    },
  });
  const joins = new VinculacionGrupoService(db, access);
  const code = await joins.crearCodigo(owner.id, group.id, 15, 2);
  const student = await user();
  await joins.aceptarIngreso(student.id, code.codigo, true);
  await assertMembership(student.id, school.id);
  const refBeforeDeletion = await source(student);
  await new GrupoService(db, access).quitarEstudianteDeGrupo(
    owner.id,
    group.id,
    student.id,
  );
  await assertMembership(student.id, school.id);
  await pause();
  await institutions.eliminarMiInstitucion(owner.id);
  await assertMembership(student.id, null);
  await assertMembership(owner.id, null);
  assert.equal(
    await db.miembroInstitucion.count({ where: { institucionId: school.id } }),
    0,
  );
  assert.equal(
    (await service.settle(refBeforeDeletion)).institucionId,
    school.id,
  );
  assert.equal(
    (await service.settle(await source(student))).institucionId,
    null,
  );
});
const pause = () => new Promise((resolve) => setTimeout(resolve, 5));
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  const marker = JSON.parse(
    await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8'),
  );
  validateCompetitiveDatabase(process.env.COMPETITIVE_TEST_URL, marker);
  db = new PrismaClient({
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  });
  await db.$connect();
  await db.$executeRawUnsafe(
    'CREATE TABLE "CompetitiveTestSource" (id text PRIMARY KEY, evidence jsonb NOT NULL)',
  );
  // Test-only persisted evidence, not a production adapter or client acceptance path.
  const verifiers = [...new Set(Object.values(SOURCE_FOR_GAME))].map(
    (sourceType) => ({
      sourceType,
      async loadTerminal(tx, source) {
        const [row] =
          await tx.$queryRaw`SELECT evidence FROM "CompetitiveTestSource" WHERE id = ${source.sourceId} FOR SHARE`;
        if (!row) throw new Error('MISSING_SERVER_SOURCE');
        return {
          ...row.evidence,
          startedAt: new Date(row.evidence.startedAt),
          terminalAt: new Date(row.evidence.terminalAt),
        };
      },
    }),
  );
  service = new CompetitiveService(
    db,
    new CompetitiveVerifierRegistry(verifiers),
  );
});
after(async () => {
  if (db) await db.$disconnect();
});
async function user(rol = 'ESTUDIANTE', institutionId = null) {
  const id = randomUUID();
  return db.usuario.create({
    data: {
      id,
      nombre: 'Competitive fixture',
      correo: `${id}@example.invalid`,
      contrasenaHash: 'not-a-real-password',
      rol,
      institucionId: institutionId,
      xpTotal: 123,
    },
  });
}
async function institution() {
  const id = randomUUID();
  return db.institucion.create({
    data: { id, nombre: 'Fixture', codigoUnico: id },
  });
}
const trivia = () => ({
  gameId: 'TRIVIA_RUSH',
  correct: 5,
  questions: 10,
  maxCombo: 2,
}); // 41
async function source(u, facts = trivia(), changes = {}) {
  await pause();
  const reference = {
    sourceId: randomUUID(),
    sourceType: SOURCE_FOR_GAME[facts.gameId],
    participantId: u.id,
  };
  const terminal = {
    source: reference,
    gameId: facts.gameId,
    startedAt: new Date(),
    terminalAt: new Date(),
    competitiveOnline: true,
    validParticipant: true,
    evidenceHash: competitiveHash(['server-actions', reference.sourceId]),
    resolution: { kind: 'RESULTADO', facts },
    ...changes,
  };
  await db.$executeRaw`INSERT INTO "CompetitiveTestSource" (id, evidence) VALUES (${reference.sourceId}, ${JSON.stringify(terminal)}::jsonb)`;
  return reference;
}
async function changeEvidence(ref, change) {
  const [row] =
    await db.$queryRaw`SELECT evidence FROM "CompetitiveTestSource" WHERE id = ${ref.sourceId}`;
  await db.$executeRaw`UPDATE "CompetitiveTestSource" SET evidence = ${JSON.stringify(change(row.evidence))}::jsonb WHERE id = ${ref.sourceId}`;
}
const balances = (u) =>
  db.balanceCompetitivo.findMany({ where: { usuarioId: u.id } });
const events = (u) =>
  db.eventoXpCompetitivo.findMany({
    where: { usuarioId: u.id },
    orderBy: { secuencia: 'asc' },
  });
const correction = (event, admin, nominalDelta, extra = {}) => ({
  operationId: randomUUID(),
  originalEventId: event.id,
  actorId: admin.id,
  reason: 'Verified test correction',
  nominalDelta,
  kind: 'CORRECCION',
  ...extra,
});

test('normal settlement: individual without institution, V1, no private metadata or general XP changes', async () => {
  const u = await user();
  const ref = await source(u);
  const event = await service.settle(ref);
  assert.equal(event.deltaNominal, 41);
  assert.equal(event.deltaAplicado, 41);
  assert.equal(event.institucionId, null);
  assert.equal(event.xpRulesVersion, 1);
  assert.deepEqual(event.metadata, { evidenceContract: 1 });
  assert.equal((await balances(u))[0].xp, 41);
  assert.equal(
    (await db.usuario.findUnique({ where: { id: u.id } })).xpTotal,
    123,
  );
});
test('twenty concurrent retries create one event and increment balance once', async () => {
  const u = await user();
  const ref = await source(u);
  const results = await Promise.all(
    Array.from({ length: 20 }, () => service.settle(ref)),
  );
  assert.equal(new Set(results.map((e) => e.id)).size, 1);
  assert.equal((await events(u)).length, 1);
  assert.equal((await balances(u))[0].version, 1);
  assert.equal((await service.settle(ref)).id, results[0].id);
  assert.equal(
    (
      await service.settle({
        ...ref,
        participantId: ref.participantId.toUpperCase(),
      })
    ).id,
    results[0].id,
  );
});
test('different concurrent sources preserve a reproducible balance sequence', async () => {
  const u = await user();
  const refs = await Promise.all(Array.from({ length: 12 }, () => source(u)));
  await Promise.all(refs.map((ref) => service.settle(ref)));
  const ledger = await events(u);
  let saldo = 0;
  ledger.forEach((event, i) => {
    assert.equal(event.secuencia, i + 1);
    assert.equal(event.saldoAntes, saldo);
    saldo += event.deltaAplicado;
    assert.equal(event.saldoDespues, saldo);
  });
  assert.equal(saldo, 12 * 41);
  assert.equal((await balances(u))[0].xp, saldo);
});
test('same identity with changed evidence conflicts; version never permits another payment', async () => {
  const u = await user();
  const ref = await source(u);
  await service.settle(ref);
  await assert.rejects(service.settle(ref, 2), /UNSUPPORTED_RULES_VERSION/);
  await changeEvidence(ref, (t) => ({
    ...t,
    evidenceHash: competitiveHash('different'),
  }));
  await assert.rejects(service.settle(ref), /IDEMPOTENCY_CONFLICT/);
  assert.equal((await events(u)).length, 1);
});
test('same Trivia source cannot pay again under Ghost identity', async () => {
  const u = await user();
  const ref = await source(u);
  await service.settle(ref);
  await changeEvidence(ref, (t) => ({
    ...t,
    gameId: 'GHOST_DUEL',
    resolution: {
      kind: 'RESULTADO',
      facts: {
        gameId: 'GHOST_DUEL',
        correct: 10,
        questions: 10,
        outcome: null,
        ghostId: null,
        ghostFixedAtStart: true,
        distinctMode: true,
        compatibleConfiguration: true,
      },
    },
  }));
  await assert.rejects(service.settle(ref), /IDEMPOTENCY_CONFLICT/);
  assert.equal((await balances(u)).length, 1);
});
test('incompatible ghost identity and result never write ledger or balance', async () => {
  for (const facts of [
    ...['VICTORIA', 'EMPATE', 'DERROTA'].map((outcome) => ({
      outcome,
      ghostId: null,
    })),
    { outcome: null, ghostId: 'fixed' },
    { outcome: 'INVALID', ghostId: 'fixed' },
  ]) {
    const u = await user();
    const ref = await source(u, {
      gameId: 'GHOST_DUEL',
      correct: 10,
      questions: 10,
      distinctMode: true,
      ghostFixedAtStart: true,
      compatibleConfiguration: true,
      ...facts,
    });
    await assert.rejects(
      service.settle(ref),
      /GHOST_RESULT_WITHOUT_REFERENCE|GHOST_RESULT_REQUIRED|INVALID_EVIDENCE/,
    );
    assert.equal((await events(u)).length, 0);
    assert.equal((await balances(u)).length, 0);
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      123,
    );
  }
});
test('professor/admin/null role never get a competitive balance', async () => {
  for (const role of ['PROFESOR', 'ADMIN', null]) {
    const u = await user(role);
    await assert.rejects(service.settle(await source(u)), /STUDENT_REQUIRED/);
    assert.equal((await balances(u)).length, 0);
  }
});
test('role is read under row lock after a concurrent role change commits', async () => {
  const u = await user();
  const ref = await source(u);
  let release, locked;
  const barrier = new Promise((r) => {
    locked = r;
  });
  const gate = new Promise((r) => {
    release = r;
  });
  const changing = db.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: u.id }, data: { rol: 'PROFESOR' } });
    locked();
    await gate;
  });
  await barrier;
  const settling = service.settle(ref);
  const assertion = assert.rejects(settling, /STUDENT_REQUIRED/);
  release();
  await changing;
  await assertion;
  assert.equal((await events(u)).length, 0);
});
test('delayed settlement preserves terminal institution; current membership is never fallback', async () => {
  const a = await institution(),
    b = await institution(),
    u = await user('ESTUDIANTE', a.id);
  const refA = await source(u);
  await pause();
  await db.usuario.update({
    where: { id: u.id },
    data: { institucionId: b.id },
  });
  const refB = await source(u);
  await pause();
  await db.usuario.update({
    where: { id: u.id },
    data: { institucionId: null },
  });
  const refNull = await source(u);
  assert.equal((await service.settle(refA)).institucionId, a.id);
  assert.equal((await service.settle(refB)).institucionId, b.id);
  assert.equal((await service.settle(refNull)).institucionId, null);
  assert.equal(
    await db.historialInstitucionCompetitiva.count({
      where: { usuarioId: u.id },
    }),
    3,
  );
});
test('unknown history before coverage rejects rather than inventing institution', async () => {
  const u = await user();
  const ref = await source(u, trivia(), {
    startedAt: new Date('2020-01-01Z'),
    terminalAt: new Date('2020-01-02Z'),
  });
  await assert.rejects(service.settle(ref), /HISTORICAL_MEMBERSHIP_UNKNOWN/);
  assert.equal((await balances(u)).length, 0);
});
test('Bogota year boundary splits balances; delayed correction inherits original year', async () => {
  const u = await user(),
    admin = await user('ADMIN');
  // Explicit synthetic historical evidence exists only in this disposable fixture.
  await db.historialInstitucionCompetitiva.create({
    data: {
      usuarioId: u.id,
      institucionId: null,
      desde: new Date('2025-01-01T00:00:00Z'),
    },
  });
  const first = await source(u, trivia(), {
    startedAt: new Date('2025-12-31T23:00:00Z'),
    terminalAt: new Date('2026-01-01T04:59:59.999Z'),
  });
  const second = await source(u, trivia(), {
    startedAt: new Date('2025-12-31T23:00:00Z'),
    terminalAt: new Date('2026-01-01T05:00:00Z'),
  });
  const original = await service.settle(first);
  const next = await service.settle(second);
  assert.equal(original.temporada, 2025);
  assert.equal(next.temporada, 2026);
  const fixed = await service.correct(correction(original, admin, -1));
  assert.equal(fixed.temporada, 2025);
  assert.deepEqual(fixed.fechaEfectiva, original.fechaEfectiva);
  const all = await balances(u);
  assert.equal(all.length, 2);
  assert.equal(all.find((b) => b.temporada === 2025).xp, 40);
  assert.equal(all.find((b) => b.temporada === 2026).xp, 41);
});
test('zero normal result preserves null reachedAt and still has an auditable sequence', async () => {
  const u = await user();
  const result = await service.settle(
    await source(u, {
      gameId: 'BATTLES',
      correct: 0,
      questions: 8,
      mode: 'CARRERA_FANTASMA',
      outcome: 'VICTORIA',
    }),
  );
  assert.equal(result.deltaAplicado, 0);
  assert.equal(result.secuencia, 1);
  const [balance] = await balances(u);
  assert.equal(balance.xp, 0);
  assert.equal(balance.alcanzadoEn, null);
  await assert.rejects(
    service.settle(
      await source(u, trivia(), {
        resolution: { kind: 'ABANDONO', definitive: false },
      }),
    ),
    /ABANDONMENT_NOT_DEFINITIVE/,
  );
});
test('abandonment replaces any partial reward, clamps to zero and preserves nominal delta', async () => {
  const u = await user();
  const original = await service.settle(await source(u));
  const admin = await user('ADMIN');
  await service.correct(correction(original, admin, -35)); // 6
  const abandon = await source(u, trivia(), {
    resolution: { kind: 'ABANDONO', definitive: true },
  });
  const event = await service.settle(abandon);
  assert.deepEqual(
    [
      event.saldoAntes,
      event.deltaNominal,
      event.deltaAplicado,
      event.saldoDespues,
    ],
    [6, -10, -6, 0],
  );
  const reached = (await balances(u))[0].alcanzadoEn;
  const zero = await service.settle(
    await source(u, trivia(), {
      resolution: { kind: 'ABANDONO', definitive: true },
    }),
  );
  assert.equal(zero.deltaAplicado, 0);
  assert.deepEqual((await balances(u))[0].alcanzadoEn, reached);
  await changeEvidence(abandon, (t) => ({
    ...t,
    resolution: { kind: 'RESULTADO', facts: trivia() },
  }));
  await assert.rejects(service.settle(abandon), /IDEMPOTENCY_CONFLICT/);
});
test('auditable corrections are concurrent, idempotent, floored and reference immutable origin', async () => {
  const a = await institution(),
    u = await user('ESTUDIANTE', a.id),
    admin = await user('ADMIN');
  const original = await service.settle(await source(u));
  await db.usuario.update({
    where: { id: u.id },
    data: { institucionId: null },
  });
  const same = correction(original, admin, 5);
  const retries = await Promise.all(
    Array.from({ length: 8 }, () => service.correct(same)),
  );
  assert.equal(new Set(retries.map((e) => e.id)).size, 1);
  assert.equal(
    (
      await service.correct({
        ...same,
        operationId: same.operationId.toUpperCase(),
        originalEventId: same.originalEventId.toUpperCase(),
        actorId: same.actorId.toUpperCase(),
      })
    ).id,
    retries[0].id,
  );
  await Promise.all(
    Array.from({ length: 8 }, () =>
      service.correct(correction(original, admin, 2)),
    ),
  );
  assert.equal((await balances(u))[0].xp, 62);
  const before = (await balances(u))[0].alcanzadoEn;
  await pause();
  const minus = await service.correct(correction(original, admin, -1000));
  assert.equal(minus.deltaAplicado, -62);
  assert.equal(minus.institucionId, a.id);
  assert.equal(minus.temporada, original.temporada);
  assert.deepEqual(minus.fechaEfectiva, original.fechaEfectiva);
  assert.equal(minus.eventoCorregidoId, original.id);
  assert.ok((await balances(u))[0].alcanzadoEn > before);
  await assert.rejects(
    service.correct({ ...same, nominalDelta: 6 }),
    /IDEMPOTENCY_CONFLICT/,
  );
  await assert.rejects(
    service.correct(correction(original, u, 1)),
    /ADMIN_REQUIRED/,
  );
  await assert.rejects(
    service.correct(correction(original, admin, 1, { reason: ' ' })),
    /INVALID_EVIDENCE/,
  );
  assert.equal(
    (await db.eventoXpCompetitivo.findUnique({ where: { id: original.id } }))
      .deltaAplicado,
    41,
  );
});
test('isolation between games and independent sequence', async () => {
  const u = await user();
  await service.settle(await source(u));
  await service.settle(
    await source(u, { gameId: 'SUMMIT', maxHeight: 3, victory: false }),
  );
  const all = await balances(u);
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((x) => x.xp).sort(), [41, 45]);
  assert.ok(all.every((x) => x.version === 1));
});
test('Memory, offline sources and degraded competitive banks fail closed', async () => {
  const u = await user();
  await assert.rejects(
    service.settle(
      await source(u, {
        gameId: 'MEMORY_MATCH',
        pairs: 10,
        moves: 10,
        hints: 0,
        completed: true,
      }),
    ),
    /MEMORY_COMPETITIVE_DISABLED/,
  );
  await assert.rejects(
    service.settle(await source(u, trivia(), { competitiveOnline: false })),
    /INELIGIBLE_SOURCE/,
  );
  await assert.rejects(
    service.settle(
      await source(u, {
        gameId: 'BATTLES',
        correct: 1,
        questions: 7,
        mode: 'CARRERA_FANTASMA',
        outcome: 'VICTORIA',
      }),
    ),
    /INCOMPLETE_COMPETITIVE_BANK/,
  );
  assert.equal((await events(u)).length, 0);
});
test('abandonment victory uses snapshot and accepted actions; both absent never creates a winner', async () => {
  const u = await user();
  const facts = {
    gameId: 'TUG_OF_WAR',
    correct: 1,
    acceptedAnswers: 1,
    snapshotQuestions: 20,
    activeCompetitiveMatch: true,
    validParticipants: true,
    definitiveAbandonment: true,
    sufficientEvidence: true,
    bothAbsent: false,
  };
  const normal = {
    gameId: 'TUG_OF_WAR',
    correct: 1,
    presentedRounds: 1,
    outcome: 'VICTORIA',
  };
  const event = await service.settle(
    await source(u, normal, {
      resolution: { kind: 'VICTORIA_POR_ABANDONO', facts },
    }),
  );
  assert.equal(event.deltaAplicado, 23);
  const zero = await service.settle(
    await source(u, normal, {
      resolution: {
        kind: 'VICTORIA_POR_ABANDONO',
        facts: { ...facts, correct: 0, acceptedAnswers: 0 },
      },
    }),
  );
  assert.equal(zero.deltaAplicado, 0);
  await assert.rejects(
    service.settle(
      await source(u, normal, {
        resolution: {
          kind: 'VICTORIA_POR_ABANDONO',
          facts: { ...facts, bothAbsent: true },
        },
      }),
    ),
    /NO_WINNER/,
  );
});
test('database constraints protect source identity across versions and append-only audit history', async () => {
  const u = await user(),
    original = await service.settle(await source(u));
  const { id, ...data } = original;
  await assert.rejects(
    db.eventoXpCompetitivo.create({
      data: {
        ...data,
        id: randomUUID(),
        idempotencyKey: competitiveHash('duplicate'),
        xpRulesVersion: 2,
        secuencia: 2,
      },
    }),
  );
  await assert.rejects(
    db.eventoXpCompetitivo.update({ where: { id }, data: { deltaNominal: 0 } }),
  );
  await assert.rejects(db.eventoXpCompetitivo.delete({ where: { id } }));
  await assert.rejects(db.$executeRawUnsafe('TRUNCATE "EventoXpCompetitivo"'));
  await assert.rejects(
    db.historialInstitucionCompetitiva.updateMany({
      where: { usuarioId: u.id },
      data: { institucionId: null },
    }),
  );
  await assert.rejects(
    db.balanceCompetitivo.updateMany({
      where: { usuarioId: u.id },
      data: { xp: -1 },
    }),
  );
  for (const patch of [
    { gameId: 'MEMORY_MATCH', sourceType: 'MEMORY_ATTEMPT' },
    { deltaAplicado: 1 },
    { temporada: original.temporada - 1 },
    { deltaNominal: 101, deltaAplicado: 101, saldoDespues: 101 },
    {
      tipo: 'CORRECCION',
      liquidacion: randomUUID(),
      eventoCorregidoId: id,
      actorId: randomUUID(),
      motivo: null,
    },
  ])
    await assert.rejects(
      db.eventoXpCompetitivo.create({
        data: {
          ...data,
          id: randomUUID(),
          sourceId: randomUUID(),
          secuencia: 2,
          idempotencyKey: competitiveHash(randomUUID()),
          ...patch,
        },
      }),
    );
});
test('ledger and balance roll back together when the projection update fails', async () => {
  const u = await user();
  const ref = await source(u);
  await db.$executeRawUnsafe(
    `CREATE FUNCTION competitive_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."usuarioId" = '${u.id}'::uuid THEN RAISE EXCEPTION 'injected failure'; END IF; RETURN NEW; END $$`,
  );
  await db.$executeRawUnsafe(
    'CREATE TRIGGER competitive_test_failure BEFORE UPDATE ON "BalanceCompetitivo" FOR EACH ROW EXECUTE FUNCTION competitive_test_failure()',
  );
  try {
    await assert.rejects(service.settle(ref), /injected failure/);
    assert.equal((await events(u)).length, 0);
    assert.equal((await balances(u)).length, 0);
  } finally {
    await db.$executeRawUnsafe(
      'DROP TRIGGER competitive_test_failure ON "BalanceCompetitivo"',
    );
    await db.$executeRawUnsafe('DROP FUNCTION competitive_test_failure()');
  }
  assert.equal((await service.settle(ref)).secuencia, 1);
});
test('public roles cannot read/write competitive tables, RLS remains enabled', async () => {
  for (const role of ['anon', 'authenticated'])
    for (const table of [
      'EventoXpCompetitivo',
      'BalanceCompetitivo',
      'HistorialInstitucionCompetitiva',
    ]) {
      const [row] =
        await db.$queryRaw`SELECT has_table_privilege(${role}, ${'"' + table + '"'}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS allowed`;
      assert.equal(row.allowed, false);
      for (const statement of [
        `SELECT * FROM "${table}"`,
        `INSERT INTO "${table}" DEFAULT VALUES`,
      ]) {
        await assert.rejects(
          db.$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
            await tx.$queryRawUnsafe(statement);
          }),
          (error) => error.meta?.code === '42501',
        );
      }
    }
  const rows =
    await db.$queryRaw`SELECT relrowsecurity FROM pg_class WHERE relname IN ('EventoXpCompetitivo','BalanceCompetitivo','HistorialInstitucionCompetitiva')`;
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.relrowsecurity));
});
