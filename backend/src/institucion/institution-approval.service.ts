import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EstadoAltaInstitucion,
  Prisma,
  SolicitudAltaInstitucion,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  ApprovalListDto,
  ReviewInstitutionDto,
  SubmitInstitutionDto,
} from './institution-approval.dto';

export const normalizeInstitution = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('es');
const publicRequest = (row: SolicitudAltaInstitucion) => ({
  id: row.id,
  nombre: row.nombre,
  ciudad: row.ciudad,
  correoInstitucional: row.correoInstitucional,
  contacto: row.contacto,
  referenciaUrl: row.referenciaUrl,
  evidencia: row.evidencia,
  estado: row.estado,
  revision: row.revision,
  institucionId: row.institucionId,
  mensaje: row.mensajeSolicitante,
  actualizadoEn: row.actualizadoEn,
});

@Injectable()
export class InstitutionApprovalService {
  constructor(private readonly prisma: PrismaService) {}

  private async teacher(
    id: string,
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const user = await tx.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        rol: true,
        correo: true,
        correoVerificado: true,
        institucionId: true,
      },
    });
    if (user?.rol !== 'PROFESOR' || !user.correoVerificado)
      throw new ForbiddenException(
        'Usa una cuenta personal de profesor con correo verificado.',
      );
    return user;
  }

  async own(userId: string) {
    const user = await this.teacher(userId);
    const row = await this.prisma.solicitudAltaInstitucion.findFirst({
      where: user.institucionId
        ? { institucionId: user.institucionId }
        : { solicitanteId: userId },
    });
    if (!row)
      return {
        solicitud: null,
        puedeEditar: !user.institucionId,
        transicionHasta: null,
      };
    const owner = user.institucionId
      ? await this.prisma.miembroInstitucion.findUnique({
          where: { usuarioId: userId },
        })
      : null;
    const canSeeEvidence = row.institucionId
      ? owner?.rol === 'PROPIETARIO' &&
        owner.institucionId === row.institucionId
      : row.solicitanteId === userId;
    const institution = row.institucionId
      ? await this.prisma.institucion.findUnique({
          where: { id: row.institucionId },
          select: { transicionHasta: true },
        })
      : null;
    return {
      solicitud: {
        ...publicRequest(row),
        correoInstitucional: canSeeEvidence ? row.correoInstitucional : '',
        contacto: canSeeEvidence ? row.contacto : '',
        referenciaUrl: canSeeEvidence ? row.referenciaUrl : null,
        evidencia: canSeeEvidence ? row.evidencia : '',
      },
      puedeEditar:
        canSeeEvidence &&
        ['REQUIERE_INFORMACION', 'RECHAZADA', 'LEGADO_EN_REVISION'].includes(
          row.estado,
        ),
      transicionHasta: institution?.transicionHasta ?? null,
    };
  }

  async matches(userId: string, name: string) {
    await this.teacher(userId);
    const rows = await this.prisma.solicitudAltaInstitucion.findMany({
      where: {
        estado: { in: ['APROBADA', 'LEGADO_EN_REVISION'] },
        nombreNormalizado: { contains: normalizeInstitution(name) },
      },
      take: 10,
      orderBy: { nombre: 'asc' },
      select: { nombre: true, ciudad: true },
    });
    // No se publican códigos, contactos, documentos ni solicitantes.
    return {
      coincidencias: rows,
      mensaje:
        'Si ya es tu institución, solicita una invitación a su responsable.',
    };
  }

  async submit(userId: string, dto: SubmitInstitutionDto) {
    if (dto.referenciaUrl) {
      const url = new URL(dto.referenciaUrl);
      if (url.username || url.password || url.protocol !== 'https:')
        throw new BadRequestException(
          'La referencia debe ser HTTPS y no contener credenciales.',
        );
    }
    return this.transaction(async (tx) => {
      const user = await this.teacher(userId, tx);
      const row = await tx.solicitudAltaInstitucion.findFirst({
        where: user.institucionId
          ? { institucionId: user.institucionId }
          : { solicitanteId: userId },
      });
      if (row) {
        const owner = row.institucionId
          ? await tx.miembroInstitucion.findUnique({
              where: { usuarioId: userId },
            })
          : null;
        const canEdit = row.institucionId
          ? owner?.rol === 'PROPIETARIO' &&
            owner.institucionId === row.institucionId
          : row.solicitanteId === userId;
        if (!canEdit)
          throw new ForbiddenException(
            'Solo el solicitante o propietario actual puede corregir la solicitud.',
          );
        if (
          row.revision !== dto.revision ||
          !['REQUIERE_INFORMACION', 'RECHAZADA', 'LEGADO_EN_REVISION'].includes(
            row.estado,
          )
        )
          throw new ConflictException(
            'Consulta el estado actual antes de enviar otra vez.',
          );
      } else if (dto.revision !== 0 || user.institucionId) {
        throw new ConflictException(
          'Consulta tu institución o solicitud actual.',
        );
      }
      const fields = {
        nombre: dto.nombre.trim(),
        nombreNormalizado: normalizeInstitution(dto.nombre),
        ciudad: dto.ciudad.trim(),
        ciudadNormalizada: normalizeInstitution(dto.ciudad),
        correoInstitucional: dto.correoInstitucional.trim().toLowerCase(),
        contacto: dto.contacto.trim(),
        referenciaUrl: dto.referenciaUrl || null,
        evidencia: dto.evidencia.trim(),
      };
      await this.ensureNoDuplicate(
        tx,
        fields.nombreNormalizado,
        fields.ciudadNormalizada,
        row?.id,
      );
      const history = this.history(row, {
        actorId: userId,
        accion: 'SOLICITUD_ENVIADA',
        fecha: new Date().toISOString(),
        datos: fields,
      });
      if (row) {
        const changed = await tx.solicitudAltaInstitucion.updateMany({
          where: { id: row.id, revision: dto.revision },
          data: {
            ...fields,
            estado: 'PENDIENTE',
            mensajeSolicitante:
              'Recibimos tu información. El equipo de SaberPlus revisará la solicitud.',
            revision: { increment: 1 },
            historial: history,
          },
        });
        if (changed.count !== 1)
          throw new ConflictException(
            'La solicitud cambió; vuelve a consultarla.',
          );
        return {
          solicitud: publicRequest(
            await tx.solicitudAltaInstitucion.findUniqueOrThrow({
              where: { id: row.id },
            }),
          ),
        };
      }
      const created = await tx.solicitudAltaInstitucion.create({
        data: {
          ...fields,
          solicitanteId: userId,
          historial: history,
          mensajeSolicitante: 'Tu solicitud está pendiente de revisión.',
        },
      });
      return { solicitud: publicRequest(created) };
    });
  }

  async list(query: ApprovalListDto) {
    const rows = await this.prisma.solicitudAltaInstitucion.findMany({
      where: query.estado ? { estado: query.estado } : {},
      orderBy: [{ actualizadoEn: 'desc' }, { id: 'asc' }],
      skip: (query.pagina - 1) * 20,
      take: 21,
      select: {
        id: true,
        nombre: true,
        ciudad: true,
        estado: true,
        revision: true,
        actualizadoEn: true,
      },
    });
    return {
      items: rows.slice(0, 20),
      pagina: query.pagina,
      hayMas: rows.length > 20,
    };
  }

  async detail(id: string) {
    const row = await this.prisma.solicitudAltaInstitucion.findUnique({
      where: { id },
      include: {
        solicitante: { select: { nombre: true, correo: true } },
        institucion: { select: { transicionHasta: true } },
      },
    });
    if (!row) throw new NotFoundException('Solicitud no encontrada.');
    return {
      ...publicRequest(row),
      solicitante: row.solicitante,
      historial: row.historial,
      transicionHasta: row.institucion?.transicionHasta ?? null,
    };
  }

  async review(actorId: string, id: string, dto: ReviewInstitutionDto) {
    return this.transaction(async (tx) => {
      const actor = await tx.usuario.findUnique({
        where: { id: actorId },
        select: { rol: true, institucionId: true },
      });
      if (actor?.rol !== 'ADMIN')
        throw new ForbiddenException(
          'Solo ADMIN de SaberPlus puede revisar solicitudes.',
        );
      const row = await tx.solicitudAltaInstitucion.findUnique({
        where: { id },
      });
      if (!row) throw new NotFoundException('Solicitud no encontrada.');
      if (
        row.solicitanteId === actorId ||
        (row.institucionId && row.institucionId === actor.institucionId)
      )
        throw new ForbiddenException('No puedes revisar tu propia solicitud.');
      const allowed: Record<EstadoAltaInstitucion, string[]> = {
        PENDIENTE: ['APROBADA', 'RECHAZADA', 'REQUIERE_INFORMACION'],
        REQUIERE_INFORMACION: ['APROBADA', 'RECHAZADA'],
        APROBADA: ['SUSPENDIDA'],
        RECHAZADA: [],
        SUSPENDIDA: ['APROBADA'],
        LEGADO_EN_REVISION: ['APROBADA', 'RECHAZADA', 'REQUIERE_INFORMACION'],
      };
      if (
        row.revision !== dto.revision ||
        !allowed[row.estado].includes(dto.estado)
      )
        throw new ConflictException(
          'El estado o la revisión cambiaron. Actualiza la solicitud.',
        );
      if (dto.estado === 'APROBADA')
        await this.ensureNoDuplicate(
          tx,
          row.nombreNormalizado,
          row.ciudadNormalizada,
          row.id,
        );
      const changed = await tx.solicitudAltaInstitucion.updateMany({
        where: { id, revision: dto.revision },
        data: {
          estado: dto.estado,
          revision: { increment: 1 },
          mensajeSolicitante: dto.mensaje,
          historial: this.history(row, {
            actorId,
            accion: dto.estado,
            fecha: new Date().toISOString(),
            mensaje: dto.mensaje,
            notaInterna: dto.notaInterna,
          }),
        },
      });
      if (changed.count !== 1)
        throw new ConflictException(
          'Otra revisión ya modificó esta solicitud.',
        );
      if (dto.estado === 'APROBADA' && !row.institucionId) {
        if (!row.solicitanteId)
          throw new ConflictException(
            'La cuenta solicitante ya no está disponible.',
          );
        const user = await this.teacher(row.solicitanteId, tx);
        if (user.institucionId)
          throw new ConflictException(
            'El solicitante ya pertenece a otra institución.',
          );
        const institution = await tx.institucion.create({
          data: {
            nombre: row.nombre,
            codigoUnico: `INST-${randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase()}`,
            estadoVerificacion: 'APROBADA',
            planActual: 'GRATIS',
            limiteGrupos: 1,
            limiteEstudiantes: 40,
          },
        });
        const linked = await tx.usuario.updateMany({
          where: { id: user.id, institucionId: null, rol: 'PROFESOR' },
          data: { institucionId: institution.id },
        });
        if (linked.count !== 1)
          throw new ConflictException('La vinculación del solicitante cambió.');
        await tx.miembroInstitucion.create({
          data: {
            usuarioId: user.id,
            institucionId: institution.id,
            rol: 'PROPIETARIO',
          },
        });
        await tx.solicitudAltaInstitucion.update({
          where: { id },
          data: { institucionId: institution.id },
        });
        await tx.solicitudIngresoInstitucion.updateMany({
          where: { solicitanteId: user.id, estado: 'PENDIENTE' },
          data: { estado: 'CANCELADA' },
        });
        await tx.invitacionInstitucion.updateMany({
          where: { correo: user.correo, estado: 'PENDIENTE' },
          data: { estado: 'CANCELADA' },
        });
      } else if (row.institucionId && dto.estado !== 'REQUIERE_INFORMACION') {
        await tx.institucion.update({
          where: { id: row.institucionId },
          data: {
            estadoVerificacion: dto.estado,
            transicionHasta: null,
            ...(dto.estado === 'APROBADA' ? { nombre: row.nombre } : {}),
          },
        });
      }
      return {
        solicitud: publicRequest(
          await tx.solicitudAltaInstitucion.findUniqueOrThrow({
            where: { id },
          }),
        ),
      };
    });
  }

  private async ensureNoDuplicate(
    tx: Prisma.TransactionClient,
    name: string,
    city: string,
    except?: string,
  ) {
    // La exclusión mutua evita dos aprobaciones simultáneas del mismo colegio.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${name}))`;
    const duplicate = await tx.solicitudAltaInstitucion.findFirst({
      where: {
        id: except ? { not: except } : undefined,
        nombreNormalizado: name,
        AND: [
          {
            OR: [
              {
                estado: {
                  in: ['APROBADA', 'LEGADO_EN_REVISION', 'SUSPENDIDA'],
                },
              },
              {
                institucion: {
                  estadoVerificacion: {
                    in: ['APROBADA', 'LEGADO_EN_REVISION', 'SUSPENDIDA'],
                  },
                },
              },
            ],
          },
          ...(city
            ? [{ OR: [{ ciudadNormalizada: city }, { ciudadNormalizada: '' }] }]
            : []),
        ],
      },
      select: { id: true },
    });
    if (duplicate)
      throw new ConflictException(
        'Ya existe una institución con esos datos. Solicita vinculación o contacta a soporte.',
      );
  }

  private history(
    row: SolicitudAltaInstitucion | null | undefined,
    event: Prisma.InputJsonObject,
  ): Prisma.InputJsonValue {
    const old = Array.isArray(row?.historial) ? row.historial : [];
    if (old.length >= 100)
      throw new BadRequestException(
        'Contacta a soporte para continuar esta solicitud.',
      );
    return [...old, event] as Prisma.InputJsonValue;
  }

  private async transaction<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ) {
    try {
      return await this.prisma.$transaction(action, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2002', 'P2034'].includes(error.code)
      )
        throw new ConflictException(
          'La solicitud cambió. Consulta su estado antes de reenviar.',
        );
      throw error;
    }
  }
}
