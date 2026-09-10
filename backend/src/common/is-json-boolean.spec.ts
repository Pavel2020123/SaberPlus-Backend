import 'reflect-metadata';
import { BadRequestException, Type, ValidationPipe } from '@nestjs/common';
import { IsOptional } from 'class-validator';
import { EditorialQuestionDto } from '../admin/question-editor.dto';
import { AnunciosController } from '../anuncios/anuncios.controller';
import { BatallasController } from '../batallas/batallas.controller';
import { CuponesController } from '../cupones/cupones.controller';
import { InstitucionController } from '../institucion/institucion.controller';
import { SoporteController } from '../soporte/soporte.controller';
import { VentasController } from '../ventas/ventas.controller';
import { IsJsonBoolean } from './is-json-boolean';

class RequiredBooleanDto {
  @IsJsonBoolean()
  flag!: boolean;
}

class OptionalBooleanDto {
  @IsOptional()
  @IsJsonBoolean()
  flag?: boolean;
}

// Mirrors main.ts: without the raw-value transform, "false" becomes true.
const pipe = new ValidationPipe({
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  whitelist: true,
  forbidNonWhitelisted: true,
});

function bodyDto(
  controller: Type<object>,
  method: string,
  argument: number,
): Type<object> {
  const types = Reflect.getMetadata(
    'design:paramtypes',
    controller.prototype as object,
    method,
  ) as Type<object>[];
  return types[argument];
}

describe('JSON booleans with the production validation pipe', () => {
  it.each([true, false])('preserves the literal boolean %s', async (flag) => {
    await expect(
      pipe.transform({ flag }, { type: 'body', metatype: RequiredBooleanDto }),
    ).resolves.toEqual({ flag });
  });

  it.each(['false', 'true', '', 0, 1, null, [], {}, undefined])(
    'rejects non-boolean %p',
    async (flag) => {
      await expect(
        pipe.transform(
          { flag },
          { type: 'body', metatype: RequiredBooleanDto },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('allows omission of optional fields without inventing a boolean', async () => {
    await expect(
      pipe.transform({}, { type: 'body', metatype: OptionalBooleanDto }),
    ).resolves.toEqual({});
  });

  it('checks nested answer DTOs, not just top-level properties', async () => {
    const question = {
      subtemaId: 'sub-1',
      enunciado: '¿Cuánto es 2 + 2?',
      explicacion: 'Se suman dos pares.',
      imagenUrl: '',
      dificultad: 'BASICO',
      casoId: '',
      respuestas: [
        { texto: '4', esCorrecta: true, explicacion: '' },
        { texto: '3', esCorrecta: false, explicacion: '' },
      ],
    };
    await expect(
      pipe.transform(question, {
        type: 'body',
        metatype: EditorialQuestionDto,
      }),
    ).resolves.toMatchObject(question);
    question.respuestas[1].esCorrecta = 'false' as unknown as boolean;
    await expect(
      pipe.transform(question, {
        type: 'body',
        metatype: EditorialQuestionDto,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  const controllerFields = [
    {
      controller: AnunciosController,
      method: 'actualizar',
      index: 1,
      field: 'activo',
    },
    {
      controller: AnunciosController,
      method: 'actualizar',
      index: 1,
      field: 'destacado',
    },
    {
      controller: CuponesController,
      method: 'actualizar',
      index: 1,
      field: 'activo',
    },
    {
      controller: SoporteController,
      method: 'actualizar',
      index: 0,
      field: 'activo',
    },
    {
      controller: VentasController,
      method: 'marcarAtendido',
      index: 1,
      field: 'atendido',
    },
  ];

  it.each(controllerFields)(
    'validates $controller.name.$field before calling its service',
    async ({ controller, method, index, field }) => {
      const metatype = bodyDto(controller, method, index);
      await expect(
        pipe.transform({ [field]: false }, { type: 'body', metatype }),
      ).resolves.toMatchObject({ [field]: false });
      await expect(
        pipe.transform({ [field]: 'false' }, { type: 'body', metatype }),
      ).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it('does not turn a string into consent to link an academic group', async () => {
    const metatype = bodyDto(InstitucionController, 'aceptarGrupo', 0);
    await expect(
      pipe.transform(
        { codigo: 'GRP-ABCDEFGH', acepto: true },
        { type: 'body', metatype },
      ),
    ).resolves.toMatchObject({ acepto: true });
    for (const acepto of [false, 'false', 'true', 1, null]) {
      await expect(
        pipe.transform(
          { codigo: 'GRP-ABCDEFGH', acepto },
          { type: 'body', metatype },
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('rejects a textual invitation privacy flag', async () => {
    const metatype = bodyDto(BatallasController, 'crear', 1);
    await expect(
      pipe.transform(
        { modo: 'CARRERA_FANTASMA', invitacionPrivada: false },
        { type: 'body', metatype },
      ),
    ).resolves.toMatchObject({ invitacionPrivada: false });
    await expect(
      pipe.transform(
        { modo: 'CARRERA_FANTASMA', invitacionPrivada: 'false' },
        { type: 'body', metatype },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
