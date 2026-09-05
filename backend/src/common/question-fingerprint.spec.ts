import { createQuestionFingerprint } from './question-fingerprint';

describe('createQuestionFingerprint', () => {
  it('ignora mayúsculas, espacios redundantes y el orden de las opciones', () => {
    const first = createQuestionFingerprint({
      area: 'MATEMATICAS',
      enunciado: ' ¿Cuánto   es 2 + 2? ',
      opciones: [{ texto: '4' }, { texto: '5' }],
    });
    const second = createQuestionFingerprint({
      area: 'matematicas',
      enunciado: '¿cuánto es 2 + 2?',
      opciones: [{ texto: '5' }, { texto: '4' }],
    });

    expect(first).toBe(second);
  });

  it('distingue preguntas con enunciados o imágenes diferentes', () => {
    const base = {
      area: 'LECTURA_CRITICA',
      enunciado: 'Observa la imagen.',
      opciones: [{ texto: 'A' }, { texto: 'B' }],
    };

    expect(
      createQuestionFingerprint({ ...base, imagen: 'sha256-imagen-1' }),
    ).not.toBe(
      createQuestionFingerprint({ ...base, imagen: 'sha256-imagen-2' }),
    );
  });
});
