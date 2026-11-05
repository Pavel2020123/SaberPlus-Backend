import test from 'node:test';
import assert from 'node:assert/strict';
import { CatalogApi } from '../public/api.mjs';
import { evidenceBlob, evidenceList, evidencePath, evidenceReceipt, evidenceLimit } from '../public/private-evidence-fields.mjs';
import { InstitutionEvidence } from '../public/institution-evidence.mjs';
import { createAdminServer } from '../server.mjs';
const request = 'd9ac5e51-de18-46ce-b596-b62a97d1ac91';
const id = 'e902e956-dbb5-4c91-ae4f-425ee6bc7db8';
const operation = '3bfc090f-9aa3-45ad-9f20-23dad1b41475';
const pdf = '%PDF-1.7\n%%EOF';
const file = (extra = {}) => ({ id, operacionId: operation, estado: 'ACTIVO', revision: 2,
  mime: 'application/pdf', bytes: pdf.length, disponible: true, limpiezaPendiente: false,
  contenido: evidencePath(request, id), venceEn: null, ...extra });
const list = (extra = {}) => ({ revision: 2, puedeAdjuntar: false, adjuntos: [file()], ...extra });
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
async function api(fetcher, options = {}) {
  const client = new CatalogApi('/api', { privateFiles: true, fetcher: async (url, init) => {
    if (url.endsWith('/auth/login')) return json({ accessToken: 'synthetic-token' });
    if (url.endsWith('/auth/perfil')) return json({ rol: 'ADMIN', debeCambiarContrasena: false });
    return fetcher(url, init);
  }, ...options });
  await client.login('fixture@example.invalid', 'synthetic');
  return client;
}
test('private metadata rejects foreign paths, malformed identities, overflow and inconsistent state', () => {
  assert.equal(evidenceReceipt(file(), request).id, id);
  assert.equal(evidenceReceipt(file({ privateName: 'do not propagate' }), request).privateName, undefined);
  for (const change of [{ id: 'bad' }, { disponible: false }, { estado: 'RETIRADO' },
    { contenido: 'https://example.invalid/private.pdf' }, { bytes: evidenceLimit + 1 },
    { mime: 'text/html' }, { revision: 0 }, { venceEn: 'tomorrow' }, { limpiezaPendiente: true }])
    assert.throws(() => evidenceReceipt(file(change), request));
  assert.throws(() => evidenceList(list({ adjuntos: [file(), file()] }), request));
  assert.throws(() => evidenceList(list({ revision: 3 }), request));
  assert.throws(() => evidencePath('not-a-request', id));
});
test('private attachment bytes are streamed, bounded, typed and length checked', async () => {
  assert.equal((await evidenceBlob(new Response(pdf, { headers: { 'content-type': 'application/pdf' } }))).size, pdf.length);
  for (const response of [new Response('<script>', { headers: { 'content-type': 'text/html' } }),
    new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-length': '1' } }),
    new Response(pdf, { headers: { 'content-type': 'application/pdf', 'content-length': String(evidenceLimit + 1) } }),
    new Response(new Uint8Array(evidenceLimit + 1), { headers: { 'content-type': 'image/webp' } })])
    await assert.rejects(evidenceBlob(response));
});
test('private API is opt-in, read-only and sends no bearer in paths', async () => {
  const calls = [];
  const client = await api(async (url, options) => {
    calls.push([url, options]);
    return url.endsWith(id) ? new Response(pdf, { headers: { 'content-type': 'application/pdf' } }) : json(list());
  });
  assert.equal((await client.institutionVerificationFiles(request)).adjuntos.length, 1);
  assert.equal((await client.institutionVerificationFileContent(request, file())).size, pdf.length);
  assert.deepEqual(calls.map(([url]) => url), [`/api${evidencePath(request)}`, `/api${evidencePath(request, id)}`]);
  for (const [url, options] of calls) {
    assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store');
    assert.equal(options.credentials, 'omit'); assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    assert.doesNotMatch(url, /synthetic-token/);
  }
  const off = await api(() => { throw new Error('must not fetch'); }, { privateFiles: false });
  await assert.rejects(off.institutionVerificationFiles(request));
});
test('scope denial keeps session; logout discards late private bytes', async () => {
  const denied = await api(() => json({ message: 'Out of scope' }, 403));
  await assert.rejects(denied.institutionVerificationFiles(request));
  assert.equal(denied.authenticated, true);
  let resolve;
  const client = await api(() => new Promise(r => { resolve = r; }));
  const pending = client.institutionVerificationFileContent(request, file());
  client.logout(); resolve(new Response(pdf, { headers: { 'content-type': 'application/pdf' } }));
  await assert.rejects(pending);
});
test('academic student evidence keeps its separate original route', async () => {
  let path;
  const client = await api(url => { path = url; return json({ academic: true }); });
  assert.deepEqual(await client.institutionEvidence(id), { academic: true });
  assert.equal(path, `/api/instituciones/me/estudiantes/${id}/evidencia`);
});
test('panel private feature refuses remote API and demo, stays off by default', async t => {
  assert.throws(() => createAdminServer({ apiBase: 'https://api.example.invalid', privateFiles: true }));
  assert.throws(() => createAdminServer({ demo: true, privateFiles: true }));
  for (const privateFiles of [false, true]) {
    const server = createAdminServer({ apiBase: 'http://127.0.0.1:43187', privateFiles });
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    t.after(() => new Promise(r => { server.close(r); server.closeAllConnections(); }));
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.match(await (await fetch(`${base}/config.js`)).text(), new RegExp(`"privateFiles":${privateFiles}`));
    assert.equal((await fetch(`${base}/institution-evidence.mjs`)).status, 200);
    assert.equal((await fetch(`${base}/private-evidence-fields.mjs`)).status, 200);
  }
});

