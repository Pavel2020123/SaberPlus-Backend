// Bounded local-only workloads, synthetic identities, no production URL accepted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fork, execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { ownedOperationMarker } from './editorial_file_operations.mjs';
import { withOwnedSupabase } from './test_editorial_supabase.mjs';
import { summarize } from './pilot_capacity_local.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let phase = 'ownership';
const announce = (name, extra = {}) => { phase = name; console.log(JSON.stringify({ phase: name, ...extra })); };

async function main() {
  const socketsOnly = process.argv.length === 4 && process.argv[3] === '--sockets';
  const edgesOnly = process.argv.length === 4 && process.argv[3] === '--edges';
  if (process.argv.length !== 3 && !socketsOnly && !edgesOnly) throw Error('Owned I2 marker required');
  const owner = await ownedOperationMarker(process.argv[2]);
  assert.equal(owner.marker.purpose, 'saberplus-competitive-disposable-v1');
  const safe = /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => safe.test(key)));
  const docker = (...args) => execFileSync('docker', args, { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const context = docker('context', 'show');
  const endpoint = docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}');
  assert.ok(endpoint.startsWith('npipe:////./pipe/') || endpoint.startsWith('unix:///'));
  const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', owner.container));
  assert.equal(labels[owner.marker.purpose], owner.marker.nonce);
  const config = JSON.parse(await readFile(join(owner.directory, 'flutter-private.json'), 'utf8'));
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: owner.marker.url } } });
  const runId = randomUUID();
  const accounts = [], catalog = [], correct = new Map();
  const samples = [], reports = [], sockets = [];
  let worker, base, workerResources = [], queryCount = 0;
  const resources = () => ({ samples: workerResources.length,
    peakRssMiB: Math.round(Math.max(0, ...workerResources.map((r) => r.rssMiB))),
    peakHeapMiB: Math.round(Math.max(0, ...workerResources.map((r) => r.heapMiB))),
    peakCpuOneCorePct: Math.round(Math.max(0, ...workerResources.map((r) => r.cpuOneCorePct))),
    peakDbConnections: Math.max(0, ...workerResources.map((r) => r.dbTotal ?? 0)),
    peakDbActiveExceptSampler: Math.max(0, ...workerResources.map((r) => r.dbActive ?? 0)),
    peakDbWaiting: Math.max(0, ...workerResources.map((r) => r.dbWaiting ?? 0)),
    dbSampleFailures: workerResources.filter((r) => r.dbSampleFailed).length });
  async function request(kind, token, path, { method = 'GET', body, binary = false, expected } = {}) {
    if (++queryCount > 9000) throw Error('Request budget exceeded');
    const start = performance.now();
    let response, data, bytes = 0, recorded = false;
    try {
      response = await fetch(`${base}${path}`, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: body instanceof FormData ? body : JSON.stringify(body) } : {}) });
      const raw = Buffer.from(await response.arrayBuffer()); bytes = raw.length;
      if (binary) data = raw;
      else {
        try { data = JSON.parse(raw.toString('utf8')); }
        catch { if (response.status === 429) data = null; else throw Error('Unexpected non-JSON response'); }
      }
      const wanted = expected ?? (method === 'POST' ? 201 : 200);
      samples.push({ kind, ok: response.status === wanted, status: response.status, ms: performance.now() - start, bytes });
      recorded = true;
      if (response.status !== wanted) throw Error(`HTTP_${response.status}_${kind}`);
      return data;
    } catch (error) {
      if (!recorded) samples.push({ kind, ok: false, status: response?.status ?? 0, ms: performance.now() - start, bytes });
      throw error;
    }
  }
  function report(name, from, elapsed, extra = {}) {
    const selected = samples.slice(from);
    const output = { phase: 'result', scenario: name, ...summarize(selected), elapsedMs: Math.round(elapsed),
      rps: Number((selected.length / (elapsed / 1000)).toFixed(2)), bytes: selected.reduce((n, s) => n + s.bytes, 0),
      kinds: [...new Set(selected.map((s) => s.kind))].map((kind) => ({ kind, ...summarize(selected.filter((s) => s.kind === kind)) })),
      resources: resources(), ...extra };
    reports.push(output); console.log(JSON.stringify(output));
  }
  async function stopWorker() {
    if (!worker || worker.exitCode !== null) return;
    const current = worker;
    const exited = new Promise((resolve) => current.once('exit', resolve));
    current.send('stop');
    await Promise.race([exited, delay(10000)]);
    if (current.exitCode === null) { current.kill(); await Promise.race([exited, delay(3000)]); }
    assert.notEqual(current.exitCode, null, 'Owned worker failed to stop');
  }
  async function startWorker(storage) {
    await stopWorker(); workerResources = [];
    const childEnv = { ...env, NODE_ENV: 'test', DATABASE_URL: owner.marker.url, DIRECT_URL: owner.marker.url,
      COMPETITIVE_TEST_OWNER: process.argv[2], JWT_SECRET: randomBytes(32).toString('hex'), RANKING_ALIAS_SECRET: randomBytes(32).toString('hex'),
      SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', EDITORIAL_PUBLICATION_ENABLED: 'true',
      EDITORIAL_FILES_LOCAL_ENABLED: 'true', EDITORIAL_HISTORY_IMAGES_LOCAL_ENABLED: 'true',
      EDITORIAL_OPTION_IMAGES_LOCAL_ENABLED: 'true', EDITORIAL_SOLO_SNAPSHOT_IMAGES_LOCAL_ENABLED: 'true',
      EDITORIAL_TRIVIA_SNAPSHOT_IMAGES_LOCAL_ENABLED: 'true',
      EDITORIAL_FILE_PROVIDER: 'supabase', EDITORIAL_SUPABASE_STORAGE_URL: storage.url,
      EDITORIAL_SUPABASE_BUCKET: storage.bucket, EDITORIAL_SUPABASE_SERVICE_KEY: storage.serviceKey };
    worker = fork(new URL('./pilot_capacity_worker.cjs', import.meta.url), [], { cwd: owner.directory,
      env: childEnv, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    worker.stdout.resume(); worker.stderr.resume();
    worker.on('message', (m) => { if (m?.type === 'resources') workerResources.push(m); });
    base = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Worker startup timeout')), 45000);
      worker.once('exit', () => { clearTimeout(timer); reject(Error('Worker startup exited')); });
      worker.on('message', (m) => {
        if (m?.type === 'ready') { clearTimeout(timer); resolve(m.base); }
        if (m?.type === 'failed') { clearTimeout(timer); reject(Error('Worker startup failed')); }
      });
    });
    assert.match(base, /^http:\/\/127\.0\.0\.1:\d+$/);
  }
  const tokens = [];
  async function login(accountsToUse, concurrency) {
    let cursor = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (cursor < accountsToUse.length) {
        const index = cursor++, account = accountsToUse[index];
        const result = await request('login', null, '/auth/login', { method: 'POST', body: { correo: account.correo, contrasena: config.AUTH_E2E_PASSWORD } });
        assert.equal(result.usuario.id, account.id); tokens[index] = result.accessToken;
      }
    }));
  }
  try {
    announce('fixtures');
    const source = await db.usuario.findUniqueOrThrow({ where: { correo: 'student@example.invalid' } });
    for (let i = 0; i < 75; i++) accounts.push(await db.usuario.create({ data: { correo: `pilot-${runId}-${i}@example.invalid`,
      nombre: 'Synthetic capacity student', rol: 'ESTUDIANTE', correoVerificado: true, contrasenaHash: source.contrasenaHash } }));
    for (const area of ['MATEMATICAS', 'LECTURA_CRITICA', 'SOCIALES_CIUDADANAS', 'CIENCIAS_NATURALES', 'INGLES']) {
      const tema = await db.tema.create({ data: { nombre: `Capacity ${runId}`, area, estadoContenido: 'PUBLICADO' } });
      const sub = await db.subtema.create({ data: { nombre: 'Synthetic capacity', temaId: tema.id, contenido: 'Synthetic lesson', estadoContenido: 'PUBLICADO' } });
      catalog.push({ area, tema, sub });
      for (let n = 0; n < 12; n++) {
        const q = await db.pregunta.create({ data: { subtemaId: sub.id, enunciado: `Synthetic ${n}`, explicacion: 'Synthetic correct option',
          dificultad: 'BASICO', estadoContenido: 'PUBLICADO', respuestas: { create: [{ texto: 'yes', esCorrecta: true }, { texto: 'no', esCorrecta: false }, { texto: 'other', esCorrecta: false }, { texto: 'neither', esCorrecta: false }] } }, include: { respuestas: true } });
        correct.set(q.id, q.respuestas.find((r) => r.esCorrecta).id);
      }
    }
    // Existing unrelated synthetic questions can also be selected by diagnostic/trivia.
    for (const q of await db.pregunta.findMany({ include: { respuestas: true } })) {
      const answer = q.respuestas.find((r) => r.esCorrecta); if (answer) correct.set(q.id, answer.id);
    }
    await withOwnedSupabase(async ({ config: storage }) => {
      try {
        let from, started;
        if (!socketsOnly && !edgesOnly) {
        announce('authentication-burst-75'); await startWorker(storage);
        from = samples.length; started = performance.now();
        await login(accounts, 15); report('authentication-75-in-15-lanes', from, performance.now() - started);
        const admin = await request('admin-login', null, '/auth/login', { method: 'POST', body: { correo: 'admin@example.invalid', contrasena: config.AUTH_E2E_PASSWORD } });
        const sharp = require('sharp');
        // Original synthetic noise image, representative payload rather than a tiny flat icon.
        const png = await sharp(randomBytes(640 * 360 * 3), { raw: { width: 640, height: 360, channels: 3 } }).png().toBuffer();
        const form = new FormData();
        for (const [k, v] of Object.entries({ operacionId: randomUUID(), titulo: 'Capacity synthetic image', textoAlternativo: 'Random synthetic pixels', fuente: 'Owned test', titular: 'SaberPlus local fixture', autorizacion: 'ORIGINAL' })) form.set(k, v);
        form.set('archivo', new Blob([png], { type: 'image/png' }), 'synthetic.png');
        const file = await request('image-upload', admin.accessToken, '/admin/archivos', { method: 'POST', body: form });
        assert.equal(file.estado, 'DISPONIBLE');
        // Fixture association only, no claim of exercising the panel publication UI.
        await db.pregunta.updateMany({ where: { subtemaId: catalog[0].sub.id }, data: { imagenUrl: `/recursos/editoriales/${file.id}`, archivoImagenId: file.id } });
        await db.subtema.update({ where: { id: catalog[0].sub.id }, data: { imagenUrl: `/recursos/editoriales/${file.id}`, archivoImagenId: file.id } });
        const reference = await request('image-reference', tokens[0], `/recursos/editoriales/${file.id}`, { binary: true });
        const imageHash = hash(reference);
        announce('sustained-30-two-minutes', { imageBytes: reference.length, productionLikeIpBudget: 20000, perUserBudget: 1000 });
        from = samples.length; started = performance.now();
        await Promise.all(tokens.slice(0, 30).map(async (token) => {
          for (let round = 0; round < 4; round++) {
            await request('themes', token, '/simulacros/temas?area=MATEMATICAS');
            assert.equal(hash(await request('image', token, `/recursos/editoriales/${file.id}`, { binary: true })), imageHash);
            await request('profile', token, '/auth/perfil');
            await request('ranking', token, '/ranking?limite=10');
            await delay(30000);
          }
        }));
        report('sustained-30-120s', from, performance.now() - started, { imageBytes: reference.length });
        announce('diagnostic-75');
        from = samples.length; started = performance.now();
        const diagnostics = await Promise.all(tokens.map(async (token) => {
          const state = await request('diagnostic-start', token, '/diagnostico-inicial/iniciar', { method: 'POST' });
          assert.equal(state.preguntas.length, 15);
          const body = { respuestas: state.preguntas.map((q) => ({ preguntaId: q.id, respuestaId: correct.get(q.id), tiempoRespuestaSegundos: 20 })) };
          return { token, state, body };
        }));
        await delay(1000);
        await Promise.all(diagnostics.map(async ({ token, state, body }) => {
          const result = await request('diagnostic-submit', token, '/diagnostico-inicial/finalizar', { method: 'POST', body });
          assert.equal(result.diagnosticoId, state.diagnosticoId); assert.equal(result.estado, 'COMPLETADO');
          assert.equal(result.respuestasCorrectas, 15); assert.equal(result.resultadosPorArea.length, 5);
        }));
        report('diagnostic-75-start-submit', from, performance.now() - started);
        // Exact persistence, replay and separate student histories, no double credit.
        for (const { token, body } of diagnostics.slice(0, 5)) await request('diagnostic-replay', token, '/diagnostico-inicial/finalizar', { method: 'POST', body });
        const userIds = accounts.map((a) => a.id);
        assert.equal(await db.diagnosticoInicial.count({ where: { usuarioId: { in: userIds }, completadoEn: { not: null } } }), 75);
        assert.equal(await db.historialRespuesta.count({ where: { usuarioId: { in: userIds }, origen: 'DIAGNOSTICO' } }), 1125);
        assert.equal(await db.diagnosticoResultadoArea.count({ where: { diagnostico: { usuarioId: { in: userIds } } } }), 375);
        announce('diagnostic-consistency-verified', { students: 75, answers: 1125, areaResults: 375, sequentialReplays: 5 });
        // Fresh worker isolates scenario budget and JWT; never a claim of one continuous school day.
        announce('games-and-pdf'); await startWorker(storage); tokens.length = 0; await login(accounts.slice(0, 30), 10);
        for (const route of ['salto-cima', 'guardian', 'rescate-estrellas']) {
          from = samples.length; started = performance.now();
          await Promise.all(tokens.map(async (token) => {
            let state = await request(`${route}-start`, token, `/${route}/intentos`, { method: 'POST', body: { area: 'MATEMATICAS', dificultad: 'BASICO', subtemaId: catalog[0].sub.id, competitive: false } });
            let rounds = 0, lastBody;
            while (state.estado === 'ACTIVO' && rounds++ < 12) {
              const body = { preguntaId: state.pregunta.id, respuestaId: correct.get(state.pregunta.id), idempotencyKey: randomUUID() };
              lastBody = body;
              state = await request(`${route}-answer`, token, `/${route}/intentos/${state.id}/respuestas`, { method: 'POST', body });
            }
            assert.equal(state.estado, 'VICTORIA');
            const repeated = await request(`${route}-replay`, token, `/${route}/intentos/${state.id}/respuestas`, { method: 'POST', body: lastBody });
            assert.equal(repeated.estado, 'VICTORIA');
            const replay = await request(`${route}-get`, token, `/${route}/intentos/${state.id}`); assert.equal(replay.estado, 'VICTORIA');
          }));
          const delegate = { 'salto-cima': db.intentoCima, guardian: db.intentoGuardian, 'rescate-estrellas': db.intentoRescateEstrellas }[route];
          const persisted = await delegate.findMany({ where: { usuarioId: { in: accounts.slice(0, 30).map((a) => a.id) } } });
          assert.equal(persisted.length, 30);
          for (const row of persisted) { assert.equal(row.estado, 'VICTORIA'); assert.equal(row.respuestas.length, route === 'salto-cima' ? 5 : 6); }
          report(`${route}-30`, from, performance.now() - started);
        }
        from = samples.length; started = performance.now();
        await Promise.all(tokens.slice(0, 3).map(async (token) => {
          const pdf = await request('pdf', token, `/simulacros/temas/${catalog[0].tema.id}/pdf`, { binary: true });
          assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000);
        })); report('pdf-3', from, performance.now() - started);
        }
        if (!edgesOnly) {
        announce('sockets-trivia-30'); await startWorker(storage); tokens.length = 0; await login(accounts.slice(0, 30), 10);
        const { io } = require('socket.io-client');
        from = samples.length; started = performance.now();
        const trivia = await Promise.all(tokens.map(async (token) => {
          const state = await request('trivia-start', token, '/trivia-rush/intentos', { method: 'POST', body: { modalidad: 'TRIVIA_RUSH', competitive: false, areas: ['MATEMATICAS'], duracionSegundos: 120 } });
          return { token, id: state.intento.id };
        }));
        announce('trivia-sockets-connecting', { attempts: trivia.length,
          presenceV1: await db.intentoTriviaRush.count({ where: { id: { in: trivia.map((t) => t.id) }, presenciaVersion: 1 } }) });
        async function connect({ token, id }) {
          const start = performance.now();
          const socket = io(`${base}/trivia-presence`, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false, auth: { token, attemptId: id } });
          sockets.push(socket);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { socket.disconnect(); reject(Error('Socket timeout')); }, 10000);
            const fail = () => { clearTimeout(timer); reject(Error('SOCKET_CONNECT_REFUSED')); };
            socket.once('connect_error', fail);
            socket.once('trivia:error', () => { clearTimeout(timer); reject(Error('SOCKET_PRESENCE_REFUSED')); });
            socket.once('trivia:presencia', (m) => { clearTimeout(timer); m.estado === 'ACTIVO' ? resolve() : reject(Error('SOCKET_INACTIVE')); });
            socket.connect();
          });
          samples.push({ kind: 'socket-presence', ok: true, status: 200, ms: performance.now() - start, bytes: 0 });
          return socket;
        }
        const clients = await Promise.all(trivia.map(connect));
        await delay(30000);
        for (const socket of clients.slice(0, 10)) socket.disconnect();
        await delay(1000);
        await Promise.all(trivia.slice(0, 10).map(connect));
        await delay(15000);
        assert.ok(sockets.filter((s) => s.connected).length >= 30);
        for (const { token, id } of trivia) await request('trivia-read', token, `/trivia-rush/intentos/${id}`);
        await Promise.all(trivia.map(({ token, id }) => request('trivia-abandon', token, `/trivia-rush/intentos/${id}/abandonar`, { method: 'POST' })));
        report('trivia-presence-30-reconnect-10', from, performance.now() - started);
        for (const socket of sockets) socket.disconnect();
        announce('tug-sockets-30'); from = samples.length; started = performance.now();
        const tugClients = await Promise.all(tokens.map(async (token) => {
          const at = performance.now();
          const socket = io(`${base}/tira-afloja`, { transports: ['websocket'], forceNew: true, reconnection: false, autoConnect: false, auth: { token } });
          sockets.push(socket);
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { socket.disconnect(); reject(Error('SOCKET_TUG_TIMEOUT')); }, 10000);
            socket.once('connect_error', () => { clearTimeout(timer); reject(Error('SOCKET_TUG_REFUSED')); });
            socket.once('tira:error', () => { clearTimeout(timer); reject(Error('SOCKET_TUG_REFUSED')); });
            socket.once('tira:conectado', () => { clearTimeout(timer); resolve(); });
            socket.connect();
          });
          samples.push({ kind: 'tug-connect', ok: true, status: 200, ms: performance.now() - at, bytes: 0 });
          return socket;
        }));
        const matches = [];
        for (let i = 0; i < 10; i += 2) {
          const one = await request('tug-match', tokens[i], '/tira-afloja/emparejamiento', { method: 'POST', body: { area: 'MATEMATICAS' } });
          const two = await request('tug-match', tokens[i + 1], '/tira-afloja/emparejamiento', { method: 'POST', body: { area: 'MATEMATICAS' } });
          assert.equal(one.partida.id, two.partida.id);
          await request('tug-ready', tokens[i], `/tira-afloja/${one.partida.id}/listo`, { method: 'POST' });
          const ready = await request('tug-ready', tokens[i + 1], `/tira-afloja/${one.partida.id}/listo`, { method: 'POST' });
          assert.equal(ready.partida.estado, 'ACTIVA');
          matches.push({ id: one.partida.id, token: tokens[i] });
        }
        for (let round = 0; round < 5; round++) {
          await Promise.all(tugClients.map(async (socket) => {
            const at = performance.now();
            await new Promise((resolve, reject) => socket.timeout(10000).emit('tira:latido', {}, (error, body) => {
              if (error || typeof body?.servidorAhora !== 'string') reject(Error('SOCKET_TUG_HEARTBEAT')); else resolve();
            }));
            samples.push({ kind: 'tug-heartbeat', ok: true, status: 200, ms: performance.now() - at, bytes: 0 });
          }));
          await delay(5000);
        }
        for (const { id, token } of matches) await request('tug-abandon', token, `/tira-afloja/${id}/abandonar`, { method: 'POST' });
        assert.equal(tugClients.filter((s) => s.connected).length, 30);
        report('tug-30-connections-5-matches', from, performance.now() - started);
        }
        if (edgesOnly) {
          announce('shared-network-75-and-abuse'); await startWorker(storage); tokens.length = 0;
          from = samples.length; started = performance.now(); await login(accounts, 75);
          report('login-75-simultaneous', from, performance.now() - started);
          from = samples.length; started = performance.now();
          let allowed = 0, limited = 0;
          await Promise.all(tokens.map(async (token, i) => {
            for (let round = 0; round < 15; round++) {
              const at = performance.now();
              const response = await fetch(`${base}/auth/perfil`, { redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
              const raw = Buffer.from(await response.arrayBuffer());
              if (response.status === 200) { allowed++; assert.equal(JSON.parse(raw.toString()).id, accounts[i].id); }
              else if (response.status === 429) limited++;
              else throw Error('Unexpected rate probe response');
              samples.push({ kind: 'shared-ip-profile', ok: [200, 429].includes(response.status), status: response.status, ms: performance.now() - at, bytes: raw.length });
            }
          }));
          assert.equal(allowed, 1125); assert.equal(limited, 0);
          report('shared-network-75', from, performance.now() - started, { allowed, rejected429: limited, schoolQuotaProbePassed: true });
          from = samples.length; started = performance.now();
          let userAllowed = 0, userLimited = 0;
          // Same valid user, same IP, fresh requests cannot mint another user bucket.
          for (let batch = 0; batch < 100; batch++) await Promise.all(Array.from({ length: 10 }, async () => {
            const at = performance.now();
            const response = await fetch(`${base}/auth/perfil`, { redirect: 'error', headers: { Authorization: `Bearer ${tokens[0]}`, 'X-Forwarded-For': `192.0.2.${batch % 250 + 1}` }, signal: AbortSignal.timeout(15000) });
            await response.arrayBuffer();
            if (response.status === 200) userAllowed++; else if (response.status === 429) userLimited++; else throw Error('Unexpected abuse probe response');
            samples.push({ kind: 'single-user-abuse', ok: true, status: response.status, ms: performance.now() - at, bytes: 0 });
          }));
          assert.equal(userAllowed, 985); assert.equal(userLimited, 15);
          await request('other-user-after-abuse', tokens[1], '/auth/perfil');
          report('single-user-abuse-contained', from, performance.now() - started, { allowed: userAllowed, rejected429: userLimited, otherUserStillAllowed: true });
          from = samples.length; started = performance.now();
          for (let i = 0; i < 11; i++) await request('bad-login-protected', null, '/auth/login', {
            method: 'POST', body: { correo: accounts[0].correo, contrasena: 'invalid-synthetic-password' }, expected: i < 10 ? 401 : 429,
          });
          report('failed-login-threshold-preserved', from, performance.now() - started, { failedCredentials: 10, rejected429: 1 });
          announce('diagnostic-double-submit'); await startWorker(storage); tokens.length = 0; await login(accounts.slice(0, 5), 5);
          const startedStates = await Promise.all(tokens.map(async (token) => {
            const [state, repeat] = await Promise.all([0, 1].map(() => request('double-start', token, '/diagnostico-inicial/iniciar', { method: 'POST' })));
            assert.equal(state.diagnosticoId, repeat.diagnosticoId);
            assert.deepEqual(state.preguntas.map((q) => q.id), repeat.preguntas.map((q) => q.id));
            return { token, body: { respuestas: state.preguntas.map((q) => ({ preguntaId: q.id, respuestaId: correct.get(q.id) })) } };
          }));
          from = samples.length; started = performance.now();
          const submissions = await Promise.allSettled(startedStates.flatMap(({ token, body }) => [0, 1].map(() => request('double-submit', token, '/diagnostico-inicial/finalizar', { method: 'POST', body }))));
          const ids = accounts.slice(0, 5).map((a) => a.id);
          assert.equal(await db.historialRespuesta.count({ where: { usuarioId: { in: ids }, origen: 'DIAGNOSTICO' } }), 75);
          report('diagnostic-double-submit-5', from, performance.now() - started, { responsesPersisted: 75, rejected: submissions.filter((s) => s.status === 'rejected').length });
          assert.ok(submissions.every((s) => s.status === 'fulfilled'), 'Double submission must recover the existing result');
        }
        announce('complete', { localOnly: true, productionCapacityProven: false, rateLimitPerIp: 20000, rateLimitPerUser: 1000, scenarios: reports.length });
      } catch (error) {
        const safeCode = /^SOCKET_[A-Z_]+$|^HTTP_\d{3}_[a-z0-9-]+$/.test(error?.message ?? '') ? error.message : error?.constructor?.name;
        console.error(JSON.stringify({ phase: 'workload-failure', stage: phase, code: safeCode }));
        throw error;
      } finally { for (const socket of sockets) socket.disconnect(); await stopWorker(); }
    });
  } finally { await stopWorker(); await db.$disconnect(); }
}
main().catch((error) => {
  const code = typeof error?.message === 'string' && /^HTTP_\d{3}_[a-z0-9-]+$/.test(error.message) ? error.message : error?.code ?? error?.constructor?.name;
  console.error(JSON.stringify({ phase: 'pilot-extended-failed', stage: phase, code, detailsOmitted: true })); process.exitCode = 1;
});
