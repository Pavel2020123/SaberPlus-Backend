import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { lessonUrl } from '../admin/direct-publication';
import { EditorialFileRuntime } from './editorial-file-runtime';
import {
  editorialImagePath,
  managedEditorialImageId,
} from './editorial-image-reference';

export async function editorialImageData(
  db: Prisma.TransactionClient,
  value: string,
) {
  const id = managedEditorialImageId(value);
  if (!id) return { imagenUrl: lessonUrl(value), archivoImagenId: null };
  new EditorialFileRuntime().assertEnabled();
  // La retirada usa el mismo bloqueo. Ninguna asociación puede confirmar después
  // de retirar el recurso, ni una retirada ignorar una asociación ya confirmada.
  await db.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${id}::uuid FOR UPDATE`;
  const row = await db.archivoEditorial.findUnique({ where: { id } });
  if (row?.estado !== 'DISPONIBLE')
    throw new ConflictException(
      'La imagen no está disponible. Consulta su carga o selecciona otra antes de guardar.',
    );
  return { imagenUrl: editorialImagePath(id), archivoImagenId: id };
}
