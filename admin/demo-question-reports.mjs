import { reportDecision, reportTransitions, reportQuery } from './public/question-report-fields.mjs';

// ADMIN-only fixtures, not student evidence or an integration with PostgreSQL.
export function createDemoQuestionReports({ send, question, area, subtemaId }) {
  const created = '2026-10-17T12:00:00.000Z';
  const rows = question ? [{
    id: 'a1111111-1111-4111-8111-111111111111', preguntaId: question.id,
    motivo: 'ENUNCIADO_CONFUSO', detalle: 'Ejemplo de demostración: revisar la redacción.',
    estado: 'PENDIENTE', revision: 0, fechaCreacion: created, fechaActualizacion: created,
    area, subtemaId, snapshot: { version: 1, tipo: 'CAPTURA_SERVIDOR_RECEPCION', historicoExacto: false,
      contenidoOmitido: false, pregunta: structuredClone(question) },
    auditoria: [{ revision: 0, estadoAnterior: null, estadoNuevo: 'PENDIENTE', actorId: null, motivoRevision: null, fechaCreacion: created }],
  }] : [];
  const receipts = new Map();
  const publicView = row => Object.fromEntries(Object.entries(row).filter(([key]) => !['snapshot', 'auditoria'].includes(key)));
  const route = (req, res, url, body, actor) => {
    const path = url.pathname.replace(/^\/api(?=\/)/, '');
    if (!path.startsWith('/admin/reportes-preguntas')) return false;
    res.setHeader('Cache-Control', 'private, no-store');
    try {
      if (path === '/admin/reportes-preguntas' && req.method === 'GET') {
        const keys = ['area', 'subtemaId', 'estado', 'motivo'];
        if ([...url.searchParams.keys()].some(k => ![...keys, 'pagina', 'limite'].includes(k)) ||
            (url.searchParams.has('limite') && url.searchParams.get('limite') !== '20')) throw Error();
        const filters = Object.fromEntries(keys.filter(k => url.searchParams.has(k)).map(k => [k, url.searchParams.get(k)]));
        const page = Number(url.searchParams.get('pagina') ?? 1); reportQuery(filters, page);
        const filtered = rows.filter(row => Object.entries(filters).every(([key, value]) => !value || row[key] === value))
          .sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion) || a.id.localeCompare(b.id));
        send(res, 200, { items: filtered.slice((page - 1) * 20, page * 20).map(publicView), pagina: page, limite: 20, hayMas: filtered.length > page * 20 }); return true;
      }
      const match = /^\/admin\/reportes-preguntas\/([^/]+)(\/estado)?$/.exec(path);
      const row = rows.find(r => r.id === match?.[1]);
      if (!row) { send(res, 404, {}); return true; }
      if (!match[2] && req.method === 'GET') { send(res, 200, row); return true; }
      if (match[2] && req.method === 'PATCH') {
        if (Object.keys(body).some(k => !['operacionId', 'revision', 'destino', 'motivoRevision'].includes(k))) throw Error();
        const payload = reportDecision(body), key = payload.operacionId.toLowerCase();
        const signature = JSON.stringify([row.id, payload.revision, payload.destino, payload.motivoRevision]);
        const old = receipts.get(key);
        if (old) {
          if (old.actor !== actor) send(res, 404, {});
          else send(res, old.signature === signature ? 200 : 409, old.signature === signature ? old.receipt : {});
          return true;
        }
        if (row.revision !== payload.revision || !reportTransitions[row.estado].includes(payload.destino)) { send(res, 409, {}); return true; }
        const previous = row.estado;
        row.estado = payload.destino; row.revision++; row.fechaActualizacion = new Date().toISOString();
        row.auditoria.push({ revision: row.revision, estadoAnterior: previous, estadoNuevo: row.estado,
          actorId: 'demo-admin', motivoRevision: payload.motivoRevision, fechaCreacion: row.fechaActualizacion });
        const receipt = structuredClone(publicView(row));
        receipts.set(key, { actor, signature, receipt }); send(res, 200, receipt); return true;
      }
      send(res, 405, {});
    } catch { send(res, 400, {}); }
    return true;
  };
  return { route, rows };
}
