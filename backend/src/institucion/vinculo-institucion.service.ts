import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { capacidadesPlanInstitucional } from './institucion-plan.util';
import {
  institutionOperational,
  requireInstitutionOperational,
} from './institution-approval.policy';

@Injectable()
export class VinculoInstitucionService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerContextoProfesor(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: {
        rol: true,
        correo: true,
        institucionId: true,
        membresiaInstitucion: { select: { rol: true } },
      },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado.');
    this.validarProfesor(usuario.rol);

    if (usuario.institucionId) {
      const [institucion, totalEstudiantes, totalGrupos, totalProfesores] =
        await Promise.all([
          this.prisma.institucion.findUnique({
            where: { id: usuario.institucionId },
            select: {
              id: true,
              nombre: true,
              estadoVerificacion: true,
              transicionHasta: true,
              codigoUnico: true,
              planActual: true,
              logoUrl: true,
              mensajeBienvenida: true,
              calendarioIcfes: true,
              limiteGrupos: true,
              limiteEstudiantes: true,
              fechaVencimientoPlan: true,
            },
          }),
          this.prisma.usuario.count({
            where: {
              institucionId: usuario.institucionId,
              rol: 'ESTUDIANTE',
            },
          }),
          this.prisma.clase.count({
            where: { institucionId: usuario.institucionId },
          }),
          this.prisma.miembroInstitucion.count({
            where: { institucionId: usuario.institucionId },
          }),
        ]);
      if (!institucion) {
        throw new NotFoundException('La institución vinculada ya no existe.');
      }
      const capacidades = capacidadesPlanInstitucional(institucion);
      if (!institutionOperational(institucion))
        return {
          estado: 'VERIFICACION_REQUERIDA',
          institucion: null,
          membresia: null,
          solicitud: null,
          invitaciones: [],
        };
      return {
        estado: 'VINCULADO',
        institucion: {
          ...institucion,
          planActual: capacidades.plan,
          limiteGrupos: capacidades.limiteGrupos,
          limiteEstudiantes: capacidades.limiteEstudiantes,
          publicidadHabilitada: capacidades.publicidadHabilitada,
          nivelAnalitica: capacidades.nivelAnalitica,
          alertasHabilitadas: capacidades.alertasHabilitadas,
          prioridadesHabilitadas: capacidades.prioridadesHabilitadas,
          exportacionesHabilitadas: capacidades.exportacionesHabilitadas,
          planVencido: capacidades.planVencido,
          venceEn: capacidades.venceEn,
          totalEstudiantes,
          totalGrupos,
          totalProfesores,
        },
        membresia: {
          rol:
            usuario.membresiaInstitucion?.rol ??
            (usuario.rol === 'ADMIN' ? 'ADMINISTRADOR' : 'PROFESOR'),
        },
        solicitud: null,
        invitaciones: [],
      };
    }

    await this.prisma.invitacionInstitucion.updateMany({
      where: { estado: 'PENDIENTE', fechaExpiracion: { lte: new Date() } },
      data: { estado: 'EXPIRADA' },
    });
    const [solicitud, invitaciones] = await Promise.all([
      this.prisma.solicitudIngresoInstitucion.findFirst({
        where: { solicitanteId: usuarioId, estado: 'PENDIENTE' },
        orderBy: { fechaCreacion: 'desc' },
        select: {
          id: true,
          estado: true,
          mensaje: true,
          fechaCreacion: true,
          institucion: { select: { nombre: true, codigoUnico: true } },
        },
      }),
      this.prisma.invitacionInstitucion.findMany({
        where: {
          correo: usuario.correo.trim().toLowerCase(),
          estado: 'PENDIENTE',
        },
        orderBy: { fechaCreacion: 'desc' },
        select: {
          id: true,
          rol: true,
          fechaExpiracion: true,
          fechaCreacion: true,
          institucion: {
            select: { id: true, nombre: true, codigoUnico: true },
          },
          creadoPor: { select: { nombre: true } },
        },
      }),
    ]);
    return {
      estado: solicitud ? 'SOLICITUD_PENDIENTE' : 'SIN_INSTITUCION',
      institucion: null,
      membresia: null,
      solicitud,
      invitaciones,
    };
  }

  async solicitarIngreso(
    usuarioId: string,
    codigoInstitucion: string,
    mensaje?: string,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { rol: true, institucionId: true },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado.');
    if (usuario.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo una cuenta personal de profesor puede solicitar ingreso.',
      );
    }
    if (usuario.institucionId) {
      throw new BadRequestException('Ya perteneces a una institución.');
    }

    const codigo = codigoInstitucion.trim().toUpperCase();
    const institucion = await this.prisma.institucion.findUnique({
      where: { codigoUnico: codigo },
      select: {
        id: true,
        nombre: true,
        codigoUnico: true,
        estadoVerificacion: true,
        transicionHasta: true,
      },
    });
    if (!institucion) {
      throw new NotFoundException(
        'No encontramos una institución con ese código.',
      );
    }

    requireInstitutionOperational(institucion);
    const pendiente = await this.prisma.solicitudIngresoInstitucion.findFirst({
      where: { solicitanteId: usuarioId, estado: 'PENDIENTE' },
      select: { id: true },
    });
    if (pendiente) {
      throw new BadRequestException('Ya tienes una solicitud pendiente.');
    }

    try {
      const solicitud = await this.prisma.solicitudIngresoInstitucion.create({
        data: {
          institucionId: institucion.id,
          solicitanteId: usuarioId,
          mensaje: mensaje?.trim() || null,
        },
        select: {
          id: true,
          estado: true,
          mensaje: true,
          fechaCreacion: true,
        },
      });
      return { ...solicitud, institucion };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('Ya tienes una solicitud pendiente.');
      }
      throw error;
    }
  }

  async cancelarSolicitud(usuarioId: string) {
    const resultado = await this.prisma.solicitudIngresoInstitucion.updateMany({
      where: { solicitanteId: usuarioId, estado: 'PENDIENTE' },
      data: { estado: 'CANCELADA' },
    });
    if (resultado.count === 0) {
      throw new NotFoundException('No tienes una solicitud pendiente.');
    }
    return { cancelada: true };
  }

  private validarProfesor(rol: string | null) {
    if (rol !== 'PROFESOR' && rol !== 'ADMIN') {
      throw new ForbiddenException(
        'Esta sección está disponible para profesores.',
      );
    }
  }
}
