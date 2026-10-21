import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as sharpModule from 'sharp';

const sharp = sharpModule as unknown as typeof import('sharp').default;
export const EDITORIAL_INPUT_LIMIT = 5 * 1024 * 1024;
export const EDITORIAL_OUTPUT_LIMIT = 2 * 1024 * 1024;
export const sha256 = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');

export async function normalizeEditorialImage(input: Buffer) {
  if (!input?.length || input.length > EDITORIAL_INPUT_LIMIT)
    throw new BadRequestException('Selecciona una imagen de hasta 5 MiB.');
  const png = input
    .subarray(0, 8)
    .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = input[0] === 255 && input[1] === 216 && input[2] === 255;
  const webp =
    input.toString('ascii', 0, 4) === 'RIFF' &&
    input.toString('ascii', 8, 12) === 'WEBP';
  try {
    if (!png && !jpeg && !webp) throw new Error('Firma no admitida');
    const image = sharp(input, {
      limitInputPixels: 20000000,
      failOn: 'warning',
    });
    const metadata = await image.metadata();
    if (
      !['png', 'jpeg', 'webp'].includes(metadata.format ?? '') ||
      (metadata.pages ?? 1) !== 1
    )
      throw new Error('Formato no admitido');
    // Un gráfico académico conserva su proporción y no se recorta como un logo.
    const result = await image
      .rotate()
      .resize(2560, 2560, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    if (result.data.length > EDITORIAL_OUTPUT_LIMIT)
      throw new Error('Resultado excesivo');
    return {
      content: result.data,
      sha256: sha256(result.data),
      bytes: result.data.length,
      ancho: result.info.width,
      alto: result.info.height,
    };
  } catch {
    throw new BadRequestException(
      'Usa PNG, JPG o WEBP estático de hasta 20 megapíxeles. La imagen preparada debe ocupar hasta 2 MiB.',
    );
  }
}
