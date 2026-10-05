require('ts-node/register/transpile-only');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { randomUUID } = require('node:crypto');
const { PrismaClient, Prisma } = require('@prisma/client');
const { Test } = require('@nestjs/testing');
const { JwtModule, JwtService } = require('@nestjs/jwt');
const { ValidationPipe } = require('@nestjs/common');
const { PrismaService } = require('../src/prisma/prisma.service');
const { RankingModule } = require('../src/ranking/ranking.module');
const { CompetitiveRankingReader, competitiveRankingStatement } = require('../src/ranking/competitive-ranking.reader');
const { projectCompetitiveRanking } = require('../src/ranking/competitive-ranking.contract');
const { CompetitiveService, competitiveHash } = require('../src/competitive/competitive.service');
const { CompetitiveVerifierRegistry } = require('../src/competitive/competitive.contracts');
let db, reader, app, jwt, baseUrl, nextSeason=3100;
const clients=[];
const query=(temporada,juego='TRIVIA_RUSH')=>({juego,temporada});
const date=new Date('2026-09-01T12:00:00.000Z');
const later=new Date('2026-09-02T12:00:00.000Z');
before(async()=>{
  const {validateCompetitiveDatabase}=await import('../tool/test_competitive_postgres.mjs');
  validateCompetitiveDatabase(process.env.COMPETITIVE_TEST_URL,JSON.parse(await readFile(process.env.COMPETITIVE_TEST_OWNER,'utf8')));
  db=new PrismaClient({datasources:{db:{url:process.env.COMPETITIVE_TEST_URL}}});
  reader=new CompetitiveRankingReader(db);
  const module=await Test.createTestingModule({imports:[JwtModule.register({global:true,secret:'owned-ranking-http-only',verifyOptions:{algorithms:['HS256']}}),RankingModule]})
    .overrideProvider(PrismaService).useValue(db).compile();
  assert.equal(module.get(PrismaService),db);
  app=module.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,transformOptions:{enableImplicitConversion:true}}));
  await app.listen(0,'127.0.0.1');
  baseUrl=await app.getUrl();jwt=module.get(JwtService);
});
after(async()=>{await app?.close();await Promise.all(clients.map(c=>c.$disconnect()));await db?.$disconnect();});
function client(){const c=new PrismaClient({datasources:{db:{url:process.env.COMPETITIVE_TEST_URL}}});clients.push(c);return c;}
async function user(rol='ESTUDIANTE',id=randomUUID()){
  return db.usuario.create({data:{id,rol,nombre:'PRIVATE_RANKING_NAME',correo:`${id}@example.invalid`,contrasenaHash:'PRIVATE_HASH',xpTotal:999,institucionId:null,correoVerificado:true}});
}
async function httpBoard(q,id,expected=200){
  const response=await fetch(`${baseUrl}/ranking/competitivo?juego=${q.juego}&temporada=${q.temporada}`,{headers:{Authorization:`Bearer ${jwt.sign({sub:id},{expiresIn:'1h'})}`}});
  assert.equal(response.status,expected);return response.json();
}
async function seed(season,xps,role='ESTUDIANTE'){
  const rows=[];
  for(let i=0;i<xps.length;i++){
    const u=await user(role);
    const b=await db.balanceCompetitivo.create({data:{usuarioId:u.id,gameId:'TRIVIA_RUSH',temporada:season,xp:xps[i],alcanzadoEn:xps[i]>0?date:null,updatedAt:later,version:1}});
    rows.push({...b,rol:role});
  }return rows;
}
async function counts(){return {ledger:await db.eventoXpCompetitivo.count(),balances:await db.balanceCompetitivo.count()};}

test('ranking PostgreSQL: complete 60-person population equals pure contract for positions 1/50/51, absent and zero',async()=>{
  const season=nextSeason++, rows=await seed(season,Array.from({length:60},(_,i)=>1000-i));
  rows.push(...await seed(season,[0]));
  const before=await counts();
  for(const index of [0,49,50,60]){
    const actual=await reader.read(query(season),rows[index].usuarioId.toUpperCase());
    assert.deepEqual(actual,projectCompetitiveRanking(query(season),rows,rows[index].usuarioId));
    assert.equal(actual.ranking.length,50);assert.equal(actual.totalParticipantes,60);
  }
  assert.equal((await reader.read(query(season),randomUUID())).miPosicion,null);
  assert.deepEqual(await counts(),before);
});

