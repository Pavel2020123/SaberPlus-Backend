export const reportReasons = {
  ENUNCIADO_CONFUSO: 'Enunciado confuso', RESPUESTA_INCORRECTA: 'Respuesta incorrecta',
  EXPLICACION_INCORRECTA: 'Explicación incorrecta', IMAGEN_NO_CARGA: 'La imagen no carga', OTRO: 'Otro problema',
};
export const reportStates = { PENDIENTE: 'Pendiente', EN_REVISION: 'En revisión', RESUELTO: 'Resuelto', DESCARTADO: 'Descartado' };
export const reportAreas = ['LECTURA_CRITICA', 'MATEMATICAS', 'SOCIALES_CIUDADANAS', 'CIENCIAS_NATURALES', 'INGLES'];
export const reportTransitions = { PENDIENTE: ['EN_REVISION'], EN_REVISION: ['RESUELTO', 'DESCARTADO'], RESUELTO: ['EN_REVISION'], DESCARTADO: ['EN_REVISION'] };
export const reportUuid = v => typeof v === 'string' && /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
const id = v => typeof v === 'string' && v.length > 0 && v.length <= 120 && !/\s/u.test(v);
const count = v => Number.isSafeInteger(v) && v >= 0 && v <= 2147483647;
const valid = (condition, message = 'Respuesta de reportes inválida. Consulta de nuevo.') => { if (!condition) throw new Error(message); };
export function reportText(value) {
  valid(typeof value === 'string', 'Escribe el motivo de la decisión.');
  const text = value.trim();
  valid(text.length > 0 && [...text].length <= 500 &&
    ![...text].some(c => /^[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ud800-\udfff]$/u.test(c)),
    'Escribe un motivo válido de 1 a 500 caracteres.');
  return text;
}
export function reportRow(row, { admin = false, detail = false } = {}) {
  valid(row && reportUuid(row.id) && id(row.preguntaId) && Object.hasOwn(reportReasons, row.motivo) &&
    Object.hasOwn(reportStates, row.estado) && count(row.revision) &&
    (row.detalle === null || (typeof row.detalle === 'string' && [...row.detalle].length <= 500)) &&
    typeof row.fechaCreacion === 'string' && Number.isFinite(Date.parse(row.fechaCreacion)) &&
    typeof row.fechaActualizacion === 'string' && Number.isFinite(Date.parse(row.fechaActualizacion)) &&
    Date.parse(row.fechaActualizacion) >= Date.parse(row.fechaCreacion));
  if (admin) valid(reportAreas.includes(row.area) && id(row.subtemaId));
  if (detail) valid(row.snapshot && typeof row.snapshot === 'object' && !Array.isArray(row.snapshot) &&
    Array.isArray(row.auditoria) && row.auditoria.every(a => a && count(a.revision) && Object.hasOwn(reportStates, a.estadoNuevo)));
  return row;
}
export function reportPage(data, page, filters = {}) {
  valid(data && data.pagina === page && data.limite === 20 && typeof data.hayMas === 'boolean' &&
    Array.isArray(data.items) && data.items.length <= 20 && (!data.hayMas || data.items.length === 20) &&
    new Set(data.items.map(r => r?.id)).size === data.items.length);
  data.items.forEach(row => {
    reportRow(row, { admin: true });
    for (const [key, value] of Object.entries(filters)) if (value) valid(row[key] === value);
  });
  return data;
}
export function reportQuery(filters = {}, page = 1) {
  valid(Number.isInteger(page) && page >= 1 && page <= 10000);
  valid(filters && typeof filters === 'object' && !Array.isArray(filters));
  valid(Object.keys(filters).every(k => ['area', 'subtemaId', 'estado', 'motivo'].includes(k)));
  const absent = value => value === undefined || value === '';
  valid(absent(filters.area) || reportAreas.includes(filters.area));
  valid(absent(filters.subtemaId) || id(filters.subtemaId));
  valid(absent(filters.estado) || (typeof filters.estado === 'string' && Object.hasOwn(reportStates, filters.estado)));
  valid(absent(filters.motivo) || (typeof filters.motivo === 'string' && Object.hasOwn(reportReasons, filters.motivo)));
  return new URLSearchParams({ pagina: String(page), limite: '20',
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined)) });
}
export function reportDecision(body) {
  valid(body && reportUuid(body.operacionId) && count(body.revision) && body.revision < 2147483647 &&
    Object.hasOwn(reportStates, body.destino), 'Decisión inválida. Consulta el reporte antes de continuar.');
  return { operacionId: body.operacionId, revision: body.revision, destino: body.destino,
    motivoRevision: reportText(body.motivoRevision) };
}
