import { GoneException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../auth/jwt.guard';
import { PrismaService } from '../prisma/prisma.service';
import { SimulacroController } from './simulacro.controller';
import { SimulacroService } from './simulacro.service';

describe('retired HTTP demo seed', () => {
  it('cannot insert academic content even when invoked directly', () => {
    const tema = { create: jest.fn(), findFirst: jest.fn() };
    const service = new SimulacroService({ tema } as unknown as PrismaService);
    expect(() => service.poblarBaseDeDatos()).toThrow(GoneException);
    expect(tema.create).not.toHaveBeenCalled();
    expect(tema.findFirst).not.toHaveBeenCalled();
  });
  it('still checks ADMIN before returning the retirement notice', () => {
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        // eslint-disable-next-line @typescript-eslint/unbound-method -- Inspect route metadata without invoking the method.
        SimulacroController.prototype.poblarBd,
      ),
    ).toContain(AdminGuard);
  });
});
