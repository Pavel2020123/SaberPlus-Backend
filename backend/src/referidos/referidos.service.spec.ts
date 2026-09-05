import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MONTO_MINIMO_PAGO_COP,
  RECOMPENSA_REFERIDO_COP,
  ReferidosService,
} from './referidos.service';

describe('ReferidosService', () => {
  const usuarioRepositorio = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  };
  const referidoRepositorio = {
    count: jest.fn(),
    findMany: jest.fn(),
  };
  const prisma = {
    usuario: usuarioRepositorio,
    referido: referidoRepositorio,
  } as unknown as PrismaService;
  const service = new ReferidosService(prisma);

  beforeEach(() => jest.clearAllMocks());

  it('valida el codigo sin exponer el nombre ni una recompensa web', async () => {
    usuarioRepositorio.findUnique.mockResolvedValue({
      nombre: 'Laura Estudiante',
      rol: 'ESTUDIANTE',
    });

    await expect(service.validarCodigo(' saber123 ')).resolves.toEqual({
      valido: true,
      codigo: 'SABER123',
    });
  });

  it('entrega a la app un resumen sin saldo, nombres ni enlaces web', async () => {
    usuarioRepositorio.findUnique.mockResolvedValue({
      id: 'usuario-1',
      rol: 'ESTUDIANTE',
      codigoReferido: 'SABER123',
    });
    referidoRepositorio.findMany.mockResolvedValue([
      {
        id: 'invitacion-1',
        fechaRegistro: new Date('2026-08-28T12:00:00Z'),
      },
    ]);
    referidoRepositorio.count.mockResolvedValue(1);

    const resultado = await service.obtenerResumenMovil('usuario-1');

    expect(resultado).toMatchObject({
      codigo: 'SABER123',
      totalInvitaciones: 1,
      beneficio: { estado: 'POR_DEFINIR' },
    });
    expect(resultado).not.toHaveProperty('saldoReferidosCop');
    expect(resultado).not.toHaveProperty('enlace');
    expect(resultado.invitaciones[0]).not.toHaveProperty('nombre');
  });

  it('rechaza un codigo que no pertenece a un estudiante', async () => {
    usuarioRepositorio.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'profesor-1',
        correo: 'profesor@example.com',
        rol: 'PROFESOR',
      });

    await expect(
      service.prepararRegistro('codigo-invalido', 'nuevo@gmail.com'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reserva saldo sin permitir que el pago quede en cero', async () => {
    const tx = {
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ saldoReferidosCop: 50_000 }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const credito = await service.reservarSaldo(
      tx as never,
      'usuario-1',
      12_000,
    );

    expect(credito).toBe(12_000 - MONTO_MINIMO_PAGO_COP);
    expect(tx.usuario.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { saldoReferidosCop: { decrement: 11_000 } },
      }),
    );
  });

  it('devuelve el saldo reservado cuando el pago falla', async () => {
    const tx = {
      usuario: { update: jest.fn().mockResolvedValue({}) },
    };

    await service.devolverSaldo(tx as never, 'usuario-1', 5_000);

    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { id: 'usuario-1' },
      data: { saldoReferidosCop: { increment: 5_000 } },
    });
  });

  it('acredita una sola recompensa por el primer pago aprobado', async () => {
    const tx = {
      referido: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'referido-1',
          referidorId: 'usuario-referidor',
          estado: 'REGISTRADO',
        }),
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 0 }),
      },
      usuario: { update: jest.fn().mockResolvedValue({}) },
    };

    await expect(
      service.recompensarPrimerPago(tx as never, 'usuario-invitado', 'orden-1'),
    ).resolves.toBe(true);
    await expect(
      service.recompensarPrimerPago(tx as never, 'usuario-invitado', 'orden-1'),
    ).resolves.toBe(false);

    expect(tx.usuario.update).toHaveBeenCalledTimes(1);
    expect(tx.usuario.update).toHaveBeenCalledWith({
      where: { id: 'usuario-referidor' },
      data: {
        saldoReferidosCop: { increment: RECOMPENSA_REFERIDO_COP },
      },
    });
  });
});
