import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArchivoEditorial, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UploadEditorialFileDto } from './editorial-file.dto';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileStore } from './editorial-file.store';
import { normalizeEditorialImage, sha256 } from './editorial-image';

@Injectable()
export class EditorialFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: EditorialFileStore,
    private readonly runtime: EditorialFileRuntime,
  ) {}

  private metadata(row: ArchivoEditorial) {
    return {
      id: row.id,
      operacionId: row.operacionId,
      estado: row.estado,
      titulo: row.titulo,
      textoAlternativo: row.textoAlternativo,
      fuente: row.fuente,
      titular: row.titular,
      autorizacion: row.autorizacion,
      referenciaAutorizacion: row.referenciaAutorizacion,
      tipo: 'image/webp',
      bytes: row.bytes,
      ancho: row.ancho,
      alto: row.alto,
      creadoEn: row.creadoEn,
      contenidoUrl:
        row.estado === 'DISPONIBLE'
          ? `/admin/archivos/${row.id}/contenido`
          : null,
      puedeReintentar: row.estado === 'PREPARADO',
    };
  }

  private async row(id: string) {
    const row = await this.prisma.archivoEditorial.findUnique({
      where: { id },
    });
    if (!row) throw new NotFoundException('Archivo no encontrado.');
    return row;
  }

  async upload(actorId: string, dto: UploadEditorialFileDto, input: Buffer) {
    this.runtime.assertEnabled();
    if (dto.autorizacion !== 'ORIGINAL' && !dto.referenciaAutorizacion)
      throw new BadRequestException(
        'Indica la referencia que autoriza el uso de esta imagen.',
      );
    const image = await normalizeEditorialImage(input);
    const fields = {
      titulo: dto.titulo,
      textoAlternativo: dto.textoAlternativo,
      fuente: dto.fuente,
      titular: dto.titular,
      autorizacion: dto.autorizacion,
      referenciaAutorizacion: dto.referenciaAutorizacion ?? null,
    };
    // Los bytes originales identifican el reintento aunque cambie la versión de sharp.
    const fingerprint = sha256(
      JSON.stringify([actorId, fields, sha256(input)]),
    );
    let row = await this.prisma.archivoEditorial.findUnique({
      where: { operacionId: dto.operacionId },
    });
    if (!row) {
      try {
        row = await this.prisma.archivoEditorial.create({
          data: {
            id: randomUUID(),
            operacionId: dto.operacionId,
            creadoPorId: actorId,
            huellaSolicitud: fingerprint,
            ...fields,
            sha256: image.sha256,
            bytes: image.bytes,
            ancho: image.ancho,
            alto: image.alto,
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        row = await this.prisma.archivoEditorial.findUnique({
          where: { operacionId: dto.operacionId },
        });
        if (!row) throw error;
      }
    }
    if (row.creadoPorId !== actorId)
      throw new NotFoundException('Operación no encontrada.');
    if (row.huellaSolicitud !== fingerprint)
      throw new ConflictException(
        'Esta operación pertenece a otro envío. Conserva el identificador para reintentar el mismo archivo.',
      );
    if (row.estado === 'RETIRADO')
      throw new GoneException(
        'Este archivo ya fue retirado. Inicia una operación nueva.',
      );
    if (row.estado === 'DISPONIBLE') return this.metadata(row);
    if (row.sha256 !== image.sha256)
      throw new ConflictException(
        'La preparación de esta imagen cambió. Consulta la operación antes de continuar.',
      );

    // Reservar primero deja un recibo durable cuando falle la escritura del archivo.
    await this.store.put(row.id, image.content);
    await this.prisma.archivoEditorial.updateMany({
      where: { id: row.id, estado: 'PREPARADO' },
      data: { estado: 'DISPONIBLE' },
    });
    const current = await this.row(row.id);
    if (current.estado === 'RETIRADO') {
      await this.store.remove(row.id);
      throw new GoneException('El archivo se retiró durante la carga.');
    }
    return this.metadata(current);
  }

  async receipt(actorId: string, operationId: string) {
    this.runtime.assertEnabled();
    const row = await this.prisma.archivoEditorial.findFirst({
      where: { operacionId: operationId, creadoPorId: actorId },
    });
    if (!row) throw new NotFoundException('Operación no encontrada.');
    return this.metadata(row);
  }

  async detail(id: string) {
    this.runtime.assertEnabled();
    return this.metadata(await this.row(id));
  }

  async content(id: string) {
    this.runtime.assertEnabled();
    const row = await this.row(id);
    if (row.estado !== 'DISPONIBLE')
      throw new NotFoundException('El archivo no está disponible.');
    const bytes = await this.store.read(id);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256)
      throw new ServiceUnavailableException(
        'No pudimos verificar el archivo guardado.',
      );
    return bytes;
  }

  async retire(id: string) {
    this.runtime.assertEnabled();
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.archivoEditorial.findUnique({ where: { id } });
      if (!row) throw new NotFoundException('Archivo no encontrado.');
      const counts = await Promise.all([
        tx.pregunta.count({ where: { archivoImagenId: id } }),
        tx.casoPregunta.count({ where: { archivoImagenId: id } }),
        tx.subtema.count({ where: { archivoImagenId: id } }),
      ]);
      if (counts.some((count) => count > 0))
        throw new ConflictException(
          'Esta imagen está vinculada a contenido o a una versión anterior. No se puede retirar.',
        );
      // Primero revocar acceso. Un fallo al borrar bytes no vuelve a publicar.
      await tx.archivoEditorial.updateMany({
        where: { id, estado: { not: 'RETIRADO' } },
        data: { estado: 'RETIRADO' },
      });
    });
    await this.store.remove(id);
    return this.metadata(await this.row(id));
  }

  async publishedContent(id: string) {
    this.runtime.assertEnabled();
    const publishedQuestion = {
      estadoContenido: 'PUBLICADO' as const,
      subtema: {
        estadoContenido: 'PUBLICADO' as const,
        tema: { estadoContenido: 'PUBLICADO' as const },
      },
    };
    const accessible = await this.prisma.archivoEditorial.findFirst({
      where: {
        id,
        estado: 'DISPONIBLE',
        OR: [
          {
            lecciones: {
              some: {
                estadoContenido: 'PUBLICADO',
                tema: { estadoContenido: 'PUBLICADO' },
              },
            },
          },
          { preguntas: { some: publishedQuestion } },
          {
            casos: {
              some: {
                estadoContenido: 'PUBLICADO',
                preguntas: { some: publishedQuestion },
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    if (!accessible)
      throw new NotFoundException(
        'Imagen no disponible en el contenido publicado.',
      );
    return this.content(id);
  }
}
