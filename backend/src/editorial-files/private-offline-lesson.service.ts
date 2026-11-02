import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileService } from './editorial-file.service';
import { managedEditorialImageId } from './editorial-image-reference';
import { sha256 } from './editorial-image';
import { privateOfflineGrantPolicy } from './private-offline-policy';

@Injectable()
export class PrivateOfflineLessonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: EditorialFileService,
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
      select: { id: true, correoVerificado: true, debeCambiarContrasena: true },
    });
    if (!user?.correoVerificado || user.debeCambiarContrasena)
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
      select: { id: true, correoVerificado: true, debeCambiarContrasena: true },
    });
    if (!account?.correoVerificado || account.debeCambiarContrasena)
      throw new UnauthorizedException('Revalida tu sesión.');
    const [clock] = await this.prisma.$queryRaw<
      { now: Date }[]
    >`SELECT clock_timestamp() AS now`;
    return {
      ...privateOfflineGrantPolicy({
        ownerId,
        contextId,
        requestNonce,
        validatedAt: clock.now,
      }),
      contextDigest: sha256(JSON.stringify(snapshot)),
      snapshot,
    };
  }
}
