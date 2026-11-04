import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileService } from './editorial-file.service';
import { managedEditorialImageId } from './editorial-image-reference';
import { sha256 } from './editorial-image';
import { privateOfflineGrantPolicy } from './private-offline-policy';
import { LicenciaAccesoService } from '../institucion/licencia-acceso.service';

@Injectable()
export class PrivateOfflineLessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: EditorialFileService,
    @Optional() private readonly licencia?: LicenciaAccesoService,
  ) {}

  assertEnabled() {
    if (
      process.env.EDITORIAL_PRIVATE_OFFLINE_LOCAL_ENABLED !== 'true' ||
      process.env.EDITORIAL_FILES_LOCAL_ENABLED !== 'true' ||
      !['development', 'test'].includes(process.env.NODE_ENV ?? '')
    )
      throw new ServiceUnavailableException(
        'La descarga privada no está habilitada.',
      );
  }

  private lesson(id: string) {
    return this.prisma.subtema.findFirst({
      where: {
        id,
        estadoContenido: 'PUBLICADO',
        tema: { estadoContenido: 'PUBLICADO' },
      },
      select: {
        id: true,
        nombre: true,
        contenido: true,
        imagenUrl: true,
        archivoImagenId: true,
      },
    });
  }

  async validate(ownerId: string, contextId: string, requestNonce: string) {
    this.assertEnabled();
    const user = await this.prisma.usuario.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
        institucionId: true,
      },
    });
    if (
      !user ||
      user.debeCambiarContrasena ||
      !(await this.identidadAutorizada(user))
    )
      throw new UnauthorizedException('Revalida tu sesión.');
    const lesson = await this.lesson(contextId);
    if (!lesson)
      throw new NotFoundException('El contenido privado no está disponible.');
    const id = managedEditorialImageId(lesson.imagenUrl ?? '');
    if ((lesson.imagenUrl && !id) || (id && lesson.archivoImagenId !== id))
      throw new ConflictException('Esta lección requiere consulta online.');
    const content = lesson.contenido ?? '';
    if (
      Buffer.byteLength(content, 'utf8') > 128 * 1024 ||
      Buffer.byteLength(lesson.nombre, 'utf8') > 2048
    )
      throw new ConflictException('Esta lección requiere consulta online.');
    const bytes = id ? await this.files.publishedContent(id) : null;
    if (bytes && bytes.length > 2 * 1024 * 1024)
      throw new ConflictException('Esta imagen requiere consulta online.');
    const image =
      bytes && id
        ? {
            id,
            sha256: sha256(bytes),
            mime: 'image/webp',
            byteSize: bytes.length,
            base64: bytes.toString('base64'),
          }
        : null;
    const snapshot = { title: lesson.nombre, content, image };
    const current = await this.lesson(contextId);
    if (!current || JSON.stringify(current) !== JSON.stringify(lesson))
      throw new ConflictException('La lección cambió. Revalida su contenido.');
    // Revocation confirmed while preparing the package prevents this response.
    if (id) await this.files.publishedContent(id);
    const account = await this.prisma.usuario.findUnique({
      where: { id: ownerId },
      select: {
        id: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
        institucionId: true,
      },
    });
    if (
      !account ||
      account.debeCambiarContrasena ||
      !(await this.identidadAutorizada(account))
    )
      throw new UnauthorizedException('Revalida tu sesión.');
    const [clock] = await this.prisma.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    const grant = privateOfflineGrantPolicy({
      ownerId,
      contextId,
      requestNonce,
      validatedAt: clock.now,
    });
    if (this.licencia)
      grant.expiresAt = (
        await this.licencia.limitarOffline(
          ownerId,
          clock.now,
          new Date(grant.expiresAt),
        )
      ).toISOString();
    return {
      ...grant,
      contextDigest: sha256(JSON.stringify(snapshot)),
      snapshot,
    };
  }

  private async identidadAutorizada(user: {
    id: string;
    correoVerificado: boolean;
    institucionId?: string;
  }): Promise<boolean> {
    if (user.correoVerificado) return true;
    // Explicit managed origin, never merely an institutional FK or a fake email.
    if (!this.licencia || !user.institucionId) return false;
    const origen = await this.prisma.origenGestionadoInstitucional.findUnique({
      where: { usuarioId: user.id },
    });
    if (origen?.institucionId !== user.institucionId) return false;
    await this.licencia.exigirPractica(user.id);
    return true;
  }
}
