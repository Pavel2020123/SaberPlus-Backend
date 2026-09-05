import { ForbiddenException } from '@nestjs/common';
import {
  AreaIcfes,
  Dificultad,
  OrigenRespuesta,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RepasoAdaptativoService } from './repaso-adaptativo.service';
import { SimulacroService } from './simulacro.service';

describe('RepasoAdaptativoService', () => {
  const usuario = { findUnique: jest.fn() };
  const historialRespuesta = { findMany: jest.fn() };
  const pregunta = { findMany: jest.fn() };
  const intentoSimulacro = { create: jest.fn() };
  const prisma = {
    usuario,
    historialRespuesta,
    pregunta,
    intentoSimulacro,
  } as unknown as PrismaService;
  const calificarRepasoAdaptativo = jest.fn();
  const simulacros = {
    calificarRepasoAdaptativo,
  } as unknown as SimulacroService;
  const service = new RepasoAdaptativoService(prisma, simulacros);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ rol: RolUsuario.ESTUDIANTE });
    historialRespuesta.findMany.mockResolvedValue([]);
    pregunta.findMany.mockResolvedValue([]);
    intentoSimulacro.create.mockResolvedValue({ id: 'intento-1' });
  });

  it('comienza en nivel medio cuando aun no hay suficientes datos', async () => {
    const perfil = await service.obtenerPerfil('estudiante-1');

    expect(perfil).toMatchObject({
      intentosAnalizados: 0,
      precisionReciente: null,
      nivelObjetivo: Dificultad.MEDIO,
      mezclaRecomendada: { BASICO: 25, MEDIO: 60, AVANZADO: 15 },
    });
    expect(perfil.rendimientoPorArea).toHaveLength(5);
  });

  it('sube a avanzado con una precision reciente alta', async () => {
    historialRespuesta.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, indice) =>
        historial(indice < 8, `pregunta-${indice}`),
      ),
    );

    const perfil = await service.obtenerPerfil('estudiante-1');

    expect(perfil.precisionReciente).toBe(80);
    expect(perfil.nivelObjetivo).toBe(Dificultad.AVANZADO);
    expect(perfil.mezclaRecomendada).toEqual({
      BASICO: 10,
      MEDIO: 35,
      AVANZADO: 55,
    });
  });

  it('genera un intento adaptativo sin revelar respuestas correctas', async () => {
    pregunta.findMany.mockResolvedValue([
      candidato('basica', Dificultad.BASICO),
      candidato('media', Dificultad.MEDIO),
      candidato('avanzada', Dificultad.AVANZADO),
    ]);

    const resultado = await service.generar('estudiante-1', 5);
    const llamadasPreguntas = pregunta.findMany.mock.calls as unknown as Array<
      [unknown]
    >;
    const llamadaPreguntas = llamadasPreguntas[0];
    const consulta = JSON.stringify(llamadaPreguntas?.[0]);
    const llamadasIntento = intentoSimulacro.create.mock
      .calls as unknown as Array<[{ data: { origen: OrigenRespuesta } }]>;
    const llamadaIntento = llamadasIntento[0];

    expect(resultado.intentoId).toBe('intento-1');
    expect(resultado.preguntas).toHaveLength(3);
    expect(resultado.adaptacion.nivelObjetivo).toBe(Dificultad.MEDIO);
    expect(consulta).not.toContain('esCorrecta');
    expect(consulta).not.toContain('explicacion');
    expect(llamadaIntento?.[0].data.origen).toBe(OrigenRespuesta.ADAPTATIVO);
  });

  it('califica con el origen adaptativo y recalcula el perfil siguiente', async () => {
    calificarRepasoAdaptativo.mockResolvedValue({
      mensaje: 'Completado',
      resumen: {
        totalPreguntas: 1,
        respuestasCorrectas: 1,
        respuestasIncorrectas: 0,
        puntaje: '100%',
        xpGanado: 60,
      },
      desglose: [],
      detalle: [],
    });
    historialRespuesta.findMany.mockResolvedValue([
      historial(true, 'pregunta-1'),
    ]);

    const resultado = await service.calificar('estudiante-1', 'intento-1', [
      { preguntaId: 'pregunta-1', respuestaId: 'respuesta-1' },
    ]);

    expect(calificarRepasoAdaptativo).toHaveBeenCalledWith(
      'estudiante-1',
      'intento-1',
      [{ preguntaId: 'pregunta-1', respuestaId: 'respuesta-1' }],
    );
    expect(resultado.perfilSiguiente.intentosAnalizados).toBe(1);
  });

  it('impide el acceso de profesores y administradores', async () => {
    usuario.findUnique.mockResolvedValue({ rol: RolUsuario.PROFESOR });

    await expect(service.obtenerPerfil('profesor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(historialRespuesta.findMany).not.toHaveBeenCalled();
  });

  function historial(esCorrecta: boolean, preguntaId: string) {
    return {
      preguntaId,
      area: AreaIcfes.MATEMATICAS,
      esCorrecta,
      fechaRespuesta: new Date('2026-08-25T12:00:00.000Z'),
      pregunta: {
        dificultad: Dificultad.MEDIO,
        subtemaId: 'subtema-1',
      },
    };
  }

  function candidato(id: string, dificultad: Dificultad) {
    return {
      id,
      enunciado: `Pregunta ${id}`,
      imagenUrl: null,
      dificultad,
      ordenEnCaso: null,
      caso: null,
      respuestas: [
        { id: `${id}-a`, texto: 'Opcion A' },
        { id: `${id}-b`, texto: 'Opcion B' },
      ],
      subtema: {
        id: 'subtema-1',
        nombre: 'Subtema',
        tema: { nombre: 'Tema', area: AreaIcfes.MATEMATICAS },
      },
    };
  }
});
