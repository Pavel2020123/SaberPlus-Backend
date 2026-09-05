import { ForbiddenException } from '@nestjs/common';
import { AreaIcfes, NivelDiagnostico } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DiagnosticoService } from './diagnostico.service';

describe('DiagnosticoService', () => {
  const usuario = { findUnique: jest.fn() };
  const diagnosticoInicial = {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const diagnosticoResultadoArea = { createMany: jest.fn() };
  const pregunta = { findMany: jest.fn() };
  const historialRespuesta = { createMany: jest.fn() };
  const prisma = {
    usuario,
    diagnosticoInicial,
    diagnosticoResultadoArea,
    pregunta,
    historialRespuesta,
    $transaction: jest.fn((operaciones: Promise<unknown>[]) =>
      Promise.all(operaciones),
    ),
  } as unknown as PrismaService;
  const service = new DiagnosticoService(prisma);

  const areas = Object.values(AreaIcfes);
  const crearPreguntaPublica = (area: AreaIcfes, indice: number) => ({
    id: `${area}-${indice}`,
    enunciado: `Pregunta ${indice} de ${area}`,
    imagenUrl: null,
    dificultad: 'MEDIO',
    ordenEnCaso: null,
    caso: null,
    respuestas: [
      { id: `${area}-${indice}-a`, texto: 'Opción A' },
      { id: `${area}-${indice}-b`, texto: 'Opción B' },
    ],
    subtema: {
      nombre: 'Subtema',
      tema: { nombre: 'Tema', area },
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction = jest.fn((operaciones: Promise<unknown>[]) =>
      Promise.all(operaciones),
    ) as never;
    usuario.findUnique.mockResolvedValue({ rol: 'ESTUDIANTE' });
    diagnosticoInicial.create.mockResolvedValue({ id: 'diagnostico-1' });
    diagnosticoInicial.update.mockResolvedValue({ id: 'diagnostico-1' });
    diagnosticoResultadoArea.createMany.mockResolvedValue({ count: 5 });
    historialRespuesta.createMany.mockResolvedValue({ count: 15 });
  });

  it('crea una sesión balanceada sin exponer respuestas correctas', async () => {
    const preguntas = areas.flatMap((area) =>
      [1, 2, 3].map((indice) => crearPreguntaPublica(area, indice)),
    );
    diagnosticoInicial.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'diagnostico-1',
        usuarioId: 'usuario-1',
        preguntaIds: preguntas.map((item) => item.id),
        iniciadoEn: new Date('2026-08-20T12:00:00Z'),
        completadoEn: null,
        totalPreguntas: 15,
        respuestasCorrectas: null,
        porcentaje: null,
        nivel: null,
        resultadosPorArea: [],
      });
    pregunta.findMany.mockImplementation(
      (consulta: {
        where?: {
          id?: { in: string[] };
          subtema?: { tema?: { area?: AreaIcfes } };
        };
      }) => {
        const ids = consulta.where?.id?.in;
        if (ids)
          return Promise.resolve(
            preguntas.filter((item) => ids.includes(item.id)),
          );
        const filtros = (consulta.where as { AND?: unknown[] })?.AND;
        const area = (
          filtros as
            | Array<{
                subtema?: { tema?: { area?: AreaIcfes } };
              }>
            | undefined
        )
          ?.map((filtro) => filtro.subtema?.tema?.area)
          .find((valor) => valor !== undefined);
        return Promise.resolve(
          preguntas.filter((item) => item.subtema.tema.area === area),
        );
      },
    );

    const resultado = await service.iniciar('usuario-1');

    expect(resultado.estado).toBe('EN_PROGRESO');
    if (resultado.estado !== 'EN_PROGRESO')
      throw new Error('Estado inesperado');
    expect(resultado.preguntas).toHaveLength(15);
    const [llamadaCrear] = diagnosticoInicial.create.mock
      .calls[0] as unknown as [
      { data: { usuarioId: string; totalPreguntas: number } },
    ];
    expect(llamadaCrear.data.usuarioId).toBe('usuario-1');
    expect(llamadaCrear.data.totalPreguntas).toBe(15);
    expect(JSON.stringify(resultado)).not.toContain('esCorrecta');
    expect(JSON.stringify(resultado)).not.toContain('explicacion');
  });

  it('reanuda la misma sesión cuando ya existe', async () => {
    const preguntaPublica = crearPreguntaPublica(AreaIcfes.MATEMATICAS, 1);
    diagnosticoInicial.findUnique
      .mockResolvedValueOnce({ id: 'diagnostico-1' })
      .mockResolvedValueOnce({
        id: 'diagnostico-1',
        usuarioId: 'usuario-1',
        preguntaIds: [preguntaPublica.id],
        iniciadoEn: new Date('2026-08-20T12:00:00Z'),
        completadoEn: null,
        totalPreguntas: 1,
        respuestasCorrectas: null,
        porcentaje: null,
        nivel: null,
        resultadosPorArea: [],
      });
    pregunta.findMany.mockResolvedValue([preguntaPublica]);

    const resultado = await service.iniciar('usuario-1');

    expect(resultado.estado).toBe('EN_PROGRESO');
    expect(diagnosticoInicial.create).not.toHaveBeenCalled();
  });

  it('califica en el servidor y guarda el desglose y el historial', async () => {
    const iniciadoEn = new Date('2026-08-20T12:00:00Z');
    diagnosticoInicial.findUnique
      .mockResolvedValueOnce({
        id: 'diagnostico-1',
        usuarioId: 'usuario-1',
        preguntaIds: ['pregunta-1', 'pregunta-2'],
        iniciadoEn,
        completadoEn: null,
        totalPreguntas: 2,
        respuestasCorrectas: null,
        porcentaje: null,
        nivel: null,
        resultadosPorArea: [],
      })
      .mockResolvedValueOnce({
        id: 'diagnostico-1',
        usuarioId: 'usuario-1',
        preguntaIds: ['pregunta-1', 'pregunta-2'],
        iniciadoEn,
        completadoEn: new Date('2026-08-20T12:10:00Z'),
        totalPreguntas: 2,
        respuestasCorrectas: 1,
        porcentaje: 50,
        nivel: NivelDiagnostico.EN_PROCESO,
        resultadosPorArea: [
          {
            id: 'resultado-area-1',
            diagnosticoId: 'diagnostico-1',
            area: AreaIcfes.MATEMATICAS,
            totalPreguntas: 2,
            respuestasCorrectas: 1,
            porcentaje: 50,
            nivel: NivelDiagnostico.EN_PROCESO,
          },
        ],
      });
    pregunta.findMany.mockResolvedValue([
      {
        id: 'pregunta-1',
        respuestas: [
          { id: 'respuesta-1a', esCorrecta: true },
          { id: 'respuesta-1b', esCorrecta: false },
        ],
        subtema: { tema: { area: AreaIcfes.MATEMATICAS } },
      },
      {
        id: 'pregunta-2',
        respuestas: [
          { id: 'respuesta-2a', esCorrecta: false },
          { id: 'respuesta-2b', esCorrecta: true },
        ],
        subtema: { tema: { area: AreaIcfes.MATEMATICAS } },
      },
    ]);

    const resultado = await service.finalizar('usuario-1', [
      {
        preguntaId: 'pregunta-1',
        respuestaId: 'respuesta-1a',
        tiempoRespuestaSegundos: 20,
      },
      { preguntaId: 'pregunta-2', respuestaId: 'respuesta-2a' },
    ]);

    expect(resultado).toEqual(
      expect.objectContaining({
        estado: 'COMPLETADO',
        porcentaje: 50,
        areaPrioritaria: AreaIcfes.MATEMATICAS,
      }),
    );
    expect(diagnosticoResultadoArea.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          area: AreaIcfes.MATEMATICAS,
          respuestasCorrectas: 1,
          nivel: NivelDiagnostico.EN_PROCESO,
        }),
      ],
    });
    const [llamadaHistorial] = historialRespuesta.createMany.mock
      .calls[0] as unknown as [
      {
        data: Array<{
          sesionId: string;
          origen: string;
          tiempoRespuestaSegundos?: number;
        }>;
      },
    ];
    expect(llamadaHistorial.data).toContainEqual(
      expect.objectContaining({
        sesionId: 'diagnostico-1',
        origen: 'DIAGNOSTICO',
        tiempoRespuestaSegundos: 20,
      }),
    );
  });

  it('impide que un profesor inicie un diagnóstico de estudiante', async () => {
    usuario.findUnique.mockResolvedValue({ rol: 'PROFESOR' });

    await expect(service.iniciar('profesor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
