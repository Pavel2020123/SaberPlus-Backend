import { ValidationPipe } from '@nestjs/common';
import {
  ReviewInstitutionDto,
  SubmitInstitutionDto,
} from './institution-approval.dto';

describe('PR-I5-T2 DTO territorial compatible y estricto', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const submission = {
    revision: 0,
    nombre: 'Colegio de ensayo',
    ciudad: 'Ciudad anterior',
    correoInstitucional: 'test@example.com',
    contacto: 'Representante de ensayo',
    evidencia: 'Autorización de ensayo institucional.',
    declaracion: true,
  };
  const review = {
    revision: 1,
    estado: 'APROBADA',
    mensaje: 'Resultado de revisión.',
    notaInterna: 'Justificación de revisión.',
    confirmado: true,
  };
  const transform = (extra: object, reviewing = false) =>
    pipe.transform(
      { ...(reviewing ? review : submission), ...extra },
      {
        type: 'body',
        metatype: reviewing ? ReviewInstitutionDto : SubmitInstitutionDto,
      },
    );

  it('mantiene contrato anterior y acepta códigos textuales con ceros iniciales', async () => {
    for (const reviewing of [false, true]) {
      await expect(transform({}, reviewing)).resolves.toBeDefined();
      await expect(
        transform(
          { departamentoCodigo: '05', municipioCodigo: '05001' },
          reviewing,
        ),
      ).resolves.toMatchObject({
        departamentoCodigo: '05',
        municipioCodigo: '05001',
      });
    }
  });
  it.each([
    { departamentoCodigo: 91, municipioCodigo: 91001 },
    { departamentoCodigo: null, municipioCodigo: null },
    { departamentoCodigo: '5', municipioCodigo: '5001' },
    { departamentoCodigo: ' 05', municipioCodigo: '05001' },
    { departamentoCodigo: ['05'], municipioCodigo: '05001' },
    { territorioVersion: 'inventada' },
  ])('no convierte o acepta valores manipulados: %j', async (fields) => {
    for (const reviewing of [false, true])
      await expect(transform(fields, reviewing)).rejects.toThrow();
  });
});
