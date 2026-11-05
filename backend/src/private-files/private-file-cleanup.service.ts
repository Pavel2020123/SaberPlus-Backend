import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileStore } from '../editorial-files/editorial-file.store';
import { PRIVATE_FILE_STORE } from './private-file.store';
import { PrivateFileRuntime } from './private-file-runtime';

/** Local opt-in only. Expiry authorization never depends on this worker. */
@Injectable()
export class PrivateFileCleanupService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrivateFileCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running?: Promise<{
    retired: number;
    removed: number;
    pending: number;
  }>;
  private cursor = '00000000-0000-0000-0000-000000000000';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_FILE_STORE) private readonly store: EditorialFileStore,
    private readonly runtime: PrivateFileRuntime,
  ) {}

  onModuleInit() {
    try {
      this.runtime.assertEnabled();
    } catch {
      return;
    }
    const tick = () => {
      void Promise.resolve()
        .then(() => this.runOnce())
        .catch(() => {
          // No filenames, identities, provider keys or database errors in logs.
          this.logger.warn(
            'Private cleanup deferred; persisted receipts remain pending.',
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
    this.runtime.assertEnabled();
    if (this.running !== undefined) return this.running;
    this.running = this.sweep().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async sweep() {
    const expired = await this.prisma.$queryRaw<
      { id: string; propietarioId: string }[]
    >`
      SELECT f.id,f."propietarioId" FROM "ArchivoPrivado" f
      JOIN LATERAL (
        SELECT "venceEn" FROM "ResolucionEvidenciaInstitucional" r
        WHERE r."solicitudId"=f."solicitudId" AND r.revision>f."revisionEsperada"
        ORDER BY r.revision LIMIT 1
      ) r ON TRUE
      WHERE f.proposito='EVIDENCIA_INSTITUCIONAL' AND f.estado<>'RETIRADO'
        AND r."venceEn"<=clock_timestamp()
      ORDER BY f.id LIMIT 20`;
    let retired = 0;
    for (const file of expired) {
      retired += await this.prisma.$transaction(async (tx) => {
        // Same owner-first lock as upload/purge; recheck expiry after acquiring it.
        await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${file.propietarioId}::uuid FOR UPDATE`;
        return tx.$executeRaw`
          UPDATE "ArchivoPrivado" f SET estado='RETIRADO',
            "retiradoEn"=date_trunc('milliseconds',clock_timestamp()),
            "actualizadoEn"=date_trunc('milliseconds',clock_timestamp())
          WHERE f.id=${file.id}::uuid AND f.estado<>'RETIRADO' AND (
            SELECT "venceEn" FROM "ResolucionEvidenciaInstitucional" r
            WHERE r."solicitudId"=f."solicitudId" AND r.revision>f."revisionEsperada"
            ORDER BY r.revision LIMIT 1
          )<=clock_timestamp()`;
      });
    }
    const candidates = () =>
      this.prisma.archivoPrivado.findMany({
        where: {
          estado: 'RETIRADO',
          // A restore may finish after its transaction timed out and an earlier
          // erasure was acknowledged. Reconcile backed retired identities again;
          // never interpret that first acknowledgement as a permanent IO fence.
          OR: [{ bytesRetiradosEn: null }, { respaldo: { isNot: null } }],
          id: { gt: this.cursor },
        },
        select: { id: true },
        orderBy: { id: 'asc' },
        take: 20,
      });
    let files = await candidates();
    if (!files.length) {
      this.cursor = '00000000-0000-0000-0000-000000000000';
      files = await candidates();
    }
    let removed = 0,
      pending = 0;
    for (const file of files) {
      // Only immutable, known retired IDs. Never enumerate/delete bucket orphans.
      this.cursor = file.id;
      try {
        await this.store.remove(file.id);
        await this.prisma.archivoPrivado.updateMany({
          where: {
            id: file.id,
            estado: 'RETIRADO',
            bytesRetiradosEn: null,
          },
          data: { bytesRetiradosEn: new Date() },
        });
        removed++;
      } catch {
        pending++;
      }
    }
    return { retired, removed, pending };
  }
}
