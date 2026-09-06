import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { JwtGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';
import { LearningEvidenceService } from './learning-evidence.service';
import { LearningEvidenceController } from './learning-evidence.controller';

describe('LearningEvidenceService', () => {
  const usuario = { findUnique: jest.fn() };
  const historialRespuesta = { findMany: jest.fn() };
  const service = new LearningEvidenceService({
    usuario,
    historialRespuesta,
  } as unknown as PrismaService);
  beforeEach(() => {
    jest.resetAllMocks();
    usuario.findUnique.mockResolvedValue({ rol: 'ESTUDIANTE' });
    historialRespuesta.findMany.mockResolvedValue([]);
  });

  it('consulta solo el historial propio, acotado y sin contenido de preguntas', async () => {
    await service.obtener('user-1');
    expect(historialRespuesta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuarioId: 'user-1',
          fechaRespuesta: { gte: expect.any(Date), lte: expect.any(Date) },
        },
        take: 10001,
        orderBy: [{ fechaRespuesta: 'asc' }, { id: 'asc' }],
      }),
    );
    const select = JSON.stringify(
      historialRespuesta.findMany.mock.calls[0][0].select,
    );
    expect(select).not.toContain('enunciado');
    expect(select).not.toContain('respuestaCorrectaId');
  });

  it('rechaza usuario inexistente antes de consultar historial', async () => {
    usuario.findUnique.mockResolvedValue(null);
    await expect(service.obtener('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(historialRespuesta.findMany).not.toHaveBeenCalled();
  });

  it.each(['PROFESOR', 'ADMIN'])('rechaza rol %s', async (rol) => {
    usuario.findUnique.mockResolvedValue({ rol });
    await expect(service.obtener('user-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(historialRespuesta.findMany).not.toHaveBeenCalled();
  });

  it('señala el límite de historial como parcial, sin emitir conclusiones', async () => {
    const row = {
      id: 'r1',
      preguntaId: 'p1',
      sesionId: 's1',
      area: 'MATEMATICAS',
      fechaRespuesta: new Date(),
      esCorrecta: true,
      pregunta: {
        estadoContenido: 'PUBLICADO',
        subtema: {
          id: 'sub1',
          nombre: 'Regla de tres',
          estadoContenido: 'PUBLICADO',
          tema: {
            id: 't1',
            nombre: 'Proporcionalidad',
            area: 'MATEMATICAS',
            estadoContenido: 'PUBLICADO',
          },
        },
      },
    };
    historialRespuesta.findMany.mockResolvedValue(
      Array.from({ length: 10001 }, () => row),
    );
    const result = await service.obtener('user-1');
    expect(result.parcial).toBe(true);
    expect(result.repeticionesIgnoradas).toBe(9999);
    expect(result.temas[0].estado).toBe('EVIDENCIA_INSUFICIENTE');
  });

  it('propaga fallo de base; no lo presenta como historial vacío', async () => {
    historialRespuesta.findMany.mockRejectedValue(new Error('offline'));
    await expect(service.obtener('user-1')).rejects.toThrow('offline');
  });

  it('el controlador usa la identidad autenticada, nunca la indicada por query', async () => {
    const obtener = jest.fn().mockResolvedValue({ temas: [] });
    const controller = new LearningEvidenceController({
      obtener,
    } as unknown as LearningEvidenceService);
    await controller.obtener({
      usuario: { sub: 'own' },
      query: { usuarioId: 'other' },
    } as unknown as AuthenticatedRequest);
    expect(obtener).toHaveBeenCalledWith('own');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, LearningEvidenceController),
    ).toEqual([JwtGuard, EmailVerificadoGuard]);
  });
});
