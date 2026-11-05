import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PrivateFileRuntime } from './private-file-runtime';
import {
  LocalPrivateBackupVault,
  PRIVATE_BACKUP_VAULT,
} from './private-backup-vault';

/** Technical local operator only; never grants access to private pictures. */
@Injectable()
export class PrivateBackupCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrivateBackupCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<{ removed: number; pending: number }>;
  private cursor = '00000000-0000-0000-0000-000000000000';
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_BACKUP_VAULT)
    private readonly vault: Pick<
      LocalPrivateBackupVault,
      'retire' | 'identity'
    >,
    private readonly runtime: PrivateFileRuntime,
  ) {}

  onModuleInit() {
    try {
      this.runtime.assertOperationsEnabled();
    } catch {
      return;
    }
    const tick = () => {
      void Promise.resolve()
        .then(() => this.runOnce())
        .catch(() => {
          this.logger.warn(
            'Private backup cleanup deferred; persisted receipt remains pending.',
          );
        });
    };
    this.timer = setInterval(tick, 60000);
    this.timer.unref();
    tick();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }
  runOnce() {
    this.runtime.assertOperationsEnabled();
    if (this.running !== undefined) return this.running;
    this.running = this.sweep().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async sweep() {
    const candidates = () => this.prisma.$queryRaw<{ id: string }[]>`
      SELECT "archivoId" AS id FROM "RespaldoArchivoPrivado"
      WHERE "retiradoEn" IS NOT NULL AND "eliminadoEn" IS NULL AND "archivoId">${this.cursor}::uuid
      ORDER BY "archivoId" LIMIT 20`;
    let rows = await candidates();
    if (!rows.length) {
      this.cursor = '00000000-0000-0000-0000-000000000000';
      rows = await candidates();
    }
    let removed = 0,
      pending = 0;
    for (const file of rows) {
      this.cursor = file.id;
      try {
        const count = await this.prisma.$transaction(
          async (tx) => {
            // Same owner-first ordering as upload, review and LIC-4 purge.
            await tx.$queryRaw`SELECT u.id FROM "Usuario" u JOIN "ArchivoPrivado" f ON f."propietarioId"=u.id
            WHERE f.id=${file.id}::uuid FOR UPDATE OF u`;
            const [current] = await tx.$queryRaw<
              {
                estado: string;
                retiradoEn: Date | null;
                eliminadoEn: Date | null;
                vaultId: string;
              }[]
            >`
            SELECT f.estado,b."vaultId",b."retiradoEn",b."eliminadoEn" FROM "RespaldoArchivoPrivado" b
            JOIN "ArchivoPrivado" f ON f.id=b."archivoId"
            WHERE b."archivoId"=${file.id}::uuid FOR UPDATE OF b`;
            if (
              !current ||
              current.estado !== 'RETIRADO' ||
              !current.retiradoEn ||
              current.eliminadoEn
            )
              return 0;
            this.runtime.assertOperationsEnabled();
            if ((await this.vault.identity()) !== current.vaultId)
              throw new Error('Private backup namespace mismatch');
            await this.vault.retire(file.id);
            if ((await this.vault.identity()) !== current.vaultId)
              throw new Error('Private backup namespace changed');
            this.runtime.assertOperationsEnabled();
            return tx.$executeRaw`UPDATE "RespaldoArchivoPrivado" SET "eliminadoEn"=date_trunc('milliseconds',clock_timestamp())
            WHERE "archivoId"=${file.id}::uuid AND "retiradoEn" IS NOT NULL AND "eliminadoEn" IS NULL`;
          },
          { timeout: 15000 },
        );
        removed += count;
      } catch {
        // Filesystem failure, timeout or disabled runtime must never acknowledge erasure.
        pending++;
      }
    }
    return { removed, pending };
  }
}
