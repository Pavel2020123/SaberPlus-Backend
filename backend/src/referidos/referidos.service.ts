import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const RECOMPENSA_REFERIDO_COP = 5_000;
export const MONTO_MINIMO_PAGO_COP = 1_000;

@Injectable()
export class ReferidosService {
  constructor(private readonly prisma: PrismaService) {}

  async prepararRegistro(codigo: string | undefined, correoNuevo: string) {
    const codigoNuevo = await this.generarCodigoUnico();
    const codigoUsado = this.normalizarCodigo(codigo);

    if (!codigoUsado) {
      return { codigoNuevo, referidorId: null, codigoUsado: null };
    }

    const referidor = await this.prisma.usuario.findUnique({
      where: { codigoReferido: codigoUsado },
      select: { id: true, correo: true, rol: true },
    });

    if (!referidor || referidor.rol !== 'ESTUDIANTE') {
      throw new BadRequestException('El código de referido no es válido.');
    }

    if (referidor.correo.toLowerCase() === correoNuevo.toLowerCase()) {
      throw new BadRequestException(
        'No puedes usar tu propio código de referido.',
      );
    }

    return { codigoNuevo, referidorId: referidor.id, codigoUsado };
  }

  async validarCodigo(codigo: string) {
    const codigoNormalizado = this.normalizarCodigo(codigo);
    if (!codigoNormalizado) return { valido: false };

    const referidor = await this.prisma.usuario.findUnique({
      where: { codigoReferido: codigoNormalizado },
      select: { rol: true },
    });

    if (!referidor || referidor.rol !== 'ESTUDIANTE') {
      return { valido: false };
    }

    return {
      valido: true,
      codigo: codigoNormalizado,
    };
  }

