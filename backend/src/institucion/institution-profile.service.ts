import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInstitutionProfileDto } from './institution-profile.dto';
import { managedLogoUrl } from './institution-logo.dto';

const profileSelection = {
  id: true,
  nombre: true,
  descripcionPublica: true,
  revisionPerfil: true,
  logoUrl: true,
} as const;

@Injectable()
export class InstitutionProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private async membership(db: Prisma.TransactionClient, usuarioId: string) {
    const member = await db.miembroInstitucion.findUnique({
      where: { usuarioId },
      select: {
        rol: true,
        institucionId: true,
        usuario: { select: { rol: true } },
        institucion: { select: { estadoVerificacion: true } },
      },
    });
    if (
      !member ||
      member.usuario.rol !== 'PROFESOR' ||
      member.institucion.estadoVerificacion !== 'APROBADA'
    ) {
      throw new ForbiddenException(
        'El perfil requiere una institución aprobada y una membresía docente.',
      );
    }
    return member;
  }

  async own(usuarioId: string) {
    const member = await this.membership(this.prisma, usuarioId);
    const profile = await this.prisma.institucion.findFirst({
      where: { id: member.institucionId, estadoVerificacion: 'APROBADA' },
      select: profileSelection,
    });
    if (!profile) throw new ForbiddenException('Institución no disponible.');
    return {
      id: profile.id,
      nombre: profile.nombre,
      descripcion: profile.descripcionPublica,
      revision: profile.revisionPerfil,
      puedeEditar: member.rol === 'PROPIETARIO',
      logoUrl: managedLogoUrl(profile.logoUrl),
    };
  }

  async update(usuarioId: string, dto: UpdateInstitutionProfileDto) {
    return this.prisma.$transaction(async (tx) => {
      const member = await this.membership(tx, usuarioId);
      if (member.rol !== 'PROPIETARIO')
        throw new ForbiddenException(
          'Solo el propietario puede editar la presentación pública.',
        );
      const descripcion = dto.descripcion.trim() || null;
      const result = await tx.institucion.updateMany({
        where: {
          id: member.institucionId,
          estadoVerificacion: 'APROBADA',
          revisionPerfil: dto.revision,
          miembros: {
            some: {
              usuarioId,
              rol: 'PROPIETARIO',
              usuario: { rol: 'PROFESOR' },
            },
          },
        },
        data: {
          descripcionPublica: descripcion,
          revisionPerfil: { increment: 1 },
        },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'El perfil cambió. Conserva tu texto y recarga la versión actual.',
        );
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: member.institucionId,
          actorId: usuarioId,
          accion: 'PERFIL_PUBLICO_ACTUALIZADO',
          detalle: {
            revisionAnterior: dto.revision,
            revision: dto.revision + 1,
          },
        },
      });
      return { descripcion, revision: dto.revision + 1 };
    });
  }
}
