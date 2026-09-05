import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService - estadísticas por pregunta', () => {
  const preguntaRepositorio = {
    findUnique: jest.fn(),
  };
  const historialRepositorio = {
    aggregate: jest.fn(),
    groupBy: jest.fn(),
  };
  const prisma = {
    pregunta: preguntaRepositorio,
    historialRespuesta: historialRepositorio,
  } as unknown as PrismaService;
  const service = new AdminService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    preguntaRepositorio.findUnique.mockResolvedValue({
      id: 'pregunta-1',
      enunciado: '¿Cuál opción es correcta?',
      dificultad: 'MEDIO',
      subtema: {
        nombre: 'Comprensión',
        tema: { nombre: 'Lectura', area: 'LECTURA_CRITICA' },
      },
      respuestas: [
        { id: 'respuesta-a', texto: 'A', esCorrecta: true },
        { id: 'respuesta-b', texto: 'B', esCorrecta: false },
      ],
    });
  });

  it('calcula métricas reales y distribución de opciones', async () => {
    historialRepositorio.aggregate.mockResolvedValue({
      _count: { _all: 10 },
      _avg: { tiempoRespuestaSegundos: 32.46 },
      _max: { fechaRespuesta: new Date('2026-08-20T15:00:00Z') },
    });
    historialRepositorio.groupBy
      .mockResolvedValueOnce([
        { esCorrecta: true, _count: { _all: 7 } },
        { esCorrecta: false, _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { respuestaSeleccionadaId: 'respuesta-a', _count: { _all: 7 } },
        { respuestaSeleccionadaId: 'respuesta-b', _count: { _all: 3 } },
      ])
      .mockResolvedValueOnce([
        { usuarioId: 'usuario-1' },
        { usuarioId: 'usuario-2' },
        { usuarioId: 'usuario-3' },
      ])
      .mockResolvedValueOnce([
        { origen: 'SIMULACRO', _count: { _all: 6 } },
        { origen: 'PRACTICA', _count: { _all: 4 } },
      ]);

    const resultado = await service.obtenerEstadisticasPregunta('pregunta-1');

    expect(resultado).toMatchObject({
      totalIntentos: 10,
      estudiantesUnicos: 3,
      correctas: 7,
      incorrectas: 3,
      porcentajeAciertos: 70,
      dificultadObservada: 'MEDIA',
      tiempoPromedioSegundos: 32.5,
      porOrigen: {
        SIMULACRO: 6,
        PERSONALIZADO: 0,
        PRACTICA: 4,
        DIAGNOSTICO: 0,
      },
      opciones: [
        expect.objectContaining({
          id: 'respuesta-a',
          selecciones: 7,
          porcentaje: 70,
        }),
        expect.objectContaining({
          id: 'respuesta-b',
          selecciones: 3,
          porcentaje: 30,
        }),
      ],
    });
  });

  it('devuelve un estado sin datos cuando nadie respondió', async () => {
    historialRepositorio.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _avg: { tiempoRespuestaSegundos: null },
      _max: { fechaRespuesta: null },
    });
    historialRepositorio.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const resultado = await service.obtenerEstadisticasPregunta('pregunta-1');

    expect(resultado).toMatchObject({
      totalIntentos: 0,
      estudiantesUnicos: 0,
      porcentajeAciertos: 0,
      dificultadObservada: 'SIN_DATOS',
      tiempoPromedioSegundos: null,
      ultimaRespuesta: null,
    });
    expect(resultado.opciones.every((opcion) => opcion.porcentaje === 0)).toBe(
      true,
    );
  });

  it('rechaza una pregunta inexistente', async () => {
    preguntaRepositorio.findUnique.mockResolvedValue(null);

    await expect(
      service.obtenerEstadisticasPregunta('no-existe'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(historialRepositorio.aggregate).not.toHaveBeenCalled();
  });
});
