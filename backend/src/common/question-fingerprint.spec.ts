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

  it('conserva las huellas v1 sin imagen y la identidad imagen del importador', () => {
    const base = {
      area: 'MATEMATICAS',
      enunciado: 'Compara',
      opciones: [{ texto: 'A' }, { texto: 'B' }],
    };
    expect(createQuestionFingerprint(base)).toBe(
      createQuestionFingerprint({
        ...base,
        opciones: [
          { texto: 'A', imagenUrl: null },
          { texto: 'B', imagenUrl: '' },
        ],
      }),
    );
    const withUrl = {
      ...base,
      opciones: [
        { texto: 'A', imagenUrl: 'https://example.com/a.png' },
        { texto: 'B' },
      ],
    };
    expect(createQuestionFingerprint(withUrl)).not.toBe(
      createQuestionFingerprint(base),
    );
    expect(createQuestionFingerprint(withUrl)).toBe(
      createQuestionFingerprint({
        ...base,
        opciones: [
          { texto: 'B' },
          { texto: 'A', imagen: 'https://example.com/a.png' },
        ],
      }),
    );
  });

  it('asocia la identidad de imagen al texto de su opción, no al orden del array', () => {
    const first = {
      area: 'MATEMATICAS',
      enunciado: 'Compara',
      opciones: [
        { texto: 'A', imagenUrl: 'https://example.com/a.png' },
        { texto: 'B', imagenUrl: 'https://example.com/b.png' },
      ],
    };
    expect(createQuestionFingerprint(first)).toBe(
      createQuestionFingerprint({
        ...first,
        opciones: [...first.opciones].reverse(),
      }),
    );
    expect(createQuestionFingerprint(first)).not.toBe(
      createQuestionFingerprint({
        ...first,
        opciones: [
          { texto: 'A', imagenUrl: 'https://example.com/b.png' },
          { texto: 'B', imagenUrl: 'https://example.com/a.png' },
        ],
      }),
    );
  });
});
