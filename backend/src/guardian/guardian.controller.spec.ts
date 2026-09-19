import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { JwtGuard } from '../auth/jwt.guard';
import { GuardianController } from './guardian.controller';

describe('Guardian HTTP boundary', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const parameters = Reflect.getMetadata(
    'design:paramtypes',
    GuardianController.prototype,
    'answer',
  );
  const answerType = parameters[2];
  const valid = {
    preguntaId: 'q1',
    respuestaId: 'a1',
    idempotencyKey: '00000000-0000-4000-8000-000000000001',
  };
  it('requires JWT and verified email guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, GuardianController)).toEqual([
      JwtGuard,
      EmailVerificadoGuard,
    ]);
  });
  it('accepts only the answer and a valid UUID key', async () => {
    await expect(
      pipe.transform(valid, { type: 'body', metatype: answerType }),
    ).resolves.toMatchObject(valid);
    await expect(
      pipe.transform(
        { ...valid, idempotencyKey: 'invalid' },
        { type: 'body', metatype: answerType },
      ),
    ).rejects.toThrow();
  });
  it('rejects client scores and correctness claims', async () => {
    await expect(
      pipe.transform(
        { ...valid, aciertos: 6, esCorrecta: true },
        { type: 'body', metatype: answerType },
      ),
    ).rejects.toThrow();
  });
});