  async obtenerResumenMovil(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, rol: true, codigoReferido: true },
    });

    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (usuario.rol !== 'ESTUDIANTE') {
      throw new BadRequestException(
        'El programa de referidos estÃ¡ disponible para estudiantes.',
      );
    }

    let codigo = usuario.codigoReferido;
    if (!codigo) {
      const candidato = await this.generarCodigoUnico();
      await this.prisma.usuario.updateMany({
        where: { id: usuario.id, codigoReferido: null },
        data: { codigoReferido: candidato },
      });
      const actualizado = await this.prisma.usuario.findUnique({
        where: { id: usuario.id },
        select: { codigoReferido: true },
      });
      codigo = actualizado?.codigoReferido ?? candidato;
    }

    const [totalInvitaciones, invitaciones] = await Promise.all([
      this.prisma.referido.count({ where: { referidorId: usuarioId } }),
      this.prisma.referido.findMany({
        where: { referidorId: usuarioId },
        orderBy: { fechaRegistro: 'desc' },
        take: 20,
        select: { id: true, fechaRegistro: true },
      }),
    ]);

    return {
      codigo,
      totalInvitaciones,
      invitaciones,
      beneficio: {
        estado: 'POR_DEFINIR',
        descripcion:
          'PodrÃ¡s invitar a otros estudiantes. El beneficio se publicarÃ¡ cuando estÃ© configurado el comercio mÃ³vil.',
      },
    };
  }

  async obtenerResumen(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        rol: true,
        codigoReferido: true,
        saldoReferidosCop: true,
      },
    });

    if (!usuario) throw new NotFoundException('Usuario no encontrado.');
    if (usuario.rol !== 'ESTUDIANTE') {
      throw new BadRequestException(
        'El programa de referidos está disponible para estudiantes.',
      );
    }

    let codigo = usuario.codigoReferido;
    let saldoReferidosCop = usuario.saldoReferidosCop;
    if (!codigo) {
      const candidato = await this.generarCodigoUnico();
      await this.prisma.usuario.updateMany({
        where: { id: usuario.id, codigoReferido: null },
        data: { codigoReferido: candidato },
      });

      const actualizado = await this.prisma.usuario.findUnique({
        where: { id: usuario.id },
        select: { codigoReferido: true, saldoReferidosCop: true },
      });
      codigo = actualizado?.codigoReferido ?? candidato;
      saldoReferidosCop = actualizado?.saldoReferidosCop ?? saldoReferidosCop;
    }

    const [total, recompensados, referidos] = await Promise.all([
      this.prisma.referido.count({ where: { referidorId: usuarioId } }),
      this.prisma.referido.count({
        where: { referidorId: usuarioId, estado: 'RECOMPENSADO' },
      }),
      this.prisma.referido.findMany({
        where: { referidorId: usuarioId },
        orderBy: { fechaRegistro: 'desc' },
        take: 20,
        select: {
          id: true,
          estado: true,
          recompensaCop: true,
          fechaRegistro: true,
          fechaRecompensa: true,
          referido: { select: { nombre: true } },
        },
      }),
    ]);

    const frontendUrl = (
      process.env.FRONTEND_URL || 'http://localhost:3001'
    ).replace(/\/$/, '');

    return {
      codigo,
      enlace: `${frontendUrl}/registro?ref=${codigo}`,
      saldoReferidosCop,
      recompensaPorReferidoCop: RECOMPENSA_REFERIDO_COP,
      totalReferidos: total,
      referidosRecompensados: recompensados,
      referidosPendientes: total - recompensados,
      referidos: referidos.map((item) => ({
        id: item.id,
        nombre: this.anonimizarNombre(item.referido.nombre),
        estado: item.estado,
        recompensaCop: item.recompensaCop,
        fechaRegistro: item.fechaRegistro,
        fechaRecompensa: item.fechaRecompensa,
      })),
    };
  }

  async reservarSaldo(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    montoDespuesDePromocion: number,
  ) {
    const maximoAplicable = Math.max(
      0,
      montoDespuesDePromocion - MONTO_MINIMO_PAGO_COP,
    );
    if (maximoAplicable === 0) return 0;

    const usuario = await tx.usuario.findUnique({
      where: { id: usuarioId },
      select: { saldoReferidosCop: true },
    });
    const credito = Math.min(usuario?.saldoReferidosCop ?? 0, maximoAplicable);
    if (credito <= 0) return 0;

    const reservado = await tx.usuario.updateMany({
      where: { id: usuarioId, saldoReferidosCop: { gte: credito } },
      data: { saldoReferidosCop: { decrement: credito } },
    });

    return reservado.count === 1 ? credito : 0;
  }

  async devolverSaldo(
    tx: Prisma.TransactionClient,
    usuarioId: string,
    credito: number,
  ) {
    if (credito <= 0) return;
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { saldoReferidosCop: { increment: credito } },
    });
  }

  async recompensarPrimerPago(
    tx: Prisma.TransactionClient,
    referidoId: string,
    ordenPagoId: string,
  ) {
    const referido = await tx.referido.findUnique({
      where: { referidoId },
      select: { id: true, referidorId: true, estado: true },
    });
    if (!referido || referido.estado === 'RECOMPENSADO') return false;

    const actualizado = await tx.referido.updateMany({
      where: { id: referido.id, estado: 'REGISTRADO' },
      data: {
        estado: 'RECOMPENSADO',
        recompensaCop: RECOMPENSA_REFERIDO_COP,
        ordenPagoId,
        fechaRecompensa: new Date(),
      },
    });
    if (actualizado.count === 0) return false;

    await tx.usuario.update({
      where: { id: referido.referidorId },
      data: { saldoReferidosCop: { increment: RECOMPENSA_REFERIDO_COP } },
    });
    return true;
  }

  private normalizarCodigo(codigo?: string) {
    const normalizado = codigo?.trim().toUpperCase();
    return normalizado || null;
  }

  private async generarCodigoUnico() {
    for (let intento = 0; intento < 8; intento += 1) {
      const codigo = crypto.randomBytes(5).toString('hex').toUpperCase();
      const existe = await this.prisma.usuario.findUnique({
        where: { codigoReferido: codigo },
        select: { id: true },
      });
      if (!existe) return codigo;
    }
    throw new BadRequestException(
      'No pudimos generar tu código de referido. Intenta de nuevo.',
    );
  }

  private anonimizarNombre(nombre: string) {
    const primeraPalabra = nombre.trim().split(/\s+/)[0] || 'Estudiante';
    if (primeraPalabra.length <= 2) return `${primeraPalabra[0] ?? 'E'}***`;
    return `${primeraPalabra.slice(0, 2)}***`;
  }
}
