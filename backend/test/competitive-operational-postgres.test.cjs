// Owned disposable database only. Local policies are rolled back, never deployed.
require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { CompetitiveService } = require('../src/competitive/competitive.service');
const { CompetitiveVerifierRegistry } = require('../src/competitive/competitive.contracts');
const { createSoloVerifiers } = require('../src/competitive/competitive.solo');
const { SummitService } = require('../src/summit/summit.service');
const { HealthController } = require('../src/health/health.controller');
const { CompetitiveTugPairProtocol } = require('../src/competitive/competitive.tug-pair-protocol');
const { TugCompetitiveReconciler } = require('../src/competitive/competitive.tug-reconciler');
const { CompetitiveError } = require('../src/competitive/competitive.rules');
const { TiraAflojaService } = require('../src/tira-afloja/tira-afloja.service');
const { TiraAflojaRealtimePublisher } = require('../src/tira-afloja/tira-afloja-realtime.publisher');
let db, protectedTables;
const q = value => '"' + value.replaceAll('"', '""') + '"';
const core = ['EventoXpCompetitivo','BalanceCompetitivo','HistorialInstitucionCompetitiva',
  'TugCompetitiveSettlement','TugRoundVisibility','TiraAflojaRondaPresentada',
  'TugPresenceEvent','TugConnection','TriviaPresenceEvent','TriviaConnection','IntentoTriviaRush'];
before(async () => {
  const { validateCompetitiveDatabase } = await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(process.env.COMPETITIVE_TEST_URL,
    JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER, 'utf8')));
  db = new PrismaClient({ datasources: { db: { url: process.env.COMPETITIVE_TEST_URL } } });
  protectedTables = await db.$queryRaw`SELECT c.relname AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity ORDER BY c.relname`;
});
after(async () => { await db?.$disconnect(); });

function sqlState(code) { return error => error.code === 'P2010' && error.meta?.code === code; }
async function rolledBack(fn) {
  const sentinel = new Error('owned operational probe rollback');
  await assert.rejects(db.$transaction(async tx => { await fn(tx); throw sentinel; },
    { timeout: 20000 }), error => error === sentinel);
}

test('B1: disposable WAL settings and RLS/critical function inventory remain strict', async () => {
  const [settings] = await db.$queryRaw`SELECT current_setting('fsync') AS fsync,
    current_setting('synchronous_commit') AS synchronous_commit,
    current_setting('full_page_writes') AS full_page_writes,
    current_setting('wal_level') AS wal_level`;
  assert.equal(settings.fsync, 'on');
  assert.equal(settings.synchronous_commit, 'on');
  assert.equal(settings.full_page_writes, 'on');
  assert.ok(['replica','logical'].includes(settings.wal_level));
  for (const name of core) assert.ok(protectedTables.some(t => t.name === name), name);
  const functions = await db.$queryRaw`SELECT p.proname AS name,p.prosecdef AS definer
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'competitive_%' OR
      p.proname LIKE 'tug_%' OR p.proname LIKE 'trivia_presence_%')`;
  assert.ok(functions.length > 10);
  assert.ok(functions.every(f => !f.definer), 'no hidden SECURITY DEFINER in competitive functions');
});

for (const role of ['anon','authenticated']) test(`B1: ${role} cannot directly read protected competitive or private evidence tables`, async () => {
  for (const table of protectedTables) {
    const [privilege] = await db.$queryRaw`SELECT has_table_privilege(${role},
      ${'public.'+q(table.name)}, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') AS granted`;
    assert.equal(privilege.granted,false,table.name+' has unexpected client DML grant');
    await assert.rejects(db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE ${q(role)}`);
      await tx.$queryRawUnsafe(`SELECT count(*)::int FROM ${q(table.name)}`);
    }), sqlState('42501'), table.name);
  }
  await assert.rejects(db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${q(role)}`);
    await tx.$queryRaw`SELECT competitive_timestamp_us(1::bigint)::text`;
  }), sqlState('42501'));
});

