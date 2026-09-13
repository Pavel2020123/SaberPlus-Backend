import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { capacidadesPlanInstitucional } from './institucion-plan.util';

type ClienteLimites = Pick<
  Prisma.TransactionClient,
  'institucion' | 'clase' | 'usuario'
>;

// Servicio compartido pequeño: agrupa la lógica que necesitan casi todos
// los demás services de este módulo (InstitucionService, GrupoService,
// EstudianteService, EstudianteImportService) para no duplicarla ni forzar
// que se inyecten entre sí.
@Injectable()
export class InstitucionAccesoService {
  constructor(private prisma: PrismaService) {}

  async obtenerInstitucionIdDelUsuario(usuarioId: string) {
    const usuario = await this.obtenerContextoUsuario(usuarioId);
    return usuario.institucionId;
  }

  async obtenerContextoUsuario(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true, rol: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    return usuario;
  }

  async obtenerInstitucionIdGestionable(usuarioId: string) {
    return (await this.obtenerMembresiaGestionable(usuarioId)).institucionId;
  }

  async obtenerMembresiaGestionable(
    usuarioId: string,
    cliente: Prisma.TransactionClient = this.prisma,
  ) {
    const membresia = await cliente.miembroInstitucion.findUnique({
      where: { usuarioId },
      select: { id: true, institucionId: true, rol: true },
    });
    if (!membresia) {
      throw new ForbiddenException(
        'No tienes una membresía docente en una institución.',
      );
    }
    return membresia;
  }

  async obtenerGrupoGestionable(
    usuarioId: string,
    claseId: string,
    cliente: Prisma.TransactionClient = this.prisma,
  ) {
    const membresia = await this.obtenerMembresiaGestionable(
      usuarioId,
      cliente,
    );
    const grupo = await cliente.clase.findFirst({
      where: { id: claseId, institucionId: membresia.institucionId },
      select: { id: true, institucionId: true, nombre: true, grado: true },
    });
    if (!grupo) throw new NotFoundException('Grupo no encontrado.');

    if (membresia.rol === 'PROFESOR') {
      const asignacion = await cliente.claseProfesor.findUnique({
        where: {
          claseId_miembroId: { claseId: grupo.id, miembroId: membresia.id },
        },
        select: { claseId: true },
      });
      if (!asignacion) {
        throw new ForbiddenException('No estás asignado a este grupo.');
      }
    }
    return { membresia, grupo };
  }

  async verificarCupoDisponible(
    institucionId: string,
    grado: 'DECIMO' | 'ONCE',
    estudianteId?: string,
    cantidadNueva: number = 1,
    cliente: ClienteLimites = this.prisma,
  ) {
    void grado;
    const capacidades = await this.obtenerCapacidadesInstitucion(
      institucionId,
      cliente,
    );
    const limite = capacidades.limiteEstudiantes;
    if (limite === null) return;

    const [totalEstudiantes, estudianteYaVinculado] = await Promise.all([
      cliente.usuario.count({
        where: { institucionId, rol: 'ESTUDIANTE' },
      }),
      estudianteId
        ? cliente.usuario.findFirst({
            where: { id: estudianteId, institucionId, rol: 'ESTUDIANTE' },
            select: { id: true },
          })
        : null,
    ]);

    // Una segunda inscripción del mismo estudiante no consume otro cupo.
    const yaContabilizado = estudianteYaVinculado !== null;

    // cantidadNueva permite validar un lote completo de una sola vez (por
    // ejemplo, una importación por CSV) en lugar de un estudiante a la vez.
    if (!yaContabilizado && totalEstudiantes + cantidadNueva > limite) {
      if (cantidadNueva > 1) {
        const disponibles = Math.max(limite - totalEstudiantes, 0);
        throw new BadRequestException(
          `Solo hay ${disponibles} cupo(s) disponible(s) y el archivo trae ${cantidadNueva} estudiantes nuevos.`,
        );
      }
      throw new BadRequestException(
        `Se alcanzó el cupo total de ${limite} estudiantes para tu institución.`,
      );
    }
  }

  async verificarCupoGrupos(
    institucionId: string,
    cliente: ClienteLimites = this.prisma,
  ) {
    const capacidades = await this.obtenerCapacidadesInstitucion(
      institucionId,
      cliente,
    );
    const limite = capacidades.limiteGrupos;
    if (limite === null) return;
    const totalGrupos = await cliente.clase.count({ where: { institucionId } });
    if (totalGrupos >= limite) {
      throw new BadRequestException(
        `El plan ${capacidades.plan.toLowerCase()} permite hasta ${limite} grupo(s).`,
      );
    }
  }

  async obtenerCapacidadesInstitucion(
    institucionId: string,
    cliente: ClienteLimites = this.prisma,
  ) {
    const institucion = await cliente.institucion.findUnique({
      where: { id: institucionId },
      select: {
        planActual: true,
        limiteGrupos: true,
        limiteEstudiantes: true,
        fechaVencimientoPlan: true,
      },
    });
    if (!institucion) throw new NotFoundException('Institución no encontrada.');
    return capacidadesPlanInstitucional(institucion);
  }
}
