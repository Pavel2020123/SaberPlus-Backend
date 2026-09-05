import { PrismaService } from '../prisma/prisma.service';
import { SimulacroService } from './simulacro.service';

describe('SimulacroService', () => {
  let ultimaConsultaPreguntas: unknown;
  let preguntasDevueltas: unknown[] = [];

  const preguntaRepositorio = {
    findMany: jest.fn((consulta: unknown) => {
      ultimaConsultaPreguntas = consulta;
      return Promise.resolve(preguntasDevueltas);
    }),
  };
  const resultadoRepositorio = {
    create: jest.fn().mockResolvedValue({ id: 'resultado-1' }),
    createMany: jest.fn(),
  };
  const usuarioRepositorio = {
    update: jest.fn().mockResolvedValue({ id: 'usuario-1' }),
  };
  const historialRespuestaRepositorio = {
    createMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
  };
  const intentoRepositorio = {
    create: jest.fn().mockResolvedValue({ id: 'intento-1' }),
    findFirst: jest.fn().mockResolvedValue({
      preguntaIds: ['pregunta-1'],
      area: 'MATEMATICAS',
      expira: new Date('2099-01-01T00:00:00.000Z'),
      consumidoEn: null,
    }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  };
  const prisma = {
    pregunta: preguntaRepositorio,
    resultadoSimulacro: resultadoRepositorio,
    usuario: usuarioRepositorio,
    historialRespuesta: historialRespuestaRepositorio,
    intentoSimulacro: intentoRepositorio,
    $transaction: jest.fn(
      (operacion: ((tx: unknown) => unknown) | Promise<unknown>[]) =>
        typeof operacion === 'function'
          ? Promise.resolve(operacion(prisma))
          : Promise.all(operacion),
    ),
  } as unknown as PrismaService;
  const service = new SimulacroService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    ultimaConsultaPreguntas = undefined;
    preguntasDevueltas = [];
  });

  it('no selecciona explicaciones ni respuestas correctas al generar', async () => {
    preguntasDevueltas = [
      {
        id: 'pregunta-1',
        enunciado: '¿Cuánto es 2 + 2?',
        imagenUrl: null,
        dificultad: 'BASICO',
        ordenEnCaso: null,
        caso: null,
        respuestas: [
          { id: 'respuesta-a', texto: '3' },
          { id: 'respuesta-b', texto: '4' },
        ],
        subtema: {
          nombre: 'Suma',
          tema: { nombre: 'Aritmética', area: 'MATEMATICAS' },
        },
      },
    ];

    const resultado = await service.generarSimulacro(
      'usuario-1',
      'MATEMATICAS',
      1,
    );
    const consultaSerializada = JSON.stringify(ultimaConsultaPreguntas);

    expect(resultado.preguntas).toHaveLength(1);
    expect(consultaSerializada).not.toContain('explicacion');
    expect(consultaSerializada).not.toContain('esCorrecta');
  });

  it('mantiene juntas y ordenadas las preguntas de un mismo caso', async () => {
    const caso = {
      id: 'caso-1',
      titulo: 'Lectura base',
      contexto: 'Texto compartido por las dos preguntas.',
      imagenUrl: null,
      area: 'LECTURA_CRITICA',
    };
    preguntasDevueltas = [
      {
        id: 'pregunta-2',
        enunciado: 'Segunda pregunta',
        imagenUrl: null,
        dificultad: 'MEDIO',
        ordenEnCaso: 2,
        caso,
        respuestas: [],
        subtema: {
          nombre: 'Comprensión',
          tema: { nombre: 'Lectura', area: 'LECTURA_CRITICA' },
        },
      },
      {
        id: 'pregunta-1',
        enunciado: 'Primera pregunta',
        imagenUrl: null,
        dificultad: 'MEDIO',
        ordenEnCaso: 1,
        caso,
        respuestas: [],
        subtema: {
          nombre: 'Comprensión',
          tema: { nombre: 'Lectura', area: 'LECTURA_CRITICA' },
        },
      },
    ];

    const resultado = await service.generarSimulacro(
      'usuario-1',
      'LECTURA_CRITICA',
      1,
    );

    expect(resultado.totalPreguntas).toBe(2);
    expect(resultado.preguntas.map((pregunta) => pregunta.id)).toEqual([
      'pregunta-1',
      'pregunta-2',
    ]);
  });

  it('entrega la revisión explicada únicamente después de calificar', async () => {
    preguntasDevueltas = [
      {
        id: 'pregunta-1',
        enunciado: '¿Cuánto es 2 + 2?',
        imagenUrl: null,
        explicacion: 'Al sumar dos unidades con otras dos se obtienen cuatro.',
        ordenEnCaso: null,
        caso: null,
        respuestas: [
          {
            id: 'respuesta-a',
            texto: '3',
            explicacion: 'Falta una unidad.',
            esCorrecta: false,
          },
          {
            id: 'respuesta-b',
            texto: '4',
            explicacion: 'Es la suma correcta.',
            esCorrecta: true,
          },
        ],
        subtema: { tema: { area: 'MATEMATICAS' } },
      },
    ];

    const resultado = await service.calificarSimulacro(
      'usuario-1',
      'intento-1',
      'MATEMATICAS',
      [{ preguntaId: 'pregunta-1', respuestaId: 'respuesta-a' }],
    );

    expect(resultado.resumen.respuestasCorrectas).toBe(0);
    expect(resultado.detalle).toEqual([
      {
        preguntaId: 'pregunta-1',
        enunciado: '¿Cuánto es 2 + 2?',
        imagenUrl: null,
        esCorrecto: false,
        respuestaSeleccionadaId: 'respuesta-a',
        respuestaCorrectaId: 'respuesta-b',
        explicacion: 'Al sumar dos unidades con otras dos se obtienen cuatro.',
        ordenEnCaso: null,
        caso: null,
        respuestas: preguntasDevueltas[0]
          ? (preguntasDevueltas[0] as { respuestas: unknown[] }).respuestas
          : [],
      },
    ]);
    expect(JSON.stringify(ultimaConsultaPreguntas)).toContain('explicacion');
    expect(historialRespuestaRepositorio.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          usuarioId: 'usuario-1',
          preguntaId: 'pregunta-1',
          respuestaSeleccionadaId: 'respuesta-a',
          respuestaCorrectaId: 'respuesta-b',
          area: 'MATEMATICAS',
          origen: 'SIMULACRO',
          esCorrecta: false,
        }),
      ],
    });
  });

  it('rechaza preguntas duplicadas antes de entregar XP', async () => {
    await expect(
      service.calificarSimulacro('usuario-1', 'intento-1', 'MATEMATICAS', [
        { preguntaId: 'pregunta-1', respuestaId: 'respuesta-a' },
        { preguntaId: 'pregunta-1', respuestaId: 'respuesta-a' },
      ]),
    ).rejects.toThrow('misma pregunta');
    expect(usuarioRepositorio.update).not.toHaveBeenCalled();
  });

  it('rechaza una respuesta que no pertenece a la pregunta', async () => {
    preguntasDevueltas = [
      {
        id: 'pregunta-1',
        enunciado: 'Pregunta',
        imagenUrl: null,
        explicacion: null,
        ordenEnCaso: null,
        caso: null,
        respuestas: [
          {
            id: 'respuesta-valida',
            texto: 'Respuesta',
            explicacion: null,
            esCorrecta: true,
          },
        ],
        subtema: { tema: { area: 'MATEMATICAS' } },
      },
    ];

    await expect(
      service.calificarSimulacro('usuario-1', 'intento-1', 'MATEMATICAS', [
        { preguntaId: 'pregunta-1', respuestaId: 'respuesta-ajena' },
      ]),
    ).rejects.toThrow('no pertenece');
    expect(usuarioRepositorio.update).not.toHaveBeenCalled();
  });

  it('no permite consumir dos veces el mismo intento', async () => {
    preguntasDevueltas = [
      {
        id: 'pregunta-1',
        enunciado: 'Pregunta',
        imagenUrl: null,
        explicacion: null,
        ordenEnCaso: null,
        caso: null,
        respuestas: [
          {
            id: 'respuesta-valida',
            texto: 'Respuesta',
            explicacion: null,
            esCorrecta: true,
          },
        ],
        subtema: { tema: { area: 'MATEMATICAS' } },
      },
    ];
    intentoRepositorio.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.calificarSimulacro('usuario-1', 'intento-1', 'MATEMATICAS', [
        { preguntaId: 'pregunta-1', respuestaId: 'respuesta-valida' },
      ]),
    ).rejects.toThrow('ya fue calificado');
    expect(usuarioRepositorio.update).not.toHaveBeenCalled();
  });
});
