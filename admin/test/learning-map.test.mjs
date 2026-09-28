import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoLearningMap} from '../demo-learning-map.mjs';
import {mapChange,mapDetail} from '../public/learning-map-fields.mjs';
import {LearningMapEditor} from '../public/learning-map-editor.mjs';
import {createAdminServer} from '../server.mjs';
import {CatalogApi} from '../public/api.mjs';
const ref = id => ({id,nombre:id,temaId:'t',tema:'Tema',estado:'PUBLICADO',estadoTema:'PUBLICADO',disponible:true});
const snapshot = () => ({versionContrato:1,orientativo:true,area:'MATEMATICAS',revision:0,subtema:ref('c'),previos:[],recorrido:[]});
test('contract rejects malformed changes and mismatched map responses',()=>{
  for(const x of [{revision:-1,previos:[]},{revision:0,previos:['a','a']},{revision:0,previos:['../x']},{revision:0,previos:[],extra:true}]) assert.throws(()=>mapChange(x));
  assert.deepEqual(mapChange({revision:0,previos:[]}),{revision:0,previos:[]});
  assert.equal(mapDetail(snapshot(),'c','MATEMATICAS').revision,0);
  assert.throws(()=>mapDetail(snapshot(),'a','MATEMATICAS'));
});
test('demo keeps revisions, rejects cycles and cross-area links, and supports clearing archived nodes',()=>{
  let response;
  const themes=[{id:'t',nombre:'Tema',area:'MATEMATICAS',estadoContenido:'PUBLICADO'},{id:'u',nombre:'Otro',area:'INGLES',estadoContenido:'PUBLICADO'}];
  const subthemes=['a','b','c'].map(id=>({id,nombre:id,temaId:'t',estadoContenido:'PUBLICADO'}));
  subthemes.push({id:'d',nombre:'d',temaId:'u',estadoContenido:'PUBLICADO'});
  const route=createDemoLearningMap({themes,subthemes,send:(_,status,body)=>response={status,body}});
  const call=(id,revision,previos)=>{route({method:'PUT'},{},new URL('http://local/api/admin/mapa-aprendizaje/subtemas/'+id),{revision,previos});return response;};
  assert.equal(call('b',0,['a']).body.revision,1);
  assert.equal(call('c',1,['b']).body.recorrido.length,2);
  assert.equal(call('a',2,['c']).status,400);
  assert.equal(call('c',1,['b']).status,409);
  assert.equal(call('c',2,['b']).body.revision,2);
  assert.equal(call('c',2,['d']).status,400);
  subthemes[2].estadoContenido='ARCHIVADO';
  assert.equal(call('c',2,[]).body.revision,3);
});
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.textContent='';}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  set innerHTML(_){throw Error('Unsafe HTML');}
}
function setup(t,handler=async()=>snapshot()){
  const old=globalThis.document;globalThis.document={createElement:tag=>new Element(tag)};
  t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
  return new LearningMapEditor({host:new Element('section'),api:{learningMap:handler,page:async()=>({items:[],hayMas:false})},confirm:()=>false});
}
const target={id:'c',nombre:'<img onerror=alert(1)>',area:'MATEMATICAS'};
test('editor preserves unsaved bases when user cancels navigation',async t=>{
  const p=setup(t);await p.open(target);p.selected.push(ref('a'));p.render();
  assert.equal(p.dirty,true);assert.equal(p.close(),false);assert.equal(p.selected.length,1);
  assert.equal(p.host.children[0].textContent.includes('<img'),true);
  p.close(true);assert.equal(p.host.children.length,0);
});
test('uncertain or conflicting saves require reload and never automatically retry',async t=>{
  for(const status of [0,409,500]){
    let saves=0;const p=setup(t,async(_id,_area,body)=>{if(body){saves++;throw Object.assign(Error(),{status});}return snapshot();});
    await p.open(target);p.selected.push(ref('a'));await p.save();await p.save();
    assert.equal(saves,1);assert.equal(p.blocked,true);assert.equal(p.selected.length,1);
    p.confirm=()=>true;await p.reload();assert.equal(p.blocked,false);
  }
});
test('validation errors allow correction, successful save replaces revision',async t=>{
  let fail=true;const p=setup(t,async(_id,_area,body)=>{if(body&&fail)throw Object.assign(Error(),{status:400});return body?{...snapshot(),revision:1,previos:[ref('a')],recorrido:[ref('a')]}:snapshot();});
  await p.open(target);p.selected.push(ref('a'));await p.save();assert.equal(p.blocked,false);
  fail=false;await p.save();assert.equal(p.dirty,false);assert.equal(p.snapshot.revision,1);
});
test('duplicate save and late response after logout cannot restore data',async t=>{
  let resolve,saves=0;const p=setup(t,async(_id,_area,body)=>{if(!body)return snapshot();saves++;return new Promise(r=>resolve=r);});
  await p.open(target);p.selected.push(ref('a'));const pending=p.save();await p.save();assert.equal(saves,1);
  p.close(true);resolve(snapshot());await pending;assert.equal(p.snapshot,null);assert.equal(p.host.children.length,0);
});
test('late initial read cannot reopen a closed editor',async t=>{
  let resolve;const p=setup(t,()=>new Promise(r=>resolve=r));const request=p.open(target);
  p.close(true);resolve(snapshot());await request;assert.equal(p.host.children.length,0);
});
test('demo HTTP protects route and serves browser dependencies',async t=>{
  const server=createAdminServer({demo:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  const origin=`http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin+'/api/admin/mapa-aprendizaje/subtemas/demo-s1')).status,401);
  for(const file of ['learning-map-editor.mjs','learning-map-fields.mjs'])assert.equal((await fetch(origin+'/'+file)).status,200);
  const api=new CatalogApi(origin+'/api');await api.login('demo@saberplus.invalid','solo-demostracion');
  assert.equal((await api.learningMap('demo-s1','MATEMATICAS')).revision,0);
  assert.equal((await api.learningMap('demo-s1','MATEMATICAS',{revision:0,previos:[]})).revision,0);
});
test('candidate browsing preserves bases, excludes target/drafts, and caps additions at eight',async t=>{
  const p=setup(t);await p.open(target);p.candidateTheme={id:'t',nombre:'Tema'};
  p.api.page=async()=>({items:[{id:'c',nombre:'Destino',estadoContenido:'PUBLICADO'},
    {id:'draft',nombre:'Borrador',estadoContenido:'BORRADOR'},
    {id:'a',nombre:'Base',estadoContenido:'PUBLICADO'}],tema:{estadoContenido:'PUBLICADO'},hayMas:false});
  await p.loadCandidates('subtemas','t',1);
  const buttons=p.candidates.children.filter(n=>n.tag==='button');
  assert.equal(buttons.find(n=>n.textContent==='Agregar: Destino').disabled,true);
  assert.equal(buttons.find(n=>n.textContent.includes('Borrador')).disabled,true);
  buttons.find(n=>n.textContent==='Agregar: Base').onclick();assert.equal(p.selected.length,1);
  await p.loadCandidates('subtemas','t',2);assert.equal(p.selected.length,1);
  p.selected=Array.from({length:8},(_,i)=>ref('base'+i));
  p.candidates.children.find(n=>n.textContent==='Agregar: Base').onclick();assert.equal(p.selected.length,8);
});
