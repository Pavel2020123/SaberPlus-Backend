import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  ArchivoEditorial,
  Prisma,
  RevocacionArchivoEditorial,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  canReadBattleSnapshotImage,
  hasBattleSnapshotImageReference,
} from './editorial-battle-access';
import {
  canReadTugSnapshotImage,
  hasTugSnapshotImageReference,
} from './editorial-tug-access';
import {
  RevokeEditorialFileDto,
  UploadEditorialFileDto,
} from './editorial-file.dto';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EditorialFileStore } from './editorial-file.store';
import { normalizeEditorialImage, sha256 } from './editorial-image';
import {
  canReadTriviaSnapshotImage,
  hasTriviaSnapshotImageReference,
} from './editorial-trivia-access';
import {
  canReadSoloSnapshotImage,
  hasSoloSnapshotImageReference,
} from './editorial-snapshot-access';

type EditorialFileRow = ArchivoEditorial & {
  revocacion?: RevocacionArchivoEditorial | null;
};

@Injectable()
export class EditorialFileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: EditorialFileStore,
    private readonly runtime: EditorialFileRuntime,
  ) {}

  private metadata(row: EditorialFileRow) {
    const state = row.revocacion ? 'REVOCADO' : row.estado;
    return {
      id: row.id,
      operacionId: row.operacionId,
      estado: state,
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
        state === 'DISPONIBLE' ? `/admin/archivos/${row.id}/contenido` : null,
      puedeReintentar: state === 'PREPARADO',
    };
  }

  private async row(id: string) {
    const row = await this.prisma.archivoEditorial.findUnique({
      where: { id },
      include: { revocacion: true },
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
      include: { revocacion: true },
    });
    if (!row) {
      try {
        row = await this.prisma.archivoEditorial.create({
          include: { revocacion: true },
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
          include: { revocacion: true },
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
    if (row.revocacion || row.estado === 'RETIRADO')
      throw new GoneException(
        'Este archivo ya fue retirado. Inicia una operación nueva.',
      );
    if (row.estado === 'DISPONIBLE') return this.metadata(row);
    if (row.sha256 !== image.sha256)
      throw new ConflictException(
        'La preparación de esta imagen cambió. Consulta la operación antes de continuar.',
      );

    // La reserva previa conserva el recibo si falla la escritura. Compartir el
    // lock al confirmar con asociación/retirada/revocación impide que una carga
    // tardía reactive un recurso revocado. No mantener un lock SQL durante IO.
    const fileId = row.id;
    await this.store.put(fileId, image.content);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${fileId}::uuid FOR UPDATE`;
      const current = await tx.archivoEditorial.findUnique({
        where: { id: fileId },
        include: { revocacion: true },
      });
      if (!current || current.revocacion)
        throw new GoneException('El archivo ya no admite cargas.');
      if (current.estado !== 'PREPARADO') return;
      await tx.archivoEditorial.updateMany({
        where: { id: fileId, estado: 'PREPARADO', revocacion: null },
        data: { estado: 'DISPONIBLE' },
      });
    });
    const current = await this.row(row.id);
    if (current.estado === 'RETIRADO') {
      await this.store.remove(row.id);
      throw new GoneException('El archivo se retiró durante la carga.');
    }
    if (current.revocacion)
      throw new GoneException('Este archivo fue revocado.');
    return this.metadata(current);
  }

  async receipt(actorId: string, operationId: string) {
    this.runtime.assertEnabled();
    const row = await this.prisma.archivoEditorial.findFirst({
      where: { operacionId: operationId, creadoPorId: actorId },
      include: { revocacion: true },
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
    if (row.estado !== 'DISPONIBLE' || row.revocacion)
      throw new NotFoundException('El archivo no está disponible.');
    // PostgreSQL normaliza UUID; el nombre en disco también debe usar esa forma
    // para funcionar igual en Windows y en un servidor Linux sensible a mayúsculas.
    const bytes = await this.store.read(row.id);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256)
      throw new ServiceUnavailableException(
        'No pudimos verificar el archivo guardado.',
      );
    // No emitir bytes si la revocación confirmó mientras se leía el almacén.
    const current = await this.row(id);
    if (current.revocacion || current.estado !== 'DISPONIBLE')
      throw new NotFoundException('El archivo no está disponible.');
    return bytes;
  }

  async retire(id: string) {
    this.runtime.assertEnabled();
    const fileId = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.archivoEditorial.findUnique({
        where: { id },
        include: { revocacion: true },
      });
      if (!row) throw new NotFoundException('Archivo no encontrado.');
      if (row.revocacion)
        throw new ConflictException(
          'Un archivo revocado se conserva para auditoría.',
        );
      const counts = await Promise.all([
        tx.pregunta.count({ where: { archivoImagenId: id } }),
        tx.casoPregunta.count({ where: { archivoImagenId: id } }),
        tx.subtema.count({ where: { archivoImagenId: id } }),
        tx.respuesta.count({ where: { archivoImagenId: id } }),
        tx.imagenHistorialRespuesta.count({ where: { archivoId: id } }),
      ]);
      if (
        counts.some((count) => count > 0) ||
        (await hasSoloSnapshotImageReference(tx, row.id)) ||
        (await hasTriviaSnapshotImageReference(tx, row.id)) ||
        (await hasTugSnapshotImageReference(tx, row.id)) ||
        (await hasBattleSnapshotImageReference(tx, row.id))
      )
        throw new ConflictException(
          'Esta imagen está vinculada a contenido o a una versión anterior. No se puede retirar.',
        );
      // Primero revocar acceso. Un fallo al borrar bytes no vuelve a publicar.
      await tx.archivoEditorial.updateMany({
        where: { id, estado: { not: 'RETIRADO' } },
        data: { estado: 'RETIRADO' },
      });
      return row.id;
    });
    await this.store.remove(fileId);
    return this.metadata(await this.row(fileId));
  }

  private revocationMetadata(row: RevocacionArchivoEditorial) {
    return {
      archivoId: row.archivoId,
      operacionId: row.operacionId,
      motivo: row.motivo,
      detalle: row.detalle,
      creadoEn: row.creadoEn,
    };
  }

  async revocationReceipt(actorId: string, id: string, operationId: string) {
    this.runtime.assertEnabled();
    const row = await this.prisma.revocacionArchivoEditorial.findFirst({
      where: { archivoId: id, operacionId: operationId, actorId },
    });
    if (!row) throw new NotFoundException('Operación no encontrada.');
    return this.revocationMetadata(row);
  }

  async revoke(actorId: string, fileId: string, dto: RevokeEditorialFileDto) {
    this.runtime.assertEnabled();
    const id = fileId.toLowerCase();
    const fingerprint = sha256(
      JSON.stringify([actorId, id, dto.motivo, dto.detalle]),
    );
    const replay = (row: RevocacionArchivoEditorial) => {
      if (row.actorId !== actorId)
        throw new NotFoundException('Operación no encontrada.');
      if (row.archivoId !== id || row.huellaSolicitud !== fingerprint)
        throw new ConflictException(
          'Esta operación pertenece a otra revocación.',
        );
      return this.revocationMetadata(row);
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${id}::uuid FOR UPDATE`;
        const previous = await tx.revocacionArchivoEditorial.findUnique({
          where: { operacionId: dto.operacionId },
        });
        if (previous) return replay(previous);
        const file = await tx.archivoEditorial.findUnique({
          where: { id },
          include: { revocacion: true },
        });
        if (!file) throw new NotFoundException('Archivo no encontrado.');
        if (file.revocacion)
          throw new ConflictException(
            'El archivo ya tiene una revocación confirmada.',
          );
        const row = await tx.revocacionArchivoEditorial.create({
          data: {
            archivoId: id,
            operacionId: dto.operacionId,
            actorId,
            huellaSolicitud: fingerprint,
            motivo: dto.motivo,
            detalle: dto.detalle,
          },
        });
        return this.revocationMetadata(row);
      });
    } catch (error) {
      // Dos archivos distintos pueden intentar reservar el mismo identificador.
      // Resolver fuera de la transacción abortada sin ocultar otras fallas SQL.
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      )
        throw error;
      const previous = await this.prisma.revocacionArchivoEditorial.findUnique({
        where: { operacionId: dto.operacionId },
      });
      if (!previous) throw error;
      return replay(previous);
    }
  }

  async publishedContent(id: string, actorId?: string) {
    this.runtime.assertEnabled();
    const row = await this.prisma.archivoEditorial.findUnique({
      where: { id },
      include: { revocacion: true },
    });
    if (!row || row.revocacion || row.estado !== 'DISPONIBLE')
      throw new NotFoundException('El archivo no está disponible.');
    const publishedQuestion = {
      estadoContenido: 'PUBLICADO' as const,
      subtema: {
        estadoContenido: 'PUBLICADO' as const,
        tema: { estadoContenido: 'PUBLICADO' as const },
      },
    };
    // H2B4: lección/caso mutables solo conceden por publicación vigente.
    // ProgresoTema, un ID en IntentoSimulacro o el caso actual de un historial
    // no acreditan la imagen original. Lo histórico requiere H1 o una copia
    // exacta de los adaptadores inferiores; nunca reconstruirlo desde el banco.
    const accessible = await this.prisma.archivoEditorial.findFirst({
      where: {
        id,
        estado: 'DISPONIBLE',
        revocacion: null,
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
          { opciones: { some: { pregunta: publishedQuestion } } },
          ...(actorId && this.runtime.historyEnabled()
            ? [
                {
                  imagenesHistoricas: {
                    some: {
                      usuarioId: actorId,
                      sha256: row.sha256,
                      historial: { usuarioId: actorId },
                    },
                  },
                },
              ]
            : []),
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
    const snapshotAccess =
      !accessible && actorId && this.runtime.snapshotsEnabled()
        ? await canReadSoloSnapshotImage(this.prisma, row.id, actorId)
        : false;
    const triviaAccess =
      !accessible &&
      !snapshotAccess &&
      actorId &&
      this.runtime.triviaSnapshotsEnabled()
        ? await canReadTriviaSnapshotImage(this.prisma, row.id, actorId)
        : false;
    const tugAccess =
      !accessible &&
      !snapshotAccess &&
      !triviaAccess &&
      actorId &&
      this.runtime.tugSnapshotsEnabled()
        ? await canReadTugSnapshotImage(this.prisma, row.id, actorId)
        : false;
    const battleAccess =
      !accessible &&
      !snapshotAccess &&
      !triviaAccess &&
      !tugAccess &&
      actorId &&
      this.runtime.battleSnapshotsEnabled()
        ? await canReadBattleSnapshotImage(this.prisma, row.id, actorId)
        : false;
    if (
      !accessible &&
      !snapshotAccess &&
      !triviaAccess &&
      !tugAccess &&
      !battleAccess
    )
      throw new NotFoundException('El archivo no está disponible.');
    return this.content(id);
  }
}
