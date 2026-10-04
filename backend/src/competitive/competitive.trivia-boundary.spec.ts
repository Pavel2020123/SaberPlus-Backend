import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { TriviaRushController } from '../trivia-rush/trivia-rush.controller';
import {
  CompetitiveVerifierRegistry,
  SOURCE_FOR_GAME,
} from './competitive.contracts';
import { createSoloVerifiers } from './competitive.solo';

// The solo-only registry cannot enable the shared Trivia source. Production now
// registers an adapter, whose persisted admission checks are covered separately.
describe('Trivia and Ghost admission boundary', () => {
  const previous = process.env.COMPETITIVE_SOLO_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.COMPETITIVE_SOLO_ENABLED;
    else process.env.COMPETITIVE_SOLO_ENABLED = previous;
  });
  it.each(['false', 'true'])(
    'solo admission %s cannot enable either shared source',
    (flag) => {
      process.env.COMPETITIVE_SOLO_ENABLED = flag;
      const registry = new CompetitiveVerifierRegistry(createSoloVerifiers());
      for (const game of ['TRIVIA_RUSH', 'GHOST_DUEL'] as const) {
        expect(SOURCE_FOR_GAME[game]).toBe('TRIVIA_ATTEMPT');
        expect(() => registry.get(SOURCE_FOR_GAME[game])).toThrow(
          'SOURCE_NOT_INTEGRATED',
        );
      }
    },
  );
  const dto = Reflect.getMetadata(
    'design:paramtypes',
    TriviaRushController.prototype,
    'crear',
  )[1];
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const config = { areas: ['MATEMATICAS'], duracionSegundos: 60 };
  it.each(['TRIVIA_RUSH', 'GHOST_DUEL'])(
    'accepts explicit evidence modality %s without XP admission',
    async (modalidad) => {
      const result = await pipe.transform(
        { ...config, modalidad },
        { type: 'body', metatype: dto },
      );
      expect(result.modalidad).toBe(modalidad);
    },
  );
  it('preserves the legacy creation contract', async () => {
    const result = await pipe.transform(config, {
      type: 'body',
      metatype: dto,
    });
    expect(result.areas).toEqual(config.areas);
    expect(result.duracionSegundos).toBe(60);
  });
  it.each([
    { modalidad: 'INVALID' },
    { snapshotInicial: {} },
    { evidenciaVersion: 1 },
    { competitive: 'true' },
    { gameId: 'GHOST_DUEL' },
    { ghostMode: true },
    { ghostId: 'client-selected-reference' },
    { Q: 10, C: 10, M: 10 },
    { xp: 100 },
    { finalizadoEn: '2026-01-01T00:00:00Z' },
  ])('rejects untrusted admission/result fields %j', async (extra) => {
    await expect(
      pipe.transform({ ...config, ...extra }, { type: 'body', metatype: dto }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
