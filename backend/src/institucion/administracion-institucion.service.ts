import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, RolMembresiaInstitucion } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type RolGestionable = 'ADMINISTRADOR' | 'PROFESOR';
type DecisionSolicitud = 'APROBAR' | 'RECHAZAR';

@Injectable()
export class AdministracionInstitucionService {
  constructor(private readonly prisma: PrismaService) {}

  async obtenerPanel(usuarioId: string) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    await this.expirarInvitaciones();

    const [miembros, solicitudes, invitaciones, auditoria] = await Promise.all([
      this.prisma.miembroInstitucion.findMany({
        where: { institucionId: actor.institucionId },
        orderBy: [{ rol: 'asc' }, { fechaCreacion: 'asc' }],
        select: {
          id: true,
          rol: true,
          fechaCreacion: true,
          usuario: { select: { id: true, nombre: true, correo: true } },
        },
      }),
      this.prisma.solicitudIngresoInstitucion.findMany({
        where: {
          institucionId: actor.institucionId,
          estado: 'PENDIENTE',
        },
        orderBy: { fechaCreacion: 'asc' },
        select: {
          id: true,
          mensaje: true,
          fechaCreacion: true,
          solicitante: { select: { id: true, nombre: true, correo: true } },
        },
      }),
      this.prisma.invitacionInstitucion.findMany({
        where: {
          institucionId: actor.institucionId,
          estado: 'PENDIENTE',
        },
        orderBy: { fechaCreacion: 'desc' },
        select: {
          id: true,
          correo: true,
          rol: true,
          fechaExpiracion: true,
          fechaCreacion: true,
          creadoPor: { select: { nombre: true } },
        },
      }),
      this.prisma.auditoriaInstitucion.findMany({
        where: { institucionId: actor.institucionId },
        orderBy: { fechaCreacion: 'desc' },
        take: 30,
        select: {
          id: true,
          accion: true,
          detalle: true,
          fechaCreacion: true,
          actor: { select: { nombre: true } },
          afectado: { select: { nombre: true, correo: true } },
        },
      }),
    ]);

