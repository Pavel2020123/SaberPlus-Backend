import { ForbiddenException } from '@nestjs/common';
import { Prisma, PrioridadDocente } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { TeacherPrioritiesService } from './teacher-priorities.service';

describe('revalidación de lecturas privadas P3-A', () => {
  const now = new Date();
  const priority: PrioridadDocente = {
    id: 'priority',
    claseId: 'group',
    creadoPorId: 'teacher',
    huellaSolicitud: 'hash',
    area: 'MATEMATICAS',
    temaId: 'theme',
    temaNombre: 'Proporciones',
    subtemaId: null,
    subtemaNombre: null,
    preguntaIds: ['q1', 'q2', 'q3', 'q4', 'q5'],
    metaPreguntas: 5,
    creadoEn: new Date(now.getTime() - 10000),
    venceEn: new Date(now.getTime() + 10000),
    retiradoEn: null,
  };
  const db = {
    usuario: { findUnique: jest.fn() },
    prioridadDocente: { findFirst: jest.fn(), findMany: jest.fn() },
    claseEstudiante: { findMany: jest.fn() },
    pregunta: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  };
  const access = {
    obtenerGrupoGestionable: jest.fn(),
    obtenerCapacidadesInstitucion: jest.fn(),
  };
  const service = new TeacherPrioritiesService(
    db as unknown as PrismaService,
    access as unknown as InstitucionAccesoService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(
      (operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
        operation(db as unknown as Prisma.TransactionClient),
    );
    db.usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: 'school',
    });
    access.obtenerGrupoGestionable.mockResolvedValue({
      grupo: { id: 'group', institucionId: 'school' },
      membresia: { id: 'member', rol: 'PROFESOR', institucionId: 'school' },
    });
    access.obtenerCapacidadesInstitucion.mockResolvedValue({
      prioridadesHabilitadas: true,
    });
    db.prioridadDocente.findFirst.mockResolvedValue(priority);
    db.claseEstudiante.findMany.mockResolvedValue([
      {
        usuarioId: 'student',
        claseId: 'group',
        fechaIngreso: priority.creadoEn,
        Usuario: { nombre: 'Ana' },
      },
    ]);
    db.$queryRaw.mockResolvedValue([{ usuarioId: 'student', cantidad: 5 }]);
    db.pregunta.findMany.mockResolvedValue(
      priority.preguntaIds.map((id) => ({ id })),
    );
  });

  it('si vence el plan durante el informe, no entrega el resultado anterior', async () => {
    access.obtenerCapacidadesInstitucion
      .mockResolvedValueOnce({ prioridadesHabilitadas: true })
      .mockResolvedValue({ prioridadesHabilitadas: false });
    await expect(
      service.report('teacher', 'group', 'priority', 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.$queryRaw).toHaveBeenCalledTimes(1);
  });
  it('si se retira un estudiante durante el informe, excluye su ficha', async () => {
    db.claseEstudiante.findMany
      .mockResolvedValueOnce([
        {
          usuarioId: 'student',
          fechaIngreso: priority.creadoEn,
          Usuario: { nombre: 'Ana' },
        },
      ])
      .mockResolvedValue([]);
    expect(
      (await service.report('teacher', 'group', 'priority', 1)).estudiantes,
    ).toEqual([]);
  });
  it('revalida identidad e institución antes de devolver la lista al alumno', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      institucionId: 'school',
    });
    db.prioridadDocente.findMany.mockResolvedValue([
      {
        ...priority,
        clase: {
          nombre: 'Once',
          ClaseEstudiante: [{ fechaIngreso: priority.creadoEn }],
        },
      },
    ]);
    db.claseEstudiante.findMany.mockResolvedValue([]);
    const result = await service.listForStudent('student', 1);
    expect(result.prioridades).toEqual([]);
    expect(db.prioridadDocente.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          clase: {
            ClaseEstudiante: {
              some: {
                usuarioId: 'student',
                aceptacionExplicita: true,
                Clase: { institucionId: 'school' },
                Usuario: { rol: 'ESTUDIANTE', institucionId: 'school' },
              },
            },
          },
        },
        take: 21,
      }),
    );
  });
  it('cambio de rol durante la lectura no devuelve datos privados', async () => {
    db.usuario.findUnique
      .mockResolvedValueOnce({ rol: 'PROFESOR', institucionId: 'school' })
      .mockResolvedValue({ rol: 'ESTUDIANTE', institucionId: 'school' });
    await expect(
      service.report('teacher', 'group', 'priority', 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('membresía residual de otra institución se rechaza antes de leer prioridades', async () => {
    db.usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      institucionId: 'other',
    });
    await expect(
      service.report('teacher', 'group', 'priority', 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.prioridadDocente.findFirst).not.toHaveBeenCalled();
  });
});
