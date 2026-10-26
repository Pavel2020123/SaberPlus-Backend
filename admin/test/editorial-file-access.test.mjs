import test from "node:test";
import assert from "node:assert/strict";
import { CatalogApi } from "../public/api.mjs";
import { EditorialFileAccess } from "../public/editorial-file-access.mjs";
import { fileReference, revocationFields, revocationReceipt } from "../public/editorial-file-fields.mjs";

const id="2df4f385-fec2-4cb1-89af-91f67a476b52", operation="f2c743aa-7ba2-454b-9319-b6e234f7d206";
const fields={motivo:"SEGURIDAD",detalle:"Detalle interno del ensayo"};
const receipt=(changes={})=>({archivoId:id,operacionId:operation,...fields,creadoEn:"2026-10-24T12:00:00.000Z",...changes});
const row=()=>({id,estado:"DISPONIBLE",titulo:"<script>Imagen propia</script>",textoAlternativo:"Descripción original"});
const late=()=>{let resolve;const promise=new Promise(ok=>resolve=ok);return{promise,resolve};};
class Element {
  constructor(tag){this.tag=tag;this.children=[];this.value="";this.textContent="";this.disabled=false;}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;}
  setAttribute(){}
  set innerHTML(_){throw Error("No interpretar HTML privado");}
}
function setup(overrides={}) {
  const host=new Element("section"),calls=[];
  const api={editorialFile:async()=>row(),revokeEditorialFile:async(id,op,body)=>{calls.push({id,op,body});return receipt();},
    editorialRevocationReceipt:async()=>receipt(),...overrides};
  const panel=new EditorialFileAccess({api,host,doc:{createElement:tag=>new Element(tag)},confirm:()=>true,uuid:()=>operation});
  panel.open();return{panel,host,calls};
}
async function select(panel){panel.reference.value=`/recursos/editoriales/${id}`;await panel.lookup();}
function draft(panel){panel.reason.value=fields.motivo;panel.description.value=fields.detalle;panel.description.oninput();}
const flat=node=>[node,...node.children.flatMap(flat)];

