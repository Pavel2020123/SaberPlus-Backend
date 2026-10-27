import { ValidationPipe } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AreaIcfes } from '@prisma/client';
import { AdminGuard } from '../auth/jwt.guard';
import { CatalogThemesDto } from './academic-catalog.controller';
import {
  BankCoverageController,
  BankCoverageQuery,
} from './bank-coverage.controller';
import { BankCoverageService } from './bank-coverage.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Bank coverage', () => {
  it('report contract is opt-in and old clients keep their exact default', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    await expect(
      pipe.transform(
        { area: 'INGLES', reportesVersion: '1' },
        { type: 'query', metatype: BankCoverageQuery },
      ),
    ).resolves.toMatchObject({ reportesVersion: 1 });
    for (const reportesVersion of ['0', '2', 'unknown', null]) {
      await expect(
        pipe.transform(
          { area: 'INGLES', reportesVersion },
          { type: 'query', metatype: BankCoverageQuery },
        ),
      ).rejects.toThrow();
    }
    const coverage = { page: jest.fn() };
    const controller = new BankCoverageController(
      coverage as unknown as BankCoverageService,
    );
    controller.get({ area: 'INGLES', pagina: 1, limite: 20 });
    expect(coverage.page).toHaveBeenLastCalledWith('INGLES', 1, 20, false);
    controller.get({
      area: 'INGLES',
      pagina: 1,
      limite: 20,
      reportesVersion: 1,
    });
    expect(coverage.page).toHaveBeenLastCalledWith('INGLES', 1, 20, true);
  });

  function reportCoverage(groups: object[] = []) {
    const tx = {
      subtema: {
        count: jest.fn().mockResolvedValue(1),
        findMany: jest
          .fn()
          .mockResolvedValue([
            {
              id: 's',
              nombre: 'Tema',
              estadoContenido: 'PUBLICADO',
              tema: { id: 't', nombre: 'Tema', estadoContenido: 'PUBLICADO' },
            },
          ]),
      },
      reportePregunta: { groupBy: jest.fn().mockResolvedValue(groups) },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const db = { $transaction: jest.fn((fn) => fn(tx)) };
    return {
      tx,
      service: new BankCoverageService(db as unknown as PrismaService),
    };
  }
  it('counts open reports separately from distinct questions, including archived question IDs', async () => {
    const { tx, service } = reportCoverage([
      {
        subtemaIdCapturado: 's',
        preguntaId: 'archived-question',
        _count: { _all: 3 },
      },
      { subtemaIdCapturado: 's', preguntaId: 'another', _count: { _all: 2 } },
    ]);
    const result = await service.page('INGLES', 1, 20, true);
    expect(result).toMatchObject({
      reportesDisponibles: true,
      reportesVersion: 1,
    });
    expect(result.items[0]).toMatchObject({
      reportes: 5,
      preguntasConReportes: 2,
      publicadas: 0,
    });
    expect(tx.reportePregunta.groupBy).toHaveBeenCalledWith({
      by: ['subtemaIdCapturado', 'preguntaId'],
      where: {
        subtemaIdCapturado: { in: ['s'] },
        estado: { in: ['PENDIENTE', 'EN_REVISION'] },
      },
      _count: { _all: true },
    });
  });
  it('zero means successful empty report query, never a hidden error', async () => {
    const { tx, service } = reportCoverage();
    expect((await service.page('INGLES', 1, 20, true)).items[0]).toMatchObject({
      reportes: 0,
      preguntasConReportes: 0,
    });
    tx.reportePregunta.groupBy.mockRejectedValue(new Error('unavailable'));
    await expect(service.page('INGLES', 1, 20, true)).rejects.toThrow(
      'unavailable',
    );
  });
  it('legacy does not read new tables; empty pages avoid an unbounded report query', async () => {
    const { tx, service } = reportCoverage();
    const legacy = await service.page('INGLES', 1, 20);
    expect(legacy).toMatchObject({ reportesDisponibles: false });
    expect(legacy.items[0].reportes).toBeNull();
    expect(legacy).not.toHaveProperty('reportesVersion');
    expect(tx.reportePregunta.groupBy).not.toHaveBeenCalled();
    tx.subtema.findMany.mockResolvedValue([]);
    expect((await service.page('INGLES', 1, 20, true)).items).toEqual([]);
    expect(tx.reportePregunta.groupBy).not.toHaveBeenCalled();
  });
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
