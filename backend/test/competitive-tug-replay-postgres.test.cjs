require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const { PrismaClient } = require('@prisma/client');
const {
  TugSportsReplay,
} = require('../src/competitive/competitive.tug-replay');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const {
  TiraAflojaPresenceService,
} = require('../src/tira-afloja/tira-afloja-presence.service');
const {
  TiraAflojaRealtimePublisher,
} = require('../src/tira-afloja/tira-afloja-realtime.publisher');
const {
  CompetitiveVerifierRegistry,
} = require('../src/competitive/competitive.contracts');
const {
  createCompetitiveVerifiers,
} = require('../src/competitive/competitive.module');
let db, other, engine, restarted, presence, win;
const originalFlag = process.env.COMPETITIVE_TUG_ENABLED;
const replay = new TugSportsReplay();
before(async () => {
  const { validateCompetitiveDatabase } =
    await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(
    process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')),
  );
  const args = {
    datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } },
  };
  db = new PrismaClient(args);
  // Compatibility fixtures represent the published CP14 creator: it did not
  // send temporalVersion. The DB permits that immutable older contract; CP16
  // temporal fixtures separately exercise the new creator without middleware.
  db.$use(async (params, next) => {
    if (params.model === 'PartidaTiraAfloja' && params.action === 'create')
      delete params.args.data.temporalVersion;
    return next(params);
  });
  other = new PrismaClient(args);
  engine = new TiraAflojaService(db, new TiraAflojaRealtimePublisher());
  restarted = new TiraAflojaService(other, new TiraAflojaRealtimePublisher());
  presence = new TiraAflojaPresenceService(db);
  // This runner-owned DB contains previous files' banks. Restrict this file's
  // real matchmaking to its four owned questions, not synthetic terminal DTOs.
  await db.pregunta.updateMany({
    where: { subtema: { tema: { area: 'INGLES' } } },
    data: { estadoContenido: 'BORRADOR' },
  });
  const tema = await db.tema.create({
    data: {
      nombre: 'Replay owned',
      area: 'INGLES',
      estadoContenido: 'PUBLICADO',
    },
  });
  const sub = await db.subtema.create({
    data: {
      nombre: 'Replay owned',
      temaId: tema.id,
      estadoContenido: 'PUBLICADO',
    },
  });
  for (let i = 0; i < 4; i++)
    await db.pregunta.create({
      data: {
        subtemaId: sub.id,
        enunciado: 'Replay ' + i,
        dificultad: 'BASICO',
        estadoContenido: 'PUBLICADO',
        respuestas: {
          create: [true, false].map((esCorrecta) => ({
            texto: String(esCorrecta),
            esCorrecta,
          })),
        },
      },
    });
});
after(async () => {
  if (originalFlag === undefined) delete process.env.COMPETITIVE_TUG_ENABLED;
  else process.env.COMPETITIVE_TUG_ENABLED = originalFlag;
  await engine?.onModuleDestroy();
  await restarted?.onModuleDestroy();
  await Promise.all([db, other].filter(Boolean).map((c) => c.$disconnect()));
});
async function fixture(admitted = true, ready = true) {
  process.env.COMPETITIVE_TUG_ENABLED = String(admitted);
  const users = [];
  for (let i = 0; i < 2; i++)
    users.push(
      await db.usuario.create({
        data: {
          nombre: 'Replay owned',
          correo: randomUUID() + '@example.invalid',
          contrasenaHash: 'none',
          correoVerificado: true,
          rol: 'ESTUDIANTE',
          xpTotal: 777,
        },
      }),
    );
  const id = (await engine.emparejar(users[0].id, 'INGLES')).partida.id;
  assert.equal(
    (await restarted.emparejar(users[1].id, 'INGLES')).partida.id,
    id,
  );
  if (ready) {
    await engine.marcarListo(users[0].id, id);
    await restarted.marcarListo(users[1].id, id);
  }
  return { id, users };
}
const stored = (id) =>
  db.partidaTiraAfloja.findUniqueOrThrow({ where: { id } });
