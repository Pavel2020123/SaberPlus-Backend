import { Logger } from '@nestjs/common';
import {
  requireTriviaPresence,
  TriviaPresenceService,
} from '../trivia-rush/trivia-presence.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { GATEWAY_OPTIONS } from '@nestjs/websockets/constants';
import { TriviaPresenceGateway } from '../trivia-rush/trivia-presence.gateway';
import { TiraAflojaGateway } from '../tira-afloja/tira-afloja.gateway';

describe('Trivia presence durable worker lifecycle', () => {
  it('uses the database admission time for a new V1 action', async () => {
    const at = new Date('2050-01-01T00:00:15Z');
    const tx = { $queryRaw: jest.fn().mockResolvedValue([{ at }]) };
    expect(
      await requireTriviaPresence(
        tx as unknown as Prisma.TransactionClient,
        'attempt',
      ),
    ).toEqual(at);
  });
  it('reports missing presence as a conflict instead of accepting an action', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('query failed', {
      code: 'P2010',
      clientVersion: 'test',
      meta: { message: 'TRIVIA_PRESENCE_REQUIRED' },
    });
    const tx = { $queryRaw: jest.fn().mockRejectedValue(error) };
    await expect(
      requireTriviaPresence(
        tx as unknown as Prisma.TransactionClient,
        'attempt',
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: 'TRIVIA_PRESENCE_REQUIRED',
    });
  });
  it('does not disguise missing schema or other database failures as missing presence', async () => {
    const error = new Error('function not found');
    const tx = { $queryRaw: jest.fn().mockRejectedValue(error) };
    await expect(
      requireTriviaPresence(
        tx as unknown as Prisma.TransactionClient,
        'attempt',
      ),
    ).rejects.toBe(error);
  });
  it('preserves shared transport settings regardless of namespace initialization order', () => {
    const { namespace: trivia, ...options } = Reflect.getMetadata(
      GATEWAY_OPTIONS,
      TriviaPresenceGateway,
    );
    const { namespace: tug, ...existing } = Reflect.getMetadata(
      GATEWAY_OPTIONS,
      TiraAflojaGateway,
    );
    expect(trivia).toBe('/trivia-presence');
    expect(tug).toBe('/tira-afloja');
    expect(options).toEqual(existing);
  });
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('starts immediately, excludes overlapping scans, repeats and stops on shutdown', async () => {
    let complete!: (rows: []) => void;
    const db = {
      $queryRaw: jest
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        )
        .mockResolvedValue([]),
    };
    const worker = new TriviaPresenceService(db as unknown as PrismaService);
    worker.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(10000);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
    complete([]);
    await worker.reconcile();
    await jest.advanceTimersByTimeAsync(5000);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
    await worker.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(20000);
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('a database outage is reported and does not stop future durable scans', async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockRejectedValueOnce(new Error('DB unavailable'))
        .mockResolvedValue([]),
    };
    const worker = new TriviaPresenceService(db as unknown as PrismaService);
    await worker.reconcile();
    await worker.reconcile();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      expect.stringContaining('RECOVERY_FAILED'),
    );
    expect(db.$queryRaw).toHaveBeenCalledTimes(2);
  });
  it('failure of one attempt does not prevent recovery of other candidates', async () => {
    const db = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'first' }, { id: 'second' }]),
      $transaction: jest
        .fn()
        .mockRejectedValueOnce(new Error('retry'))
        .mockResolvedValueOnce(undefined),
    };
    const worker = new TriviaPresenceService(db as unknown as PrismaService);
    await worker.reconcile();
    expect(db.$transaction).toHaveBeenCalledTimes(2);
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'TRIVIA_PRESENCE_ATTEMPT_PENDING',
    );
  });
});
