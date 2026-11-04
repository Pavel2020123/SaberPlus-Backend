import * as express from 'express';
import * as request from 'supertest';
import rateLimit from 'express-rate-limit';
import { boundedLoginQueue } from './login-admission-queue';
import { networkKey } from './shared-network-limits';

describe('bounded login admission before the unchanged failed-attempt limiter', () => {
  it('admits75 successful same-IP logins without counting in-flight successes as failures', async () => {
    const app = express();
    let active = 0,
      peak = 0;
    app.use(
      '/auth/login',
      boundedLoginQueue(),
      rateLimit({
        windowMs: 60000,
        max: 10,
        skipSuccessfulRequests: true,
        keyGenerator: (req) => networkKey(req.ip),
      }),
    );
    app.post('/auth/login', (_req, res) => {
      active++;
      peak = Math.max(active, peak);
      setTimeout(() => {
        active--;
        res.json({ ok: true });
      }, 10);
    });
    const results = await Promise.all(
      Array.from({ length: 75 }, () => request(app).post('/auth/login')),
    );
    expect(results.map((r) => r.status)).toEqual(Array(75).fill(200));
    expect(peak).toBeLessThanOrEqual(4);
  });
  it('retains the original10 failed-login threshold even for a concurrent burst', async () => {
    const app = express();
    let executed = 0;
    app.use(
      boundedLoginQueue(),
      rateLimit({
        windowMs: 60000,
        max: 10,
        skipSuccessfulRequests: true,
        keyGenerator: (req) => networkKey(req.ip),
      }),
    );
    app.post('/auth/login', (_req, res) => {
      executed++;
      setTimeout(() => res.sendStatus(401), 5);
    });
    const results = await Promise.all(
      Array.from({ length: 30 }, () => request(app).post('/auth/login')),
    );
    expect(executed).toBe(10);
    expect(results.filter((r) => r.status === 401)).toHaveLength(10);
    expect(results.filter((r) => r.status === 429)).toHaveLength(20);
  });
  it('bounds waiting requests, expires queued work and releases active slots', async () => {
    const app = express();
    let calls = 0;
    app.use(
      boundedLoginQueue({
        globalActive: 1,
        perIpActive: 1,
        globalWaiting: 1,
        perIpWaiting: 1,
        waitMs: 20,
      }),
    );
    app.get('/probe', (_req, res) => {
      calls++;
      setTimeout(() => res.sendStatus(200), 80);
    });
    const results = await Promise.all(
      Array.from({ length: 3 }, () => request(app).get('/probe')),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 429)).toHaveLength(2);
    expect(calls).toBe(1);
    await request(app).get('/probe').expect(200);
    expect(calls).toBe(2);
  });
  it('rejects unbounded configuration', () => {
    expect(() =>
      boundedLoginQueue({
        globalActive: 1,
        perIpActive: 1,
        globalWaiting: Infinity,
        perIpWaiting: 1,
        waitMs: 20,
      }),
    ).toThrow();
  });
});
