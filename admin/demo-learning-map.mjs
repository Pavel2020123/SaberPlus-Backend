import { mapChange, mapId } from './public/learning-map-fields.mjs';

export function createDemoLearningMap({themes,subthemes,send}) {
  const graphs = new Map();
  const node = id => { const sub=subthemes.find(s=>s.id===id); const theme=themes.find(t=>t.id===sub?.temaId); return sub && theme ? {...sub,theme}:null; };
  const published = n => n.estadoContenido==='PUBLICADO' && n.theme.estadoContenido==='PUBLICADO';
  const project = n => ({id:n.id,nombre:n.nombre,temaId:n.theme.id,tema:n.theme.nombre,estado:n.estadoContenido,estadoTema:n.theme.estadoContenido,disponible:published(n)});
  function order(edges) {
    if(edges.length>5000) throw Error('Límite de relaciones.');
    const degree=new Map(), next=new Map(), seen=new Set();
    for(const [a,b] of edges) {
      const key=JSON.stringify([a,b]); if(a===b || seen.has(key)) throw Error('Relación inválida.'); seen.add(key);
      degree.set(a,degree.get(a)??0); degree.set(b,(degree.get(b)??0)+1);
      if(degree.get(b)>8) throw Error('Máximo ocho bases.');
      next.set(a,[...(next.get(a)??[]),b]);
    }
    const queue=[...degree.keys()].filter(id=>degree.get(id)===0).sort();
    for(let i=0;i<queue.length;i++) for(const id of (next.get(queue[i])??[]).sort()) {degree.set(id,degree.get(id)-1);if(degree.get(id)===0) queue.push(id);}
    if(queue.length!==degree.size) throw Error('La relación crearía un ciclo.');
    return queue;
  }
  return (req,res,url,body) => {
    const match=/^\/api\/admin\/mapa-aprendizaje\/subtemas\/([^/]+)$/.exec(url.pathname);
    if(!match) return false;
    const id=match[1], target=node(id);
    if(!mapId(id)) {send(res,400,{});return true;}
    if(!target) {send(res,404,{});return true;}
    if(!['GET','PUT'].includes(req.method)) {send(res,405,{});return true;}
    const area=target.theme.area;
    const state=graphs.get(area)??{revision:0,edges:[]};
    // Equivalent to FK cleanup if demo catalog deleted a node.
    let edges=state.edges.filter(([a,b])=>node(a)&&node(b));
    if(req.method==='PUT') {
      try { mapChange(body); } catch {send(res,400,{});return true;}
      if(body.revision!==state.revision) {send(res,409,{});return true;}
      try {
        if(body.previos.length && (!published(target) || body.previos.some(id=>!node(id)||node(id).theme.area!==area||!published(node(id))))) throw Error('Solo bases publicadas de la misma área.');
        const updated=[...edges.filter(([,b])=>b!==id),...body.previos.map(a=>[a,id])];
        order(updated);
        const old=edges.filter(([,b])=>b===id).map(([a])=>a).sort();
        if(JSON.stringify(old)!==JSON.stringify([...body.previos].sort())) {state.revision++;edges=updated;}
        state.edges=edges;graphs.set(area,state);
      } catch(error) {send(res,400,{message:error.message});return true;}
    }
    const ancestors=new Set(), pending=edges.filter(([,b])=>b===id).map(([a])=>a);
    while(pending.length) {const n=pending.pop();if(ancestors.has(n))continue;ancestors.add(n);pending.push(...edges.filter(([,b])=>b===n).map(([a])=>a));}
    send(res,200,{versionContrato:1,area,revision:state.revision,orientativo:true,
      subtema:{id,nombre:target.nombre,temaId:target.theme.id,tema:target.theme.nombre},
      previos:edges.filter(([,b])=>b===id).sort().map(([a])=>project(node(a))),
      recorrido:order(edges).filter(n=>ancestors.has(n)).map(n=>project(node(n)))});
    return true;
  };
}
