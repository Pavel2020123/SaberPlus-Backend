import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenciaAccesoService } from './licencia-acceso.service';

describe('suppressed identity never becomes unrestricted personal access', () => {
  it.each([
    { rol: null, suprimidaEn: null },
    { rol: 'ESTUDIANTE', suprimidaEn: new Date() },
  ])('denies a stale service caller for %p', async (user) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ ahora: new Date() }]),
      usuario: { findUnique: jest.fn().mockResolvedValue(user) },
    };
    const db = {
      $transaction: jest
        .fn()
        .mockImplementation((work: (value: unknown) => unknown) => work(tx)),
    };
    const service = new LicenciaAccesoService(db as unknown as PrismaService);
    await expect(service.exigirPractica('suppressed')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.resumenPropio('suppressed')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
