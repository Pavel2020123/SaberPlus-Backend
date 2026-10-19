import test from 'node:test';
import assert from 'node:assert/strict';
import { QuestionReports } from '../public/question-reports.mjs';
import { reportDecision, reportRow, reportQuery } from '../public/question-report-fields.mjs';
import { createDemoQuestionReports } from '../demo-question-reports.mjs';
import { CatalogApi, PanelError } from '../public/api.mjs';
import { createAdminServer } from '../server.mjs';
import { BankCoverage, validateCoverage } from '../public/bank-coverage.mjs';
import { demoCoverage } from '../demo-bank-coverage.mjs';

const id = 'a1111111-1111-4111-8111-111111111111';
const operation = 'b1111111-1111-4111-8111-111111111111';
const row = () => ({ id, preguntaId: 'q1', motivo: 'ENUNCIADO_CONFUSO', detalle: '<img src=x onerror=alert(1)>',
  estado: 'PENDIENTE', revision: 0, fechaCreacion: '2026-10-17T12:00:00Z', fechaActualizacion: '2026-10-17T12:00:00Z',
  area: 'MATEMATICAS', subtemaId: 's1', snapshot: { pregunta: '<script>private</script>' },
  auditoria: [{ revision: 0, estadoNuevo: 'PENDIENTE' }] });
const page = () => ({items: [row()], pagina: 1, limite: 20, hayMas: false});
const decision = () => ({operacionId: operation, revision: 0, destino: 'EN_REVISION', motivoRevision: 'Voy a revisarlo'});

test('contracts reject malformed decisions, unicode controls, filters and private detail', () => {
  assert.equal(reportDecision({...decision(), motivoRevision: '😀'.repeat(500)}).motivoRevision.length, 1000);
  for (const change of [{revision: -1}, {revision: '0'}, {destino: 'PUBLICADO'}, {operacionId: 'bad'},
    {motivoRevision: ' '}, {motivoRevision: '\ud800'}, {motivoRevision: '\u0000'}, {motivoRevision: '😀'.repeat(501)}])
    assert.throws(() => reportDecision({...decision(), ...change}));
  for (const filters of [{area:'OTHER'}, {estado:'APROBADA'}, {subtemaId:'a b'}, {secret:true},
    {area:null}, {estado:0}, [], null]) assert.throws(() => reportQuery(filters));
  for (const change of [{revision: -1}, {estado:'PUBLICADO'}, {area:'OTHER'}, {auditoria:null}, {snapshot:null}])
    assert.throws(() => reportRow({...row(), ...change}, {admin:true, detail:true}));
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; this.disabled = false; this.value = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  set innerHTML(_) { throw Error('Never interpret report HTML'); }
}
const flatten = element => [element, ...element.children.flatMap(flatten)];
const find = (host, text) => flatten(host).find(n => n.textContent === text);
function setup(t, overrides = {}) {
  const old = globalThis.document; globalThis.document = {createElement: tag => new Element(tag)};
  t.after(() => { if (old === undefined) delete globalThis.document; else globalThis.document = old; });
  const calls = [];
  const api = {questionReports: async () => page(), questionReport: async () => row(),
    decideQuestionReport: async (id, body) => { calls.push({id,body}); return {...row(), estado:body.destino, revision:1}; }, ...overrides};
  const host = new Element('section'), panel = new QuestionReports({api,host,confirm:()=>true,uuid:()=>operation});
  return {panel, host, calls};
}
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); };
async function enterDecision(panel, host) {
  await panel.open(); await panel.show(id);
  const text = flatten(host).find(n=>n.tag==='textarea'); text.value = 'Voy a revisarlo'; text.oninput();
  return find(host,'Confirmar decisión');
}

