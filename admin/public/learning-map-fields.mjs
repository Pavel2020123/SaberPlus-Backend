export const mapId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
const states = ['BORRADOR','EN_REVISION','PUBLICADO','ARCHIVADO'];
export function mapChange(value) {
  if (!value || Object.keys(value).some(k=>!['revision','previos'].includes(k)) || !Number.isInteger(value.revision) || value.revision < 0 || value.revision > 2147483646 || !Array.isArray(value.previos) || value.previos.length > 8 || value.previos.some(id=>!mapId(id)) || new Set(value.previos).size !== value.previos.length) throw Error('Selección de bases inválida.');
  return {revision:value.revision,previos:[...value.previos]};
}
export function mapDetail(value, target, area) {
  const ref = n => n && mapId(n.id) && mapId(n.temaId) && typeof n.nombre === 'string' && typeof n.tema === 'string';
  const item = n => ref(n) && states.includes(n.estado) && states.includes(n.estadoTema) && n.disponible === (n.estado==='PUBLICADO' && n.estadoTema==='PUBLICADO');
  if (!value || value.versionContrato!==1 || value.orientativo!==true || value.area!==area || !Number.isInteger(value.revision) || value.revision<0 || !ref(value.subtema) || value.subtema.id!==target || !Array.isArray(value.previos) || value.previos.length>8 || !Array.isArray(value.recorrido) || value.recorrido.length>5000) throw Error('Respuesta del mapa inválida.');
  for(const list of [value.previos,value.recorrido]) if(list.some(n=>!item(n)||n.id===target) || new Set(list.map(n=>n.id)).size!==list.length) throw Error('Referencias del mapa inválidas.');
  if(value.previos.some(n=>!value.recorrido.some(r=>r.id===n.id))) throw Error('Recorrido incompleto.');
  return value;
}
