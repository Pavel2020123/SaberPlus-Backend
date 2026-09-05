import { BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

describe('InstitucionAccesoService', () => {
  const institucion = { findUnique: jest.fn() };
  const clase = { count: jest.fn() };
  const usuario = { count: jest.fn(), findFirst: jest.fn() };
  const prisma = { institucion, clase, usuario } as unknown as PrismaService;
  const service = new InstitucionAccesoService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    institucion.findUnique.mockResolvedValue({
      planActual: 'GRATIS',
      limiteGrupos: 1,
      limiteEstudiantes: 40,
    });
  });

  it('impide crear un segundo grupo en el plan gratuito', async () => {
    clase.count.mockResolvedValue(1);

    await expect(
      service.verificarCupoGrupos('institution-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('cuenta estudiantes institucionales aunque todavía no tengan grupo', async () => {
    usuario.count.mockResolvedValue(40);
    usuario.findFirst.mockResolvedValue(null);

    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'new-student'),
    ).rejects.toThrow('Se alcanzó el cupo total de 40 estudiantes');
    expect(usuario.count).toHaveBeenCalledWith({
      where: { institucionId: 'institution-1', rol: 'ESTUDIANTE' },
    });
  });

  it('no cobra otro cupo al mover un estudiante entre grupos propios', async () => {
    usuario.count.mockResolvedValue(40);
    usuario.findFirst.mockResolvedValue({ id: 'student-1' });

    await expect(
      service.verificarCupoDisponible('institution-1', 'ONCE', 'student-1'),
    ).resolves.toBeUndefined();
  });
});
