import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

async function bloquearUsuario(
  tx: Prisma.TransactionClient,
  usuarioId: string,
) {
  await tx.$queryRaw`SELECT "id" FROM "Usuario" WHERE "id" = ${usuarioId}::uuid FOR UPDATE`;
  const [reloj] = await tx.$queryRaw<
    { ahora: Date }[]
  >`SELECT clock_timestamp() AS ahora`;
  return reloj.ahora;
}

// Called inside the acceptance transaction, after the institution lock.
export async function conservarSaldoPersonal(
  tx: Prisma.TransactionClient,
  usuarioId: string,
  asignacionId: string,
) {
  const ahora = await bloquearUsuario(tx, usuarioId);
  const usuario = await tx.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
  });
  if (!usuario.fechaVencimientoPlan || usuario.fechaVencimientoPlan <= ahora)
    return;
  if (
    await tx.origenGestionadoInstitucional.findUnique({ where: { usuarioId } })
  )
    return;
  if (
    await tx.saldoPersonalInstitucional.findFirst({
      where: { usuarioId, reanudadoEn: null },
    })
  )
    return;
  const asignacion = await tx.asignacionLicenciaInstitucional.findUniqueOrThrow(
    { where: { id: asignacionId } },
  );
  if (
    asignacion.usuarioId !== usuarioId ||
    asignacion.estado !== 'ACTIVA' ||
    asignacion.institucionId !== usuario.institucionId
  ) {
    throw new Error(
      'Saldo personal requiere una vinculación aceptada vigente.',
    );
  }
  await tx.saldoPersonalInstitucional.create({
    data: {
      id: randomUUID(),
      usuarioId,
      asignacionId,
      milisegundos: BigInt(
        usuario.fechaVencimientoPlan.getTime() - ahora.getTime(),
      ),
      venceOriginal: usuario.fechaVencimientoPlan,
      guardadoEn: ahora,
    },
  });
  await tx.usuario.update({
    where: { id: usuarioId },
    data: { fechaVencimientoPlan: null },
  });
}

export async function reanudarSaldoPersonal(
  tx: Prisma.TransactionClient,
  usuarioId: string,
): Promise<void> {
  const ahora = await bloquearUsuario(tx, usuarioId);
  const usuario = await tx.usuario.findUniqueOrThrow({
    where: { id: usuarioId },
  });
  if (usuario.institucionId) return;
  if (
    await tx.origenGestionadoInstitucional.findUnique({
      where: { usuarioId },
    })
  )
    return;
  if (await tx.miembroInstitucion.findUnique({ where: { usuarioId } })) return;
  if (
    await tx.asignacionLicenciaInstitucional.findFirst({
      where: { usuarioId, estado: 'ACTIVA' },
    })
  )
    return;
  const saldo = await tx.saldoPersonalInstitucional.findFirst({
    where: { usuarioId, reanudadoEn: null },
  });
  if (!saldo) return;
  const base = Math.max(
    ahora.getTime(),
    usuario.fechaVencimientoPlan?.getTime() ?? 0,
  );
  const vencimiento = new Date(base + Number(saldo.milisegundos));
  if (!Number.isFinite(vencimiento.getTime()))
    throw new Error('Saldo personal fuera de rango.');
  await tx.usuario.update({
    where: { id: usuarioId },
    data: { fechaVencimientoPlan: vencimiento },
  });
  await tx.saldoPersonalInstitucional.update({
    where: { id: saldo.id },
    data: { reanudadoEn: ahora, venceReanudadoEn: vencimiento },
  });
}

@Injectable()
export class SaldoPersonalInstitucionalService {
  constructor(private readonly prisma: PrismaService) {}

  async reanudarSiPersonal(usuarioId: string): Promise<void> {
    const pendiente = await this.prisma.saldoPersonalInstitucional.findFirst({
      where: { usuarioId, reanudadoEn: null },
    });
    if (!pendiente) return;
    await this.prisma.$transaction((tx) =>
      reanudarSaldoPersonal(tx, usuarioId),
    );
  }
}
