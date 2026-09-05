import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { limpiarMarkdownEnLinea, TemaPdfService } from './tema-pdf.service';

describe('TemaPdfService', () => {
  const temaRepositorio = { findFirst: jest.fn() };
  const prisma = { tema: temaRepositorio } as unknown as PrismaService;
  const service = new TemaPdfService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('convierte el formato en texto legible para el PDF', () => {
    expect(
      limpiarMarkdownEnLinea(
        '💡 **Tip:** consulta [la guía](https://example.com) y `practica`.',
      ),
    ).toBe('Consejo: Tip: consulta la guía (https://example.com) y practica.');
  });

  it('genera un PDF multipágina descargable con los subtemas', async () => {
    temaRepositorio.findFirst.mockResolvedValue({
      id: 'tema-1',
      nombre: 'Álgebra básica',
      area: 'MATEMATICAS',
      subtemas: [
        {
          id: 'subtema-1',
          nombre: 'Ecuaciones',
          contenido: '# Concepto\n\n- Primer paso\n- Segundo paso',
          imagenUrl: null,
          videoUrl: 'https://example.com/video',
        },
        {
          id: 'subtema-2',
          nombre: 'Problemas',
          contenido: 'Aplica el procedimiento en situaciones cotidianas.',
          imagenUrl: null,
          videoUrl: null,
        },
      ],
    });

    const resultado = await service.generarPdfTema('tema-1');

    expect(resultado.nombre).toBe('tema-algebra-basica.pdf');
    expect(resultado.archivo.subarray(0, 4).toString()).toBe('%PDF');
    expect(resultado.archivo.length).toBeGreaterThan(1500);
  });

  it('rechaza la descarga de un tema inexistente', async () => {
    temaRepositorio.findFirst.mockResolvedValue(null);

    await expect(service.generarPdfTema('no-existe')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