test('ranking PostgreSQL: exact date and UUID tie order, no shared places',async()=>{
  const season=nextSeason++, rows=await seed(season,[100,100,100]);
  await db.balanceCompetitivo.update({where:{usuarioId_gameId_temporada:{usuarioId:rows[2].usuarioId,gameId:'TRIVIA_RUSH',temporada:season}},data:{alcanzadoEn:new Date(date.getTime()-1)}});
  rows[2].alcanzadoEn=new Date(date.getTime()-1);
  assert.deepEqual(await reader.read(query(season),rows[0].usuarioId),projectCompetitiveRanking(query(season),rows,rows[0].usuarioId));
});

test('ranking PostgreSQL: game/year isolation, no institution, current professor/admin excluded',async()=>{
  const season=nextSeason++, [student]=await seed(season,[100]);
  await seed(season,[1000],'PROFESOR');await seed(season,[1000],'ADMIN');
  await db.balanceCompetitivo.createMany({data:[{usuarioId:student.usuarioId,gameId:'GHOST_DUEL',temporada:season,xp:999,alcanzadoEn:date,updatedAt:later},{usuarioId:student.usuarioId,gameId:'TRIVIA_RUSH',temporada:season+100,xp:888,alcanzadoEn:date,updatedAt:later}]});
  const board=await reader.read(query(season),student.usuarioId);
  assert.equal(board.totalParticipantes,1);assert.equal(board.miPosicion.xp,100);
  assert.equal((await reader.read(query(season,'GHOST_DUEL'),student.usuarioId)).miPosicion.xp,999);
  assert.equal((await reader.read(query(season+100),student.usuarioId)).miPosicion.xp,888);
});

test('ranking PostgreSQL: empty integrated game differs from unavailable enum; flags OFF do not hide balances',async()=>{
  const season=nextSeason++, [student]=await seed(season,[100]);
  // Save/restore only this test process; no server/production activation.
  const old=process.env.COMPETITIVE_TRIVIA_ENABLED;
  try{process.env.COMPETITIVE_TRIVIA_ENABLED='false';assert.equal((await reader.read(query(season),student.usuarioId)).estado,'CON_PARTICIPANTES');}
  finally{if(old===undefined)delete process.env.COMPETITIVE_TRIVIA_ENABLED;else process.env.COMPETITIVE_TRIVIA_ENABLED=old;}
  assert.equal((await reader.read(query(season,'SUMMIT'),student.usuarioId)).estado,'SIN_PARTICIPANTES');
  for(const game of ['MEMORY_MATCH','BATTLES']){
    const board=await reader.read(query(season,game),student.usuarioId);
    assert.equal(board.estado,'NO_DISPONIBLE');assert.equal(board.totalParticipantes,null);
  }
});

test('ranking PostgreSQL: public fields never expose database identity, institution, evidence or dates',async()=>{
  const season=nextSeason++, rows=await seed(season,[200,100]);
  const board=await reader.read(query(season),rows[1].usuarioId);
  for(const entry of [...board.ranking,board.miPosicion])assert.deepEqual(Object.keys(entry).sort(),['alias','esUsuarioActual','posicion','xp']);
  const text=JSON.stringify(board);
  assert.doesNotMatch(text,/PRIVATE_|usuarioId|correo|contrasena|alcanzadoEn|updatedAt|institucion/);
  for(const row of rows)assert.ok(!text.includes(row.usuarioId));
});

