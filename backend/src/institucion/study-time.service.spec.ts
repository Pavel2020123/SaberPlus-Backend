/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StudentEvidenceService } from './student-evidence.service';
import { StudyTimeService } from './study-time.service';

describe('P4-A alcance y revalidación', () => {
  const user = { findUnique: jest.fn() };
  const history = { findMany: jest.fn() };
  const blocks = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const authorize = jest.fn();
  const transaction = jest.fn();
  const tx = {
    usuario: user,
    historialRespuesta: history,
    pomodoroRegistrado: blocks,
    $queryRaw: jest.fn(),
  };
  const prisma = {
    ...tx,
    $transaction: transaction,
  } as unknown as PrismaService;
  const service = new StudyTimeService(prisma, {
    estudianteAutorizado: authorize,
  } as unknown as StudentEvidenceService);
  const student = {
    id: 'student',
    nombre: 'Ana',
    ClaseEstudiante: [{ Clase: { id: 'group', nombre: 'Once' } }],
  };
  const event = {
    eventoId: 'pomodoro:11111111-1111-4111-8111-111111111111',
    duracionSegundos: 1500,
    finalizadoEn: '2026-09-13T15:00:00Z',
  };
  beforeEach(() => {
    jest.resetAllMocks();
    user.findUnique.mockResolvedValue({ rol: 'ESTUDIANTE' });
    history.findMany.mockResolvedValue([]);
    blocks.findMany.mockResolvedValue([]);
    transaction.mockImplementation((fn: (db: typeof tx) => unknown) => fn(tx));
    authorize.mockResolvedValue(student);
  });
  it('la consulta propia solo lee al actor y vuelve a verificar el rol', async () => {
    await service.ownSummary('student', 7);
    expect(user.findUnique).toHaveBeenCalledTimes(2);
    expect(history.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuarioId: 'student' }),
        take: 10001,
      }),
    );
    expect(blocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuarioId: 'student' }),
      }),
    );
  });
  it('no lee si no es estudiante', async () => {
    user.findUnique.mockResolvedValue({ rol: 'PROFESOR' });
    await expect(service.ownSummary('teacher', 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(history.findMany).not.toHaveBeenCalled();
  });
  it('no entrega datos tras cambiar el rol durante la lectura', async () => {
    user.findUnique
      .mockResolvedValueOnce({ rol: 'ESTUDIANTE' })
      .mockResolvedValueOnce({ rol: 'PROFESOR' });
    await expect(service.ownSummary('student', 7)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
  it('reutiliza dos veces el alcance P2 sin exponer identidad privada o preguntas', async () => {
    user.findUnique.mockResolvedValue({ rol: 'PROFESOR' });
    const result = await service.teacherSummary('teacher', 'student', 30);
    expect(authorize).toHaveBeenCalledTimes(2);
    expect(authorize).toHaveBeenNthCalledWith(1, 'teacher', 'student');
    expect(result.estudiante).toEqual({
      id: 'student',
      nombre: 'Ana',
      grupos: [{ id: 'group', nombre: 'Once' }],
    });
    expect(result.evolucion.dias).toBe(30);
  });
  it('el plan o alcance rechazado no llega a consultar tiempo', async () => {
    user.findUnique.mockResolvedValue({ rol: 'PROFESOR' });
    authorize.mockRejectedValue(new ForbiddenException());
    await expect(
      service.teacherSummary('teacher', 'student', 30),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(history.findMany).not.toHaveBeenCalled();
  });
  it('no entrega evolución si se retira al estudiante mientras se consulta', async () => {
    user.findUnique.mockResolvedValue({ rol: 'PROFESOR' });
    authorize
      .mockResolvedValueOnce(student)
      .mockRejectedValueOnce(new NotFoundException());
    await expect(
      service.teacherSummary('teacher', 'student', 30),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
  it('reintentar el mismo bloque confirmado funciona aunque ya tenga más de 90 días', async () => {
    const old = { ...event, finalizadoEn: '2020-01-01T15:00:00Z' };
    blocks.findUnique.mockResolvedValue({
      finalizadoEn: new Date(old.finalizadoEn),
    });
    const result = await service.synchronize('student', {
      version: 1,
      eventos: [old],
    });
    expect(result.confirmados[0].reutilizado).toBe(true);
    expect(blocks.create).not.toHaveBeenCalled();
  });
  it('no permite cambiar el cuerpo de un ID confirmado', async () => {
    blocks.findUnique.mockResolvedValue({
      finalizadoEn: new Date('2020-01-01T15:00:00Z'),
    });
    await expect(
      service.synchronize('student', { version: 1, eventos: [event] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(blocks.create).not.toHaveBeenCalled();
  });
});
