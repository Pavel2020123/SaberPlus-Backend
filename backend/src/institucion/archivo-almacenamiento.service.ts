import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as sharpModule from 'sharp';
import { PrismaService } from '../prisma/prisma.service';

// El proyecto usa CommonJS; sharp publica sus tipos raíz como ESM.
const sharp = sharpModule as unknown as typeof import('sharp').default;

@Injectable()
export class ArchivoAlmacenamientoService {
  constructor(private readonly prisma: PrismaService) {}

  private async owner(db: Prisma.TransactionClient, usuarioId: string) {
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
      member.rol !== 'PROPIETARIO' ||
      member.usuario.rol !== 'PROFESOR' ||
      member.institucion.estadoVerificacion !== 'APROBADA'
    ) {
      throw new ForbiddenException(
        'Solo el propietario de una institución aprobada puede cambiar el logo.',
      );
    }
    return member.institucionId;
  }

  async subirLogoDeMiInstitucion(
    usuarioId: string,
    archivo: Express.Multer.File,
    revision: number,
  ) {
    await this.owner(this.prisma, usuarioId);
    const content = await this.normalize(archivo?.buffer);
    return this.persist(usuarioId, revision, content);
  }

  async eliminarLogoDeMiInstitucion(usuarioId: string, revision: number) {
    return this.persist(usuarioId, revision, null);
  }

  private async normalize(input?: Buffer): Promise<Buffer> {
    if (!input?.length || input.length > 3 * 1024 * 1024)
      throw new BadRequestException(
        'Selecciona una imagen PNG, JPG o WEBP de hasta 3 MB.',
      );
    try {
      const png = input
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
      const webp =
        input.toString('ascii', 0, 4) === 'RIFF' &&
        input.toString('ascii', 8, 12) === 'WEBP';
      if (!png && !jpeg && !webp) throw new Error('Firma no admitida');
      const image = sharp(input, {
        limitInputPixels: 16000000,
        failOn: 'warning',
      });
      const meta = await image.metadata();
      if (
        !['png', 'jpeg', 'webp'].includes(meta.format ?? '') ||
        (meta.pages ?? 1) !== 1
      )
        throw new Error('Formato no admitido');
      const content = await image
        .rotate()
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .webp({ quality: 85 })
        .toBuffer();
      if (content.length > 204800)
        throw new Error('Resultado demasiado grande');
      return content;
    } catch {
      throw new BadRequestException(
        'La imagen no es válida. Usa PNG, JPG o WEBP estático de hasta 16 megapíxeles.',
      );
    }
  }

  private async persist(
    usuarioId: string,
    revision: number,
    content: Buffer | null,
  ) {
    if (!Number.isInteger(revision) || revision < 0 || revision > 2147483646)
      throw new BadRequestException(
        'Consulta la versión actual antes de cambiar el logo.',
      );
    return this.prisma.$transaction(async (tx) => {
      const id = await this.owner(tx, usuarioId);
      const logoUrl = content
        ? `/instituciones/directorio/${id}/logo/${revision + 1}`
        : null;
      const result = await tx.institucion.updateMany({
        where: {
          id,
          estadoVerificacion: 'APROBADA',
          revisionPerfil: revision,
          miembros: {
            some: {
              usuarioId,
              rol: 'PROPIETARIO',
              usuario: { rol: 'PROFESOR' },
            },
          },
        },
        data: { logoUrl, revisionPerfil: { increment: 1 } },
      });
      if (result.count !== 1)
        throw new ConflictException(
          'El perfil cambió. Consulta la versión actual antes de reenviar.',
        );
      if (content)
        await tx.institucionLogo.upsert({
          where: { institucionId: id },
          create: { institucionId: id, contenido: content },
          update: { contenido: content },
        });
      else
        await tx.institucionLogo.deleteMany({ where: { institucionId: id } });
      await tx.auditoriaInstitucion.create({
        data: {
          institucionId: id,
          actorId: usuarioId,
          accion: content ? 'LOGO_ACTUALIZADO' : 'LOGO_ELIMINADO',
          detalle: { revisionAnterior: revision, revision: revision + 1 },
        },
      });
      return { logoUrl, revision: revision + 1 };
    });
  }
}
