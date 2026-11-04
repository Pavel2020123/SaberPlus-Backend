import { isIP } from 'node:net';
import { isUUID } from 'class-validator';
import type { Request, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';

export interface LimitIdentityResolver {
  verify(token: string): Promise<unknown>;
  currentUserId(id: string): Promise<string | null>;
}
export interface SharedNetworkLimitConfig {
  windowMs: number;
  ipMax: number;
  userMax: number;
  anonymousMax: number;
}

/** Only explicit peer networks may supply forwarding headers. No hop-count trust. */
export function trustedProxyNetworks(env: NodeJS.ProcessEnv): false | string[] {
  if (
    env.TRUST_PROXY !== undefined &&
    !['true', 'false'].includes(env.TRUST_PROXY)
  )
    throw new Error('TRUST_PROXY must be true or false.');
  if (env.TRUST_PROXY !== 'true') return false;
  const values = (env.TRUST_PROXY_CIDRS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!values.length || values.length > 32)
    throw new Error('TRUST_PROXY=true requires explicit TRUST_PROXY_CIDRS.');
  for (const value of values) {
    const [address, prefix, ...rest] = value.split('/');
    const version = isIP(address);
    if (
      !version ||
      rest.length ||
      (prefix !== undefined &&
        (!/^\d+$/.test(prefix) ||
          Number(prefix) < 1 ||
          Number(prefix) > (version === 4 ? 32 : 128)))
    )
      throw new Error('Invalid trusted proxy network.');
  }
  return [...new Set(values)];
}

/** Aggregate IPv6 by /64; mapped IPv4 shares the same bucket as native IPv4. */
export function networkKey(address: string | undefined): string {
  const version = address ? isIP(address) : 0;
  if (version === 4) return `ip4:${address}`;
  if (version !== 6 || !address || address.includes('%')) return 'ip:unknown';
  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const [head, tail] = canonical.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const parts =
    tail !== undefined
      ? [
          ...left,
          ...Array<string>(8 - left.length - right.length).fill('0'),
          ...right,
        ]
      : left;
  const words = parts.map((p) => Number.parseInt(p, 16));
  if (words.slice(0, 5).every((p) => p === 0) && words[5] === 0xffff) {
    return `ip4:${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`;
  }
  return `ip6:${words
    .slice(0, 4)
    .map((p) => p.toString(16))
    .join(':')}/64`;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(Number(raw)) ||
    Number(raw) < 1
  )
    throw new Error('Invalid request limit.');
  return Number(raw);
}
export function sharedNetworkLimitConfig(
  env: NodeJS.ProcessEnv,
): SharedNetworkLimitConfig {
  return {
    windowMs: 15 * 60 * 1000,
    ipMax: positiveInteger(env.RATE_LIMIT_IP_MAX, 20000),
    userMax: positiveInteger(
      env.RATE_LIMIT_USER_MAX ?? env.RATE_LIMIT_MAX,
      env.NODE_ENV === 'production' ? 1000 : 5000,
    ),
    anonymousMax: positiveInteger(env.RATE_LIMIT_ANONYMOUS_MAX, 1000),
  };
}

const identity = Symbol('verified-rate-limit-identity');
type LimitedRequest = Request & { [identity]?: string };
const publicAuth = new Set([
  '/auth/login',
  '/auth/registro',
  '/auth/verificar-correo',
  '/auth/reenviar-verificacion',
  '/auth/solicitar-recuperacion',
  '/auth/restablecer-contrasena',
]);

/** Quota identity is never reused as route authorization. Guards still revalidate. */
export function sharedNetworkLimiters(
  resolver: LimitIdentityResolver,
  config: SharedNetworkLimitConfig,
): RequestHandler[] {
  for (const value of Object.values(config))
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error('Invalid request limit configuration.');
  const message = {
    statusCode: 429,
    error: 'Too Many Requests',
    message:
      'Has realizado demasiadas solicitudes. Espera un momento e inténtalo nuevamente.',
  };
  const common = {
    windowMs: config.windowMs,
    standardHeaders: true,
    legacyHeaders: false,
    message,
  };
  const coarse = rateLimit({
    ...common,
    max: config.ipMax,
    keyGenerator: (req) => networkKey(req.ip),
  });
  const resolve: RequestHandler = (request: LimitedRequest, response, next) => {
    // Do not allow a valid session to bypass sensitive public endpoint IP budgets.
    if (publicAuth.has(request.path.toLowerCase().replace(/\/+$/, '')))
      return next();
    const header = request.headers.authorization;
    if (typeof header !== 'string' || header.length > 4096) return next();
    const match = /^Bearer ([^\s]+)$/.exec(header);
    if (!match) return next();
    void (async () => {
      let payload: unknown;
      try {
        payload = await resolver.verify(match[1]);
      } catch {
        next();
        return;
      }
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('sub' in payload) ||
        typeof payload.sub !== 'string' ||
        !isUUID(payload.sub)
      ) {
        next();
        return;
      }
      try {
        const id = await resolver.currentUserId(payload.sub);
        if (id) request[identity] = id;
        next();
      } catch {
        // A DB outage must not grant an unverified per-user budget.
        response
          .status(503)
          .json({ statusCode: 503, message: 'No se pudo validar la sesión.' });
      }
    })();
  };
  const perIdentity = rateLimit({
    ...common,
    max: (request: LimitedRequest) =>
      request[identity] ? config.userMax : config.anonymousMax,
    keyGenerator: (request: LimitedRequest) =>
      request[identity]
        ? `user:${request[identity]}`
        : `anonymous:${networkKey(request.ip)}`,
  });
  return [coarse, resolve, perIdentity];
}
