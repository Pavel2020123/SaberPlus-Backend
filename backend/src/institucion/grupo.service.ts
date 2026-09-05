import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import { generarCodigoConPrefijo } from './utils/generar-codigo.util';

@Injectable()
export class GrupoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institucionAcceso: InstitucionAccesoService,
  ) {}

  async obtenerGruposDeMiInstitucion(usuarioId: string) {
    const membresia =
      await this.institucionAcceso.obtenerMembresiaGestionable(usuarioId);
    return this.prisma.clase.findMany({
      where: {
        institucionId: membresia.institucionId,
        ...(membresia.rol === 'PROFESOR' && {
          profesores: { some: { miembroId: membresia.id } },
        }),
      },
      select: {
        id: true,
        nombre: true,
        grado: true,
        _count: { select: { ClaseEstudiante: true } },
        profesores: {
          orderBy: { fechaAsignacion: 'asc' },
          select: {
            miembro: {
              select: {
                id: true,
                rol: true,
                usuario: { select: { id: true, nombre: true, correo: true } },
              },
            },
          },
        },
        codigos: {
          where: { activo: true, fechaExpiracion: { gt: new Date() } },
          orderBy: { fechaCreacion: 'desc' },
          select: {
            id: true,
            sufijo: true,
            usos: true,
            usosMaximos: true,
            fechaExpiracion: true,
            fechaCreacion: true,
          },
        },
      },
      orderBy: { nombre: 'asc' },
    });
  }

  async crearGrupoEnMiInstitucion(
    usuarioId: string,
    nombre: string,
    grado: 'DECIMO' | 'ONCE',
  ) {
    const membresia =
      await this.institucionAcceso.obtenerMembresiaGestionable(usuarioId);
    this.exigirAdministrador(membresia.rol);
    if (grado !== 'DECIMO' && grado !== 'ONCE') {
      throw new BadRequestException('El grado debe ser DECIMO u ONCE.');
    }
    const nombreLimpio = nombre.trim();
    if (!nombreLimpio) {
      throw new BadRequestException('El nombre del grupo es obligatorio.');
    }
    const codigoIngreso = await this.generarCodigoIngreso();

    return this.prisma.$transaction(
      async (tx) => {
        await this.institucionAcceso.verificarCupoGrupos(
          membresia.institucionId,
          tx,
        );
        const grupo = await tx.clase.create({
          data: {
            nombre: nombreLimpio,
            codigoIngreso,
            grado,
            institucionId: membresia.institucionId,
          },
          select: { id: true, nombre: true, grado: true },
        });
        await tx.claseProfesor.create({
          data: { claseId: grupo.id, miembroId: membresia.id },
        });
        await tx.auditoriaInstitucion.create({
          data: {
            institucionId: membresia.institucionId,
            actorId: usuarioId,
            accion: 'GRUPO_CREADO',
            detalle: { grupoId: grupo.id, nombre: grupo.nombre, grado },
          },
        });
        return grupo;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async actualizarGrupo(usuarioId: string, claseId: string, nombre?: string) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    const nombreLimpio = nombre?.trim();
    if (nombre !== undefined && !nombreLimpio) {
      throw new BadRequestException('El nombre del grupo es obligatorio.');
    }
    const grupo = await this.prisma.clase.update({
      where: { id: claseId },
      data: { ...(nombreLimpio !== undefined && { nombre: nombreLimpio }) },
      select: { id: true, nombre: true, grado: true },
    });
    await this.prisma.auditoriaInstitucion.create({
      data: {
        institucionId: acceso.membresia.institucionId,
        actorId: usuarioId,
        accion: 'GRUPO_ACTUALIZADO',
        detalle: { grupoId: grupo.id, nombre: grupo.nombre },
      },
    });
    return grupo;
  }

  async eliminarGrupo(usuarioId: string, claseId: string) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    this.exigirAdministrador(acceso.membresia.rol);
    await this.prisma.$transaction([
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: acceso.membresia.institucionId,
          actorId: usuarioId,
          accion: 'GRUPO_ELIMINADO',
          detalle: { grupoId: acceso.grupo.id, nombre: acceso.grupo.nombre },
        },
      }),
      this.prisma.clase.delete({ where: { id: claseId } }),
    ]);
    return { eliminado: true };
  }

  async asignarProfesor(usuarioId: string, claseId: string, miembroId: string) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    this.exigirAdministrador(acceso.membresia.rol);
    const objetivo = await this.prisma.miembroInstitucion.findFirst({
      where: { id: miembroId, institucionId: acceso.membresia.institucionId },
      select: { id: true, usuarioId: true },
    });
    if (!objetivo) {
      throw new NotFoundException('El profesor no pertenece a la institución.');
    }
    await this.prisma.$transaction([
      this.prisma.claseProfesor.upsert({
        where: { claseId_miembroId: { claseId, miembroId } },
        create: { claseId, miembroId },
        update: {},
      }),
      this.prisma.auditoriaInstitucion.create({
        data: {
          institucionId: acceso.membresia.institucionId,
          actorId: usuarioId,
          afectadoId: objetivo.usuarioId,
          accion: 'PROFESOR_ASIGNADO_GRUPO',
          detalle: { grupoId: claseId },
        },
      }),
    ]);
    return { asignado: true };
  }

  async quitarProfesor(usuarioId: string, claseId: string, miembroId: string) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    this.exigirAdministrador(acceso.membresia.rol);
    const objetivo = await this.prisma.miembroInstitucion.findFirst({
      where: { id: miembroId, institucionId: acceso.membresia.institucionId },
      select: { usuarioId: true },
    });
    if (!objetivo) {
      throw new NotFoundException('El profesor no pertenece a la institución.');
    }
    const eliminada = await this.prisma.claseProfesor.deleteMany({
      where: { claseId, miembroId },
    });
    if (eliminada.count === 0) {
      throw new NotFoundException('El profesor no estaba asignado al grupo.');
    }
    await this.prisma.auditoriaInstitucion.create({
      data: {
        institucionId: acceso.membresia.institucionId,
        actorId: usuarioId,
        afectadoId: objetivo.usuarioId,
        accion: 'PROFESOR_RETIRADO_GRUPO',
        detalle: { grupoId: claseId },
      },
    });
    return { retirado: true };
  }

  async agregarEstudianteAGrupo(
    usuarioId: string,
    claseId: string,
    estudianteId: string,
  ) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    this.exigirAdministrador(acceso.membresia.rol);
    const estudiante = await this.prisma.usuario.findUnique({
      where: { id: estudianteId },
      select: { rol: true, institucionId: true },
    });
    if (
      !estudiante ||
      estudiante.rol !== 'ESTUDIANTE' ||
      estudiante.institucionId !== acceso.membresia.institucionId
    ) {
      throw new BadRequestException(
        'Ese estudiante no pertenece a tu institución.',
      );
    }
    await this.institucionAcceso.verificarCupoDisponible(
      acceso.membresia.institucionId,
      acceso.grupo.grado,
      estudianteId,
    );
    try {
      return await this.prisma.claseEstudiante.create({
        data: {
          usuarioId: estudianteId,
          claseId,
          aceptacionExplicita: false,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('El estudiante ya está en ese grupo.');
      }
      throw error;
    }
  }

  async quitarEstudianteDeGrupo(
    usuarioId: string,
    claseId: string,
    estudianteId: string,
  ) {
    await this.institucionAcceso.obtenerGrupoGestionable(usuarioId, claseId);
    const resultado = await this.prisma.claseEstudiante.deleteMany({
      where: { usuarioId: estudianteId, claseId },
    });
    if (resultado.count === 0) {
      throw new NotFoundException('El estudiante no pertenece al grupo.');
    }
    return { retirado: true };
  }

  unirseAClase(): never {
    throw new BadRequestException(
      'Este acceso permanente fue deshabilitado. Consulta el código temporal y confirma el grupo antes de unirte.',
    );
  }

  private exigirAdministrador(rol: string) {
    if (rol !== 'PROPIETARIO' && rol !== 'ADMINISTRADOR') {
      throw new ForbiddenException(
        'Necesitas permisos administrativos para realizar esta acción.',
      );
    }
  }

  private async generarCodigoIngreso() {
    return generarCodigoConPrefijo(
      'LEGACY',
      async (codigo) =>
        (await this.prisma.clase.findUnique({
          where: { codigoIngreso: codigo },
        })) !== null,
    );
  }
}
