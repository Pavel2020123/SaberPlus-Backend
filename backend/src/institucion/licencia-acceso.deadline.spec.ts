import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenciaAccesoService } from './licencia-acceso.service';

describe('institutional delivery exact deadline (server clock)', () => {
  const start = new Date('2026-01-01T05:00:00Z');
  const end = new Date('2026-07-01T05:00:00Z');
  const begun = new Date(end.getTime() - 3600000);
  const cap = new Date(end.getTime() + 86400000);
  function fixture(now: Date, suspended = false) {
    const assignment = {
      institucionId: 'school',
      aceptadaEn: start,
      tipo: 'ESTUDIANTE',
      estado: 'ACTIVA',
    };
    const db = {
      operacionLicenciaInstitucional: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRaw: jest.fn().mockResolvedValue([{ ahora: now }]),
      usuario: {
        findUnique: jest.fn().mockResolvedValue({
          rol: 'ESTUDIANTE',
          institucionId: 'school',
          origenGestionadoLicencia: null,
          membresiaInstitucion: null,
          asignacionesLicencia: [assignment],
        }),
      },
      controlLicenciaInstitucional: {
        findUnique: jest.fn().mockResolvedValue({ suspendida: suspended }),
      },
      periodoContratoInstitucional: {
        findFirst: jest.fn().mockResolvedValue({
          institucionId: 'school',
          inicio: start,
          fin: end,
          cuposEstudiantes: 1,
          cuposDocentes: 1,
        }),
      },
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((work: (tx: unknown) => unknown) =>
      work(db),
    );
    return new LicenciaAccesoService(db as unknown as PrismaService);
  }
  it('allows just before the 24h cap and rejects at/after it', async () => {
    await expect(
      fixture(new Date(cap.getTime() - 1)).exigirEntrega(
        'student',
        begun,
        null,
      ),
    ).resolves.toBeUndefined();
    for (const now of [cap, new Date(cap.getTime() + 1)])
      await expect(
        fixture(now).exigirEntrega('student', begun, null),
      ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('uses an earlier original deadline exclusively', async () => {
    const original = new Date(end.getTime() + 3600000);
    await expect(
      fixture(new Date(original.getTime() - 1)).exigirEntrega(
        'student',
        begun,
        original,
      ),
    ).resolves.toBeUndefined();
    await expect(
      fixture(original).exigirEntrega('student', begun, original),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('does not grant grace to an attempt begun exactly at license expiry', async () => {
    await expect(
      fixture(end).exigirEntrega('student', end, null),
    ).rejects.toThrow();
  });
  it('suspension denies even a previously valid attempt immediately', async () => {
    await expect(
      fixture(new Date(end.getTime() - 1), true).exigirEntrega(
        'student',
        begun,
        null,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
