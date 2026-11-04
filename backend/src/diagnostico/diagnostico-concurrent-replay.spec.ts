import { Prisma } from '@prisma/client';
import { DiagnosticoService } from './diagnostico.service';
import { PrismaService } from '../prisma/prisma.service';

const collision = (target: string[]) =>
  new Prisma.PrismaClientKnownRequestError('Synthetic collision', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });
function fixture(error: Error) {
  const active = {
    id: 'diagnostic',
    usuarioId: 'student',
    preguntaIds: ['question'],
    totalPreguntas: 1,
    completadoEn: null,
    iniciadoEn: new Date(),
  };
  const completed = {
    ...active,
    completadoEn: new Date(),
    respuestasCorrectas: 1,
    porcentaje: 100,
    nivel: 'FORTALEZA',
    resultadosPorArea: [{ area: 'MATEMATICAS' }],
  };
  const findUnique = jest
    .fn()
    .mockResolvedValueOnce(active)
    .mockResolvedValue(completed);
  const prisma = {
    usuario: { findUnique: jest.fn().mockResolvedValue({ rol: 'ESTUDIANTE' }) },
    diagnosticoInicial: {
      findUnique,
      create: jest.fn().mockRejectedValue(error),
      update: jest.fn().mockResolvedValue({}),
    },
    pregunta: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'question',
          respuestas: [{ id: 'yes', esCorrecta: true }],
          subtema: { tema: { area: 'MATEMATICAS' } },
        },
      ]),
    },
    diagnosticoResultadoArea: { createMany: jest.fn().mockResolvedValue({}) },
    historialRespuesta: { createMany: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockRejectedValue(error),
  };
  return {
    prisma,
    findUnique,
    active,
    completed,
    service: new DiagnosticoService(prisma as unknown as PrismaService),
  };
}
const answers = [{ preguntaId: 'question', respuestaId: 'yes' }];
describe('diagnostic concurrent replay recovery', () => {
  it('recovers the exact committed per-area collision without retrying writes', async () => {
    const f = fixture(collision(['diagnosticoId', 'area']));
    await expect(
      f.service.finalizar('student', answers),
    ).resolves.toMatchObject({
      estado: 'COMPLETADO',
      diagnosticoId: 'diagnostic',
      respuestasCorrectas: 1,
    });
    expect(f.prisma.$transaction).toHaveBeenCalledTimes(1);
  });
  it.each([collision(['id']), new Error('storage outage')])(
    'does not conceal unrelated persistence failures',
    async (error) => {
      const f = fixture(error);
      await expect(f.service.finalizar('student', answers)).rejects.toBe(error);
    },
  );
  it('does not claim success if completion cannot be verified', async () => {
    const error = collision(['diagnosticoId', 'area']);
    const f = fixture(error);
    f.findUnique.mockResolvedValue(f.active);
    await expect(f.service.finalizar('student', answers)).rejects.toBe(error);
  });
  it('does not recover a different diagnostic identity', async () => {
    const error = collision(['diagnosticoId', 'area']);
    const f = fixture(error);
    f.findUnique
      .mockReset()
      .mockResolvedValueOnce(f.active)
      .mockResolvedValue({ ...f.completed, id: 'other' });
    await expect(f.service.finalizar('student', answers)).rejects.toBe(error);
  });
  it('recovers the persisted question set after a concurrent start', async () => {
    const f = fixture(collision(['usuarioId']));
    f.prisma.pregunta.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ id: `q${i}` })),
    );
    f.findUnique
      .mockReset()
      .mockResolvedValueOnce(null)
      .mockResolvedValue(f.completed);
    await expect(f.service.iniciar('student')).resolves.toMatchObject({
      estado: 'COMPLETADO',
      diagnosticoId: 'diagnostic',
    });
    expect(f.prisma.diagnosticoInicial.create).toHaveBeenCalledTimes(1);
  });
  it('does not hide unrelated start collisions', async () => {
    const error = collision(['id']);
    const f = fixture(error);
    f.prisma.pregunta.findMany.mockResolvedValue(
      Array.from({ length: 3 }, (_, i) => ({ id: `q${i}` })),
    );
    f.findUnique.mockReset().mockResolvedValue(null);
    await expect(f.service.iniciar('student')).rejects.toBe(error);
  });
});
