const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFile}=require('node:fs/promises');
let db,service,app,jwt,origin,card;
before(async()=>{
  const {validateOwnedConnection}=await import('../tool/test_editorial_postgres.mjs');
  if(!process.env.EDITORIAL_TEST_URL || !process.env.EDITORIAL_TEST_OWNER) throw Error('Use --deferred-review disposable runner');
  validateOwnedConnection(process.env.EDITORIAL_TEST_URL,JSON.parse(await readFile(process.env.EDITORIAL_TEST_OWNER,'utf8')));
  require('ts-node').register({transpileOnly:true,project:'tsconfig.json'});
  const {PrismaService}=require('../src/prisma/prisma.service.ts');
  const {DeferredReviewService}=require('../src/deferred-review/deferred-review.service.ts');
  const {DeferredReviewController}=require('../src/deferred-review/deferred-review.module.ts');
  const {CARD_IDS}=require('../src/deferred-review/card-registry.ts');card=[...CARD_IDS][0];
  const {JwtGuard}=require('../src/auth/jwt.guard.ts');
  const {EmailVerificadoGuard}=require('../src/auth/email-verificado.guard.ts');
  const {JwtModule,JwtService}=require('@nestjs/jwt');const {Test}=require('@nestjs/testing');
  const {ValidationPipe}=require('@nestjs/common');
  db=new PrismaService({datasources:{db:{url:process.env.EDITORIAL_TEST_URL}}});await db.$connect();
  service=new DeferredReviewService(db);
  const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID()})],controllers:[DeferredReviewController],
    providers:[{provide:PrismaService,useValue:db},DeferredReviewService,JwtGuard,EmailVerificadoGuard]}).compile();
  app=module.createNestApplication({logger:false});app.useGlobalPipes(new ValidationPipe({transform:true,whitelist:true,forbidNonWhitelisted:true}));
  await app.listen(0,'127.0.0.1');origin=await app.getUrl();jwt=module.get(JwtService);
});
after(async()=>{await app?.close();await db?.$disconnect();});
async function user(verified=true){return db.usuario.create({data:{nombre:'Test',correo:randomUUID()+'@example.invalid',contrasenaHash:'not-real',rol:'ESTUDIANTE',correoVerificado:verified}});}
function input(extra={}){return {version:1,eventoId:randomUUID(),tarjetaId:card,contenidoVersion:'library-v1',revision:0,resultado:'remembered',...extra};}
async function http(u,body){return fetch(origin+'/repasos-diferidos/me'+(body?'/eventos':''),{method:body?'POST':'GET',headers:{...(u?{Authorization:'Bearer '+jwt.sign({sub:u.id,rol:'ESTUDIANTE'})}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});}
test('HTTP guards, validated DTO, private list and catalog bounds',async()=>{
  const a=await user(),b=await user();assert.equal((await http()).status,401);
  assert.equal((await http(await user(false))).status,403);
  assert.equal((await http(a,input({usuarioId:b.id}))).status,400);
  assert.equal((await http(a,input({revision:-1}))).status,400);
  assert.equal((await http(a,input({tarjetaId:'invented'}))).status,410);
  assert.equal((await http(a,input())).status,201);
  assert.equal((await (await http(b)).json()).agenda.length,0);
  const result=await (await http(a)).json();assert.equal(result.agenda.length,1);
  assert.doesNotMatch(JSON.stringify(result),/usuarioId|correo|huella/);
});
test('identical retry returns original receipt; changed body conflicts',async()=>{
  const u=await user(),body=input();const first=await service.record(u.id,body);
  assert.deepEqual(await service.record(u.id,body),first);
  await assert.rejects(service.record(u.id,{...body,resultado:'needsPractice'}),e=>e.getStatus()===409);
  assert.equal(await db.eventoRepasoDiferido.count({where:{usuarioId:u.id}}),1);
});
test('simultaneous requests advance once and persist atomically',async()=>{
  const u=await user();const result=await Promise.allSettled([service.record(u.id,input()),service.record(u.id,input())]);
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(await db.repasoDiferido.count({where:{usuarioId:u.id}}),1);
  assert.equal(await db.eventoRepasoDiferido.count({where:{usuarioId:u.id}}),1);
});
test('early practice cannot change schedule; due review advances using server time',async()=>{
  const u=await user();const first=await service.record(u.id,input());
  const early=await service.record(u.id,input({revision:1}));assert.equal(early.estado,'tooEarly');
  assert.deepEqual(early.agenda,first.agenda);
  await db.repasoDiferido.updateMany({where:{usuarioId:u.id},data:{revisadoEn:new Date(Date.now()-2*86400000),venceEn:new Date(Date.now()-86400000)}});
  const due=await service.record(u.id,input({revision:1}));assert.equal(due.agenda.paso,1);
  assert.equal(new Date(due.agenda.venceEn)-new Date(due.agenda.revisadoEn),3*86400000);
  assert.equal(due.agenda.revision,2);
});
test('database enforces RLS and denies direct public roles',async()=>{
  const rows=await db.$queryRawUnsafe(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('RepasoDiferido','EventoRepasoDiferido')`);
  assert.equal(rows.length,2);assert.ok(rows.every(r=>r.relrowsecurity));
  for(const role of ['anon','authenticated']){
    await assert.rejects(db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET LOCAL ROLE '+role);await tx.$queryRawUnsafe('SELECT * FROM "RepasoDiferido"');}));
  }
});
