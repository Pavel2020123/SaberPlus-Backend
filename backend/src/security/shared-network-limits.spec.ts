import * as express from 'express';
import * as request from 'supertest';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import {
  networkKey,
  sharedNetworkLimitConfig,
  sharedNetworkLimiters,
  trustedProxyNetworks,
} from './shared-network-limits';

describe('request quota identity and proxy configuration', () => {
  it.each([
    ['::ffff:192.0.2.1', 'ip4:192.0.2.1'],
    ['192.0.2.1', 'ip4:192.0.2.1'],
    ['2001:db8:1:2::1', 'ip6:2001:db8:1:2/64'],
    ['2001:0DB8:0001:0002:ffff:0:0:1234', 'ip6:2001:db8:1:2/64'],
    ['::1', 'ip6:0:0:0:0/64'],
    ['invalid', 'ip:unknown'],
  ])('normalizes %s', (input, expected) =>
    expect(networkKey(input)).toBe(expected),
  );
  it('defaults to socket peer, not forwarding headers', () => {
    expect(trustedProxyNetworks({})).toBe(false);
    expect(
      trustedProxyNetworks({
        TRUST_PROXY: 'false',
        TRUST_PROXY_CIDRS: '127.0.0.1',
      }),
    ).toBe(false);
  });
  it.each([
    '',
    '0.0.0.0/0',
    '::/0',
    'loopback',
    'proxy.example.com',
    '192.0.2.1/33',
    '::1/129',
    'true',
  ])('rejects unsafe proxy configuration %s', (cidrs) => {
    expect(() =>
      trustedProxyNetworks({ TRUST_PROXY: 'true', TRUST_PROXY_CIDRS: cidrs }),
    ).toThrow();
  });
  it('accepts explicit operator supplied peer networks', () => {
    expect(
      trustedProxyNetworks({
        TRUST_PROXY: 'true',
        TRUST_PROXY_CIDRS: '127.0.0.1/32,::1/128',
      }),
    ).toEqual(['127.0.0.1/32', '::1/128']);
  });
  it.each(['0', '-1', '1e3', 'Infinity', '2x', '9007199254740992'])(
    'fails closed on invalid quota %s',
    (value) => {
      expect(() =>
        sharedNetworkLimitConfig({ RATE_LIMIT_USER_MAX: value }),
      ).toThrow();
    },
  );
});

describe('shared network HTTP quotas (signed JWT and live identity resolver)', () => {
  const jwt = new JwtService({
    secret: 'local-only-quota-secret',
    signOptions: { algorithm: 'HS256' },
  });
  const one: string = randomUUID(),
    two: string = randomUUID();
  const token = (id: string) => jwt.sign({ sub: id, jti: randomUUID() });
  function fixture({
    ipMax = 40,
    userMax = 3,
    anonymousMax = 2,
    outage = false,
    proxy = false,
  }: {
    ipMax?: number;
    userMax?: number;
    anonymousMax?: number;
    outage?: boolean;
    proxy?: false | string[];
  } = {}) {
    const app = express();
    app.set('trust proxy', proxy);
    const lookup = jest.fn((id: string) => {
      if (outage) return Promise.reject(new Error('private database details'));
      return Promise.resolve([one, two].includes(id) ? id : null);
    });
    app.use(
      ...sharedNetworkLimiters(
        {
          verify: (value) => jwt.verifyAsync(value, { algorithms: ['HS256'] }),
          currentUserId: lookup,
        },
        { windowMs: 60000, ipMax, userMax, anonymousMax },
      ),
    );
    app.get('/probe', (_req, res) => res.json({ ok: true }));
    app.post('/auth/login', (_req, res) => res.json({ ok: true }));
    return { app, lookup };
  }
  it('separates users on one IP and does not refresh quota for a new JWT', async () => {
    const { app } = fixture();
    for (let i = 0; i < 3; i++)
      await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${token(one)}`)
        .expect(200);
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token(one)}`)
      .expect(429);
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token(two)}`)
      .expect(200);
  });
  it('does not trust arbitrary identity/forwarding headers or invalid signatures', async () => {
    const { app, lookup } = fixture();
    const rogue = new JwtService({ secret: 'different-secret' });
    for (let i = 0; i < 2; i++)
      await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${rogue.sign({ sub: randomUUID() })}`)
        .set('X-Forwarded-For', `192.0.2.${i + 1}`)
        .set('X-User-Id', randomUUID())
        .expect(200);
    await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '198.51.100.99')
      .expect(429);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('denies a deleted identity a separate user quota', async () => {
    const { app } = fixture();
    for (let i = 0; i < 2; i++)
      await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${token(randomUUID())}`)
        .expect(200);
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token(randomUUID())}`)
      .expect(429);
  });
  it('expired tokens are anonymous, not a fresh user bucket', async () => {
    const { app, lookup } = fixture();
    const expired = jwt.sign({
      sub: one,
      exp: Math.floor(Date.now() / 1000) - 30,
    });
    for (let i = 0; i < 2; i++)
      await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${expired}`)
        .expect(200);
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${expired}`)
      .expect(429);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('fails closed on database outage without exposing its error', async () => {
    const { app } = fixture({ outage: true });
    const response = await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token(one)}`)
      .expect(503);
    expect(JSON.stringify(response.body)).not.toContain('private database');
  });
  it('keeps a shared IP backstop even for valid accounts', async () => {
    const { app } = fixture({ ipMax: 3, userMax: 10 });
    for (let i = 0; i < 3; i++)
      await request(app)
        .get('/probe')
        .set('Authorization', `Bearer ${token(i % 2 ? one : two)}`)
        .expect(200);
    await request(app)
      .get('/probe')
      .set('Authorization', `Bearer ${token(two)}`)
      .expect(429);
  });
  it('a valid JWT cannot bypass sensitive public endpoint IP buckets', async () => {
    const { app, lookup } = fixture();
    for (let i = 0; i < 2; i++)
      await request(app)
        .post('/auth/login')
        .set('Authorization', `Bearer ${token(i % 2 ? one : two)}`)
        .expect(200);
    await request(app)
      .post('/auth/login')
      .set('Authorization', `Bearer ${token(two)}`)
      .expect(429);
    expect(lookup).not.toHaveBeenCalled();
  });
  it('ignores a spoofed client header when the immediate peer is not trusted', async () => {
    const { app } = fixture({ proxy: ['203.0.113.10/32'] });
    await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '192.0.2.1')
      .expect(200);
    await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '192.0.2.2')
      .expect(200);
    await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '192.0.2.3')
      .expect(429);
  });
  it('stops proxy resolution at the nearest untrusted address', async () => {
    const { app } = fixture({ proxy: ['127.0.0.1/32', '::1/128'] });
    for (const fake of ['192.0.2.1', '192.0.2.2'])
      await request(app)
        .get('/probe')
        .set('X-Forwarded-For', `${fake}, 198.51.100.10`)
        .expect(200);
    await request(app)
      .get('/probe')
      .set('X-Forwarded-For', '192.0.2.3, 198.51.100.10')
      .expect(429);
  });
});
