import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolve, relative } from 'path';
import { unlink } from 'fs/promises';

@Injectable()
export class ArchivoAlmacenamientoService {
  constructor(private prisma: PrismaService) {}

  // Convierte una logoUrl relativa (ej. '/uploads/logos/xxx.png') en la
  // ruta absoluta del archivo en disco.
  private rutaAbsolutaDesdeLogoUrl(logoUrl: string) {
    const uploadsRoot = resolve(process.cwd(), 'uploads');
    const rutaDestino = resolve(process.cwd(), logoUrl.replace(/^\/+/, ''));
    const rutaRelativa = relative(uploadsRoot, rutaDestino);

    if (rutaRelativa.startsWith('..') || rutaRelativa.startsWith('..' + '\\')) {
      throw new BadRequestException('Ruta de logo inválida.');
    }

    return rutaDestino;
  }

  // Solo borramos del disco los logos que nosotros subimos (rutas locales
  // que empiezan con /uploads/). Si en algún momento el campo tiene una URL
  // externa (del sistema viejo basado en texto), la dejamos intacta.
  private async borrarArchivoLogoSiEsLocal(logoUrl?: string | null) {
    if (!logoUrl || !logoUrl.startsWith('/uploads/')) {
      return;
    }
    try {
      await unlink(this.rutaAbsolutaDesdeLogoUrl(logoUrl));
    } catch {
      // El archivo ya no existe o no se pudo borrar; no es un error fatal.
    }
  }

  async subirLogoDeMiInstitucion(
    usuarioId: string,
    archivo: Express.Multer.File,
  ) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true, rol: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!usuario.institucionId) {
      await this.borrarArchivoLogoSiEsLocal(
        `/uploads/logos/${archivo.filename}`,
      );
      throw new BadRequestException('No perteneces a una institución.');
    }

    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      // El archivo ya quedó guardado por multer antes de llegar aquí; como
      // no se va a usar, lo eliminamos para no dejar basura en el disco.
      await this.borrarArchivoLogoSiEsLocal(
        `/uploads/logos/${archivo.filename}`,
      );
      throw new UnauthorizedException(
        'Solo un profesor o administrador puede cambiar el logo.',
      );
    }

    const institucionActual = await this.prisma.institucion.findUnique({
      where: { id: usuario.institucionId },
      select: { logoUrl: true },
    });

    const nuevaLogoUrl = `/uploads/logos/${archivo.filename}`;

    const institucionActualizada = await this.prisma.institucion.update({
      where: { id: usuario.institucionId },
      data: { logoUrl: nuevaLogoUrl },
    });

    // Reemplazamos: una vez guardado el nuevo, borramos el logo anterior.
    await this.borrarArchivoLogoSiEsLocal(institucionActual?.logoUrl);

    return institucionActualizada;
  }

  async eliminarLogoDeMiInstitucion(usuarioId: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { id: usuarioId },
      select: { institucionId: true, rol: true },
    });

    if (!usuario) {
      throw new UnauthorizedException('Usuario no encontrado.');
    }

    if (!usuario.institucionId) {
      throw new BadRequestException('No perteneces a una institución.');
    }

    if (usuario.rol !== 'PROFESOR' && usuario.rol !== 'ADMIN') {
      throw new UnauthorizedException(
        'Solo un profesor o administrador puede eliminar el logo.',
      );
    }

    const institucionActual = await this.prisma.institucion.findUnique({
      where: { id: usuario.institucionId },
      select: { logoUrl: true },
    });

    if (!institucionActual?.logoUrl) {
      throw new BadRequestException(
        'Esta institución no tiene un logo para eliminar.',
      );
    }

    await this.borrarArchivoLogoSiEsLocal(institucionActual.logoUrl);

    return this.prisma.institucion.update({
      where: { id: usuario.institucionId },
      data: { logoUrl: null },
    });
  }
}
