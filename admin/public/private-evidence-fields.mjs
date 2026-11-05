import { fileUuid } from './editorial-file-fields.mjs';

export const evidenceLimit = 5242880;
const invalid = () => new Error('No pudimos validar los adjuntos privados. Actualiza la solicitud.');
export const evidencePath = (request, id = '') => {
  if (!fileUuid(request) || (id && !fileUuid(id))) throw invalid();
  return `/cuenta/archivos/evidencias/${request}${id ? `/${id}` : ''}`;
};
const revision = value => Number.isInteger(value) && value >= 1 && value <= 2147483647;

export function evidenceReceipt(row, request, operation) {
  const path = evidencePath(request, row?.id);
  if (!fileUuid(row?.id) || !fileUuid(row.operacionId) ||
      (operation && row.operacionId !== operation) || !revision(row.revision) ||
      !['PREPARADO', 'ACTIVO', 'RETIRADO'].includes(row.estado) ||
      !['image/webp', 'application/pdf'].includes(row.mime) ||
      !Number.isInteger(row.bytes) || row.bytes < 1 || row.bytes > evidenceLimit ||
      typeof row.disponible !== 'boolean' || typeof row.limpiezaPendiente !== 'boolean' ||
      (row.limpiezaPendiente && row.estado !== 'RETIRADO') ||
      (row.disponible && (row.estado !== 'ACTIVO' || row.contenido !== path)) ||
      (!row.disponible && row.contenido !== null) ||
      (row.venceEn !== null && (typeof row.venceEn !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(row.venceEn) ||
        !Number.isFinite(Date.parse(row.venceEn))))) throw invalid();
  // Do not propagate unknown owner/hash/name/URL fields into the UI.
  return Object.fromEntries(['id', 'operacionId', 'revision', 'estado', 'mime', 'bytes',
    'disponible', 'limpiezaPendiente', 'contenido', 'venceEn'].map(key => [key, row[key]]));
}

export function evidenceList(data, request) {
  evidencePath(request);
  if (!revision(data?.revision) || typeof data.puedeAdjuntar !== 'boolean' ||
      !Array.isArray(data.adjuntos) || data.adjuntos.length > 3) throw invalid();
  const files = data.adjuntos.map(row => evidenceReceipt(row, request));
  if (files.some(file => !file.disponible || file.revision !== data.revision) ||
      new Set(files.map(file => file.id)).size !== files.length) throw invalid();
  return { revision: data.revision, puedeAdjuntar: data.puedeAdjuntar, adjuntos: files };
}

/** Bounded streamed admission; PDF remains an untrusted downloadable attachment. */
export async function evidenceBlob(response) {
  const mime = (response.headers.get('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!['image/webp', 'application/pdf'].includes(mime)) throw invalid();
  const declared = response.headers.get('Content-Length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > evidenceLimit)) throw invalid();
  const reader = response.body?.getReader();
  if (!reader) throw invalid();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > evidenceLimit) throw invalid();
      chunks.push(value);
    }
    if (!size || (declared !== null && size !== Number(declared))) throw invalid();
    return new Blob(chunks, { type: mime });
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}
