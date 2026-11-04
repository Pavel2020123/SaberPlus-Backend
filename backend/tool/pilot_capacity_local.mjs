// Bounded read-only probe against the owned I2 fixture. Never accepts a remote API.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { ownedOperationMarker } from './editorial_file_operations.mjs';

export function summarize(samples) {
  if (!samples.length) throw new Error('No samples');
  const sorted = samples.map((s) => s.ms).sort((a, b) => a - b);
  const percentile = (p) => Math.round(sorted[Math.ceil(sorted.length * p) - 1]);
  return { requests: samples.length, failures: samples.filter((s) => !s.ok).length,
    p50ms: percentile(0.5), p95ms: percentile(0.95), p99ms: percentile(0.99), maxMs: Math.round(sorted.at(-1)) };
}

async function main() {
  if (process.argv.length !== 3) throw new Error('Expected owned I2 owner.json only');
  const owner = await ownedOperationMarker(process.argv[2]);
  if (owner.marker.purpose !== 'saberplus-competitive-disposable-v1') throw new Error('I2 fixture required');
  const safe = /^(PATH|SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|COMSPEC|PATHEXT|DOCKER_CONTEXT)$/i;
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => safe.test(key)));
  const docker = (...args) => execFileSync('docker', args, { env, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const context = docker('context', 'show');
  const endpoint = docker('context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}');
  if (!endpoint.startsWith('npipe:////./pipe/') && !endpoint.startsWith('unix:///')) throw new Error('Local Docker only');
  const labels = JSON.parse(docker('inspect', '--format', '{{json .Config.Labels}}', owner.container));
  if (labels[owner.marker.purpose] !== owner.marker.nonce) throw new Error('Ownership mismatch');
  const config = JSON.parse(await readFile(join(owner.directory, 'flutter-private.json'), 'utf8'));
  const base = 'http://127.0.0.1:43187';
  if (config.API_BASE_URL !== base) throw new Error('Unexpected fixture endpoint');
  const require = createRequire(new URL('../package.json', import.meta.url));
  const { PrismaClient } = require('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: owner.marker.url } } });
  try {
    const students = await db.usuario.findMany({ where: { correo: { endsWith: '@example.invalid' }, rol: 'ESTUDIANTE' }, select: { id: true, correo: true } });
    const accounts = students.filter((s) => /^fixture-\d+@example\.invalid$/.test(s.correo)).slice(0, 30);
    if (accounts.length !== 30) throw new Error('Expected 30 synthetic accounts');
    const tokens = [];
    const logins = [];
    for (const account of accounts) {
      const start = performance.now();
      const response = await fetch(`${base}/auth/login`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correo: account.correo, contrasena: config.AUTH_E2E_PASSWORD }) });
      const body = await response.json();
      if (response.status !== 201 || body.usuario?.id !== account.id || typeof body.accessToken !== 'string') throw new Error('Synthetic login mismatch');
      tokens.push(body.accessToken);
      logins.push({ ok: true, ms: performance.now() - start });
    }
    console.log(JSON.stringify({ phase: 'pilot-login-sequential', ...summarize(logins) }));
    const routes = ['/simulacros/temas?area=MATEMATICAS', '/auth/perfil', '/ranking?limite=10'];
    for (const users of [5, 15, 30]) {
      const samples = [];
      const started = performance.now();
      await Promise.all(tokens.slice(0, users).map(async (token) => {
        for (let round = 0; round < 3; round++) {
          for (const [routeIndex, route] of routes.entries()) {
            const start = performance.now();
            let ok = false, status = 0;
            try {
              const response = await fetch(`${base}${route}`, { redirect: 'error', headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
              status = response.status;
              const body = await response.json();
              ok = status === 200 && (routeIndex === 0
                ? Array.isArray(body?.temas) && body.temas.length > 0
                : routeIndex === 1 ? typeof body?.id === 'string'
                  : body !== null && typeof body === 'object');
            } catch { /* Only aggregate status, never print response or credentials. */ }
            samples.push({ ok, status, routeIndex, ms: performance.now() - start });
          }
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }));
      const result = { phase: 'pilot-read-stage', users, elapsedMs: Math.round(performance.now() - started), ...summarize(samples),
        routes: routes.map((_, index) => ({ kind: ['themes', 'profile', 'ranking'][index], ...summarize(samples.filter((s) => s.routeIndex === index)) })) };
      console.log(JSON.stringify(result));
      if (result.failures > 0) { process.exitCode = 1; break; }
    }
    console.log(JSON.stringify({ phase: 'pilot-scope', localOnly: true, productionCapacityProven: false, loginBurst: false, writes: false, sockets: false, pdf: false, storage: false }));
  } finally { await db.$disconnect(); }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main().catch(() => {
  console.error('Pilot local probe failed; private details omitted.'); process.exitCode = 1;
});
