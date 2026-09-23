import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { validateCatalogName } from './academic-classification';
import { validateClozeActivity } from './cloze-activity';

export function requireDirectPublication() {
  if (process.env.EDITORIAL_PUBLICATION_ENABLED !== 'true')
    throw new ServiceUnavailableException(
      'El servidor aún no tiene habilitado Guardar y publicar. No se guardó ningún cambio.',
    );
}

export function lessonUrl(value: string): string | null {
  if (typeof value !== 'string' || value.length > 2000)
    throw new BadRequestException(
      'La referencia debe ser texto de hasta 2000 caracteres.',
    );
  const result = value.trim();
  if (!result) return null;
  try {
    const url = new URL(result);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      /[\s\p{Cc}\p{Cf}]/u.test(result)
    )
      throw new Error();
    return url.href;
  } catch {
    throw new BadRequestException(
      'Usa una URL HTTPS completa y sin credenciales.',
    );
  }
}

/** Caller holds the editorial area lock and parent row locks in the same transaction. */
export async function publishParents(
  tx: Prisma.TransactionClient,
  temaId: string,
  subtemaId?: string,
) {
  const tema = await tx.tema.findUniqueOrThrow({ where: { id: temaId } });
  validateCatalogName(tema.nombre);
  if (tema.estadoContenido === 'ARCHIVADO')
    throw new BadRequestException(
      'El tema está retirado. Selecciona otro tema.',
    );
  if (subtemaId) {
    const sub = await tx.subtema.findUniqueOrThrow({
      where: { id: subtemaId },
    });
    validateCatalogName(sub.nombre);
    if (sub.temaId !== temaId || sub.estadoContenido === 'ARCHIVADO')
      throw new BadRequestException(
        'El subtema no está disponible en este tema.',
      );
    lessonUrl(sub.videoUrl ?? '');
    lessonUrl(sub.imagenUrl ?? '');
    if (
      (sub.contenido?.length ?? 0) > 30000 ||
      sub.contenido?.includes('\u0000')
    )
      throw new BadRequestException(
        'Corrige el texto de la lección antes de publicar.',
      );
    if (sub.tipoInteractivo === 'CLOZE')
      validateClozeActivity(sub.datosInteractivo);
    else if (sub.tipoInteractivo || sub.datosInteractivo != null)
      throw new BadRequestException(
        'El subtema contiene una actividad incompatible.',
      );
    await tx.subtema.update({
      where: { id: sub.id },
      data: {
        estadoContenido: 'PUBLICADO',
        fechaPublicacion: sub.fechaPublicacion ?? new Date(),
      },
    });
  }
  await tx.tema.update({
    where: { id: temaId },
    data: {
      estadoContenido: 'PUBLICADO',
      fechaPublicacion: tema.fechaPublicacion ?? new Date(),
    },
  });
}
