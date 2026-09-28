import { ValidationPipe } from '@nestjs/common';
import { RepasoDiferido } from '@prisma/client';
import { CARD_IDS, CARD_VERSION } from './card-registry';
import { ReviewEventDto } from './deferred-review.dto';
import { reviewState } from './deferred-review.service';

const input: ReviewEventDto = {
  version: 1,
  eventoId: '55555555-5555-4555-8555-555555555555',
  tarjetaId: [...CARD_IDS][0],
  contenidoVersion: CARD_VERSION,
  revision: 0,
  resultado: 'remembered',
};
const now = new Date('2026-09-28T10:00:00.000Z');
describe('Deferred review contract and schedule', () => {
  it('starts at one day and advances the same sequence as Flutter', () => {
    let previous: RepasoDiferido | null = null;
    for (const days of [1, 3, 7, 14, 30, 30]) {
      const time: Date = previous ? previous.venceEn : now;
      const result = reviewState(
        previous,
        { ...input, revision: previous?.revision ?? 0 },
        time,
      );
      expect(result.estado).toBe('scheduled');
      expect(result.agenda.venceEn.getTime() - time.getTime()).toBe(
        days * 86400000,
      );
      previous = { ...result.agenda, usuarioId: 'user' };
    }
  });
  it('failure resets, early repeats stay unchanged and stale revisions reject', () => {
    const previous: RepasoDiferido = {
      ...reviewState(null, input, now).agenda,
      usuarioId: 'user',
    };
    expect(reviewState(previous, { ...input, revision: 1 }, now).agenda).toBe(
      previous,
    );
    expect(() => reviewState(previous, input, previous.venceEn)).toThrow();
    const result = reviewState(
      previous,
      { ...input, revision: 1, resultado: 'needsPractice' },
      previous.venceEn,
    );
    expect(result.agenda.paso).toBe(0);
    expect(result.agenda.revision).toBe(2);
  });
  it('registry is bounded and unique', () => {
    expect(CARD_IDS.size).toBe(130);
    expect(
      [...CARD_IDS].every((id) => id.length <= 200 && /^[a-z0-9-]+$/.test(id)),
    ).toBe(true);
  });
  it.each([
    { usuarioId: 'other' },
    { revisadoEn: now.toISOString() },
    { revision: -1 },
    { version: 2 },
    { contenidoVersion: 'other' },
    { eventoId: 'invalid' },
    { resultado: 'correct' },
  ])('rejects invalid request %#', async (extra) => {
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    });
    await expect(
      pipe.transform(
        { ...input, ...extra },
        { type: 'body', metatype: ReviewEventDto },
      ),
    ).rejects.toThrow();
  });
});
