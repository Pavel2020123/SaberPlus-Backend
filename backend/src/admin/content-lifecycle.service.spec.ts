import { BadRequestException } from '@nestjs/common';
import { EstadoContenido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ContentLifecycleService } from './content-lifecycle.service';

describe('ContentLifecycleService', () => {
  const tema = { findUnique: jest.fn(), update: jest.fn() };
  const subtema = { findUnique: jest.fn(), update: jest.fn() };
  const pregunta = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  };
  const casoPregunta = { findUnique: jest.fn(), update: jest.fn() };
  const prisma = {
    tema,
    subtema,
    pregunta,
    casoPregunta,
  } as unknown as PrismaService;
  const service = new ContentLifecycleService(prisma);

  beforeEach(() => {
    jest.resetAllMocks();
    pregunta.findFirst.mockResolvedValue(null);
  });

  it('envía un tema borrador a revisión sin publicarlo', async () => {
    tema.findUnique.mockResolvedValue({
      id: 'tema-1',
      nombre: 'Álgebra',
      estadoContenido: EstadoContenido.BORRADOR,
    });
    tema.update.mockResolvedValue({
      id: 'tema-1',
      estadoContenido: EstadoContenido.EN_REVISION,
    });

    await service.cambiarEstadoTema('tema-1', EstadoContenido.EN_REVISION);

    expect(tema.update).toHaveBeenCalledWith({
      where: { id: 'tema-1' },
      data: { estadoContenido: EstadoContenido.EN_REVISION },
    });
  });

  it('impide publicar directamente desde borrador', async () => {
    tema.findUnique.mockResolvedValue({
      id: 'tema-1',
      nombre: 'Álgebra',
      estadoContenido: EstadoContenido.BORRADOR,
    });

    await expect(
      service.cambiarEstadoTema('tema-1', EstadoContenido.PUBLICADO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tema.update).not.toHaveBeenCalled();
  });

  it('exige que el tema esté publicado antes de publicar su subtema', async () => {
    subtema.findUnique.mockResolvedValue({
      id: 'subtema-1',
      nombre: 'Ecuaciones',
      estadoContenido: EstadoContenido.EN_REVISION,
      tema: { estadoContenido: EstadoContenido.EN_REVISION },
    });

    await expect(
      service.cambiarEstadoSubtema('subtema-1', EstadoContenido.PUBLICADO),
    ).rejects.toThrow('Publica primero el tema');
    expect(subtema.update).not.toHaveBeenCalled();
  });

  it('publica una pregunta válida y registra la fecha', async () => {
    pregunta.findUnique.mockResolvedValue({
      id: 'pregunta-1',
      enunciado: '¿Cuánto es 2 + 2?',
      imagenUrl: null,
      huellaContenido: null,
      estadoContenido: EstadoContenido.EN_REVISION,
      respuestas: [
        { texto: '4', esCorrecta: true },
        { texto: '5', esCorrecta: false },
      ],
      subtema: {
        estadoContenido: EstadoContenido.PUBLICADO,
        tema: {
          estadoContenido: EstadoContenido.PUBLICADO,
          area: 'MATEMATICAS',
        },
      },
      caso: null,
    });
    pregunta.update.mockResolvedValue({
      id: 'pregunta-1',
      estadoContenido: EstadoContenido.PUBLICADO,
    });

    await service.cambiarEstadoPregunta(
      'pregunta-1',
      EstadoContenido.PUBLICADO,
    );

    expect(pregunta.update).toHaveBeenCalledTimes(1);
    const [llamada] = pregunta.update.mock.calls[0] as unknown as [
      {
        where: { id: string };
        data: {
          estadoContenido: EstadoContenido;
          fechaPublicacion: Date;
          huellaContenido: string;
        };
      },
    ];
    expect(llamada.where).toEqual({ id: 'pregunta-1' });
    expect(llamada.data.estadoContenido).toBe(EstadoContenido.PUBLICADO);
    expect(llamada.data.fechaPublicacion).toBeInstanceOf(Date);
    expect(llamada.data.huellaContenido).toHaveLength(64);
    expect(pregunta.findFirst).toHaveBeenCalledWith({
      where: {
        id: { not: 'pregunta-1' },
        huellaContenido: llamada.data.huellaContenido,
        estadoContenido: EstadoContenido.PUBLICADO,
      },
      select: { id: true },
    });
  });

  it('impide publicar una segunda copia de la misma pregunta', async () => {
    pregunta.findUnique.mockResolvedValue({
      id: 'pregunta-2',
      enunciado: '¿Cuánto es 2 + 2?',
      imagenUrl: null,
      huellaContenido: 'a'.repeat(64),
      estadoContenido: EstadoContenido.EN_REVISION,
      respuestas: [
        { texto: '4', esCorrecta: true },
        { texto: '5', esCorrecta: false },
      ],
      subtema: {
        estadoContenido: EstadoContenido.PUBLICADO,
        tema: {
          estadoContenido: EstadoContenido.PUBLICADO,
          area: 'MATEMATICAS',
        },
      },
      caso: null,
    });
    pregunta.findFirst.mockResolvedValue({ id: 'pregunta-publicada' });

    await expect(
      service.cambiarEstadoPregunta('pregunta-2', EstadoContenido.PUBLICADO),
    ).rejects.toThrow('ya se encuentra publicada');
    expect(pregunta.update).not.toHaveBeenCalled();
  });

  it('rechaza una pregunta sin una única respuesta correcta', async () => {
    pregunta.findUnique.mockResolvedValue({
      id: 'pregunta-1',
      enunciado: 'Pregunta incompleta',
      estadoContenido: EstadoContenido.EN_REVISION,
      respuestas: [
        { texto: 'A', esCorrecta: false },
        { texto: 'B', esCorrecta: false },
      ],
      subtema: {
        estadoContenido: EstadoContenido.PUBLICADO,
        tema: { estadoContenido: EstadoContenido.PUBLICADO },
      },
      caso: null,
    });

    await expect(
      service.cambiarEstadoPregunta('pregunta-1', EstadoContenido.PUBLICADO),
    ).rejects.toThrow('exactamente una respuesta correcta');
    expect(pregunta.update).not.toHaveBeenCalled();
  });

  it('permite archivar un caso publicado sin borrarlo', async () => {
    casoPregunta.findUnique.mockResolvedValue({
      id: 'caso-1',
      contexto: 'Texto compartido',
      estadoContenido: EstadoContenido.PUBLICADO,
    });
    casoPregunta.update.mockResolvedValue({
      id: 'caso-1',
      estadoContenido: EstadoContenido.ARCHIVADO,
    });

    await service.cambiarEstadoCaso('caso-1', EstadoContenido.ARCHIVADO);

    expect(casoPregunta.update).toHaveBeenCalledWith({
      where: { id: 'caso-1' },
      data: { estadoContenido: EstadoContenido.ARCHIVADO },
    });
  });
});
