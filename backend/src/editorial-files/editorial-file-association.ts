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
  const [image] = await editorialImagesData(db, [value]);
  return image;
}

// Resolver juntos enunciado y opciones evita bloquear archivos compartidos en
// órdenes opuestos. Validar todos los valores antes de adquirir el primer lock.
// El llamador conserva la transacción hasta guardar todas las asociaciones.
export async function editorialImagesData(
  db: Prisma.TransactionClient,
  values: readonly string[],
) {
  const images = values.map((value) => {
    const id = managedEditorialImageId(value);
    return {
      imagenUrl: id ? editorialImagePath(id) : lessonUrl(value),
      archivoImagenId: id,
    };
  });
  const ids = [
    ...new Set(
      images.flatMap((image) =>
        image.archivoImagenId ? [image.archivoImagenId] : [],
      ),
    ),
  ].sort();
  if (!ids.length) return images;
  new EditorialFileRuntime().assertEnabled();
  // La retirada usa el mismo bloqueo. Ninguna asociación puede confirmar después
  // de retirar el recurso, ni una retirada ignorar una asociación ya confirmada.
  for (const id of ids) {
    await db.$queryRaw`SELECT id FROM "ArchivoEditorial" WHERE id = ${id}::uuid FOR UPDATE`;
    const row = await db.archivoEditorial.findUnique({ where: { id } });
    if (row?.estado !== 'DISPONIBLE')
      throw new ConflictException(
        'La imagen no está disponible. Consulta su carga o selecciona otra antes de guardar.',
      );
  }
  return images;
}