test('ranking PostgreSQL: temporal anomalies beyond TOP block the entire selection, owned rollback restores evidence',async()=>{
  const season=nextSeason++, rows=await seed(season,Array.from({length:51},(_,i)=>100-i));
  const target=rows[50].usuarioId;
  for(const invalid of [Prisma.sql`NULL`,Prisma.sql`'infinity'::timestamptz`,Prisma.sql`"updatedAt"+interval '1 millisecond'`]){
    const sentinel=new Error('owned negative fixture rollback');
    await assert.rejects(db.$transaction(async tx=>{
      await tx.$executeRaw(Prisma.sql`UPDATE "BalanceCompetitivo" SET "alcanzadoEn"=${invalid} WHERE "usuarioId"=${target}::uuid AND temporada=${season} AND "gameId"='TRIVIA_RUSH'`);
      await assert.rejects(new CompetitiveRankingReader(tx).read(query(season),rows[0].usuarioId),e=>e.code==='POSITIVE_BALANCE_INVALID_REACHED_AT');
      throw sentinel;
    }),e=>e===sentinel);
    assert.deepEqual(await reader.read(query(season),rows[0].usuarioId),projectCompetitiveRanking(query(season),rows,rows[0].usuarioId));
  }
});

test('ranking PostgreSQL: SELECT remains usable in a READ ONLY transaction and never posts XP',async()=>{
  const season=nextSeason++, [row]=await seed(season,[100]);const before=await counts();
  await db.$transaction(async tx=>{await tx.$executeRaw`SET TRANSACTION READ ONLY`;assert.equal((await new CompetitiveRankingReader(tx).read(query(season),row.usuarioId)).totalParticipantes,1);});
  assert.deepEqual(await counts(),before);
});

test('ranking PostgreSQL: real PR-I1 administrative correction changes ranking; reader adds no payment',async()=>{
  await db.$executeRaw`CREATE TABLE "RankingReaderTestSource" (id uuid PRIMARY KEY,evidence jsonb NOT NULL)`;
  const registry=new CompetitiveVerifierRegistry([{sourceType:'TRIVIA_ATTEMPT',async loadTerminal(tx,source){const [row]=await tx.$queryRaw`SELECT evidence FROM "RankingReaderTestSource" WHERE id=${source.sourceId}::uuid`;return {...row.evidence,startedAt:new Date(row.evidence.startedAt),terminalAt:new Date(row.evidence.terminalAt)};}}]);
  const service=new CompetitiveService(db,registry), a=await user(), b=await user(), admin=await user('ADMIN');
  async function settle(u){
    const [clock]=await db.$queryRaw`SELECT clock_timestamp()::timestamptz(3) AS now`;
    const source={sourceId:randomUUID(),sourceType:'TRIVIA_ATTEMPT',participantId:u.id};
    const evidence={source,gameId:'TRIVIA_RUSH',startedAt:clock.now,terminalAt:clock.now,competitiveOnline:true,validParticipant:true,evidenceHash:competitiveHash(['owned ranking test',source.sourceId]),resolution:{kind:'RESULTADO',facts:{gameId:'TRIVIA_RUSH',correct:10,questions:10,maxCombo:10}}};
    await db.$executeRaw`INSERT INTO "RankingReaderTestSource" VALUES (${source.sourceId}::uuid,${JSON.stringify(evidence)}::jsonb)`;
    return service.settle(source);
  }
  const original=await settle(a), other=await settle(b);
  await service.correct({operationId:randomUUID(),originalEventId:other.id,actorId:admin.id,reason:'Owned deterministic pre-correction ordering',nominalDelta:-1,kind:'CORRECCION'});
  assert.equal((await reader.read(query(original.temporada),a.id)).miPosicion.posicion,1);
  await service.correct({operationId:randomUUID(),originalEventId:original.id,actorId:admin.id,reason:'Owned ranking reader test correction',nominalDelta:-20,kind:'CORRECCION'});
  const before=await counts(), board=await reader.read(query(original.temporada),a.id);
  assert.equal(board.miPosicion.xp,80);assert.equal(board.miPosicion.posicion,2);
  assert.equal(board.ranking[0].xp,99);assert.deepEqual(await counts(),before);
  assert.deepEqual(await httpBoard(query(original.temporada),a.id),board);
  assert.deepEqual(await counts(),before);
});

