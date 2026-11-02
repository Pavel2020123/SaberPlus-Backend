import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileStore } from './editorial-file.store';
import { EditorialFileService } from './editorial-file.service';
import { EditorialFileRuntime } from './editorial-file-runtime';
import { EDITORIAL_OUTPUT_LIMIT, sha256 } from './editorial-image';

export type EditorialBytesBackup = {
  version: 1;
  id: string;
  sha256: string;
  bytes: number;
  base64: string;
};

/** Local operator service only: no new HTTP endpoint and no database-state restore. */
@Injectable()
export class EditorialFileRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: EditorialFileStore,
    private readonly files: EditorialFileService,
    private readonly runtime: EditorialFileRuntime,
  ) {}

  private async authorize(actorId: string) {
    this.runtime.assertEnabled();
    if (process.env.EDITORIAL_FILE_OPERATIONS_LOCAL_ENABLED !== 'true')
      throw new ServiceUnavailableException(
        'Las operaciones de archivos no están habilitadas.',
      );
    const actor = await this.prisma.usuario.findUnique({
      where: { id: actorId },
      select: {
        rol: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
      },
    });
    if (
      !actor ||
      actor.rol !== 'ADMIN' ||
      !actor.correoVerificado ||
      actor.debeCambiarContrasena
    )
      throw new ForbiddenException('No tienes acceso a estas operaciones.');
  }

  private async row(id: string) {
    if (
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        id,
      )
    )
      throw new BadRequestException('Identificador de archivo no válido.');
    const row = await this.prisma.archivoEditorial.findUnique({
      where: { id },
      include: { revocacion: true },
    });
    if (!row) throw new NotFoundException('Archivo no encontrado.');
    return row;
  }

  async audit(actorId: string, after?: string, limit = 25) {
    await this.authorize(actorId);
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (after && !/^[a-f0-9-]{36}$/i.test(after))
    )
      throw new BadRequestException('Página de auditoría no válida.');
    const rows = await this.prisma.archivoEditorial.findMany({
      where: after ? { id: { gt: after } } : {},
      orderBy: { id: 'asc' },
      take: limit + 1,
      include: { revocacion: true },
    });
    const items: {
      id: string;
      estado: string;
      integridad: string;
      bytes: number;
    }[] = [];
    for (const row of rows.slice(0, limit)) {
      let integrity = 'NO_VERIFICABLE';
      try {
        const bytes = await this.store.read(row.id);
        integrity =
          bytes.length === row.bytes && sha256(bytes) === row.sha256
            ? 'INTEGRO'
            : 'CORRUPTO';
      } catch {
        /* An outage is not proof of a missing object. */
      }
      const current = await this.row(row.id);
      if (
        current.actualizadoEn.getTime() !== row.actualizadoEn.getTime() ||
        Boolean(current.revocacion) !== Boolean(row.revocacion)
      )
        integrity = 'CAMBIO_DURANTE_REVISION';
      items.push({
        id: row.id,
        estado: current.revocacion ? 'REVOCADO' : current.estado,
        integridad: integrity,
        bytes: current.bytes,
      });
    }
    await this.authorize(actorId);
    return { items, next: rows.length > limit ? rows[limit - 1].id : null };
  }

  async backup(actorId: string, id: string): Promise<EditorialBytesBackup> {
    await this.authorize(actorId);
    const row = await this.row(id);
    const bytes = await this.store.read(row.id);
    if (
      bytes.length !== row.bytes ||
      bytes.length > EDITORIAL_OUTPUT_LIMIT ||
      sha256(bytes) !== row.sha256
    )
      throw new ConflictException('El archivo no permite un respaldo íntegro.');
    const current = await this.row(id);
    if (current.sha256 !== row.sha256 || current.bytes !== row.bytes)
      throw new ConflictException('El archivo cambió durante el respaldo.');
    await this.authorize(actorId);
    return {
      version: 1,
      id: row.id,
      sha256: row.sha256,
      bytes: row.bytes,
      base64: bytes.toString('base64'),
    };
  }

  async restore(actorId: string, id: string, backup: EditorialBytesBackup) {
    await this.authorize(actorId);
    const row = await this.row(id);
    if (row.estado === 'RETIRADO')
      throw new ConflictException(
        'Un archivo retirado no admite restauración.',
      );
    if (
      !backup ||
      Object.keys(backup).some(
        (key) => !['version', 'id', 'sha256', 'bytes', 'base64'].includes(key),
      ) ||
      backup.version !== 1 ||
      backup.id !== row.id ||
      backup.sha256 !== row.sha256 ||
      backup.bytes !== row.bytes ||
      typeof backup.base64 !== 'string' ||
      backup.base64.length > Math.ceil(EDITORIAL_OUTPUT_LIMIT / 3) * 4 ||
      backup.base64.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(backup.base64)
    )
      throw new BadRequestException('Respaldo no válido para este archivo.');
    const bytes = Buffer.from(backup.base64, 'base64');
    if (
      !bytes.length ||
      bytes.toString('base64') !== backup.base64 ||
      bytes.length !== row.bytes ||
      bytes.length > EDITORIAL_OUTPUT_LIMIT ||
      sha256(bytes) !== row.sha256
    )
      throw new BadRequestException('El respaldo no coincide con el archivo.');
    // Immutable put: never overwrite a different/corrupt live object. No status,
    // receipt, reference or revocation is changed by recovering matching bytes.
    await this.store.put(row.id, bytes);
    const current = await this.row(id);
    if (current.sha256 !== row.sha256 || current.bytes !== row.bytes)
      throw new ConflictException('El archivo cambió durante la recuperación.');
    if (current.estado === 'RETIRADO' && !current.revocacion) {
      await this.files.retire(current.id); // Existing reference/retention checks still apply.
      throw new ConflictException(
        'La retirada prevalece sobre la recuperación.',
      );
    }
    await this.authorize(actorId);
    return {
      id: row.id,
      estado: current.revocacion ? 'REVOCADO' : current.estado,
      bytesVerificados: bytes.length,
    };
  }

  async cleanupRetired(actorId: string, id: string) {
    await this.authorize(actorId);
    const row = await this.row(id);
    if (row.estado !== 'RETIRADO' || row.revocacion)
      throw new ConflictException(
        'Solo se limpia una retirada existente sin revocación.',
      );
    return this.files.retire(row.id);
  }
}
