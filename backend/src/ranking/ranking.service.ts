import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RolUsuario } from '@prisma/client';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export enum AlcanceRanking {
  GLOBAL = 'GLOBAL',
  INSTITUCION = 'INSTITUCION',
}

export enum PeriodoRanking {
  SEMANA = 'SEMANA',
  MES = 'MES',
  TOTAL = 'TOTAL',
}

interface EntradaCalculada {
  usuarioId: string;
  alias: string;
  xp: number;
  posicion: number;
  esUsuarioActual: boolean;
}

const IDENTIDADES_RANKING = [
  'Águila',
  'Colibrí',
  'Cóndor',
  'Delfín',
  'Jaguar',
  'Lince',
  'Lobo',
  'Mariposa',
  'Ocelote',
  'Quetzal',
  'Tortuga',
  'Zorro',
] as const;

@Injectable()
export class RankingService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerRanking(
    usuarioId: string,
    alcance: AlcanceRanking,
    periodo: PeriodoRanking,
    limite: number,
  ) {
    const solicitante = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        rol: true,
        institucionId: true,
      },
    });

    if (!solicitante) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    if (alcance === AlcanceRanking.INSTITUCION && !solicitante.institucionId) {
      throw new BadRequestException(
        'Debes pertenecer a una institución para consultar este ranking.',
      );
    }

    const filtroUsuarios: Prisma.UsuarioWhereInput = {
      rol: RolUsuario.ESTUDIANTE,
      ...(alcance === AlcanceRanking.INSTITUCION
        ? { institucionId: solicitante.institucionId }
        : {}),
    };

    const usuarios = await this.prisma.usuario.findMany({
      where: filtroUsuarios,
      select: {
        id: true,
        xpTotal: true,
      },
    });

    const fechaDesde = this.obtenerFechaDesde(periodo);
    const ids = usuarios.map((usuario) => usuario.id);
    const [xpSimulacros, xpBatallas] =
      ids.length === 0 || !fechaDesde
        ? [[], []]
        : await Promise.all([
            this.prisma.resultadoSimulacro.groupBy({
              by: ['usuarioId'],
              where: {
                usuarioId: { in: ids },
                fechaRealizado: { gte: fechaDesde },
              },
              _sum: { xpGanado: true },
            }),
            this.prisma.batallaParticipante.groupBy({
              by: ['usuarioId'],
              where: {
                usuarioId: { in: ids },
                finalizadoEn: { gte: fechaDesde },
                xpGanado: { gt: 0 },
              },
              _sum: { xpGanado: true },
            }),
          ]);

    const xpSimulacrosPorUsuario = new Map(
      xpSimulacros.map((item) => [item.usuarioId, item._sum.xpGanado ?? 0]),
    );
    const xpBatallasPorUsuario = new Map(
      xpBatallas.map((item) => [item.usuarioId, item._sum.xpGanado ?? 0]),
    );

    const participantes = usuarios
      .map((usuario) => {
        const xp =
          periodo === PeriodoRanking.TOTAL
            ? (usuario.xpTotal ?? 0)
            : (xpSimulacrosPorUsuario.get(usuario.id) ?? 0) +
              (xpBatallasPorUsuario.get(usuario.id) ?? 0);

        return {
          usuarioId: usuario.id,
          alias: this.crearAlias(usuario.id, alcance),
          xp,
          esUsuarioActual: usuario.id === usuarioId,
        };
      })
      .filter((entrada) => entrada.xp > 0)
      .sort((a, b) => b.xp - a.xp || a.alias.localeCompare(b.alias, 'es'));

    let posicionActual = 0;
    let xpAnterior: number | null = null;
    const entradas: EntradaCalculada[] = participantes.map(
      (entrada, indice) => {
        if (xpAnterior === null || entrada.xp < xpAnterior) {
          posicionActual = indice + 1;
        }
        xpAnterior = entrada.xp;
        return { ...entrada, posicion: posicionActual };
      },
    );

    const presentar = (entrada: EntradaCalculada) => ({
      posicion: entrada.posicion,
      alias: entrada.esUsuarioActual ? 'Tú' : entrada.alias,
      xp: entrada.xp,
      esUsuarioActual: entrada.esUsuarioActual,
    });

    const miEntrada = entradas.find((entrada) => entrada.esUsuarioActual);

    return {
      alcance,
      periodo,
      nombreAlcance:
        alcance === AlcanceRanking.INSTITUCION ? 'Mi institución' : 'SaberPlus',
      institucionDisponible: Boolean(solicitante.institucionId),
      totalParticipantes: entradas.length,
      actualizadoEn: new Date().toISOString(),
      ranking: entradas.slice(0, limite).map(presentar),
      miPosicion: miEntrada ? presentar(miEntrada) : null,
      privacidad: {
        identidadesProtegidas: true,
        datosPublicados: ['posicion', 'alias', 'xp'],
      },
    };
  }

  private obtenerFechaDesde(periodo: PeriodoRanking) {
    if (periodo === PeriodoRanking.TOTAL) return null;
    const fecha = new Date();
    fecha.setDate(
      fecha.getDate() - (periodo === PeriodoRanking.SEMANA ? 7 : 30),
    );
    return fecha;
  }

  private crearAlias(usuarioId: string, alcance: AlcanceRanking) {
    const secreto =
      process.env.RANKING_ALIAS_SECRET ??
      process.env.JWT_SECRET ??
      'saberplus-ranking-development';
    const firma = createHmac('sha256', secreto)
      .update(`ranking-v1:${alcance}:${usuarioId}`)
      .digest();
    const identidad =
      IDENTIDADES_RANKING[firma[0] % IDENTIDADES_RANKING.length];
    const numero = (firma.readUInt32BE(1) % 900000) + 100000;
    return `Estudiante ${identidad} ${numero}`;
  }
}