test('ADMIN detail renders private text without HTML/media and force close clears it', async t => {
  const {panel,host} = setup(t); await panel.open(); await panel.show(id);
  assert.ok(find(host,'<img src=x onerror=alert(1)>'));
  assert.ok(flatten(host).some(n=>n.tag==='pre' && n.textContent.includes('<script>private</script>')));
  assert.ok(flatten(host).every(n=>!['img','iframe','a'].includes(n.tag)));
  panel.close(true); assert.equal(host.children.length,0); assert.equal(panel.record,null); assert.equal(panel.draftText,'');
});
test('confirmation cancel and unsaved-discard cancel never write or navigate', async t => {
  const {panel,host,calls} = setup(t); const save = await enterDecision(panel,host);
  panel.confirm=()=>false; save.onclick(); await settle();
  assert.equal(calls.length,0); assert.equal(panel.close(),false); assert.equal(panel.discard(),false);
});
test('uncertain decision preserves payload, locks navigation and replay is exactly identical', async t => {
  let fail = true; const sent=[];
  const {panel,host} = setup(t,{decideQuestionReport:async (id,body)=>{
    sent.push({id,body}); if(fail) throw Error('No se pudo confirmar'); return row();
  }});
  const save = await enterDecision(panel,host); save.onclick(); await settle();
  assert.equal(panel.close(),false); assert.equal(panel.pending.body.operacionId,operation);
  assert.ok(find(host,'Reintentar misma decisión'));
  await panel.show(id,true); assert.ok(panel.pending); // GET is not a receipt.
  fail=false; await panel.decide();
  assert.equal(sent.length,2); assert.equal(sent[0].body,sent[1].body); assert.equal(panel.pending,null);
});
test('double click while deciding cannot create another operation', async t => {
  let resolve; let sends=0;
  const {panel,host} = setup(t,{decideQuestionReport:()=>{sends++;return new Promise(r=>resolve=r);}});
  const save = await enterDecision(panel,host); save.onclick(); save.onclick();
  assert.equal(sends,1); resolve(row()); await settle(); assert.equal(panel.pending,null);
});
test('a rate rejection after uncertain write cannot discard the original decision', async t => {
  let status=0;
  const {panel,host}=setup(t,{decideQuestionReport:async()=>{throw new PanelError('fallo',status);}});
  const save=await enterDecision(panel,host);save.onclick();await settle();
  assert.equal(panel.pending.uncertain,true);const original=panel.pending.body;
  status=429;await panel.decide();assert.equal(panel.pending.body,original);
  assert.equal(panel.close(),false);assert.ok(find(host,'Reintentar misma decisión'));
});
test('409 preserves motive and requires current detail before another decision', async t => {
  const {panel,host} = setup(t,{decideQuestionReport:async()=>{throw new PanelError('Conflicto',409);}});
  const save = await enterDecision(panel,host); save.onclick(); await settle();
  assert.equal(panel.pending,null); assert.equal(panel.record,null); assert.equal(panel.draftText,'Voy a revisarlo');
  assert.equal(find(host,'Confirmar decisión'),undefined);
  await panel.show(id,true); assert.equal(flatten(host).find(n=>n.tag==='textarea').value,'Voy a revisarlo');
});
test('late detail and late write after session close never restore private content', async t => {
  let resolve;
  const {panel,host} = setup(t,{questionReport:()=>new Promise(r=>resolve=r)});
  await panel.open(); const read=panel.show(id); panel.close(true); resolve(row()); await read;
  assert.equal(host.children.length,0); assert.equal(panel.record,null);
  panel.api.questionReport=async()=>row(); let saveResolve;
  panel.api.decideQuestionReport=()=>new Promise(r=>saveResolve=r);
  const save=await enterDecision(panel,host); save.onclick(); panel.close(true); saveResolve(row()); await settle();
  assert.equal(host.children.length,0); assert.equal(panel.pending,null);
});
test('failed inbox is an error, not a false empty success', async t => {
  const {panel}=setup(t,{questionReports:async()=>{throw Error('Sin conexión');}});
  await panel.open(); assert.match(panel.status.textContent,/Sin conexión/); assert.equal(panel.list.children.length,0);
});
test('filters/subtopic are sent without exposing author identity', async t => {
  let filters;
  const {panel}=setup(t,{questionReports:async f=>{filters=f;return page();}});
  await panel.open({area:'MATEMATICAS',subtemaId:'s1',estado:'PENDIENTE'});
  assert.deepEqual(filters,{area:'MATEMATICAS',subtemaId:'s1',estado:'PENDIENTE'});
  assert.ok(panel.status.textContent.includes('Página 1'));
});

test('demo decisions enforce revisions, transitions, actor and immutable original receipts', () => {
  let response; const demo=createDemoQuestionReports({send:(_,status,body)=>response={status,body}, question:{id:'q1'}, area:'MATEMATICAS',subtemaId:'s1'});
  const responseObject={setHeader(){}};
  const call=(body,actor='a')=>{demo.route({method:'PATCH'},responseObject,new URL(`http://local/admin/reportes-preguntas/${id}/estado`),body,actor);return response;};
  assert.equal(call({...decision(),destino:'RESUELTO'}).status,409);
  assert.equal(call(decision()).body.revision,1);
  const second={operacionId:'c1111111-1111-4111-8111-111111111111',revision:1,destino:'RESUELTO',motivoRevision:'Corregida editorialmente'};
  assert.equal(call(second).body.revision,2);
  assert.equal(call(decision()).body.estado,'EN_REVISION'); // original receipt, NOT current state
  assert.equal(demo.rows[0].estado,'RESUELTO'); assert.equal(demo.rows[0].auditoria.length,3);
  assert.equal(call(decision(),'foreign').status,404);
  assert.equal(call({...decision(),motivoRevision:'otro'}).status,409);
  assert.equal(call({...second,operacionId:'d1111111-1111-4111-8111-111111111111',revision:1}).status,409);
});

