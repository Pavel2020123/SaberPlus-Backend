import { ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  AreaIcfes,
  EstadoCuadernoError,
  OrigenRespuesta,
  RolUsuario,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CuadernoErroresService } from './cuaderno-errores.service';

describe('CuadernoErroresService', () => {
  const usuario = { findUnique: jest.fn() };
  const historialRespuesta = {
    groupBy: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  };
  const cuadernoError = { findMany: jest.fn(), upsert: jest.fn() };
  const prisma = {
    usuario,
    historialRespuesta,
    cuadernoError,
  } as unknown as PrismaService;
  const service = new CuadernoErroresService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    usuario.findUnique.mockResolvedValue({ rol: RolUsuario.ESTUDIANTE });
    historialRespuesta.groupBy.mockResolvedValue([]);
  });

  it('agrupa intentos fallidos y conserva solo el error mas reciente', async () => {
    const ultimoError = new Date('2026-08-25T16:00:00.000Z');
    historialRespuesta.groupBy.mockResolvedValue([
      {
        preguntaId: 'pregunta-1',
        _count: { preguntaId: 3 },
        _max: { fechaRespuesta: ultimoError },
      },
    ]);
    historialRespuesta.findMany.mockResolvedValue([
      respuestaFallida(ultimoError),
    ]);
    cuadernoError.findMany.mockResolvedValue([]);

    const resultado = await service.listar('estudiante-1');

    expect(resultado.resumen).toEqual({
      total: 1,
      pendientes: 1,
      repasando: 0,
      dominados: 0,
    });
    expect(resultado.errores).toHaveLength(1);
    expect(resultado.errores[0]).toMatchObject({
      preguntaId: 'pregunta-1',
      vecesFallada: 3,
      estado: EstadoCuadernoError.PENDIENTE,
      respuestaSeleccionada: { id: 'respuesta-b', texto: 'Opcion B' },
      respuestaCorrecta: { id: 'respuesta-a', texto: 'Opcion A' },
    });
  });

  it('reabre como repasando un error dominado que volvio a fallarse', async () => {
    const ultimoError = new Date('2026-08-25T16:00:00.000Z');
    historialRespuesta.groupBy.mockResolvedValue([
      {
        preguntaId: 'pregunta-1',
        _count: { preguntaId: 2 },
        _max: { fechaRespuesta: ultimoError },
      },
    ]);
    historialRespuesta.findMany.mockResolvedValue([
      respuestaFallida(ultimoError),
    ]);
    cuadernoError.findMany.mockResolvedValue([
      {
        preguntaId: 'pregunta-1',
        nota: 'Revisar la regla.',
        estado: EstadoCuadernoError.DOMINADO,
        dominadoEn: new Date('2026-08-24T16:00:00.000Z'),
        fechaActualizacion: new Date('2026-08-24T16:00:00.000Z'),
      },
    ]);

    const resultado = await service.listar('estudiante-1');

    expect(resultado.errores[0].estado).toBe(EstadoCuadernoError.REPASANDO);
    expect(resultado.resumen.repasando).toBe(1);
  });

  it('guarda la nota recortada y el momento de dominio', async () => {
    historialRespuesta.findFirst.mockResolvedValue({
      preguntaId: 'pregunta-1',
    });
    cuadernoError.upsert.mockImplementation(
      ({
        create,
      }: {
        create: {
          nota: string;
          estado: EstadoCuadernoError;
          dominadoEn: Date;
        };
      }) =>
        Promise.resolve({
          preguntaId: 'pregunta-1',
          nota: create.nota,
          estado: create.estado,
          dominadoEn: create.dominadoEn,
          fechaActualizacion: new Date(),
        }),
    );

    const resultado = await service.actualizar('estudiante-1', 'pregunta-1', {
      nota: '  Confundi los signos.  ',
      estado: EstadoCuadernoError.DOMINADO,
    });

    expect(resultado.nota).toBe('Confundi los signos.');
    expect(resultado.dominadoEn).toBeInstanceOf(Date);
  });

  it('no permite agregar preguntas que el estudiante no ha fallado', async () => {
    historialRespuesta.findFirst.mockResolvedValue(null);

    await expect(
      service.actualizar('estudiante-1', 'pregunta-ajena', {
        nota: 'No corresponde.',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(cuadernoError.upsert).not.toHaveBeenCalled();
  });

  it('impide el acceso de profesores y administradores', async () => {
    usuario.findUnique.mockResolvedValue({ rol: RolUsuario.PROFESOR });

    await expect(service.listar('profesor-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(historialRespuesta.groupBy).not.toHaveBeenCalled();
  });

  function respuestaFallida(fechaRespuesta: Date) {
    return {
      preguntaId: 'pregunta-1',
      respuestaSeleccionadaId: 'respuesta-b',
      respuestaCorrectaId: 'respuesta-a',
      fechaRespuesta,
      area: AreaIcfes.MATEMATICAS,
      origen: OrigenRespuesta.PRACTICA,
      pregunta: {
        enunciado: 'Cuanto es 2 + 2?',
        explicacion: 'La suma da cuatro.',
        dificultad: 'BAJO',
        caso: null,
        subtema: {
          nombre: 'Suma',
          tema: { nombre: 'Aritmetica' },
        },
        respuestas: [
          {
            id: 'respuesta-a',
            texto: 'Opcion A',
            explicacion: 'Es cuatro.',
            esCorrecta: true,
          },
          {
            id: 'respuesta-b',
            texto: 'Opcion B',
            explicacion: null,
            esCorrecta: false,
          },
        ],
      },
    };
  }
});
