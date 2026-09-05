import { BadRequestException } from '@nestjs/common';
import { TipoPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CuponesService } from './cupones.service';

const crearCupon = (
  cambios: Partial<{
    id: string;
    codigo: string;
    titulo: string | null;
    esAutomatica: boolean;
    porcentajeDescuento: number;
    tipoPlan: TipoPlan | null;
    fechaExpiracion: Date;
    usosMaximos: number | null;
    usosActuales: number;
    activo: boolean;
    fechaCreacion: Date;
  }> = {},
) => ({
  id: 'cupon-1',
  codigo: 'FELIZ34',
  titulo: null,
  esAutomatica: false,
  porcentajeDescuento: 34,
  tipoPlan: 'MENSUAL' as TipoPlan,
  fechaExpiracion: new Date(Date.now() + 60_000),
  usosMaximos: 10,
  usosActuales: 0,
  activo: true,
  fechaCreacion: new Date(),
  ...cambios,
});

describe('CuponesService', () => {
  const cuponRepositorio = {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = { cupon: cuponRepositorio } as unknown as PrismaService;
  const service = new CuponesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('normaliza el código y crea una promoción con plan y cupo', async () => {
    const fechaExpiracion = new Date(Date.now() + 60_000);
    cuponRepositorio.create.mockResolvedValue(crearCupon());

    await service.crear({
      codigo: ' feliz34 ',
      porcentajeDescuento: 34,
      tipoPlan: 'MENSUAL',
      fechaExpiracion,
      usosMaximos: 10,
    });

    expect(cuponRepositorio.create).toHaveBeenCalledWith({
      data: {
        codigo: 'FELIZ34',
        titulo: null,
        esAutomatica: false,
        porcentajeDescuento: 34,
        tipoPlan: 'MENSUAL',
        fechaExpiracion,
        usosMaximos: 10,
      },
    });
  });

  it('rechaza promociones que ya expiraron', async () => {
    await expect(
      service.crear({
        codigo: 'AYER34',
        porcentajeDescuento: 34,
        fechaExpiracion: new Date(Date.now() - 1_000),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(cuponRepositorio.create).not.toHaveBeenCalled();
  });

  it('rechaza un cupón que no aplica al plan elegido', async () => {
    cuponRepositorio.findFirst.mockResolvedValue(
      crearCupon({ tipoPlan: 'TEMPORADA_A' }),
    );

    await expect(service.validar('FELIZ34', 'MENSUAL')).rejects.toThrow(
      'Ese cupón no aplica al plan que elegiste.',
    );
  });

  it('no permite bajar el límite por debajo de los usos actuales', async () => {
    cuponRepositorio.findUnique.mockResolvedValue(
      crearCupon({ usosActuales: 8 }),
    );

    await expect(
      service.actualizar('cupon-1', { usosMaximos: 7 }),
    ).rejects.toThrow('El límite no puede ser menor que los 8 usos actuales.');
  });

  it('consume el uso y calcula el precio dentro del cliente transaccional', async () => {
    cuponRepositorio.findFirst.mockResolvedValue(crearCupon());
    cuponRepositorio.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.aplicar('feliz34', 'MENSUAL', 12900, prisma),
    ).resolves.toEqual({
      cuponId: 'cupon-1',
      codigo: 'FELIZ34',
      titulo: null,
      esAutomatica: false,
      porcentajeDescuento: 34,
      montoOriginal: 12900,
      montoConDescuento: 8514,
    });

    expect(cuponRepositorio.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { usosActuales: { increment: 1 } },
      }),
    );
  });

  it('rechaza al segundo comprador cuando otro tomó el último uso', async () => {
    cuponRepositorio.findFirst
      .mockResolvedValueOnce(crearCupon({ usosActuales: 9 }))
      .mockResolvedValueOnce(crearCupon({ usosActuales: 10 }));
    cuponRepositorio.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.aplicar('FELIZ34', 'MENSUAL', 12900, prisma),
    ).rejects.toThrow('Este cupón ya alcanzó su límite de usos.');
  });

  it('crea una promoción automática sin pedir un código público', async () => {
    const fechaExpiracion = new Date(Date.now() + 60_000);
    let llamada:
      | { data: { codigo: string; esAutomatica: boolean; titulo: string } }
      | undefined;
    cuponRepositorio.create.mockImplementation((argumento: unknown) => {
      llamada = argumento as typeof llamada;
      return Promise.resolve(
        crearCupon({
          id: 'promo-1',
          codigo: 'PROMO-INTERNO',
          titulo: '34% solo por hoy',
          esAutomatica: true,
        }),
      );
    });

    await expect(
      service.crear({
        esAutomatica: true,
        titulo: '34% solo por hoy',
        porcentajeDescuento: 34,
        tipoPlan: 'MENSUAL',
        fechaExpiracion,
        usosMaximos: 90,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'promo-1',
        codigo: null,
        titulo: '34% solo por hoy',
        esAutomatica: true,
      }),
    );

    expect(llamada?.data.codigo).toMatch(/^PROMO-/);
    expect(llamada?.data.esAutomatica).toBe(true);
    expect(llamada?.data.titulo).toBe('34% solo por hoy');
  });

  it('aplica automáticamente la mejor promoción vigente', async () => {
    cuponRepositorio.findMany.mockResolvedValue([
      crearCupon({
        id: 'promo-1',
        codigo: 'PROMO-INTERNO',
        titulo: '34% solo por hoy',
        esAutomatica: true,
      }),
    ]);
    cuponRepositorio.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      service.aplicarAutomatica('MENSUAL', 12900, prisma),
    ).resolves.toEqual({
      cuponId: 'promo-1',
      codigo: null,
      titulo: '34% solo por hoy',
      esAutomatica: true,
      porcentajeDescuento: 34,
      montoOriginal: 12900,
      montoConDescuento: 8514,
    });
  });
});
