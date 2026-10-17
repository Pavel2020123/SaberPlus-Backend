import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import {
  CreateStudentInstitutionRequestDto,
  OwnerStudentInstitutionRequestsQuery,
  ReviewStudentInstitutionRequestDto,
  StudentInstitutionRequestsQuery,
} from './student-institution-request.dto';

const selection = {
  id: true,
  institucionId: true,
  estudianteId: true,
  estado: true,
  mensaje: true,
  revision: true,
  fechaCreacion: true,
  fechaActualizacion: true,
  institucion: { select: { id: true, nombre: true } },
} as const;
type SelectedRequest = Prisma.SolicitudIngresoEstudianteGetPayload<{
  select: typeof selection;
}>;
const pageSize = 20;

@Injectable()
export class StudentInstitutionRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InstitucionAccesoService,
  ) {}

  private async student(tx: Prisma.TransactionClient, id: string) {
    const user = await tx.usuario.findUnique({
      where: { id },
      select: { rol: true, institucionId: true },
    });
    if (!user) throw new UnauthorizedException('La cuenta no está disponible.');
    if (user.rol !== 'ESTUDIANTE')
      throw new ForbiddenException('Esta solicitud es para estudiantes.');
    return user;
  }

  private async owner(tx: Prisma.TransactionClient, id: string) {
    const member = await tx.miembroInstitucion.findUnique({
      where: { usuarioId: id },
      select: {
        institucionId: true,
        rol: true,
        usuario: { select: { rol: true, institucionId: true } },
        institucion: { select: { estadoVerificacion: true } },
      },
    });
    if (
      !member ||
      member.rol !== 'PROPIETARIO' ||
      member.usuario.rol !== 'PROFESOR' ||
      member.usuario.institucionId !== member.institucionId ||
      member.institucion.estadoVerificacion !== 'APROBADA'
    ) {
      throw new ForbiddenException(
        'Solo el propietario de una institución aprobada puede revisar solicitudes estudiantiles.',
      );
    }
    return member.institucionId;
  }

  private view(row: SelectedRequest) {
    // Ni correo, IDs de alumno/revisor, código privado ni evidencias académicas.
    return {
      id: row.id,
      institucion: row.institucion,
      estado: row.estado,
      mensaje: row.mensaje,
      revision: row.revision,
      fechaCreacion: row.fechaCreacion.toISOString(),
      fechaActualizacion: row.fechaActualizacion.toISOString(),
    };
  }

  private async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          !['P2034', 'P2002'].includes(error.code)
        )
          throw error;
        if (attempt === 2)
          throw new ConflictException(
            'La solicitud cambió. Consulta su estado antes de reenviarla.',
          );
      }
    }
    throw new ConflictException('Consulta el estado de la solicitud.');
  }

  private async audit(
    tx: Prisma.TransactionClient,
    row: SelectedRequest,
    actorId: string,
    accion: string,
  ) {
    await tx.auditoriaInstitucion.create({
      data: {
        institucionId: row.institucionId,
        actorId,
        afectadoId: row.estudianteId,
        accion,
        detalle: { solicitudId: row.id, revision: row.revision },
      },
    });
  }

  async create(actorId: string, dto: CreateStudentInstitutionRequestDto) {
    return this.transaction(async (tx) => {
      const student = await this.student(tx, actorId);
      const previous = await tx.solicitudIngresoEstudiante.findUnique({
        where: { id: dto.id },
        select: selection,
      });
      if (previous) {
        if (
          previous.estudianteId !== actorId ||
          previous.institucionId !== dto.institucionId
        ) {
          throw new ConflictException(
            'No se pudo confirmar esta operación. Consulta tus solicitudes.',
          );
        }
        return this.view(previous);
      }
      if (student.institucionId)
        throw new ConflictException('Ya perteneces a una institución.');
      const institution = await tx.institucion.findFirst({
        where: { id: dto.institucionId, estadoVerificacion: 'APROBADA' },
        select: { id: true },
      });
      if (!institution)
        throw new NotFoundException(
          'Institución no disponible para nuevos ingresos.',
        );
      const pending = await tx.solicitudIngresoEstudiante.findFirst({
        where: { estudianteId: actorId, estado: 'PENDIENTE' },
        select: { id: true },
      });
      if (pending)
        throw new ConflictException(
          'Ya tienes una solicitud pendiente. Consulta su estado.',
        );
      const row = await tx.solicitudIngresoEstudiante.create({
        data: {
          id: dto.id,
          institucionId: institution.id,
          estudianteId: actorId,
          mensaje: dto.mensaje?.trim() || null,
        },
        select: selection,
      });
      await this.audit(tx, row, actorId, 'SOLICITUD_ESTUDIANTE_CREADA');
      return this.view(row);
    });
  }

  async own(actorId: string, query: StudentInstitutionRequestsQuery) {
    await this.student(this.prisma, actorId);
    const rows = await this.prisma.solicitudIngresoEstudiante.findMany({
      where: { estudianteId: actorId },
      select: selection,
      orderBy: [{ fechaCreacion: 'desc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * pageSize,
      take: pageSize + 1,
    });
    return {
      solicitudes: rows.slice(0, pageSize).map((row) => this.view(row)),
      pagina: query.pagina,
      hayMas: rows.length > pageSize,
    };
  }

  async cancel(actorId: string, id: string, revision: number) {
    return this.transaction(async (tx) => {
      await this.student(tx, actorId);
      const row = await tx.solicitudIngresoEstudiante.findFirst({
        where: { id, estudianteId: actorId },
        select: selection,
      });
      if (!row) throw new NotFoundException('Solicitud no disponible.');
      if (row.estado === 'CANCELADA') return this.view(row);
      if (row.estado !== 'PENDIENTE' || row.revision !== revision)
        throw new ConflictException('La solicitud cambió. Consulta su estado.');
      const result = await tx.solicitudIngresoEstudiante.updateMany({
        where: { id, estudianteId: actorId, estado: 'PENDIENTE', revision },
        data: { estado: 'CANCELADA', revision: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException('La solicitud cambió. Consulta su estado.');
      const updated = await tx.solicitudIngresoEstudiante.findUniqueOrThrow({
        where: { id },
        select: selection,
      });
      await this.audit(tx, updated, actorId, 'SOLICITUD_ESTUDIANTE_CANCELADA');
      return this.view(updated);
    });
  }

  async inbox(actorId: string, query: OwnerStudentInstitutionRequestsQuery) {
    const institutionId = await this.owner(this.prisma, actorId);
    const rows = await this.prisma.solicitudIngresoEstudiante.findMany({
      where: { institucionId: institutionId, estado: query.estado },
      select: { ...selection, estudiante: { select: { nombre: true } } },
      orderBy: [{ fechaCreacion: 'asc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * pageSize,
      take: pageSize + 1,
    });
    return {
      solicitudes: rows
        .slice(0, pageSize)
        .map((row) => ({
          ...this.view(row),
          estudianteNombre: row.estudiante.nombre,
        })),
      pagina: query.pagina,
      hayMas: rows.length > pageSize,
    };
  }

  async review(
    actorId: string,
    id: string,
    dto: ReviewStudentInstitutionRequestDto,
  ) {
    return this.transaction(async (tx) => {
      const institutionId = await this.owner(tx, actorId);
      const row = await tx.solicitudIngresoEstudiante.findFirst({
        where: { id, institucionId: institutionId },
        select: selection,
      });
      if (!row) throw new NotFoundException('Solicitud no disponible.');
      const decision = dto.decision === 'APROBAR' ? 'APROBADA' : 'RECHAZADA';
      if (row.estado === decision) return this.view(row);
      if (row.estado !== 'PENDIENTE' || row.revision !== dto.revision)
        throw new ConflictException('La solicitud cambió. Consulta su estado.');
      if (decision === 'APROBADA') {
        const student = await this.student(tx, row.estudianteId);
        if (student.institucionId)
          throw new ConflictException(
            'El estudiante ya pertenece a una institución.',
          );
        await this.access.verificarCupoDisponible(
          institutionId,
          'ONCE',
          row.estudianteId,
          1,
          tx,
        );
        const joined = await tx.usuario.updateMany({
          where: {
            id: row.estudianteId,
            rol: 'ESTUDIANTE',
            institucionId: null,
          },
          data: { institucionId: institutionId },
        });
        if (joined.count !== 1)
          throw new ConflictException(
            'La vinculación del estudiante cambió. Consulta la solicitud.',
          );
      }
      const changed = await tx.solicitudIngresoEstudiante.updateMany({
        where: {
          id,
          institucionId: institutionId,
          estado: 'PENDIENTE',
          revision: dto.revision,
        },
        data: {
          estado: decision,
          revisadoPorId: actorId,
          revision: { increment: 1 },
        },
      });
      if (changed.count !== 1)
        throw new ConflictException('La solicitud cambió. Consulta su estado.');
      const updated = await tx.solicitudIngresoEstudiante.findUniqueOrThrow({
        where: { id },
        select: selection,
      });
      await this.audit(
        tx,
        updated,
        actorId,
        decision === 'APROBADA'
          ? 'SOLICITUD_ESTUDIANTE_APROBADA'
          : 'SOLICITUD_ESTUDIANTE_RECHAZADA',
      );
      return this.view(updated);
    });
  }
}
