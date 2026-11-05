import { Test } from '@nestjs/testing';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { OrientacionVocacionalController } from './orientacion-vocacional.controller';
import { OrientacionVocacionalService } from './orientacion-vocacional.service';
import { PREGUNTA_IDS } from './ov1.rules';

// HTTP + real guards/service with an in-memory persistence double.
// This suite does NOT establish PostgreSQL isolation, constraints or concurrency.
describe('OV1 private HTTP contract (persistence double)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let rows: any[];
  const a = randomUUID(), b = randomUUID(), teacher = randomUUID(), admin = randomUUID(), unverified = randomUUID();
  const users = new Map([a,b,teacher,admin,unverified].map(id => [id, {
    id, nombre:'Test', correo:`${id}@example.invalid`, rol: id===teacher?'PROFESOR':id===admin?'ADMIN':'ESTUDIANTE',
    correoVerificado:id!==unverified, institucionId:null, debeCambiarContrasena:false,
  }]));
  const select = (where: any) => rows.filter(r=>Object.entries(where).every(([k,v])=>r[k]===v));
  const db: any = {
    usuario: { findUnique: jest.fn(async ({where})=>users.get(where.id)) },
    $queryRaw: async (sql: TemplateStringsArray,...args: any[]) => sql.join('').includes('"Usuario"') ? [users.get(args[0])].filter(Boolean) : sql.join('').includes('clock_timestamp') ? [{ahora:new Date()}] : [],
    $executeRaw: async ()=>1,
    intentoVocacional: {
      findFirst: async ({where}: any)=>select(where)[0]??null,
      create: async ({data}: any)=>{const r={...data,id:randomUUID(),estado:'EN_PROGRESO',iniciadoEn:new Date(),actualizadoEn:new Date(),completadoEn:null,resultado:null,respuestas:[]};rows.push(r);return r;},
      count: async ({where}: any)=>select(where).length,
      findMany: async ({where,skip,take}: any)=>select(where).slice(skip,skip+take),
      update: async ({where,data}: any)=>Object.assign(select(where)[0],data),
      delete: async ({where}: any)=>{rows=rows.filter(r=>r.id!==where.id);},
    },
    respuestaVocacional: {upsert: async ({create,update}: any)=>{
      const r=rows.find(r=>r.id===create.intentoId); const existing=r.respuestas.find((x:any)=>x.preguntaId===create.preguntaId);
      if(existing)Object.assign(existing,update);else r.respuestas.push({...create});
    }},
  };
  db.$transaction=async (fn:any)=>fn(db);
  const call=(id:string|undefined,method:string,path='',body?:any)=>{
    const req=request(app.getHttpServer())[method]('/orientacion-vocacional'+path);
    if(id)req.set('Authorization','Bearer '+jwt.sign({sub:id,rol:'ESTUDIANTE'}));
    return body===undefined?req:req.send(body);
  };
  const answers=()=>({respuestas:PREGUNTA_IDS.map(preguntaId=>({preguntaId,valor:4}))});
  beforeAll(async()=>{
    const module=await Test.createTestingModule({imports:[JwtModule.register({secret:randomUUID()})],
      controllers:[OrientacionVocacionalController],providers:[OrientacionVocacionalService,JwtGuard,EmailVerificadoGuard,{provide:PrismaService,useValue:db}]}).compile();
    app=module.createNestApplication({logger:false}); app.useGlobalPipes(new ValidationPipe({whitelist:true,forbidNonWhitelisted:true,transform:true,transformOptions:{enableImplicitConversion:true}}));
    await app.init();jwt=module.get(JwtService);
  });
  beforeEach(()=>{rows=[];});
  afterAll(async()=>app?.close());
  it('requires authentication and verified email',async()=>{
    await call(undefined,'get').expect(401); await call(unverified,'get').expect(403);
  });
  it.each([teacher,admin])('denies current nonstudent role despite student JWT claim: %s',async id=>{
    await call(id,'get').expect(403);await call(id,'post','/intentos',{}).expect(403);
    await call(id,'get','/historial').expect(403);await call(id,'get','/cuestionario').expect(403);
  });
  it('foreign reads, edits, finalization and deletion return 404 and history excludes A',async()=>{
    const {body:first}=await call(a,'post','/intentos',{}).expect(201);
    await call(b,'get',`/intentos/${first.id}`).expect(404);
    await call(b,'patch',`/intentos/${first.id}/respuestas`,answers()).expect(404);
    await call(b,'post',`/intentos/${first.id}/finalizar`,{}).expect(404);
    await call(b,'delete',`/intentos/${first.id}`).expect(404);
    const h=await call(b,'get','/historial').expect(200);expect(h.body.intentos).toEqual([]);
    await call(a,'get',`/intentos/${first.id}`).expect(200);
    await call(b,'get',`/intentos/${randomUUID()}`).expect(404);
  });
  it('resumes active, preserves final snapshot, repeats and deletes owned history',async()=>{
    expect((await call(a,'get')).body.intento).toBeNull();
    const first=(await call(a,'post','/intentos',{})).body;
    expect((await call(a,'post','/intentos',{})).body.id).toBe(first.id);
    await call(a,'patch',`/intentos/${first.id}/respuestas`,answers()).expect(200);
    const final=(await call(a,'post',`/intentos/${first.id}/finalizar`,{}).expect(200)).body;
    expect(final.resultado.ov1RulesVersion).toBe(1);expect(final.resultado.familias.every((f:any)=>f.puntaje===100)).toBe(true);
    expect((await call(a,'post',`/intentos/${first.id}/finalizar`,{})).body).toEqual(final);
    await call(a,'patch',`/intentos/${first.id}/respuestas`,answers()).expect(409);
    const next=(await call(a,'post','/intentos',{})).body;expect(next.id).not.toBe(first.id);
    expect((await call(a,'get','/historial')).body.total).toBe(2);
    await call(a,'delete',`/intentos/${first.id}`).expect(204);
    expect((await call(a,'get','/historial')).body.total).toBe(1);
  });
  it('stores NO_SE and allows correction after coverage rejection, without a result',async()=>{
    const first=(await call(a,'post','/intentos',{})).body;
    const payload=answers();payload.respuestas=payload.respuestas.slice(0,23);
    await call(a,'patch',`/intentos/${first.id}/respuestas`,payload).expect(200);
    await call(a,'post',`/intentos/${first.id}/finalizar`,{}).expect(409);
    expect((await call(a,'get',`/intentos/${first.id}`)).body.resultado).toBeNull();
    await call(a,'patch',`/intentos/${first.id}/respuestas`,{respuestas:[{preguntaId:'T1',valor:'NO_SE'}]}).expect(200);
    expect((await call(a,'get',`/intentos/${first.id}`)).body.respuestas.find((r:any)=>r.preguntaId==='T1').valor).toBe('NO_SE');
    await call(a,'patch',`/intentos/${first.id}/respuestas`,answers()).expect(200);
    await call(a,'post',`/intentos/${first.id}/finalizar`,{}).expect(200);
  });
  it.each(['4',null,5,-1,2.5,true])('does not coerce invalid HTTP response %p',async valor=>{
    const first=(await call(a,'post','/intentos',{})).body;
    await call(a,'patch',`/intentos/${first.id}/respuestas`,{respuestas:[{preguntaId:'T1',valor}]}).expect(400);
  });
  it('rejects duplicate questions, foreign identity and client-calculated results',async()=>{
    await call(a,'post','/intentos',{usuarioId:b}).expect(400);
    const first=(await call(a,'post','/intentos',{})).body;
    await call(a,'patch',`/intentos/${first.id}/respuestas`,{respuestas:[{preguntaId:'T1',valor:0},{preguntaId:'T1',valor:4}]}).expect(400);
    await call(a,'patch',`/intentos/${first.id}/respuestas`,{...answers(),usuarioId:b}).expect(400);
    await call(a,'post',`/intentos/${first.id}/finalizar`,{resultado:100,rulesVersion:2}).expect(400);
    await call(a,'get','/historial?usuarioId='+b).expect(400);
  });
});
