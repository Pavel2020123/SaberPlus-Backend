import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AreaIcfes } from '@prisma/client';
import { AuthenticatedRequest } from '../auth/auth.types';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import {
  KnowledgeShieldController,
  CreateKnowledgeShieldDto,
  KnowledgeShieldAnswerDto,
} from './knowledge-shield.controller';
import { KnowledgeShieldService } from './knowledge-shield.service';

describe('KnowledgeShield HTTP boundary', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });
  const parse = (
    value: object,
    metatype: typeof CreateKnowledgeShieldDto | typeof KnowledgeShieldAnswerDto,
  ) => pipe.transform(value, { type: 'body', metatype });
  it('protects every route with authentication and email verification', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, KnowledgeShieldController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
  });
  it('allows area-only configuration and rejects client scores/owners', async () => {
    await expect(
      parse({ area: AreaIcfes.MATEMATICAS }, CreateKnowledgeShieldDto),
    ).resolves.toBeInstanceOf(CreateKnowledgeShieldDto);
    for (const extra of [
      { usuarioId: 'other' },
      { escudo: 3 },
      { paginas: 3 },
      { xp: 999 },
      { preguntas: [] },
    ]) {
      await expect(
        parse(
          { area: AreaIcfes.MATEMATICAS, ...extra },
          CreateKnowledgeShieldDto,
        ),
      ).rejects.toThrow();
    }
  });
  it('rejects malformed filters and submissions', async () => {
    for (const data of [
      { area: 'OTHER' },
      { area: 'MATEMATICAS', subtemaId: ' ' },
      { area: 'MATEMATICAS', dificultad: 'OTHER' },
    ]) {
      await expect(parse(data, CreateKnowledgeShieldDto)).rejects.toThrow();
    }
    await expect(
      parse(
        { preguntaId: 'q', respuestaId: 'a', idempotencyKey: 'not-uuid' },
        KnowledgeShieldAnswerDto,
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
        KnowledgeShieldAnswerDto,
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
    const controller = new KnowledgeShieldController(
      service as unknown as KnowledgeShieldService,
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
