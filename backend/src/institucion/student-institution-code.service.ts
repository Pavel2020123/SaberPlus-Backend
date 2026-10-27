import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InstitucionAccesoService } from './institucion-acceso.service';
import {
  JoinStudentInstitutionCodeDto,
  PreviewStudentInstitutionCodeDto,
  RotateStudentInstitutionCodeDto,
} from './student-institution-code.dto';

@Injectable()
export class StudentInstitutionCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InstitucionAccesoService,
  ) {}

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
            'El estado cambió. Consulta antes de reintentar.',
          );
      }
    }
    throw new ConflictException('Consulta el estado actual.');
  }

  private async owner(tx: Prisma.TransactionClient, actorId: string) {
    const member = await tx.miembroInstitucion.findUnique({
      where: { usuarioId: actorId },
      select: {
        rol: true,
        institucionId: true,
        usuario: { select: { rol: true, institucionId: true } },
        institucion: {
          select: { id: true, nombre: true, estadoVerificacion: true },
        },
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
        'Solo el propietario de una institución aprobada puede administrar este código.',
      );
    }
    return member.institucion;
  }

  private async student(tx: Prisma.TransactionClient, actorId: string) {
    const user = await tx.usuario.findUnique({
      where: { id: actorId },
      select: { rol: true, institucionId: true },
    });
    if (!user) throw new UnauthorizedException('La cuenta no está disponible.');
    if (user.rol !== 'ESTUDIANTE')
      throw new ForbiddenException('Este ingreso es para estudiantes.');
    return user;
  }

  async own(actorId: string) {
    return this.transaction(async (tx) => {
      const institution = await this.owner(tx, actorId);
      const code = await tx.codigoIngresoEstudiantil.findUnique({
        where: { institucionId: institution.id },
      });
      return {
        institucion: { id: institution.id, nombre: institution.nombre },
        codigo: code?.codigo ?? null,
        revision: code?.revision ?? 0,
        operacionId: code?.operacionId ?? null,
      };
    });
  }

  async rotate(actorId: string, dto: RotateStudentInstitutionCodeDto) {
    return this.transaction(async (tx) => {
      const institution = await this.owner(tx, actorId);
      const previous = await tx.codigoIngresoEstudiantil.findUnique({
        where: { institucionId: institution.id },
      });
      if (previous?.operacionId === dto.id) {
        if (previous.revision !== dto.revision + 1)
          throw new ConflictException('Consulta la versión actual del código.');
        return {
          codigo: previous.codigo,
          revision: previous.revision,
          operacionId: previous.operacionId,
        };
      }
      if ((previous?.revision ?? 0) !== dto.revision)
        throw new ConflictException(
          'El código cambió. Consulta la versión actual.',
        );
      // Un UUID antiguo no debe convertirse en otra renovación tras una operación posterior.
      if (
        await tx.auditoriaInstitucion.findFirst({
          where: {
            institucionId: institution.id,
            accion: 'CODIGO_ESTUDIANTIL_RENOVADO',
            detalle: { path: ['operacionId'], equals: dto.id },
          },
          select: { id: true },
        })
      )
        throw new ConflictException(
          'Esta renovación ya fue procesada. Consulta el código vigente.',
        );
      const codigo = `SPI-${randomBytes(16).toString('hex').toUpperCase()}`;
      const data = {
        codigo,
        revision: dto.revision + 1,
        operacionId: dto.id,
        fechaActualizacion: new Date(),
      };
      if (previous) {
        const changed = await tx.codigoIngresoEstudiantil.updateMany({
          where: {
            institucionId: institution.id,
            revision: dto.revision,
          },
          data,
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'El código cambió. Consulta antes de renovar.',
          );
      } else {
        await tx.codigoIngresoEstudiantil.create({
          data: { institucionId: institution.id, ...data },
        });
      }
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: institution.id,
          actorId,
          accion: 'CODIGO_ESTUDIANTIL_RENOVADO',
          detalle: { operacionId: dto.id, revision: data.revision },
        },
      });
      return { codigo, revision: data.revision, operacionId: dto.id };
    });
  }

  private async resolve(tx: Prisma.TransactionClient, codigo: string) {
    const code = await tx.codigoIngresoEstudiantil.findUnique({
      where: { codigo },
      select: {
        institucionId: true,
        revision: true,
        institucion: {
          select: { id: true, nombre: true, estadoVerificacion: true },
        },
      },
    });
    if (!code || code.institucion.estadoVerificacion !== 'APROBADA') {
      throw new NotFoundException(
        'Código no disponible. Consulta el código vigente con el propietario.',
      );
    }
    return code;
  }

  async preview(actorId: string, dto: PreviewStudentInstitutionCodeDto) {
    return this.transaction(async (tx) => {
      const user = await this.student(tx, actorId);
      const code = await this.resolve(tx, dto.codigo);
      if (user.institucionId && user.institucionId !== code.institucionId)
        throw new ConflictException('Ya perteneces a otra institución.');
      return {
        institucion: {
          id: code.institucion.id,
          nombre: code.institucion.nombre,
        },
        revision: code.revision,
        yaVinculado: user.institucionId === code.institucionId,
      };
    });
  }

  private joined(
    institution: { id: string; nombre: string },
    already: boolean,
  ) {
    return {
      institucion: { id: institution.id, nombre: institution.nombre },
      estado: 'VINCULADO' as const,
      yaVinculado: already,
    };
  }

  async join(actorId: string, dto: JoinStudentInstitutionCodeDto) {
    return this.transaction(async (tx) => {
      const user = await this.student(tx, actorId);
      const hash = createHash('sha256').update(dto.codigo).digest('hex');
      const receipt = await tx.ingresoInstitucionCodigo.findUnique({
        where: { id: dto.id },
        include: { institucion: { select: { id: true, nombre: true } } },
      });
      if (receipt) {
        if (
          receipt.estudianteId !== actorId ||
          receipt.institucionId !== dto.institucionId ||
          receipt.codigoHash !== hash ||
          receipt.revisionCodigo !== dto.revision ||
          user.institucionId !== receipt.institucionId
        ) {
          throw new ConflictException(
            'No se pudo reconciliar este ingreso. Consulta tu institución.',
          );
        }
        // Reconciliación de un ingreso anterior, incluso si después se renovó el código.
        return this.joined(receipt.institucion, true);
      }
      const code = await this.resolve(tx, dto.codigo);
      if (
        code.institucionId !== dto.institucionId ||
        code.revision !== dto.revision
      )
        throw new ConflictException('El código cambió. Vuelve a consultarlo.');
      if (user.institucionId) {
        if (user.institucionId !== code.institucionId)
          throw new ConflictException('Ya perteneces a otra institución.');
        return this.joined(code.institucion, true);
      }
      if (
        await tx.solicitudIngresoEstudiante.findFirst({
          where: { estudianteId: actorId, estado: 'PENDIENTE' },
          select: { id: true },
        })
      ) {
        throw new ConflictException(
          'Tienes una solicitud pendiente. Cancélala antes de ingresar por código.',
        );
      }
      await this.access.verificarCupoDisponible(
        code.institucionId,
        'ONCE',
        actorId,
        1,
        tx,
      );
      const changed = await tx.usuario.updateMany({
        where: { id: actorId, rol: 'ESTUDIANTE', institucionId: null },
        data: { institucionId: code.institucionId },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Tu vinculación cambió. Consulta tu institución.',
        );
      await tx.ingresoInstitucionCodigo.create({
        data: {
          id: dto.id,
          institucionId: code.institucionId,
          estudianteId: actorId,
          codigoHash: hash,
          revisionCodigo: code.revision,
        },
      });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: code.institucionId,
          actorId,
          afectadoId: actorId,
          accion: 'ESTUDIANTE_INGRESO_POR_CODIGO',
          detalle: { operacionId: dto.id, revisionCodigo: code.revision },
        },
      });
      return this.joined(code.institucion, false);
    });
  }
}
