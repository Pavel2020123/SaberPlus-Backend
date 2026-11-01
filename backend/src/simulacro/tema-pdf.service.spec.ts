import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { limpiarMarkdownEnLinea, TemaPdfService } from './tema-pdf.service';
import { EditorialFileService } from '../editorial-files/editorial-file.service';
import * as sharpModule from 'sharp';

const sharp = sharpModule as unknown as typeof import('sharp').default;

describe('TemaPdfService', () => {
  const temaRepositorio = { findFirst: jest.fn() };
  const prisma = { tema: temaRepositorio } as unknown as PrismaService;
  const files = { publishedContent: jest.fn() };
  const service = new TemaPdfService(
    prisma,
    files as unknown as EditorialFileService,
  );

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

  const imageId = 'a6ec3648-24ee-47d0-91f8-e59b2b68b9ab';
  function theme(image = `/recursos/editoriales/${imageId}`) {
    return {
      id: 'tema-1',
      nombre: 'Figuras',
      area: 'MATEMATICAS',
      subtemas: [
        {
          id: 'subtema-1',
          nombre: 'Rectángulos',
          contenido: 'Observa la figura.',
          imagenUrl: image,
          videoUrl: null,
        },
      ],
    };
  }
  async function imageBytes() {
    return sharp({
      create: { width: 160, height: 80, channels: 3, background: '#157fb5' },
    })
      .webp()
      .toBuffer();
  }

  it('incrusta WEBP autorizada como imagen PDF y revalida antes de entregar', async () => {
    temaRepositorio.findFirst.mockResolvedValue(theme());
    files.publishedContent.mockResolvedValue(await imageBytes());
    const result = await service.generarPdfTema('tema-1');
    expect(result.archivo.toString('latin1')).toContain('/Subtype /Image');
    expect(files.publishedContent.mock.calls).toEqual([[imageId], [imageId]]);
    expect(temaRepositorio.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tema-1', estadoContenido: 'PUBLICADO' },
      }),
    );
  });

  it('no exporta una imagen denegada ni consulta permisos históricos', async () => {
    temaRepositorio.findFirst.mockResolvedValue(theme());
    files.publishedContent.mockRejectedValue(new NotFoundException());
    await expect(service.generarPdfTema('tema-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.publishedContent).toHaveBeenCalledWith(imageId);
  });

  it('descarta el PDF si la imagen se revoca durante su generación', async () => {
    temaRepositorio.findFirst.mockResolvedValue(theme());
    files.publishedContent
      .mockReset()
      .mockResolvedValueOnce(await imageBytes())
      .mockRejectedValueOnce(new NotFoundException());
    await expect(service.generarPdfTema('tema-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.publishedContent).toHaveBeenCalledTimes(2);
  });

  it('deduplica imágenes repetidas dentro del tema, no entre solicitudes', async () => {
    const data = theme();
    data.subtemas.push({ ...data.subtemas[0], id: 'subtema-2' });
    temaRepositorio.findFirst.mockResolvedValue(data);
    files.publishedContent.mockReset().mockResolvedValue(await imageBytes());
    await service.generarPdfTema('tema-1');
    await service.generarPdfTema('tema-1');
    expect(files.publishedContent).toHaveBeenCalledTimes(4);
  });

  it('rechaza una referencia editorial con query sin tratarla como archivo local', async () => {
    temaRepositorio.findFirst.mockResolvedValue(
      theme(`/recursos/editoriales/${imageId}?token=no`),
    );
    await expect(service.generarPdfTema('tema-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(files.publishedContent).not.toHaveBeenCalled();
  });

  it('no descarga URLs externas desde el generador', async () => {
    temaRepositorio.findFirst.mockResolvedValue(
      theme('https://example.invalid/picture.png'),
    );
    const result = await service.generarPdfTema('tema-1');
    expect(result.archivo.toString('latin1')).not.toContain('/Subtype /Image');
    expect(files.publishedContent).not.toHaveBeenCalled();
  });

  it('no entrega un PDF sin imagen si los bytes no se pueden decodificar', async () => {
    temaRepositorio.findFirst.mockResolvedValue(theme());
    files.publishedContent
      .mockReset()
      .mockResolvedValue(Buffer.from('invalid'));
    await expect(service.generarPdfTema('tema-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('limita a 32 imágenes distintas sin intentar descargar la número 33', async () => {
    const data = theme();
    data.subtemas = Array.from({ length: 33 }, (_, index) => ({
      ...data.subtemas[0],
      id: `subtema-${index}`,
      imagenUrl: `/recursos/editoriales/${index.toString(16).padStart(8, '0')}-24ee-47d0-91f8-e59b2b68b9ab`,
    }));
    temaRepositorio.findFirst.mockResolvedValue(data);
    files.publishedContent.mockReset().mockResolvedValue(await imageBytes());
    await expect(service.generarPdfTema('tema-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(files.publishedContent).toHaveBeenCalledTimes(32);
  });
});
