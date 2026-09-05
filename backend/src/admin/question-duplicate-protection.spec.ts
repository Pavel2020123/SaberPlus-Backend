import { BadRequestException } from '@nestjs/common';
import { EstadoContenido } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminService } from './admin.service';

describe('AdminService - protección contra preguntas duplicadas', () => {
  const subtema = { findUnique: jest.fn() };
  const pregunta = {
    findFirst: jest.fn(),
    create: jest.fn(),
  };
  const prisma = { subtema, pregunta } as unknown as PrismaService;
  const service = new AdminService(prisma);

  beforeEach(() => jest.resetAllMocks());

  it('impide crear otra copia cuando la huella ya está activa', async () => {
    subtema.findUnique.mockResolvedValue({
      nombre: 'Suma',
      tema: { nombre: 'Aritmética', area: 'MATEMATICAS' },
    });
    pregunta.findFirst.mockResolvedValue({
      id: 'pregunta-existente',
      estadoContenido: EstadoContenido.PUBLICADO,
    });

    await expect(
      service.crearPregunta('¿Cuánto es 2 + 2?', 'subtema-1', 'BASICO', [
        { texto: '4', esCorrecta: true },
        { texto: '5', esCorrecta: false },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(pregunta.create).not.toHaveBeenCalled();
  });
});
