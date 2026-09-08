import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validateClozeActivity } from './cloze-activity';
import { ClozeDraftDto, ClozeRemovalDto } from './lesson-editor.controller';

const valid = () => ({
  textoConEspacios: 'Dos más dos es ___ y tres más tres es ___.',
  espacios: [
    { opciones: ['4', '5'], correctaIndex: 0 },
    { opciones: ['5', '6'], correctaIndex: 1 },
  ],
});

describe('Contrato CLOZE', () => {
  it('conserva formato, orden e índices que consume Flutter', () => {
    expect(validateClozeActivity(valid())).toEqual(valid());
  });
  it('recorta bordes sin reordenar opciones ni cambiar las tildes', () => {
    const data = valid();
    data.espacios[0].opciones = ['  Sí  ', 'si'];
    expect(validateClozeActivity(data).espacios[0]).toEqual({
      opciones: ['Sí', 'si'],
      correctaIndex: 0,
    });
  });
  it.each([null, [], {}, 'texto', { ...valid(), extra: true }])(
    'rechaza estructura inválida %#',
    (data) => {
      expect(() => validateClozeActivity(data)).toThrow(BadRequestException);
    },
  );
  it.each([
    '',
    '   ',
    'Sin espacios',
    'Un ___',
    'Dos ____ y ___',
    '___ ___' + 'x'.repeat(12000),
    '___\u0000___',
    '___\u200b___',
  ])('rechaza texto o marcadores inválidos %#', (textoConEspacios) => {
    expect(() =>
      validateClozeActivity({ ...valid(), textoConEspacios }),
    ).toThrow(BadRequestException);
  });
  it.each([
    [],
    null,
    Array.from({ length: 21 }, () => ({
      opciones: ['a', 'b'],
      correctaIndex: 0,
    })),
  ])('limita espacios %#', (espacios) => {
    expect(() => validateClozeActivity({ ...valid(), espacios })).toThrow(
      BadRequestException,
    );
  });
  it.each([
    null,
    {},
    { opciones: ['a', 'b'], correctaIndex: 0, extra: true },
    { opciones: ['a'], correctaIndex: 0 },
    { opciones: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], correctaIndex: 0 },
    { opciones: ['', 'b'], correctaIndex: 0 },
    { opciones: ['x'.repeat(501), 'b'], correctaIndex: 0 },
    { opciones: [true, 'b'], correctaIndex: 0 },
    { opciones: [' A  B ', 'a b'], correctaIndex: 0 },
    { opciones: ['Ａ', 'a'], correctaIndex: 0 },
    ...[-1, 2, 0.5, '0', true, null, NaN, Infinity].map((correctaIndex) => ({
      opciones: ['a', 'b'],
      correctaIndex,
    })),
  ])('rechaza espacio inválido sin descartarlo silenciosamente %#', (blank) => {
    expect(() =>
      validateClozeActivity({
        textoConEspacios: 'Completa ___',
        espacios: [blank],
      }),
    ).toThrow(BadRequestException);
  });

  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  });
  it('valida DTO con la configuración real sin convertir el índice anidado', async () => {
    const dto = (await pipe.transform(
      {
        revision: 'a'.repeat(64),
        datosInteractivo: {
          textoConEspacios: 'Completa ___',
          espacios: [{ opciones: ['a', 'b'], correctaIndex: '0' }],
        },
      },
      { type: 'body', metatype: ClozeDraftDto },
    )) as ClozeDraftDto;
    expect(() => validateClozeActivity(dto.datosInteractivo)).toThrow(
      BadRequestException,
    );
  });
  it.each([
    {},
    { revision: 'old', datosInteractivo: valid() },
    {
      revision: 'a'.repeat(64),
      datosInteractivo: valid(),
      estadoContenido: 'PUBLICADO',
    },
  ])('rechaza DTO incompleto o campos ajenos %#', async (body) => {
    await expect(
      pipe.transform(body, { type: 'body', metatype: ClozeDraftDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it.each([false, 'false', 'true', 1, null, undefined])(
    'no convierte confirmación inválida %# a true',
    async (confirmado) => {
      await expect(
        pipe.transform(
          { revision: 'a'.repeat(64), confirmado },
          { type: 'body', metatype: ClozeRemovalDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );
  it('acepta solamente confirmación booleana explícita', async () => {
    await expect(
      pipe.transform(
        { revision: 'a'.repeat(64), confirmado: true },
        { type: 'body', metatype: ClozeRemovalDto },
      ),
    ).resolves.toMatchObject({ confirmado: true });
  });
});
