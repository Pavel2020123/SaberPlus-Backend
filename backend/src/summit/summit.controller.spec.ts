import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AreaIcfes } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  SummitController,
  CreateSummitDto,
  SummitAnswerDto,
} from './summit.controller';
import { SummitService } from './summit.service';

describe('Summit HTTP boundary', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (
    value: object,
    metatype: typeof CreateSummitDto | typeof SummitAnswerDto,
  ) => pipe.transform(value, { type: 'body', metatype });
  it('protects every route with authentication and email verification', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SummitController)).toEqual([
      JwtGuard,
      EmailVerificadoGuard,
    ]);
  });
  it('allows area-only configuration and rejects client scores/owners', async () => {
    await expect(
      parse({ area: AreaIcfes.MATEMATICAS }, CreateSummitDto),
    ).resolves.toBeInstanceOf(CreateSummitDto);
    for (const extra of [
      { usuarioId: 'other' },
      { escalon: 5 },
      { xp: 999 },
      { preguntas: [] },
    ]) {
      await expect(
        parse({ area: AreaIcfes.MATEMATICAS, ...extra }, CreateSummitDto),
      ).rejects.toThrow();
    }
  });
  it('rejects malformed filters and submissions', async () => {
    for (const data of [
      { area: 'OTHER' },
      { area: 'MATEMATICAS', subtemaId: ' ' },
      { area: 'MATEMATICAS', dificultad: 'OTHER' },
    ]) {
      await expect(parse(data, CreateSummitDto)).rejects.toThrow();
    }
    await expect(
      parse(
        { preguntaId: 'q', respuestaId: 'a', idempotencyKey: 'not-uuid' },
        SummitAnswerDto,
      ),
    ).rejects.toThrow();
    await expect(
      parse(
        {
          preguntaId: 'q',
          respuestaId: 'a',
          idempotencyKey: '11111111-1111-4111-8111-111111111111',
          esCorrecta: true,
        },
        SummitAnswerDto,
      ),
    ).rejects.toThrow();
  });
  it('always forwards identity from the verified token', async () => {
    const service = {
      start: jest.fn(),
      active: jest.fn(),
      get: jest.fn(),
      answer: jest.fn(),
      abandon: jest.fn(),
    };
    const controller = new SummitController(
      service as unknown as SummitService,
    );
    const request = { usuario: { sub: 'actor' } } as AuthenticatedRequest;
    const config = { area: AreaIcfes.MATEMATICAS };
    const answer = { preguntaId: 'q', respuestaId: 'a', idempotencyKey: 'key' };
    await controller.start(request, config);
    await controller.active(request);
    await controller.get(request, 'attempt');
    await controller.answer(request, 'attempt', answer);
    await controller.abandon(request, 'attempt');
    expect(service.start).toHaveBeenCalledWith('actor', config);
    expect(service.active).toHaveBeenCalledWith('actor');
    expect(service.get).toHaveBeenCalledWith('actor', 'attempt');
    expect(service.answer).toHaveBeenCalledWith('actor', 'attempt', answer);
    expect(service.abandon).toHaveBeenCalledWith('actor', 'attempt');
  });
});
