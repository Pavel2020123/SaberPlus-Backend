import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TutorialService, VERSION_TUTORIAL } from './tutorial.service';

describe('TutorialService', () => {
  const usuario = { findUnique: jest.fn(), update: jest.fn() };
  const prisma = { usuario } as unknown as PrismaService;
  const service = new TutorialService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('marca como pendiente el tutorial nuevo del estudiante', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      tutorialEstudianteVersion: 0,
      tutorialProfesorVersion: 0,
    });

    await expect(service.obtenerEstado('usuario-1')).resolves.toEqual({
      disponible: true,
      pendiente: true,
      rol: 'ESTUDIANTE',
      versionActual: VERSION_TUTORIAL,
      versionVista: 0,
    });
  });

  it('guarda la versión correspondiente al profesor', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'PROFESOR',
      tutorialEstudianteVersion: 0,
      tutorialProfesorVersion: 0,
    });
    usuario.update.mockResolvedValue({});

    await service.completar('profesor-1');

    expect(usuario.update).toHaveBeenCalledWith({
      where: { id: 'profesor-1' },
      data: { tutorialProfesorVersion: VERSION_TUTORIAL },
    });
  });

  it('no vuelve a mostrar una versión ya completada', async () => {
    usuario.findUnique.mockResolvedValue({
      rol: 'ESTUDIANTE',
      tutorialEstudianteVersion: VERSION_TUTORIAL,
      tutorialProfesorVersion: 0,
    });

    const estado = await service.obtenerEstado('usuario-1');

    expect(estado.pendiente).toBe(false);
  });

  it('responde claramente cuando el usuario ya no existe', async () => {
    usuario.findUnique.mockResolvedValue(null);

    await expect(service.obtenerEstado('ausente')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
