import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cupon, Prisma, TipoPlan } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResultadoCupon {
  cuponId: string;
  codigo: string | null;
  titulo: string | null;
  esAutomatica: boolean;
  porcentajeDescuento: number;
  montoOriginal: number;
  montoConDescuento: number;
}

export interface CuponValidado {
  cuponId: string;
  codigo: string;
  porcentajeDescuento: number;
  usosDisponibles: number | null;
}

export interface PromocionActiva {
  cuponId: string;
  titulo: string;
  porcentajeDescuento: number;
  tipoPlan: TipoPlan | null;
  fechaExpiracion: Date;
  usosDisponibles: number | null;
}

type ClientePrisma = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CuponesService {
  constructor(private prisma: PrismaService) {}

  async crear(datos: {
    codigo?: string;
    titulo?: string;
    esAutomatica?: boolean;
    porcentajeDescuento: number;
    tipoPlan?: TipoPlan;
    fechaExpiracion: Date;
    usosMaximos?: number;
  }) {
    const esAutomatica = datos.esAutomatica ?? false;
    const codigo = esAutomatica
      ? `PROMO-${randomUUID().toUpperCase()}`
      : this.normalizarCodigo(datos.codigo ?? '');

    this.validarPorcentaje(datos.porcentajeDescuento);
    this.validarFechaFutura(datos.fechaExpiracion);
    this.validarLimiteUsos(datos.usosMaximos);

    try {
      const creado = await this.prisma.cupon.create({
        data: {
          codigo,
          titulo: esAutomatica
            ? this.normalizarTitulo(datos.titulo, datos.porcentajeDescuento)
            : null,
          esAutomatica,
          porcentajeDescuento: datos.porcentajeDescuento,
          tipoPlan: datos.tipoPlan ?? null,
          fechaExpiracion: datos.fechaExpiracion,
          usosMaximos: datos.usosMaximos ?? null,
        },
      });

      return this.presentarAdmin(creado);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          `Ya existe un cupón con el código "${codigo}".`,
        );
      }
      throw error;
    }
  }

  async listar() {
    const promociones = await this.prisma.cupon.findMany({
      orderBy: { fechaCreacion: 'desc' },
    });

    return promociones.map((promocion) => this.presentarAdmin(promocion));
  }

  async actualizar(
    id: string,
    datos: {
      activo?: boolean;
      titulo?: string;
      porcentajeDescuento?: number;
      tipoPlan?: TipoPlan | null;
      fechaExpiracion?: Date;
      usosMaximos?: number | null;
    },
  ) {
    const cupon = await this.prisma.cupon.findUnique({ where: { id } });
    if (!cupon) throw new NotFoundException('Promoción no encontrada.');

    if (datos.porcentajeDescuento !== undefined) {
      this.validarPorcentaje(datos.porcentajeDescuento);
    }
    if (datos.fechaExpiracion !== undefined) {
      this.validarFechaFutura(datos.fechaExpiracion);
    }
    if (datos.usosMaximos !== undefined && datos.usosMaximos !== null) {
      this.validarLimiteUsos(datos.usosMaximos);
      if (datos.usosMaximos < cupon.usosActuales) {
        throw new BadRequestException(
          `El límite no puede ser menor que los ${cupon.usosActuales} usos actuales.`,
        );
      }
    }

    const actualizado = await this.prisma.cupon.update({
      where: { id },
      data: {
        ...datos,
        titulo:
          cupon.esAutomatica && datos.titulo !== undefined
            ? this.normalizarTitulo(
                datos.titulo,
                datos.porcentajeDescuento ?? cupon.porcentajeDescuento,
              )
            : undefined,
      },
    });

    return this.presentarAdmin(actualizado);
  }

  async eliminar(id: string) {
    const cupon = await this.prisma.cupon.findUnique({ where: { id } });
    if (!cupon) throw new NotFoundException('Promoción no encontrada.');

    const eliminado = await this.prisma.cupon.delete({ where: { id } });
    return this.presentarAdmin(eliminado);
  }

  async validar(codigo: string, tipoPlan: TipoPlan): Promise<CuponValidado> {
    const cupon = await this.buscarCuponUtilizable(codigo, tipoPlan);

    return {
      cuponId: cupon.id,
      codigo: cupon.codigo,
      porcentajeDescuento: cupon.porcentajeDescuento,
      usosDisponibles: this.calcularUsosDisponibles(cupon),
    };
  }

  async obtenerPromocionActiva(
    tipoPlan: TipoPlan,
  ): Promise<PromocionActiva | null> {
    const promociones = await this.buscarPromocionesAutomaticas(tipoPlan);
    const promocion = promociones.find((item) => this.tieneUsos(item));

    if (!promocion) return null;

    return {
      cuponId: promocion.id,
      titulo:
        promocion.titulo ?? `${promocion.porcentajeDescuento}% de descuento`,
      porcentajeDescuento: promocion.porcentajeDescuento,
      tipoPlan: promocion.tipoPlan,
      fechaExpiracion: promocion.fechaExpiracion,
      usosDisponibles: this.calcularUsosDisponibles(promocion),
    };
  }

  async aplicar(
    codigo: string,
    tipoPlan: TipoPlan,
    montoOriginal: number,
    cliente: ClientePrisma = this.prisma,
  ): Promise<ResultadoCupon> {
    this.validarMonto(montoOriginal);
    const cupon = await this.buscarCuponUtilizable(codigo, tipoPlan, cliente);
    const resultado = await this.consumir(
      cupon,
      tipoPlan,
      montoOriginal,
      cliente,
    );

    if (!resultado) {
      await this.buscarCuponUtilizable(codigo, tipoPlan, cliente);
      throw new BadRequestException('Este cupón ya no está disponible.');
    }

    return resultado;
  }

  async aplicarAutomatica(
    tipoPlan: TipoPlan,
    montoOriginal: number,
    cliente: ClientePrisma = this.prisma,
  ): Promise<ResultadoCupon | null> {
    this.validarMonto(montoOriginal);
    const promociones = await this.buscarPromocionesAutomaticas(
      tipoPlan,
      cliente,
    );

    for (const promocion of promociones) {
      if (!this.tieneUsos(promocion)) continue;
      const resultado = await this.consumir(
        promocion,
        tipoPlan,
        montoOriginal,
        cliente,
      );
      if (resultado) return resultado;
    }

    return null;
  }

  private async consumir(
    cupon: Cupon,
    tipoPlan: TipoPlan,
    montoOriginal: number,
    cliente: ClientePrisma,
  ): Promise<ResultadoCupon | null> {
    const resultado = await cliente.cupon.updateMany({
      where: {
        id: cupon.id,
        esAutomatica: cupon.esAutomatica,
        activo: true,
        fechaExpiracion: { gt: new Date() },
        OR: [{ tipoPlan: null }, { tipoPlan }],
        ...(cupon.usosMaximos === null
          ? {}
          : { usosActuales: { lt: cupon.usosMaximos } }),
      },
      data: { usosActuales: { increment: 1 } },
    });

    if (resultado.count === 0) return null;

    return {
      cuponId: cupon.id,
      codigo: cupon.esAutomatica ? null : cupon.codigo,
      titulo: cupon.esAutomatica ? cupon.titulo : null,
      esAutomatica: cupon.esAutomatica,
      porcentajeDescuento: cupon.porcentajeDescuento,
      montoOriginal,
      montoConDescuento: Math.round(
        montoOriginal * (1 - cupon.porcentajeDescuento / 100),
      ),
    };
  }

  private async buscarCuponUtilizable(
    codigo: string,
    tipoPlan: TipoPlan,
    cliente: ClientePrisma = this.prisma,
  ) {
    const cupon = await cliente.cupon.findFirst({
      where: {
        codigo: this.normalizarCodigo(codigo),
        esAutomatica: false,
      },
    });

    if (!cupon) throw new BadRequestException('Ese cupón no existe.');
    if (!cupon.activo) {
      throw new BadRequestException('Ese cupón ya no está activo.');
    }
    if (cupon.fechaExpiracion.getTime() <= Date.now()) {
      throw new BadRequestException('Ese cupón ya expiró.');
    }
    if (cupon.tipoPlan && cupon.tipoPlan !== tipoPlan) {
      throw new BadRequestException(
        'Ese cupón no aplica al plan que elegiste.',
      );
    }
    if (!this.tieneUsos(cupon)) {
      throw new BadRequestException('Este cupón ya alcanzó su límite de usos.');
    }

    return cupon;
  }

  private buscarPromocionesAutomaticas(
    tipoPlan: TipoPlan,
    cliente: ClientePrisma = this.prisma,
  ) {
    return cliente.cupon.findMany({
      where: {
        esAutomatica: true,
        activo: true,
        fechaExpiracion: { gt: new Date() },
        OR: [{ tipoPlan: null }, { tipoPlan }],
      },
      orderBy: [{ porcentajeDescuento: 'desc' }, { fechaExpiracion: 'asc' }],
    });
  }

  private presentarAdmin(cupon: Cupon) {
    return {
      ...cupon,
      codigo: cupon.esAutomatica ? null : cupon.codigo,
    };
  }

  private calcularUsosDisponibles(cupon: Cupon): number | null {
    return cupon.usosMaximos === null
      ? null
      : Math.max(0, cupon.usosMaximos - cupon.usosActuales);
  }

  private tieneUsos(cupon: Cupon): boolean {
    return cupon.usosMaximos === null || cupon.usosActuales < cupon.usosMaximos;
  }

  private normalizarCodigo(codigo: string): string {
    const normalizado = codigo.trim().toUpperCase();
    if (!normalizado || normalizado.length > 50) {
      throw new BadRequestException(
        'El código debe tener entre 1 y 50 caracteres.',
      );
    }
    if (!/^[A-Z0-9_-]+$/.test(normalizado)) {
      throw new BadRequestException(
        'El código solo puede contener letras, números, guiones y guion bajo.',
      );
    }
    return normalizado;
  }

  private normalizarTitulo(
    titulo: string | undefined,
    porcentaje: number,
  ): string {
    const normalizado = titulo?.trim() || `${porcentaje}% de descuento`;
    if (normalizado.length > 120) {
      throw new BadRequestException(
        'El título de la promoción no puede superar 120 caracteres.',
      );
    }
    return normalizado;
  }

  private validarMonto(montoOriginal: number) {
    if (!Number.isInteger(montoOriginal) || montoOriginal <= 0) {
      throw new BadRequestException('El monto original no es válido.');
    }
  }

  private validarPorcentaje(porcentaje: number) {
    if (!Number.isInteger(porcentaje) || porcentaje < 1 || porcentaje > 99) {
      throw new BadRequestException(
        'El descuento debe ser un porcentaje entero entre 1 y 99.',
      );
    }
  }

  private validarFechaFutura(fecha: Date) {
    if (Number.isNaN(fecha.getTime()) || fecha.getTime() <= Date.now()) {
      throw new BadRequestException(
        'La fecha de expiración debe estar en el futuro.',
      );
    }
  }

  private validarLimiteUsos(usosMaximos?: number) {
    if (
      usosMaximos !== undefined &&
      (!Number.isInteger(usosMaximos) || usosMaximos < 1)
    ) {
      throw new BadRequestException(
        'El límite de usos debe ser un entero mayor que cero.',
      );
    }
  }
}
