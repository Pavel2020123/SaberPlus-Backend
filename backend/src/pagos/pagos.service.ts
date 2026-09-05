import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { CalendarioTipo, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CalendarioIcfesService } from '../calendario-icfes/calendario-icfes.service';
import { CuponesService } from '../cupones/cupones.service';
import { ReferidosService } from '../referidos/referidos.service';
import {
  PRECIO_ACCESO_COMPLETO_COP,
  estadoDesdeRespuestaEpayco,
  firmaEpaycoValida,
} from './epayco.util';

// Fallback si todavía no se ha cargado la fecha oficial del ICFES para
// el calendario del estudiante (punto 6). No debería pasar en
// producción una vez el admin cargue las fechas, pero preferimos darle
// un año de acceso a quien ya pagó antes que dejarlo bloqueado por un
// dato administrativo que falta. Se registra como advertencia para
// que el admin lo revise.
const DIAS_VIGENCIA_RESPALDO = 365;

interface DatosWebhookEpayco {
  x_ref_payco?: string;
  x_transaction_id?: string;
  x_id_invoice?: string;
  x_amount?: string;
  x_currency_code?: string;
  x_response?: string;
  x_response_reason_text?: string;
  x_signature?: string;
  [clave: string]: unknown;
}

@Injectable()
export class PagosService {
  private readonly logger = new Logger(PagosService.name);

  constructor(
    private prisma: PrismaService,
    private calendarioIcfesService: CalendarioIcfesService,
    private cuponesService: CuponesService,
    private referidosService: ReferidosService,
  ) {}

  // ─── CREAR ORDEN ──────────────────────────────────────────────
  async crearOrden(usuarioId: string, codigoCupon?: string) {
    const publicKey =
      process.env.EPAYCO_PUBLIC_KEY ?? process.env.WOMPI_PUBLIC_KEY;

    if (!publicKey) {
      this.logger.error(
        'EPAYCO_PUBLIC_KEY no está configurada. No se puede crear la orden de pago.',
      );

      throw new ServiceUnavailableException(
        'La pasarela de pago no está disponible en este momento. Intenta más tarde.',
      );
    }

    const modoPruebas =
      (process.env.EPAYCO_TEST_MODE ?? process.env.WOMPI_TEST_MODE) !== 'false';
    if (process.env.NODE_ENV === 'production' && modoPruebas) {
      this.logger.error(
        'ePayco sigue en modo de pruebas en producción. Configura EPAYCO_TEST_MODE=false.',
      );
      throw new ServiceUnavailableException(
        'La pasarela de pago está temporalmente deshabilitada.',
      );
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        correo: true,
        nombre: true,
        rol: true,
        institucionId: true,
        grado: true,
      },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    // Igual que el muro de pago (plan.util.ts): esto es solo para el
    // estudiante individual. Los de institución no pagan aquí.
    if (usuario.institucionId) {
      throw new BadRequestException(
        'Tu acceso lo gestiona tu institución; no necesitas pagar individualmente.',
      );
    }

    if (usuario.rol !== 'ESTUDIANTE') {
      throw new BadRequestException(
        'Este plan de pago es para estudiantes individuales.',
      );
    }

    const convocatoria =
      await this.calendarioIcfesService.obtenerCalendarioActivo();
    if (!convocatoria) {
      throw new ServiceUnavailableException(
        'No hay una convocatoria ICFES activa. Intenta de nuevo más tarde.',
      );
    }

    const fechaVencimientoAcceso =
      this.calendarioIcfesService.calcularFinDelExamen(
        convocatoria.fechaExamen,
      );
    if (fechaVencimientoAcceso.getTime() <= Date.now()) {
      throw new ServiceUnavailableException(
        'La convocatoria activa ya terminó. Estamos preparando la siguiente.',
      );
    }

    const montoOriginal = PRECIO_ACCESO_COMPLETO_COP;
    const tipoPlan = 'MENSUAL' as const;

    const factura = this.generarFactura();

    const codigoNormalizado = codigoCupon?.trim();
    const resultadoOrden = await this.prisma.$transaction(async (tx) => {
      const descuento = codigoNormalizado
        ? await this.cuponesService.aplicar(
            codigoNormalizado,
            tipoPlan,
            montoOriginal,
            tx,
          )
        : await this.cuponesService.aplicarAutomatica(
            tipoPlan,
            montoOriginal,
            tx,
          );
      const montoDespuesDePromocion =
        descuento?.montoConDescuento ?? montoOriginal;
      const creditoReferidosUsado = await this.referidosService.reservarSaldo(
        tx,
        usuario.id,
        montoDespuesDePromocion,
      );
      const monto = montoDespuesDePromocion - creditoReferidosUsado;

      await tx.pagoOrden.create({
        data: {
          factura,
          usuarioId: usuario.id,
          grado: usuario.grado,
          tipoPlan,
          calendarioIcfes: convocatoria.calendario,
          fechaVencimientoAcceso,
          monto,
          montoOriginal:
            descuento || creditoReferidosUsado > 0 ? montoOriginal : null,
          creditoReferidosUsado,
          cuponId: descuento?.cuponId ?? null,
          moneda: 'COP',
          estado: 'PENDIENTE',
        },
      });

      return { descuento, monto, creditoReferidosUsado };
    });

    return {
      factura,
      publicKey,
      test: modoPruebas,
      amount: resultadoOrden.monto,
      montoOriginal,
      porcentajeDescuento:
        resultadoOrden.descuento?.porcentajeDescuento ?? null,
      codigoCupon: resultadoOrden.descuento?.codigo ?? null,
      tituloPromocion: resultadoOrden.descuento?.titulo ?? null,
      creditoReferidosUsado: resultadoOrden.creditoReferidosUsado,
      currency: 'COP',
      country: 'co',
      name: 'SaberPlus — Acceso completo',
      description: `Preparación completa para Saber 11 · Calendario ${convocatoria.calendario}`,
      email: usuario.correo,
      nombre: usuario.nombre,
      redirectUrl: `${process.env.FRONTEND_URL}/planes/resultado-pago?factura=${encodeURIComponent(factura)}`,
      tipoPlan,
      calendarioIcfes: convocatoria.calendario,
      fechaExamen: convocatoria.fechaExamen,
      fechaVencimientoAcceso,
    };
  }