test('B1: private NOSUPERUSER/NOBYPASSRLS role needs policy as well as grants, then real settlement is coherent before owned rollback', async () => {
  const oldFlag = process.env.COMPETITIVE_SOLO_ENABLED;
  process.env.COMPETITIVE_SOLO_ENABLED = 'true';
  let ref;
  try {
    const topic = await db.tema.create({ data: { nombre: 'Owned security probe', area: 'MATEMATICAS', estadoContenido: 'PUBLICADO' } });
    const sub = await db.subtema.create({ data: { nombre: 'Owned', temaId: topic.id, estadoContenido: 'PUBLICADO' } });
    for (let i=0; i<12; i++) {
      const id = randomUUID();
      await db.pregunta.create({ data: { id, subtemaId: sub.id, enunciado: `Owned ${i}`,
        dificultad: 'BASICO', estadoContenido: 'PUBLICADO', respuestas: { create: [
          { id:id+'-yes',texto:'Yes',esCorrecta:true }, { id:id+'-no',texto:'No',esCorrecta:false }] } } });
    }
    const u = await db.usuario.create({ data: { nombre:'Owned',correo:randomUUID()+'@example.invalid',
      contrasenaHash:'none',rol:'ESTUDIANTE',correoVerificado:true,xpTotal:123 } });
    const sports = new SummitService(db);
    let state = await sports.start(u.id, { area:'MATEMATICAS', dificultad:'BASICO',subtemaId:sub.id,competitive:true });
    for (let i=0;i<5;i++) state = await sports.answer(u.id,state.id,{
      preguntaId:state.pregunta.id,respuestaId:state.pregunta.id+'-yes',idempotencyKey:randomUUID() });
    ref = {sourceType:'SUMMIT_ATTEMPT',sourceId:state.id,participantId:u.id};
    await rolledBack(async tx => {
      await tx.$executeRawUnsafe('CREATE ROLE sp_backend_probe NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT');
      await tx.$executeRawUnsafe('GRANT USAGE ON SCHEMA public TO sp_backend_probe');
      await tx.$executeRawUnsafe('GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO sp_backend_probe');
      await tx.$executeRawUnsafe('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO sp_backend_probe');
      await tx.$executeRawUnsafe('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sp_backend_probe');
      await tx.$executeRawUnsafe('SET LOCAL ROLE sp_backend_probe');
      const [identity] = await tx.$queryRaw`SELECT current_user AS name,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole
        FROM pg_roles WHERE rolname=current_user`;
      assert.equal(identity.name,'sp_backend_probe');
      assert.ok(!identity.rolsuper && !identity.rolbypassrls && !identity.rolcreatedb && !identity.rolcreaterole);
      const [hidden] = await tx.$queryRaw`SELECT count(*)::int AS n FROM "EventoXpCompetitivo"`;
      assert.equal(hidden.n,0, 'grants alone must not bypass RLS');
      assert.equal((await new HealthController(tx).ready()).database,'UP',
        'connectivity readiness does not certify competitive permissions');
      await tx.$executeRawUnsafe('RESET ROLE');
      for (const table of protectedTables) await tx.$executeRawUnsafe(
        `CREATE POLICY sp_backend_probe_policy ON ${q(table.name)} TO sp_backend_probe USING (true) WITH CHECK (true)`);
      await tx.$executeRawUnsafe('SET LOCAL ROLE sp_backend_probe');
      const restricted = { $transaction: callback => callback(tx) };
      const service = new CompetitiveService(restricted,new CompetitiveVerifierRegistry(createSoloVerifiers()));
      const event = await service.settle(ref);
      assert.equal(event.deltaAplicado,100);
      assert.equal((await service.settle(ref)).id,event.id);
      const balance = await tx.balanceCompetitivo.findFirstOrThrow({ where:{usuarioId:u.id,gameId:'SUMMIT'} });
      assert.equal(balance.xp,100);assert.equal(balance.version,1);
      assert.equal((await tx.usuario.findUniqueOrThrow({where:{id:u.id}})).xpTotal,123);
      await tx.$executeRawUnsafe('RESET ROLE');
    });
    assert.equal(await db.eventoXpCompetitivo.count({where:{sourceId:ref.sourceId}}),0,'all privileged probe changes rolled back');
    const [roles] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_roles WHERE rolname='sp_backend_probe'`;
    assert.equal(roles.n,0);
  } finally { if (oldFlag===undefined) delete process.env.COMPETITIVE_SOLO_ENABLED; else process.env.COMPETITIVE_SOLO_ENABLED=oldFlag; }
});

test('B2: a one-connection pool fails boundedly under contention, recovers and closes its backend', async () => {
  const url = new URL(process.env.COMPETITIVE_TEST_URL);
  url.searchParams.set('connection_limit','1');url.searchParams.set('pool_timeout','1');
  const tiny = new PrismaClient({ datasources:{db:{url:url.href}} });
  let release, held, pid;
  try {
    let signal;
    const ready = new Promise(resolve=>{signal=resolve;});
    const gate = new Promise(resolve=>{release=resolve;});
    held = tiny.$transaction(async tx => {
      const [identity] = await tx.$queryRaw`SELECT pg_backend_pid() AS pid`;pid=identity.pid;signal();await gate;
    }, {timeout:10000});
    await Promise.race([ready,held.then(()=>{throw new Error('pool hold exited early');})]);
    await assert.rejects(tiny.$queryRaw`SELECT 1 AS n`,error=>error.code==='P2024');
    release();await held;held=undefined;
    const [r] = await tiny.$queryRaw`SELECT 1::int AS n`;assert.equal(r.n,1);
  } finally { release?.();if(held)await held;await tiny.$disconnect(); }
  const [remaining] = await db.$queryRaw`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=${pid}::int`;
  assert.equal(remaining.n,0);
});

test('B2: more than one batch advances while missing evidence is deferred, without neutral ledger events', async () => {
  const oldFlag=process.env.COMPETITIVE_TUG_ENABLED;process.env.COMPETITIVE_TUG_ENABLED='true';
  const engine=new TiraAflojaService(db,new TiraAflojaRealtimePublisher());
  try {
    const ids=[];
    for(let i=0;i<30;i++) {
      const u=await db.usuario.create({data:{nombre:'Owned queue',correo:randomUUID()+'@example.invalid',
        contrasenaHash:'none',rol:'ESTUDIANTE',correoVerificado:true}});
      const id=(await engine.emparejar(u.id,'INGLES')).partida.id;
      await engine.abandonar(u.id,id);ids.push(id);
    }
    const deferred=new Set(ids.slice(0,5)), calls=[];
    const real=new CompetitiveTugPairProtocol(db);
    const failures={settlePrecisePair:async id=>{
      calls.push(id);
      if(deferred.has(id))throw new CompetitiveError('TUG_REPLAY_CERTIFICATE_MISSING_OR_ORPHAN');
      return real.settlePrecisePair(id);
    }};
    const worker=new TugCompetitiveReconciler(db,failures);
    for(let i=0;i<3;i++)await worker.reconcile();
    const rows=await db.tugCompetitiveSettlement.findMany({where:{sourceId:{in:ids}}});
    assert.equal(rows.length,30);
    for(const r of rows) {
      assert.equal(r.state,deferred.has(r.sourceId)?'PENDING':'RESOLVED');
      assert.equal(r.attempts,deferred.has(r.sourceId)?1:0);
    }
    assert.ok(ids.every(id=>calls.filter(v=>v===id).length===1));
    await worker.reconcile();
    assert.ok(ids.every(id=>calls.filter(v=>v===id).length===1),'no aggressive repeat nor final-state repaying');
    assert.equal(await db.eventoXpCompetitivo.count({where:{sourceType:'TUG_MATCH',sourceId:{in:ids}}}),0);
    await worker.onModuleDestroy();
  } finally { await engine.onModuleDestroy();if(oldFlag===undefined)delete process.env.COMPETITIVE_TUG_ENABLED;else process.env.COMPETITIVE_TUG_ENABLED=oldFlag; }
});
