import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CompetitiveModule } from './competitive.module';
import { CompetitiveTugPairProtocol } from './competitive.tug-pair-protocol';
import { TugCompetitiveReconciler } from './competitive.tug-reconciler';
import { PrismaService } from '../prisma/prisma.service';
import { CompetitiveService } from './competitive.service';
import { CompetitiveReconciler } from './competitive.reconciler';
import {
  SOLO_GAMES,
  soloFacts,
  SoloAttempt,
  SoloCompetitiveVerifier,
  createSoloVerifiers,
} from './competitive.solo';
import { normalXp } from './competitive.rules';
import { CompetitiveVerifierRegistry } from './competitive.contracts';
import { SummitController } from '../summit/summit.controller';
import { GuardianController } from '../guardian/guardian.controller';
import { StarRescueController } from '../star-rescue/star-rescue.controller';

const id = 'abcdef12-1234-4234-8234-123456789abc';
const uid = 'abcdef12-1234-4234-8234-123456789def';
function fixture(game: (typeof SOLO_GAMES)[number]): SoloAttempt {
  return {
    id,
    usuarioId: uid,
    area: 'MATEMATICAS',
    dificultad: null,
    subtemaId: null,
    version: 1,
    estado: 'ACTIVO',
    competitiveRulesVersion: 1,
    competitiveSettledAt: null,
    competitiveRetryAt: new Date(),
    creadoEn: new Date(0),
    venceEn: new Date(86_400_000),
    finalizadoEn: null,
    preguntas: Array.from({ length: game.questions }, (_, i) => ({
      question: {
        id: `q${i}`,
        enunciado: 'Question',
        respuestas: [
          { id: 'yes', texto: 'One' },
          { id: 'no', texto: 'Two' },
        ],
        subtema: { id: 'sub', tema: { id: 'topic', area: 'MATEMATICAS' } },
      },
      correctAnswerId: 'yes',
    })),
    respuestas: [],
  };
}
const choices = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    preguntaId: `q${i}`,
    respuestaId: 'yes',
    esCorrecta: true,
    idempotencyKey: `key${i}`,
  }));
describe.each(SOLO_GAMES)('$gameId verifier contract', (game) => {
  it('derives a perfect result from the snapshot and accepted choices', async () => {
    const row = fixture(game);
    row.respuestas = choices(game.gameId === 'SUMMIT' ? 5 : 6);
    row.estado = 'VICTORIA';
    row.finalizadoEn = new Date(1000);
    const tx = { $queryRaw: jest.fn().mockResolvedValue([row]) };
    const terminal = await new SoloCompetitiveVerifier(game).loadTerminal(
      tx as any,
      { sourceType: game.sourceType, sourceId: id, participantId: uid },
    );
    expect(terminal.resolution.kind).toBe('RESULTADO');
    if (terminal.resolution.kind === 'RESULTADO')
      expect(normalXp(terminal.resolution.facts)).toBe(100);
    expect(tx.$queryRaw.mock.calls[0][0].sql).toContain('FOR UPDATE');
  });
  it('rejects changed correctness, duplicate or reordered evidence and answers after winning', () => {
    const row = fixture(game);
    row.respuestas = [{ ...choices(1)[0], esCorrecta: false }];
    expect(() => soloFacts(game, row)).toThrow('INVALID_SOLO_EVIDENCE');
    row.respuestas = [{ ...choices(1)[0], preguntaId: 'q1' }];
    expect(() => soloFacts(game, row)).toThrow('INVALID_SOLO_EVIDENCE');
    row.respuestas = choices(2).map((a) => ({ ...a, idempotencyKey: 'same' }));
    expect(() => soloFacts(game, row)).toThrow('INVALID_SOLO_EVIDENCE');
    row.respuestas = choices(game.gameId === 'SUMMIT' ? 6 : 7);
    expect(() => soloFacts(game, row)).toThrow('ANSWERS_AFTER_TERMINAL');
  });
  it('rejects legacy, nonterminal and premature expiry evidence', async () => {
    const row = fixture(game),
      tx = { $queryRaw: jest.fn().mockResolvedValue([row]) };
    const verifier = new SoloCompetitiveVerifier(game),
      source = {
        sourceType: game.sourceType,
        sourceId: id,
        participantId: uid,
      };
    await expect(verifier.loadTerminal(tx as any, source)).rejects.toThrow(
      'SOURCE_NOT_TERMINAL',
    );
    row.competitiveRulesVersion = null;
    await expect(verifier.loadTerminal(tx as any, source)).rejects.toThrow(
      'INELIGIBLE_SOURCE',
    );
    row.competitiveRulesVersion = 1;
    row.estado = 'EXPIRADO';
    row.finalizadoEn = new Date(1000);
    await expect(verifier.loadTerminal(tx as any, source)).rejects.toThrow(
      'INVALID_SOLO_TIME',
    );
  });
});

