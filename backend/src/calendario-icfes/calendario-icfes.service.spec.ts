import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarioIcfesService } from './calendario-icfes.service';

describe('CalendarioIcfesService', () => {
  const calendarioRepositorio = {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
  };
  const ejecutarTransaccion = jest.fn((operacion: (tx: unknown) => unknown) =>
    Promise.resolve(operacion({ calendarioIcfes: calendarioRepositorio })),
  );
  const prisma = {
    calendarioIcfes: calendarioRepositorio,
    $transaction: ejecutarTransaccion,
  } as unknown as PrismaService;
  const service = new CalendarioIcfesService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('activa automáticamente la primera convocatoria creada', async () => {
    const fechaExamen = new Date('2099-08-15T12:00:00.000Z');
    calendarioRepositorio.findUnique.mockResolvedValue(null);
    calendarioRepositorio.findFirst.mockResolvedValue(null);
    calendarioRepositorio.create.mockResolvedValue({ id: 'calendario-1' });

    await service.crear(2099, 'A', fechaExamen);

    expect(calendarioRepositorio.create).toHaveBeenCalledWith({
      data: {
        anio: 2099,
        calendario: 'A',
        fechaExamen,
        activo: true,
      },
    });
  });

  it('desactiva la convocatoria anterior al activar una nueva', async () => {
    const convocatoria = {
      id: 'calendario-2',
      fechaExamen: new Date('2099-10-20T12:00:00.000Z'),
    };
    calendarioRepositorio.findUnique.mockResolvedValue(convocatoria);
    calendarioRepositorio.update.mockResolvedValue({
      ...convocatoria,
      activo: true,
    });

    await service.activar(convocatoria.id);

    expect(calendarioRepositorio.updateMany).toHaveBeenCalledWith({
      where: { activo: true },
      data: { activo: false },
    });
    expect(calendarioRepositorio.update).toHaveBeenCalledWith({
      where: { id: convocatoria.id },
      data: { activo: true },
    });
  });

  it('no permite activar una convocatoria vencida', async () => {
    calendarioRepositorio.findUnique.mockResolvedValue({
      id: 'calendario-vencido',
      fechaExamen: new Date('2020-01-01T12:00:00.000Z'),
    });

    await expect(service.activar('calendario-vencido')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ejecutarTransaccion).not.toHaveBeenCalled();
  });

  it('no permite mover la convocatoria activa a una fecha vencida', async () => {
    calendarioRepositorio.findUnique.mockResolvedValue({
      id: 'calendario-activo',
      activo: true,
    });

    await expect(
      service.actualizar(
        'calendario-activo',
        new Date('2020-01-01T12:00:00.000Z'),
      ),
    ).rejects.toThrow(
      'La convocatoria activa no puede tener una fecha vencida.',
    );
    expect(calendarioRepositorio.update).not.toHaveBeenCalled();
  });

  it('mantiene el acceso hasta finalizar el día del examen', () => {
    const fechaExamen = new Date(2099, 7, 15, 8, 30, 0, 0);

    const vencimiento = service.calcularFinDelExamen(fechaExamen);

    expect(vencimiento.getFullYear()).toBe(2099);
    expect(vencimiento.getMonth()).toBe(7);
    expect(vencimiento.getDate()).toBe(15);
    expect(vencimiento.getHours()).toBe(23);
    expect(vencimiento.getMinutes()).toBe(59);
    expect(vencimiento.getSeconds()).toBe(59);
    expect(vencimiento.getMilliseconds()).toBe(999);
  });
});
