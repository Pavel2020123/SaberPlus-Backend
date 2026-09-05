import { PrismaService } from '../prisma/prisma.service';
import { CalendarioIcfesService } from '../calendario-icfes/calendario-icfes.service';
import { CuponesService } from '../cupones/cupones.service';
import { PagosService } from './pagos.service';
import { calcularFirmaEpayco, PRECIO_ACCESO_COMPLETO_COP } from './epayco.util';
import { ReferidosService } from '../referidos/referidos.service';

describe('PagosService', () => {
  let llamadaCrearOrden: { data: Record<string, unknown> } | undefined;
  let llamadaActualizarOrden: unknown;
  const usuarioRepositorio = {
    findUnique: jest.fn(),
    update: jest.fn().mockResolvedValue({ id: 'usuario-1' }),
  };
  const pagoOrdenRepositorio = {
    create: jest.fn((argumento: unknown) => {
      llamadaCrearOrden = argumento as { data: Record<string, unknown> };
      return Promise.resolve({ id: 'orden-1' });
    }),
    findUnique: jest.fn(),
    updateMany: jest.fn((argumento: unknown) => {
      llamadaActualizarOrden = argumento;
      return Promise.resolve({ count: 1 });
    }),
  };
  const transaccion = {
    pagoOrden: pagoOrdenRepositorio,
    usuario: usuarioRepositorio,
    cupon: { updateMany: jest.fn() },
  };
  const ejecutarTransaccion = jest.fn(
    (operacion: (tx: typeof transaccion) => unknown) =>
      Promise.resolve(operacion(transaccion)),
  );
  const prisma = {
    usuario: usuarioRepositorio,
    pagoOrden: pagoOrdenRepositorio,
    $transaction: ejecutarTransaccion,
  } as unknown as PrismaService;
  const calendarioService = {
    obtenerCalendarioActivo: jest.fn(),
    calcularFinDelExamen: jest.fn(),
  } as unknown as CalendarioIcfesService;
  const cuponesService = {
    aplicar: jest.fn(),
    aplicarAutomatica: jest.fn(),
  } as unknown as CuponesService;
  const recompensarPrimerPago = jest.fn();
  const referidosService = {
    reservarSaldo: jest.fn().mockResolvedValue(0),
    devolverSaldo: jest.fn(),
    recompensarPrimerPago,
  } as unknown as ReferidosService;
  const service = new PagosService(
    prisma,
    calendarioService,
    cuponesService,
    referidosService,
  );
  const publicKeyAnterior = process.env.EPAYCO_PUBLIC_KEY;
  const frontendUrlAnterior = process.env.FRONTEND_URL;
  const customerIdAnterior = process.env.EPAYCO_CUSTOMER_ID;
  const pKeyAnterior = process.env.EPAYCO_P_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    llamadaCrearOrden = undefined;
    llamadaActualizarOrden = undefined;
    process.env.EPAYCO_PUBLIC_KEY = 'public-key-prueba';
    process.env.FRONTEND_URL = 'http://localhost:3001';
    process.env.EPAYCO_CUSTOMER_ID = 'cliente-123';
    process.env.EPAYCO_P_KEY = 'p-key-secreta';
  });

  afterAll(() => {
    process.env.EPAYCO_PUBLIC_KEY = publicKeyAnterior;
    process.env.FRONTEND_URL = frontendUrlAnterior;
    process.env.EPAYCO_CUSTOMER_ID = customerIdAnterior;
    process.env.EPAYCO_P_KEY = pKeyAnterior;
  });

  it('crea un único acceso de $45.000 ligado al calendario activo', async () => {
    const fechaExamen = new Date('2099-08-15T12:00:00.000Z');
    const fechaVencimientoAcceso = new Date('2099-08-15T23:59:59.999Z');
    usuarioRepositorio.findUnique.mockResolvedValue({
      id: 'usuario-1',
      correo: 'estudiante@example.com',
      nombre: 'Estudiante',
      rol: 'ESTUDIANTE',
      institucionId: null,
      grado: null,
    });
    (calendarioService.obtenerCalendarioActivo as jest.Mock).mockResolvedValue({
      calendario: 'A',
      fechaExamen,
    });
    (calendarioService.calcularFinDelExamen as jest.Mock).mockReturnValue(
      fechaVencimientoAcceso,
    );
    (cuponesService.aplicarAutomatica as jest.Mock).mockResolvedValue(null);

    const resultado = await service.crearOrden('usuario-1');

    expect(PRECIO_ACCESO_COMPLETO_COP).toBe(45_000);
    expect(resultado).toEqual(
      expect.objectContaining({
        amount: 45_000,
        montoOriginal: 45_000,
        tipoPlan: 'MENSUAL',
        calendarioIcfes: 'A',
        fechaVencimientoAcceso,
        creditoReferidosUsado: 0,
      }),
    );
    expect(llamadaCrearOrden?.data).toEqual(
      expect.objectContaining({
        usuarioId: 'usuario-1',
        monto: 45_000,
        grado: null,
        tipoPlan: 'MENSUAL',
        calendarioIcfes: 'A',
        fechaVencimientoAcceso,
        creditoReferidosUsado: 0,
      }),
    );
  });

  it('activa el plan dentro de la misma transacción que aprueba ePayco', async () => {
    const vigencia = new Date('2099-08-15T23:59:59.999Z');
    pagoOrdenRepositorio.findUnique
      .mockResolvedValueOnce({
        id: 'orden-1',
        factura: 'IND-1',
        usuarioId: 'usuario-1',
        calendarioIcfes: 'A',
        fechaVencimientoAcceso: vigencia,
        monto: 45000,
        moneda: 'COP',
        estado: 'PENDIENTE',
        cuponId: null,
        creditoReferidosUsado: 0,
      })
      .mockResolvedValueOnce(null);
    usuarioRepositorio.findUnique
      .mockResolvedValueOnce({ calendarioIcfes: 'A' })
      .mockResolvedValueOnce({ fechaVencimientoPlan: null });

    const datosFirma = {
      x_ref_payco: 'ref-1',
      x_transaction_id: 'tx-1',
      x_amount: '45000',
      x_currency_code: 'COP',
    };
    await service.confirmarPago({
      ...datosFirma,
      x_id_invoice: 'IND-1',
      x_response: 'Aceptada',
      x_signature: calcularFirmaEpayco(
        datosFirma,
        'cliente-123',
        'p-key-secreta',
      ),
    });

    const llamadaActualizacion = llamadaActualizarOrden as {
      data: { estado: string; transaccionId: string };
    };
    expect(llamadaActualizacion.data).toEqual(
      expect.objectContaining({
        estado: 'APROBADA',
        transaccionId: 'tx-1',
      }),
    );
    expect(usuarioRepositorio.update).toHaveBeenCalledWith({
      where: { id: 'usuario-1' },
      data: { calendarioIcfes: 'A', fechaVencimientoPlan: vigencia },
    });
    expect(recompensarPrimerPago).toHaveBeenCalledWith(
      transaccion,
      'usuario-1',
      'orden-1',
    );
  });
});
