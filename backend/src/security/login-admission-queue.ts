import type { NextFunction, RequestHandler, Response } from 'express';
import { networkKey } from './shared-network-limits';

interface QueueLimits {
  globalActive: number;
  perIpActive: number;
  globalWaiting: number;
  perIpWaiting: number;
  waitMs: number;
}
interface Entry {
  key: string;
  next: NextFunction;
  response: Response;
  state: 'WAITING' | 'ACTIVE' | 'DONE';
  timer?: ReturnType<typeof setTimeout>;
  close: () => void;
}

/** Bound bcrypt concurrency without changing the failed-login rate threshold.
 * Place BEFORE the existing skipSuccessfulRequests IP limiter. Queue admission
 * is not authentication; identity and every sensitive limiter still run later.
 */
export function boundedLoginQueue(
  limits: QueueLimits = {
    globalActive: 8,
    perIpActive: 4,
    globalWaiting: 500,
    perIpWaiting: 100,
    waitMs: 10000,
  },
): RequestHandler {
  if (
    Object.values(limits).some(
      (value) => !Number.isSafeInteger(value) || value < 1,
    )
  )
    throw new Error('Invalid login queue limits.');
  const waiting: Entry[] = [];
  const activeByIp = new Map<string, number>();
  const waitingByIp = new Map<string, number>();
  let active = 0;
  const decrement = (map: Map<string, number>, key: string) => {
    const next = (map.get(key) ?? 0) - 1;
    if (next > 0) map.set(key, next);
    else map.delete(key);
  };
  const busy = (response: Response) => {
    response.setHeader('Retry-After', '1');
    response.status(429).json({
      statusCode: 429,
      message: 'El acceso está ocupado. Inténtalo nuevamente en un momento.',
    });
  };
  const release = (entry: Entry) => {
    if (entry.state === 'DONE') return;
    if (entry.state === 'WAITING') {
      const index = waiting.indexOf(entry);
      if (index !== -1) waiting.splice(index, 1);
      decrement(waitingByIp, entry.key);
    } else {
      active--;
      decrement(activeByIp, entry.key);
    }
    entry.state = 'DONE';
    clearTimeout(entry.timer);
    entry.response.off('finish', entry.close);
    entry.response.off('close', entry.close);
    // Let the existing limiter's finish listener decrement successful requests
    // before admitting the next login. No reset of failed-login counters.
    queueMicrotask(pump);
  };
  const pump = () => {
    while (active < limits.globalActive) {
      const index = waiting.findIndex(
        (entry) => (activeByIp.get(entry.key) ?? 0) < limits.perIpActive,
      );
      if (index < 0) return;
      const [entry] = waiting.splice(index, 1);
      decrement(waitingByIp, entry.key);
      if (entry.response.destroyed || entry.response.writableEnded) {
        entry.state = 'DONE';
        clearTimeout(entry.timer);
        entry.response.off('finish', entry.close);
        entry.response.off('close', entry.close);
        continue;
      }
      entry.state = 'ACTIVE';
      clearTimeout(entry.timer);
      active++;
      activeByIp.set(entry.key, (activeByIp.get(entry.key) ?? 0) + 1);
      entry.next();
    }
  };
  return (request, response, next) => {
    const key = networkKey(request.ip);
    if (
      waiting.length >= limits.globalWaiting ||
      (waitingByIp.get(key) ?? 0) >= limits.perIpWaiting
    ) {
      busy(response);
      return;
    }
    const entry: Entry = {
      key,
      next,
      response,
      state: 'WAITING',
      close: () => release(entry),
    };
    waiting.push(entry);
    waitingByIp.set(key, (waitingByIp.get(key) ?? 0) + 1);
    response.once('finish', entry.close);
    response.once('close', entry.close);
    entry.timer = setTimeout(() => {
      if (entry.state !== 'WAITING') return;
      release(entry);
      if (!response.destroyed && !response.writableEnded) busy(response);
    }, limits.waitMs);
    entry.timer.unref();
    pump();
  };
}