  // ─── WEBHOOK DE CONFIRMACIÓN ─────────────────────────────────
  async confirmarPago(datos: DatosWebhookEpayco) {
    const customerId = process.env.EPAYCO_CUSTOMER_ID;
    const pKey = process.env.EPAYCO_P_KEY;

    if (!customerId || !pKey) {
      this.logger.error(
        'EPAYCO_CUSTOMER_ID o EPAYCO_P_KEY no configurada. No se puede validar el webhook.',
      );

      throw new ServiceUnavailableException('Pasarela de pago no configurada.');
    }

    const refPayco = datos.x_ref_payco ?? '';
    const transactionId = datos.x_transaction_id ?? '';
    const amount = datos.x_amount ?? '';
    const currency = datos.x_currency_code ?? '';
    const signature = datos.x_signature ?? '';
    const factura = datos.x_id_invoice;

    if (!factura || !transactionId || !signature) {
      this.logger.warn('Webhook de ePayco con datos incompletos.');

      throw new BadRequestException('Datos de la notificación incompletos.');
    }

    const firmaValida = firmaEpaycoValida(
      {
        x_ref_payco: refPayco,
        x_transaction_id: transactionId,
        x_amount: amount,
        x_currency_code: currency,
        x_signature: signature,
      },
      customerId,
      pKey,
    );

    if (!firmaValida) {
      this.logger.error(
        `Firma inválida en webhook de ePayco para la factura ${factura}.`,
      );

      throw new ForbiddenException('Firma inválida.');
    }

    const orden = await this.prisma.pagoOrden.findUnique({
      where: { factura },
    });

    if (!orden) {
      this.logger.warn(
        `Webhook de ePayco para una factura que no existe: ${factura}`,
      );

      return {
        mensaje: 'Factura no encontrada, notificación ignorada.',
      };
    }

    const transaccionPrevia = await this.prisma.pagoOrden.findUnique({
      where: { transaccionId: transactionId },
      select: { id: true, factura: true },
    });
    if (transaccionPrevia && transaccionPrevia.id !== orden.id) {
      this.logger.error(
        `La transacción ${transactionId} ya está asociada a la factura ${transaccionPrevia.factura}.`,
      );
      throw new BadRequestException(
        'La transacción ya fue asociada a otra orden.',
      );
    }

    const montoRecibido = Number(amount);
    if (
      !Number.isFinite(montoRecibido) ||
      montoRecibido !== orden.monto ||
      currency.toUpperCase() !== orden.moneda
    ) {
      this.logger.error(
        `Monto o moneda inválidos para la factura ${factura}. ` +
          `Esperado ${orden.monto} ${orden.moneda}; recibido ${amount} ${currency}.`,
      );
      throw new BadRequestException(
        'El monto confirmado no coincide con la orden de pago.',
      );
    }

    if (
      orden.estado === 'APROBADA' ||
      orden.estado === 'RECHAZADA' ||
      orden.estado === 'FALLIDA'
    ) {
      return {
        mensaje: 'Transacción ya procesada.',
      };
    }

    const nuevoEstado = estadoDesdeRespuestaEpayco(datos.x_response ?? '');
    const debeLiberarCupon =
      orden.cuponId !== null &&
      (nuevoEstado === 'RECHAZADA' || nuevoEstado === 'FALLIDA');
    const debeDevolverCredito =
      orden.creditoReferidosUsado > 0 &&
      (nuevoEstado === 'RECHAZADA' || nuevoEstado === 'FALLIDA');

    const vigenciaAprobada =
      nuevoEstado === 'APROBADA'
        ? await this.calcularVigenciaAprobada(
            orden.usuarioId,
            orden.calendarioIcfes,
            orden.fechaVencimientoAcceso,
          )
        : null;

    const procesada = await this.prisma.$transaction(async (tx) => {
      const actualizada = await tx.pagoOrden.updateMany({
        where: { id: orden.id, estado: orden.estado },
        data: {
          estado: nuevoEstado,
          refPayco: refPayco || null,
          transaccionId: transactionId,
          motivoRespuesta: datos.x_response_reason_text ?? null,
        },
      });

      if (actualizada.count === 0) return false;

      if (debeLiberarCupon && orden.cuponId) {
        await tx.cupon.updateMany({
          where: { id: orden.cuponId, usosActuales: { gt: 0 } },
          data: { usosActuales: { decrement: 1 } },
        });
      }

      if (debeDevolverCredito) {
        await this.referidosService.devolverSaldo(
          tx,
          orden.usuarioId,
          orden.creditoReferidosUsado,
        );
      }

      if (nuevoEstado === 'APROBADA') {
        await this.referidosService.recompensarPrimerPago(
          tx,
          orden.usuarioId,
          orden.id,
        );
        await this.activarPlanPagado(tx, orden.usuarioId, vigenciaAprobada);
      }

      return true;
    });

    if (!procesada) {
      return { mensaje: 'Transacción ya procesada.' };
    }

    return {
      mensaje: 'Notificación procesada.',
    };
  }