async function waitBoundary(id, column) {
  // PostgreSQL measures and waits for its own persisted deadline; no JS sleeps.
  if (column === 'start')
    await other.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaIniciaEn"-timezone('UTC',clock_timestamp()))))::double precision)::text FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
  else
    await other.$queryRaw`SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaVenceEn"-timezone('UTC',clock_timestamp()))))::double precision)::text FROM "PartidaTiraAfloja" WHERE id=${id}::uuid`;
}
async function play(f, kind = 'win', witness = true) {
  if (!witness)
    engine.visibilityWitness.certify = async () => {
      throw new Error('OWNED_TEST_WITNESS_OUTAGE');
    };
  try {
    for (const u of f.users) await presence.connect(u.id, f.id, randomUUID());
    while ((await stored(f.id)).estado === 'ACTIVA') {
      await waitBoundary(f.id, 'start');
      const m = await stored(f.id),
        q = m.snapshotInicial.questions[m.rondaActual - 1];
      for (let i = 0; i < 2; i++) {
        const payload = {
          ronda: m.rondaActual,
          preguntaId: q.preguntaId,
          respuestaId: q.pregunta.respuestas.find(
            (o) => o.esCorrecta === (kind === 'win' && i === 0),
          ).id,
          idempotencyKey: randomUUID(),
        };
        const svc = i === 0 ? engine : restarted;
        // Disable both witnesses for outage fixtures, preserving real sports writes.
        if (!witness)
          restarted.visibilityWitness.certify =
            engine.visibilityWitness.certify;
        await svc.responder(f.users[i].id, f.id, payload);
        await svc.responder(f.users[i].id, f.id, payload);
      }
    }
  } finally {
    // Remove instance overrides; the real prototype method remains intact.
    delete engine.visibilityWitness.certify;
    delete restarted.visibilityWitness.certify;
  }
}
async function load(f, database = db) {
  return database.$transaction(
    async (tx) => {
      const original = await replay.originalParticipants(tx, f.id);
      for (const u of [...original].sort())
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${u}::uuid FOR UPDATE`;
      return replay.loadLockedPair(tx, f.id);
    },
    { timeout: 20000 },
  );
}
async function noXp(f) {
  assert.throws(
    () =>
      new CompetitiveVerifierRegistry(createCompetitiveVerifiers()).get(
        'TUG_MATCH',
      ),
    /SOURCE_NOT_INTEGRATED/,
  );
  assert.equal(
    await db.eventoXpCompetitivo.count({
      where: { sourceType: 'TUG_MATCH', sourceId: f.id },
    }),
    0,
  );
  for (const u of f.users) {
    assert.equal(
      (await db.usuario.findUniqueOrThrow({ where: { id: u.id } })).xpTotal,
      777,
    );
    assert.equal(
      await db.balanceCompetitivo.count({ where: { usuarioId: u.id } }),
      0,
    );
  }
}
test('TUG replay: real win/loss, R != Q, response retries, restart and concurrent identical hashes; no XP', async () => {
  win = await fixture();
  await play(win);
  process.env.COMPETITIVE_TUG_ENABLED = 'false';
  const [a, b] = await Promise.all([load(win), load(win, other)]);
  assert.deepEqual(a, b);
  assert.equal(a[0].resolution.facts.correct, 2);
  assert.equal(a[1].resolution.facts.correct, 0);
  assert.equal(a[0].resolution.facts.presentedRounds, 2);
  assert.equal((await stored(win.id)).qPartida, 4);
  assert.equal(a[0].resolution.facts.outcome, 'VICTORIA');
  assert.equal(a[1].resolution.facts.outcome, 'DERROTA');
  assert.equal(
    await db.tiraAflojaRespuesta.count({ where: { partidaId: win.id } }),
    4,
  );
  await noXp(win);
});
test('TUG replay: editorial mutation cannot replace snapshot; public contract has no private admission or evidence', async () => {
  const m = await stored(win.id),
    q = m.snapshotInicial.questions[0];
  const before = await load(win);
  await db.respuesta.update({
    where: { id: q.pregunta.respuestas.find((o) => o.esCorrecta).id },
    data: { esCorrecta: false, texto: 'Edited after close' },
  });
  assert.deepEqual(await load(win), before);
  const publicView = JSON.stringify(
    await restarted.obtener(win.users[0].id, win.id),
  );
  for (const key of [
    'snapshotInicial',
    'competitivePolicy',
    'origenXid',
    'evidenceHash',
    'esCorrecta',
  ])
    assert.equal(publicView.includes(key), false);
  // Restore the mutable bank for subsequent real matchmaking, not the snapshot.
  await db.respuesta.update({
    where: { id: q.pregunta.respuestas.find((o) => o.esCorrecta).id },
    data: { esCorrecta: true, texto: 'true' },
  });
});
test('TUG replay: real exhausted-question tie counts accepted incorrect answers without fabricated C', async () => {
  const f = await fixture();
  await play(f, 'tie');
  const terminals = await load(f);
  assert.ok(
    terminals.every(
      (t) =>
        t.resolution.facts.outcome === 'EMPATE' &&
        t.resolution.facts.correct === 0 &&
        t.resolution.facts.presentedRounds === 4,
    ),
  );
  await noXp(f);
});
test('TUG replay: normal R=0 is preserved, not inferred from the sporting tie', async () => {
  const f = await fixture();
  for (let i = 0; i < 4; i++) {
    await waitBoundary(f.id, 'end');
    await engine.obtener(f.users[0].id, f.id);
  }
  const terminals = await load(f);
  assert.ok(
    terminals.every(
      (t) =>
        t.resolution.facts.presentedRounds === 0 &&
        t.resolution.facts.correct === 0 &&
        t.resolution.facts.outcome === 'EMPATE',
    ),
  );
  await noXp(f);
});

test('TUG replay: insertion inside window with late COMMIT cannot create R; later confirmed presentations survive', async () => {
  const f = await fixture();
  await waitBoundary(f.id, 'start');
  const execute = require('node:util').promisify(
    require('node:child_process').execFile,
  );
  const owner = JSON.parse(
    await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8'),
  );
  const name = 'saberplus-competitive-test-' + owner.nonce;
  const labels = await execute('docker', [
    'inspect',
    '--format',
    '{{json .Config.Labels}}',
    name,
  ]);
  assert.equal(
    JSON.parse(labels.stdout)['saberplus-competitive-disposable-v1'],
    owner.nonce,
  );
  const sql = `BEGIN;
    SELECT tug_record_presented_round('${f.id}'::uuid);
    SELECT 'inside:' || count(*) FROM "TiraAflojaRondaPresentada" WHERE "partidaId"='${f.id}'::uuid;
    SELECT pg_sleep(greatest(0,extract(epoch FROM ("rondaVenceEn"-timezone('UTC',clock_timestamp()))))) FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid;
    SELECT 'late:' || (timezone('UTC',clock_timestamp()) >= "rondaVenceEn") FROM "PartidaTiraAfloja" WHERE id='${f.id}'::uuid;
    COMMIT;`;
  await assert.rejects(
    execute(
      'docker',
      [
        'exec',
        name,
        'psql',
        '-X',
        '-U',
        new URL(owner.url).username,
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
        '-v',
        'VERBOSITY=verbose',
        '-Atc',
        sql,
      ],
      { windowsHide: true },
    ),
    (error) => {
      assert.match(error.stdout, /inside:2/);
      assert.match(error.stdout, /late:true/);
      assert.match(error.stderr, /23514/);
      assert.match(error.stderr, /commit exceeds its deadline/);
      return true;
    },
  );
  assert.equal(
    await db.tiraAflojaRondaPresentada.count({ where: { partidaId: f.id } }),
    0,
  );
  await engine.obtener(f.users[0].id, f.id);
  await play(f);
  const terminals = await load(f);
  assert.equal((await stored(f.id)).rondaActual, 3);
  assert.ok(terminals.every((t) => t.resolution.facts.presentedRounds === 2));
  await noXp(f);
});
test('TUG replay: witness outage blocks the whole real terminal pair, without late backfill or changing sports', async () => {
  const f = await fixture();
  await play(f, 'win', false);
  assert.equal((await stored(f.id)).resultado, 'JUGADOR_A');
  await assert.rejects(load(f), /CERTIFICATE_MISSING_OR_ORPHAN/);
  assert.equal(
    await db.tugRoundVisibility.count({ where: { partidaId: f.id } }),
    0,
  );
  await noXp(f);
});
test('TUG replay: historical and explicitly non-admitted sources fail closed', async () => {
  const f = await fixture(false, false);
  await assert.rejects(load(f), /NOT_ADMITTED/);
  await engine.abandonar(f.users[0].id, f.id);
  const old = await db.partidaTiraAfloja.create({
    data: {
      jugadorAId: f.users[0].id,
      jugadorBId: f.users[1].id,
      expiraEn: new Date(Date.now() + 60000),
    },
  });
  await assert.rejects(load({ ...f, id: old.id }), /NOT_ADMITTED/);
  await noXp(f);
});
test('TUG replay: explicit pre-ACTIVA remains a sports closure, blocked by the phase/neutral contract', async () => {
  const f = await fixture(true, false);
  await engine.abandonar(f.users[0].id, f.id);
  await assert.rejects(load(f), /VERSIONS|ABANDONMENT_CONTRACT_UNSUPPORTED/);
  await noXp(f);
});
test('TUG replay: privileged corruption of either participant evidence rejects both; rollback restores valid replay', async () => {
  const original = await load(win);
  const sentinel = new Error('OWNED_TEST_ROLLBACK');
  await assert.rejects(
    db.$transaction(async (tx) => {
      // Only this disposable DB, only inside a rolled-back transaction. This
      // intentionally bypasses storage guards to exercise the independent reader.
      await tx.$executeRawUnsafe(
        'ALTER TABLE "TiraAflojaRespuesta" DISABLE TRIGGER USER',
      );
      await tx.$executeRaw`UPDATE "TiraAflojaRespuesta" SET "esCorrecta"=true WHERE "partidaId"=${win.id}::uuid AND "usuarioId"=${win.users[1].id}::uuid`;
      await assert.rejects(replay.loadLockedPair(tx, win.id), /ANSWER_INVALID/);
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.deepEqual(await load(win), original);
  await noXp(win);
});

test('TUG replay: contradictory persisted sporting winner is independently rejected', async () => {
  const sentinel = new Error('OWNED_RESULT_ROLLBACK');
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "PartidaTiraAfloja" DISABLE TRIGGER USER',
      );
      await tx.$executeRaw`UPDATE "PartidaTiraAfloja" SET resultado='JUGADOR_B',"ganadorId"=${win.users[1].id}::uuid WHERE id=${win.id}::uuid`;
      await assert.rejects(
        replay.loadLockedPair(tx, win.id),
        /TERMINAL_CONFLICT/,
      );
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.equal((await stored(win.id)).resultado, 'JUGADOR_A');
  await noXp(win);
});

test('TUG replay: canonical evidence hash retains event microseconds that Prisma Date loses', async () => {
  const original = await load(win),
    sentinel = new Error('OWNED_HASH_ROLLBACK');
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "TiraAflojaEvento" DISABLE TRIGGER USER',
      );
      await tx.$executeRaw`UPDATE "TiraAflojaEvento" SET fecha=fecha+interval '1 microsecond' WHERE "partidaId"=${win.id}::uuid AND version=0`;
      const changed = await replay.loadLockedPair(tx, win.id);
      assert.notEqual(changed[0].evidenceHash, original[0].evidenceHash);
      assert.equal(changed[0].evidenceHash, changed[1].evidenceHash);
      throw sentinel;
    }),
    (e) => e === sentinel,
  );
  assert.deepEqual(await load(win), original);
});

async function controlledGrace(f, both) {
  const [clock] = await db.$queryRaw`SELECT tug_presence_now()::text AS at`;
  assert.match(clock.at, /^[0-9: .-]+$/);
  // Owned PostgreSQL clock, frozen at an actual observed instant. The second
  // milestone comes from the real persisted grace, not a client date.
  try {
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT '${clock.at}'::timestamp $$`,
    );
    const sockets = [randomUUID(), randomUUID()];
    for (let i = 0; i < 2; i++)
      await presence.connect(f.users[i].id, f.id, sockets[i]);
    if (!both) await presence.observe(f.id, sockets[1], 'UNCERTAIN');
    await presence.observe(f.id, sockets[0], 'DISCONNECT');
    if (both) await presence.observe(f.id, sockets[1], 'DISCONNECT');
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT min("graceUntil") FROM "TugPresence" WHERE "matchId"='${f.id}'::uuid $$`,
    );
    await engine.obtener(f.users[0].id, f.id);
  } finally {
    await db.$executeRawUnsafe(
      `CREATE OR REPLACE FUNCTION tug_presence_now() RETURNS timestamp LANGUAGE sql VOLATILE AS $$ SELECT timezone('UTC',clock_timestamp()) $$`,
    );
  }
}
test('TUG replay: confirmed grace with rival UNKNOWN preserves sports winner but blocks unsupported abandonment terminals', async () => {
  const f = await fixture();
  await controlledGrace(f, false);
  assert.equal((await stored(f.id)).ganadorId, f.users[1].id);
  assert.equal(await db.tugAbandonment.count({ where: { matchId: f.id } }), 1);
  await assert.rejects(load(f), /ABANDONMENT_CONTRACT_UNSUPPORTED/);
  await noXp(f);
});
test('TUG replay: exactly simultaneous confirmed graces remain CANCELADA, not EMPATE or two invented penalties', async () => {
  const f = await fixture();
  await controlledGrace(f, true);
  const m = await stored(f.id);
  assert.equal(m.estado, 'CANCELADA');
  assert.equal(m.resultado, 'CANCELADA');
  assert.equal(m.ganadorId, null);
  assert.equal(await db.tugAbandonment.count({ where: { matchId: f.id } }), 2);
  await assert.rejects(load(f), /ABANDONMENT_CONTRACT_UNSUPPORTED/);
  await noXp(f);
});