test('ranking HTTP PostgreSQL: actual module, JWT/current roles, TOP/own position, legacy and no writes',async()=>{
  const season=nextSeason++, rows=await seed(season,Array.from({length:60},(_,i)=>1000-i)), own=rows[50].usuarioId;
  const before=await counts(), board=await httpBoard(query(season),own);
  assert.deepEqual(board,await reader.read(query(season),own));assert.equal(board.miPosicion.posicion,51);
  assert.doesNotMatch(JSON.stringify(board),/PRIVATE_|usuarioId|@example.invalid/);for(const row of rows)assert.ok(!JSON.stringify(board).includes(row.usuarioId));
  const signed=jwt.sign({sub:own,rol:'ESTUDIANTE'},{expiresIn:'1h'});
  assert.equal((await fetch(`${baseUrl}/ranking/competitivo?juego=TRIVIA_RUSH&temporada=${season}`)).status,401);
  for(const n of ['PROFESOR','ADMIN']){
    await db.usuario.update({where:{id:own},data:{rol:n}});
    assert.equal((await fetch(`${baseUrl}/ranking/competitivo?juego=TRIVIA_RUSH&temporada=${season}`,{headers:{Authorization:`Bearer ${signed}`}})).status,403);
  }
  await db.usuario.update({where:{id:own},data:{rol:'ESTUDIANTE'}});
  const legacy=await fetch(`${baseUrl}/ranking?alcance=GLOBAL&periodo=TOTAL&limite=50`,{headers:{Authorization:`Bearer ${signed}`}});
  assert.equal(legacy.status,200);assert.equal((await legacy.json()).periodo,'TOTAL');
  assert.equal((await httpBoard(query(season,'MEMORY_MATCH'),own)).estado,'NO_DISPONIBLE');
  assert.equal((await httpBoard(query(season,'SUMMIT'),own)).estado,'SIN_PARTICIPANTES');
  assert.deepEqual(await counts(),before);
});