  // ─── ACTIVAR EL PLAN TRAS UN PAGO APROBADO ───────────────────
  private async calcularVigenciaAprobada(
    usuarioId: string,
    calendarioOrden: CalendarioTipo | null,
    vigenciaOrden: Date | null,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { calendarioIcfes: true },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario de la orden no encontrado.');
    }

    const calendario = calendarioOrden ?? usuario.calendarioIcfes ?? 'A';

    let vigencia =
      vigenciaOrden ??
      (await this.calendarioIcfesService.calcularVigencia(calendario));

    if (!vigencia) {
      this.logger.warn(
        `No hay fecha oficial de ICFES cargada para el Calendario ${calendario}. ` +
          `Usando ${DIAS_VIGENCIA_RESPALDO} días de respaldo para el usuario ${usuarioId}. ` +
          'Carga las fechas oficiales en /calendario-icfes cuanto antes.',
      );

      vigencia = new Date();
      vigencia.setDate(vigencia.getDate() + DIAS_VIGENCIA_RESPALDO);
    }

    return { calendario, vigencia };
  }

  private async activarPlanPagado(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    datos: { calendario: CalendarioTipo; vigencia: Date },
  ) {
    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { fechaVencimientoPlan: true },
    });
    if (!usuario) {
      throw new NotFoundException('Usuario de la orden no encontrado.');
    }

    const vigenciaFinal =
      usuario.fechaVencimientoPlan &&
      usuario.fechaVencimientoPlan > datos.vigencia
        ? usuario.fechaVencimientoPlan
        : datos.vigencia;

    await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        calendarioIcfes: datos.calendario,
        fechaVencimientoPlan: vigenciaFinal,
      },
    });
  }

  // ─── CONSULTA DE ESTADO ─────────────────────────────────────
  async obtenerEstadoOrden(usuarioId: string, factura: string) {
    const orden = await this.prisma.pagoOrden.findUnique({
      where: { factura },
      select: {
        factura: true,
        usuarioId: true,
        estado: true,
        monto: true,
        montoOriginal: true,
        creditoReferidosUsado: true,
        cuponId: true,
        grado: true,
        tipoPlan: true,
        calendarioIcfes: true,
        fechaVencimientoAcceso: true,
        fechaActualizacion: true,
      },
    });

    if (!orden || orden.usuarioId !== usuarioId) {
      throw new NotFoundException('Orden no encontrada.');
    }

    return {
      factura: orden.factura,
      estado: orden.estado,
      monto: orden.monto,
      montoOriginal: orden.montoOriginal,
      creditoReferidosUsado: orden.creditoReferidosUsado,
      cuponId: orden.cuponId,
      grado: orden.grado,
      tipoPlan: orden.tipoPlan,
      calendarioIcfes: orden.calendarioIcfes,
      fechaVencimientoAcceso: orden.fechaVencimientoAcceso,
      fechaActualizacion: orden.fechaActualizacion,
    };
  }

  private generarFactura(): string {
    const sufijo = crypto.randomBytes(4).toString('hex');
    return `IND-${Date.now()}-${sufijo}`;
  }
}
