/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { PrismaService } from '../prisma/prisma.service';
import { LearningEvidenceService } from '../diagnostico/learning-evidence.service';
import { EvidenceRecord } from '../diagnostico/learning-evidence.rules';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { StudentEvidenceService } from './student-evidence.service';
import { StudentEvidenceController } from './student-evidence.controller';
import { JwtGuard, ProfesorInstitucionGuard } from '../auth/jwt.guard';
import { EmailVerificadoGuard } from '../auth/email-verificado.guard';
import { AuthenticatedRequest } from '../auth/auth.types';

describe('ficha de evidencia docente P2', () => {
  const miembro = {
    id: 'membership',
    institucionId: 'school',
    rol: 'PROFESOR',
  };
  const usuario = { findFirst: jest.fn(), findUnique: jest.fn() };
  const historialRespuesta = { findMany: jest.fn() };
  const prisma = { usuario, historialRespuesta } as unknown as PrismaService;
  const membresia = jest.fn();
  const capacidades = jest.fn();
  const acceso = {
    obtenerMembresiaGestionable: membresia,
    obtenerCapacidadesInstitucion: capacidades,
  } as unknown as InstitucionAccesoService;
  const service = new StudentEvidenceService(
    prisma,
    acceso,
    new LearningEvidenceService(prisma),
  );

  beforeEach(() => {
    jest.resetAllMocks();
    membresia.mockResolvedValue(miembro);
    capacidades.mockResolvedValue({ nivelAnalitica: 'DETALLADA' });
    usuario.findFirst.mockResolvedValue({
      id: 'student',
      nombre: 'Ana',
      ClaseEstudiante: [{ Clase: { id: 'group', nombre: 'Once' } }],
    });
    usuario.findUnique.mockResolvedValue({ rol: 'ESTUDIANTE' });
    historialRespuesta.findMany.mockResolvedValue([]);
  });

  it('restringe alumno y nombres de grupos a institución y asignaciones', async () => {
    const result = await service.obtener('teacher', 'student');
    expect(membresia).toHaveBeenCalledWith('teacher');
    expect(capacidades).toHaveBeenCalledWith('school');
    const grupo = {
      institucionId: 'school',
      profesores: { some: { miembroId: 'membership' } },
    };
    expect(usuario.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'student',
        rol: 'ESTUDIANTE',
        institucionId: 'school',
        ClaseEstudiante: { some: { Clase: grupo } },
      },
      select: {
        id: true,
        nombre: true,
        ClaseEstudiante: {
          where: { Clase: grupo },
          select: { Clase: { select: { id: true, nombre: true } } },
        },
      },
    });
    expect(result).toMatchObject({
      version: 1,
      estudiante: {
        id: 'student',
        nombre: 'Ana',
        grupos: [{ id: 'group', nombre: 'Once' }],
      },
      evidencia: { temas: [], parcial: false },
    });
    expect(usuario.findFirst).toHaveBeenCalledTimes(2);
    expect(historialRespuesta.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuarioId: 'student' }),
        take: 10001,
      }),
    );
    for (const campo of [
      'correo',
      'preguntaId',
      'respuestaCorrectaId',
      'sesionId',
    ])
      expect(JSON.stringify(result)).not.toContain(`"${campo}"`);
  });

  it.each(['PROPIETARIO', 'ADMINISTRADOR'])(
    '%s conserva alcance institucional, no global',
    async (rol) => {
      membresia.mockResolvedValue({ ...miembro, rol });
      await service.obtener('teacher', 'student');
      expect(usuario.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'student', rol: 'ESTUDIANTE', institucionId: 'school' },
        }),
      );
    },
  );

  it('no distingue estudiante inexistente de uno fuera del alcance', async () => {
    usuario.findFirst.mockResolvedValue(null);
    await expect(
      service.obtener('teacher', 'other-school'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(historialRespuesta.findMany).not.toHaveBeenCalled();
  });

  it.each(['BASICA', undefined])(
    'rechaza plan sin derecho detallado: %s',
    async (nivelAnalitica) => {
      capacidades.mockResolvedValue({ nivelAnalitica });
      await expect(
        service.obtener('teacher', 'student'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(usuario.findFirst).not.toHaveBeenCalled();
      expect(historialRespuesta.findMany).not.toHaveBeenCalled();
    },
  );

  it('rechaza rol de membresía desconocido', async () => {
    membresia.mockResolvedValue({ ...miembro, rol: 'DESCONOCIDO' });
    await expect(service.obtener('teacher', 'student')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(historialRespuesta.findMany).not.toHaveBeenCalled();
  });

  it('no devuelve la ficha si el estudiante deja de estar autorizado durante la consulta', async () => {
    usuario.findFirst
      .mockResolvedValueOnce({
        id: 'student',
        nombre: 'Ana',
        ClaseEstudiante: [],
      })
      .mockResolvedValueOnce(null);
    await expect(service.obtener('teacher', 'student')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('no entrega la ficha si vence el plan mientras se calcula', async () => {
    capacidades
      .mockResolvedValueOnce({ nivelAnalitica: 'DETALLADA' })
      .mockResolvedValueOnce({ nivelAnalitica: 'BASICA' });
    await expect(service.obtener('teacher', 'student')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('reutiliza evidencia: un error aislado no es una falencia y conserva su fecha', async () => {
    const now = new Date();
    const row: EvidenceRecord = {
      id: 'answer',
      preguntaId: 'question',
      sesionId: 'session',
      area: 'INGLES',
      esCorrecta: false,
      fechaRespuesta: now,
      pregunta: {
        estadoContenido: 'PUBLICADO',
        subtema: {
          id: 'sub',
          nombre: 'Verbo to be',
          estadoContenido: 'PUBLICADO',
          tema: {
            id: 'topic',
            nombre: 'Gramática',
            area: 'INGLES',
            estadoContenido: 'PUBLICADO',
          },
        },
      },
    };
    historialRespuesta.findMany.mockResolvedValue([row]);
    const result = await service.obtener('teacher', 'student');
    expect(result.evidencia.temas[0].subtemas[0]).toMatchObject({
      preguntasUnicas: 1,
      incorrectas: 1,
      estado: 'EVIDENCIA_INSUFICIENTE',
      ultimaEvidencia: now.toISOString(),
    });
  });

  it('propaga error de base sin presentarlo como falta de evidencia', async () => {
    historialRespuesta.findMany.mockRejectedValue(new Error('offline'));
    await expect(service.obtener('teacher', 'student')).rejects.toThrow(
      'offline',
    );
  });

  it('el controlador conserva guardas y usa el actor autenticado', async () => {
    const obtener = jest.fn().mockResolvedValue({});
    const controller = new StudentEvidenceController({
      obtener,
    } as unknown as StudentEvidenceService);
    await controller.obtener(
      {
        usuario: { sub: 'teacher' },
        query: { actorId: 'owner' },
      } as unknown as AuthenticatedRequest,
      'student',
    );
    expect(obtener).toHaveBeenCalledWith('teacher', 'student');
    expect(
      Reflect.getMetadata(GUARDS_METADATA, StudentEvidenceController),
    ).toEqual([JwtGuard, EmailVerificadoGuard, ProfesorInstitucionGuard]);
  });
});