test("referencia y motivos no admiten URLs externas, control, payload vacío ni recibos cruzados",()=>{
  assert.equal(fileReference(` /RECURSOS/EDITORIALES/${id.toUpperCase()} `),id);
  for(const value of [`https://evil.invalid/recursos/editoriales/${id}`,`/recursos/editoriales/${id}?token=x`,`/admin/archivos/${id}`])assert.throws(()=>fileReference(value));
  for(const change of [{motivo:"OTRO"},{detalle:""},{detalle:"x".repeat(501)},{detalle:"motivo\nprivado"},{detalle:"\u202Edetalle"}])assert.throws(()=>revocationFields({...fields,...change}));
  for(const change of [{archivoId:operation},{operacionId:id},{motivo:"OTRO"},{creadoEn:"no es fecha"}])assert.throws(()=>revocationReceipt(receipt(change),id,operation));
});
test("seleccionar imagen no revoca; cancelar confirmación o dejar motivo vacío no escribe",async()=>{
  const {panel,calls}=setup();await select(panel);assert.equal(calls.length,0);
  await panel.revoke();assert.equal(calls.length,0);
  draft(panel);panel.confirm=()=>false;await panel.revoke();assert.equal(calls.length,0);assert.equal(panel.pending,null);
});
test("revocación confirmada conserva un recibo humano, estado terminal y cero HTML ejecutado",async()=>{
  const {panel,host,calls}=setup();await select(panel);draft(panel);await panel.revoke();
  assert.equal(calls.length,1);assert.equal(panel.record.estado,"REVOCADO");assert.equal(panel.pending,null);
  assert.equal(panel.record.contenidoUrl,null);assert.ok(flat(host).some(n=>n.textContent==="Revocación confirmada"));
  assert.ok(flat(host).some(n=>n.textContent==="<script>Imagen propia</script>"));
  assert.ok(flat(host).every(n=>!["img","iframe","a"].includes(n.tag)));
});
test("pérdida de respuesta mantiene referencia, motivo y misma operación; recibo 404 no autoriza otro envío",async()=>{
  let fail=true;const sent=[];
  const {panel}=setup({revokeEditorialFile:async(id,op,body)=>{sent.push({id,op,body});if(fail)throw Error("red");return receipt();},
    editorialRevocationReceipt:async()=>{throw Object.assign(Error("Sin recibo"),{status:404});}});
  await select(panel);draft(panel);await panel.revoke();const pending=panel.pending;
  assert.ok(pending);assert.equal(panel.reason.disabled,true);assert.equal(panel.reference.disabled,true);
  assert.equal(panel.close(),false);await panel.receipt();assert.equal(panel.pending,pending);
  fail=false;await panel.revoke(true);assert.deepEqual(sent[0],sent[1]);assert.equal(sent.length,2);assert.equal(panel.pending,null);
});
test("recuperar recibo confirma sin otro POST y nunca acepta datos de otro motivo",async()=>{
  let valid=false;const {panel,calls}=setup({revokeEditorialFile:async()=>{calls.push(1);throw Error("sin respuesta");},
    editorialRevocationReceipt:async()=>receipt(valid?{}:{detalle:"Otro motivo"})});
  await select(panel);draft(panel);await panel.revoke();await panel.receipt();assert.ok(panel.pending);
  valid=true;await panel.receipt();assert.equal(panel.pending,null);assert.equal(calls.length,1);assert.equal(panel.record.estado,"REVOCADO");
});
test("doble clic no duplica y cerrar sesión limpia valores e ignora una respuesta tardía",async()=>{
  const wait=late();const {panel,host,calls}=setup({revokeEditorialFile:async()=>{calls.push(1);return wait.promise;}});
  await select(panel);draft(panel);const description=panel.description;
  const sending=panel.revoke();await panel.revoke();assert.equal(calls.length,1);
  panel.close(true);assert.equal(description.value,"");wait.resolve(receipt());await sending;
  assert.equal(host.children.length,0);assert.equal(panel.record,null);assert.equal(panel.pending,null);
  panel.open();assert.equal(panel.description,null);assert.equal(panel.reference.value,"");
});
test("consulta tardía y cambio de referencia no permiten revocar otra imagen por accidente",async()=>{
  const wait=late();const {panel,host}=setup({editorialFile:()=>wait.promise});panel.reference.value=id;
  const loading=panel.lookup();panel.close(true);wait.resolve(row());await loading;assert.equal(host.children.length,0);
  const ready=setup();await select(ready.panel);draft(ready.panel);ready.panel.reference.value=operation;
  await ready.panel.revoke();assert.equal(ready.calls.length,0);
});
test("imagen ya revocada permite cerrar una comprobación incierta sin fingir recibo propio",async()=>{
  let revoked=false;const {panel}=setup({editorialFile:async()=>({...row(),estado:revoked?"REVOCADO":"DISPONIBLE"}),
    revokeEditorialFile:async()=>{throw Error("red");}});
  await select(panel);draft(panel);await panel.revoke();revoked=true;await panel.lookup();assert.ok(panel.pending);
  panel.finishButton.onclick();assert.equal(panel.pending,null);assert.equal(panel.record.estado,"REVOCADO");
  assert.equal(panel.result.children.length,0);
});
test("demo no consulta ni revoca; una validación 400 permite corregir sin perder el motivo",async()=>{
  const demo=setup({demo:true,editorialFile:async()=>{throw Error("No consultar");}});await select(demo.panel);assert.equal(demo.panel.record,null);
  const {panel}=setup({revokeEditorialFile:async()=>{throw Object.assign(Error("Corrige el motivo"),{status:400});}});
  await select(panel);draft(panel);await panel.revoke();assert.equal(panel.pending,null);assert.equal(panel.description.value,fields.detalle);
});
test("API usa JWT, POST/GET privados y cuerpo exacto; no transporta cookies ni motivos en la URL",async()=>{
  const calls=[];const json=(body)=>new Response(JSON.stringify(body),{headers:{"Content-Type":"application/json"}});
  const api=new CatalogApi("https://api.example",{fetcher:async(url,options)=>{
    if(url.endsWith('/auth/login'))return json({accessToken:"synthetic"});
    if(url.endsWith('/auth/perfil'))return json({rol:"ADMIN",debeCambiarContrasena:false});
    calls.push({url,options});return json(receipt());
  }});
  await api.login("admin@example.invalid","fixture");
  await api.revokeEditorialFile(id,operation,fields);await api.editorialRevocationReceipt(id,operation);
  assert.equal(calls[0].url,`https://api.example/admin/archivos/${id}/revocaciones`);
  assert.deepEqual(JSON.parse(calls[0].options.body),{operacionId:operation,...fields});
  assert.equal(calls[1].options.method,"GET");assert.equal(calls[0].options.headers.Authorization,"Bearer synthetic");
  assert.equal(calls[0].options.credentials,"omit");assert.equal(calls[0].options.redirect,"error");
  assert.ok(calls.every(c=>!c.url.includes(fields.detalle)));
  api.logout();await assert.rejects(api.revokeEditorialFile(id,operation,fields));
});