class Element {
  constructor(tag) { this.tag = tag; this.children = []; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute() {}
  focus() { this.focused = true; }
  set innerHTML(_) { throw new Error('Never embed private evidence as HTML'); }
}
const flatten = el => [el, ...el.children.flatMap(flatten)];
function ui(overrides = {}) {
  const host = new Element('section'), created = [], revoked = [];
  const widget = new InstitutionEvidence({ host, request: { id: request, revision: 2 },
    api: { institutionVerificationFiles: async () => list(), institutionVerificationFileContent: async () => new Blob([pdf], { type: 'application/pdf' }) },
    doc: { createElement: tag => new Element(tag) }, confirm: () => true,
    urls: { createObjectURL: blob => { created.push(blob); return 'blob:synthetic'; }, revokeObjectURL: url => revoked.push(url) }, ...overrides });
  return { host, widget, created, revoked, prepare: () => flatten(host).find(n => n.tag === 'button' && n.textContent.startsWith('Preparar')) };
}
test('ADMIN shows private warning and requires confirmation, no PDF embed or automatic download', async () => {
  const h = ui(); await h.widget.open();
  assert.equal(h.created.length, 0);
  assert.ok(flatten(h.host).some(n => n.textContent.includes('antivirus')));
  await h.prepare().onclick();
  const anchor = flatten(h.host).find(n => n.tag === 'a');
  assert.equal(anchor.download, 'documento-1.pdf'); assert.equal(anchor.href, 'blob:synthetic');
  assert.equal(anchor.focused, true);
  assert.ok(!flatten(h.host).some(n => ['iframe', 'embed', 'object', 'img'].includes(n.tag)));
  h.widget.close(); assert.deepEqual(h.revoked, ['blob:synthetic']); assert.equal(h.host.children.length, 0);
});
test('cancel download consent does not fetch and failure permits explicit retry', async () => {
  const h = ui({ confirm: () => false }); await h.widget.open(); await h.prepare().onclick();
  assert.equal(h.created.length, 0);
  h.widget.confirm = () => true;
  h.widget.api.institutionVerificationFileContent = async () => { throw new Error('No longer available'); };
  await h.prepare().onclick();
  assert.equal(h.prepare().disabled, false);
  assert.ok(flatten(h.host).some(n => n.textContent.includes('Actualiza los adjuntos')));
});
test('closing list or download suppresses late response and never creates a blob URL', async () => {
  for (const phase of ['list', 'download']) {
    let resolve;
    const h = ui();
    if (phase === 'list') h.widget.api.institutionVerificationFiles = () => new Promise(r => { resolve = r; });
    else h.widget.api.institutionVerificationFileContent = () => new Promise(r => { resolve = r; });
    const pending = phase === 'list' ? h.widget.open() : (await h.widget.open(), h.prepare().onclick());
    h.widget.close(); resolve(phase === 'list' ? list() : new Blob([pdf])); await pending;
    assert.equal(h.host.children.length, 0); assert.equal(h.created.length, 0);
  }
});
test('refresh discards prepared bytes and warns if approval revision became stale', async () => {
  const h = ui(); await h.widget.open(); await h.prepare().onclick();
  h.widget.api.institutionVerificationFiles = async () => list({ revision: 3 });
  await h.widget.open();
  assert.deepEqual(h.revoked, ['blob:synthetic']);
  assert.ok(flatten(h.host).some(n => n.textContent.includes('La solicitud cambió')));
});