test('ranking HTTP PostgreSQL: committed owned temporal anomaly gives safe 500, missing table safe 503; both restored',async()=>{
  const season=nextSeason++, [row]=await seed(season,[100]);const before=await counts();
  try{
    await db.$executeRaw`UPDATE "BalanceCompetitivo" SET "alcanzadoEn"=NULL WHERE "usuarioId"=${row.usuarioId}::uuid AND "gameId"='TRIVIA_RUSH' AND temporada=${season}`;
    const body=await httpBoard(query(season),row.usuarioId,500);
    assert.equal(body.code,'COMPETITIVE_RANKING_UNAVAILABLE');assert.ok(!JSON.stringify(body).includes(row.usuarioId));
    assert.doesNotMatch(JSON.stringify(body),/REACHED_AT|Prisma|SQL|PRIVATE_/);
  }finally{
    await db.$executeRaw`UPDATE "BalanceCompetitivo" SET "alcanzadoEn"=${row.alcanzadoEn} WHERE "usuarioId"=${row.usuarioId}::uuid AND "gameId"='TRIVIA_RUSH' AND temporada=${season}`;
  }
  try{
    await db.$executeRaw`ALTER TABLE "BalanceCompetitivo" RENAME TO "OwnedRankingHttpMissingTable"`;
    const body=await httpBoard(query(season),row.usuarioId,503);
    assert.equal(body.code,'COMPETITIVE_RANKING_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(body),/BalanceCompetitivo|42P01|Prisma|postgresql|PRIVATE_/);
  }finally{await db.$executeRaw`ALTER TABLE "OwnedRankingHttpMissingTable" RENAME TO "BalanceCompetitivo"`;}
  assert.equal((await httpBoard(query(season),row.usuarioId)).estado,'CON_PARTICIPANTES');assert.deepEqual(await counts(),before);
});

test('ranking PostgreSQL: one snapshot stays coherent across a writer COMMIT while the SELECT waits on a real lock',async()=>{
  const season=nextSeason++, rows=await seed(season,[300,200,100]), blocker=client(), observer=client(), reading=client();
  const key=73419021;
  await blocker.$queryRaw`SELECT pg_advisory_lock(${key}::bigint)::text`;
  let pending;
  try{
    const wrapped={$queryRaw:sql=>reading.$queryRaw(Prisma.sql`WITH gate AS MATERIALIZED (SELECT pg_advisory_xact_lock(${key}::bigint)::text) SELECT board.* FROM gate CROSS JOIN LATERAL (${sql}) board`)};
    pending=new CompetitiveRankingReader(wrapped).read(query(season),rows[2].usuarioId);
    const deadline=performance.now()+3000;let blocked=false;
    while(performance.now()<deadline){const [state]=await observer.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=${key}::oid AND NOT granted) AS waiting`;if(state.waiting){blocked=true;break;}await new Promise(r=>setTimeout(r,10));}
    assert.equal(blocked,true,'must observe actual waiting SELECT before committing writer');
    await db.$transaction(async tx=>{
      await tx.balanceCompetitivo.update({where:{usuarioId_gameId_temporada:{usuarioId:rows[2].usuarioId,gameId:'TRIVIA_RUSH',temporada:season}},data:{xp:400}});
      await tx.balanceCompetitivo.update({where:{usuarioId_gameId_temporada:{usuarioId:rows[0].usuarioId,gameId:'TRIVIA_RUSH',temporada:season}},data:{xp:0}});
    });
  }finally{await blocker.$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;}
  const old=await pending;
  assert.deepEqual(old,projectCompetitiveRanking(query(season),rows,rows[2].usuarioId));
  const fresh=await reader.read(query(season),rows[2].usuarioId);
  assert.equal(old.totalParticipantes,3);assert.equal(old.miPosicion.posicion,3);
  assert.equal(fresh.totalParticipantes,2);assert.equal(fresh.miPosicion.posicion,1);assert.equal(fresh.ranking[0].xp,400);
});

test('ranking PostgreSQL: EXPLAIN ANALYZE on 10000 eligible + 10000 other-season fixtures, no speculative index',async()=>{
  const season=nextSeason++, label=`ranking-performance-${randomUUID()}`;
  await db.$executeRaw`INSERT INTO "Usuario" (id,nombre,correo,"contrasenaHash",rol,"xpTotal") SELECT uuid_generate_v4(),${label},${label}||'-'||n||'@example.invalid','fixture','ESTUDIANTE',0 FROM generate_series(1,20000) n`;
  await db.$executeRaw`INSERT INTO "BalanceCompetitivo" ("usuarioId","gameId",temporada,xp,"alcanzadoEn","updatedAt",version) SELECT id,'TRIVIA_RUSH',CASE WHEN n<=10000 THEN ${season} ELSE ${season+100} END,1+(n%1000)::int,'2026-09-01 12:00:00Z','2026-09-02 12:00:00Z',1 FROM (SELECT id,row_number() OVER(ORDER BY id) n FROM "Usuario" WHERE nombre=${label}) users`;
  const [own]=await db.$queryRaw`SELECT id FROM "Usuario" WHERE nombre=${label} ORDER BY id LIMIT 1`;
  await db.$executeRaw`ANALYZE "BalanceCompetitivo"`;await db.$executeRaw`ANALYZE "Usuario"`;
  const plan=await db.$queryRaw(Prisma.sql`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) ${competitiveRankingStatement(query(season),own.id)}`);
  const report=plan[0]['QUERY PLAN'][0];const indexes=new Set();
  function scan(node){if(node['Index Name'])indexes.add(node['Index Name']);for(const child of node.Plans??[])scan(child);}scan(report.Plan);
  const board=await reader.read(query(season),own.id);
  assert.equal(board.totalParticipantes,10000);assert.equal(board.ranking.length,50);
  console.log(JSON.stringify({phase:'ranking-performance',eligible:10000,otherSeason:10000,planningMs:report['Planning Time'],executionMs:report['Execution Time'],returnedEntries:board.ranking.length,indexes:[...indexes],plan:report.Plan}));
});
