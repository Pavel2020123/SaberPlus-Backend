import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  requireTugPresence,
  TiraAflojaPresenceService,
} from '../tira-afloja/tira-afloja-presence.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { TiraAflojaWsAuthService } from '../tira-afloja/tira-afloja-ws-auth.service';

describe('Tug authenticated presence boundary', () => {
  it('preserves verified JWT without exp, propagates exp and rejects expired signatures', async () => {
    const jwt = new JwtService({
      secret: 'owned-unit-secret',
      verifyOptions: { algorithms: ['HS256'] },
    });
    const db = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'owner',
          nombre: 'Owner',
          rol: 'ESTUDIANTE',
          correoVerificado: true,
          debeCambiarContrasena: false,
          institucionId: null,
        }),
      },
    } as unknown as PrismaService;
    const auth = new TiraAflojaWsAuthService(jwt, db);
    const socket = (token: string) =>
      ({ handshake: { auth: { token }, headers: {} } }) as unknown as Socket;
    const noExpiry = jwt.sign({ sub: 'owner' });
    expect(jwt.verify(noExpiry).exp).toBeUndefined();
    expect(await auth.autenticar(socket(noExpiry))).toEqual({
      id: 'owner',
      nombre: 'Owner',
    });
    const exp = Math.floor(Date.now() / 1000) + 28800;
    expect(
      (await auth.autenticar(socket(jwt.sign({ sub: 'owner', exp }))))
        .expiresAt,
    ).toEqual(new Date(exp * 1000));
    await expect(
      auth.autenticar(socket(jwt.sign({ sub: 'owner', exp: 1 }))),
    ).rejects.toThrow('Token invalido o expirado.');
  });
  it('returns the PostgreSQL admission time, not a client/process clock', async () => {
    const at = new Date('2026-10-03T14:00:00Z');
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ at }]) };
    expect(
      await requireTugPresence(
        tx as unknown as Prisma.TransactionClient,
        'match',
        'owner',
      ),
    ).toBe(at);
  });
  it('maps only the known absence gate to conflict and preserves schema/other failures', async () => {
    const known = new Prisma.PrismaClientKnownRequestError('presence', {
      code: 'P2010',
      clientVersion: '5.22.0',
      meta: { message: 'TUG_PRESENCE_REQUIRED' },
    });
    const tx = { $queryRaw: jest.fn().mockRejectedValue(known) };
    await expect(
      requireTugPresence(
        tx as unknown as Prisma.TransactionClient,
        'match',
        'owner',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const missing = new Error('schema missing');
    tx.$queryRaw.mockRejectedValue(missing);
    await expect(
      requireTugPresence(
        tx as unknown as Prisma.TransactionClient,
        'match',
        'owner',
      ),
    ).rejects.toBe(missing);
  });
  it('each observer instance has a different server identity and cannot accept a client clock', async () => {
    const query = jest.fn().mockResolvedValue([{ state: 'OPEN' }]);
    const db = { $queryRaw: query } as unknown as PrismaService;
    const a = new TiraAflojaPresenceService(db),
      b = new TiraAflojaPresenceService(db);
    expect(a.instanceId).not.toBe(b.instanceId);
    expect(await a.connect('owner', 'match', 'connection')).toBe('OPEN');
    expect(await a.observe('match', 'connection', 'RENEW')).toBe('OPEN');
    expect(query.mock.calls[0].slice(1)).toEqual([
      'match',
      'owner',
      'connection',
      a.instanceId,
      null,
    ]);
    expect(query.mock.calls[1].slice(1)).toEqual([
      'match',
      'connection',
      a.instanceId,
      'RENEW',
    ]);
  });
});
