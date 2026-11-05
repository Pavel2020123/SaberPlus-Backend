import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ArchivoPrivado, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { JwtPayload } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { EditorialFileStore } from '../editorial-files/editorial-file.store';
import { sha256 } from '../editorial-files/editorial-image';
import { PRIVATE_FILE_STORE } from './private-file.store';
import { PrivateFileRuntime } from './private-file-runtime';
import { prepareInstitutionEvidence } from './private-file-content';
import { UploadProfilePhotoDto } from './profile-photo.dto';

type Actor = Pick<JwtPayload, 'sub' | 'versionSesion'>;
type Tx = Prisma.TransactionClient;
const pending = ['PENDIENTE', 'REQUIERE_INFORMACION', 'LEGADO_EN_REVISION'];
const stale = () =>
  new ConflictException('La solicitud cambió. Actualízala antes de reenviar.');

@Injectable()
export class InstitutionEvidenceService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_FILE_STORE) private readonly store: EditorialFileStore,
    private readonly runtime: PrivateFileRuntime,
  ) {}

  private async access(tx: Tx, actor: Actor, requestId: string, write = false) {
    this.runtime.assertEnabled();
    const initial = await tx.solicitudAltaInstitucion.findUnique({
      where: { id: requestId },
    });
    if (!initial?.solicitanteId)
      throw new NotFoundException('Solicitud no encontrada.');
    // Same user-before-request ordering as reviewed LIC-4 purge and approval.
    // ADMIN also locks the owner; an in-flight purge cannot outlive permission.
    const ids = [...new Set([actor.sub, initial.solicitanteId])].sort();
    for (const id of ids)
      await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${id}::uuid FOR UPDATE`;
    const user = await tx.usuario.findUnique({
      where: { id: actor.sub },
      select: {
        id: true,
        rol: true,
        suprimidaEn: true,
        debeCambiarContrasena: true,
        versionSesion: true,
        correoVerificado: true,
      },
    });
    if (
      !user?.rol ||
      user.suprimidaEn ||
      user.debeCambiarContrasena ||
      user.versionSesion !== actor.versionSesion
    )
      throw new ForbiddenException('La sesión ya no tiene acceso.');
    const applicant = await tx.usuario.findUnique({
      where: { id: initial.solicitanteId },
      select: { suprimidaEn: true },
    });
    if (!applicant || applicant.suprimidaEn)
      throw new NotFoundException('Solicitud no encontrada.');
    if (
      user.rol !== 'ADMIN' &&
      (user.id !== initial.solicitanteId ||
        user.rol !== 'PROFESOR' ||
        !user.correoVerificado)
    )
      throw new NotFoundException('Solicitud no encontrada.');
    await tx.$queryRaw`SELECT id FROM "SolicitudAltaInstitucion" WHERE id=${requestId}::uuid FOR UPDATE`;
    const request = await tx.solicitudAltaInstitucion.findUniqueOrThrow({
      where: { id: requestId },
    });
    if (request.solicitanteId !== initial.solicitanteId) throw stale();
    if (
      write &&
      (user.id !== request.solicitanteId ||
        user.rol !== 'PROFESOR' ||
        !user.correoVerificado)
    )
      throw new ForbiddenException(
        'Solo el solicitante puede aportar o retirar adjuntos.',
      );
    return request;
  }

  private async deadline(tx: Tx, file: ArchivoPrivado) {
    const rows = await tx.$queryRaw<{ venceEn: Date; vencido: boolean }[]>`
      SELECT "venceEn", "venceEn"<=clock_timestamp() AS vencido
      FROM "ResolucionEvidenciaInstitucional"
      WHERE "solicitudId"=${file.solicitudId}::uuid AND revision>${file.revisionEsperada}
      ORDER BY revision LIMIT 1`;
    return rows[0] ?? null;
  }

  private async receipt(
    tx: Tx,
    file: ArchivoPrivado,
    request: { revision: number; estado: string },
  ) {
    const deadline = await this.deadline(tx, file);
    const available =
      file.estado === 'ACTIVO' &&
      !deadline?.vencido &&
      (deadline !== null || pending.includes(request.estado));
    return {
      id: file.id,
      operacionId: file.operacionId,
      estado: file.estado,
      revision: request.revision,
      mime: file.mime,
      bytes: file.bytes,
      venceEn: deadline?.venceEn ?? null,
      disponible: available,
      limpiezaPendiente:
        file.estado === 'RETIRADO' && file.bytesRetiradosEn === null,
      contenido: available
        ? `/cuenta/archivos/evidencias/${file.solicitudId}/${file.id}`
        : null,
    };
  }

  async list(actor: Actor, requestId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.access(tx, actor, requestId);
      const files = await tx.archivoPrivado.findMany({
        where: {
          solicitudId: requestId,
          proposito: 'EVIDENCIA_INSTITUCIONAL',
          estado: 'ACTIVO',
        },
        orderBy: [{ creadoEn: 'asc' }, { id: 'asc' }],
        take: 3,
      });
      const receipts = await Promise.all(
        files.map((file) => this.receipt(tx, file, request)),
      );
      return {
        revision: request.revision,
        puedeAdjuntar:
          actor.sub === request.solicitanteId &&
          pending.includes(request.estado),
        adjuntos: receipts.filter((row) => row.disponible),
      };
    });
  }

  async operation(actor: Actor, requestId: string, operationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.access(tx, actor, requestId);
      const file = await tx.archivoPrivado.findUnique({
        where: {
          propietarioId_operacionId: {
            propietarioId: actor.sub,
            operacionId: operationId,
          },
        },
      });
      if (
        !file ||
        file.solicitudId !== requestId ||
        file.proposito !== 'EVIDENCIA_INSTITUCIONAL'
      )
        throw new NotFoundException('Operación no encontrada.');
      return this.receipt(tx, file, request);
    });
  }

  async upload(
    actor: Actor,
    requestId: string,
    dto: UploadProfilePhotoDto,
    input: Buffer,
  ) {
    await this.prisma.$transaction((tx) =>
      this.access(tx, actor, requestId, true),
    );
    const image = await prepareInstitutionEvidence(input);
    const reserved = await this.prisma.$transaction(async (tx) => {
      const request = await this.access(tx, actor, requestId, true);
      const existing = await tx.archivoPrivado.findUnique({
        where: {
          propietarioId_operacionId: {
            propietarioId: actor.sub,
            operacionId: dto.operacionId,
          },
        },
      });
      if (existing) {
        if (
          existing.proposito !== 'EVIDENCIA_INSTITUCIONAL' ||
          existing.solicitudId !== requestId ||
          existing.sha256 !== image.sha256 ||
          existing.revisionEsperada !== dto.revision
        )
          throw stale();
        return existing;
      }
      if (
        !pending.includes(request.estado) ||
        request.revision !== dto.revision
      )
        throw stale();
      const [quota] = await tx.$queryRaw<
        { recent: bigint; outstanding: bigint }[]
      >`
        SELECT count(*) FILTER (WHERE "creadoEn">=clock_timestamp()-INTERVAL '1 hour') AS recent,
          count(*) FILTER (WHERE "bytesRetiradosEn" IS NULL) AS outstanding
        FROM "ArchivoPrivado" WHERE "propietarioId"=${actor.sub}::uuid`;
      const attachments = await tx.archivoPrivado.count({
        where: {
          solicitudId: requestId,
          proposito: 'EVIDENCIA_INSTITUCIONAL',
          estado: { not: 'RETIRADO' },
        },
      });
      if (quota.recent >= 10n || quota.outstanding >= 10n || attachments >= 3)
        throw new HttpException(
          'Hasta tres adjuntos por solicitud. Retira uno o espera antes de subir más.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return tx.archivoPrivado.create({
        data: {
          id: randomUUID(),
          propietarioId: actor.sub,
          operacionId: dto.operacionId,
          proposito: 'EVIDENCIA_INSTITUCIONAL',
          solicitudId: requestId,
          revisionEsperada: dto.revision,
          mime: image.mime,
          bytes: image.bytes,
          sha256: image.sha256,
        },
      });
    });
    if (reserved.estado !== 'PREPARADO')
      return this.operation(actor, requestId, dto.operacionId);
    return this.prisma.$transaction(
      async (tx) => {
        const request = await this.access(tx, actor, requestId, true);
        const file = await tx.archivoPrivado.findUniqueOrThrow({
          where: { id: reserved.id },
        });
        if (file.estado !== 'PREPARADO') return this.receipt(tx, file, request);
        if (
          !pending.includes(request.estado) ||
          request.revision !== dto.revision
        )
          throw stale();
        // Hold owner + request locks across bounded immutable IO: a delayed retry
        // cannot recreate bytes after a committed withdrawal or privacy purge.
        await this.store.put(file.id, image.content);
        const active = await tx.archivoPrivado.update({
          where: { id: file.id },
          data: { estado: 'ACTIVO' },
        });
        const changed = await tx.solicitudAltaInstitucion.update({
          where: { id: requestId },
          data: { revision: { increment: 1 } },
        });
        return this.receipt(tx, active, changed);
      },
      { timeout: 60000 },
    );
  }

  private async active(actor: Actor, requestId: string, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const request = await this.access(tx, actor, requestId);
      const file = await tx.archivoPrivado.findUnique({ where: { id } });
      if (
        !file ||
        file.proposito !== 'EVIDENCIA_INSTITUCIONAL' ||
        file.solicitudId !== requestId ||
        file.propietarioId !== request.solicitanteId ||
        !(await this.receipt(tx, file, request)).disponible
      )
        throw new NotFoundException('Adjunto no disponible.');
      return file;
    });
  }

  async content(actor: Actor, requestId: string, id: string) {
    const file = await this.active(actor, requestId, id);
    const content = await this.store.read(id);
    await this.active(actor, requestId, id); // Includes DB deadline and session after IO.
    if (content.length !== file.bytes || sha256(content) !== file.sha256)
      throw new ServiceUnavailableException('El adjunto no está disponible.');
    return { content, mime: file.mime };
  }

  async remove(actor: Actor, requestId: string, id: string, revision: number) {
    await this.prisma.$transaction(async (tx) => {
      const request = await this.access(tx, actor, requestId, true);
      const file = await tx.archivoPrivado.findUnique({ where: { id } });
      if (
        !file ||
        file.solicitudId !== requestId ||
        file.propietarioId !== actor.sub ||
        file.proposito !== 'EVIDENCIA_INSTITUCIONAL'
      )
        throw new NotFoundException('Adjunto no encontrado.');
      if (file.estado === 'RETIRADO') return;
      // An uncommitted reservation can be cancelled after review. An active
      // reviewed attachment cannot be withdrawn before its retention deadline.
      if (
        file.estado === 'ACTIVO' &&
        (!pending.includes(request.estado) || (await this.deadline(tx, file)))
      )
        throw new ConflictException(
          'El adjunto ya forma parte de una revisión resuelta.',
        );
      if (file.estado === 'ACTIVO' && request.revision !== revision)
        throw stale();
      await tx.archivoPrivado.update({
        where: { id },
        data: { estado: 'RETIRADO', retiradoEn: new Date() },
      });
      if (file.estado === 'ACTIVO')
        await tx.solicitudAltaInstitucion.update({
          where: { id: requestId },
          data: { revision: { increment: 1 } },
        });
    });
    await this.cleanupRetired(id);
    const file = await this.prisma.archivoPrivado.findUniqueOrThrow({
      where: { id },
    });
    return this.operation(actor, requestId, file.operacionId);
  }

  private async cleanupRetired(id: string) {
    const row = await this.prisma.archivoPrivado.findUnique({ where: { id } });
    if (!row || row.estado !== 'RETIRADO' || row.bytesRetiradosEn) return;
    try {
      await this.store.remove(id);
      await this.prisma.archivoPrivado.updateMany({
        where: { id, estado: 'RETIRADO', bytesRetiradosEn: null },
        data: { bytesRetiradosEn: new Date() },
      });
    } catch {
      /* Durable pending receipt; no claim of physical erasure. */
    }
  }
}
