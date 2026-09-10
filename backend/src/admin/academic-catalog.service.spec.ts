import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AcademicCatalogService } from './academic-catalog.service';
import { catalogNameKey, validateCatalogName } from './academic-classification';

describe('AcademicCatalogService', () => {
  const tema = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  };
  const subtema = { findMany: jest.fn(), create: jest.fn() };
  const tx = {
    tema,
    subtema,
    $queryRaw: jest.fn<
      Promise<unknown>,
      [TemplateStringsArray, ...unknown[]]
    >(),
  };
  const prisma = { ...tx, $transaction: jest.fn() };
  const service = new AcademicCatalogService(
    prisma as unknown as PrismaService,
  );
  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    );
    tema.findMany.mockResolvedValue([]);
    subtema.findMany.mockResolvedValue([]);
    tema.findUnique.mockResolvedValue({
      id: 't1',
      nombre: 'Álgebra',
      area: 'MATEMATICAS',
      estadoContenido: 'BORRADOR',
    });
  });

  it('expone las cinco áreas estables', () => {
    expect(service.areas()).toHaveLength(5);
    expect(service.areas()).toContainEqual({
      id: 'SOCIALES_CIUDADANAS',
      nombre: 'Sociales y ciudadanas',
    });
  });

  it('crea un tema normalizado como borrador después de adquirir el bloqueo', async () => {
    await service.crearTema('  Álgebra   básica ', 'MATEMATICAS');
    expect(tema.create).toHaveBeenCalledWith({
      data: {
        nombre: 'Álgebra básica',
        area: 'MATEMATICAS',
        estadoContenido: 'BORRADOR',
      },
    });
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tema.findMany.mock.invocationCallOrder[0],
    );
    expect(tema.findMany).toHaveBeenCalledWith({
      where: { area: 'MATEMATICAS' },
      select: { nombre: true },
    });
  });

  it('rechaza duplicados por mayúsculas, tildes y espacios, incluso archivados', async () => {
    tema.findMany.mockResolvedValue([{ nombre: 'Álgebra básica' }]);
    await expect(
      service.crearTema('ALGEBRA  BASICA', 'MATEMATICAS'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tema.create).not.toHaveBeenCalled();
  });

  it('no confunde la eñe con la ene', () => {
    expect(catalogNameKey('Años')).not.toBe(catalogNameKey('Anos'));
  });

  it.each(['', '   ', 'Banco  General', 'x'.repeat(121), 'álge\u200bbra'])(
    'rechaza nombre inválido %s',
    async (nombre) => {
      await expect(service.crearTema(nombre, 'INGLES')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('conserva el límite de 120 caracteres', () => {
    expect(validateCatalogName('a'.repeat(120))).toHaveLength(120);
  });

  it('crea el subtema bajo su tema, sin área independiente', async () => {
    await service.crearSubtema('Ecuaciones', 't1');
    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('editor:area:MATEMATICAS');
    expect(tx.$queryRaw.mock.calls[1][1]).toBe('catalogo:tema:t1');
    expect(subtema.create).toHaveBeenCalledWith({
      data: { nombre: 'Ecuaciones', temaId: 't1', estadoContenido: 'BORRADOR' },
    });
  });

  it('rechaza duplicados solo dentro del mismo tema', async () => {
    subtema.findMany.mockResolvedValue([{ nombre: 'Ecuaciones' }]);
    await expect(
      service.crearSubtema('ECUACIONES', 't1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(subtema.findMany).toHaveBeenCalledWith({
      where: { temaId: 't1' },
      select: { nombre: true },
    });
    expect(subtema.create).not.toHaveBeenCalled();
  });

  it('relee el padre después del bloqueo y no inserta si fue archivado', async () => {
    tema.findUnique
      .mockResolvedValueOnce({ area: 'MATEMATICAS' })
      .mockResolvedValueOnce({
        nombre: 'Álgebra',
        area: 'MATEMATICAS',
        estadoContenido: 'ARCHIVADO',
      });
    await expect(service.crearSubtema('Sumas', 't1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tema.findUnique).toHaveBeenCalledTimes(2);
    expect(subtema.create).not.toHaveBeenCalled();
  });

  it('rechaza un cambio de área detectado tras adquirir el bloqueo', async () => {
    tema.findUnique
      .mockResolvedValueOnce({ area: 'MATEMATICAS' })
      .mockResolvedValueOnce({
        nombre: 'Otro',
        area: 'INGLES',
        estadoContenido: 'BORRADOR',
      });
    await expect(service.crearSubtema('Sumas', 't1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(subtema.create).not.toHaveBeenCalled();
  });

  it('rechaza un padre inexistente', async () => {
    tema.findUnique.mockResolvedValue(null);
    await expect(
      service.crearSubtema('Ecuaciones', 't1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(subtema.create).not.toHaveBeenCalled();
  });

  it.each([
    { nombre: 'Álgebra', estadoContenido: 'ARCHIVADO', area: 'MATEMATICAS' },
    {
      nombre: 'Banco General',
      estadoContenido: 'PUBLICADO',
      area: 'MATEMATICAS',
    },
  ])('rechaza un padre no utilizable: %j', async (parent) => {
    tema.findUnique.mockResolvedValue(parent);
    await expect(
      service.crearSubtema('Ecuaciones', 't1'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(subtema.create).not.toHaveBeenCalled();
  });

  it('pagina temas e identifica el legado sin modificarlo', async () => {
    tema.findMany.mockResolvedValue([
      { nombre: 'Banco General' },
      { nombre: 'Otro' },
    ]);
    const result = await service.temas('MATEMATICAS', 2, 1);
    expect(result).toMatchObject({
      pagina: 2,
      limite: 1,
      hayMas: true,
      items: [{ requiereClasificacion: true }],
    });
    expect(tema.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { area: 'MATEMATICAS' },
        skip: 1,
        take: 2,
      }),
    );
    expect(tema.create).not.toHaveBeenCalled();
  });

  it('pagina subtemas sin incluir preguntas, respuestas ni contenido pesado', async () => {
    subtema.findMany.mockResolvedValue([
      { id: 's1', nombre: 'Ecuaciones', _count: { preguntas: 18 } },
    ]);
    const result = await service.subtemas('t1', 1, 50);
    expect(result).toMatchObject({
      tema: { area: 'MATEMATICAS' },
      hayMas: false,
      items: [{ requiereClasificacion: false }],
    });
    expect(subtema.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          nombre: true,
          temaId: true,
          estadoContenido: true,
          _count: { select: { preguntas: true } },
        },
      }),
    );
  });
});
