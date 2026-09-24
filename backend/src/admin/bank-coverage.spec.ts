import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AreaIcfes } from '@prisma/client';
import { AdminGuard } from '../auth/jwt.guard';
import { CatalogThemesDto } from './academic-catalog.controller';
import { BankCoverageController } from './bank-coverage.controller';
import { BankCoverageService } from './bank-coverage.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Bank coverage', () => {
  it('requires ADMIN and validates pagination/area without writes', async () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BankCoverageController),
    ).toEqual([AdminGuard]);
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    for (const value of [
      { area: 'OTHER' },
      { area: 'MATEMATICAS', pagina: 0 },
      { area: 'INGLES', limite: 101 },
      { area: 'INGLES', usuarioId: 'x' },
    ]) {
      await expect(
        pipe.transform(value, { type: 'query', metatype: CatalogThemesDto }),
      ).rejects.toThrow();
    }
    await expect(
      pipe.transform(
        { area: 'INGLES', pagina: '2', limite: '20' },
        { type: 'query', metatype: CatalogThemesDto },
      ),
    ).resolves.toMatchObject({ pagina: 2, limite: 20 });
  });
  it('returns empty subtopics with missing levels and unavailable reports, not fake zeros', async () => {
    const tx = {
      subtema: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 's',
            nombre: 'Empty',
            estadoContenido: 'PUBLICADO',
            tema: { id: 't', nombre: 'Theme', estadoContenido: 'PUBLICADO' },
          },
        ]),
      },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const prisma = {
      $transaction: jest.fn((fn: (client: typeof tx) => unknown) => fn(tx)),
    };
    const result = await new BankCoverageService(
      prisma as unknown as PrismaService,
    ).page(AreaIcfes.INGLES, 1, 20);
    expect(result.items[0]).toMatchObject({
      total: 0,
      publicadas: 0,
      reportes: null,
      dificultadesFaltantes: ['BASICO', 'MEDIO', 'AVANZADO'],
    });
    expect(result.reportesDisponibles).toBe(false);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
  });
  it('does not construct an empty IN clause for an empty page', async () => {
    const tx = {
      subtema: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      $queryRaw: jest.fn(),
    };
    const prisma = {
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    };
    const result = await new BankCoverageService(
      prisma as unknown as PrismaService,
    ).page(AreaIcfes.INGLES, 1, 20);
    expect(result.items).toEqual([]);
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
});
