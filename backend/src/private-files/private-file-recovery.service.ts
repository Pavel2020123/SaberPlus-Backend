import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ArchivoPrivado, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileStore } from '../editorial-files/editorial-file.store';
import { sha256 } from '../editorial-files/editorial-image';
import { PrivateFileRuntime } from './private-file-runtime';
import { PRIVATE_FILE_STORE } from './private-file.store';
import {
  LocalPrivateBackupVault,
  PRIVATE_BACKUP_VAULT,
} from './private-backup-vault';
import { PrivateBackupIdentity } from './private-backup-envelope';

type Tx = Prisma.TransactionClient;
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
type Registry = {
  vaultId: string;
  retiradoEn: Date | null;
  eliminadoEn: Date | null;
};

/** Server-local operator only. No endpoint, no plaintext/key result or metadata restore. */
@Injectable()
export class PrivateFileRecoveryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_FILE_STORE) private readonly store: EditorialFileStore,
    @Inject(PRIVATE_BACKUP_VAULT)
    private readonly vault: LocalPrivateBackupVault,
    private readonly runtime: PrivateFileRuntime,
  ) {}

  private async operator(tx: Tx, actor: string) {
    this.runtime.assertOperationsEnabled();
    const user = await tx.usuario.findUnique({
      where: { id: actor },
      select: {
        rol: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
        suprimidaEn: true,
      },
    });
    if (
      !user ||
      user.rol !== 'ADMIN' ||
      !user.correoVerificado ||
      user.debeCambiarContrasena ||
      user.suprimidaEn
    )
      throw new ForbiddenException(
        'Solo el operador técnico de SaberPlus puede realizar esta operación.',
      );
  }
  private async eligible(
    tx: Tx,
    actor: string,
    id: string,
  ): Promise<ArchivoPrivado> {
    await this.operator(tx, actor); // Reject non-operators before querying private identities.
    const initial = await tx.archivoPrivado.findUnique({ where: { id } });
    if (!initial) throw new NotFoundException('Archivo privado no encontrado.');
    for (const userId of [...new Set([actor, initial.propietarioId])].sort()) {
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${userId}::uuid FOR UPDATE`;
    }
    await this.operator(tx, actor);
    const file = await tx.archivoPrivado.findUniqueOrThrow({ where: { id } });
    const owner = await tx.usuario.findUnique({
      where: { id: file.propietarioId },
      select: {
        rol: true,
        suprimidaEn: true,
        correoVerificado: true,
        debeCambiarContrasena: true,
      },
    });
    if (
      file.propietarioId !== initial.propietarioId ||
      file.estado !== 'ACTIVO' ||
      !owner ||
      owner.suprimidaEn ||
      owner.debeCambiarContrasena
    )
      throw new ConflictException(
        'El archivo ya no admite respaldo o recuperación.',
      );
    if (file.proposito === 'FOTO_PERFIL') {
      const photo = await tx.fotoPrivadaPerfil.findUnique({
        where: { usuarioId: file.propietarioId },
      });
      if (
        !['ESTUDIANTE', 'PROFESOR'].includes(owner.rol ?? '') ||
        photo?.archivoId !== id
      )
        throw new ConflictException('La foto privada ya no está vigente.');
    } else if (
      file.proposito === 'EVIDENCIA_INSTITUCIONAL' &&
      file.solicitudId
    ) {
      await tx.$queryRaw`SELECT id FROM "SolicitudAltaInstitucion" WHERE id=${file.solicitudId}::uuid FOR UPDATE`;
      const request = await tx.solicitudAltaInstitucion.findUnique({
        where: { id: file.solicitudId },
      });
      const [deadline] = await tx.$queryRaw<{ vencido: boolean }[]>`
        SELECT "venceEn"<=clock_timestamp() AS vencido FROM "ResolucionEvidenciaInstitucional"
        WHERE "solicitudId"=${file.solicitudId}::uuid AND revision>${file.revisionEsperada}
        ORDER BY revision LIMIT 1`;
      if (
        owner.rol !== 'PROFESOR' ||
        !owner.correoVerificado ||
        request?.solicitanteId !== file.propietarioId ||
        deadline?.vencido ||
        (!deadline &&
          !['PENDIENTE', 'REQUIERE_INFORMACION', 'LEGADO_EN_REVISION'].includes(
            request?.estado ?? '',
          ))
      )
        throw new ConflictException('La evidencia ya no admite recuperación.');
    } else throw new ConflictException('Propósito privado no admitido.');
    return file;
  }
  private meta(file: ArchivoPrivado): PrivateBackupIdentity {
    if (!['image/webp', 'application/pdf'].includes(file.mime))
      throw new ConflictException('Formato privado no admitido.');
    return {
      id: file.id,
      sha256: file.sha256,
      bytes: file.bytes,
      mime: file.mime as PrivateBackupIdentity['mime'],
    };
  }
  private async registry(
    tx: Tx,
    id: string,
    vaultId: string,
  ): Promise<Registry> {
    const [row] = await tx.$queryRaw<
      Registry[]
    >`SELECT "vaultId","retiradoEn","eliminadoEn"
      FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${id}::uuid FOR UPDATE`;
    if (!row || row.vaultId !== vaultId || row.retiradoEn || row.eliminadoEn)
      throw new ConflictException(
        'El respaldo no está disponible en este almacén.',
      );
    return row;
  }
  private async locked<T>(
    actor: string,
    id: string,
    work: (tx: Tx, file: ArchivoPrivado) => Promise<T>,
  ) {
    this.runtime.assertOperationsEnabled();
    if (!uuid.test(actor) || !uuid.test(id))
      throw new BadRequestException('Identificador privado no válido.');
    return this.prisma.$transaction(
      async (tx) => work(tx, await this.eligible(tx, actor, id)),
      { timeout: 30000 },
    );
  }

  async backup(actor: string, id: string) {
    // Commit the registry before file IO so a crash cannot lose the erasure obligation.
    await this.locked(actor, id, async (tx) => {
      const vaultId = await this.vault.identity();
      await tx.$executeRaw`INSERT INTO "RespaldoArchivoPrivado" ("archivoId","vaultId")
        VALUES (${id}::uuid,${vaultId}::uuid) ON CONFLICT ("archivoId") DO NOTHING`;
      await this.registry(tx, id, vaultId);
    });
    let io: Promise<void> | undefined;
    try {
      return await this.locked(actor, id, async (tx, file) => {
        await this.registry(tx, id, await this.vault.identity());
        io = (async () => {
          const bytes = await this.store.read(id);
          try {
            await this.vault.save(this.meta(file), bytes);
            const verified = await this.vault.read(this.meta(file));
            try {
              if (!verified.equals(bytes))
                throw new ConflictException('El respaldo no coincide.');
            } finally {
              verified.fill(0);
            }
          } finally {
            bytes.fill(0);
          }
        })();
        await io;
        await this.registry(tx, id, await this.vault.identity());
        await this.eligible(tx, actor, id);
        return { id, bytesVerificados: file.bytes, respaldoVerificado: true };
      });
    } catch (error) {
      await io?.catch(() => undefined);
      if (io !== undefined)
        await this.cleanupAfterFailure(id, false).catch(() => undefined);
      throw error;
    }
  }

  async restore(actor: string, id: string) {
    let io: Promise<void> | undefined;
    try {
      return await this.locked(actor, id, async (tx, file) => {
        await this.registry(tx, id, await this.vault.identity());
        io = (async () => {
          const bytes = await this.vault.read(this.meta(file));
          try {
            // Immutable transport: an existing different/corrupt object is never overwritten.
            await this.store.put(id, bytes);
            const verified = await this.store.read(id);
            try {
              if (
                verified.length !== file.bytes ||
                sha256(verified) !== file.sha256
              )
                throw new ConflictException(
                  'La recuperación no coincide con el registro.',
                );
            } finally {
              verified.fill(0);
            }
          } finally {
            bytes.fill(0);
          }
        })();
        await io;
        await this.registry(tx, id, await this.vault.identity());
        await this.eligible(tx, actor, id);
        return { id, bytesVerificados: file.bytes, recuperado: true };
      });
    } catch (error) {
      await io?.catch(() => undefined);
      if (io !== undefined)
        await this.cleanupAfterFailure(id, true).catch(() => undefined);
      throw error;
    }
  }

  private async cleanupAfterFailure(id: string, restored: boolean) {
    // Wait for IO above before reconciling: a timed-out callback may still finish it.
    await this.prisma.$transaction(
      async (tx) => {
        const initial = await tx.archivoPrivado.findUnique({ where: { id } });
        if (!initial) return;
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${initial.propietarioId}::uuid FOR UPDATE`;
        let file = await tx.archivoPrivado.findUniqueOrThrow({ where: { id } });
        if (
          file.estado === 'ACTIVO' &&
          file.proposito === 'EVIDENCIA_INSTITUCIONAL'
        ) {
          const [clock] = await tx.$queryRaw<
            { vencido: boolean }[]
          >`SELECT "venceEn"<=clock_timestamp() AS vencido
          FROM "ResolucionEvidenciaInstitucional" WHERE "solicitudId"=${file.solicitudId}::uuid
            AND revision>${file.revisionEsperada} ORDER BY revision LIMIT 1`;
          if (clock?.vencido) {
            file = await tx.archivoPrivado.update({
              where: { id },
              data: { estado: 'RETIRADO', retiradoEn: new Date() },
            });
          }
        }
        if (file.estado !== 'RETIRADO') return;
        if (restored) {
          await this.store.remove(id);
          await tx.archivoPrivado.updateMany({
            where: { id, estado: 'RETIRADO', bytesRetiradosEn: null },
            data: { bytesRetiradosEn: new Date() },
          });
        }
        const [row] = await tx.$queryRaw<
          Registry[]
        >`SELECT "vaultId","retiradoEn","eliminadoEn"
        FROM "RespaldoArchivoPrivado" WHERE "archivoId"=${id}::uuid`;
        if (row?.retiradoEn && row.vaultId === (await this.vault.identity()))
          await this.vault.retire(id);
        // Worker owns the final acknowledgement; never erase the durable receipt here.
      },
      { timeout: 30000 },
    );
  }
}