describe.each([SummitController, GuardianController, StarRescueController])(
  '%p competitive HTTP creation',
  (Controller) => {
    const dto = Reflect.getMetadata(
      'design:paramtypes',
      Controller.prototype,
      'start',
    )[1];
    const answerDto = Reflect.getMetadata(
      'design:paramtypes',
      Controller.prototype,
      'answer',
    )[2];
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    });
    const base = { area: 'MATEMATICAS', dificultad: 'BASICO' };
    it('defaults legacy to no opt-in and accepts only an actual boolean', async () => {
      expect(
        (await pipe.transform(base, { type: 'body', metatype: dto }))
          .competitive,
      ).toBeUndefined();
      for (const competitive of [true, false])
        expect(
          (
            await pipe.transform(
              { ...base, competitive },
              { type: 'body', metatype: dto },
            )
          ).competitive,
        ).toBe(competitive);
      for (const competitive of ['true', 'false', 1])
        await expect(
          pipe.transform(
            { ...base, competitive },
            { type: 'body', metatype: dto },
          ),
        ).rejects.toThrow();
    });
    it('rejects client origin/time/reward/snapshot claims and private final values', async () => {
      for (const extra of [
        { xp: 100 },
        { H: 5 },
        { victoria: true },
        { temporada: 2020 },
        { institucionId: id },
        { creadoEn: new Date() },
        { preguntas: [] },
        { offline: true },
        { competitiveRulesVersion: 1 },
      ]) {
        await expect(
          pipe.transform(
            { ...base, competitive: true, ...extra },
            { type: 'body', metatype: dto },
          ),
        ).rejects.toThrow();
      }
      await expect(
        pipe.transform(
          {
            preguntaId: 'q',
            respuestaId: 'a',
            idempotencyKey: id,
            esCorrecta: true,
            xp: 100,
          },
          { type: 'body', metatype: answerDto },
        ),
      ).rejects.toThrow();
    });
  },
);

describe('production registry and reconciler lifecycle', () => {
  it('boots the real Nest module with solo, shared Trivia and pair-only TUG recovery providers', async () => {
    const prisma = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const module = await Test.createTestingModule({
      imports: [CompetitiveModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    try {
      const worker = module.get(CompetitiveReconciler);
      const scan = jest.spyOn(worker, 'reconcile');
      const tug = module.get(TugCompetitiveReconciler);
      const tugScan = jest.spyOn(tug, 'reconcile');
      await module.init();
      await Promise.all([
        scan.mock.results[0].value,
        tugScan.mock.results[0].value,
      ]);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(5);
      expect(
        prisma.$queryRaw.mock.calls.filter(([query]) =>
          String(query).includes('TugCompetitiveSettlement'),
        ),
      ).toHaveLength(1);
      expect(module.get(CompetitiveTugPairProtocol)).toBeDefined();
      expect(() =>
        module.get(CompetitiveVerifierRegistry).get('TUG_MATCH'),
      ).toThrow('SOURCE_NOT_INTEGRATED');
      expect(
        prisma.$queryRaw.mock.calls.filter(([query]) =>
          String(query).includes('TriviaPresence'),
        ),
      ).toHaveLength(1);
      await worker.reconcile();
      expect(module.get(CompetitiveService)).toBeDefined();
      for (const game of SOLO_GAMES)
        expect(
          module.get(CompetitiveVerifierRegistry).get(game.sourceType),
        ).toBeDefined();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(8);
    } finally {
      await module.close();
    }
  });
  it('registers exactly three safe adapters', () => {
    const adapters = createSoloVerifiers(),
      registry = new CompetitiveVerifierRegistry(adapters);
    expect(adapters).toHaveLength(3);
    for (const game of SOLO_GAMES)
      expect(registry.get(game.sourceType)).toBeDefined();
    for (const type of [
      'TRIVIA_ATTEMPT',
      'BATTLE',
      'TUG_MATCH',
      'MEMORY_ATTEMPT',
    ] as const)
      expect(() => registry.get(type)).toThrow('SOURCE_NOT_INTEGRATED');
  });
  it('scans at startup and periodically, coalesces overlap and stops at shutdown', async () => {
    jest.useFakeTimers();
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([]) };
    const worker = new CompetitiveReconciler(prisma as any, {} as any);
    try {
      worker.onApplicationBootstrap();
      const running = worker.reconcile();
      expect(worker.reconcile()).toBe(running);
      await running;
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(3);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(6);
      await worker.onModuleDestroy();
      await jest.advanceTimersByTimeAsync(30_000);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(6);
    } finally {
      await worker.onModuleDestroy();
      jest.useRealTimers();
    }
  });
  it('a database outage does not permanently stop future scans', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockRejectedValueOnce(new Error('temporary DB outage'))
        .mockResolvedValue([]),
    };
    const worker = new CompetitiveReconciler(prisma as any, {} as any);
    try {
      await worker.reconcile();
      await worker.reconcile();
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(4);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
      await worker.onModuleDestroy();
    }
  });
  it.each([
    { code: 'P2021' },
    { code: 'P2022' },
    { code: 'P2010', meta: { code: '42P01' } },
    { code: 'P2010', meta: { code: '42703' } },
  ])('reports missing schema explicitly: %j', async (error) => {
    const log = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(error) };
    const worker = new CompetitiveReconciler(prisma as any, {} as any);
    try {
      await worker.reconcile();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('COMPETITIVE_SCHEMA_MISSING'),
      );
    } finally {
      await worker.onModuleDestroy();
      log.mockRestore();
    }
  });
});
