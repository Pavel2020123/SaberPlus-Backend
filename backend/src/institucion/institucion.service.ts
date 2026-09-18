import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { generarCodigoConPrefijo } from './utils/generar-codigo.util';

@Injectable()
export class InstitucionService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private institucionAcceso: InstitucionAccesoService,
  ) {}

  async obtenerMiInstitucion(usuarioId: string) {
    const usuario =
      await this.institucionAcceso.obtenerContextoUsuario(usuarioId);
    if (!usuario.institucionId) {
      return null;
    }

    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      return this.prisma.institucion.findUnique({
        where: { id: usuario.institucionId },
        select: {
          id: true,
          nombre: true,
          logoUrl: true,
          mensajeBienvenida: true,
          calendarioIcfes: true,
        },
      });
    }

    return this.prisma.institucion.findUnique({
      where: { id: usuario.institucionId },
      include: {
        Usuario: {
          select: { id: true, nombre: true, rol: true },
        },
        Clase: {
          select: { id: true, nombre: true, grado: true },
        },
      },
    });
  }

  async crearInstitucion(
    usuarioId: string,
    nombre: string,
    mensajeBienvenida?: string,
    logoUrl?: string,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true, rol: true, correo: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (usuario.institucionId) {
      throw new BadRequestException('Ya perteneces a una institución.');
    }

    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      throw new UnauthorizedException(
        'Solo profesores o administradores pueden crear una institución.',
      );
    }

    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      throw new BadRequestException(
        'El nombre de la institución no puede estar vacío.',
      );
    }
    const codigoUnico = await this.generarCodigoUnico();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const institucion = await tx.institucion.create({
          data: {
            nombre: nombreLimpio,
            codigoUnico,
            planActual: 'GRATIS',
            limiteGrupos: 1,
            limiteEstudiantes: 40,
            mensajeBienvenida: mensajeBienvenida?.trim() || null,
            logoUrl: logoUrl?.trim() || null,
            Usuario: {
              connect: { id: usuarioId },
            },
          },
        });
        await tx.miembroInstitucion.create({
          data: {
            institucionId: institucion.id,
            usuarioId,
            rol: 'PROPIETARIO',
          },
        });
        await tx.solicitudIngresoInstitucion.updateMany({
          where: { solicitanteId: usuarioId, estado: 'PENDIENTE' },
          data: { estado: 'CANCELADA' },
        });
        await tx.invitacionInstitucion.updateMany({
          where: {
            correo: usuario.correo.trim().toLowerCase(),
            estado: 'PENDIENTE',
          },
          data: { estado: 'CANCELADA' },
        });
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId: institucion.id,
            actorId: usuarioId,
            afectadoId: usuarioId,
            accion: 'INSTITUCION_CREADA',
          },
        });
        return institucion;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          'Tu cuenta ya creó o vinculó una institución.',
        );
      }
      throw error;
    }
  }

  async actualizarMiInstitucion(
    usuarioId: string,
    nombre?: string,
    mensajeBienvenida?: string,
    logoUrl?: string,
  ) {
    const institucionId =
      await this.institucionAcceso.obtenerInstitucionIdGestionable(usuarioId);

    if (nombre !== undefined) {
      const current = await this.prisma.institucion.findUniqueOrThrow({
        where: { id: institucionId },
        select: { nombre: true },
      });
      if (nombre.trim() !== current.nombre)
        throw new BadRequestException(
          'El nombre identifica a la institución verificada. Solicita su cambio al equipo de SaberPlus.',
        );
    }

    return this.prisma.institucion.update({
      where: { id: institucionId },
      data: {
        ...(nombre !== undefined && { nombre }),
        ...(mensajeBienvenida !== undefined && { mensajeBienvenida }),
        ...(logoUrl !== undefined && { logoUrl }),
      },
    });
  }

  async eliminarMiInstitucion(usuarioId: string) {
    const approval = await this.prisma.solicitudAltaInstitucion.findFirst({
      where: { institucion: { Usuario: { some: { id: usuarioId } } } },
      select: { id: true },
    });
    if (approval)
      throw new BadRequestException(
        'Solicita la baja al equipo de SaberPlus. Se conservará el historial de verificación y no se borrarán los datos de los estudiantes desde esta acción.',
      );
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        id: true,
        correo: true,
        rol: true,
        nombre: true,
        institucionId: true,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!usuario.institucionId) {
      throw new BadRequestException('No perteneces a una institución.');
    }

    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      throw new UnauthorizedException(
        'Solo un profesor o administrador puede eliminar la institución.',
      );
    }

    const institucionId = usuario.institucionId;

    // Usuario no tiene onDelete: Cascade hacia Institucion, así que
    // desvinculamos a todos antes de borrar (Clase sí cascadea solo).
    await this.prisma.$transaction([
      this.prisma.usuario.updateMany({
        where: { institucionId },
        data: { institucionId: null },
      }),
      this.prisma.institucion.delete({ where: { id: institucionId } }),
    ]);

    // El institucionId viaja en el JWT, así que emitimos uno nuevo sin él.
    const payload = {
      sub: usuario.id,
      correo: usuario.correo,
      rol: usuario.rol,
      nombre: usuario.nombre,
      institucionId: null,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      mensaje: 'La institución fue eliminada correctamente.',
      accessToken,
    };
  }

  async obtenerAnaliticasDeMiInstitucion(usuarioId: string) {
    const institucionId =
      await this.institucionAcceso.obtenerInstitucionIdGestionable(usuarioId);
    const capacidades =
      await this.institucionAcceso.obtenerCapacidadesInstitucion(institucionId);
    if (capacidades.nivelAnalitica !== 'DETALLADA') {
      throw new ForbiddenException(
        'Tu plan incluye los indicadores básicos, no la analítica detallada.',
      );
    }

    const totalSubtemas = await this.prisma.subtema.count();

    const estudiantes = await this.prisma.usuario.findMany({
      where: { institucionId, rol: 'ESTUDIANTE' },
      select: {
        id: true,
        nombre: true,
        correo: true,
        xpTotal: true,
        ClaseEstudiante: {
          select: { Clase: { select: { id: true, nombre: true } } },
        },
        resultados: {
          select: { area: true, puntaje: true, fechaRealizado: true },
        },
        progresotemas: {
          select: { completado: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    const resumenEstudiantes = estudiantes.map((est) => {
      const totalSimulacros = est.resultados.length;
      const promedioPuntaje =
        totalSimulacros > 0
          ? Math.round(
              (est.resultados.reduce((acc, r) => acc + r.puntaje, 0) /
                totalSimulacros) *
                10,
            ) / 10
          : 0;
      const fechas = est.resultados.map((r) => r.fechaRealizado.getTime());
      const ultimoSimulacro =
        fechas.length > 0 ? new Date(Math.max(...fechas)) : null;

      const temasCompletados = est.progresotemas.filter(
        (p) => p.completado,
      ).length;
      const progresoPorcentaje =
        totalSubtemas > 0
          ? Math.round((temasCompletados / totalSubtemas) * 100)
          : 0;

      const porAreaMap: Record<string, { suma: number; cantidad: number }> = {};
      est.resultados.forEach((r) => {
        if (!porAreaMap[r.area]) porAreaMap[r.area] = { suma: 0, cantidad: 0 };
        porAreaMap[r.area].suma += r.puntaje;
        porAreaMap[r.area].cantidad += 1;
      });
      const porArea = Object.entries(porAreaMap).map(([area, v]) => ({
        area,
        promedio: Math.round((v.suma / v.cantidad) * 10) / 10,
        cantidad: v.cantidad,
      }));

      return {
        id: est.id,
        nombre: est.nombre,
        correo: est.correo,
        xpTotal: est.xpTotal ?? 0,
        grupos: est.ClaseEstudiante.map((ce) => ce.Clase.nombre),
        totalSimulacros,
        promedioPuntaje,
        ultimoSimulacro,
        temasCompletados,
        totalSubtemas,
        progresoPorcentaje,
        porArea,
      };
    });

    const conSimulacros = resumenEstudiantes.filter(
      (e) => e.totalSimulacros > 0,
    );
    const promedioGeneral =
      conSimulacros.length > 0
        ? Math.round(
            (conSimulacros.reduce((acc, e) => acc + e.promedioPuntaje, 0) /
              conSimulacros.length) *
              10,
          ) / 10
        : 0;
    const totalSimulacrosInstitucion = resumenEstudiantes.reduce(
      (acc, e) => acc + e.totalSimulacros,
      0,
    );

    return {
      institucion: {
        totalEstudiantes: resumenEstudiantes.length,
        promedioGeneral,
        totalSimulacros: totalSimulacrosInstitucion,
      },
      estudiantes: resumenEstudiantes,
    };
  }

  private async generarCodigoUnico() {
    return generarCodigoConPrefijo(
      'INST',
      async (codigo) =>
        (await this.prisma.institucion.findUnique({
          where: { codigoUnico: codigo },
        })) !== null,
    );
  }
}
