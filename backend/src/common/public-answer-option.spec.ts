import { publicAnswerOption } from './public-answer-option';
import { Prisma } from '@prisma/client';
import {
  freezeQuestion,
  readTriviaSnapshot,
} from '../trivia-rush/trivia-rush.snapshot';
import {
  buildTugSnapshot,
  tugSnapshot,
} from '../tira-afloja/tira-afloja.evidence';

describe('opción pública sin claves de solución', () => {
  it('mantiene contrato antiguo y omite una imagen ausente', () => {
    expect(publicAnswerOption({ id: 'a', texto: 'A' })).toEqual({
      id: 'a',
      texto: 'A',
    });
    expect(
      publicAnswerOption({ id: 'a', texto: 'A', imagenUrl: null }),
    ).toEqual({ id: 'a', texto: 'A' });
  });
  it('conserva la referencia tanto en correcta como incorrecta, sin otros campos', () => {
    for (const correct of [true, false]) {
      const privateOption = {
        id: 'a',
        texto: 'Rectángulo',
        imagenUrl: '/recursos/editoriales/fixture',
        esCorrecta: correct,
        explicacion: 'Solución',
        archivoImagenId: 'privado',
      };
      expect(publicAnswerOption(privateOption)).toEqual({
        id: 'a',
        texto: 'Rectángulo',
        imagenUrl: '/recursos/editoriales/fixture',
      });
    }
  });

  const question = (id: string) =>
    ({
      id,
      enunciado: 'Compara figuras',
      imagenUrl: null,
      explicacion: 'Solución',
      dificultad: 'BASICO',
      subtemaId: 's',
      caso: null,
      subtema: {
        nombre: 'Figuras',
        tema: { nombre: 'Geometría', area: 'MATEMATICAS' },
      },
      respuestas: [
        {
          id: 'a',
          texto: 'Rectángulo',
          imagenUrl: '/recursos/editoriales/rectangulo',
          esCorrecta: true,
          explicacion: null,
        },
        {
          id: 'b',
          texto: 'Cuadrado',
          imagenUrl: null,
          esCorrecta: false,
          explicacion: null,
        },
      ],
    }) as unknown as Parameters<typeof freezeQuestion>[0];

  it('Trivia congela la imagen por opción y lee evidencia antigua sin reescribirla', () => {
    const source = question('q');
    const frozen = freezeQuestion(source, 1, ['a', 'b']);
    source.respuestas[0].imagenUrl = null;
    expect(frozen.pregunta.respuestas[0].imagenUrl).toBe(
      '/recursos/editoriales/rectangulo',
    );
    const old = {
      version: 1,
      q: 10,
      questions: Array.from({ length: 10 }, (_, i) =>
        freezeQuestion(question(`q${i}`), i + 1, ['a', 'b']),
      ),
    };
    for (const q of old.questions)
      for (const answer of q.pregunta.respuestas) delete answer.imagenUrl;
    const json = JSON.stringify(old);
    expect(
      readTriviaSnapshot({
        evidenciaVersion: 1,
        snapshotInicial: old,
      }),
    ).toEqual(old);
    expect(JSON.stringify(old)).toBe(json);
  });

  it('Tira congela imágenes según el orden de opciones y admite evidencia sin imágenes', () => {
    const snapshot = buildTugSnapshot(
      {
        jugadorAId: 'student-a',
        jugadorBId: 'student-b',
        area: 'MATEMATICAS',
        versionReglas: 1,
        expiraEn: new Date('2026-12-01T00:00:00Z'),
      },
      Array.from({ length: 4 }, (_, i) => ({
        preguntaId: `q${i}`,
        orden: i + 1,
        opcionesOrden: ['b', 'a'],
        pregunta: question(`q${i}`) as unknown as Parameters<
          typeof buildTugSnapshot
        >[1][number]['pregunta'],
      })),
    );
    expect(snapshot.questions[0].pregunta.respuestas[1].imagenUrl).toBe(
      '/recursos/editoriales/rectangulo',
    );
    for (const q of snapshot.questions)
      for (const answer of q.pregunta.respuestas) delete answer.imagenUrl;
    const json = JSON.stringify(snapshot);
    expect(
      tugSnapshot({
        evidenciaVersion: 1,
        snapshotInicial: snapshot as unknown as Prisma.JsonValue,
      }),
    ).toEqual(snapshot);
    expect(JSON.stringify(snapshot)).toBe(json);
  });
});
