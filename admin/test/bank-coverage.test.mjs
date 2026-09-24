import test from "node:test";
import assert from "node:assert/strict";
import { demoCoverage } from "../demo-bank-coverage.mjs";
import { BankCoverage, validateCoverage } from "../public/bank-coverage.mjs";
import { CatalogApi } from "../public/api.mjs";
import { createAdminServer } from "../server.mjs";

function fixture() {
  return { themes:[{id:"t",nombre:"<img onerror=alert(1)>",area:"MATEMATICAS",estadoContenido:"PUBLICADO"}],
    subthemes:[{id:"s",nombre:"Ratios",temaId:"t",estadoContenido:"PUBLICADO",_count:{preguntas:999}}],
    questions:[
      {id:"q1",subtemaId:"s",estadoContenido:"PUBLICADO",dificultad:"BASICO",explicacion:" \n\t "},
      {id:"q2",subtemaId:"s",estadoContenido:"PUBLICADO",dificultad:"MEDIO",explicacion:"Explained",casoId:"c"},
      {id:"q3",subtemaId:"s",estadoContenido:"BORRADOR",dificultad:"AVANZADO"}],
    cases:[{id:"c",estadoContenido:"BORRADOR"}] };
}
const data = () => demoCoverage(fixture(),"MATEMATICAS",1,20);
test("demo uses real records, effective publication and missing explanations", () => {
  const f = fixture(), result = validateCoverage(demoCoverage(f,"MATEMATICAS",1,20),"MATEMATICAS",1);
  assert.equal(result.items[0].total,3); assert.equal(result.items[0].publicadas,1);
  assert.equal(result.items[0].sinExplicacion,1); assert.equal(result.items[0].reportes,null);
  assert.deepEqual(result.items[0].dificultadesFaltantes,["MEDIO","AVANZADO"]);
  f.cases[0].estadoContenido = "PUBLICADO";
  assert.equal(demoCoverage(f,"MATEMATICAS",1,20).items[0].publicadas,2);
  f.themes[0].estadoContenido = "ARCHIVADO";
  assert.equal(demoCoverage(f,"MATEMATICAS",1,20).items[0].publicadas,0);
});
test("empty and paginated demo never invents totals", () => {
  const f = fixture(); f.questions = [];
  f.subthemes = Array.from({length:21},(_,i)=>({...f.subthemes[0],id:String(i)}));
  const first = demoCoverage(f,"MATEMATICAS",1,20), next = demoCoverage(f,"MATEMATICAS",2,20);
  assert.equal(first.items.length,20); assert.equal(next.items.length,1);
  assert.equal(first.hayMas,true); assert.equal(next.hayMas,false);
  assert.equal(next.items[0].total,0);
  assert.equal(demoCoverage(f,"INGLES",1,20).items.length,0);
});
test("reject inconsistent counts, unavailable-report zeros and wrong query responses", () => {
  for (const mutate of [
    d=>d.area="INGLES", d=>d.hayMas=true, d=>d.items[0].total=100,
    d=>d.items[0].reportes=0, d=>d.items[0].sinExplicacion=100,
    d=>d.items[0].dificultades.BASICO=-1, d=>d.items[0].dificultadesFaltantes=[],
  ]) { const d = data(); mutate(d); assert.throws(()=>validateCoverage(d,"MATEMATICAS",1)); }
});
class Element {
  constructor(tag) { this.tag=tag; this.children=[]; this.textContent=""; this.disabled=false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=nodes; }
  setAttribute() {}
  set innerHTML(_) { throw Error("Do not execute bank HTML"); }
}
const flatten = e => [e,...e.children.flatMap(flatten)];
function setup(t,api) {
  const previous = globalThis.document;
  globalThis.document = {createElement: tag=>new Element(tag)};
  t.after(()=>{if(previous === undefined) delete globalThis.document; else globalThis.document=previous;});
  const host = new Element("section");
  return {host,panel:new BankCoverage({api,host})};
}
test("renders names safely as text and cleans data on close", async t=>{
  const {host,panel}=setup(t,{coverage:async()=>data()});
  await panel.open();
  assert.ok(flatten(host).some(n=>n.textContent.includes("<img onerror=alert(1)>")));
  assert.equal(panel.next.disabled,true);
  panel.close(); assert.equal(host.children.length,0); assert.equal(host.hidden,true);
});
test("late response after close cannot repopulate private content", async t=>{
  let resolve;
  const {host,panel}=setup(t,{coverage:()=>new Promise(r=>resolve=r)});
  const request=panel.open(); panel.close(); resolve(data()); await request;
  assert.equal(host.children.length,0);
});
test("failed refresh clears old counts and offers retry without fake empty bank", async t=>{
  let fail=false;
  const {panel}=setup(t,{coverage:async()=>{if(fail)throw Error();return data();}});
  await panel.open(); fail=true; await panel.load();
  assert.equal(panel.list.children.length,0);
  assert.match(panel.status.textContent,/No se pudo consultar/);
  fail=false; await panel.load(); assert.equal(panel.list.children.length,1);
});
test("latest filter wins over an older pending request", async t=>{
  const resolvers=[];
  const {panel}=setup(t,{coverage:()=>new Promise(r=>resolvers.push(r))});
  const old=panel.open();
  panel.area="INGLES"; const latest=panel.load();
  resolvers[1](demoCoverage(fixture(),"INGLES",1,20)); await latest;
  resolvers[0](data()); await old;
  assert.equal(panel.list.children.length,0);
  assert.match(panel.status.textContent,/No hay subtemas/);
});
test("demo HTTP requires session, serves asset and returns computed report", async t=>{
  const server=createAdminServer({demo:true});
  await new Promise(r=>server.listen(0,"127.0.0.1",r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin+"/api/admin/cobertura?area=MATEMATICAS")).status,401);
  assert.equal((await fetch(origin+"/bank-coverage.mjs")).status,200);
  const api=new CatalogApi(origin+"/api");
  await api.login("demo@saberplus.invalid","solo-demostracion");
  const d=validateCoverage(await api.coverage("MATEMATICAS"),"MATEMATICAS",1);
  assert.equal(d.items.find(r=>r.id==="demo-s1").total,0);
  assert.throws(()=>api.coverage("OTHER"));
  api.logout(); assert.throws(() => api.coverage("MATEMATICAS"));
});
