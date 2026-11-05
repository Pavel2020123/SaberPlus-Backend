import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ArchivoPrivado, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../auth/auth.types';
import { EditorialFileStore } from '../editorial-files/editorial-file.store';
import { sha256 } from '../editorial-files/editorial-image';
import { PRIVATE_FILE_STORE } from './private-file.store';
import { PrivateFileRuntime } from './private-file-runtime';
import { prepareProfilePhoto } from './private-file-content';
import { UploadProfilePhotoDto } from './profile-photo.dto';

type Tx = Prisma.TransactionClient;
type Actor = Pick<JwtPayload, 'sub' | 'versionSesion'>;
const stale = () =>
  new ConflictException('La foto cambió. Actualiza antes de reenviar.');
const receipt = (file: ArchivoPrivado) => ({
  id: file.id,
  operacionId: file.operacionId,
  estado: file.estado,
  limpiezaPendiente:
    file.estado === 'RETIRADO' && file.bytesRetiradosEn === null,
});

@Injectable()
export class ProfilePhotoService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(PRIVATE_FILE_STORE) private readonly store: EditorialFileStore,
    private readonly runtime: PrivateFileRuntime,
  ) {}

  private async actor(tx: Tx, actor: Actor) {
    this.runtime.assertEnabled();
    await tx.$queryRaw`SELECT id FROM "Usuario" WHERE id=${actor.sub}::uuid FOR UPDATE`;
    const user = await tx.usuario.findUnique({
      where: { id: actor.sub },
      select: {
        rol: true,
        suprimidaEn: true,
        versionSesion: true,
        debeCambiarContrasena: true,
      },
    });
    if (
      !user ||
      !['ESTUDIANTE', 'PROFESOR'].includes(user.rol ?? '') ||
      user.suprimidaEn ||
      user.debeCambiarContrasena ||
      actor.versionSesion !== user.versionSesion
    )
      throw new ForbiddenException(
        'La cuenta no tiene acceso a esta foto privada.',
      );
  }

  private async summary(tx: Tx, owner: string) {
    const profile = await tx.fotoPrivadaPerfil.findUnique({
      where: { usuarioId: owner },
    });
    return {
      revision: profile?.revision ?? 0,
      archivoId: profile?.archivoId ?? null,
      contenido: profile?.archivoId
        ? `/cuenta/archivos/foto/${profile.archivoId}`
        : null,
    };
  }

  async own(actor: Actor) {
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      return this.summary(tx, actor.sub);
    });
  }

  async operation(actor: Actor, operationId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      const row = await tx.archivoPrivado.findUnique({
        where: {
          propietarioId_operacionId: {
            propietarioId: actor.sub,
            operacionId: operationId,
          },
        },
      });
      if (!row || row.proposito !== 'FOTO_PERFIL')
        throw new NotFoundException('Operación no encontrada.');
      return { ...receipt(row), foto: await this.summary(tx, actor.sub) };
    });
  }

  async upload(actor: Actor, dto: UploadProfilePhotoDto, input: Buffer) {
    this.runtime.assertEnabled();
    // Controller guard has authenticated; re-check session before decoding pixels too.
    await this.prisma.$transaction((tx) => this.actor(tx, actor));
    const image = await prepareProfilePhoto(input);
    const reserved = await this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
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
          existing.proposito !== 'FOTO_PERFIL' ||
          existing.sha256 !== image.sha256 ||
          existing.revisionEsperada !== dto.revision
        )
          throw stale();
        return existing;
      }
      let profile = await tx.fotoPrivadaPerfil.findUnique({
        where: { usuarioId: actor.sub },
      });
      if (!profile)
        profile = await tx.fotoPrivadaPerfil.create({
          data: { usuarioId: actor.sub },
        });
      if (profile.revision !== dto.revision) throw stale();
      const recent = await tx.archivoPrivado.count({
        where: {
          propietarioId: actor.sub,
          creadoEn: { gte: new Date(Date.now() - 3600000) },
        },
      });
      const outstanding = await tx.archivoPrivado.count({
        where: {
          propietarioId: actor.sub,
          bytesRetiradosEn: null,
        },
      });
      if (recent >= 10 || outstanding >= 10)
        throw new HttpException(
          'Espera antes de subir más archivos.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      return tx.archivoPrivado.create({
        data: {
          id: randomUUID(),
          propietarioId: actor.sub,
          operacionId: dto.operacionId,
          proposito: 'FOTO_PERFIL',
          revisionEsperada: dto.revision,
          mime: image.mime,
          bytes: image.bytes,
          sha256: image.sha256,
        },
      });
    });
    if (reserved.estado !== 'PREPARADO')
      return this.operation(actor, dto.operacionId);
    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.actor(tx, actor);
        const file = await tx.archivoPrivado.findUniqueOrThrow({
          where: { id: reserved.id },
        });
        if (file.estado !== 'PREPARADO')
          return {
            oldId: null,
            result: {
              ...receipt(file),
              foto: await this.summary(tx, actor.sub),
            },
          };
        const profile = await tx.fotoPrivadaPerfil.findUniqueOrThrow({
          where: { usuarioId: actor.sub },
        });
        if (profile.revision !== dto.revision) throw stale();
        // Serialize provider IO with retirement/purge. A delayed retry must not
        // recreate bytes after another request has already retired/deleted them.
        await this.store.put(reserved.id, image.content);
        if (profile.archivoId)
          await tx.archivoPrivado.update({
            where: { id: profile.archivoId },
            data: { estado: 'RETIRADO', retiradoEn: new Date() },
          });
        const active = await tx.archivoPrivado.update({
          where: { id: file.id },
          data: { estado: 'ACTIVO' },
        });
        await tx.fotoPrivadaPerfil.update({
          where: { usuarioId: actor.sub },
          data: {
            archivoId: file.id,
            revision: { increment: 1 },
          },
        });
        // Never copy a private URL into public legacy profile/ranking payloads.
        await tx.usuario.update({
          where: { id: actor.sub },
          data: { fotoPerfil: null },
        });
        return {
          oldId: profile.archivoId,
          result: {
            ...receipt(active),
            foto: await this.summary(tx, actor.sub),
          },
        };
      },
      { timeout: 60000 },
    );
    if (result.oldId) await this.cleanupRetired(result.oldId);
    return result.result;
  }

  async remove(actor: Actor, revision: number) {
    const removed = await this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      const profile = await tx.fotoPrivadaPerfil.findUnique({
        where: { usuarioId: actor.sub },
      });
      if (!profile?.archivoId)
        return { oldId: null, foto: await this.summary(tx, actor.sub) };
      if (profile.revision !== revision) throw stale();
      await tx.archivoPrivado.update({
        where: { id: profile.archivoId },
        data: { estado: 'RETIRADO', retiradoEn: new Date() },
      });
      await tx.fotoPrivadaPerfil.update({
        where: { usuarioId: actor.sub },
        data: { archivoId: null, revision: { increment: 1 } },
      });
      return {
        oldId: profile.archivoId,
        foto: await this.summary(tx, actor.sub),
      };
    });
    const cleaned = removed.oldId
      ? await this.cleanupRetired(removed.oldId)
      : true;
    return { foto: removed.foto, limpiezaPendiente: !cleaned };
  }

  async retryRemoval(actor: Actor, operationId: string) {
    const row = await this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      const file = await tx.archivoPrivado.findUnique({
        where: {
          propietarioId_operacionId: {
            propietarioId: actor.sub,
            operacionId: operationId,
          },
        },
      });
      if (!file || file.proposito !== 'FOTO_PERFIL')
        throw new NotFoundException('Operación no encontrada.');
      if (file.estado !== 'RETIRADO')
        throw new ConflictException('La foto no está retirada.');
      return file;
    });
    await this.cleanupRetired(row.id);
    return this.operation(actor, operationId);
  }

  async cancel(actor: Actor, operationId: string) {
    const file = await this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      const row = await tx.archivoPrivado.findUnique({
        where: {
          propietarioId_operacionId: {
            propietarioId: actor.sub,
            operacionId: operationId,
          },
        },
      });
      if (!row || row.proposito !== 'FOTO_PERFIL')
        throw new NotFoundException('Operación no encontrada.');
      if (row.estado === 'ACTIVO')
        throw new ConflictException(
          'La foto ya se guardó. Consulta su estado antes de retirarla.',
        );
      if (row.estado === 'RETIRADO') return row;
      return tx.archivoPrivado.update({
        where: { id: row.id },
        data: { estado: 'RETIRADO', retiradoEn: new Date() },
      });
    });
    await this.cleanupRetired(file.id);
    return this.operation(actor, operationId);
  }

  private async activeFile(actor: Actor, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.actor(tx, actor);
      const profile = await tx.fotoPrivadaPerfil.findUnique({
        where: { usuarioId: actor.sub },
        include: { archivo: true },
      });
      const file = profile?.archivo;
      if (
        !file ||
        file.id !== id ||
        file.propietarioId !== actor.sub ||
        file.proposito !== 'FOTO_PERFIL' ||
        file.estado !== 'ACTIVO'
      )
        throw new NotFoundException('Foto no encontrada.');
      return file;
    });
  }

  async content(actor: Actor, id: string) {
    const file = await this.activeFile(actor, id);
    const bytes = await this.store.read(id);
    await this.activeFile(actor, id); // A revoked/switched identity cannot survive IO.
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256)
      throw new ServiceUnavailableException('La foto no está disponible.');
    return bytes;
  }

  private async cleanupRetired(id: string) {
    const row = await this.prisma.archivoPrivado.findUnique({ where: { id } });
    if (!row || row.estado !== 'RETIRADO') return false;
    if (row.bytesRetiradosEn) return true;
    try {
      await this.store.remove(id);
      await this.prisma.archivoPrivado.updateMany({
        where: { id, estado: 'RETIRADO', bytesRetiradosEn: null },
        data: { bytesRetiradosEn: new Date() },
      });
      return true;
    } catch {
      // Logical retirement already committed; do not claim physical erasure succeeded.
      return false;
    }
  }
}
