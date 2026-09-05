import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';

@Injectable()
export class VinculacionGrupoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly institucionAcceso: InstitucionAccesoService,
  ) {}

  async crearCodigo(
    usuarioId: string,
    claseId: string,
    duracionMinutos: number,
    usosMaximos: number,
  ) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    if (duracionMinutos < 15 || duracionMinutos > 10080) {
      throw new BadRequestException(
        'La duración debe estar entre 15 minutos y 7 días.',
      );
    }
    if (usosMaximos < 1 || usosMaximos > 200) {
      throw new BadRequestException(
        'El código debe permitir entre 1 y 200 ingresos.',
      );
    }

    const codigo = await this.generarCodigoTemporal();
    const fechaExpiracion = new Date(Date.now() + duracionMinutos * 60 * 1000);
    const creado = await this.prisma.$transaction(async (tx) => {
      const registro = await tx.codigoTemporalGrupo.create({
        data: {
          claseId,
          codigoHash: this.hash(codigo),
          sufijo: codigo.slice(-4),
          usosMaximos,
          fechaExpiracion,
          creadoPorId: acceso.membresia.id,
        },
        select: {
          id: true,
          sufijo: true,
          usos: true,
          usosMaximos: true,
          fechaExpiracion: true,
          fechaCreacion: true,
        },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: acceso.membresia.institucionId,
          actorId: usuarioId,
          accion: 'CODIGO_GRUPO_CREADO',
          detalle: {
            grupoId: claseId,
            codigoId: registro.id,
            duracionMinutos,
            usosMaximos,
          },
        },
      });
      return registro;
    });
    return { ...creado, codigo };
  }

  async revocarCodigo(usuarioId: string, claseId: string, codigoId: string) {
    const acceso = await this.institucionAcceso.obtenerGrupoGestionable(
      usuarioId,
      claseId,
    );
    const actualizado = await this.prisma.codigoTemporalGrupo.updateMany({
      where: { id: codigoId, claseId, activo: true },
      data: { activo: false },
    });
    if (actualizado.count === 0) {
      throw new NotFoundException('El código ya no está activo.');
    }
    await this.prisma.auditoriaInstitucion.create({
      data: {
        institucionId: acceso.membresia.institucionId,
        actorId: usuarioId,
        accion: 'CODIGO_GRUPO_REVOCADO',
        detalle: { grupoId: claseId, codigoId },
      },
    });
    return { revocado: true };
  }

  async vistaPrevia(usuarioId: string, codigoRecibido: string) {
    const [usuario, codigo] = await Promise.all([
      this.obtenerEstudiante(usuarioId),
      this.resolverCodigo(codigoRecibido),
    ]);
    const yaInscrito = await this.prisma.claseEstudiante.findUnique({
      where: {
        usuarioId_claseId: { usuarioId, claseId: codigo.clase.id },
      },
      select: { claseId: true },
    });
    const conflictoInstitucion =
      usuario.institucionId !== null &&
      usuario.institucionId !== codigo.clase.institucionId;
    return {
      estado: yaInscrito
        ? 'YA_VINCULADO'
        : conflictoInstitucion
          ? 'OTRA_INSTITUCION'
          : 'DISPONIBLE',
      requiereAceptacion: true,
      puedeUnirse: !yaInscrito && !conflictoInstitucion,
      grupo: {
        id: codigo.clase.id,
        nombre: codigo.clase.nombre,
        grado: codigo.clase.grado,
      },
      institucion: codigo.clase.Institucion,
      codigo: {
        sufijo: codigo.sufijo,
        fechaExpiracion: codigo.fechaExpiracion,
        usosDisponibles: codigo.usosMaximos - codigo.usos,
      },
    };
  }

  async aceptarIngreso(
    usuarioId: string,
    codigoRecibido: string,
    acepto: boolean,
  ) {
    if (!acepto) {
      throw new BadRequestException(
        'Debes aceptar explícitamente la institución y el grupo.',
      );
    }
    const [usuario, codigo] = await Promise.all([
      this.obtenerEstudiante(usuarioId),
      this.resolverCodigo(codigoRecibido),
    ]);
    if (
      usuario.institucionId &&
      usuario.institucionId !== codigo.clase.institucionId
    ) {
      throw new ConflictException(
        'Ya perteneces a otra institución. Un responsable debe gestionar el cambio.',
      );
    }
    const yaInscrito = await this.prisma.claseEstudiante.findUnique({
      where: {
        usuarioId_claseId: { usuarioId, claseId: codigo.clase.id },
      },
      select: { claseId: true },
    });
    if (yaInscrito) throw new ConflictException('Ya perteneces a ese grupo.');

    try {
      await this.prisma.$transaction(
        async (tx) => {
          await this.institucionAcceso.verificarCupoDisponible(
            codigo.clase.institucionId,
            codigo.clase.grado,
            usuarioId,
            1,
            tx,
          );
          const consumido = await tx.codigoTemporalGrupo.updateMany({
            where: {
              id: codigo.id,
              activo: true,
              fechaExpiracion: { gt: new Date() },
              usos: { lt: codigo.usosMaximos },
            },
            data: { usos: { increment: 1 } },
          });
          if (consumido.count !== 1) {
            throw new ConflictException(
              'El código expiró o alcanzó su límite de usos.',
            );
          }
          const vinculado = await tx.usuario.updateMany({
            where: {
              id: usuarioId,
              rol: 'ESTUDIANTE',
              OR: [
                { institucionId: null },
                { institucionId: codigo.clase.institucionId },
              ],
            },
            data: { institucionId: codigo.clase.institucionId },
          });
          if (vinculado.count !== 1) {
            throw new ConflictException(
              'Tu vínculo institucional cambió. Actualiza e inténtalo de nuevo.',
            );
          }
          await tx.claseEstudiante.create({
            data: {
              usuarioId,
              claseId: codigo.clase.id,
              codigoTemporalId: codigo.id,
              aceptacionExplicita: true,
            },
          });
          await tx.auditoriaInstitucion.create({
            data: {
              institucionId: codigo.clase.institucionId,
              actorId: usuarioId,
              afectadoId: usuarioId,
              accion: 'ESTUDIANTE_UNIDO_GRUPO',
              detalle: { grupoId: codigo.clase.id, codigoId: codigo.id },
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya perteneces a ese grupo.');
      }
      throw error;
    }
    return {
      mensaje: `Te uniste a "${codigo.clase.nombre}".`,
      grupo: {
        id: codigo.clase.id,
        nombre: codigo.clase.nombre,
        grado: codigo.clase.grado,
      },
      institucion: codigo.clase.Institucion,
    };
  }

  async obtenerMisGrupos(usuarioId: string) {
    const usuario = await this.obtenerEstudiante(usuarioId);
    const grupos = await this.prisma.claseEstudiante.findMany({
      where: { usuarioId },
      orderBy: { fechaIngreso: 'desc' },
      select: {
        fechaIngreso: true,
        aceptacionExplicita: true,
        Clase: {
          select: {
            id: true,
            nombre: true,
            grado: true,
            Institucion: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    return {
      institucionId: usuario.institucionId,
      grupos: grupos.map((item) => ({
        id: item.Clase.id,
        nombre: item.Clase.nombre,
        grado: item.Clase.grado,
        institucion: item.Clase.Institucion,
        fechaIngreso: item.fechaIngreso,
        aceptacionExplicita: item.aceptacionExplicita,
      })),
    };
  }

  private async obtenerEstudiante(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { id: true, rol: true, institucionId: true },
    });
    if (!usuario) throw new UnauthorizedException('Usuario no encontrado.');
    if (usuario.rol !== 'ESTUDIANTE') {
      throw new ForbiddenException('Solo los estudiantes pueden usar códigos.');
    }
    return usuario;
  }

  private async resolverCodigo(codigoRecibido: string) {
    const codigoNormalizado = codigoRecibido.trim().toUpperCase();
    if (!/^GRP-[A-Z2-9]{8}$/.test(codigoNormalizado)) {
      throw this.codigoInvalido();
    }
    const codigo = await this.prisma.codigoTemporalGrupo.findUnique({
      where: { codigoHash: this.hash(codigoNormalizado) },
      select: {
        id: true,
        sufijo: true,
        activo: true,
        usos: true,
        usosMaximos: true,
        fechaExpiracion: true,
        clase: {
          select: {
            id: true,
            nombre: true,
            grado: true,
            institucionId: true,
            Institucion: { select: { id: true, nombre: true } },
          },
        },
      },
    });
    if (
      !codigo ||
      !codigo.activo ||
      codigo.fechaExpiracion <= new Date() ||
      codigo.usos >= codigo.usosMaximos
    ) {
      throw this.codigoInvalido();
    }
    return codigo;
  }

  private async generarCodigoTemporal() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let intento = 0; intento < 10; intento += 1) {
      const bytes = randomBytes(8);
      const codigo = `GRP-${Array.from(bytes, (byte) => alfabeto[byte % alfabeto.length]).join('')}`;
      const existe = await this.prisma.codigoTemporalGrupo.findUnique({
        where: { codigoHash: this.hash(codigo) },
        select: { id: true },
      });
      if (!existe) return codigo;
    }
    throw new ConflictException('No fue posible generar un código único.');
  }

  private hash(codigo: string) {
    return createHash('sha256').update(codigo).digest('hex');
  }

  private codigoInvalido() {
    return new NotFoundException('El código no existe, expiró o ya fue usado.');
  }
}