    return {
      institucion: {
        id: actor.institucion.id,
        nombre: actor.institucion.nombre,
        codigoUnico: actor.institucion.codigoUnico,
      },
      miRol: actor.rol,
      permisos: this.permisos(actor.rol),
      miembros,
      solicitudes,
      invitaciones,
      auditoria,
    };
  }

  async revisarSolicitud(
    usuarioId: string,
    solicitudId: string,
    decision: DecisionSolicitud,
  ) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    const solicitud = await this.prisma.solicitudIngresoInstitucion.findFirst({
      where: {
        id: solicitudId,
        institucionId: actor.institucionId,
        estado: 'PENDIENTE',
      },
      select: {
        id: true,
        solicitanteId: true,
        solicitante: { select: { rol: true, institucionId: true } },
      },
    });
    if (!solicitud) {
      throw new NotFoundException('La solicitud ya no está pendiente.');
    }

    if (decision === 'RECHAZAR') {
      await this.prisma.$transaction(async (tx) => {
        const actualizada = await tx.solicitudIngresoInstitucion.updateMany({
          where: { id: solicitud.id, estado: 'PENDIENTE' },
          data: {
            estado: 'RECHAZADA',
            revisadoPorId: usuarioId,
          },
        });
        if (actualizada.count !== 1) {
          throw new ConflictException('La solicitud ya fue revisada.');
        }
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId: actor.institucionId,
            actorId: usuarioId,
            afectadoId: solicitud.solicitanteId,
            accion: 'SOLICITUD_RECHAZADA',
          },
        });
      });
      return { estado: 'RECHAZADA' };
    }

    if (solicitud.solicitante.rol !== 'PROFESOR') {
      throw new BadRequestException(
        'La solicitud no pertenece a una cuenta de profesor.',
      );
    }
    if (solicitud.solicitante.institucionId) {
      throw new ConflictException(
        'El profesor ya pertenece a otra institución.',
      );
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const revisada = await tx.solicitudIngresoInstitucion.updateMany({
          where: { id: solicitud.id, estado: 'PENDIENTE' },
          data: { estado: 'APROBADA', revisadoPorId: usuarioId },
        });
        if (revisada.count !== 1) {
          throw new ConflictException('La solicitud ya fue revisada.');
        }
        const vinculada = await tx.usuario.updateMany({
          where: {
            id: solicitud.solicitanteId,
            rol: 'PROFESOR',
            institucionId: null,
          },
          data: { institucionId: actor.institucionId },
        });
        if (vinculada.count !== 1) {
          throw new ConflictException(
            'El profesor ya pertenece a una institución.',
          );
        }
        await tx.miembroInstitucion.create({
          data: {
            institucionId: actor.institucionId,
            usuarioId: solicitud.solicitanteId,
            rol: 'PROFESOR',
          },
        });
        await tx.solicitudIngresoInstitucion.updateMany({
          where: {
            solicitanteId: solicitud.solicitanteId,
            estado: 'PENDIENTE',
            id: { not: solicitud.id },
          },
          data: { estado: 'CANCELADA' },
        });
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId: actor.institucionId,
            actorId: usuarioId,
            afectadoId: solicitud.solicitanteId,
            accion: 'SOLICITUD_APROBADA',
            detalle: { rol: 'PROFESOR' },
          },
        });
      });
    } catch (error) {
      this.lanzarConflictoDeMembresia(error);
    }
    return { estado: 'APROBADA', rol: 'PROFESOR' };
  }

  async crearInvitacion(
    usuarioId: string,
    correoRecibido: string,
    rolRecibido: RolGestionable,
  ) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    const correo = correoRecibido.trim().toLowerCase();
    const rol = rolRecibido as RolMembresiaInstitucion;
    if (!correo) throw new BadRequestException('El correo es obligatorio.');
    if (rol === 'ADMINISTRADOR' && actor.rol !== 'PROPIETARIO') {
      throw new ForbiddenException(
        'Solo el propietario puede invitar administradores.',
      );
    }

    await this.expirarInvitaciones();
    const cuenta = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { id: true, rol: true, institucionId: true },
    });
    if (cuenta && cuenta.rol !== 'PROFESOR') {
      throw new BadRequestException(
        'Ese correo no pertenece a una cuenta de profesor.',
      );
    }
    if (cuenta?.institucionId) {
      throw new ConflictException(
        'Ese profesor ya pertenece a una institución.',
      );
    }

    const existente = await this.prisma.invitacionInstitucion.findFirst({
      where: {
        institucionId: actor.institucionId,
        correo,
        estado: 'PENDIENTE',
      },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Ya existe una invitación pendiente.');
    }

    const fechaExpiracion = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    try {
      const invitacion = await this.prisma.$transaction(async (tx) => {
        const creada = await tx.invitacionInstitucion.create({
          data: {
            institucionId: actor.institucionId,
            correo,
            rol,
            creadoPorId: usuarioId,
            fechaExpiracion,
          },
          select: {
            id: true,
            correo: true,
            rol: true,
            estado: true,
            fechaExpiracion: true,
          },
        });
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId: actor.institucionId,
            actorId: usuarioId,
            afectadoId: cuenta?.id,
            accion: 'INVITACION_CREADA',
            detalle: { correo, rol },
          },
        });
        return creada;
      });
      return invitacion;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una invitación pendiente.');
      }
      throw error;
    }
  }

  async cancelarInvitacion(usuarioId: string, invitacionId: string) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    const invitacion = await this.prisma.invitacionInstitucion.findFirst({
      where: {
        id: invitacionId,
        institucionId: actor.institucionId,
        estado: 'PENDIENTE',
      },
      select: { id: true, correo: true },
    });
    if (!invitacion) {
      throw new NotFoundException('La invitación ya no está pendiente.');
    }
    await this.prisma.$transaction([
      this.prisma.invitacionInstitucion.update({
        where: { id: invitacion.id },
        data: { estado: 'CANCELADA' },
      }),
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: actor.institucionId,
          actorId: usuarioId,
          accion: 'INVITACION_CANCELADA',
          detalle: { correo: invitacion.correo },
        },
      }),
    ]);
    return { cancelada: true };
  }

  async obtenerMisInvitaciones(usuarioId: string) {
    const usuario = await this.obtenerProfesor(usuarioId);
    await this.expirarInvitaciones();
    if (usuario.institucionId) return [];
    return this.prisma.invitacionInstitucion.findMany({
      where: { correo: usuario.correo, estado: 'PENDIENTE' },
      orderBy: { fechaCreacion: 'desc' },
      select: {
        id: true,
        rol: true,
        fechaExpiracion: true,
        fechaCreacion: true,
        institucion: { select: { id: true, nombre: true, codigoUnico: true } },
        creadoPor: { select: { nombre: true } },
      },
    });
  }

  async responderInvitacion(
    usuarioId: string,
    invitacionId: string,
    aceptar: boolean,
  ) {
    const usuario = await this.obtenerProfesor(usuarioId);
    const invitacion = await this.prisma.invitacionInstitucion.findFirst({
      where: {
        id: invitacionId,
        correo: usuario.correo,
        estado: 'PENDIENTE',
      },
      select: {
        id: true,
        institucionId: true,
        rol: true,
        fechaExpiracion: true,
      },
    });
    if (!invitacion) {
      throw new NotFoundException('La invitación ya no está pendiente.');
    }
    if (invitacion.fechaExpiracion <= new Date()) {
      await this.prisma.invitacionInstitucion.update({
        where: { id: invitacion.id },
        data: { estado: 'EXPIRADA' },
      });
      throw new BadRequestException('La invitación ya expiró.');
    }

    if (!aceptar) {
      await this.prisma.$transaction([
        this.prisma.invitacionInstitucion.update({
          where: { id: invitacion.id },
          data: { estado: 'RECHAZADA' },
        }),
        this.prisma.auditoriaInstitucion.create({
          data: {
            institucionId: invitacion.institucionId,
            actorId: usuarioId,
            afectadoId: usuarioId,
            accion: 'INVITACION_RECHAZADA',
          },
        }),
      ]);
      return { estado: 'RECHAZADA' };
    }
    if (usuario.institucionId) {
      throw new ConflictException('Ya perteneces a una institución.');
    }

    try {
      await this.prisma.$transaction([
        this.prisma.usuario.update({
          where: { id: usuarioId },
          data: { institucionId: invitacion.institucionId },
        }),
        this.prisma.miembroInstitucion.create({
          data: {
            institucionId: invitacion.institucionId,
            usuarioId,
            rol: invitacion.rol,
          },
        }),
        this.prisma.invitacionInstitucion.update({
          where: { id: invitacion.id },
          data: { estado: 'ACEPTADA', aceptadoPorId: usuarioId },
        }),
        this.prisma.invitacionInstitucion.updateMany({
          where: {
            correo: usuario.correo,
            estado: 'PENDIENTE',
            id: { not: invitacion.id },
          },
          data: { estado: 'CANCELADA' },
        }),
        this.prisma.solicitudIngresoInstitucion.updateMany({
          where: { solicitanteId: usuarioId, estado: 'PENDIENTE' },
          data: { estado: 'CANCELADA' },
        }),
        this.prisma.auditoriaInstitucion.create({
          data: {
            institucionId: invitacion.institucionId,
            actorId: usuarioId,
            afectadoId: usuarioId,
            accion: 'INVITACION_ACEPTADA',
            detalle: { rol: invitacion.rol },
          },
        }),
      ]);
    } catch (error) {
      this.lanzarConflictoDeMembresia(error);
    }
    return { estado: 'ACEPTADA', rol: invitacion.rol };
  }

  async cambiarRol(
    usuarioId: string,
    miembroId: string,
    rolRecibido: RolGestionable,
  ) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    if (actor.rol !== 'PROPIETARIO') {
      throw new ForbiddenException(
        'Solo el propietario puede cambiar roles administrativos.',
      );
    }
    const miembro = await this.obtenerMiembroObjetivo(
      actor.institucionId,
      miembroId,
    );
    if (miembro.rol === 'PROPIETARIO' || miembro.usuarioId === usuarioId) {
      throw new BadRequestException(
        'El rol del propietario se cambia mediante una transferencia.',
      );
    }
    const rol = rolRecibido as RolMembresiaInstitucion;
    await this.prisma.$transaction([
      this.prisma.miembroInstitucion.update({
        where: { id: miembro.id },
        data: { rol },
      }),
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: actor.institucionId,
          actorId: usuarioId,
          afectadoId: miembro.usuarioId,
          accion: 'ROL_ACTUALIZADO',
          detalle: { rolAnterior: miembro.rol, rolNuevo: rol },
        },
      }),
    ]);
    return { actualizado: true, rol };
  }

  async retirarMiembro(usuarioId: string, miembroId: string) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    const miembro = await this.obtenerMiembroObjetivo(
      actor.institucionId,
      miembroId,
    );
    if (miembro.usuarioId === usuarioId || miembro.rol === 'PROPIETARIO') {
      throw new BadRequestException('No puedes retirar al propietario.');
    }
    if (actor.rol === 'ADMINISTRADOR' && miembro.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Un administrador solo puede retirar profesores.',
      );
    }
    await this.prisma.$transaction([
      this.prisma.usuario.update({
        where: { id: miembro.usuarioId },
        data: { institucionId: null },
      }),
      this.prisma.miembroInstitucion.delete({ where: { id: miembro.id } }),
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: actor.institucionId,
          actorId: usuarioId,
          afectadoId: miembro.usuarioId,
          accion: 'MIEMBRO_RETIRADO',
          detalle: { rolAnterior: miembro.rol },
        },
      }),
    ]);
    return { retirado: true };
  }

  async transferirPropiedad(
    usuarioId: string,
    miembroId: string,
    codigoConfirmacion: string,
  ) {
    const actor = await this.obtenerActorAdministrador(usuarioId);
    if (actor.rol !== 'PROPIETARIO') {
      throw new ForbiddenException(
        'Solo el propietario puede transferir la propiedad.',
      );
    }
    if (
      actor.institucion.codigoUnico !== codigoConfirmacion.trim().toUpperCase()
    ) {
      throw new BadRequestException(
        'El código de confirmación de la institución no coincide.',
      );
    }
    const miembro = await this.obtenerMiembroObjetivo(
      actor.institucionId,
      miembroId,
    );
    if (miembro.usuarioId === usuarioId || miembro.rol === 'PROPIETARIO') {
      throw new BadRequestException('Selecciona otro miembro del equipo.');
    }

    await this.prisma.$transaction([
      this.prisma.miembroInstitucion.update({
        where: { id: actor.id },
        data: { rol: 'ADMINISTRADOR' },
      }),
      this.prisma.miembroInstitucion.update({
        where: { id: miembro.id },
        data: { rol: 'PROPIETARIO' },
      }),
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: actor.institucionId,
          actorId: usuarioId,
          afectadoId: miembro.usuarioId,
          accion: 'PROPIEDAD_TRANSFERIDA',
          detalle: { propietarioAnteriorId: usuarioId },
        },
      }),
    ]);
    return { transferida: true, nuevoPropietarioId: miembro.usuarioId };
  }

  private async obtenerActorAdministrador(usuarioId: string) {
    const membresia = await this.prisma.miembroInstitucion.findUnique({
      where: { usuarioId },
      select: {
        id: true,
        institucionId: true,
        rol: true,
        institucion: { select: { id: true, nombre: true, codigoUnico: true } },
      },
    });
    if (!membresia) {
      throw new UnauthorizedException('No tienes una membresía institucional.');
    }
    if (membresia.rol !== 'PROPIETARIO' && membresia.rol !== 'ADMINISTRADOR') {
      throw new ForbiddenException(
        'No tienes permisos para administrar el equipo.',
      );
    }
    return membresia;
  }

  private async obtenerProfesor(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, correo: true, rol: true, institucionId: true },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado.');
    if (usuario.rol !== 'PROFESOR') {
      throw new ForbiddenException(
        'Solo una cuenta de profesor puede usar invitaciones.',
      );
    }
    return { ...usuario, correo: usuario.correo.trim().toLowerCase() };
  }

  private async obtenerMiembroObjetivo(
    institucionId: string,
    miembroId: string,
  ) {
    const miembro = await this.prisma.miembroInstitucion.findFirst({
      where: { id: miembroId, institucionId },
      select: { id: true, usuarioId: true, rol: true },
    });
    if (!miembro) {
      throw new NotFoundException('El miembro no pertenece a tu institución.');
    }
    return miembro;
  }

  private async expirarInvitaciones() {
    await this.prisma.invitacionInstitucion.updateMany({
      where: { estado: 'PENDIENTE', fechaExpiracion: { lte: new Date() } },
      data: { estado: 'EXPIRADA' },
    });
  }

  private permisos(rol: RolMembresiaInstitucion) {
    const propietario = rol === 'PROPIETARIO';
    return {
      revisarSolicitudes: true,
      invitarProfesores: true,
      gestionarAdministradores: propietario,
      retirarProfesores: true,
      transferirPropiedad: propietario,
      verAuditoria: true,
    };
  }

  private lanzarConflictoDeMembresia(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'El profesor ya pertenece a una institución.',
      );
    }
    throw error;
  }
}