test('coverage dual contract counts open reports on archived question IDs, not published questions', () => {
  const f={themes:[{id:'t',nombre:'Tema',area:'MATEMATICAS',estadoContenido:'PUBLICADO'}],
    subthemes:[{id:'s',nombre:'Subtema',temaId:'t',estadoContenido:'PUBLICADO'}],questions:[],cases:[],
    reports:[{area:'MATEMATICAS',subtemaId:'s',preguntaId:'old',estado:'PENDIENTE'},
      {area:'MATEMATICAS',subtemaId:'s',preguntaId:'old',estado:'EN_REVISION'},
      {area:'MATEMATICAS',subtemaId:'s',preguntaId:'other',estado:'RESUELTO'}]};
  const data=validateCoverage(demoCoverage(f,'MATEMATICAS',1,20,true),'MATEMATICAS',1);
  assert.equal(data.items[0].publicadas,0); assert.equal(data.items[0].reportes,2); assert.equal(data.items[0].preguntasConReportes,1);
  const legacy=validateCoverage(demoCoverage(f,'MATEMATICAS',1,20),'MATEMATICAS',1); assert.equal(legacy.items[0].reportes,null);
  for(const mutate of [d=>d.reportesVersion=2,d=>d.items[0].reportes=-1,d=>d.items[0].preguntasConReportes=3]) {
    const bad=structuredClone(data);mutate(bad);assert.throws(()=>validateCoverage(bad,'MATEMATICAS',1));
  }
});
test('coverage downgrades only 400 opt-in rejection, not a DB/network/auth failure', async t => {
  const {host}=setup(t);
  const empty={area:'MATEMATICAS',pagina:1,limite:20,totalSubtemas:0,hayMas:false,reportesDisponibles:false,items:[]};
  let calls=0, status=400;
  const panel=new BankCoverage({host,api:{coverage:async (_a,_p,opt)=>{calls++; if(opt)throw new PanelError('no',status);return empty;}}});
  await panel.open(); assert.equal(calls,2); assert.match(panel.status.textContent,/No hay subtemas/);
  for(status of [401,403,503,0]) {calls=0;await panel.load();assert.equal(calls,1);assert.match(panel.status.textContent,/No se pudo consultar/);}
});

test('demo HTTP: ADMIN authentication, module assets, report detail, replay and opt-in coverage', async t => {
  const server=createAdminServer({demo:true}); await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin+'/api/admin/reportes-preguntas')).status,401);
  for(const asset of ['question-report-fields.mjs','question-reports.mjs']) assert.equal((await fetch(`${origin}/${asset}`)).status,200);
  const api=new CatalogApi(origin+'/api'); await api.login('demo@saberplus.invalid','solo-demostracion');
  const list=await api.questionReports({estado:'PENDIENTE'}); assert.equal(list.items.length,1); assert.equal(list.items[0].snapshot,undefined);
  const detail=await api.questionReport(id); assert.equal(detail.snapshot.pregunta.estadoContenido,'ARCHIVADO');
  const coverage=await api.coverage('MATEMATICAS',1,true);
  assert.equal(coverage.reportesDisponibles,true); assert.equal(coverage.items.find(r=>r.id==='demo-legacy-sub').reportes,1);
  const first=await api.decideQuestionReport(id,decision()); assert.equal(first.revision,1);
  await api.decideQuestionReport(id,{operacionId:'c1111111-1111-4111-8111-111111111111',revision:1,destino:'RESUELTO',motivoRevision:'Revisada'});
  assert.deepEqual(await api.decideQuestionReport(id,decision()),first);
  assert.equal((await api.questionReport(id)).estado,'RESUELTO');
  assert.equal((await api.coverage('MATEMATICAS',1,true)).items.find(r=>r.id==='demo-legacy-sub').reportes,0);
  api.logout(); await assert.rejects(()=>api.questionReports());
});
